#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4B.2 (§26, §27, §29) - GENERATIVE DESIGN CANVAS
// OWNER PROOF PACK.
//
//   node scripts/socialCreative4b2Pack.mjs           A + C for every renderable family (no OpenAI)
//   node scripts/socialCreative4b2Pack.mjs --ai      also E = GENERATIVE_DESIGN_CANVAS (needs OPENAI_API_KEY, gpt-image-2)
//   node scripts/socialCreative4b2Pack.mjs --families MARKET_SNAPSHOT,DEAL_DROP
//
// A = old deterministic template
// C = 4B.1 deterministic freeform blueprint
// E = gpt-image-2 designs the whole visual, our compositor overlays truth
//
// Writes .social-preview/creative-4b2-generative/. Read-only DB. No Buffer,
// no cron, no eBay Browse.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-4b2-generative");
const args = process.argv.slice(2);
const AI = args.includes("--ai");
const famArg = (() => { const i = args.indexOf("--families"); return i >= 0 ? args[i + 1]?.split(",") : null; })();

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { CARD_FORWARD_SERIES } = await import("../lib/newsroom/cardForwardRender.mjs");
const {
  newBudget, costReport, validateBlueprint, scoreConcept, buildSlots, renderBlueprintHtml, FALLBACK_BLUEPRINTS,
  buildDesignCanvasPrompt, generateDesignCanvas, selectBestCanvas, renderCompositedCanvasHtml,
} = await import("../lib/newsroom/hybrid/pipeline.mjs");
const { buildFactLock, factLockHash } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { reviewRenderedCreativeMulti } = await import("../lib/newsroom/visualReview.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { createRenderer } = await import("../lib/social/render.mjs");
const { renderCardEditorialHtml } = await import("../lib/social/newsroom/cardEditorialTemplates.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");
const { pathToFileURL } = await import("node:url");

const key = process.env.OPENAI_API_KEY;
const PRIORITY = ["MARKET_SNAPSHOT", "DEAL_DROP", "ASKING_VS_SOLD", "PRINTING_COMPARE", "THREE_UNDER_25"];
const SERIES_FOR = { MARKET_SNAPSHOT: "MARKET_SNAPSHOT", DEAL_DROP: "DEAL_DROP", ASKING_VS_SOLD: "WHY_SOLD_PRICES_MATTER", PRINTING_COMPARE: "EXACT_PRINTING_MATTERS", THREE_UNDER_25: "THREE_UNDER_25" };
const FAMILIES = (famArg ?? PRIORITY).map((f) => f.toUpperCase());
const RESOLVERS = {
  MARKET_SNAPSHOT: () => MD.resolveMarketShape(),
  EXACT_PRINTING_MATTERS: () => MD.resolvePrintingPair(),
  WHY_SOLD_PRICES_MATTER: () => MD.resolveAskingVsSold(),
  THREE_UNDER_25: () => MD.resolveThreeUnderSamples({ cap: 25, stories: 1 }),
  DEAL_DROP: () => MD.resolveDealHeroSamples({ n: 4 }),
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });
mkdirSync(path.join(OUT, "canvas"), { recursive: true });
mkdirSync(path.join(OUT, "meta"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4B.2 generative design canvas proof ===`);
console.log(`E (gpt-image-2): ${AI ? "ON" : "OFF"}   key: ${key ? "present" : "ABSENT"}   families: ${FAMILIES.join(", ")}\n`);

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

function normalize(series, rr) {
  const d = rr.data ?? {};
  if (series === "DEAL_DROP") { const it = (d.items ?? [])[0] ?? {}; return { props: { card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, priceUsd: it.price_usd, marketUsd: it.market_ref_usd, discountPct: it.gap_pct }, ids: [it.tcgplayerId].filter(Boolean), facts: { card_name: it.card_name, card_set: it.card_set, card_tcgplayer_id: it.tcgplayerId, total_price_usd: it.price_usd, market_price: it.market_ref_usd, discount_pct: it.gap_pct } }; }
  if (series === "MARKET_SNAPSHOT") return { props: { pricedCards: d.priced_cards, under25Pct: d.under_25_pct, over100Pct: d.over_100_pct, featured: d.featured }, ids: (rr.cards ?? []).map((c) => c.tcgplayerId).filter(Boolean), facts: { tracked_count: d.priced_cards, percentages: [d.under_25_pct, d.over_100_pct], card_name: d.featured?.card_name, market_price: d.featured?.market_ref_usd, listed_price: d.featured?.asking_usd } };
  if (series === "WHY_SOLD_PRICES_MATTER") return { props: { card: { tcgplayerId: d.tcgplayerId, name: d.card_name, set: d.card_set }, askingUsd: d.asking_usd, soldPoints: d.sold_points, marketRefUsd: d.market_ref_usd, sold_points: d.sold_points }, ids: [d.tcgplayerId].filter(Boolean), facts: { card_name: d.card_name, card_set: d.card_set, card_tcgplayer_id: d.tcgplayerId, total_price_usd: d.asking_usd, market_price: d.market_ref_usd, sold_price: (d.sold_points ?? [])[1] } };
  if (series === "THREE_UNDER_25") { const st = (d.stories ?? [])[0] ?? {}; return { props: { cap: st.cap, items: st.items }, ids: (st.items ?? []).map((x) => x.tcgplayerId).filter(Boolean), facts: { items: st.items, total_price_usd: st.items?.[0]?.price_usd, market_price: st.items?.[0]?.market_usd } }; }
  if (series === "EXACT_PRINTING_MATTERS") return { props: { species: d.species, high: d.high, low: d.low, multiple: d.multiple, relevance: d.relevance, printing_lesson: d.printing_lesson }, ids: [d.high?.tcgplayerId, d.low?.tcgplayerId].filter(Boolean), facts: { card_name: d.species, market_price: d.high?.price_usd } };
  return { props: d, ids: [], facts: {} };
}

const budgets = [];
const rows = [];
for (const fam of FAMILIES) {
  const series = SERIES_FOR[fam] ?? fam;
  const layout = CARD_FORWARD_SERIES[series]?.layout;
  if (!layout) { console.log(`  ${fam}: not a card-forward family`); continue; }
  const rec = { family: fam, series, layout, data: null, A: null, C: null, E: null, fact_lock_hash: null };
  const rr = await RESOLVERS[series]?.().catch((e) => ({ ok: false, reason: "RESOLVER_ERROR", detail: e.message }));
  rec.data = rr?.ok ? "ok" : `WITHHELD: ${rr?.reason} ${rr?.detail ?? ""}`.trim();
  if (!rr?.ok || !renderer) { rows.push(rec); console.log(`  ${fam.padEnd(18)} ${rec.data}`); continue; }

  const { props, ids, facts } = normalize(series, rr);
  const cardArt = await artMapFor(ids);
  const factLock = buildFactLock({ facts_json: facts });
  rec.fact_lock_hash = factLockHash(factLock).short;
  const contract = contractFor(series);

  // A
  try { await renderer.renderToPng(renderCardEditorialHtml(layout, { ...props, target: "ig_45", cardArt }), path.join(OUT, "full", `${fam}_A_deterministic.png`)); rec.A = "rendered"; } catch (e) { rec.A = `ERR ${e.message.slice(0, 70)}`; }
  // C
  try {
    const v = validateBlueprint(FALLBACK_BLUEPRINTS[layout], { target: "ig_45" });
    await renderer.renderToPng(renderBlueprintHtml(v.blueprint, { slots: buildSlots(layout, { factLock, resolved: { data: props }, cardArt }) }), path.join(OUT, "full", `${fam}_C_freeform.png`));
    rec.C = `rendered (score ${scoreConcept(v.blueprint).overall})`;
  } catch (e) { rec.C = `ERR ${e.message.slice(0, 70)}`; }

  // E - GENERATIVE_DESIGN_CANVAS
  if (AI && key) {
    const budget = newBudget(); budgets.push(budget);
    try {
      const specs = [0, 1].map((seed) => buildDesignCanvasPrompt({ layout, storyCategory: series, candidateSeed: seed }));
      writeFileSync(path.join(OUT, "meta", `${fam}_E_prompt.txt`), specs[0].prompt + "\n\n--- candidate 2 variety ---\n\n" + specs[1].prompt);
      const gen = [];
      for (const spec of specs) {
        const g = await generateDesignCanvas({ spec, budget, env: process.env });
        if (g.ok) gen.push({ b64: g.b64, sha256: g.sha256, prompt_sha: g.prompt_sha });
      }
      if (!gen.length) { rec.E = "no canvas generated"; rows.push(rec); console.log(`  ${fam.padEnd(18)} A=${rec.A} C=${rec.C} E=${rec.E}`); continue; }
      gen.forEach((g, i) => writeFileSync(path.join(OUT, "canvas", `${fam}_E_canvas_${i + 1}.png`), Buffer.from(g.b64, "base64")));
      const sel = await selectBestCanvas({ candidates: gen, layout, env: process.env, budget });
      if (!sel.ok) { rec.E = `CANVAS_REJECT: ${sel.reason}`; rows.push(rec); console.log(`  ${fam.padEnd(18)} A=${rec.A} C=${rec.C} E=${rec.E}`); continue; }
      writeFileSync(path.join(OUT, "canvas", `${fam}_E_canvas_SELECTED.png`), Buffer.from(sel.selected.b64, "base64"));
      const comp = renderCompositedCanvasHtml({ layout, canvasDataUrl: `data:image/png;base64,${sel.selected.b64}`, factLock, resolved: { data: props }, cardArt, classification: contract.classification });
      await renderer.renderToPng(comp.html, path.join(OUT, "full", `${fam}_E_generative.png`));
      const review = await reviewRenderedCreativeMulti(path.join(OUT, "full", `${fam}_E_generative.png`), { platform: "instagram", family: layout, series, cardForward: true, editorial: true }, { samples: 3, env: process.env });
      writeFileSync(path.join(OUT, "meta", `${fam}_E_meta.json`), JSON.stringify({
        fact_lock_hash: rec.fact_lock_hash, canvas_sha256: sel.selected.sha256, canvas_prompt_sha: sel.selected.prompt_sha,
        canvas_review: sel.selectedReview, canvases_generated: gen.length, canvases_rejected: (sel.reviewed ?? []).filter((x) => !x.review.ok).length,
        overlay_manifest: comp.overlayManifest, cta: comp.cta, final_visual_review: { verdict: review.verdict, scores: review.scores, notes: (review.notes ?? []).slice(0, 4) },
      }, null, 2));
      rec.E = `rendered (canvas q ${sel.selectedReview.q_score}, final review ${review.verdict})`;
    } catch (e) { rec.E = `ERR ${e.message.slice(0, 90)}`; }
  }
  rows.push(rec);
  console.log(`  ${fam.padEnd(18)} A=${rec.A}  C=${rec.C}${AI ? `  E=${rec.E}` : ""}`);
}
if (renderer) await renderer.close?.();

const cost = costReport(budgets);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const img = (f, dir = "full") => existsSync(path.join(OUT, dir, f)) ? `<img src="${dir}/${f}">` : "&mdash;";
const idx = `<!doctype html><meta charset=utf-8><title>4B.2 generative design canvas</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:28px;max-width:1500px}img{max-width:280px;border:1px solid #333;display:block}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}code{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-4B.2 - generative design canvas</h1>
<p>E (gpt-image-2): <b>${AI ? "ON" : "OFF"}</b> &nbsp; key: <b>${key ? "present" : "ABSENT"}</b> &nbsp; ${new Date().toISOString()}</p>
<p><b>A</b> old deterministic &nbsp; <b>C</b> 4B.1 freeform renderer &nbsp; <b>E</b> gpt-image-2 designs the whole visual + deterministic factual overlay. <b>OWNER_REVIEW_REQUIRED</b> - not self-certified.</p>
<table><tr><th>family</th><th>A</th><th>C</th><th>E (raw canvas + composite)</th><th>meta</th></tr>
${rows.map((r) => `<tr><td><b>${r.family}</b><br><code>${r.layout}</code><br>${esc(r.data)}<br>fact_lock ${r.fact_lock_hash ?? "-"}</td>
<td>${img(`${r.family}_A_deterministic.png`)}<br>${esc(r.A)}</td>
<td>${img(`${r.family}_C_freeform.png`)}<br>${esc(r.C)}</td>
<td>${img(`${r.family}_E_canvas_SELECTED.png`, "canvas")}<span style="color:#888">raw canvas</span><br>${img(`${r.family}_E_generative.png`)}<span style="color:#888">final composite</span><br>${esc(r.E)}</td>
<td><a href="meta/${r.family}_E_prompt.txt" style="color:#9ad">design prompt</a><br><a href="meta/${r.family}_E_meta.json" style="color:#9ad">overlay manifest + review</a></td></tr>`).join("")}
</table>
<h2>Cost (§29)</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`;
writeFileSync(path.join(OUT, "index.html"), idx);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, key_present: Boolean(key), rows, cost, readiness: "OWNER_REVIEW_REQUIRED" }, null, 2));

console.log(`\nCOST ${JSON.stringify(cost)}`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
console.log(`Wrote ${path.relative(ROOT, OUT)}/index.html`);
