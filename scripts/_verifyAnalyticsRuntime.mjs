// Analytics runtime verification - the application -> SDK boundary.
//
// Answers one question: when a visitor clicks a [data-analytics-click]
// control, does the APPLICATION's own handler run and reach
// lib/analytics/client.js capture(), which then calls the module-private
// `_posthog.capture(name, payload)` - once, with the expected payload?
//
// What this does NOT verify:
//   * production execution. The observation point is window.__pdfAnalytics,
//     which client.js defines ONLY when NODE_ENV !== "production". This runs
//     against `next dev`. The code path is the same; the build is not.
//   * ingestion. Every posthog host is blocked at the network layer, so
//     nothing is transmitted. This says nothing about whether PostHog would
//     accept the event.
//   * that a real browser session behaves identically (headless, one page).
//
// Why the observation point is what it is:
//   * DOM attributes / allowlist membership are static facts, not proof the
//     handler ran.
//   * a listener added by this script would only prove the DOM dispatches
//     clicks. The only listener registered here is a non-capture
//     preventDefault to stop navigation; it runs AFTER the application's
//     own capture-phase delegated listener in AnalyticsBootstrap.
//   * window.posthog is NOT the module-private `_posthog`. This wraps the
//     object returned by window.__pdfAnalytics.posthog(), and asserts it is
//     not window.posthog.
//
// PREREQUISITES (all local):
//   * Node >= 22 (uses the built-in WebSocket client; `engines` is not
//     declared in package.json, so this is a requirement, not a guarantee).
//     Verified working on Node 24.
//   * A dev server running:            npm run dev      (default :3311 here)
//   * NEXT_PUBLIC_POSTHOG_KEY set in .env.local, otherwise analyticsEnabled()
//     is false, AnalyticsBootstrap is inert and there is nothing to observe.
//   * Google Chrome. Path from CHROME_PATH, else the Windows default below.
//
// Zero npm dependencies - no `ws`, no puppeteer. (`ws` is only present as a
// transitive of the `vercel` devDependency, so a production or future
// install may not have it; that is why this uses the native client.)
//
// No credential is read, printed, or transmitted by this script.
//
//   node scripts/_verifyAnalyticsRuntime.mjs
//   BASE_URL=http://localhost:3000 node scripts/_verifyAnalyticsRuntime.mjs
//
// NOTE: this file is a de-secreted, dependency-free refactor of the driver
// that produced docs/analytics-runtime-verification.md. It has not been
// re-executed in this exact form.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.BASE_URL || "http://localhost:3311").replace(/\/$/, "");
const CHROME =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEVTOOLS_PORT = Number(process.env.CDP_PORT || 9338);
const EVENT = process.env.EVENT || "guides_research_clicked";
const CONTROL = process.env.CONTROL_TEXT || "Guides & Research";
const CONTROL_HREF = process.env.CONTROL_HREF || "/guides";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${id} :: ${detail}`);
};

const profile = mkdtempSync(join(tmpdir(), "pdf-analytics-verify-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${DEVTOOLS_PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let target = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* not up yet */
  }
  await sleep(500);
}
if (!target) {
  console.log("  FAILED: Chrome DevTools endpoint never came up. Is CHROME_PATH correct?");
  chrome.kill();
  process.exitCode = 1;
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
const blockedPosthog = [];
const blockedOther = new Set();
const consoleErrors = [];

ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") {
    // full text retained (not truncated, not sampled) so every entry can be
    // classified afterwards rather than assumed harmless.
    consoleErrors.push({ text: String(m.params.entry.text), url: m.params.entry.url ?? null });
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });

// Transport mock + scope guard. posthog is blocked so nothing is transmitted;
// card-detail routes and third-party hosts are blocked so no unrelated page
// request or pricing-provider path can be touched.
const POSTHOG_RE = /posthog\.com/i;
const CARD_DETAIL_RE = /\/cards\/[^/?]+/;
const ALLOW = [new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`)];

ws.addEventListener("message", async (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method !== "Fetch.requestPaused") return;
  const url = m.params.request.url;
  const isPosthog = POSTHOG_RE.test(url);
  const allowed =
    !isPosthog &&
    !CARD_DETAIL_RE.test(url) &&
    (ALLOW.some((re) => re.test(url)) || url.startsWith("data:") || url.startsWith("about:"));
  try {
    if (allowed) {
      await send("Fetch.continueRequest", { requestId: m.params.requestId });
    } else {
      if (isPosthog) blockedPosthog.push(url.split("?")[0]);
      else blockedOther.add(url.split("?")[0]);
      await send("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "BlockedByClient" });
    }
  } catch {
    /* the request may already be gone */
  }
});

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result
    ?.value;

async function load(width, height, deviceScaleFactor) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: width < 700,
  });
  await send("Page.navigate", { url: `${BASE}/` });
  for (let i = 0; i < 120; i++) {
    if ((await evaluate("document.readyState")) === "complete") break;
    await sleep(500);
  }
  // client.js defers init behind requestIdleCallback(timeout 4000)
  for (let i = 0; i < 60; i++) {
    const ready = await evaluate(
      `Boolean(window.__pdfAnalytics && window.__pdfAnalytics.posthog && window.__pdfAnalytics.posthog())`
    );
    if (ready) return true;
    await sleep(500);
  }
  return false;
}

const installWrapper = () =>
  evaluate(`(() => {
  const ph = window.__pdfAnalytics.posthog();
  if (!ph) return JSON.stringify({ wrapped: false, reason: "_posthog is null" });
  window.__captureCalls = [];
  if (!ph.__wrappedByVerifier) {
    const original = ph.capture.bind(ph);
    ph.capture = function (name, props) {
      window.__captureCalls.push({ name, props });
      return original(name, props);
    };
    ph.__wrappedByVerifier = true;
  }
  if (!window.__navSuppressed) {
    document.addEventListener("click", (e) => e.preventDefault(), { capture: false });
    window.__navSuppressed = true;
  }
  return JSON.stringify({
    wrapped: true,
    sameObject: ph === window.__pdfAnalytics.posthog(),
    isWindowPosthog: ph === window.posthog,
    state: window.__pdfAnalytics.state(),
  });
})()`);

const clickDesktop = () =>
  evaluate(`(() => {
  const a = [...document.querySelectorAll("a")].find(
    (x) => /${CONTROL.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}/.test(x.textContent || "") &&
           x.getAttribute("href") === ${JSON.stringify(CONTROL_HREF)}
  );
  if (!a) return JSON.stringify({ clicked: false, reason: "desktop control not found" });
  a.click();
  return JSON.stringify({ clicked: true, marker: a.getAttribute("data-analytics-click") });
})()`);

const clickMobile = () =>
  evaluate(`(async () => {
  const b = document.querySelector('button[aria-label="Open menu"]');
  if (!b) return JSON.stringify({ clicked: false, reason: "menu button not found" });
  b.click();
  await new Promise((r) => setTimeout(r, 800));
  const a = [...document.querySelectorAll("a")].find(
    (x) => /${CONTROL.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}/.test(x.textContent || "") &&
           x.getAttribute("href") === ${JSON.stringify(CONTROL_HREF)}
  );
  if (!a) return JSON.stringify({ clicked: false, reason: "entry not found in open menu" });
  a.click();
  return JSON.stringify({ clicked: true, marker: a.getAttribute("data-analytics-click") });
})()`);

const readCalls = async () => JSON.parse(await evaluate(`JSON.stringify(window.__captureCalls || [])`));

async function run(label, width, height, dsf, clickFn) {
  console.log(`\n=== ${label} ===`);
  const ready = await load(width, height, dsf);
  rec(`${label}: _posthog handle available`, ready, ready ? "window.__pdfAnalytics.posthog() -> object" : "null/absent - is NEXT_PUBLIC_POSTHOG_KEY set and this a dev build?");
  if (!ready) return;

  const w = JSON.parse(await installWrapper());
  rec(
    `${label}: wrapped the module-private handle (not window.posthog)`,
    w.wrapped === true && w.isWindowPosthog === false,
    `wrapped=${w.wrapped} identicalToWindowPosthog=${w.isWindowPosthog} state=${JSON.stringify(w.state)}`
  );

  const clicked = JSON.parse(await clickFn());
  if (!clicked.clicked) {
    rec(`${label}: control clickable`, false, clicked.reason);
    return;
  }
  await sleep(700);

  const calls = await readCalls();
  const mine = calls.filter((c) => c.name === EVENT);
  rec(
    `${label}: exactly ONE ${EVENT} reached _posthog.capture`,
    mine.length === 1,
    `calls=${JSON.stringify(calls.map((c) => c.name))}`
  );
  if (mine[0]) {
    const p = mine[0].props || {};
    rec(`${label}: expected properties present`, p.section === "nav" && p.source === "nav", `section=${p.section} source=${p.source}`);
    console.log(`        payload: ${JSON.stringify(p)}`);
  }
}

await run("desktop", 1280, 900, 1, clickDesktop);
await run("mobile", 390, 844, 2, clickMobile);

console.log("\n=== transport boundary (nothing transmitted) ===");
console.log(`  posthog requests blocked: ${blockedPosthog.length}`);
[...new Set(blockedPosthog)].forEach((u) => console.log(`      ${u}`));
console.log(`  other out-of-scope hosts blocked: ${blockedOther.size}`);

console.log("\n=== console errors (full text, classified) ===");
const guardNoise = consoleErrors.filter((e) => /ERR_BLOCKED_BY_CLIENT/.test(e.text));
const other = consoleErrors.filter((e) => !/ERR_BLOCKED_BY_CLIENT/.test(e.text));
console.log(`  total: ${consoleErrors.length}  |  from this script's own blocking: ${guardNoise.length}  |  other: ${other.length}`);
other.forEach((e) => console.log(`      ${e.text} ${e.url ?? ""}`));

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.ok);
console.log(`  ${results.length - failed.length}/${results.length} passed`);
failed.forEach((f) => console.log(`  FAILED: ${f.id} :: ${f.detail}`));
console.log("  NOTE: verifies the application -> SDK boundary in a dev build.");
console.log("        Production execution and PostHog ingestion are NOT verified.");

ws.close();
chrome.kill();
process.exitCode = failed.length ? 1 : 0;
