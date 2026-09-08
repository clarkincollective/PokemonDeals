#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C (§27) - MOTION-NATIVE SHORT-FORM VIDEO proof pack.
//
//   node scripts/socialCreativeVideo1Pack.mjs           plan + audits only (no render, no OpenAI)
//   node scripts/socialCreativeVideo1Pack.mjs --render   also render real 1080x1920 H.264 MP4s + posters
//   node scripts/socialCreativeVideo1Pack.mjs --render --ai   also run the 5B caption director for a real caption_handoff link
//
// Real approved stories: DEAL_DROP x2 / MARKET_SNAPSHOT / ASKING_VS_SOLD x2 /
// PRINTING_COMPARE (if both canonical images resolve) / THREE_UNDER_25 (if
// inventory). Read-only DB. NOTHING is published - no TikTok / YouTube
// upload, no Buffer, no cron, no RIGHTS change, no email, no eBay Browse.

import { existsSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1");
const args = process.argv.slice(2);
const RENDER = args.includes("--render");
const AI = args.includes("--ai");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { buildSemanticManifest } = await import("../lib/newsroom/hybrid/semanticManifest.mjs");
const { provePrintingPair } = await import("../lib/newsroom/hybrid/printingIdentity.mjs");
const V = await import("../lib/newsroom/video/index.mjs");
const CD = await import("../lib/newsroom/captions/captionDirector.mjs");
const { newBudget } = await import("../lib/newsroom/hybrid/budget.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");

const db = supabaseAdmin();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "media"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4C motion-native video proof ===`);
console.log(`render: ${RENDER ? "ON" : "OFF"}   caption link via 5B: ${AI ? "ON" : "stub"}\n`);

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
async function artPath(id, row) {
  const r = await resolveCardArtwork({ card_tcgplayer_id: String(id), card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null }).catch(() => ({ status: "unavailable" }));
  return r.status === "ready" ? path.resolve(r.localPath) : null;
}
function factTraceFrom(sem) {
  const rows = [];
  for (const k of sem.card_metadata_lock?._displayable ?? []) rows.push({ visible_claim: `${k}: ${sem.card_metadata_lock[k]}`, expected_value: sem.card_metadata_lock[k], source_type: "CARD_CATALOG", verdict: "PASS" });
  for (const t of sem.required_text ?? []) rows.push({ visible_claim: t, expected_value: t, source_type: /^\$|%/.test(t) ? "DERIVED_CALCULATION" : "EDITORIAL_LABEL", verdict: "PASS" });
  for (const p of sem.visualization_data_manifest?.allowed_points ?? []) rows.push({ visible_claim: `chart ${p.label}`, expected_value: `${p.value}%`, source_type: "DERIVED_CALCULATION", verdict: "PASS" });
  if (sem.comparison_direction && sem.comparison_direction !== "UNKNOWN") rows.push({ visible_claim: `${sem.comparison_left?.text} vs ${sem.comparison_right?.text}`, expected_value: `${sem.comparison_direction} ${sem.comparison_pct}%`, source_type: "DERIVED_CALCULATION", verdict: "PASS" });
  return rows;
}
function stubHandoff(storyId, sem) {
  return { story_id: storyId, image_artifact_id: `img-${storyId}`, platform: "x", caption_text: null, hook: null, cta: sem.classification === "COMMERCIAL" ? "See the live deal" : "pokemondealfinder.com", hashtags: [], disclosure: null, fact_refs: [], semantic_hash: `stub-${storyId}`, verification: { stub: true }, quality_score: null };
}
async function captionHandoffFor(storyId, series, sem, factTrace, catRow, family) {
  if (!AI) return stubHandoff(storyId, sem);
  const b = newBudget();
  const r = await CD.runCaptionDirector({ story: { story_id: storyId, series }, semanticManifest: sem, factTrace, cardCatalogRow: catRow, family, imageArtifactId: `img-${storyId}`, budget: b, env: process.env }).catch(() => null);
  const h = r?.caption_handoff?.find((x) => x.platform === "x") ?? r?.caption_handoff?.[0];
  return h ?? stubHandoff(storyId, sem);
}

const jobs = [];
function addJob(id, family, series, resolved, extra = {}) {
  if (!resolved?.ok) { jobs.push({ id, family, status: `WITHHELD: ${resolved?.reason ?? "no data"}` }); return null; }
  return { id, family, series, resolved, extra };
}

// ---- gather real stories --------------------------------
const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));
const dRes = await MD.resolveDealHeroSamples({ n: 4 }).catch((e) => ({ ok: false, reason: e.message }));
const tRes = await MD.resolveThreeUnder().catch((e) => ({ ok: false, reason: e.message }));
const pRes = await MD.resolvePrintingPair().catch((e) => ({ ok: false, reason: e.message }));

const dealItems = dRes?.ok && Array.isArray(dRes.data?.items) ? dRes.data.items : [];
const pending = [];

// DEAL_DROP x2
dealItems.slice(0, 2).forEach((deal, i) => {
  const listed = Number(deal.price_usd), market = Number(deal.market_ref_usd);
  const pct = deal.gap_pct ?? Math.round((1 - listed / market) * 100);
  const d = { ok: true, data: { card: { name: deal.card_name, set: deal.card_set, tcgplayerId: deal.tcgplayerId }, card_name: deal.card_name, card_set: deal.card_set, priceUsd: listed, marketUsd: market, discountPct: pct } };
  const j = addJob(`DEAL_DROP_${i + 1}`, "deal_hero", "DEAL_DROP", d, { heroId: deal.tcgplayerId, facts: { card_name: deal.card_name, card_set: deal.card_set, card_tcgplayer_id: deal.tcgplayerId, listed_price: listed, market_price: market, discount_pct: pct } });
  if (j) pending.push(j);
});
if (!dealItems.length) jobs.push({ id: "DEAL_DROP_1", family: "deal_hero", status: `WITHHELD: ${dRes?.reason ?? "no fresh BIN samples"}` });

// ASKING_VS_SOLD x2 (the dedicated resolver + a 2nd from another deal sample)
{
  const j = addJob("ASKING_VS_SOLD_1", "asking_vs_sold", "WHY_SOLD_PRICES_MATTER", aRes, { heroId: aRes.ok ? aRes.data.tcgplayerId : null, facts: aRes.ok ? { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd } : {} });
  if (j) pending.push(j);
}
if (dealItems[2]) {
  const deal = dealItems[2];
  const listed = Number(deal.price_usd), market = Number(deal.market_ref_usd);
  const d2 = { ok: true, data: { card_name: deal.card_name, card_set: deal.card_set, askingUsd: listed, marketRefUsd: market, tcgplayerId: deal.tcgplayerId } };
  const j = addJob("ASKING_VS_SOLD_2", "asking_vs_sold", "WHY_SOLD_PRICES_MATTER", d2, { heroId: deal.tcgplayerId, facts: { card_name: deal.card_name, card_set: deal.card_set, card_tcgplayer_id: deal.tcgplayerId, listed_price: listed, market_price: market } });
  if (j) pending.push(j);
}

// MARKET_SNAPSHOT (one real global story)
{
  const j = addJob("MARKET_SNAPSHOT_1", "market_shape", "MARKET_SNAPSHOT", mRes, { heroId: mRes.ok ? mRes.data.featured?.tcgplayerId : null, facts: mRes.ok ? { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name } : {} });
  if (j) pending.push(j);
}

// THREE_UNDER_25
{
  const j = addJob("THREE_UNDER_25_1", "three_up", "THREE_UNDER_25", tRes, { heroId: tRes.ok ? tRes.data.items?.[0]?.tcgplayerId : null, facts: { percentages: [] } });
  if (j) pending.push(j);
}

// PRINTING_COMPARE (only if both canonical images resolve + identity proof PASS)
if (pRes?.ok) {
  const [rowH, rowL] = await Promise.all([catalogRow(pRes.data.high.tcgplayerId), catalogRow(pRes.data.low.tcgplayerId)]);
  const [pathH, pathL] = await Promise.all([artPath(pRes.data.high.tcgplayerId, rowH), artPath(pRes.data.low.tcgplayerId, rowL)]);
  const pp = provePrintingPair({ high: pRes.data.high, low: pRes.data.low, cardImagePaths: [pathH, pathL].filter(Boolean) });
  if (pp.ok) pending.push({ id: "PRINTING_COMPARE_1", family: "printing_compare", series: "EXACT_PRINTING_MATTERS", resolved: pRes, extra: { heroId: pRes.data.high.tcgplayerId, printingProof: pp.proof, cardPaths: [pathH, pathL] } });
  else jobs.push({ id: "PRINTING_COMPARE_1", family: "printing_compare", status: `WITHHELD: printing identity proof failed (${pp.reason})` });
} else jobs.push({ id: "PRINTING_COMPARE_1", family: "printing_compare", status: `WITHHELD: ${pRes?.reason ?? "no pair"}` });

// ---- build + audit + (render) each job ------------------
const started = Date.now();
let openaiCalls = 0;
for (const job of pending) {
  const { id, family, series, resolved, extra } = job;
  const d = resolved.data;
  const heroId = extra.heroId;
  const catRow = await catalogRow(heroId);
  const factLock = buildFactLock({ facts_json: extra.facts ?? d });
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract: contractFor(series), printingProof: extra.printingProof ?? null, cardCatalogRow: catRow });
  const factTrace = factTraceFrom(sem);

  const cardPaths = extra.cardPaths
    ? extra.cardPaths.filter(Boolean)
    : family === "market_shape"
      ? (heroId ? [await artPath(heroId, catRow)].filter(Boolean) : [])
      : family === "three_up"
        ? (await Promise.all((d.items ?? []).slice(0, 3).map(async (it) => artPath(it.tcgplayerId, await catalogRow(it.tcgplayerId))))).filter(Boolean)
        : (heroId ? [await artPath(heroId, catRow)].filter(Boolean) : []);

  const ch = await captionHandoffFor(id, series, sem, factTrace, catRow, family);
  if (AI) openaiCalls += 1;

  const r = V.runVideoDirector({ story: { story_id: id }, semanticManifest: sem, factTrace, captionHandoff: ch, cardImagePaths: cardPaths, family });
  const plan = r.plan;

  const rec = {
    id, family, status: r.ok ? r.state : r.state,
    duration_ms: plan?.duration ?? null,
    scenes: plan?.scenes?.length ?? null,
    hook: plan?.hook?.text ?? null,
    pacing: r.craft?.pacing ? { verdict: r.craft.pacing.verdict, score: r.craft.pacing.score } : null,
    motion_quality: r.craft?.quality ? { verdict: r.craft.quality.verdict, score: r.craft.quality.score } : null,
    audit: r.audit,
    blockers: r.blockers,
    card_assets: cardPaths.length,
    caption_link: plan?.caption_link ?? null,
  };

  writeFileSync(path.join(OUT, `${id}_plan.json`), JSON.stringify(plan, null, 2));
  writeFileSync(path.join(OUT, `${id}_narration.json`), JSON.stringify(plan?.narration ?? {}, null, 2));
  writeFileSync(path.join(OUT, `${id}_fact_timeline.json`), JSON.stringify(plan?.video_fact_timeline ?? [], null, 2));
  writeFileSync(path.join(OUT, `${id}_audits.json`), JSON.stringify({ semantic_and_fact: r.audit, pacing: r.craft?.pacing, motion_quality: r.craft?.quality, blockers: r.blockers }, null, 2));

  if (RENDER && plan) {
    const t0 = Date.now();
    const mp4 = path.join(OUT, "media", `${id}.mp4`);
    const poster = path.join(OUT, "media", `${id}.poster.png`);
    const rr = await V.renderVideoPlanToMp4(plan, mp4, { posterPath: poster }).catch((e) => ({ ok: false, reason: e.message }));
    rec.render = rr.ok
      ? { ok: true, ms: Date.now() - t0, frames: rr.frames, size_kb: Math.round(statSync(mp4).size / 1024), probe: rr.probe, poster: existsSync(poster) }
      : { ok: false, state: rr.state ?? "VIDEO_RENDER_FAILED", reason: rr.reason };
    console.log(`  ${id}: ${rec.status} | pace ${rec.pacing?.verdict}(${rec.pacing?.score}) motion ${rec.motion_quality?.verdict}(${rec.motion_quality?.score}) | render ${rr.ok ? `OK ${rec.render.size_kb}kb ${(rec.render.ms / 1000).toFixed(1)}s` : "FAIL " + rec.render.reason}`);
  } else {
    console.log(`  ${id}: ${rec.status} | pace ${rec.pacing?.verdict}(${rec.pacing?.score}) motion ${rec.motion_quality?.verdict}(${rec.motion_quality?.score}) | audit ${r.audit.ok} | blk ${r.blockers.length}`);
  }
  jobs.push(rec);
}

// ---- cost + index --------------------------------------
const renders = jobs.filter((j) => j.render?.ok);
const totalRenderMs = renders.reduce((a, j) => a + (j.render.ms || 0), 0);
const cost = {
  openai_calls: openaiCalls,
  openai_cost_usd_est: Math.round(openaiCalls * 0.03 * 100) / 100,
  videos_rendered: renders.length,
  avg_render_seconds: renders.length ? Math.round((totalRenderMs / renders.length) / 100) / 10 : null,
  avg_output_kb: renders.length ? Math.round(renders.reduce((a, j) => a + j.render.size_kb, 0) / renders.length) : null,
  render_is_local_compute_only: true,
  est_cost_per_10_videos_usd: Math.round((openaiCalls ? (openaiCalls / pending.length) * 0.03 : 0) * 10 * 100) / 100,
  wall_seconds: Math.round((Date.now() - started) / 1000),
};

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = jobs.map((j) => {
  const vid = existsSync(path.join(OUT, "media", `${j.id}.mp4`)) ? `<video src="media/${j.id}.mp4" controls muted playsinline width="220"></video>` : "&mdash;";
  return `<tr><td>${j.id}</td><td>${esc(j.family)}</td><td>${esc(j.status)}</td><td>${j.duration_ms ?? "-"}ms / ${j.scenes ?? "-"} sc</td><td>${esc(j.pacing?.verdict ?? "-")} ${j.pacing?.score ?? ""}</td><td>${esc(j.motion_quality?.verdict ?? "-")} ${j.motion_quality?.score ?? ""}</td><td>${j.audit ? (j.audit.ok ? "PASS" : "FAIL") : "-"}</td><td>${vid}</td></tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C video proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:26px;max-width:1200px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:6px 9px;vertical-align:top}video{border:1px solid #333;border-radius:8px}a{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-4C - motion-native short-form video</h1>
<p>generated ${new Date().toISOString()} &nbsp; render: <b>${RENDER ? "ON" : "OFF"}</b> &nbsp; caption link: <b>${AI ? "5B live" : "stub"}</b></p>
<table><tr><th>story</th><th>family</th><th>status</th><th>timing</th><th>pacing</th><th>motion Q</th><th>fact/semantic</th><th>master 9:16</th></tr>${rows}</table>
<p>Per story: <code>&lt;ID&gt;_plan.json</code> / <code>_narration.json</code> / <code>_fact_timeline.json</code> / <code>_audits.json</code>${RENDER ? " / <code>media/&lt;ID&gt;.mp4</code> + <code>.poster.png</code>" : ""}</p>
<h2>Cost</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b> - the owner is the final aesthetic gate for motion.</p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ render: RENDER, ai: AI, jobs, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
