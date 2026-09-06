// Phase 13E.4 - assemble the human/ChatGPT review pack for the short-form
// video system. Reads the artefacts `npm run social:video` already wrote
// to .social-preview/13e4/ (it generates NOTHING itself, renders no new
// video, calls no model) and produces:
//
//   .social-preview/13e4-review-pack/
//     <family>_reel.mp4 / <family>_tiktok.mp4   (copies of the finals)
//     contact-sheet.png                          (labelled representative frames)
//     manifest.json / manifest.txt               (ids, hooks, CTAs, QA)
//
// Run: node scripts/_videoReviewPack13e4.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const SRC = path.join(ROOT, ".social-preview", "13e4");
const OUT = path.join(ROOT, ".social-preview", "13e4-review-pack");
const MANIFEST = path.join(SRC, "manifest.json");
if (!existsSync(MANIFEST)) {
  console.error("no .social-preview/13e4/manifest.json - run `npm run social:video` first");
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fileUrl = (abs) =>
  "file://" + (abs.startsWith("/") ? "" : "/") + abs.replace(/\\/g, "/").split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/");

// four representative moments across a clip (fractions of its duration)
const MOMENTS = [0.06, 0.32, 0.6, 0.92];
const frameDir = path.join(OUT, "_frames");
mkdirSync(frameDir, { recursive: true });

const rows = [];
for (const fam of manifest.families) {
  if (fam.skipped) {
    rows.push({ family: fam.family, skipped: fam.skipped });
    continue;
  }
  for (const [platform, r] of Object.entries(fam.platforms)) {
    if (r.error) {
      rows.push({ family: fam.family, platform, error: r.error });
      continue;
    }
    const srcMp4 = path.join(ROOT, r.mp4);
    const dstMp4 = path.join(OUT, `${fam.family}_${platform}.mp4`);
    if (existsSync(srcMp4)) copyFileSync(srcMp4, dstMp4);
    const shots = [];
    if (platform === "reel" && existsSync(srcMp4)) {
      MOMENTS.forEach((frac, i) => {
        const t = Math.max(0, r.duration_s * frac).toFixed(2);
        const png = path.join(frameDir, `${fam.family}_${i}.png`);
        try {
          execFileSync(ffmpegPath, ["-y", "-ss", t, "-i", srcMp4, "-frames:v", "1", png], { stdio: "ignore" });
          shots.push({ t, png });
        } catch {}
      });
    }
    rows.push({
      family: fam.family,
      platform,
      mp4: path.basename(dstMp4),
      content_id: r.content_id,
      content_goal: r.content_goal,
      hook: r.hook,
      cta: `${r.cta_label} -> ${r.cta_url}`,
      duration_s: r.duration_s,
      frames: r.frames,
      format: `${r.probe.width}x${r.probe.height} ${r.probe.codec}/${r.probe.pix_fmt} ${r.probe.avg_fps}fps audio=${r.probe.has_audio}`,
      background_id: fam.background_id,
      fixture_ids: fam.fixtureId,
      qa: r.qa.ok ? "PASS" : `FAIL: ${r.qa.failed.join("; ")}`,
      shots,
    });
  }
}

// ---- contact sheet: one row of 4 frames per family (reel) --------------
const sheetRows = rows
  .filter((x) => x.shots && x.shots.length)
  .map(
    (x) => `<section class="fam">
    <h2>${esc(x.family)} <span class="goal">${esc(x.content_goal)}</span> <span class="qa ${x.qa === "PASS" ? "ok" : "bad"}">${esc(x.qa)}</span></h2>
    <p class="meta">${esc(x.hook)} &nbsp;·&nbsp; CTA: ${esc(x.cta)} &nbsp;·&nbsp; ${esc(x.duration_s)}s ${esc(x.format)} &nbsp;·&nbsp; bg: ${esc(x.background_id ?? "none")} &nbsp;·&nbsp; id: ${esc(x.content_id)}</p>
    <div class="strip">${x.shots.map((s) => `<figure><img src="${fileUrl(s.png)}"><figcaption>${esc(s.t)}s</figcaption></figure>`).join("")}</div>
  </section>`,
  )
  .join("");

const html = `<!doctype html><meta charset="utf-8"><style>
  :root{--bg:#0b0b0d;--panel:#151518;--hair:#2a2a31;--ink:#fafafa;--sub:#c7c7cf;--faint:#8a8a94;--red:#f0322e;--green:#3fcf8e}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;padding:40px;width:1500px}
  h1{font-size:26px;font-weight:800;letter-spacing:-0.02em}
  .lead{color:var(--faint);margin:6px 0 30px}
  .fam{margin:26px 0 34px}
  h2{font-size:18px;font-weight:800;border-bottom:2px solid var(--red);padding-bottom:8px;display:flex;gap:12px;align-items:center}
  .goal{font-size:11px;font-weight:700;letter-spacing:.08em;color:#000;background:var(--sub);border-radius:5px;padding:3px 8px}
  .qa{font-size:11px;font-weight:800;letter-spacing:.06em;border-radius:5px;padding:3px 8px}
  .qa.ok{background:var(--green);color:#000}.qa.bad{background:var(--red);color:#fff}
  .meta{color:var(--faint);font-size:12px;margin:10px 0 14px;word-break:break-word}
  .strip{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
  figure{background:var(--panel);border:1px solid var(--hair);border-radius:10px;overflow:hidden}
  figure img{width:100%;height:auto;display:block;background:#000}
  figcaption{font-size:11px;color:var(--faint);padding:6px 10px}
</style>
<h1>PokemonDealFinder — 13E.4 short-form video · review contact sheet</h1>
<div class="lead">Representative frames from the Reel master of each family (TikTok master is frame-identical; only the reported safe box differs). Generated ${new Date().toISOString()}.</div>
${sheetRows}`;

async function capture(html, outPath, { width = 1580, dsf = 2 } = {}) {
  const tmpHtml = path.join(os.tmpdir(), `pdf-vrp-${Date.now()}.html`);
  writeFileSync(tmpHtml, html, "utf8");
  const userDir = path.join(os.tmpdir(), "pdf-vrp-" + Date.now());
  const chrome = spawn(
    process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=" + dsf, "--remote-debugging-port=0", "--user-data-dir=" + userDir, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let ws = null;
  chrome.stderr.on("data", (b) => {
    const m = String(b).match(/ws:\/\/[^\s]+/);
    if (m && !ws) ws = m[0];
  });
  for (let i = 0; i < 120 && !ws; i++) await sleep(100);
  if (!ws) {
    chrome.kill();
    throw new Error("no CDP endpoint");
  }
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => {
    sock.addEventListener("open", res, { once: true });
    sock.addEventListener("error", rej, { once: true });
  });
  let id = 0;
  const cdp = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      const on = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.id === mid) {
          sock.removeEventListener("message", on);
          m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result);
        }
      };
      sock.addEventListener("message", on);
      sock.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
    });
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => cdp(m, p, sessionId);
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height: 2200, deviceScaleFactor: dsf, mobile: false });
  await send("Page.navigate", { url: fileUrl(tmpHtml) });
  await sleep(1400);
  const { cssContentSize } = await send("Page.getLayoutMetrics");
  const fullH = Math.min(Math.ceil(cssContentSize.height), Math.floor(16000 / dsf));
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: fullH, scale: 1 } });
  writeFileSync(outPath, Buffer.from(data, "base64"));
  sock.close();
  chrome.kill();
  rmSync(tmpHtml, { force: true });
  return { width: width * dsf, height: fullH * dsf };
}

const sheetPath = path.join(OUT, "contact-sheet.png");
const dim = await capture(html, sheetPath).catch((e) => {
  console.warn("contact sheet capture failed:", e.message);
  return null;
});

// ---- manifests -------------------------------------------------------
const pack = {
  phase: "13E.4",
  generated_at: new Date().toISOString(),
  source: ".social-preview/13e4/manifest.json",
  master_format: manifest.master,
  published: false,
  contact_sheet: dim ? `contact-sheet.png (${dim.width}x${dim.height})` : null,
  clips: rows,
};
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(pack, null, 2));
writeFileSync(
  path.join(OUT, "manifest.txt"),
  rows
    .map((x) =>
      x.skipped
        ? `${x.family}: SKIPPED (${x.skipped})`
        : x.error
          ? `${x.family} / ${x.platform}: RENDER ERROR (${x.error})`
          : [
              `${x.family} / ${x.platform}  [${x.qa}]`,
              `  file:    ${x.mp4}`,
              `  id:      ${x.content_id}   goal=${x.content_goal}`,
              `  hook:    ${x.hook}`,
              `  cta:     ${x.cta}`,
              `  format:  ${x.duration_s}s ${x.frames}f  ${x.format}`,
              `  sources: bg=${x.background_id ?? "none"}  fixtures=${JSON.stringify(x.fixture_ids)}`,
            ].join("\n"),
    )
    .join("\n\n") + "\n",
);

rmSync(frameDir, { recursive: true, force: true });
console.log(`review pack -> ${path.relative(ROOT, OUT)}/`);
for (const f of readdirSync(OUT)) console.log("  " + f);
