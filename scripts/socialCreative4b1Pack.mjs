#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4B.1 (§22, §23) - A/B/C/D FREEFORM BENCHMARK +
// OWNER PREVIEW PACK.
//
//   node scripts/socialCreative4b1Pack.mjs            A + C for every renderable family (no OpenAI)
//   node scripts/socialCreative4b1Pack.mjs --ai       also B (AI bg) + D (AI art-directed) - needs OPENAI_API_KEY
//   node scripts/socialCreative4b1Pack.mjs --families deal_hero,market_shape
//
// A = old deterministic template
// B = AI background only (4B hybrid)
// C = deterministic FREEFORM fallback blueprint (constrained baseline)
// D = full AI SENIOR ART DIRECTOR freeform composition
//
// Writes .social-preview/creative-4b1-freeform/. Read-only DB. No Buffer,
// no cron, no eBay.

import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-4b1-freeform");
const args = process.argv.slice(2);
const AI = args.includes("--ai");
const famArg = (() => { const i = args.indexOf("--families"); return i >= 0 ? args[i + 1]?.split(",") : null; })();

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { CARD_FORWARD_SERIES, renderCardForwardStory } = await import("../lib/newsroom/cardForwardRender.mjs");
const {
  newBudget, costReport, buildBackgroundPrompt, validateBlueprint, scoreConcept, runArtDirector,
  buildSlots, renderBlueprintHtml, FALLBACK_BLUEPRINTS,
} = await import("../lib/newsroom/hybrid/pipeline.mjs");
const { planEnrichments } = await import("../lib/newsroom/hybrid/enrichment.mjs");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { createRenderer, resolveChromeBin } = await import("../lib/social/render.mjs");
const { renderCardEditorialHtml } = await import("../lib/social/newsroom/cardEditorialTemplates.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");
const { createHash } = await import("node:crypto");
const { pathToFileURL } = await import("node:url");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const key = process.env.OPENAI_API_KEY;
const FAMILIES = (famArg ?? Object.keys(CARD_FORWARD_SERIES)).filter((s) => CARD_FORWARD_SERIES[s]);
const RESOLVERS = {
  MARKET_SNAPSHOT: () => MD.resolveMarketShape(),
  EXACT_PRINTING_MATTERS: () => MD.resolvePrintingPair(),
  WHY_SOLD_PRICES_MATTER: () => MD.resolveAskingVsSold(),
  THREE_UNDER_25: () => MD.resolveThreeUnderSamples({ cap: 25, stories: 1 }),
  DEAL_DROP: () => MD.resolveDealHeroSamples({ n: 4 }),
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });
mkdirSync(path.join(OUT, "blueprints"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4B.1 A/B/C/D freeform benchmark ===`);
console.log(`AI (B + D): ${AI ? "ON" : "OFF"}   OpenAI key: ${key ? "present" : "ABSENT"}   families: ${FAMILIES.join(", ")}\n`);

const db = supabaseAdmin();
const renderer = await createRenderer().catch((e) => { console.log(`(renderer unavailable: ${String(e.message).slice(0, 90)})`); return null; });

async function artMapFor(ids) {
  const map = {};
  for (const id of [...new Set(ids.map(String))].filter((x) => /^\d+$/.test(x))) {
    const { data: row } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").eq("tcgplayer_id", id).maybeSingle();
    const r = await resolveCardArtwork({ card_tcgplayer_id: id, card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null });
    if (r.status === "ready") map[id] = pathToFileURL(path.resolve(r.localPath)).href;
  }
  return map;
}

const budgets = [];
const rows = [];
for (const series of FAMILIES) {
  const layout = CARD_FORWARD_SERIES[series].layout;
  const rec = { series, layout, data: null, A: null, B: null, C: null, D: null, enrichments: [], blueprint_score: null, concepts: null, human_taste: null };
  const rr = await RESOLVERS[series]?.().catch((e) => ({ ok: false, reason: "RESOLVER_ERROR", detail: e.message }));
  rec.data = rr?.ok ? "ok" : `WITHHELD: ${rr?.reason} ${rr?.detail ?? ""}`.trim();
  if (!rr?.ok || !renderer) { rows.push(rec); console.log(`  ${series.padEnd(22)} ${rec.data}`); continue; }

  const { props, ids, facts } = normalize(series, rr);
  const cardArt = await artMapFor(ids);
  const factLock = buildFactLock({ facts_json: facts });
  const contract = contractFor(series);
  const enr = planEnrichments({ factLock, contract, resolved: { data: props }, layout });
  rec.enrichments = enr.enrichments.map((e) => `${e.kind} <- ${e.source}`);
  const story = { story_id: `4b1-${series.toLowerCase()}`, series, subject_id: `${series.toLowerCase()}-proof`, facts_json: {} };
  const budget = newBudget(); budgets.push(budget);

  // A - old deterministic template
  try {
    const html = renderCardEditorialHtml(layout, { ...props, target: "ig_45", cardArt });
    await renderer.renderToPng(html, path.join(OUT, "full", `${series}_A_deterministic.png`));
    rec.A = "rendered";
  } catch (e) { rec.A = `ERR ${e.message.slice(0, 80)}`; }

  // C - deterministic freeform fallback blueprint
  try {
    const v = validateBlueprint(FALLBACK_BLUEPRINTS[layout], { target: "ig_45" });
    const slots = buildSlots(layout, { factLock, resolved: { data: props }, cardArt });
    await renderer.renderToPng(renderBlueprintHtml(v.blueprint, { slots }), path.join(OUT, "full", `${series}_C_freeform_fallback.png`));
    const sc = scoreConcept(v.blueprint, { enrichmentKinds: enr.enrichments.map((e) => e.kind) });
    rec.C = `rendered (score ${sc.overall}, dead ${sc.dead_space_score}, crowd ${sc.crowding_score})`;
    rec.blueprint_score = sc.overall;
    writeFileSync(path.join(OUT, "blueprints", `${series}_C.json`), JSON.stringify(v.blueprint, null, 2));
  } catch (e) { rec.C = `ERR ${e.message.slice(0, 80)}`; }

  if (AI && key) {
    // B - AI background only (4B hybrid, non-freeform)
    try {
      const cf = await renderCardForwardStory(story, "instagram", { renderer, db, renderDir: path.join(OUT, "full"), sha256, hybrid: { enabled: true, freeform: false, budget } });
      if (cf.ok) { renameSync(cf.localPath, path.join(OUT, "full", `${series}_B_ai_background.png`)); rec.B = `rendered (${cf.hybrid_mode})`; }
      else rec.B = `WITHHELD: ${cf.withheld?.reason}`;
    } catch (e) { rec.B = `ERR ${e.message.slice(0, 80)}`; }

    // D - full AI senior art director freeform (its own budget - B already
    // spent this artifact's director-call cap)
    try {
      const dBudget = newBudget(); budgets.push(dBudget);
      const ad = await runArtDirector({ factLock, contract, layout, target: "ig_45", enrichmentsAvailable: enr.enrichments.map((e) => e.kind), budget: dBudget, env: process.env });
      if (ad.ok) {
        const slots = buildSlots(layout, { factLock, resolved: { data: props }, cardArt });
        await renderer.renderToPng(renderBlueprintHtml(ad.blueprint, { slots }), path.join(OUT, "full", `${series}_D_ai_art_directed.png`));
        rec.D = `rendered (${ad.source}, style ${ad.blueprint.composition_style}, score ${ad.chosenScore?.overall ?? "?"})`;
        rec.concepts = (ad.concepts ?? []).map((c) => ({ style: c.blueprint?.composition_style, overall: c.overall, generic: c.generic }));
        rec.human_taste = ad.humanTaste;
        writeFileSync(path.join(OUT, "blueprints", `${series}_D.json`), JSON.stringify({ blueprint: ad.blueprint, concepts: rec.concepts, human_taste: ad.humanTaste }, null, 2));
      } else rec.D = `${ad.state}: ${ad.reason}`;
    } catch (e) { rec.D = `ERR ${e.message.slice(0, 80)}`; }
  }
  rows.push(rec);
  console.log(`  ${series.padEnd(22)} A=${rec.A}  C=${rec.C}${AI ? `  B=${rec.B}  D=${rec.D}` : ""}`);
}
if (renderer) await renderer.close?.();

const cost = costReport(budgets);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const img = (f) => existsSync(path.join(OUT, "full", f)) ? `<img src="full/${f}">` : "&mdash;";
const idx = `<!doctype html><meta charset=utf-8><title>4B.1 freeform A/B/C/D</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:28px;max-width:1400px}img{max-width:300px;border:1px solid #333;display:block}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}code{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-4B.1 - freeform A/B/C/D benchmark</h1>
<p>AI: <b>${AI ? "ON" : "OFF"}</b> &nbsp; key: <b>${key ? "present" : "ABSENT"}</b> &nbsp; ${new Date().toISOString()}</p>
<p><b>A</b> old deterministic &nbsp; <b>B</b> AI background only &nbsp; <b>C</b> deterministic freeform blueprint &nbsp; <b>D</b> AI senior art director freeform. Target: D materially outperforms A/B/C (owner judges).</p>
<table><tr><th>family</th><th>A</th><th>B</th><th>C (freeform fallback)</th><th>D (AI art-directed)</th><th>enrichments / concepts</th></tr>
${rows.map((r) => `<tr><td><b>${r.series}</b><br><code>${r.layout}</code><br>${esc(r.data)}</td>
<td>${img(`${r.series}_A_deterministic.png`)}<br>${esc(r.A)}</td>
<td>${img(`${r.series}_B_ai_background.png`)}<br>${esc(r.B)}</td>
<td>${img(`${r.series}_C_freeform_fallback.png`)}<br>${esc(r.C)}</td>
<td>${img(`${r.series}_D_ai_art_directed.png`)}<br>${esc(r.D)}</td>
<td><b>enrichments (real):</b><br>${(r.enrichments || []).map(esc).join("<br>") || "&mdash;"}<br><br><b>concepts:</b><br>${(r.concepts || []).map((c) => `${esc(c.style)} ${c.overall}${c.generic ? " GENERIC" : ""}`).join("<br>") || "&mdash;"}<br><b>human taste:</b> ${esc(JSON.stringify(r.human_taste ?? "-"))}</td></tr>`).join("")}
</table>
<h2>Cost (§25)</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>`;
writeFileSync(path.join(OUT, "index.html"), idx);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, key_present: Boolean(key), rows, cost }, null, 2));

// Normalise a resolver result into { props (renderer shape), ids (for art),
// facts (fact-lock shape) } - mirrors resolveFacts() in cardForwardRender.
function normalize(series, rr) {
  const d = rr.data ?? {};
  if (series === "DEAL_DROP") {
    const it = (d.items ?? [])[0] ?? {};
    const props = { card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, priceUsd: it.price_usd, marketUsd: it.market_ref_usd, discountPct: it.gap_pct };
    return { props, ids: [it.tcgplayerId].filter(Boolean), facts: { card_name: it.card_name, card_set: it.card_set, card_tcgplayer_id: it.tcgplayerId, total_price_usd: it.price_usd, market_price: it.market_ref_usd, discount_pct: it.gap_pct } };
  }
  if (series === "MARKET_SNAPSHOT") {
    const props = { pricedCards: d.priced_cards, under25Pct: d.under_25_pct, over100Pct: d.over_100_pct, featured: d.featured };
    return { props, ids: (rr.cards ?? []).map((c) => c.tcgplayerId).filter(Boolean), facts: { tracked_count: d.priced_cards, percentages: [d.under_25_pct, d.over_100_pct], card_name: d.featured?.card_name, market_price: d.featured?.market_ref_usd, listed_price: d.featured?.asking_usd } };
  }
  if (series === "WHY_SOLD_PRICES_MATTER") {
    const props = { card: { tcgplayerId: d.tcgplayerId, name: d.card_name, set: d.card_set }, askingUsd: d.asking_usd, soldPoints: d.sold_points, marketRefUsd: d.market_ref_usd, sold_points: d.sold_points };
    return { props, ids: [d.tcgplayerId].filter(Boolean), facts: { card_name: d.card_name, card_set: d.card_set, card_tcgplayer_id: d.tcgplayerId, total_price_usd: d.asking_usd, market_price: d.market_ref_usd, sold_price: (d.sold_points ?? [])[1] } };
  }
  if (series === "THREE_UNDER_25") {
    const st = (d.stories ?? [])[0] ?? {};
    const props = { cap: st.cap, items: st.items };
    return { props, ids: (st.items ?? []).map((x) => x.tcgplayerId).filter(Boolean), facts: { items: st.items, total_price_usd: st.items?.[0]?.price_usd, market_price: st.items?.[0]?.market_usd } };
  }
  if (series === "EXACT_PRINTING_MATTERS") {
    const props = { species: d.species, high: d.high, low: d.low, multiple: d.multiple, relevance: d.relevance, printing_lesson: d.printing_lesson };
    return { props, ids: [d.high?.tcgplayerId, d.low?.tcgplayerId].filter(Boolean), facts: { card_name: d.species, market_price: d.high?.price_usd } };
  }
  return { props: d, ids: [], facts: {} };
}

console.log(`\nCOST ${JSON.stringify(cost)}`);
console.log(`Wrote ${path.relative(ROOT, OUT)}/index.html`);
