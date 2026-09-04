// Playwright-based downloader for the playground.ru "Скачать без авторизации"
// 60s-countdown flow. Runs on a GitHub Actions runner (which has full internet).
//
// It:
//   1. opens the file page,
//   2. clicks the FIRST "Скачать без авторизации" button (the 0.8.2 entry),
//   3. waits for the countdown to finish,
//   4. detects + downloads the resulting direct link,
//   5. verifies the sha256, writes the jar to OUT.
//
// It prints lots of diagnostics so that, on failure, the Action logs tell us
// exactly what to adjust next iteration.

import { chromium } from "playwright";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { URL } from "url";

const PAGE =
  "https://www.playground.ru/minecraft/file/minecraft_seks_mod_pleasure_horizons_fabric_1_21_1-sandymandy_notnightsky-1850336";
const EXPECTED_SHA =
  "f4e5c4908ea0bac45a5042cc5dbd61980efe98b34346e7034efdd0ffacaa6220";
const EXPECTED_SIZE = 25.44 * 1024 * 1024; // approx
const OUT = process.env.OUT || "/tmp/Pleasure_Horizons-0.8.2-1.21.1.jar";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function fileDownload(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", Referer: PAGE } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fileDownload(new URL(res.headers.location, url).toString(), dest));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode));
        }
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on("finish", () => f.close(() => resolve(dest)));
        f.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("timeout")));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    locale: "ru-RU",
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, "languages", { get: () => ["ru-RU", "ru", "en"] });
  });
  const page = await context.newPage();

  page.on("download", async (d) => {
    console.log("[download event] ", d.suggestedFilename(), d.url());
    try {
      await d.saveAs(OUT);
      console.log("[download event] saved to", OUT);
    } catch (e) {
      console.log("[download event] save failed", e.message);
    }
  });
  page.on("response", (r) => {
    if (/\.jar($|\?)/.test(r.url()) || /dl\.|download|playground\.ru\/file\/dl/.test(r.url())) {
      console.log("[response] ", r.status(), r.url());
    }
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  console.log("Opening page:", PAGE);
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await sleep(2000);

  console.log("Title:", await page.title());

  // Collect all link/button texts for diagnostics.
  const allLinks = await page.$$eval("a", (as) =>
    as.map((a) => ({ text: (a.textContent || "").trim().slice(0, 40), href: a.href })).filter((x) => x.text)
  );
  console.log("---- ALL LINKS (text -> href) ----");
  for (const l of allLinks) {
    const label = l.text.replace(/\s+/g, " ");
    if (/скачать|download|авторизац|файл/i.test(label) || /\.jar|download|dl\./i.test(l.href)) {
      console.log(`  ${JSON.stringify(label)}  ->  ${l.href}`);
    }
  }
  console.log("---- LINKS END ----");

  // Find the FIRST "Скачать без авторизации" button/link.
  const noAuthSelector = `text=/Скачать без авторизации/i`;
  let clicked = false;
  try {
    const el = page.locator(noAuthSelector).first();
    await el.waitFor({ state: "visible", timeout: 30000 });
    console.log("Found 'Скачать без авторизации', clicking...");
    // If it is an <a>, extract href first.
    const href = await el.getAttribute("href").catch(() => null);
    console.log("  href of the button:", href);
    await el.click();
    clicked = true;
  } catch (e) {
    console.log("Could not click 'Скачать без авторизации':", e.message);
  }
  if (!clicked) {
    // fallback: try generic download
    await page.close();
    await browser.close();
    console.log("NO_BUTTON");
    process.exit(3);
  }

  // Wait for the countdown to elapse. The page typically shows a timer.
  // We poll for up to 90s, looking for either a direct download link appearing
  // or a download event firing.
  const t0 = Date.now();
  let directUrl = null;
  while (Date.now() - t0 < 90000) {
    // Any visible anchor whose href looks like a file (jar / download / dl.)?
    const candidates = await page.$$eval("a", (as) =>
      as.map((a) => ({ text: (a.textContent || "").trim().slice(0, 30), href: a.href }))
        .filter((x) => x.href && /\.jar|download|dl\.|files\.|file\?|idd=/i.test(x.href))
    );
    console.log("  [t=" + Math.round((Date.now() - t0) / 1000) + "s] candidates:", JSON.stringify(candidates.slice(0, 6)));
    if (candidates.length) {
      directUrl = candidates[0].href;
      break;
    }
    const out = await page.evaluate(() => document.body.innerText);
    if (/скачивание|загрузка|сохранить|download|готово|скачать файл/i.test(out)) {
      // keep waiting
    }
    await sleep(3000);
  }

  await page.close();
  await browser.close();

  console.log("Chosen direct URL:", directUrl);
  if (!directUrl) {
    console.log("NO_DIRECT_URL");
    process.exit(4);
  }

  // Download it.
  console.log("Downloading from", directUrl);
  await fileDownload(directUrl, OUT);

  const buf = fs.readFileSync(OUT);
  const h = sha256(buf);
  const size = buf.length;
  console.log("Downloaded: ", OUT);
  console.log("Size (bytes):", size, "~", (size / 1024 / 1024).toFixed(2), "MB");
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
