// Phase SOCIAL-NEWSROOM-3B.1 - GitHub Actions Chrome/CDP startup fix for
// lib/social/render.mjs. Pure-logic + source-scan. No real Chrome.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveChromeBin } from "../../lib/social/render.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const RENDER = read("lib/social/render.mjs");

// ---- Chrome binary resolution ---------------------------------
test("RB-1. resolveChromeBin: a bad CHROME_BIN falls through to detection, never returned verbatim", () => {
  const bad = "/definitely/not/a/real/chrome/binary/xyzzy";
  const got = resolveChromeBin({ CHROME_BIN: bad });
  assert.notEqual(got, bad, "a non-existent CHROME_BIN must not be returned as-is");
  assert.ok(typeof got === "string" && got.length > 0);
});

test("RB-2. resolveChromeBin: with no env it still returns a candidate string for this platform", () => {
  const got = resolveChromeBin({});
  assert.ok(typeof got === "string" && got.length > 0);
  if (process.platform === "win32") assert.match(got, /chrome/i);
  else assert.match(got, /chrome|chromium/i);
});

test("RB-3. resolveChromeBin: an explicit, valid CHROME_BIN wins", () => {
  // use *this* Node executable as a stand-in for 'an executable that exists'
  const self = process.execPath;
  assert.equal(resolveChromeBin({ CHROME_BIN: self }), self);
});

test("RB-4. resolveChromeBin knows the common Linux + macOS + Windows locations", () => {
  assert.match(RENDER, /\/usr\/bin\/google-chrome\b/);
  assert.match(RENDER, /\/usr\/bin\/google-chrome-stable/);
  assert.match(RENDER, /\/usr\/bin\/chromium(-browser)?/);
  assert.match(RENDER, /Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(RENDER, /Program Files\/Google\/Chrome\/Application\/chrome\.exe/);
  // PATH lookup for bare names
  assert.match(RENDER, /whichSync\(/);
  assert.match(RENDER, /"google-chrome", "google-chrome-stable", "chromium", "chromium-browser"/);
});

// ---- Linux / CI launch args ----------------------------------
test("RB-5. Linux launch adds --no-sandbox / --disable-setuid-sandbox / --disable-dev-shm-usage, guarded by platform", () => {
  assert.match(RENDER, /process\.platform === "linux"/);
  const linuxBlock = RENDER.slice(RENDER.indexOf('process.platform === "linux"'), RENDER.indexOf('process.platform === "linux"') + 300);
  assert.match(linuxBlock, /--no-sandbox/);
  assert.match(linuxBlock, /--disable-setuid-sandbox/);
  assert.match(linuxBlock, /--disable-dev-shm-usage/);
  // these must NOT be added unconditionally (Windows/macOS unaffected)
  assert.doesNotMatch(RENDER.replace(linuxBlock, ""), /--no-sandbox/);
});

test("RB-6. headless=new + a unique user-data-dir + an OS-chosen free debug port (no hardcoded shared port)", () => {
  assert.match(RENDER, /--headless=new/);
  assert.match(RENDER, /--user-data-dir=\$\{userDir\}/);
  assert.match(RENDER, /--remote-debugging-port=\$\{port\}/);
  assert.match(RENDER, /--remote-debugging-address=127\.0\.0\.1/);
  // port comes from an ephemeral bind, not a constant
  assert.match(RENDER, /function freePort\(\)/);
  assert.match(RENDER, /net\.createServer\(\)/);
  assert.match(RENDER, /listen\(0, "127\.0\.0\.1"/);
  assert.doesNotMatch(RENDER, /--remote-debugging-port=9222|--remote-debugging-port=0\b/);
});

// ---- CDP discovery: bounded retry on the HTTP endpoint --------
test("RB-7. CDP discovery polls http://127.0.0.1:<port>/json/version with bounded retry + backoff; stderr scrape is only a fallback", () => {
  assert.match(RENDER, /discoverWsUrl/);
  assert.match(RENDER, /\/json\/version/);
  assert.match(RENDER, /webSocketDebuggerUrl/);
  assert.match(RENDER, /for \(let i = 0; i < attempts; i\+\+\)/);
  assert.match(RENDER, /AbortSignal\.timeout/);
  assert.match(RENDER, /gentle backoff, capped|Math\.min\(i \* 10/);
  // primary = HTTP poll, fallback = the stderr ws:// line
  assert.match(RENDER, /const wsUrl\s*=\s*\n?\s*\(await discoverWsUrl\(port/);
  assert.match(RENDER, /\)\) \|\|\n\s*stderrWsUrl;/);
  // discovery aborts early if Chrome has already exited
  assert.match(RENDER, /isDead\?\.\(\)/);
});

// ---- failure diagnostics ------------------------------------
test("RB-8. a CDP-never-appears failure reports the resolved bin, the endpoint, Chrome exit code/signal, and the last stderr lines", () => {
  const errBlock = RENDER.slice(RENDER.indexOf("if (!wsUrl)"), RENDER.indexOf("if (!wsUrl)") + 700);
  assert.match(errBlock, /resolved CHROME_BIN = \$\{chromeBin\}/);
  assert.match(errBlock, /attempted CDP endpoint = http:\/\/127\.0\.0\.1:\$\{port\}/);
  assert.match(errBlock, /Chrome exited \(code=\$\{exitInfo\.code\} signal=\$\{exitInfo\.signal\}\)/);
  assert.match(errBlock, /last Chrome stderr/);
  assert.match(RENDER, /chrome\.on\("exit", \(code, signal\)/);
  // no secrets in render.mjs anyway (asserted elsewhere) - spot check
  assert.ok(!/API_KEY|SERVICE_ROLE|SECRET|TOKEN/i.test(errBlock));
});

// ---- cleanup always runs -----------------------------------
test("RB-9. Chrome + temp profile are cleaned up on success, error, and process exit/signal", () => {
  // on the discovery-timeout path
  const errBlock = RENDER.slice(RENDER.indexOf("if (!wsUrl)"), RENDER.indexOf("throw new Error(`createRenderer"));
  assert.match(errBlock, /chrome\.kill\("SIGKILL"\)/);
  assert.match(errBlock, /rmDirWithRetry\(userDir\)/);
  // the session close() + exit/signal handlers
  assert.match(RENDER, /function hardCleanup\(\)/);
  assert.match(RENDER, /process\.once\("exit", hardCleanup\)/);
  assert.match(RENDER, /process\.once\("SIGINT", onSignal\)/);
  assert.match(RENDER, /process\.once\("SIGTERM", onSignal\)/);
  // rmDirWithRetry(userDir) is called on BOTH the discovery-error path and in hardCleanup
  assert.equal((RENDER.match(/rmDirWithRetry\(userDir\)/g) || []).length, 2);
  assert.match(RENDER, /async function close\(\) \{ hardCleanup\(\); \}/);
  // idempotent
  assert.match(RENDER, /if \(closed\) return;\s*\n\s*closed = true;/);
  // rmSync loses the race with a just-killed Chrome on Windows -> retry
  assert.match(RENDER, /function rmDirWithRetry\(dir, tries/);
  assert.match(RENDER, /Atomics\.wait\(/);
  // and a start-of-run sweep of stale (>10 min) profile dirs so they never pile up
  assert.match(RENDER, /function sweepStaleProfiles\(\)/);
  assert.match(RENDER, /now - statSync\(p\)\.mtimeMs > 600_000/);
  assert.match(RENDER, /^\s*sweepStaleProfiles\(\);/m);
});

// ---- local Windows safety --------------------------------
test("RB-10. Windows behaviour is preserved: the Windows Chrome path is a win32 candidate; `where` used for PATH lookup", () => {
  // the candidates ternary: win32 -> [ ...chrome.exe... ]
  assert.match(RENDER, /process\.platform === "win32"\s*\n?\s*\?\s*\[\s*\n?\s*"C:\/Program Files\/Google\/Chrome\/Application\/chrome\.exe"/);
  // `which` uses `where` on win32, `command -v` elsewhere
  assert.match(RENDER, /process\.platform === "win32" \? "where" : "command"/);
  // final fallback keeps the historic Windows default
  assert.match(RENDER, /process\.platform === "win32" \? "C:\/Program Files\/Google\/Chrome\/Application\/chrome\.exe" : "google-chrome"/);
});

// ---- workflow diagnostics (SS8) ---------------------------
test("RB-11. the GitHub workflow validates the Chrome binary, fails loudly if absent, and prints --version", () => {
  const w = read(".github/workflows/social-backlog-build-render.yml");
  assert.match(w, /for c in google-chrome google-chrome-stable chromium chromium-browser/);
  assert.match(w, /command -v "\$c"/);
  assert.match(w, /\[ -x "\$p" \]/);
  assert.match(w, /::error::no Chrome\/Chromium binary found/);
  assert.match(w, /"\$BIN" --version/);
  assert.match(w, /CHROME_BIN: \$\{\{ steps\.chrome\.outputs\.bin \}\}/);
});

// ---- no scope creep --------------------------------------
test("RB-12. this fix touches only the renderer + its workflow - no quality logic, no Buffer, no schedule, no env writes", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const r = strip(RENDER);
  assert.doesNotMatch(r, /collectibleAppeal|editorialCreativeQa|reviewConsensus|scheduleOne|createPost|SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE/);
  assert.doesNotMatch(r, /image_url|ebayimg/); // preview-system test 9b
});
