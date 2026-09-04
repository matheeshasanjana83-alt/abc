// Playwright-based downloader for the playground.ru "Скачать без авторизации"
// 60s-countdown flow. Runs on a GitHub Actions runner (which has full internet).
//
// The direct file endpoint is:
//   https://www.playground.ru/api/file.download?file_id=...&post_id=...&file_name=...
// It returns JSON. On first call it arms a 60s wait (returns lock_hash / seconds);
// after the countdown you call it again with &lock_hash=...&log=0 to get the
// real (CDN) download URL.
//
// We drive the API from within the page (so we share the site session/cookies),
// inspect the JSON, wait for the countdown, then download the returned URL and
// verify its sha256.

import { chromium } from "playwright";
import crypto from "crypto";
import fs from "fs";
import https from "https";
import http from "http";
import { URL } from "url";

const PAGE =
  "https://www.playground.ru/minecraft/file/minecraft_seks_mod_pleasure_horizons_fabric_1_21_1-sandymandy_notnightsky-1850336";
const FILE_ID = "433596";
const POST_ID = "1850336";
const FILE_NAME = "Pleasure_Horizons-0.8.2-1.21.1.jar";
const EXPECTED_SHA =
  "f4e5c4908ea0bac45a5042cc5dbd61980efe98b34346e7034efdd0ffacaa6220";
const OUT = process.env.OUT || "/tmp/Pleasure_Horizons-0.8.2-1.21.1.jar";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function download(url, dest, cookies) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const cookieHeader = Array.isArray(cookies)
      ? cookies.map((c) => `${c.name}=${c.value}`).join("; ")
      : cookies || "";
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: PAGE,
          Cookie: cookieHeader,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).toString(), dest, cookies));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode + " for " + url));
        }
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on("finish", () => f.close(() => resolve(dest)));
        f.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(180000, () => req.destroy(new Error("timeout")));
  });
}

async function callApi(page, params) {
  const qs = new URLSearchParams({
    file_id: FILE_ID,
    post_id: POST_ID,
    file_name: FILE_NAME,
    ...params,
  });
  const url = `https://www.playground.ru/api/file.download?${qs.toString()}`;
  const out = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } });
    const t = await r.text();
    return { status: r.status, finalUrl: r.url, body: t.slice(0, 4000), contentType: r.headers.get("content-type") };
  }, url);
  console.log("API call:", url);
  console.log("  -> status", out.status, "| content-type", out.contentType);
  console.log("  -> body:", out.body.slice(0, 800));
  return out;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    locale: "ru-RU",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  console.log("Opening page:", PAGE);
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await sleep(2000);

  // 1) First API call to arm the download.
  const first = await callApi(page, {});
  // Also try the exact same shape the page used the second time (log=0) in case
  // that directly returns the link. We'll just parse whatever we get.
  let downloadUrl = null;

  function grabUrlFromBody(body) {
    // JSON may contain a direct url / link / download field, or a dwh link.
    const urlRe = /https?:\/\/[^\s"'<>\\]+\.jar[^\s"'<>\\]*/gi;
    const urls = [];
    let m;
    while ((m = urlRe.exec(body))) urls.push(m[0]);
    // Also pull any "url":"..." or "link":"..." or "download":"..." fields.
    const fieldRe = /"(?:url|link|download|href)"\s*:\s*"(https?:\/\/[^"]+)"/gi;
    let f;
    while ((f = fieldRe.exec(body))) urls.push(f[1]);
    return urls;
  }

  const firstUrls = grabUrlFromBody(first.body).concat(grabUrlFromBody(first.finalUrl));
  console.log("URLs found in first call:", JSON.stringify(firstUrls));
  if (firstUrls.length) {
    downloadUrl = firstUrls[0];
  }

  // If no direct link yet, wait for the countdown and retry with lock_hash if one
  // was returned.
  if (!downloadUrl) {
    // Extract lock_hash from first response body if present.
    let lockHash = null;
    const lh = /(?:lock_hash[":=]+)["']?([A-Za-z0-9]+)["']?/i.exec(first.body);
    if (lh) lockHash = lh[1];
    const secondsReg = /(?:seconds|wait|delay|time)[":=]+\s*(\d+)/i.exec(first.body);
    const waitMs = secondsReg ? Number(secondsReg[1]) * 1000 : 60000;
    console.log("No direct URL in first call. lock_hash=" + lockHash + ", waiting ~" + waitMs + "ms");
    await sleep(Math.min(waitMs, 90000));

    // Retry: with lock_hash & log=0, and also without (maybe server counts down).
    const attempts = [];
    if (lockHash) attempts.push({ lock_hash: lockHash, log: "0" });
    attempts.push({ log: "0" });
    attempts.push({});
    for (const p of attempts) {
      const r = await callApi(page, p);
      const urls = grabUrlFromBody(r.body).concat(grabUrlFromBody(r.finalUrl));
      console.log("  retry", JSON.stringify(p), "-> urls:", JSON.stringify(urls));
      if (urls.length) {
        downloadUrl = urls[0];
        break;
      }
    }
  }

  await page.close();
  await browser.close();

  console.log("Final download URL:", downloadUrl);
  if (!downloadUrl) {
    console.log("NO_DIRECT_URL");
    process.exit(4);
  }

  console.log("Downloading from", downloadUrl);
  await download(downloadUrl, OUT, []);
  const buf = fs.readFileSync(OUT);
  const h = sha256(buf);
  console.log("Size (bytes):", buf.length, "~", (buf.length / 1024 / 1024).toFixed(2), "MB");
  console.log("sha256:", h);
  if (h.toLowerCase() !== EXPECTED_SHA.toLowerCase()) {
    console.log("SHA256 MISMATCH, expected", EXPECTED_SHA);
    process.exit(5);
  }
  console.log("SHA256 MATCH, file verified OK.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
