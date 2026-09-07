#!/usr/bin/env node
// Phase 13E.10A - `npm run social:experiments` - CONVERSION EXPERIMENT SYSTEM.
//
//   npm run social:experiments -- slate         show the hook/CTA libraries + the experiment slate
//   npm run social:experiments -- report        READ-ONLY evaluator: per-variant funnel + score + learning state
//   npm run social:experiments -- review-pack   dry-run side-by-side pack for E1-E4 (fixture only, SIMULATION)
//   npm run social:experiments -- assign <content_id> <platform>   show the deterministic variant assignment
//
// READ ONLY. This command NEVER publishes, schedules, renders, calls
// Buffer, calls eBay, or promotes a winner. It reads local JSON only.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { loadLedger } from "../lib/social/distribution/ledger.mjs";
import { EXPERIMENTS, PRIMARY_EXPERIMENT_BY_FAMILY, experimentsForFamily } from "../lib/social/experiments/experiments.mjs";
import { HOOK_VARIANTS, HOOK_IDS } from "../lib/social/experiments/hooks.mjs";
import { CTA_VARIANTS, CTA_IDS } from "../lib/social/experiments/ctas.mjs";
import { explainAssignment } from "../lib/social/experiments/assignment.mjs";
import { reportAll } from "../lib/social/experiments/report.mjs";
import { buildReviewPack } from "../lib/social/experiments/reviewPack.mjs";
import { MIN_PLACEMENTS, EXPLOITATION_POLICY } from "../lib/social/experiments/learning.mjs";
import { SCORE_WEIGHTS } from "../lib/social/experiments/score.mjs";

const ROOT = process.cwd();
const ATTR_IMPORT = path.join(ROOT, ".social-preview", "metrics", "attribution-import.json");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "social-deals.json");
const OUT_DIR = path.join(ROOT, ".social-preview", "experiment-review-pack");

const readJson = (p, fb = null) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
};
const die = (m) => {
  console.error(`\n  ✖ ${m}\n`);
  process.exit(1);
};
const fmt = (v) => (v == null ? "·" : typeof v === "number" ? (v <= 1 ? `${(v * 100).toFixed(1)}%` : v.toFixed(2)) : String(v));

// ---- slate ----------------------------------------------------

function cmdSlate() {
  console.log("\n  === CONVERSION EXPERIMENT SLATE (13E.10A) ===\n");
  console.log("  HOOK LIBRARY:");
  for (const id of HOOK_IDS) console.log(`    ${id.padEnd(24)} ${HOOK_VARIANTS[id].label}`);
  console.log("\n  CTA LIBRARY:");
  for (const id of CTA_IDS) console.log(`    ${id.padEnd(24)} "${CTA_VARIANTS[id].label}"  → ${CTA_VARIANTS[id].destinations.join(", ")}`);
  console.log("\n  EXPERIMENTS (one primary variable each):");
  for (const e of EXPERIMENTS) {
    console.log(`\n    ${e.experiment_id}   [${e.dimension}]  applies to: ${e.applies_to.join(", ")}`);
    console.log(`      hypothesis: ${e.hypothesis}`);
    console.log(`      A = ${JSON.stringify(e.variants.A)}`);
    console.log(`      B = ${JSON.stringify(e.variants.B)}`);
  }
  console.log("\n  PRIMARY EXPERIMENT PER FAMILY (the one the planner runs first, §22):");
  for (const [fam, id] of Object.entries(PRIMARY_EXPERIMENT_BY_FAMILY)) console.log(`    ${fam.padEnd(14)} ${id ?? "(none - minimal experimentation)"}`);
  console.log("\n  SCORE WEIGHTS:  " + Object.entries(SCORE_WEIGHTS).map(([k, w]) => `${k}=${w}`).join("  "));
  console.log("  LEARNING MINIMUMS (published placements / variant):  " + Object.entries(MIN_PLACEMENTS).map(([k, v]) => `${k}>=${v}`).join("  "));
  console.log(`  EXPLOITATION POLICY (design only): ${Math.round(EXPLOITATION_POLICY.winner_share * 100)}% winner / ${Math.round(EXPLOITATION_POLICY.explore_share * 100)}% explore, enabled=${EXPLOITATION_POLICY.enabled}`);
  console.log("");
}

// ---- report --------------------------------------------------

function cmdReport() {
  const ledger = loadLedger();
  const attrRaw = readJson(ATTR_IMPORT, {});
  const attrByCid = attrRaw && typeof attrRaw === "object" ? attrRaw : {};
  const reports = reportAll(ledger, attrByCid);

  console.log("\n  === EXPERIMENT REPORT (read-only) ===\n");
  const anyPublished = ledger.some((r) => r.status === "PUBLISHED" && r.experiment_id);
  if (!anyPublished) {
    console.log("  NO QUALIFYING DATA — nothing with an experiment_id has been published yet.");
    console.log("  All variant states: NOT_AVAILABLE_YET. (No fake 0 performance is shown.)\n");
  }

  for (const rep of reports) {
    console.log(`  ${rep.experiment_id}   [${rep.dimension}]`);
    console.log(`    hypothesis: ${rep.hypothesis}`);
    for (const key of ["A", "B"]) {
      const v = rep.variants[key];
      const c = v.components ?? {};
      console.log(
        `    ${key} ${String(v.label).padEnd(24)} placements=${v.n}  impr=${fmt(v.funnel?.impressions)}  visits=${fmt(v.funnel?.siteVisits)}  ` +
        `outbound=${fmt(v.funnel?.affiliateOutbound)}  outbound_rate=${fmt(c.affiliate_outbound_rate?.value)}  website_ctr=${fmt(c.website_ctr?.value)}  ` +
        `score=${fmt(v.score)}  ${v.state ? `[${v.state}]` : ""}`
      );
    }
    console.log(`    STATE: ${rep.state}   CURRENT LEADER: ${rep.leader}${rep.note ? `   (${rep.note})` : ""}\n`);
  }
  console.log("  This evaluator does NOT change production creative. A human decides. (§14, §15)\n");
}

// ---- review-pack --------------------------------------------

function fixtureCandidates() {
  const fx = readJson(FIXTURE);
  if (!fx) die(`no fixture at ${path.relative(ROOT, FIXTURE)}`);
  const deal_drop = (fx.deals ?? []).map((d) => ({
    content_id: `fx-deal-${d.row?.id}`,
    card_name: d.row?.card_name,
    card_set: d.row?.card_set,
    species: String(d.row?.card_name ?? "").split(" ")[0]?.toLowerCase() ?? null,
    card_tcgplayer_id: d.row?.card_tcgplayer_id,
    total_price_usd: d.row?.total_price_usd,
    market_price: d.row?.market_price,
    discount_pct: d.row?.discount_pct,
    freshness_state: d.freshness_state ?? "FRESH",
  }));
  const market_mover = (fx.movers ?? []).map((m) => ({
    content_id: `fx-mover-${m.row?.id}`,
    card_name: m.row?.card_name,
    card_set: m.row?.card_set,
    species: String(m.row?.card_name ?? "").split(" ")[0]?.toLowerCase() ?? null,
    card_tcgplayer_id: m.row?.card_tcgplayer_id,
    total_price_usd: m.row?.total_price_usd,
    market_price: m.row?.market_price,
    discount_pct: m.row?.discount_pct,
    movement: m.movement ?? null,
    freshness_state: "MARKET_DATA",
  }));
  const carouselN = fx.carousel?.deals?.length ?? 0;
  const hook_carousel = carouselN >= 3
    ? [{ content_id: `fx-carousel-${fx.carousel.species}`, species: fx.carousel.species, item_count: carouselN, freshness_state: "FRESH" }]
    : [];
  return { deal_drop, market_mover, hook_carousel, capturedAt: fx.pulled_at };
}

function cmdReviewPack() {
  const c = fixtureCandidates();
  const pack = buildReviewPack(c, { snapshotSource: "fixture:tests/fixtures/social-deals.json", capturedAt: c.capturedAt });
  mkdirSync(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, "manifest.json");
  writeFileSync(p, JSON.stringify(pack, null, 2) + "\n", "utf8");

  console.log(`\n  === EXPERIMENT REVIEW PACK ===`);
  console.log(`  ${pack.label}\n`);
  for (const it of pack.items) {
    console.log(`  ${it.experiment_id}  [${it.dimension}]  family=${it.creative_family}  → ${it.destination_kind}`);
    console.log(`    hypothesis: ${it.hypothesis}`);
    console.log(`    why it matters: ${it.why_this_test_matters}`);
    if (it.unavailable_reason) {
      console.log(`    UNAVAILABLE — ${it.unavailable_reason}\n`);
      continue;
    }
    for (const ex of it.examples) {
      console.log(`    ── ${ex.subject}   facts: ${JSON.stringify(ex.facts_used)}`);
      console.log(`       A (${ex.variant_A.hook_variant}/${ex.variant_A.cta_variant}): ${ex.variant_A.ok ? `"${ex.variant_A.hook_text}"  +  CTA "${ex.variant_A.cta_label}"` : `NOT RENDERABLE — ${ex.variant_A.reason}`}`);
      console.log(`       B (${ex.variant_B.hook_variant}/${ex.variant_B.cta_variant}): ${ex.variant_B.ok ? `"${ex.variant_B.hook_text}"  +  CTA "${ex.variant_B.cta_label}"` : `NOT RENDERABLE — ${ex.variant_B.reason}`}`);
    }
    console.log("");
  }
  console.log(`  manifest: ${path.relative(ROOT, p)}`);
  console.log("  SIMULATION ONLY. Nothing was rendered to a real creative, published, or scheduled.\n");
}

// ---- assign -------------------------------------------------

function cmdAssign(contentId, platform) {
  if (!contentId || !platform) die("usage: social:experiments -- assign <content_id> <platform>");
  console.log(`\n  === DETERMINISTIC ASSIGNMENT for  ${contentId}  on  ${platform}  ===\n`);
  for (const e of EXPERIMENTS) {
    const a = explainAssignment(e.experiment_id, { contentId, platform });
    console.log(`  ${e.experiment_id}  [${e.dimension}]  applies to ${e.applies_to.join(", ")}`);
    console.log(`    key    ${a.key}`);
    console.log(`    sha256 ${a.sha256}`);
    console.log(`    first32 ${a.first32_bits}  mod 2 = ${a.bucket}  →  variant ${a.variant}  (${JSON.stringify(e.variants[a.variant])})`);
    console.log("");
  }
  console.log("  Same content_id + platform always maps here. No Date.now(), no random().\n");
}

// ---- main --------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const cmd = (args.find((a) => !a.startsWith("-")) || "slate").toLowerCase();
  const rest = args.filter((a) => !a.startsWith("-") && a !== cmd);
  switch (cmd) {
    case "slate":
      return cmdSlate();
    case "report":
      return cmdReport();
    case "review-pack":
      return cmdReviewPack();
    case "assign":
      return cmdAssign(rest[0], rest[1]);
    default:
      die(`unknown command "${cmd}". one of: slate, report, review-pack, assign`);
  }
}

main();
