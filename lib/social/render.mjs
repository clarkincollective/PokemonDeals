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

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync, accessSync, constants as fsConstants } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Resolve the Chrome/Chromium executable. Priority:
//   1. CHROME_BIN (validated - it must actually exist / be executable)
//   2. platform-specific well-known locations
//   3. PATH lookup for the common binary names (GitHub `ubuntu-latest`
//      ships google-chrome-stable; other CI/Linux may only have chromium)
// Never returns a path that isn't runnable - a bad CHROME_BIN falls
// through to detection rather than failing opaquely later.
function isRunnable(p) {
  if (!p) return false;
  try {
    // an absolute path must exist + be executable; a bare name is resolved via PATH below
    if (p.includes("/") || p.includes("\\")) { accessSync(p, fsConstants.X_OK); return true; }
    return false;
  } catch { return false; }
}
function whichSync(name) {
  const cmd = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [name] : ["-v", name];
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", shell: process.platform !== "win32" });
    const line = String(r.stdout || "").split(/\r?\n/).find(Boolean);
    return line && line.trim() ? line.trim() : null;
  } catch { return null; }
}
export function resolveChromeBin(env = process.env) {
  if (env.CHROME_BIN) {
    if (isRunnable(env.CHROME_BIN)) return env.CHROME_BIN;
    const viaPath = whichSync(env.CHROME_BIN);
    if (viaPath && isRunnable(viaPath)) return viaPath;
    // fall through to detection - a stale CHROME_BIN shouldn't hard-fail
  }
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe") : null,
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ];
  for (const c of candidates) if (c && isRunnable(c)) return c;
  // last resort - PATH lookup of the common names
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const p = whichSync(name);
    if (p && (isRunnable(p) || process.platform === "win32")) return p;
  }
  return env.CHROME_BIN || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome");
}

// Ask the OS for a free localhost TCP port (bind :0, read it, release).
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Poll Chrome's HTTP debugging endpoint for the browser WebSocket URL.
// This is the platform-independent CDP-discovery path (the stderr line
// "DevTools listening on ws://..." is only a fallback - its format /
// stream varies between Chrome builds and CI, which is what broke the
// GitHub `ubuntu-latest` run).
async function discoverWsUrl(port, { attempts = 80, delayMs = 150, isDead } = {}) {
  const url = `http://127.0.0.1:${port}/json/version`;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    if (isDead?.()) break;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const j = await res.json();
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      }
    } catch (e) { lastErr = e; }
    await sleep(delayMs + Math.min(i * 10, 400)); // gentle backoff, capped
  }
  return null;
}

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
const PROFILE_PREFIX = "pdf-social-render-";

// rmSync can lose the race with a just-SIGKILL'd Chrome still releasing
// file handles on Windows - retry a few times, best-effort.
function rmDirWithRetry(dir, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { rmSync(dir, { recursive: true, force: true }); if (!existsSync(dir)) return; }
    catch { /* handle still held - retry */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120); // ~120ms sync sleep
  }
}

// Remove any leftover Chrome profile dirs from a prior crashed run
// (older than 10 min) so they never accumulate.
function sweepStaleProfiles() {
  try {
    const tmp = os.tmpdir();
    const now = Date.now();
    for (const name of readdirSync(tmp)) {
      if (!name.startsWith(PROFILE_PREFIX)) continue;
      const p = path.join(tmp, name);
      try { if (now - statSync(p).mtimeMs > 600_000) rmSync(p, { recursive: true, force: true }); } catch { /* */ }
    }
  } catch { /* tmpdir unreadable - nothing to sweep */ }
}

export async function createRenderer() {
  sweepStaleProfiles();
  const chromeBin = resolveChromeBin();
  const userDir = path.join(os.tmpdir(), `${PROFILE_PREFIX}${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(userDir, { recursive: true });
  const port = await freePort();

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDir}`,
  ];
  // CI / container Linux: Chrome under an unprivileged runner needs the
  // sandbox disabled, and /dev/shm is too small for the default shm path -
  // without these it exits immediately and never opens the debug port.
  if (process.platform === "linux") {
    args.push("--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage");
  }
  args.push("about:blank");

  const chrome = spawn(chromeBin, args, { stdio: ["ignore", "ignore", "pipe"] });

  const stderrTail = [];
  let stderrWsUrl = null;
  chrome.stderr.on("data", (b) => {
    const s = String(b);
    for (const line of s.split(/\r?\n/)) if (line.trim()) { stderrTail.push(line); if (stderrTail.length > 25) stderrTail.shift(); }
    const m = s.match(/ws:\/\/[^\s"']+/);
    if (m && !stderrWsUrl) stderrWsUrl = m[0];
  });
  let exitInfo = null;
  chrome.on("exit", (code, signal) => { exitInfo = { code, signal }; });

  // Primary discovery: HTTP poll on the port we chose (platform-agnostic).
  // Fallback: the stderr "DevTools listening on ws://..." line.
  const wsUrl =
    (await discoverWsUrl(port, { isDead: () => exitInfo != null })) ||
    stderrWsUrl;

  if (!wsUrl) {
    try { chrome.kill("SIGKILL"); } catch { /* already gone */ }
    rmDirWithRetry(userDir);
    const diag = [
      `resolved CHROME_BIN = ${chromeBin}`,
      `attempted CDP endpoint = http://127.0.0.1:${port}/json/version`,
      exitInfo ? `Chrome exited (code=${exitInfo.code} signal=${exitInfo.signal})` : "Chrome still running but never opened the debug port",
      stderrTail.length ? `last Chrome stderr:\n  ${stderrTail.slice(-8).join("\n  ")}` : "no Chrome stderr captured",
    ].join("\n");
    throw new Error(`createRenderer: Chrome did not expose a CDP endpoint.\n${diag}`);
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

  // A crash / SIGINT between createRenderer() and close() must not leave a
  // Chrome process + temp profile behind (CI runners and dev machines
  // both). Best-effort, idempotent.
  let closed = false;
  function hardCleanup() {
    if (closed) return;
    closed = true;
    try { browser.close(); } catch { /* */ }
    try { chrome.kill("SIGKILL"); } catch { /* already gone */ }
    for (const f of tmpFiles) { try { rmSync(f, { force: true }); } catch { /* */ } }
    rmDirWithRetry(userDir);
    process.removeListener("exit", hardCleanup);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
  function onSignal() { hardCleanup(); process.exit(1); }
  process.once("exit", hardCleanup);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  async function close() { hardCleanup(); }

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
