// Phase 13D.4 - LOCAL-ONLY renderer. Takes an HTML string (built entirely
// from lib/social/templates.mjs - no image URLs, no network resources)
// and rasterizes it to a PNG file on disk using the system's installed
// Chrome over raw CDP - the exact same technique already proven twice in
// this repo's own QA tooling (_mobile-qa.mjs, _p021_responsive_qa.mjs),
// reused here rather than adding a new rendering dependency
// (node-canvas/puppeteer/a SaaS rendering API) for a local dev tool.
//
// There is no function in this file (or anywhere in lib/social/) named
// publish, schedulePost, sendToBuffer, postToInstagram, or anything
// resembling a network publish call. This module writes a file to disk
// and nothing else - see tests/scanner/social-no-publishing.test.mjs.

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CHROME =
  process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let _id = 0;
function cdp(ws, method, params = {}, sessionId) {
  const id = ++_id;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.id === id) {
        ws.removeEventListener("message", onMsg);
        m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

// Renders one HTML string to one PNG file at 1080x1350 (Instagram
// portrait/carousel dimensions - docs/social-creative-system.md SS7).
// Returns the absolute PNG path. Pure local I/O: writes a temp HTML
// file, loads it via file://, screenshots, tears the browser down.
export async function renderHtmlToPng(html, outPath) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpHtml = path.join(os.tmpdir(), `pdf-social-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(tmpHtml, html, "utf8");

  const userDir = path.join(os.tmpdir(), "pdf-social-render-" + Date.now());
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      "--user-data-dir=" + userDir,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  let wsUrl = null;
  chrome.stderr.on("data", (b) => {
    const m = String(b).match(/ws:\/\/[^\s]+/);
    if (m && !wsUrl) wsUrl = m[0];
  });
  for (let i = 0; i < 100 && !wsUrl; i++) await sleep(100);
  if (!wsUrl) {
    chrome.kill();
    throw new Error("renderHtmlToPng: Chrome did not expose a CDP endpoint (is CHROME_BIN set correctly?)");
  }

  const browser = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    browser.addEventListener("open", resolve, { once: true });
    browser.addEventListener("error", reject, { once: true });
  });

  try {
    const { targetId } = await cdp(browser, "Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp(browser, "Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => cdp(browser, method, params, sessionId);
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1080,
      height: 1350,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1080,
      screenHeight: 1350,
    });
    await send("Page.navigate", { url: pathToFileURL(tmpHtml).href });
    await sleep(600); // local file load - no network round-trip involved
    const { data: b64 } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(outPath, Buffer.from(b64, "base64"));
  } finally {
    browser.close();
    chrome.kill();
  }
  return outPath;
}
