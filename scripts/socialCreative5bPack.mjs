#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-5B (§25, §26) - FACT-LOCKED PLATFORM CAPTION
// DIRECTOR proof pack.
//
//   node scripts/socialCreative5bPack.mjs          deterministic - brief + prompt + audit gates, no OpenAI
//   node scripts/socialCreative5bPack.mjs --ai     generate + audit real captions for each available story
//
// Real approved stories: DEAL_DROP / MARKET_SNAPSHOT / ASKING_VS_SOLD /
// PRINTING_COMPARE (only if printing identity proof passes) /
// THREE_UNDER_25 (only if inventory supports). Read-only DB. Nothing is
// published, no Buffer, no cron, no eBay Browse, no email.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-5b-captions");
const AI = process.argv.slice(2).includes("--ai");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { buildSemanticManifest } = await import("../lib/newsroom/hybrid/semanticManifest.mjs");
const { provePrintingPair } = await import("../lib/newsroom/hybrid/printingIdentity.mjs");
const { newBudget, costReport } = await import("../lib/newsroom/hybrid/budget.mjs");
const CD = await import("../lib/newsroom/captions/captionDirector.mjs");
const { auditCaption } = await import("../lib/newsroom/captions/captionAudit.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");

const key = process.env.SOCIAL_CAPTION_API_KEY || process.env.OPENAI_API_KEY;
const db = supabaseAdmin();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log(`=== SOCIAL-CREATIVE-5B caption director proof ===`);
console.log(`generate: ${AI ? "ON" : "OFF"}   key: ${key ? "present" : "ABSENT"}\n`);

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data, error } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  if (error) console.warn(`  catalogRow(${id}): ${error.message}`);
  return data ?? null;
}
function factTraceFrom(sem) {
  const rows = [];
  const md = sem.card_metadata_lock ?? {};
  for (const k of md._displayable ?? []) rows.push({ visible_claim: `${k}: ${md[k]}`, expected_value: md[k], source_type: "CARD_CATALOG", verdict: "PASS" });
  for (const t of sem.required_text ?? []) rows.push({ visible_claim: t, expected_value: t, source_type: /^\$|%/.test(t) ? "DERIVED_CALCULATION" : "EDITORIAL_LABEL", verdict: "PASS" });
  for (const p of sem.visualization_data_manifest?.allowed_points ?? []) rows.push({ visible_claim: `chart ${p.label}`, expected_value: `${p.value}%`, source_type: "DERIVED_CALCULATION", verdict: "PASS" });
  if (sem.comparison_direction && sem.comparison_direction !== "UNKNOWN") rows.push({ visible_claim: `${sem.comparison_left?.text} vs ${sem.comparison_right?.text}`, expected_value: `${sem.comparison_direction} ${sem.comparison_pct}%`, source_type: "DERIVED_CALCULATION", verdict: "PASS" });
  return rows;
}

const budgets = [];
const stories = [];

// ---- gather the real approved stories --------------------
async function pushStory(id, family, series, resolved, extra = {}) {
  if (!resolved?.ok) { stories.push({ id, family, status: `WITHHELD: ${resolved?.reason ?? "no data"}` }); return; }
  const d = resolved.data;
  const heroId = extra.heroId ?? d.tcgplayerId ?? d.featured?.tcgplayerId ?? d.high?.tcgplayerId ?? d.items?.[0]?.tcgplayerId ?? null;
  const catRow = await catalogRow(heroId);
  const factLock = buildFactLock({ facts_json: extra.facts ?? d });
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract: contractFor(series), printingProof: extra.printingProof ?? null, cardCatalogRow: catRow });
  stories.push({ id, family, series, resolved, sem, catRow, factTrace: factTraceFrom(sem), status: "READY" });
}

const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
await pushStory("ASKING_VS_SOLD", "asking_vs_sold", "WHY_SOLD_PRICES_MATTER", aRes, {
  facts: aRes.ok ? { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd } : {},
});

const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));
await pushStory("MARKET_SNAPSHOT", "market_shape", "MARKET_SNAPSHOT", mRes, {
  heroId: mRes.ok ? mRes.data.featured?.tcgplayerId : null,
  facts: mRes.ok ? { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name } : {},
});

const dRes = await MD.resolveDealHeroSamples({ n: 1 }).catch((e) => ({ ok: false, reason: e.message }));
const deal = dRes?.ok && Array.isArray(dRes.data?.items) ? dRes.data.items[0] : null;
if (deal) {
  const listed = Number(deal.price_usd);
  const market = Number(deal.market_ref_usd);
  const pct = deal.gap_pct ?? Math.round((1 - listed / market) * 100);
  const dd = { ok: true, data: { card: { name: deal.card_name, set: deal.card_set, tcgplayerId: deal.tcgplayerId }, card_name: deal.card_name, card_set: deal.card_set, priceUsd: listed, marketUsd: market, discountPct: pct } };
  await pushStory("DEAL_DROP", "deal_hero", "DEAL_DROP", dd, {
    heroId: deal.tcgplayerId,
    facts: { card_name: deal.card_name, card_set: deal.card_set, card_tcgplayer_id: deal.tcgplayerId, listed_price: listed, market_price: market, discount_pct: pct },
  });
} else stories.push({ id: "DEAL_DROP", family: "deal_hero", status: `WITHHELD: ${dRes?.reason ?? "no fresh BIN sample"}` });

async function artPath(id, row) {
  const r = await resolveCardArtwork({ card_tcgplayer_id: String(id), card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null }).catch(() => ({ status: "unavailable" }));
  return r.status === "ready" ? path.resolve(r.localPath) : null;
}
const pRes = await MD.resolvePrintingPair().catch((e) => ({ ok: false, reason: e.message }));
if (pRes?.ok) {
  const [rowH, rowL] = await Promise.all([catalogRow(pRes.data.high.tcgplayerId), catalogRow(pRes.data.low.tcgplayerId)]);
  const [pathH, pathL] = await Promise.all([artPath(pRes.data.high.tcgplayerId, rowH), artPath(pRes.data.low.tcgplayerId, rowL)]);
  const pp = provePrintingPair({ high: pRes.data.high, low: pRes.data.low, cardImagePaths: [pathH, pathL].filter(Boolean) });
  if (pp.ok) await pushStory("PRINTING_COMPARE", "printing_compare", "EXACT_PRINTING_MATTERS", pRes, { heroId: pRes.data.high.tcgplayerId, printingProof: pp.proof });
  else stories.push({ id: "PRINTING_COMPARE", family: "printing_compare", status: `WITHHELD: printing identity proof failed (${pp.reason})` });
} else stories.push({ id: "PRINTING_COMPARE", family: "printing_compare", status: `WITHHELD: ${pRes?.reason ?? "no pair"}` });

const tRes = await MD.resolveThreeUnder().catch((e) => ({ ok: false, reason: e.message }));
await pushStory("THREE_UNDER_25", "three_up", "THREE_UNDER_25", tRes, {
  heroId: tRes.ok ? tRes.data.items?.[0]?.tcgplayerId : null,
  facts: tRes.ok ? { percentages: [] } : {},
});

// ---- run the caption director per available story --------
const results = {};
for (const s of stories) {
  if (s.status !== "READY") { console.log(`${s.id}: ${s.status}`); results[s.id] = { status: s.status }; continue; }
  console.log(`\n${s.id} (${s.family}) - direction ${s.sem.comparison_direction ?? "n/a"} / scope ${s.sem.claim_scope ?? "n/a"}`);
  const brief = CD.buildCaptionBrief({ story: { story_id: `5b-${s.id}`, series: s.series }, semanticManifest: s.sem, factTrace: s.factTrace, cardCatalogRow: s.catRow, family: s.family });
  const prompt = CD.buildCaptionPrompt({ brief });
  writeFileSync(path.join(OUT, `${s.id}_prompt.txt`), prompt);
  writeFileSync(path.join(OUT, `${s.id}_brief.json`), JSON.stringify(brief, null, 2));

  if (AI && key) {
    const b = newBudget(); b.limits.creative_director_calls = 2; budgets.push(b);
    const r = await CD.runCaptionDirector({
      story: { story_id: `5b-${s.id}`, series: s.series }, semanticManifest: s.sem, factTrace: s.factTrace,
      cardCatalogRow: s.catRow, family: s.family, imageArtifactId: `img-5b-${s.id}`, budget: b, env: process.env,
    }).catch((e) => ({ ok: false, state: "ERR", reason: e.message }));
    const out = {
      status: r.state ?? (r.ok ? "CAPTIONS_READY" : "CAPTION_WITHHELD"),
      instagram: r.instagram, x: r.x,
      caption_handoff: r.caption_handoff,
      shared: r.shared ? { model: r.shared.model, semantic_scope: r.shared.semantic_scope, required_takeaway: r.shared.required_takeaway, fact_refs: r.shared.fact_refs, source_refs: r.shared.source_refs, prohibited_takeaways: r.shared.prohibited_takeaways } : null,
    };
    writeFileSync(path.join(OUT, `${s.id}_captions.json`), JSON.stringify(out, null, 2));
    results[s.id] = { status: out.status, ig: r.instagram?.status, x: r.x?.status, ig_q: r.instagram?.quality_score, x_q: r.x?.quality_score };
    console.log(`  IG: ${r.instagram?.status} (q${r.instagram?.quality_score})   X: ${r.x?.status} (q${r.x?.quality_score})`);
    if (r.instagram?.status === "READY") console.log(`  IG hook: ${r.instagram.hook}`);
    if (r.x?.status === "READY") console.log(`  X: ${r.x.caption_text?.split("\n")[0]}`);
  } else {
    results[s.id] = { status: "brief+prompt only (--ai off)" };
    console.log(`  brief + prompt written (--ai off)`);
  }
}

// ---- §26 regression: the old bad X caption --------------
const regr = auditCaption({
  parts: { hook: "EXACT PRINTING MATTERS", body: "Check out this Pokemon card.", cta: "See it" },
  family: "printing_compare", platform: "x",
  semanticManifest: { layout: "printing_compare", comparison_direction: "UNKNOWN" },
});
writeFileSync(path.join(OUT, "REGRESSION_exact_printing_matters.json"), JSON.stringify({ input_x_caption: "EXACT PRINTING MATTERS", result_state: regr.state, ok: regr.ok, findings: regr.findings }, null, 2));
console.log(`\nREGRESSION "EXACT PRINTING MATTERS" -> ${regr.state} (expected RAW_SERIES_CAPTION_FAIL)`);

// ---- pack index ----------------------------------------
const cost = costReport(budgets);
const esc = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  return `<tr><td>${s.id}</td><td>${esc(s.family)}</td><td>${esc(r.status ?? s.status)}</td><td>${esc(r.ig ?? "-")} / q${esc(r.ig_q ?? "-")}</td><td>${esc(r.x ?? "-")} / q${esc(r.x_q ?? "-")}</td></tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>5B caption proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:28px;max-width:1100px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:6px 10px;text-align:left}a{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-5B - fact-locked platform caption director</h1>
<p>generated ${new Date().toISOString()} &nbsp; --ai: <b>${AI ? "ON" : "OFF"}</b></p>
<table><tr><th>story</th><th>family</th><th>status</th><th>IG</th><th>X</th></tr>${rows}</table>
<p>Per story: <code>&lt;ID&gt;_brief.json</code> / <code>&lt;ID&gt;_prompt.txt</code>${AI ? " / <code>&lt;ID&gt;_captions.json</code>" : ""}</p>
<p>Regression: <a href="REGRESSION_exact_printing_matters.json">REGRESSION_exact_printing_matters.json</a> &rarr; <b>${esc(regr.state)}</b></p>
<h2>Cost</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, results, regression: regr.state, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
