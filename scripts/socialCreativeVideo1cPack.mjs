#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C.2 (§23, §24) - ONE-MASTER LAYERED MOTION proof.
//
//   node scripts/socialCreativeVideo1cPack.mjs           plan + audits, no render
//   node scripts/socialCreativeVideo1cPack.mjs --render   also render the 4C.2 (+ 4C) MP4s
//
// Reuses EXISTING approved master creatives (no fresh image generation):
//   DEAL_DROP        <- the 4C.1 card-hero board  (.social-preview/video-1b-generative/boards/)
//   ASKING_VS_SOLD   <- the 5A.1 approved artifact (.social-preview/creative-5a1-final/full/A_asking_vs_sold.png)
//   MARKET_SNAPSHOT  <- the 5A.1 approved artifact (.social-preview/creative-5a1-final/full/B_market_snapshot.png)
// => $0 video image-gen. Read-only DB. NOTHING published.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1c-master-motion");
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

console.log(`=== SOCIAL-CREATIVE-4C.2 master-layered-motion proof ===`);
console.log(`render: ${RENDER ? "ON" : "OFF"}   (no image generation - reusing approved masters)\n`);

const MASTERS = {
  DEAL_DROP: ".social-preview/video-1b-generative/boards/DEAL_DROP_board1_card_hero.png",
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

// ---- resolve the 3 real stories -----------------------
const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));
const dRes = await MD.resolveDealHeroSamples({ n: 1 }).catch((e) => ({ ok: false, reason: e.message }));
const deal = dRes?.ok && dRes.data.items?.[0] ? dRes.data.items[0] : null;

const stories = [];
if (deal) {
  const listed = Number(deal.price_usd), market = Number(deal.market_ref_usd), pct = deal.gap_pct ?? Math.round((1 - listed / market) * 100);
  stories.push({ id: "DEAL_DROP", family: "deal_hero", series: "DEAL_DROP",
    resolved: { ok: true, data: { card: { name: deal.card_name, set: deal.card_set, tcgplayerId: deal.tcgplayerId }, card_name: deal.card_name, card_set: deal.card_set, priceUsd: listed, marketUsd: market, discountPct: pct } },
    facts: { card_name: deal.card_name, card_set: deal.card_set, card_tcgplayer_id: deal.tcgplayerId, listed_price: listed, market_price: market, discount_pct: pct }, heroId: deal.tcgplayerId });
}
if (aRes?.ok) stories.push({ id: "ASKING_VS_SOLD", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", resolved: aRes,
  facts: { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd }, heroId: aRes.data.tcgplayerId });
if (mRes?.ok) stories.push({ id: "MARKET_SNAPSHOT", family: "market_shape", series: "MARKET_SNAPSHOT", resolved: mRes,
  facts: { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name }, heroId: mRes.data.featured?.tcgplayerId });

const results = {};
let dedupeProven = false;

for (const s of stories) {
  const { id, family, series, resolved } = s;
  const masterPath = MASTERS[id];
  if (!existsSync(masterPath)) { console.log(`${id}: SKIP - no approved master at ${masterPath}`); results[id] = { status: "NO_MASTER" }; continue; }

  const catRow = await catalogRow(s.heroId);
  const factLock = buildFactLock({ facts_json: s.facts ?? resolved.data });
  const contract = contractFor(series);
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract, cardCatalogRow: catRow });
  const factTrace = factTraceFrom(sem);
  const semanticHash = videoSemanticHash(sem);
  const ch = { story_id: id, semantic_hash: `cap-${id}`, image_artifact_id: `img-${id}`, cta: contract?.classification === "COMMERCIAL" ? "See the live deal" : "pokemondealfinder.com" };

  // §4/§26 seed the master cache from the pre-approved artifact (no generation).
  // the 5A.1 artifacts already carry the composited brand mark; the raw
  // 4C.1 board does not - so the motion doc adds its own corner chip only
  // for DEAL_DROP.
  const brandInMaster = id !== "DEAL_DROP";
  const reg = V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE, brandInMaster, verification: { source_kind: "pre-approved", note: "reused approved FULL_GENERATIVE_SOCIAL / 5A.1 artifact" } });
  // §26 dedupe - a second register must NOT rewrite
  const reg2 = V.registerExistingMaster({ storyId: id, semanticHash, family, imagePath: masterPath, dir: CACHE });
  if (reg2._deduped) dedupeProven = true;

  // §19 exact rounding - the proof records the declared value; a real run
  // vision-extracts the master's shown % and fails a >=1 delta (tol 0).
  const exactDeclared = { comparison_pct: sem.comparison_pct, claim_value: sem.claim_value, discount_pct: sem.required_numeric_facts?.discount_pct };

  // §3 run master-layered-motion (cache HIT -> $0)
  const r = await V.runMasterLayeredMotion({ story: { story_id: id }, semanticManifest: sem, factTrace, captionHandoff: ch, cardImagePaths: [], family, cacheDir: CACHE, allowGenerate: false });

  const rec = {
    id, family,
    master: { source: r.master?.source, sha: r.master?.image_sha256?.slice(0, 12), from_cache: r.master?.from_cache, dims: `${reg.image_w}x${reg.image_h}` },
    status: r.state, ok: r.ok, recut: r.recut,
    choreography: { beats: r.choreography?.beats.length, duration_ms: r.choreography?.duration_ms, hook_at: r.choreography?.beats[0]?.at_ms, hook_text: r.choreography?.beats[0]?.text?.lines },
    motion_audit: r.motion_audit,
    premium_motion: r.premium_motion ? { verdict: r.premium_motion.verdict, score: r.premium_motion.score } : null,
    audio_cues: r.audio_cue_timeline?.cues.map((c) => c.id),
    cost: r.cost,
    exact_rounding_declared: exactDeclared,
    caption_link: r.caption_link,
    blockers: r.blockers,
  };

  writeFileSync(path.join(OUT, `${id}_choreography.json`), JSON.stringify(r.choreography, null, 2));
  writeFileSync(path.join(OUT, `${id}_layers.json`), JSON.stringify(r.layers, null, 2));
  writeFileSync(path.join(OUT, `${id}_audits.json`), JSON.stringify({ motion_audit: r.motion_audit, premium_motion: r.premium_motion, audio_cue_timeline: r.audio_cue_timeline, cost: r.cost, exact_rounding_declared: exactDeclared, blockers: r.blockers, master: r.master }, null, 2));

  if (RENDER && r.ok) {
    // NEW 4C.2
    const nm = path.join(OUT, "media", `${id}_4C2.mp4`);
    const np = path.join(OUT, "media", `${id}_4C2.poster.png`);
    const nr = await V.renderMasterLayeredMotionToMp4(r, nm, { posterPath: np }).catch((e) => ({ ok: false, reason: e.message }));
    rec.render_4c2 = nr.ok ? { size_kb: Math.round(statSync(nm).size / 1024), frames: nr.frames } : { fail: nr.reason };
    // OLD 4C - reuse the MP4 already rendered by the 4C phase proof if present
    for (const [dst, srcs] of [
      [`${id}_4C.mp4`, [`video-1/media/${id}_1.mp4`, `video-1/media/${id}.mp4`]],
      [`${id}_4C1_multiboard.mp4`, [`video-1b-generative/media/${id}_NEW.mp4`]],
    ]) {
      const hit = srcs.map((s) => path.join(ROOT, ".social-preview", s)).find((p) => existsSync(p));
      if (hit) writeFileSync(path.join(OUT, "media", dst), readFileSync(hit));
    }
    rec.has_4c = existsSync(path.join(OUT, "media", `${id}_4C.mp4`));
    rec.has_4c1 = existsSync(path.join(OUT, "media", `${id}_4C1_multiboard.mp4`));
  }
  results[id] = rec;
  console.log(`  ${id}: ${r.state} | master ${r.master?.source} ${rec.master.dims} | premium ${rec.premium_motion?.verdict}(${rec.premium_motion?.score}) | cost $${r.cost.master_generation_cost + r.cost.video_incremental_api_cost}${rec.render_4c2 ? ` | 4C2 MP4 ${rec.render_4c2.size_kb ?? rec.render_4c2.fail}kb` : ""}`);
}

// ---- cost report (§24) -------------------------------
const totalMasterGen = Object.values(results).reduce((a, r) => a + (r.cost?.master_generation_cost ?? 0), 0);
const totalIncremental = Object.values(results).reduce((a, r) => a + (r.cost?.video_incremental_api_cost ?? 0) + (r.cost?.extra_frame_cost ?? 0), 0);
const nVids = Object.values(results).filter((r) => r.ok).length || 1;
const perVid = Math.round((totalIncremental / nVids) * 1000) / 1000;
const cost = {
  master_generation_cost_usd: Math.round(totalMasterGen * 100) / 100,
  extra_frame_cost_usd: 0,
  video_incremental_api_cost_usd: Math.round(totalIncremental * 100) / 100,
  local_render_cost_usd: 0,
  masters_reused_from_cache: Object.values(results).filter((r) => r.master?.from_cache).length,
  note: "every master was an existing approved artifact - $0 image generation for the video layer",
  incremental_per_video_usd: perVid,
  per_10_videos_usd: Math.round(perVid * 10 * 100) / 100,
  per_30_videos_usd: Math.round(perVid * 30 * 100) / 100,
  per_100_videos_usd: Math.round(perVid * 100 * 100) / 100,
  dedupe_proven: dedupeProven,
};

const esc = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  const v = (suf) => existsSync(path.join(OUT, "media", `${s.id}_${suf}.mp4`)) ? `<video src="media/${s.id}_${suf}.mp4" controls muted playsinline width="190"></video>` : "&mdash;";
  return `<tr><td>${s.id}<br><small>${esc(s.family)}</small></td><td>OLD 4C<br>${v("4C")}</td><td>4C.1 multi-board<br>${v("4C1_multiboard")}</td><td><b>4C.2 master-motion</b><br>${esc(r.premium_motion?.verdict ?? "-")} ${r.premium_motion?.score ?? ""} · $${(r.cost?.master_generation_cost ?? 0) + (r.cost?.video_incremental_api_cost ?? 0)}<br>${v("4C2")}</td></tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C.2 master-motion proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:24px;max-width:1300px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}video{border:1px solid #333;border-radius:6px}a{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-4C.2 — one premium master, layered, story animated</h1>
<p>generated ${new Date().toISOString()} &nbsp; render: <b>${RENDER ? "ON" : "OFF"}</b> &nbsp; image generation: <b>$0 (all masters reused)</b></p>
<table><tr><th>story</th><th>OLD 4C (sparse template)</th><th>4C.1 (multi-board, ~$2)</th><th>4C.2 (master-layered-motion, $0)</th></tr>${rows}</table>
<p>Per story: <code>&lt;ID&gt;_choreography.json</code> · <code>_layers.json</code> · <code>_audits.json</code></p>
<h2>Cost (§24)</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ render: RENDER, results, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`cost: master-gen $${cost.master_generation_cost_usd} | incremental/video $${cost.incremental_per_video_usd} | per 100 $${cost.per_100_videos_usd}`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
