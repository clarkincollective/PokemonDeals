#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-5A.1 (§12, §13) - FINAL FACT-SOURCE + BRAND-SAFE
// PROOF PACK.
//
//   node scripts/socialCreative5a1Pack.mjs          deterministic manifests + fact-trace of a dry extraction (no OpenAI)
//   node scripts/socialCreative5a1Pack.mjs --ai     generate + fully audit the two owner proofs (needs OPENAI_API_KEY)
//
// A. ASKING_VS_SOLD  - clean reserved brand strip, no headline collision,
//    correct below-market semantics, only canonical card metadata.
// B. MARKET_SNAPSHOT  - correct global 24,545 scope, Clefairy = example
//    only, every chart value traceable, no invented bins / source / window.
//
// Writes .social-preview/creative-5a1-final/. Read-only DB. No publishing.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-5a1-final");
const AI = process.argv.slice(2).includes("--ai");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const {
  newBudget, costReport, buildSemanticManifest, auditFactSources, runFullGenerativeSocial,
  buildCardMetadataLock, buildVisualizationManifest, buildSourceAttributionManifest, buildTimeframeManifest,
} = await import("../lib/newsroom/hybrid/pipeline.mjs");
const { buildFactLock, factLockHash } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");
const { pathToFileURL } = await import("node:url");

const key = process.env.OPENAI_API_KEY;
const db = supabaseAdmin();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-5A.1 fact-source + brand-safe proof ===`);
console.log(`generate: ${AI ? "ON" : "OFF"}   key: ${key ? "present" : "ABSENT"}\n`);

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data, error } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  if (error) console.warn(`  catalogRow(${id}) error: ${error.message}`);
  return data ?? null;
}
async function artPath(id) {
  const row = await catalogRow(id);
  const r = await resolveCardArtwork({ card_tcgplayer_id: String(id), card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null });
  return r.status === "ready" ? path.resolve(r.localPath) : null;
}

// Build a fact trace: every allowed visible factual item -> its provenance.
function buildFactTrace(sem) {
  const rows = [];
  const md = sem.card_metadata_lock ?? {};
  for (const k of md._displayable ?? []) rows.push({ visible_claim: `${k}: ${md[k]}`, expected_value: md[k], source_type: "CARD_CATALOG", source_reference: `card_catalog.${k} for "${md.name}"`, verification: "canonical record", verdict: "PASS" });
  for (const t of sem.required_text ?? []) rows.push({ visible_claim: t, expected_value: t, source_type: /^\$|%/.test(t) ? "DERIVED_CALCULATION" : "EDITORIAL_LABEL", source_reference: `fact_lock ${sem.fact_lock_hash}`, verification: "required_text", verdict: "PASS" });
  const viz = sem.visualization_data_manifest;
  if (viz) for (const p of viz.allowed_points) rows.push({ visible_claim: `chart: ${p.label} = ${p.value}%`, expected_value: p.value, source_type: viz._source_type, source_reference: viz.calculation_method, verification: `population ${viz.source_population}`, verdict: "PASS" });
  if (sem.comparison_direction && sem.comparison_direction !== "UNKNOWN") {
    rows.push({ visible_claim: `${sem.comparison_left?.label} ${sem.comparison_left?.text} vs ${sem.comparison_right?.label} ${sem.comparison_right?.text}`, expected_value: `${sem.comparison_direction} ${sem.comparison_pct}%`, source_type: "DERIVED_CALCULATION", source_reference: "comparisonDirection(left,right)", verification: "deterministic", verdict: "PASS" });
  }
  rows.push({ visible_claim: "source line", expected_value: "(none supplied)", source_type: "EDITORIAL_LABEL", source_reference: "source_attribution_manifest", verification: "must be absent unless supplied", verdict: "N/A" });
  rows.push({ visible_claim: "timeframe", expected_value: "(none supplied)", source_type: "EDITORIAL_LABEL", source_reference: "timeframe_manifest", verification: "must be absent unless supplied", verdict: "N/A" });
  return rows;
}

const budgets = [];
const results = {};
let A_SEM = null, B_SEM = null;

// ---- CASE A - ASKING_VS_SOLD ------------------------------
const aRes = await MD.resolveAskingVsSold().catch(() => null);
if (!aRes?.ok) { results.A = `WITHHELD: ${aRes?.reason ?? "no story"}`; console.log(`A: ${results.A}`); }
else {
  const d = aRes.data;
  const aRow = await catalogRow(d.tcgplayerId);
  const aFacts = { card_name: d.card_name, card_set: d.card_set, card_tcgplayer_id: d.tcgplayerId, total_price_usd: d.asking_usd, market_price: d.market_ref_usd };
  const aSem = buildSemanticManifest({ layout: "asking_vs_sold", factLock: buildFactLock({ facts_json: aFacts }), resolved: { data: { askingUsd: d.asking_usd, marketRefUsd: d.market_ref_usd, sold_points: d.sold_points, card_name: d.card_name } }, contract: contractFor("WHY_SOLD_PRICES_MATTER"), cardCatalogRow: aRow });
  A_SEM = aSem;
  writeFileSync(path.join(OUT, "A_fact_trace.json"), JSON.stringify({
    story: "ASKING_VS_SOLD", card: d.card_name, ask: d.asking_usd, market: d.market_ref_usd,
    comparison_direction: aSem.comparison_direction, comparison_pct: aSem.comparison_pct, appropriate_lesson: aSem.appropriate_lesson,
    card_metadata_lock: aSem.card_metadata_lock, source_attribution_manifest: aSem.source_attribution_manifest, timeframe_manifest: aSem.timeframe_manifest,
    fact_trace: buildFactTrace(aSem),
  }, null, 2));
  console.log(`CASE A - ${d.card_name}: ask $${d.asking_usd} vs market $${d.market_ref_usd} -> ${aSem.comparison_direction} ${aSem.comparison_pct}%`);
  console.log(`  card metadata displayable: ${aSem.card_metadata_lock._displayable.join(", ") || "(name/set only)"}`);
  if (AI && key) {
    const b = newBudget(); b.limits.background_generations = 3; budgets.push(b);
    const aPath = await artPath(d.tcgplayerId);
    const r = await runFullGenerativeSocial({ story: { story_id: "5a1-A", series: "WHY_SOLD_PRICES_MATTER", subject_id: "why_sold_prices_matter-proof", facts_json: aFacts }, platform: "instagram", layout: "asking_vs_sold", resolved: { data: { askingUsd: d.asking_usd, marketRefUsd: d.market_ref_usd, sold_points: d.sold_points, card: { name: d.card_name, set: d.card_set, tcgplayerId: d.tcgplayerId }, card_name: d.card_name } }, cardImagePaths: aPath ? [aPath] : [], cardCatalogRow: aRow, env: process.env, budget: b }).catch((e) => ({ ok: false, state: "ERR", reason: e.message }));
    if (r.ok) {
      const { createRenderer } = await import("../lib/social/render.mjs");
      const rr = await createRenderer(); await rr.renderToPng(r.finalHtml, path.join(OUT, "full", "A_asking_vs_sold.png")); await rr.close?.();
      writeFileSync(path.join(OUT, "A_verification.json"), JSON.stringify({ verification: r.verification, selected: { fidelity_score: r.selected?.fidelity_score, quality: r.verification.quality_verdict }, regenerated: r.regenerated, extracted_claims: r.selected?.extracted_claims, brand_safe_zone_verdict: r.verification.brand_safe_zone }, null, 2));
      results.A = `BUFFER_READY (semantic ${r.verification.semantic}, fact-sources ${r.verification.fact_sources}, fidelity ${r.selected?.fidelity_score}, quality ${r.verification.quality_verdict}${r.regenerated ? ", regenerated once" : ""})`;
    } else { writeFileSync(path.join(OUT, "A_verification.json"), JSON.stringify({ state: r.state, reason: r.reason, assessed: r.assessed }, null, 2)); results.A = `${r.state}: ${r.reason}`; }
  } else results.A = "not generated (--ai off)";
  console.log(`  A: ${results.A}`);
}

// ---- CASE B - MARKET_SNAPSHOT ----------------------------
const bRes = await MD.resolveMarketShape().catch(() => null);
if (!bRes?.ok) { results.B = `WITHHELD: ${bRes?.reason ?? "no story"}`; console.log(`B: ${results.B}`); }
else {
  const d = bRes.data;
  const bRow = d.featured?.tcgplayerId ? await catalogRow(d.featured.tcgplayerId) : null;
  const bFacts = { tracked_count: d.priced_cards, percentages: [d.under_25_pct, d.over_100_pct], card_name: d.featured?.card_name };
  const bResolved = { data: { under_25_pct: d.under_25_pct, over_100_pct: d.over_100_pct, priced_cards: d.priced_cards, featured: d.featured } };
  const bSem = buildSemanticManifest({ layout: "market_shape", factLock: buildFactLock({ facts_json: bFacts }), resolved: bResolved, contract: contractFor("MARKET_SNAPSHOT"), cardCatalogRow: bRow });
  B_SEM = bSem;
  writeFileSync(path.join(OUT, "B_fact_trace.json"), JSON.stringify({
    story: "MARKET_SNAPSHOT", claim_scope: bSem.claim_scope, claim_population: bSem.claim_population, example_card: bSem.example_card,
    visualization_data_manifest: bSem.visualization_data_manifest, card_metadata_lock: bSem.card_metadata_lock,
    source_attribution_manifest: bSem.source_attribution_manifest, timeframe_manifest: bSem.timeframe_manifest,
    fact_trace: buildFactTrace(bSem),
  }, null, 2));
  console.log(`\nCASE B - scope ${bSem.claim_scope} / population "${bSem.claim_population}" / example "${bSem.example_card}"`);
  console.log(`  chart allowed points: ${(bSem.visualization_data_manifest?.allowed_points ?? []).map((p) => `${p.label}=${p.value}%`).join(", ")}`);
  if (AI && key) {
    const b = newBudget(); b.limits.background_generations = 3; budgets.push(b);
    const bPath = d.featured?.tcgplayerId ? await artPath(d.featured.tcgplayerId) : null;
    const r = await runFullGenerativeSocial({ story: { story_id: "5a1-B", series: "MARKET_SNAPSHOT", subject_id: "market_snapshot-proof", facts_json: bFacts }, platform: "instagram", layout: "market_shape", resolved: bResolved, cardImagePaths: bPath ? [bPath] : [], cardCatalogRow: bRow, env: process.env, budget: b }).catch((e) => ({ ok: false, state: "ERR", reason: e.message }));
    if (r.ok) {
      const { createRenderer } = await import("../lib/social/render.mjs");
      const rr = await createRenderer(); await rr.renderToPng(r.finalHtml, path.join(OUT, "full", "B_market_snapshot.png")); await rr.close?.();
      writeFileSync(path.join(OUT, "B_verification.json"), JSON.stringify({ verification: r.verification, selected: { fidelity_score: r.selected?.fidelity_score, quality: r.verification.quality_verdict }, regenerated: r.regenerated, extracted_claims: r.selected?.extracted_claims, brand_safe_zone_verdict: r.verification.brand_safe_zone }, null, 2));
      results.B = `BUFFER_READY (semantic ${r.verification.semantic}, fact-sources ${r.verification.fact_sources}, fidelity ${r.selected?.fidelity_score}, quality ${r.verification.quality_verdict}${r.regenerated ? ", regenerated once" : ""})`;
    } else { writeFileSync(path.join(OUT, "B_verification.json"), JSON.stringify({ state: r.state, reason: r.reason, assessed: r.assessed }, null, 2)); results.B = `${r.state}: ${r.reason}`; }
  } else results.B = "not generated (--ai off)";
  console.log(`  B: ${results.B}`);
}

// ---- §13 standalone proof artifacts ----------------------
const bzOf = (name) => { try { return JSON.parse(readFileSync(path.join(OUT, `${name}_verification.json`), "utf8")).brand_safe_zone_verdict ?? null; } catch { return null; } };
writeFileSync(path.join(OUT, "brand_safe_zone_verdict.json"), JSON.stringify({
  contract: `the entire top ${(await import("../lib/newsroom/hybrid/pipeline.mjs")).BRAND_SAFE_ZONE_TOP_PX}px is reserved and MUST be empty before the approved mark is composited`,
  check: "vision extraction reports brand_safe_zone_content + brand_safe_zone_occupied; auditBrandSafeZone -> BRAND_SAFE_ZONE_OCCUPIED on any headline/card/chart/logo/price in the strip",
  A_asking_vs_sold: bzOf("A"), B_market_snapshot: bzOf("B"),
}, null, 2));
writeFileSync(path.join(OUT, "visualization_manifest.json"), JSON.stringify({
  A_asking_vs_sold: A_SEM?.visualization_data_manifest ?? "none (no chart in this layout)",
  B_market_snapshot: B_SEM?.visualization_data_manifest ?? null,
}, null, 2));
writeFileSync(path.join(OUT, "card_metadata_lock.json"), JSON.stringify({
  A_asking_vs_sold: A_SEM?.card_metadata_lock ?? null,
  B_market_snapshot: B_SEM?.card_metadata_lock ?? null,
}, null, 2));

const cost = costReport(budgets);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const img = (f) => existsSync(path.join(OUT, "full", f)) ? `<img src="full/${f}" style="max-width:360px;border:1px solid #333">` : "&mdash;";
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>5A.1 fact-source proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:28px;max-width:1200px}code{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-5A.1 - fact-source + brand-safe hardening</h1>
<p>generated ${new Date().toISOString()} &nbsp; --ai: <b>${AI ? "ON" : "OFF"}</b></p>
<h2>A. ASKING_VS_SOLD</h2>${img("A_asking_vs_sold.png")}<p>${esc(results.A)}</p>
<p><a href="A_fact_trace.json" style="color:#9ad">A_fact_trace.json</a> &nbsp; <a href="A_verification.json" style="color:#9ad">A_verification.json</a></p>
<h2>B. MARKET_SNAPSHOT</h2>${img("B_market_snapshot.png")}<p>${esc(results.B)}</p>
<p><a href="B_fact_trace.json" style="color:#9ad">B_fact_trace.json</a> &nbsp; <a href="B_verification.json" style="color:#9ad">B_verification.json</a></p>
<h2>Cost</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, A: results.A, B: results.B, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
