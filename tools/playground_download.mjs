// Playwright-based downloader for the playground.ru "Скачать без авторизации"
// 60s-countdown flow. Runs on a GitHub Actions runner (which has full internet).
//
// The direct file endpoint is:
//   https://www.playground.ru/api/file.download?file_id=...&post_id=...&file_name=...
// Its JSON reply after the FIRST call is:
//   {"download_link":null,"magnet_link":null,"torrent_data":null,
//    "lock_hash":"<hash>","download_hash":null,"wait_time":60}
// After waiting `wait_time` seconds, you re-call with &lock_hash=<hash>&log=0
// and the response then contains a real `download_link` (the CDN URL).
//
// We drive the API from inside the page (sharing the session cookies), parse the
// JSON, wait for the countdown, get the download_link, download it, and verify
// the sha256.

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

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: PAGE,
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).toString(), dest));
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
    return { status: r.status, body: t };
  }, url);
  console.log("API call:", url);
  console.log("  -> status", out.status, "body:", out.body.slice(0, 300));
  let json = null;
  try {
    json = JSON.parse(out.body);
  } catch (e) {
    console.log("  -> not JSON:", out.body.slice(0, 300));
  }
  return { status: out.status, json, raw: out.body };
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

  // 1) Arm the download.
  const first = await callApi(page, {});
  let downloadUrl = null;
  let lockHash = first.json && first.json.lock_hash;

  // Possibly a direct link was already returned.
  if (first.json && first.json.download_link) {
    downloadUrl = first.json.download_link;
  }

  if (!downloadUrl) {
    const waitMs = (first.json && first.json.wait_time ? first.json.wait_time : 60) * 1000;
    console.log("Waiting for countdown ~" + waitMs + "ms (lock_hash=" + lockHash + ")");
    await sleep(Math.min(waitMs, 90000));

    // 2) Re-call with lock_hash & log=0 to get the download_link.
    const retries = [
      { lock_hash: lockHash, log: "0" },
      { lock_hash: lockHash },
      { log: "0" },
      {},
    ];
    for (const p of retries) {
      const r = await callApi(page, p);
      if (r.json && r.json.download_link) {
        downloadUrl = r.json.download_link;
        console.log("  Got download_link at params", JSON.stringify(p));
        break;
      }
      console.log("  -> params", JSON.stringify(p), "no download_link yet:", JSON.stringify(r.json));
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
  await download(downloadUrl, OUT);
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
