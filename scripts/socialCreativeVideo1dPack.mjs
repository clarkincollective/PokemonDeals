#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C.3 (§28, §29, §30) - 5-SECOND PREMIUM LOOP proof.
//
//   node scripts/socialCreativeVideo1dPack.mjs            plan + audits, no render
//   node scripts/socialCreativeVideo1dPack.mjs --render    also render the 5s MP4s
//
// HARD COST RULE (§29): use ONLY existing approved cached masters. No AI
// art generation for the proof. Families:
//   A. ASKING_VS_SOLD   <- 5A.1 approved artifact  (exact-value correct)
//   B. MARKET_SNAPSHOT  <- 5A.1 approved artifact  (exact-value correct)
//   DEAL_DROP is EXCLUDED - the only cached master shows an old 45% for a
//   true 44% (§19/§28) - withheld.
// Read-only DB. NOTHING published.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1d-5s-loop");
const RENDER = process.argv.slice(2).includes("--render");
const CACHE = path.join(OUT, "_cache");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { buildSemanticManifest } = await import("../lib/newsroom/hybrid/semanticManifest.mjs");
const V = await import("../lib/newsroom/video/index.mjs");
const { videoSemanticHash } = await import("../lib/newsroom/video/videoDirector.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");

const db = supabaseAdmin();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "media"), { recursive: true });
mkdirSync(CACHE, { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4C.3  5-second premium loop proof ===`);
console.log(`render: ${RENDER ? "ON" : "OFF"}   (NO image generation - approved cached masters only)\n`);

const MASTERS = {
  ASKING_VS_SOLD: ".social-preview/creative-5a1-final/full/A_asking_vs_sold.png",
  MARKET_SNAPSHOT: ".social-preview/creative-5a1-final/full/B_market_snapshot.png",
};

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
function factTraceFrom(sem) {
  const rows = [];
  for (const k of sem.card_metadata_lock?._displayable ?? []) rows.push({ visible_claim: `${k}: ${sem.card_metadata_lock[k]}`, expected_value: sem.card_metadata_lock[k], source_type: "CARD_CATALOG", verdict: "PASS" });
  for (const t of sem.required_text ?? []) rows.push({ visible_claim: t, expected_value: t, source_type: /^\$|%/.test(t) ? "DERIVED_CALCULATION" : "EDITORIAL_LABEL", verdict: "PASS" });
  return rows;
}
async function extractPngFrame(mp4, at, out) {
  const { execFileSync } = await import("node:child_process");
  const ffmpeg = (await import("ffmpeg-static")).default;
  try { execFileSync(ffmpeg, ["-y", "-ss", String(at), "-i", mp4, "-frames:v", "1", out]); return existsSync(out); } catch { return false; }
}

const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));

const stories = [];
if (aRes?.ok) stories.push({ id: "ASKING_VS_SOLD", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", resolved: aRes,
  facts: { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd }, heroId: aRes.data.tcgplayerId });
if (mRes?.ok) stories.push({ id: "MARKET_SNAPSHOT", family: "market_shape", series: "MARKET_SNAPSHOT", resolved: mRes,
  facts: { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name }, heroId: mRes.data.featured?.tcgplayerId });

console.log("DEAL_DROP: EXCLUDED from proof - the only cached master shows 45% for a true 44% (§19/§28 - withheld)\n");

const results = {};
let dedupeProven = false;

for (const s of stories) {
  const { id, family, series, resolved } = s;
  const masterPath = MASTERS[id];
  if (!existsSync(masterPath)) { console.log(`${id}: SKIP - no approved master`); results[id] = { status: "NO_MASTER" }; continue; }

  const catRow = await catalogRow(s.heroId);
  const factLock = buildFactLock({ facts_json: s.facts ?? resolved.data });
  const contract = contractFor(series);
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract, cardCatalogRow: catRow });
  const factTrace = factTraceFrom(sem);
  const semanticHash = videoSemanticHash(sem);
  const ch = { story_id: id, semantic_hash: `cap-${id}`, image_artifact_id: `img-${id}`, cta: contract?.classification === "COMMERCIAL" ? "See the live deal" : "pokemondealfinder.com" };

  // §4/§18 seed the cache from the pre-approved, fact-clean 5A.1 artifact
  const reg = V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE, brandInMaster: true, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", note: "5A.1 BUFFER_READY, semantic/fact-sources/fidelity/quality PASS" } });
  const reg2 = V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE });
  if (reg2._deduped) dedupeProven = true;

  // §22 reuse the 5B caption_handoff - not regenerated here
  const r = await V.runPremiumLoop({ story: { story_id: id }, semanticManifest: sem, captionHandoff: ch, family, cacheDir: CACHE, allowGenerate: false });

  const rec = {
    id, family,
    master: { source: r.master?.source, sha: r.master?.image_sha256?.slice(0, 12), from_cache: r.master?.from_cache, dims: `${reg.image_w}x${reg.image_h}`, brand_in_master: r.master?.brand_in_master },
    status: r.state, ok: r.ok, replanned: r.replanned,
    loop: r.loop_plan ? { duration_ms: r.loop_plan.duration_ms, fps: r.loop_plan.fps, motion_events: r.loop_plan.motion_events.map((e) => `${e.id}:${e.kind}`), seam_declared: JSON.stringify(r.loop_plan.seam.start_state) === JSON.stringify(r.loop_plan.seam.end_state) } : null,
    loop_audit: r.loop_audit,
    brand_trust: r.brand_trust ? { verdict: r.brand_trust.verdict, score: r.brand_trust.score } : null,
    audio_cues: r.audio_cue_timeline?.cues.map((c) => c.id),
    caption_link: r.caption_link,
    dedupe_key: r.dedupe_key,
    poster_from: r.poster_from,
    cost: r.cost,
  };
  writeFileSync(path.join(OUT, `${id}_loop_plan.json`), JSON.stringify(r.loop_plan, null, 2));
  writeFileSync(path.join(OUT, `${id}_layers.json`), JSON.stringify(r.layers, null, 2));
  writeFileSync(path.join(OUT, `${id}_audits.json`), JSON.stringify({ loop_audit: r.loop_audit, brand_trust: r.brand_trust, audio_cue_timeline: r.audio_cue_timeline, cost: r.cost, master: r.master, caption_link: r.caption_link }, null, 2));

  if (RENDER && r.ok) {
    const mp4 = path.join(OUT, "media", `${id}_5S_LOOP.mp4`);
    const poster = path.join(OUT, "media", `${id}_STATIC_MASTER.png`);
    const rr = await V.renderPremiumLoopToMp4(r, mp4, { posterPath: poster }).catch((e) => ({ ok: false, reason: e.message }));
    if (rr.ok) {
      rec.render = { size_kb: Math.round(statSync(mp4).size / 1024), frames: rr.frames, duration_s: rr.probe?.duration_s ?? null };
      // §27 loop-seam evidence: frames at 0.0s and ~4.95s
      await extractPngFrame(mp4, 0, path.join(OUT, "media", `${id}_seam_start.png`));
      await extractPngFrame(mp4, Math.max(0, (r.loop_plan.duration_ms / 1000) - 0.06), path.join(OUT, "media", `${id}_seam_end.png`));
      await extractPngFrame(mp4, (r.loop_plan.duration_ms / 1000) * 0.5, path.join(OUT, "media", `${id}_mid.png`));
    } else rec.render = { fail: rr.reason };
  }
  results[id] = rec;
  console.log(`  ${id}: ${r.state} | master ${r.master?.source} ${rec.master.dims} | events ${r.loop_plan?.motion_events.length} | seam ${rec.loop?.seam_declared ? "OK" : "?"} | brand_trust ${rec.brand_trust?.verdict}(${rec.brand_trust?.score}) | cost $${r.cost.master_generation_cost + r.cost.video_incremental_api_cost}${rec.render ? ` | MP4 ${rec.render.size_kb ?? rec.render.fail}kb ${rec.render.duration_s ?? "?"}s` : ""}`);
}

// ---- cost report (§30) ------------------------------
const cost = {
  incremental_api_cost_usd: 0,
  local_render_cost_usd: 0,
  note: "every master was an existing approved 5A.1 artifact - $0 image generation. Image-gen cost belongs to the shared story master, not the video.",
  masters_reused_from_cache: Object.values(results).filter((r) => r.master?.from_cache).length,
  dedupe_proven: dedupeProven,
  projected_10_reels_usd: 0,
  projected_30_reels_usd: 0,
  projected_100_reels_usd: 0,
  projected_300_reels_usd: 0,
};

const esc = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  const stat = existsSync(path.join(OUT, "media", `${s.id}_STATIC_MASTER.png`)) ? `<img src="media/${s.id}_STATIC_MASTER.png" width="200">` : "&mdash;";
  const loop = existsSync(path.join(OUT, "media", `${s.id}_5S_LOOP.mp4`)) ? `<video src="media/${s.id}_5S_LOOP.mp4" controls muted loop playsinline width="200"></video>` : "&mdash;";
  const seam = existsSync(path.join(OUT, "media", `${s.id}_seam_start.png`)) ? `<img src="media/${s.id}_seam_start.png" width="96"> <img src="media/${s.id}_seam_end.png" width="96">` : "";
  return `<tr><td>${s.id}<br><small>${esc(s.family)}</small><br>brand_trust ${esc(r.brand_trust?.verdict ?? "-")} ${r.brand_trust?.score ?? ""}<br>$${(r.cost?.master_generation_cost ?? 0) + (r.cost?.video_incremental_api_cost ?? 0)}</td><td>STATIC MASTER<br>${stat}</td><td>5-SECOND LOOP<br>${loop}</td><td>seam 0.0s / 5.0s<br>${seam}</td></tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C.3 5-second loop proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:24px;max-width:1200px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}video,img{border:1px solid #333;border-radius:6px}</style>
<h1>SOCIAL-CREATIVE-4C.3 — approved static master → subtle premium 5-second loop</h1>
<p>generated ${new Date().toISOString()} &nbsp; render: <b>${RENDER ? "ON" : "OFF"}</b> &nbsp; image generation: <b>$0 (approved cached masters only)</b></p>
<p>DEAL_DROP excluded — its only cached master shows an old 45% for a true 44% (§19/§28).</p>
<table><tr><th>story</th><th>static master</th><th>5-second loop</th><th>loop seam</th></tr>${rows}</table>
<p>Per story: <code>&lt;ID&gt;_loop_plan.json</code> · <code>_layers.json</code> · <code>_audits.json</code></p>
<h2>Cost (§30)</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ render: RENDER, results, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`cost: incremental API $0 | per 10/30/100/300 reels $0 (local render only)`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
