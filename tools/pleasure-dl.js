#!/usr/bin/env node
/*
 * pleasure-dl.js — download + sha256 verify for the Pleasure Horizons jar.
 *
 * USAGE
 *   node tools/pleasure-dl.js <url> [options]
 *
 *   <url> is EITHER:
 *     - the direct download URL you get AFTER the "Скачать без авторизации"
 *       countdown finishes (preferred), OR
 *     - the playground.ru file page URL (best-effort; it will scrape candidate
 *       direct links for you to pick).
 *
 * OPTIONS
 *   -o, --out <file>      Output file (default: Pleasure_Horizons-0.8.2-1.21.1.jar)
 *   -s, --sha256 <hex>    Expected sha256; exit non-zero on mismatch.
 *                         (You only quoted "f4e5c490…aa6220" truncated, so pass
 *                          the full hash if you want a hard check.)
 *   --no-download         Only compute sha256/size of an existing file.
 *
 * NOTE: playground.ru serves downloads behind a JS 60s countdown. This script
 * cannot execute that JS. The reliable path is:
 *   1) open the file page, 2) click "Скачать без авторизации", 3) after the 60s
 *   timer, the direct link appears — copy it and pass it here.
 */

const https = require("https");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": url } }, (res) => {
      // follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 10) return reject(new Error("Too many redirects"));
        return resolve(get(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      resolve(res);
    });
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("Request timeout")));
  });
}

function collect(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function human(n) {
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

async function scrapePage(pageUrl) {
  console.log(`Fetching page: ${pageUrl}`);
  const res = await get(pageUrl);
  const body = (await collect(res)).toString("utf8");
  // Candidate direct links: .jar files, or /file/ paths, or download.cdn hosts.
  const rx = /(https?:\/\/[^\s"'<>]+\.jar)|(https?:\/\/[^\s"'<>]*(?:dl|download|cdn)[^\s"'<>]*)/gi;
  const found = new Set();
  let m;
  while ((m = rx.exec(body))) found.add(m[0]);
  console.log("\nCandidate download links found on the page:");
  if (found.size === 0) console.log("  (none — the real link is behind the JS countdown)");
  [...found].forEach((u, i) => console.log(`  [${i + 1}] ${u}`));
  console.log("\nCopy the direct link and re-run: node tools/pleasure-dl.js <direct-url> -o <file> --sha256 <hex>\n");
}

async function download(url, outFile) {
  console.log(`Downloading: ${url}`);
  const res = await get(url);
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode} for ${url}`);
  }
  const buf = await collect(res);
  fs.writeFileSync(outFile, buf);
  return buf;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = { out: "Pleasure_Horizons-0.8.2-1.21.1.jar", sha256: null, noDownload: false };
  let positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") args.out = argv[++i];
    else if (a === "-s" || a === "--sha256") args.sha256 = argv[++i];
    else if (a === "--no-download") args.noDownload = true;
    else positional.push(a);
  }
  const url = positional[0];

  if (!url) {
    console.error("Usage: node tools/pleasure-dl.js <url> [-o out.jar] [--sha256 <hex>] [--no-download]");
    process.exit(2);
  }

  // Verify-only mode
  if (args.noDownload && fs.existsSync(url)) {
    const buf = fs.readFileSync(url);
    const h = sha256(buf);
    console.log(`File: ${url}`);
    console.log(`Size: ${human(buf.length)}`);
    console.log(`sha256: ${h}`);
    if (args.sha256) {
      const ok = h.toLowerCase() === args.sha256.toLowerCase();
      console.log(ok ? "MATCH ✔" : `MISMATCH ✘ (expected ${args.sha256})`);
      process.exit(ok ? 0 : 1);
    }
    return;
  }

  // Scrape mode: it's a playwright page
  if (/playground\.ru\/.*\/file\//.test(url) || /^(https?:\/\/)?www\.playground\.ru\//.test(url)) {
    await scrapePage(url);
    return;
  }

  // Direct download mode
  let buf;
  try {
    buf = await download(url, args.out);
  } catch (e) {
    console.error("Download failed:", e.message);
    process.exit(1);
  }
  const h = sha256(buf);
  console.log(`Saved: ${args.out}`);
  console.log(`Size: ${human(buf.length)}`);
  console.log(`sha256: ${h}`);
  if (args.sha256) {
    const ok = h.toLowerCase() === args.sha256.toLowerCase();
    console.log(ok ? "MATCH ✔" : `MISMATCH ✘ (expected ${args.sha256})`);
    process.exit(ok ? 0 : 1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
