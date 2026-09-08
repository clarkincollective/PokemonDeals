#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-5 (§23, §24) - FULL_GENERATIVE_SOCIAL OWNER PROOF PACK.
//
//   node scripts/socialCreative5Pack.mjs           OLD (C) only, no OpenAI
//   node scripts/socialCreative5Pack.mjs --ai      also NEW (FULL_GENERATIVE_SOCIAL) - needs OPENAI_API_KEY + gpt-image edits
//   node scripts/socialCreative5Pack.mjs --families DEAL_DROP,MARKET_SNAPSHOT
//
// OLD = the best deterministic path (4B.1 freeform C renderer = SAFE_FALLBACK)
// NEW = the image model designs the whole post from the real cards + facts,
//       then a structured audit verifies it.
//
// Writes .social-preview/creative-5-fullgen/. Read-only DB. No Buffer, no
// cron, no eBay Browse, no publishing.

import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-5-fullgen");
const args = process.argv.slice(2);
const AI = args.includes("--ai");
const famArg = (() => { const i = args.indexOf("--families"); return i >= 0 ? args[i + 1]?.split(",") : null; })();

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { CARD_FORWARD_SERIES } = await import("../lib/newsroom/cardForwardRender.mjs");
const {
  newBudget, costReport, validateBlueprint, scoreConcept, buildSlots, renderBlueprintHtml, FALLBACK_BLUEPRINTS,
  buildFactManifest, buildMasterPrompt, generateFullSocial, reviewCardFidelity, verifyFacts, reviewCreativeQuality,
} = await import("../lib/newsroom/hybrid/pipeline.mjs");
const { buildFactLock, factLockHash } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { createRenderer } = await import("../lib/social/render.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");
const { pathToFileURL } = await import("node:url");
const { readFileSync } = await import("node:fs");

const key = process.env.OPENAI_API_KEY;
const SERIES_FOR = { DEAL_DROP: "DEAL_DROP", MARKET_SNAPSHOT: "MARKET_SNAPSHOT", ASKING_VS_SOLD: "WHY_SOLD_PRICES_MATTER", PRINTING_COMPARE: "EXACT_PRINTING_MATTERS", THREE_UNDER_25: "THREE_UNDER_25" };
const FAMILIES = (famArg ?? ["DEAL_DROP", "MARKET_SNAPSHOT", "ASKING_VS_SOLD", "PRINTING_COMPARE", "THREE_UNDER_25"]).map((f) => f.toUpperCase());
const RESOLVERS = {
  MARKET_SNAPSHOT: () => MD.resolveMarketShape(),
  EXACT_PRINTING_MATTERS: () => MD.resolvePrintingPair(),
  WHY_SOLD_PRICES_MATTER: () => MD.resolveAskingVsSold(),
  THREE_UNDER_25: () => MD.resolveThreeUnderSamples({ cap: 25, stories: 1 }),
  DEAL_DROP: () => MD.resolveDealHeroSamples({ n: 4 }),
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });
mkdirSync(path.join(OUT, "meta"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-5 full generative social proof ===`);
console.log(`NEW (gpt-image edits): ${AI ? "ON" : "OFF"}   key: ${key ? "present" : "ABSENT"}   families: ${FAMILIES.join(", ")}\n`);

const db = supabaseAdmin();
const renderer = await createRenderer().catch((e) => { console.log(`(renderer unavailable: ${String(e.message).slice(0, 90)})`); return null; });

async function artPaths(ids) {
  const out = [];
  for (const id of [...new Set(ids.map(String))].filter((x) => /^\d+$/.test(x))) {
    const { data: row } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").eq("tcgplayer_id", id).maybeSingle();
    const r = await resolveCardArtwork({ card_tcgplayer_id: id, card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null });
    if (r.status === "ready") out.push(path.resolve(r.localPath));
  }
  return out;
}

function normalize(series, rr) {
  const d = rr.data ?? {};
  if (series === "DEAL_DROP") { const it = (d.items ?? [])[0] ?? {}; return { props: { card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, priceUsd: it.price_usd, marketUsd: it.market_ref_usd, discountPct: it.gap_pct }, ids: [it.tcgplayerId].filter(Boolean), facts: { card_name: it.card_name, card_set: it.card_set, card_tcgplayer_id: it.tcgplayerId, total_price_usd: it.price_usd, market_price: it.market_ref_usd, discount_pct: it.gap_pct } }; }
  if (series === "MARKET_SNAPSHOT") return { props: { pricedCards: d.priced_cards, under25Pct: d.under_25_pct, over100Pct: d.over_100_pct, featured: d.featured, under_25_pct: d.under_25_pct }, ids: (rr.cards ?? []).map((c) => c.tcgplayerId).filter(Boolean), facts: { tracked_count: d.priced_cards, percentages: [d.under_25_pct, d.over_100_pct], card_name: d.featured?.card_name, market_price: d.featured?.market_ref_usd, listed_price: d.featured?.asking_usd } };
  if (series === "WHY_SOLD_PRICES_MATTER") return { props: { card: { tcgplayerId: d.tcgplayerId, name: d.card_name, set: d.card_set }, askingUsd: d.asking_usd, soldPoints: d.sold_points, marketRefUsd: d.market_ref_usd, sold_points: d.sold_points, card_name: d.card_name }, ids: [d.tcgplayerId].filter(Boolean), facts: { card_name: d.card_name, card_set: d.card_set, card_tcgplayer_id: d.tcgplayerId, total_price_usd: d.asking_usd, market_price: d.market_ref_usd, sold_price: (d.sold_points ?? [])[1] } };
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
  const rec = { family: fam, series, layout, data: null, OLD: null, NEW: null, fact_lock_hash: null };
  const rr = await RESOLVERS[series]?.().catch((e) => ({ ok: false, reason: "RESOLVER_ERROR", detail: e.message }));
  rec.data = rr?.ok ? "ok" : `WITHHELD: ${rr?.reason} ${rr?.detail ?? ""}`.trim();
  if (!rr?.ok || !renderer) { rows.push(rec); console.log(`  ${fam.padEnd(18)} ${rec.data}`); continue; }

  const { props, ids, facts } = normalize(series, rr);
  const paths = await artPaths(ids);
  const factLock = buildFactLock({ facts_json: facts });
  rec.fact_lock_hash = factLockHash(factLock).short;
  const contract = contractFor(series);
  const cardArt = Object.fromEntries(paths.map((p, i) => [ids[i] ?? String(i), pathToFileURL(p).href]));

  // OLD (C - 4B.1 freeform / SAFE_FALLBACK)
  try {
    const v = validateBlueprint(FALLBACK_BLUEPRINTS[layout], { target: "ig_45" });
    await renderer.renderToPng(renderBlueprintHtml(v.blueprint, { slots: buildSlots(layout, { factLock, resolved: { data: props }, cardArt }) }), path.join(OUT, "full", `${fam}_OLD_safe_fallback.png`));
    rec.OLD = `rendered (score ${scoreConcept(v.blueprint).overall})`;
  } catch (e) { rec.OLD = `ERR ${e.message.slice(0, 70)}`; }

  // NEW (FULL_GENERATIVE_SOCIAL)
  if (AI && key) {
    const budget = newBudget(); budget.limits.background_generations = 2; budgets.push(budget);
    try {
      const fm = buildFactManifest({ layout, factLock, resolved: { data: props }, contract });
      const prompt = buildMasterPrompt({ layout, factManifest: fm });
      writeFileSync(path.join(OUT, "meta", `${fam}_NEW_prompt.txt`), prompt);
      writeFileSync(path.join(OUT, "meta", `${fam}_NEW_manifest.json`), JSON.stringify(fm, null, 2));
      const cardB64s = paths.map((p) => readFileSync(p).toString("base64"));
      const cands = [];
      for (const seed of [0, 1]) {
        const p2 = seed === 0 ? prompt : `${prompt}\n\nCOMPOSITION NOTE: make this a distinctly different layout - vary the card scale, placement and hierarchy.`;
        const g = await generateFullSocial({ prompt: p2, cardImagePaths: paths, budget, env: process.env });
        if (g.ok) { writeFileSync(path.join(OUT, "full", `${fam}_NEW_candidate_${seed + 1}.png`), Buffer.from(g.b64, "base64")); cands.push({ b64: g.b64, sha: g.sha256 }); }
      }
      if (!cands.length) { rec.NEW = "GENERATION_FAILED"; rows.push(rec); console.log(`  ${fam.padEnd(18)} OLD=${rec.OLD} NEW=${rec.NEW}`); continue; }
      const assessed = [];
      for (const c of cands) {
        const fid = await reviewCardFidelity({ b64: c.b64, cardImageB64s: cardB64s, cardIdentity: fm.card_identity, env: process.env, budget });
        const fv = await verifyFacts({ b64: c.b64, factManifest: fm, env: process.env, budget });
        const q = await reviewCreativeQuality({ b64: c.b64, layout, env: process.env, budget });
        assessed.push({ c, fid, fv, q });
      }
      const clean = assessed.filter((a) => a.fid.ok && a.q.verdict !== "FAIL" && (a.fv.ok || a.fv.state === "SAFE_REPAIR_REQUIRED"));
      const pick = (clean.length ? clean : assessed).sort((x, y) => (y.q.scores ? Object.values(y.q.scores).reduce((s, n) => s + n, 0) : 0) - (x.q.scores ? Object.values(x.q.scores).reduce((s, n) => s + n, 0) : 0))[0];
      writeFileSync(path.join(OUT, "full", `${fam}_NEW_selected.png`), Buffer.from(pick.c.b64, "base64"));
      writeFileSync(path.join(OUT, "meta", `${fam}_NEW_verification.json`), JSON.stringify({
        fact_lock_hash: rec.fact_lock_hash,
        candidates: assessed.map((a) => ({ card_fidelity: a.fid.ok, fidelity_score: a.fid.fidelity_score ?? null, fact_verify: a.fid.ok ? (a.fv.ok ? "PASS" : a.fv.state) : "n/a", quality: a.q.verdict, quality_scores: a.q.scores })),
        selected: { card_fidelity: pick.fid.ok, fidelity_score: pick.fid.fidelity_score ?? null, fact_verify: pick.fv.ok ? "PASS" : pick.fv.state, quality: pick.q.verdict, quality_notes: (pick.q.notes ?? []).slice(0, 4) },
      }, null, 2));
      rec.NEW = `selected (fidelity ${pick.fid.fidelity_score ?? "?"}, facts ${pick.fv.ok ? "PASS" : pick.fv.state}, quality ${pick.q.verdict})`;
    } catch (e) { rec.NEW = `ERR ${e.message.slice(0, 90)}`; }
  }
  rows.push(rec);
  console.log(`  ${fam.padEnd(18)} OLD=${rec.OLD}${AI ? `  NEW=${rec.NEW}` : ""}`);
}
if (renderer) await renderer.close?.();

const cost = costReport(budgets);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const img = (f) => existsSync(path.join(OUT, "full", f)) ? `<img src="full/${f}">` : "&mdash;";
const idx = `<!doctype html><meta charset=utf-8><title>4-5 full generative social</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:28px;max-width:1400px}img{max-width:320px;border:1px solid #333;display:block;margin:4px 0}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}code{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-5 - FULL_GENERATIVE_SOCIAL</h1>
<p>NEW: <b>${AI ? "ON" : "OFF"}</b> &nbsp; key: <b>${key ? "present" : "ABSENT"}</b> &nbsp; ${new Date().toISOString()}</p>
<p><b>OLD</b> = SAFE_FALLBACK (4B.1 freeform C renderer). &nbsp; <b>NEW</b> = the image model designs the whole post from the real cards + real facts, verified afterward. <b>OWNER_REVIEW_REQUIRED</b> - not self-certified.</p>
<table><tr><th>family</th><th>OLD (SAFE_FALLBACK)</th><th>NEW (FULL_GENERATIVE_SOCIAL)</th><th>meta</th></tr>
${rows.map((r) => `<tr><td><b>${r.family}</b><br><code>${r.layout}</code><br>${esc(r.data)}<br>fact_lock ${r.fact_lock_hash ?? "-"}</td>
<td>${img(`${r.family}_OLD_safe_fallback.png`)}${esc(r.OLD)}</td>
<td>${img(`${r.family}_NEW_candidate_1.png`)}${img(`${r.family}_NEW_candidate_2.png`)}<b>selected:</b>${img(`${r.family}_NEW_selected.png`)}${esc(r.NEW)}</td>
<td><a href="meta/${r.family}_NEW_prompt.txt" style="color:#9ad">master prompt</a><br><a href="meta/${r.family}_NEW_manifest.json" style="color:#9ad">expected fact manifest</a><br><a href="meta/${r.family}_NEW_verification.json" style="color:#9ad">fact + fidelity + quality verification</a></td></tr>`).join("")}
</table>
<h2>Cost (§28)</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`;
writeFileSync(path.join(OUT, "index.html"), idx);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, key_present: Boolean(key), rows, cost, readiness: "OWNER_REVIEW_REQUIRED" }, null, 2));

console.log(`\nCOST ${JSON.stringify(cost)}`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
console.log(`Wrote ${path.relative(ROOT, OUT)}/index.html`);
