// Phase 13E.3D - one before/after contact sheet: 13E.3C (OLD) vs 13E.3D
// FINAL for all four families, from real fixtures. Reads existing renders
// only. Generates nothing. -> .social-preview/13e3-review-pack/13e3d-before-after.png
import { existsSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const OLD = path.join(ROOT, ".social-preview", "13e3-old");
const NEW = path.join(ROOT, ".social-preview", "13e3");
const OUT_DIR = path.join(ROOT, ".social-preview", "13e3-review-pack");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "13e3d-before-after.png");

const fileUrl = (abs) =>
  "file://" + (abs.startsWith("/") ? "" : "/") + abs.replace(/\\/g, "/").split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// pick the first render that exists in a dir matching a prefix
import { readdirSync } from "node:fs";
const firstMatch = (dir, re) => (existsSync(dir) ? (readdirSync(dir).filter((f) => re.test(f)).sort()[0] ?? null) : null);

const FAMILIES = [
  { key: "Deal Drop", re: /^dealdrop_.*_A\.png$/, note: "Hook engine (data-driven), BELOW RECENT MARKET wording, website-first CTA + on-site URL." },
  { key: "Market Mover", re: /^mover_.*_A\.png$/, note: "Editorial hierarchy: NAME / MOVE% / PERIOD; unboxed chart; FULL PRICE HISTORY CTA." },
  { key: "Hook Carousel — cover", re: /^carousel_1_cover\.png$/, note: "Real fanned card artwork from the carousel's own cards; truthful count hook." },
  { key: "Brand / Conversion Ad", re: /^brandad_A\.png$/, note: "Large real screenshot (~55%), 3 supported benefits, SEE TODAY'S DEALS + URL, no dead space." },
];

const rows = FAMILIES.map((f) => {
  const oldF = firstMatch(OLD, f.re);
  const newF = firstMatch(NEW, f.re);
  const cell = (dir, file, tag) =>
    file
      ? `<figure class="cell"><span class="tag ${tag === "OLD" ? "old" : "new"}">${tag}</span><img src="${fileUrl(path.join(dir, file))}"></figure>`
      : `<figure class="cell empty">no render</figure>`;
  return `<section class="fam">
    <h2>${esc(f.key)}</h2>
    <p class="note">${esc(f.note)}</p>
    <div class="pair">${cell(OLD, oldF, "OLD")}${cell(NEW, newF, "13E.3D")}</div>
  </section>`;
}).join("");

const html = `<!doctype html><meta charset="utf-8"><style>
  :root{--bg:#0b0b0d;--panel:#151518;--hair:#2a2a31;--ink:#fafafa;--sub:#c7c7cf;--faint:#8a8a94;--red:#f0322e;--green:#3fcf8e}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:44px 40px 56px;width:1560px}
  h1{font-size:30px;font-weight:800;letter-spacing:-0.02em}
  .meta{color:var(--faint);font-size:14px;margin:4px 0 26px}
  h2{font-size:20px;font-weight:800;margin:28px 0 4px;padding-bottom:8px;border-bottom:2px solid var(--red)}
  .note{color:var(--faint);font-size:13px;margin-bottom:14px}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:32px}
  .cell{position:relative;background:var(--panel);border:1px solid var(--hair);border-radius:12px;overflow:hidden}
  .cell img{width:100%;height:auto;display:block;background:#000}
  .cell.empty{padding:80px;text-align:center;color:var(--faint)}
  .tag{position:absolute;top:12px;left:12px;z-index:2;font-size:12px;font-weight:800;letter-spacing:.06em;padding:6px 12px;border-radius:6px}
  .tag.old{background:#2a2a31;color:var(--sub)}
  .tag.new{background:var(--green);color:#000}
</style>
<h1>PokemonDealFinder — 13E.3D conversion pass · before / after</h1>
<div class="meta">Left = 13E.3C (OLD). Right = 13E.3D FINAL. Real fixtures. Fixture cards differ between passes (inventory re-pulled) — compare the SYSTEM, not the card. Generated ${new Date().toISOString()}.</div>
${rows}`;

async function capture(html, outPath, { width = 1640, dsf = 2 } = {}) {
  const tmpHtml = path.join(os.tmpdir(), `pdf-ba-${Date.now()}.html`);
  writeFileSync(tmpHtml, html, "utf8");
  const userDir = path.join(os.tmpdir(), "pdf-ba-" + Date.now());
  const chrome = spawn(
    process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=" + dsf, "--remote-debugging-port=0", "--user-data-dir=" + userDir, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  let ws = null;
  chrome.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !ws) ws = m[0]; });
  for (let i = 0; i < 120 && !ws; i++) await sleep(100);
  if (!ws) { chrome.kill(); throw new Error("no CDP endpoint"); }
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.addEventListener("open", res, { once: true }); sock.addEventListener("error", rej, { once: true }); });
  let id = 0;
  const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    const on = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.id === mid) { sock.removeEventListener("message", on); m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result); } };
    sock.addEventListener("message", on);
    sock.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
  });
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(m, p, sessionId);
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height: 2000, deviceScaleFactor: dsf, mobile: false });
  await send("Page.navigate", { url: fileUrl(tmpHtml) });
  await sleep(1200);
  const { cssContentSize } = await send("Page.getLayoutMetrics");
  const fullH = Math.min(Math.ceil(cssContentSize.height), Math.floor(16000 / dsf));
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: fullH, scale: 1 } });
  writeFileSync(outPath, Buffer.from(data, "base64"));
  sock.close(); chrome.kill(); rmSync(tmpHtml, { force: true });
  return { width: width * dsf, height: fullH * dsf };
}

const r = await capture(html, OUT);
console.log(`before/after contact sheet: ${OUT}\n  ${r.width}x${r.height}px`);
