#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-5A (§18, §20) - SEMANTIC AUDITOR OWNER PROOF PACK.
//
//   node scripts/socialCreative5aPack.mjs           audit the owner failure artifacts (deterministic, no OpenAI)
//   node scripts/socialCreative5aPack.mjs --ai      also generate + fully audit corrected posts (needs OPENAI_API_KEY)
//
// Re-runs the exact real stories that exposed the owner-found failures:
//   A. ASKING_VS_SOLD Clefairy  ($50.14 ask vs $199 market)
//   B. MARKET_SNAPSHOT           (85.7% of 24,545 tracked singles; Clefairy = example only)
//   C. PRINTING_COMPARE Gengar   (must PROVE two printings or WITHHOLD)
//
// Writes .social-preview/creative-5a-semantic/. Read-only DB. No Buffer,
// no cron, no publishing.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-5a-semantic");
const args = process.argv.slice(2);
const AI = args.includes("--ai");

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const {
  newBudget, costReport, buildSemanticManifest, comparisonDirection, auditSemantics,
  provePrintingPair, runFullGenerativeSocial,
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
mkdirSync(path.join(OUT, "meta"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-5A semantic auditor proof ===`);
console.log(`generate corrected posts: ${AI ? "ON" : "OFF"}   key: ${key ? "present" : "ABSENT"}\n`);

async function artPathFor(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data: row } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  const r = await resolveCardArtwork({ card_tcgplayer_id: String(id), card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null });
  return r.status === "ready" ? path.resolve(r.localPath) : null;
}

// ---- §18 A. owner-found ASKING_VS_SOLD failure re-audited -----
const A_facts = { card_name: "Clefairy", card_set: "Base Set", card_tcgplayer_id: null, total_price_usd: 50.14, market_price: 199 };
const A_sem = buildSemanticManifest({ layout: "asking_vs_sold", factLock: buildFactLock({ facts_json: A_facts }), resolved: { data: { askingUsd: 50.14, marketRefUsd: 199, card_name: "Clefairy" } }, contract: contractFor("WHY_SOLD_PRICES_MATTER") });
const A_oldArtifactExtraction = {
  headline: "PREMIUM -75%",
  comparisons: [{ left: "ASK $50.14", right: "MARKET $199", stated_relation: "premium", stated_pct: "-75%", arrow_direction: "up", colour_of_main_number: "red" }],
  takeaways: ["Don't pay the ask. Know the market."],
  claims: [], all_numbers: ["$50.14", "$199", "-75%"], logos_detected: ["a red and white ball-style icon"],
};
const A_audit = auditSemantics({ extraction: A_oldArtifactExtraction, semanticManifest: A_sem });
console.log(`CASE A - old artifact re-audit: ${A_audit.ok ? "PASS (regression!)" : A_audit.state}`);
console.log(`  direction truth: ${A_sem.comparison_direction} ${A_sem.comparison_pct}%  |  appropriate lesson: "${A_sem.appropriate_lesson}"`);
console.log(`  findings: ${(A_audit.findings || []).map((f) => f.detail).join(" | ")}`);

// ---- §18 B. owner-found MARKET_SNAPSHOT failure re-audited ----
const B_res = await MD.resolveMarketShape().catch(() => null);
const B_facts = B_res?.ok ? { tracked_count: B_res.data.priced_cards, percentages: [B_res.data.under_25_pct, B_res.data.over_100_pct], card_name: B_res.data.featured?.card_name } : { tracked_count: 24545, percentages: [85.7, 4.7], card_name: "Clefairy" };
const B_resolved = B_res?.ok ? { data: { under_25_pct: B_res.data.under_25_pct, over_100_pct: B_res.data.over_100_pct, priced_cards: B_res.data.priced_cards, featured: B_res.data.featured } } : { data: { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545, featured: { card_name: "Clefairy" } } };
const B_sem = buildSemanticManifest({ layout: "market_shape", factLock: buildFactLock({ facts_json: B_facts }), resolved: B_resolved, contract: contractFor("MARKET_SNAPSHOT") });
const B_oldArtifactExtraction = {
  headline: `${B_sem.claim_value}% of ${(B_sem.example_card || "Clefairy")} singles sell under $25`,
  claims: [{ subject: `${B_sem.example_card} singles`, predicate: "sell under $25", value: `${B_sem.claim_value}%`, qualifier: "", scope: `${B_facts.tracked_count.toLocaleString("en-US")} ${B_sem.example_card} singles` }],
  comparisons: [], takeaways: [`Sample: ${B_facts.tracked_count.toLocaleString("en-US")} ${B_sem.example_card} singles`], all_numbers: [`${B_sem.claim_value}%`, B_facts.tracked_count.toLocaleString("en-US")], logos_detected: [],
};
const B_audit = auditSemantics({ extraction: B_oldArtifactExtraction, semanticManifest: B_sem });
console.log(`\nCASE B - old artifact re-audit: ${B_audit.ok ? "PASS (regression!)" : B_audit.state}`);
console.log(`  scope truth: ${B_sem.claim_scope} / population "${B_sem.claim_population}" / example "${B_sem.example_card}"`);
console.log(`  findings: ${(B_audit.findings || []).map((f) => f.detail).join(" | ")}`);

// ---- §18 C. PRINTING_COMPARE Gengar - prove or withhold ------
const C_res = await MD.resolvePrintingPair({ species: "gengar" }).catch(() => null);
let C_verdict, C_detail;
if (!C_res?.ok) {
  C_verdict = "WITHHELD (resolver)";
  C_detail = C_res?.reason ?? "no gengar printing pair";
} else {
  const pA = await artPathFor(C_res.data.high.tcgplayerId);
  const pB = await artPathFor(C_res.data.low.tcgplayerId);
  const proof = provePrintingPair({ high: C_res.data.high, low: C_res.data.low, cardImagePaths: [pA, pB].filter(Boolean) });
  C_verdict = proof.ok ? "PROVEN" : proof.state;
  C_detail = proof.ok
    ? { a: proof.proof.a, b: proof.proof.b, axis: proof.proof.axis, evidence: proof.proof.evidence }
    : { reason: proof.reason, a: proof.proof?.a, b: proof.proof?.b };
}
console.log(`\nCASE C - PRINTING_COMPARE Gengar: ${C_verdict}`);
console.log(`  ${typeof C_detail === "string" ? C_detail : JSON.stringify(C_detail).slice(0, 300)}`);

writeFileSync(path.join(OUT, "meta", "A_asking_vs_sold.json"), JSON.stringify({ facts: A_facts, semantic_manifest: A_sem, comparison_calc: comparisonDirection(50.14, 199), old_artifact_extraction: A_oldArtifactExtraction, old_artifact_verdict: A_audit.ok ? "PASS" : A_audit.state, findings: A_audit.findings ?? [] }, null, 2));
writeFileSync(path.join(OUT, "meta", "B_market_snapshot.json"), JSON.stringify({ facts: B_facts, semantic_manifest: B_sem, old_artifact_extraction: B_oldArtifactExtraction, old_artifact_verdict: B_audit.ok ? "PASS" : B_audit.state, findings: B_audit.findings ?? [] }, null, 2));
writeFileSync(path.join(OUT, "meta", "C_printing_compare.json"), JSON.stringify({ verdict: C_verdict, detail: C_detail }, null, 2));

// ---- §18 generate the CORRECTED posts (--ai) ----------------
const budgets = [];
const results = { A: "not generated", B: "not generated", C: C_verdict };
if (AI && key) {
  const gen = async (label, story, layout, resolved, cardImagePaths, printingPair) => {
    const budget = newBudget(); budget.limits.background_generations = 3; budgets.push(budget);
    const r = await runFullGenerativeSocial({ story, platform: "instagram", layout, resolved, cardImagePaths, printingPair, env: process.env, budget }).catch((e) => ({ ok: false, state: "ERR", reason: e.message }));
    if (r.ok) {
      const { createRenderer } = await import("../lib/social/render.mjs");
      const rr = await createRenderer();
      await rr.renderToPng(r.finalHtml, path.join(OUT, "full", `${label}_corrected.png`));
      await rr.close?.();
      writeFileSync(path.join(OUT, "meta", `${label}_corrected_verification.json`), JSON.stringify({ fact_lock_hash: r.factLockHash?.short ?? null, verification: r.verification, selected: r.selected, regenerated: r.regenerated, extracted_claims: r.selected?.extracted_claims ?? null }, null, 2));
      return `BUFFER_READY (semantic ${r.verification.semantic}, fidelity ${r.selected?.fidelity_score ?? "?"}, quality ${r.verification.quality_verdict}${r.regenerated ? ", regenerated once" : ""})`;
    }
    writeFileSync(path.join(OUT, "meta", `${label}_corrected_verification.json`), JSON.stringify({ state: r.state, reason: r.reason, assessed: r.assessed ?? null }, null, 2));
    return `${r.state}: ${r.reason}`;
  };

  // For the CORRECTED A post use a REAL asking-vs-sold story (with a card
  // id + image). The owner's failing artifact ($50.14 vs $199) is a
  // below-market ask - use one that is also genuinely below market.
  const A_real = await MD.resolveAskingVsSold().catch(() => null);
  if (A_real?.ok) {
    const aPath = await artPathFor(A_real.data.tcgplayerId);
    const aFactsReal = { card_name: A_real.data.card_name, card_set: A_real.data.card_set, card_tcgplayer_id: A_real.data.tcgplayerId, total_price_usd: A_real.data.asking_usd, market_price: A_real.data.market_ref_usd };
    results.A = await gen("A_asking_vs_sold",
      { story_id: "5a-A", series: "WHY_SOLD_PRICES_MATTER", subject_id: "why_sold_prices_matter-proof", facts_json: aFactsReal },
      "asking_vs_sold", { data: { askingUsd: A_real.data.asking_usd, marketRefUsd: A_real.data.market_ref_usd, sold_points: A_real.data.sold_points, card: { name: A_real.data.card_name, set: A_real.data.card_set, tcgplayerId: A_real.data.tcgplayerId }, card_name: A_real.data.card_name } },
      aPath ? [aPath] : []);
  } else {
    results.A = "WITHHELD (no real asking-vs-sold story available)";
  }

  const bId = B_res?.ok ? B_res.data.featured?.tcgplayerId : null;
  const bPath = bId ? await artPathFor(bId) : null;
  results.B = await gen("B_market_snapshot",
    { story_id: "5a-B", series: "MARKET_SNAPSHOT", subject_id: "market_snapshot-proof", facts_json: B_facts },
    "market_shape", B_resolved, bPath ? [bPath] : []);

  if (C_res?.ok && C_verdict === "PROVEN") {
    const pA = await artPathFor(C_res.data.high.tcgplayerId);
    const pB = await artPathFor(C_res.data.low.tcgplayerId);
    results.C = await gen("C_printing_compare",
      { story_id: "5a-C", series: "EXACT_PRINTING_MATTERS", subject_id: "exact_printing_matters-proof", facts_json: { card_name: C_res.data.species, market_price: C_res.data.high.price_usd } },
      "printing_compare",
      { data: { species: C_res.data.species, high: C_res.data.high, low: C_res.data.low, multiple: C_res.data.multiple, relevance: C_res.data.relevance, printing_lesson: C_res.data.printing_lesson } },
      [pA, pB].filter(Boolean),
      { high: { name: C_res.data.high.name, set: C_res.data.high.set, card_number: C_res.data.high.number, market_price: C_res.data.high.price_usd }, low: { name: C_res.data.low.name, set: C_res.data.low.set, card_number: C_res.data.low.number, market_price: C_res.data.low.price_usd } });
  }
  console.log(`\nCORRECTED  A: ${results.A}\n           B: ${results.B}\n           C: ${results.C}`);
}

const cost = costReport(budgets);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const img = (f) => existsSync(path.join(OUT, "full", f)) ? `<img src="full/${f}" style="max-width:340px;border:1px solid #333">` : "&mdash;";
const idx = `<!doctype html><meta charset=utf-8><title>5A semantic auditor</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:28px;max-width:1300px}code{color:#9ad}td,th{border:1px solid #333;padding:8px;vertical-align:top}table{border-collapse:collapse;width:100%}</style>
<h1>SOCIAL-CREATIVE-5A - semantic fact auditor + brand lock</h1>
<p>generated ${new Date().toISOString()} &nbsp; corrected posts: <b>${AI ? "ON" : "OFF"}</b></p>
<h2>Owner-found P0 failures - re-audited</h2>
<table><tr><th>case</th><th>old artifact verdict (NEW auditor)</th><th>corrected post</th></tr>
<tr><td><b>A. ASKING_VS_SOLD</b><br>$50.14 ask vs $199 market<br>old said "PREMIUM -75%" + "Don't pay the ask"</td>
<td><b class="${A_audit.ok ? "" : "ok"}">${esc(A_audit.ok ? "PASS (bug)" : A_audit.state)}</b><br>direction truth: ${A_sem.comparison_direction} ${A_sem.comparison_pct}%<br>${(A_audit.findings || []).map((f) => esc(f.detail)).join("<br>")}<br><a href="meta/A_asking_vs_sold.json" style="color:#9ad">manifest + audit</a></td>
<td>${img("A_asking_vs_sold_corrected.png")}<br>${esc(results.A)}</td></tr>
<tr><td><b>B. MARKET_SNAPSHOT</b><br>${B_sem.claim_value}% of ${esc(B_sem.claim_population)}<br>old said "of ${esc(B_sem.example_card)} singles"</td>
<td><b>${esc(B_audit.ok ? "PASS (bug)" : B_audit.state)}</b><br>scope: ${B_sem.claim_scope}; example "${esc(B_sem.example_card)}" is NOT the population<br>${(B_audit.findings || []).map((f) => esc(f.detail)).join("<br>")}<br><a href="meta/B_market_snapshot.json" style="color:#9ad">manifest + audit</a></td>
<td>${img("B_market_snapshot_corrected.png")}<br>${esc(results.B)}</td></tr>
<tr><td><b>C. PRINTING_COMPARE</b><br>Gengar</td>
<td><b>${esc(C_verdict)}</b><br><code>${esc(typeof C_detail === "string" ? C_detail : JSON.stringify(C_detail).slice(0, 400))}</code><br><a href="meta/C_printing_compare.json" style="color:#9ad">identity proof</a></td>
<td>${img("C_printing_compare_corrected.png")}<br>${esc(results.C)}</td></tr>
</table>
<h2>Cost (§28)</h2><pre>${esc(JSON.stringify(cost, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b></p>`;
writeFileSync(path.join(OUT, "index.html"), idx);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, A: { verdict: A_audit.ok ? "PASS" : A_audit.state, findings: A_audit.findings, corrected: results.A }, B: { verdict: B_audit.ok ? "PASS" : B_audit.state, findings: B_audit.findings, corrected: results.B }, C: { verdict: C_verdict, detail: C_detail, corrected: results.C }, cost }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
