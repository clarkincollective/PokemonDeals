#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C.7 (§14) - FINAL VISUAL PARITY PASS proof.
//
//   node scripts/socialCreativeVideo1iPack.mjs            plan + audits
//   node scripts/socialCreativeVideo1iPack.mjs --render    also render the MP4s
//
// STATIC MASTER vs 4C.6 vs 4C.7. Reuses the approved cached 5A.1 masters +
// REAL canonical cards. $0 incremental API. DEAL_DROP excluded (fact
// drift). NOTHING published.

import { existsSync, mkdirSync, writeFileSync, copyFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const execFileP = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1i-final-parity");
const OLD = path.join(ROOT, ".social-preview", "video-1h-static-parity");
const RENDER = process.argv.slice(2).includes("--render");
const CACHE = path.join(OUT, "_cache");
const CARD_CACHE = path.join(ROOT, ".social-preview", "card-art-cache");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { buildSemanticManifest } = await import("../lib/newsroom/hybrid/semanticManifest.mjs");
const V = await import("../lib/newsroom/video/index.mjs");
const { videoSemanticHash } = await import("../lib/newsroom/video/videoDirector.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { FFMPEG } = await import("../lib/social/videoRender.mjs");

const db = supabaseAdmin();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "media"), { recursive: true });
mkdirSync(CACHE, { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4C.7  final visual parity pass proof ===`);
console.log(`render: ${RENDER ? "ON" : "OFF"}   (approved cached masters + REAL canonical cards; $0 incremental API)\n`);

const MASTERS = {
  ASKING_VS_SOLD: ".social-preview/creative-5a1-final/full/A_asking_vs_sold.png",
  MARKET_SNAPSHOT: ".social-preview/creative-5a1-final/full/B_market_snapshot.png",
};

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
function localCard(id) {
  const p = path.join(CARD_CACHE, `${id}.jpg`);
  if (id && existsSync(p)) return p;
  for (const c of V.EVERGREEN_CTA_CARDS) { const q = path.join(CARD_CACHE, `${c.id}.jpg`); if (existsSync(q)) return q; }
  return null;
}
async function frame(mp4, at, out) {
  try { await execFileP(FFMPEG, ["-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", out]); return existsSync(out); } catch { return false; }
}
async function sheet(mp4, times, out, w = 390, h = 693, cols = 3) {
  const dir = path.join(OUT, "media", "_cs");
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  for (let i = 0; i < times.length; i++) await frame(mp4, times[i], path.join(dir, `${i}.png`));
  const rows = Math.ceil(times.length / cols);
  try { await execFileP(FFMPEG, ["-y", "-framerate", "1", "-i", path.join(dir, "%d.png"), "-vf", `scale=${w}:${h},tile=${cols}x${rows}`, out]); } catch { /* */ }
  rmSync(dir, { recursive: true, force: true });
}

const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));

const stories = [];
if (aRes?.ok) stories.push({ id: "ASKING_VS_SOLD", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", resolved: aRes,
  facts: { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd }, heroId: aRes.data.tcgplayerId });
if (mRes?.ok) stories.push({ id: "MARKET_SNAPSHOT", family: "market_shape", series: "MARKET_SNAPSHOT", resolved: mRes,
  facts: { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name }, heroId: mRes.data.featured?.tcgplayerId });

console.log("DEAL_DROP: EXCLUDED - the only cached master shows 45% for a true 44% (§12)\n");

const results = {};

for (const s of stories) {
  const { id, family, series, resolved } = s;
  const masterPath = MASTERS[id];
  if (!existsSync(masterPath)) { console.log(`${id}: SKIP - no approved master`); results[id] = { status: "NO_MASTER" }; continue; }

  const catRow = await catalogRow(s.heroId);
  const factLock = buildFactLock({ facts_json: s.facts ?? resolved.data });
  const contract = contractFor(series);
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract, cardCatalogRow: catRow });
  const semanticHash = videoSemanticHash(sem);
  const heroCardPath = localCard(s.heroId);
  const ch = { story_id: id, semantic_hash: `cap-${id}`, image_artifact_id: `img-${id}` };

  V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", note: "5A.1 BUFFER_READY" } });

  const r = V.runProfessionalSocialLoop({
    story: { story_id: id }, semanticManifest: sem, factLock, captionHandoff: ch, family,
    cardImagePaths: heroCardPath ? [heroCardPath] : [],
    heroCardId: /^\d+$/.test(String(s.heroId ?? "")) ? String(s.heroId) : null,
    heroCardName: sem.card_identity?.name ?? null,
    cacheDir: CACHE, ctaCacheDir: CARD_CACHE,
  });

  const rec = {
    id, family, status: r.state, ok: r.ok, revised: r.revised,
    duration_ms: r.duration_ms, story_ms: r.story_ms, cta_ms: r.cta_ms,
    density: r.density,
    static_parity_rubric: r.static_parity_rubric, static_master_parity: r.static_master_parity,
    content_occupancy: r.content_occupancy_audit, card_prominence: r.card_prominence_audit,
    lower_dead_space: r.lower_dead_space_audit, cta_luminance: r.cta_luminance_audit,
    mobile_hierarchy: r.mobile_hierarchy_audit, owner_taste: r.owner_taste,
    professional_brand: r.professional_brand ? { verdict: r.professional_brand.verdict, score: r.professional_brand.score, reasons: r.professional_brand.reasons } : null,
    motion_salience: r.motion_salience, cta_hold: r.cta_hold,
    end_screen: r.end_screen ? { cards: r.end_screen.cards.map((c) => c.id), primary_cta: r.end_screen.primary_cta, brightness: r.end_screen.brightness } : null,
    cost: r.cost,
  };

  writeFileSync(path.join(OUT, `${id}_PARITY_AUDIT.json`), JSON.stringify({ static_parity_rubric: r.static_parity_rubric, static_master_parity: r.static_master_parity, density: r.density }, null, 2));
  writeFileSync(path.join(OUT, `${id}_VISUAL_QA.json`), JSON.stringify({ content_occupancy: r.content_occupancy_audit, card_prominence: r.card_prominence_audit, lower_dead_space: r.lower_dead_space_audit, cta_luminance: r.cta_luminance_audit, mobile_hierarchy: r.mobile_hierarchy_audit, professional_brand: rec.professional_brand, owner_taste: r.owner_taste, motion_salience: r.motion_salience }, null, 2));
  writeFileSync(path.join(OUT, `${id}_FACT_AUDIT.json`), JSON.stringify(r.fact_audit, null, 2));
  writeFileSync(path.join(OUT, `${id}_CARD_FIDELITY.json`), JSON.stringify({ real_cards: r.qa?.verification?.real_cards, derivative_cards: r.derivative?.card_asset_paths, cta_fan: r.end_screen?.cards?.map((c) => ({ id: c.id, path: c.path, canonical: c.canonical })) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_TIMING.json`), JSON.stringify({ duration_ms: r.duration_ms, story_ms: r.story_ms, transition_ms: r.timeline?.transition_ms, cta_ms: r.cta_ms, cta_hold: r.cta_hold, events: r.timeline?.events?.map((e) => `${e.id}:${e.kind}@${e.at_ms}-${e.end_ms}`) }, null, 2));
  writeFileSync(path.join(OUT, `${id}_derivative.json`), JSON.stringify(r.derivative, null, 2));

  // OLD 4C.6 references (from the 1h pack)
  for (const [oldName, newName] of [["NEW_4C6_DERIVATIVE.png", "OLD_4C6_DERIVATIVE.png"], ["NEW_4C6_VIDEO.mp4", "OLD_4C6_VIDEO.mp4"]]) {
    const src = path.join(OLD, "media", `${id}_${oldName}`);
    if (existsSync(src)) copyFileSync(src, path.join(OUT, "media", `${id}_${newName}`));
  }
  copyFileSync(masterPath, path.join(OUT, "media", `${id}_STATIC_MASTER.png`));

  if (RENDER && r.ok) {
    const mp4 = path.join(OUT, "media", `${id}_NEW_4C7_VIDEO.mp4`);
    const rr = await V.renderProfessionalSocialLoopToMp4(r, mp4, {
      endScreenPngPath: path.join(OUT, "media", `${id}_CTA_FINAL.png`),
    }).catch((e) => ({ ok: false, reason: e.message }));
    if (rr.ok) {
      rec.render = { size_kb: Math.round(statSync(mp4).size / 1024), frames: rr.frames, duration_s: rr.probe?.duration_s ?? null };
      const cts = (r.timeline.cta_content_start_ms) / 1000;
      await frame(mp4, Math.max(0.5, (r.story_ms - 300) / 1000), path.join(OUT, "media", `${id}_NEW_4C7_DERIVATIVE.png`));
      const storyFrame = path.join(OUT, "media", `${id}_story_mid.png`);
      await frame(mp4, (r.story_ms / 1000) * 0.55, storyFrame);
      await sheet(mp4, [0.0, 0.9, 2.0, 3.2, 4.6, r.story_ms / 1000 - 0.2], path.join(OUT, "media", `${id}_STORY_CONTACT_SHEET.png`));
      await sheet(mp4, [cts + 0.3, cts + 0.9, cts + 1.5, cts + 2.0, cts + 2.3, Math.min(cts + 2.6, (r.duration_ms / 1000) - 0.05)], path.join(OUT, "media", `${id}_CTA_CONTACT_SHEET.png`));
      try {
        await execFileP(FFMPEG, ["-y", "-i", storyFrame, "-i", path.join(OUT, "media", `${id}_CTA_FINAL.png`), "-filter_complex", "[0:v]scale=390:693[a];[1:v]scale=390:693[b];[a][b]hstack", path.join(OUT, "media", `${id}_PHONE_PREVIEW.png`)]);
      } catch { /* */ }
    } else rec.render = { fail: rr.reason };
  }
  results[id] = rec;
  console.log(`  ${id}: ${r.state} | ${r.duration_ms}ms | dens ${r.density?.content_ratio} hero ${r.density?.hero_fraction} lowerDead ${r.density?.lower_dead_space} | parity ${r.static_parity_rubric?.video_derivative_visual_score} (${r.static_parity_rubric?.parity_gap}) | trust ${rec.professional_brand?.score} | occ ${r.content_occupancy_audit} cardProm ${r.card_prominence_audit?.verdict} ctaLum ${r.cta_luminance_audit}${rec.render ? ` | MP4 ${rec.render.size_kb ?? rec.render.fail}kb ${rec.render.duration_s ?? "?"}s` : ""}`);
}

const cost = {
  incremental_api_cost_usd_per_video: 0,
  local: "derivative + atmosphere + motion + CTA + render are all local",
  projected_10_videos_usd: 0, projected_30_videos_usd: 0, projected_100_videos_usd: 0, projected_300_videos_usd: 0,
};
writeFileSync(path.join(OUT, "cost.json"), JSON.stringify(cost, null, 2));

const escp = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  const m = (n) => existsSync(path.join(OUT, "media", n)) ? n : null;
  const im = (n, w = 150) => m(n) ? `<img src="media/${n}" width="${w}">` : "&mdash;";
  const vid = (n) => m(n) ? `<video src="media/${n}" controls muted loop playsinline width="170"></video>` : "&mdash;";
  return `<tr>
    <td>${s.id}<br><small>${escp(s.family)} · ${r.duration_ms ?? "?"}ms</small><br>parity <b>${r.static_parity_rubric?.parity_gap ?? "-"}</b> (${r.static_parity_rubric?.video_derivative_visual_score ?? "-"}/${r.static_parity_rubric?.static_master_visual_score ?? "-"})<br>trust ${r.professional_brand?.score ?? "-"}<br>dens ${r.density?.content_ratio ?? "-"} hero ${r.density?.hero_fraction ?? "-"}<br>ctaHold ${escp(r.cta_hold?.verdict ?? "-")}</td>
    <td>STATIC MASTER<br>${im(`${s.id}_STATIC_MASTER.png`, 160)}</td>
    <td>4C.6<br>${im(`${s.id}_OLD_4C6_DERIVATIVE.png`)}<br>${vid(`${s.id}_OLD_4C6_VIDEO.mp4`)}</td>
    <td><b>4C.7</b><br>${im(`${s.id}_NEW_4C7_DERIVATIVE.png`)}<br>${vid(`${s.id}_NEW_4C7_VIDEO.mp4`)}<br>CTA<br>${im(`${s.id}_CTA_FINAL.png`, 130)}</td>
    <td>phone<br>${im(`${s.id}_PHONE_PREVIEW.png`, 220)}<br>story frames<br>${im(`${s.id}_STORY_CONTACT_SHEET.png`, 220)}<br>CTA frames<br>${im(`${s.id}_CTA_CONTACT_SHEET.png`, 220)}</td>
  </tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C.7 final visual parity proof</title>
<style>body{font:13px system-ui;background:#0b0b0d;color:#eee;margin:20px;max-width:1750px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:7px;vertical-align:top}video,img{border:1px solid #333;border-radius:6px}</style>
<h1>SOCIAL-CREATIVE-4C.7 — final visual parity pass &nbsp; <small>STATIC MASTER vs 4C.6 vs 4C.7</small></h1>
<p>generated ${new Date().toISOString()} · render <b>${RENDER ? "ON" : "OFF"}</b> · incremental API <b>$0</b> · DEAL_DROP excluded (fact drift)</p>
<p>4C.7 fixes: faithfully reflowed static-master hierarchy instead of a sparser infographic - a bigger hero card (ASKING) / a real SPLIT composition with a donut chart + large REAL EXAMPLE card (MARKET); painted-label chips + a boxed % callout + a drawn comparison arrow (no soft glass); an integrated LESSON panel / two-item bottom band (fills the lower third instead of floating text); a brighter CTA (a dedicated glow layer, brighter card filter). Target 80-88% frame occupancy, card prominence, no lower dead space.</p>
<table><tr><th>story / audits</th><th>static</th><th>4C.6</th><th>4C.7</th><th>phone / frames</th></tr>${rows}</table>
<h2>Cost</h2><pre>${escp(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b> — the rubric score is broad categories (MATCH / NEAR_MATCH / WEAKER / FAIL), never fabricated pixel precision; the owner's visual comparison against the static master is the real gate.</p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ render: RENDER, results, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`cost: incremental API $0/video | 10/30/100/300 = $0`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
