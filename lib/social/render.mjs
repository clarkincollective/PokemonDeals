// Phase 13D.4 / 13D.4.1 - LOCAL-ONLY renderer. Takes an HTML string (built
// entirely from lib/social/templates.mjs - no image URLs, no network
// resources) and rasterizes it to a PNG file on disk using the system's
// installed Chrome over raw CDP - the exact same technique already
// proven twice in this repo's own QA tooling (_mobile-qa.mjs,
// _p021_responsive_qa.mjs), reused here rather than adding a new
// rendering dependency (node-canvas/puppeteer/a SaaS rendering API) for
// a local dev tool.
//
// 13D.4.1: exposes a REUSABLE renderer session (one Chrome process, one
// tab, sequential navigate+screenshot) so a batch of previews doesn't
// spawn a new Chrome process per image - see the SS23 performance
// requirement. The one-shot renderHtmlToPng() helper is kept for
// single-image callers/tests and is implemented on top of the same
// session primitive.
//
// There is no function in this file (or anywhere in lib/social/) named
// publish, schedulePost, sendToBuffer, postToInstagram, or anything
// resembling a network publish call. This module writes files to disk
// and nothing else - see tests/scanner/social-preview-system.test.mjs.

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
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

// One Chrome process, one tab, reused across every renderToPng() call.
// Callers MUST call close() when done (the CLI does this in a finally
// block) so no Chrome process is ever left orphaned - SS23.
export async function createRenderer() {
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
    throw new Error("createRenderer: Chrome did not expose a CDP endpoint (is CHROME_BIN set correctly?)");
  }

  const browser = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    browser.addEventListener("open", resolve, { once: true });
    browser.addEventListener("error", reject, { once: true });
  });

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

  const tmpFiles = [];
  async function renderToPng(html, outPath) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    const tmpHtml = path.join(os.tmpdir(), `pdf-social-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    writeFileSync(tmpHtml, html, "utf8");
    tmpFiles.push(tmpHtml);
    await send("Page.navigate", { url: pathToFileURL(tmpHtml).href });
    await sleep(400); // local file load - no network round-trip involved
    const { data: b64 } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(outPath, Buffer.from(b64, "base64"));
    return outPath;
  }

  async function close() {
    browser.close();
    chrome.kill();
    for (const f of tmpFiles) {
      try {
        rmSync(f, { force: true });
      } catch {
        /* best-effort cleanup only */
      }
    }
  }

  return { renderToPng, close };
}

// Single-image convenience wrapper (spawns and tears down its own
// session) - used by tests and any one-off caller that doesn't need a
// batch.
export async function renderHtmlToPng(html, outPath) {
  const renderer = await createRenderer();
  try {
    return await renderer.renderToPng(html, outPath);
  } finally {
    await renderer.close();
  }
}
