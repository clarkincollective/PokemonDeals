// Phase 13E.3 - export the review gallery into a ChatGPT review pack:
// two high-resolution contact-sheet PNGs. Reads existing renders +
// manifest ONLY. Generates nothing, approves nothing, changes no design.
//
//   node scripts/_exportReviewPack13e3.mjs
//   -> .social-preview/13e3-review-pack/13e3-final-creatives-contact-sheet.png
//   -> .social-preview/13e3-review-pack/13e3-openai-backgrounds-contact-sheet.png

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const RENDERS = path.join(ROOT, ".social-preview", "13e3");
const OUT_DIR = path.join(ROOT, ".social-preview", "13e3-review-pack");
mkdirSync(OUT_DIR, { recursive: true });

const fileUrl = (abs) =>
  "file://" + (abs.startsWith("/") ? "" : "/") + abs.replace(/\\/g, "/").split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- the 18 final creatives, in review-gallery order --------------------
const FINALS = [
  ["Deal Drop", [
    ["dealdrop_blastoise_A.png", "Blastoise · Base Set (Shadowless) · raw · variant A (hero split)"],
    ["dealdrop_blastoise_B.png", "Blastoise · variant B (product stack)"],
    ["dealdrop_lugia-psa9_A.png", "Lugia · SM Team Up · PSA 9 · variant A"],
    ["dealdrop_lugia-psa9_B.png", "Lugia · PSA 9 · variant B"],
    ["dealdrop_raichu_A.png", "Raichu · Radiant Collection · short name / large saving · variant A"],
    ["dealdrop_zekrom-long_A.png", "Zekrom (115 Full Art Secret Rare) · long name · variant A"],
    ["dealdrop_wigglytuff-gb_A.png", "Wigglytuff · Skyridge · non-US marketplace (GB) · variant A"],
  ]],
  ["Market Mover", [
    ["mover_raichu_A.png", "Raichu · +142% / 12 months · real price-history chart · variant A"],
    ["mover_pikachu-zekrom-gx_A.png", "Pikachu & Zekrom GX · +17% / 12 months · variant A"],
    ["mover_wigglytuff_A.png", "Wigglytuff · +17% / 90 days · variant A"],
    ["mover_raichu_B.png", "Raichu · variant B (stack)"],
  ]],
  ["Hook Carousel", [
    ["carousel_1_cover.png", "Slide 1 · cover / hook"],
    ["carousel_2_card.png", "Slide 2 · card"],
    ["carousel_3_card.png", "Slide 3 · card"],
    ["carousel_4_card.png", "Slide 4 · card"],
    ["carousel_5_card.png", "Slide 5 · card"],
    ["carousel_6_close.png", "Slide 6 · close (PokemonDealFinder + CTA)"],
  ]],
  ["Brand / Conversion Ad", [
    ["brandad_A.png", "Version D · real pokemondealfinder.com screenshot · \"STOP OVERPAYING FOR POKEMON CARDS\""],
  ]],
];

// --- the 13 OpenAI backgrounds, from the manifest ---------------------
const manifest = JSON.parse(readFileSync(path.join(ROOT, "assets/social/generated/social-assets.json"), "utf8"));
const generated = manifest.assets.filter((a) => a.status === "generated");
const SAMPLE = generated.filter((a) => a.sample);
const PROBE = generated.filter((a) => !a.sample);
const bgAbs = (a) => path.join(ROOT, "assets/social/generated", a.category, `${a.id}.png`);

const SHEET_CSS = `
  :root{--bg:#0b0b0d;--panel:#151518;--hair:#2a2a31;--ink:#fafafa;--sub:#c7c7cf;--faint:#8a8a94;--red:#f0322e}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:44px 40px 56px;width:2160px}
  h1{font-size:30px;font-weight:800;letter-spacing:-0.02em}
  .meta{color:var(--faint);font-size:14px;margin-top:4px;margin-bottom:28px}
  h2{font-size:20px;font-weight:800;color:var(--ink);margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--red)}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:28px 26px}
  .cell{background:var(--panel);border:1px solid var(--hair);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .cell img{width:100%;height:auto;display:block;background:#000}
  .cap{padding:12px 14px;font-size:13px;line-height:1.35;color:var(--sub)}
  .cap b{color:var(--ink);font-weight:800}
  .cap .id{font-family:ui-monospace,Menlo,monospace;font-size:14px;color:var(--ink);font-weight:800}
`;

function finalsHtml() {
  const blocks = FINALS.map(([fam, shots]) => {
    const cells = shots
      .filter(([f]) => existsSync(path.join(RENDERS, f)))
      .map(
        ([f, cap]) => `<figure class="cell"><img src="${fileUrl(path.join(RENDERS, f))}"><figcaption class="cap"><b>${esc(fam)}</b> · ${esc(cap)}</figcaption></figure>`
      )
      .join("");
    return `<h2>${esc(fam)}</h2><div class="grid">${cells}</div>`;
  }).join("");
  return `<!doctype html><meta charset="utf-8"><style>${SHEET_CSS}</style>
    <h1>PokemonDealFinder — Phase 13E.3 · Final creatives (18)</h1>
    <div class="meta">Rendered with real, currently-valid production fixtures. Portrait 1080×1350. Nothing here is published. Generated ${new Date().toISOString()}.</div>
    ${blocks}`;
}

function backgroundsHtml() {
  const cell = (a) =>
    `<figure class="cell"><img src="${fileUrl(bgAbs(a))}"><figcaption class="cap"><span class="id">${esc(a.id)}</span><br>family <b>${esc(a.category)}</b> · variant <b>${esc(a.variant)}</b> · ${esc(a.style)} / zone ${esc(a.zone)} · status ${esc(a.status)} · spec ${esc(a.prompt_spec_version)}</figcaption></figure>`;
  return `<!doctype html><meta charset="utf-8"><style>${SHEET_CSS}</style>
    <h1>PokemonDealFinder — Phase 13E.3 · OpenAI backgrounds (${generated.length})</h1>
    <div class="meta">Evergreen, data-free Layer-1 backgrounds. The deterministic renderer overlays every real fact on top; the model saw none. Portrait 1024×1536. Awaiting the 5-check human QA gate — nothing approved. Generated ${new Date().toISOString()}.</div>
    <h2>Sample set (${SAMPLE.length})</h2><div class="grid">${SAMPLE.map(cell).join("")}</div>
    <h2>auction_watch probe backgrounds (${PROBE.length})</h2><div class="grid">${PROBE.map(cell).join("")}</div>`;
}

// --- capture a full-page PNG at 2x via headless Chrome + CDP ----------
async function capture(html, outPath, { width = 2240, dsf = 2 } = {}) {
  const tmpHtml = path.join(os.tmpdir(), `pdf-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(tmpHtml, html, "utf8");
  const userDir = path.join(os.tmpdir(), "pdf-sheet-" + Date.now());
  const chrome = spawn(
    process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=" + dsf,
     "--remote-debugging-port=0", "--user-data-dir=" + userDir, "about:blank"],
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
  const fullH = Math.min(Math.ceil(cssContentSize.height), Math.floor(16000 / dsf)); // stay under Chrome's cap
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: fullH, scale: 1 },
  });
  writeFileSync(outPath, Buffer.from(data, "base64"));
  sock.close(); chrome.kill();
  rmSync(tmpHtml, { force: true });
  return { outPath, width: width * dsf, height: fullH * dsf };
}

const A = path.join(OUT_DIR, "13e3-final-creatives-contact-sheet.png");
const B = path.join(OUT_DIR, "13e3-openai-backgrounds-contact-sheet.png");
const r1 = await capture(finalsHtml(), A);
const r2 = await capture(backgroundsHtml(), B);
console.log("Review pack written to:\n  " + OUT_DIR + "\n");
console.log(`  13e3-final-creatives-contact-sheet.png     ${r1.width}x${r1.height}px  (18 creatives, labelled by family/variant)`);
console.log(`  13e3-openai-backgrounds-contact-sheet.png   ${r2.width}x${r2.height}px  (${generated.length} backgrounds, labelled by asset ID)`);
