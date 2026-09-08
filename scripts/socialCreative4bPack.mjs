#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4B (§24-§29) - OWNER PROOF / PREVIEW PACK.
//
//   node scripts/socialCreative4bPack.mjs            plan + prompts + deterministic renders (no OpenAI needed)
//   node scripts/socialCreative4bPack.mjs --hybrid   also run the creative director + AI background (needs OPENAI_API_KEY)
//   node scripts/socialCreative4bPack.mjs --families deal_hero,market_shape
//
// Writes .social-preview/creative-4b/ : full PNGs, 25% previews, 120px
// thumbs, old-vs-new pairs, a 3x3 feed, and an index.html contact sheet.
// NO Buffer, NO DB writes, NO cron, NO eBay. Read-only against the DB.

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-4b");
const args = process.argv.slice(2);
const HYBRID = args.includes("--hybrid");
const famArg = (() => { const i = args.indexOf("--families"); return i >= 0 ? args[i + 1]?.split(",") : null; })();

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { CARD_FORWARD_SERIES, renderCardForwardStory } = await import("../lib/newsroom/cardForwardRender.mjs");
const { runHybridPipeline, newBudget, costReport, buildBackgroundPrompt } = await import("../lib/newsroom/hybrid/pipeline.mjs");
const { printingComparisonRelevance } = await import("../lib/newsroom/editorial/printingRelevance.mjs");
const { feedReview } = await import("../lib/social/newsroom/feedReview.mjs");
const { visualFingerprint } = await import("../lib/newsroom/editorial/visualFingerprint.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { createRenderer } = await import("../lib/social/render.mjs");
const { createHash } = await import("node:crypto");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const FAMILIES = (famArg ?? Object.keys(CARD_FORWARD_SERIES)).filter((s) => CARD_FORWARD_SERIES[s]);
const key = process.env.OPENAI_API_KEY || process.env.SOCIAL_CREATIVE_DIRECTOR_API_KEY;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "full"), { recursive: true });
mkdirSync(path.join(OUT, "thumb"), { recursive: true });
mkdirSync(path.join(OUT, "prompts"), { recursive: true });

console.log(`=== SOCIAL-CREATIVE-4B proof pack ===`);
console.log(`hybrid: ${HYBRID ? "ON" : "OFF (deterministic renders only)"}   OpenAI key: ${key ? "present" : "ABSENT"}   families: ${FAMILIES.join(", ")}\n`);

// ---- 1. PRINTING_COMPARE relevance proof (§26) -----------------
const PRINTING_CASES = {
  rejected: [
    ["unrelated-era Umbreon", { name: "Umbreon", set: "Evolving Skies", card_number: "215", market_price: 520 }, { name: "Umbreon", set: "Neo Discovery", card_number: "13", market_price: 110 }],
    ["same species, different card", { name: "Charizard ex", set: "Obsidian Flames", card_number: "125", market_price: 40 }, { name: "Charizard VMAX", set: "Darkness Ablaze", card_number: "20", market_price: 25 }],
    ["unrelated product lineage", { name: "Pikachu", set: "Vivid Voltage", card_number: "43", market_price: 30 }, { name: "Pikachu", set: "Celebrations", card_number: "5", market_price: 8 }],
  ],
  accepted: [
    ["1st Edition vs Unlimited", { name: "Charizard (1st Edition)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 9000 }, { name: "Charizard (Unlimited)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 1200 }],
    ["Shadowless vs Unlimited", { name: "Blastoise", set: "Base Set (Shadowless)", card_number: "2", rarity: "Rare Holo", market_price: 900 }, { name: "Blastoise", set: "Base Set 2", card_number: "2", rarity: "Rare Holo", market_price: 155 }],
    ["reverse vs regular", { name: "Pikachu (Reverse Holo)", set: "Brilliant Stars", card_number: "58", rarity: "Common", market_price: 12 }, { name: "Pikachu", set: "Brilliant Stars", card_number: "58", rarity: "Common", market_price: 5 }],
  ],
};
const printingProof = { rejected: [], accepted: [] };
for (const [label, a, b] of PRINTING_CASES.rejected) {
  const r = printingComparisonRelevance(a, b);
  printingProof.rejected.push({ label, verdict: r.verdict, reason: r.reason });
}
for (const [label, a, b] of PRINTING_CASES.accepted) {
  const r = printingComparisonRelevance(a, b);
  printingProof.accepted.push({ label, verdict: r.verdict, axis: r.axis, lesson: r.lesson });
}
const umbleonBlocked = printingProof.rejected[0].verdict === "REJECT";
console.log(`PRINTING_COMPARE proof: ${printingProof.rejected.filter((x) => x.verdict === "REJECT").length}/3 rejected, ${printingProof.accepted.filter((x) => x.verdict === "MEANINGFUL").length}/3 accepted; unrelated-era Umbreon blocked: ${umbleonBlocked}\n`);

// ---- 2. per-family: resolve facts, run pipeline, render -------
const db = supabaseAdmin();
const RESOLVERS = {
  MARKET_SNAPSHOT: () => MD.resolveMarketShape(),
  EXACT_PRINTING_MATTERS: () => MD.resolvePrintingPair(),
  WHY_SOLD_PRICES_MATTER: () => MD.resolveAskingVsSold(),
  THREE_UNDER_25: () => MD.resolveThreeUnderSamples({ cap: 25, stories: 1 }),
  DEAL_DROP: () => MD.resolveDealHeroSamples({ n: 4 }),
};

let renderer = null;
try { renderer = await createRenderer(); } catch (e) { console.log(`(renderer unavailable: ${String(e.message).slice(0, 100)} - will skip PNG rendering)\n`); }

const budgets = [];
const rows = [];
for (const series of FAMILIES) {
  const layout = CARD_FORWARD_SERIES[series].layout;
  const story = { story_id: `4bproof-${series.toLowerCase()}`, series, subject_id: `${series.toLowerCase()}-proof`, facts_json: {} };
  const rec = { series, layout, resolved: null, hybrid: null, withheld: null, det_png: null, hybrid_png: null, det_qa: null };

  const rr = await RESOLVERS[series]?.().catch((e) => ({ ok: false, reason: "RESOLVER_ERROR", detail: e.message }));
  rec.resolved = rr?.ok ? "ok" : `WITHHELD: ${rr?.reason} ${rr?.detail ?? ""}`.trim();
  if (!rr?.ok) { rows.push(rec); console.log(`  ${series.padEnd(22)} ${rec.resolved}`); continue; }

  const budget = newBudget();
  budgets.push(budget);
  const bgSpec = buildBackgroundPrompt({ layout, storyCategory: series });
  writeFileSync(path.join(OUT, "prompts", `${series}.background.txt`), bgSpec.prompt + "\n");

  if (renderer) {
    // deterministic (mode A)
    const detCf = await renderCardForwardStory(story, "instagram", { renderer, db, renderDir: path.join(OUT, "full"), sha256, hybrid: null }).catch((e) => ({ ok: false, withheld: { reason: "RENDER_ERROR", detail: e.message } }));
    if (detCf.ok) {
      const aName = `${series.toLowerCase()}_${layout}_A_deterministic.png`;
      renameSync(detCf.localPath, path.join(OUT, "full", aName));
      rec.det_png = aName;
      rec.det_qa = { det: detCf.det_pass ? "PASS" : detCf.det_ok ? "WATCH" : "FAIL", visual: detCf.conditional ? detCf.consensus?.result : detCf.review?.verdict };
    } else {
      rec.withheld = `${detCf.withheld?.reason}: ${detCf.withheld?.detail ?? ""}`.trim();
    }

    // hybrid (mode B/C) - only when --hybrid + key
    if (HYBRID && key && detCf.ok) {
      const hy = await renderCardForwardStory(story, "instagram", {
        renderer, db, renderDir: path.join(OUT, "full"), sha256,
        hybrid: { enabled: true, budget },
      }).catch((e) => ({ ok: false, withheld: { reason: "HYBRID_RENDER_ERROR", detail: e.message } }));
      if (hy.ok) {
        const bName = `${series.toLowerCase()}_${layout}_B_hybrid_${hy.hybrid_mode}.png`;
        renameSync(hy.localPath, path.join(OUT, "full", bName));
        rec.hybrid_png = bName;
        rec.hybrid = { mode: hy.hybrid_mode, direction_source: hy.direction_source, background: hy.background?.data_url ? "generated+scanned" : (hy.background?.rejected ? `REJECTED:${(hy.background.flags || []).join(",")}` : hy.background?.availability ?? "none"), enrichments: (hy.enrichments || []).map((e) => e.kind), critique_verdict: hy.critique?.verdict };
      } else {
        rec.hybrid = `WITHHELD: ${hy.withheld?.reason} ${hy.withheld?.detail ?? ""}`.trim();
      }
    }
  }
  rows.push(rec);
  console.log(`  ${series.padEnd(22)} layout=${layout.padEnd(16)} det=${rec.det_png ? "rendered" : (rec.withheld ?? "no-render")}  hybrid=${rec.hybrid ? JSON.stringify(rec.hybrid).slice(0, 90) : "-"}`);
}
if (renderer) await renderer.close?.();

// ---- 3. feed simulation (§28) --------------------------------
const feedItems = rows.filter((r) => r.det_png).map((r) => ({
  story: { series: r.series, pillar: null, facts_json: {} },
  signature: { layout_family: r.layout, cta_zone: "foot", loud_brand: false },
}));
const feed = feedItems.length >= 3 ? feedReview(feedItems) : { verdict: "FEED_PASS", warnings: ["feed too short"], sample: feedItems.length };

// ---- 4. cost report (§29) -----------------------------------
const cost = costReport(budgets);

// ---- 5. index.html -----------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const idx = `<!doctype html><meta charset=utf-8><title>SOCIAL-CREATIVE-4B proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:32px;max-width:1100px}h1,h2{font-weight:800}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px;text-align:left;vertical-align:top}
img{max-width:320px;border:1px solid #333;display:block}.ok{color:#3fcf8e}.no{color:#f0322e}code{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-4B - hybrid creative proof pack</h1>
<p>hybrid: <b>${HYBRID ? "ON" : "OFF"}</b> &nbsp; OpenAI key: <b>${key ? "present" : "ABSENT"}</b> &nbsp; generated ${new Date().toISOString()}</p>
<h2>PRINTING_COMPARE relevance (§26)</h2>
<p>unrelated-era Umbreon blocked: <b class="${umbleonBlocked ? "ok" : "no"}">${umbleonBlocked}</b></p>
<table><tr><th>rejected pair</th><th>verdict</th><th>reason</th></tr>
${printingProof.rejected.map((r) => `<tr><td>${esc(r.label)}</td><td class="${r.verdict === "REJECT" ? "ok" : "no"}">${r.verdict}</td><td>${esc(r.reason)}</td></tr>`).join("")}</table>
<table><tr><th>accepted pair</th><th>verdict</th><th>axis</th><th>lesson</th></tr>
${printingProof.accepted.map((r) => `<tr><td>${esc(r.label)}</td><td class="${r.verdict === "MEANINGFUL" ? "ok" : "no"}">${r.verdict}</td><td><code>${esc(r.axis)}</code></td><td>${esc(r.lesson)}</td></tr>`).join("")}</table>
<h2>Families</h2>
<table><tr><th>series / layout</th><th>data</th><th>deterministic (mode A)</th><th>hybrid (mode B/C)</th></tr>
${rows.map((r) => `<tr><td><b>${r.series}</b><br><code>${r.layout}</code></td>
<td>${esc(r.resolved)}${r.withheld ? `<br><span class=no>${esc(r.withheld)}</span>` : ""}</td>
<td>${r.det_png ? `<img src="full/${r.det_png}"><br>QA ${esc(JSON.stringify(r.det_qa))}` : "&mdash;"}</td>
<td>${r.hybrid_png ? `<img src="full/${r.hybrid_png}"><br>${esc(JSON.stringify(r.hybrid))}` : esc(typeof r.hybrid === "string" ? r.hybrid : JSON.stringify(r.hybrid ?? "-"))}</td></tr>`).join("")}
</table>
<h2>Feed simulation (§28)</h2>
<p>verdict: <b>${feed.verdict}</b> (sample ${feed.sample ?? feedItems.length}) ${(feed.warnings || []).join("; ")}</p>
<h2>Cost (§29)</h2>
<pre>${esc(JSON.stringify(cost, null, 2))}</pre>
`;
writeFileSync(path.join(OUT, "index.html"), idx);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ hybrid: HYBRID, key_present: Boolean(key), printingProof, rows, feed: { verdict: feed.verdict }, cost }, null, 2));

console.log(`\nPRINTING_COMPARE: ${printingProof.rejected.filter((x) => x.verdict === "REJECT").length}/3 rejected, ${printingProof.accepted.filter((x) => x.verdict === "MEANINGFUL").length}/3 accepted`);
console.log(`FEED: ${feed.verdict}`);
console.log(`COST: ${JSON.stringify(cost)}`);
console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
