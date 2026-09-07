#!/usr/bin/env node
// Phase 13E.8A - `npm run social:plan` - the DETERMINISTIC CONTENT PLANNER.
//
//   npm run social:plan                 plan TODAY   (writes PROPOSED plans)
//   npm run social:plan -- today
//   npm run social:plan -- tomorrow
//   npm run social:plan -- week          plan the next 7 days
//   npm run social:plan -- simulate      7-day DRY RUN from the committed fixture (writes NOTHING)
//   npm run social:plan -- show          print the current plans.json
//
//   --from-fixture   use tests/fixtures/social-deals.json instead of the live snapshot
//
// This command:
//   * reads ONLY local JSON (the frozen social:source snapshot + the local
//     post-history file). NO eBay call, NO Buffer call, NO render, NO
//     mutation of the publishing ledger.
//   * decides WHAT / WHICH PLATFORM / WHICH GOAL / WHEN - it does NOT
//     schedule or publish. A PLAN is not an approval.
//   * if nothing qualifies it prints "NO QUALIFYING CONTENT" and exits 0
//     (§21) - no placeholder, no stale fixture, no brand filler.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { loadSourceSnapshot, SNAPSHOT_PATH } from "./socialSource.mjs";
import { loadPostHistory } from "../lib/social/cooldown.mjs";
import { buildPlan } from "../lib/social/planner/planner.mjs";
import { loadPlans, savePlans, expireStale, replaceProposed, planCounts, PLANS_PATH } from "../lib/social/planner/plans.mjs";

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "social-deals.json");

function fixtureSnapshot() {
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  return {
    source: "fixture:tests/fixtures/social-deals.json",
    empty: !(fx.deals?.length),
    empty_reason: fx.deals?.length ? undefined : "the committed fixture has no deals",
    captured_at: fx.pulled_at,
    now: fx.pulled_at,
    note: "NON-LIVE fixture wrap",
    deals: (fx.deals ?? []).map((d) => ({ ...d, exact_verified_at: d.row?.exact_verified_at ?? null })),
    movers: fx.movers ?? [],
    carousel: fx.carousel ?? null,
  };
}

function die(m) {
  console.error(`\n  ✖ ${m}\n`);
  process.exit(1);
}

// ---- pretty output --------------------------------------------

function printSummary(plan) {
  console.log(`\n  === social:plan — ${plan.simulate ? "SIMULATION ONLY (fixture, not live)" : plan.horizon.toUpperCase()} ===`);
  console.log(`  snapshot: ${plan.snapshot_source}   captured ${plan.snapshot_captured_at}`);
  console.log(`  horizon:  ${plan.horizon_start_utc}  ->  ${plan.horizon_end_utc}`);
  console.log("");

  if (plan.empty) {
    console.log("  NO QUALIFYING CONTENT");
    console.log(`  reason: ${plan.reason}`);
    console.log("\n  Nothing was scheduled or published. This is a clean, successful run.\n");
    return;
  }

  if (!plan.entries.length) {
    console.log("  NO QUALIFYING CONTENT");
    console.log("  Every candidate was NOT_SOCIAL, on cooldown, stale past its freshness window, or capped.");
    if (plan.not_scheduled.length) {
      console.log("\n  classified but not scheduled:");
      for (const n of plan.not_scheduled) console.log(`    - ${n.family} · ${n.subject}: ${n.reason}`);
    }
    console.log("\n  No placeholder post. No stale fixture. Clean exit.\n");
    return;
  }

  console.log(`  RECOMMENDED CONTENT (${plan.entries.length} placement${plan.entries.length === 1 ? "" : "s"}):\n`);
  let i = 0;
  for (const e of plan.entries) {
    i++;
    console.log(`  ${i}. ${e.family.toUpperCase().replace("_", " ")}  [${e.quality_tier}]  goal ${e.goal}  score ${e.score}`);
    console.log(`     WHEN     ${e.time_utc}   (${e.time_brisbane} / ${e.time_us_et})`);
    console.log(`     PLATFORM ${e.platform} (${e.placement})`);
    console.log(`     CARD     ${e.subject}`);
    console.log(`     WHY      ${e.why}`);
    console.log(`     FRESH    until ${e.fresh_until_utc ?? "n/a"}`);
    console.log(`     CONTENT  ${e.content_id}`);
    console.log("");
  }

  // per-platform volume
  const byService = {};
  for (const e of plan.entries) byService[e.service] = (byService[e.service] ?? 0) + 1;
  console.log("  PLATFORM VOLUME:  " + Object.entries(byService).map(([s, n]) => `${s}=${n}`).join("  ") || "  (none)");

  // goal + family mix
  console.log("  GOAL MIX:");
  for (const [g, v] of Object.entries(plan.mix.goal.byKey)) {
    console.log(`    ${g.padEnd(11)} ${String(v.count).padStart(2)}  ${(v.share * 100).toFixed(0)}%  target ${(v.target[0] * 100).toFixed(0)}-${(v.target[1] * 100).toFixed(0)}%  [${v.status}]`);
  }
  console.log("  FAMILY MIX:");
  for (const [f, v] of Object.entries(plan.mix.family.byKey)) {
    console.log(`    ${f.padEnd(13)} ${String(v.count).padStart(2)}  ${(v.share * 100).toFixed(0)}%  target ${(v.target[0] * 100).toFixed(0)}-${(v.target[1] * 100).toFixed(0)}%  [${v.status}]`);
  }

  if (plan.unfilled.length) {
    console.log("\n  UNFILLED SLOTS (no artificial filling):");
    const shown = plan.unfilled.slice(0, 12);
    for (const u of shown) console.log(`    - ${u.service} @ ${u.time_brisbane} (${u.time_utc}) — ${u.reason}`);
    if (plan.unfilled.length > shown.length) console.log(`    … and ${plan.unfilled.length - shown.length} more`);
  }

  if (plan.not_scheduled.length) {
    console.log("\n  CLASSIFIED BUT NOT SCHEDULED:");
    for (const n of plan.not_scheduled) console.log(`    - ${n.family} · ${n.subject}${n.platform ? ` (${n.platform})` : ""}: ${n.reason}`);
  }

  if (plan.warnings.length) {
    console.log("\n  WARNINGS:");
    for (const w of plan.warnings) console.log(`    ! ${w}`);
  }

  console.log("\n  A PLAN IS NOT AN APPROVAL. Nothing was scheduled, rendered, or published.");
  console.log("  Next: a human reviews these, then runs the existing prepare-batch → review → approve-batch flow.\n");
}

// ---- main ----------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fromFixture = args.includes("--from-fixture");
  const mode = (args.find((a) => !a.startsWith("-")) || "today").toLowerCase();

  if (mode === "show") {
    const plans = loadPlans();
    console.log(JSON.stringify({ path: path.relative(ROOT, PLANS_PATH), counts: planCounts(plans), plans }, null, 2));
    return;
  }

  const HORIZONS = { today: "today", tomorrow: "tomorrow", week: "week", simulate: "week" };
  if (!HORIZONS[mode]) die(`unknown mode "${mode}". one of: today, tomorrow, week, simulate, show`);
  const simulate = mode === "simulate";

  const snapshot = simulate || fromFixture ? fixtureSnapshot() : loadSourceSnapshot();
  if (!snapshot) {
    console.log("\n  NO QUALIFYING CONTENT");
    console.log(`  reason: no frozen snapshot at ${path.relative(ROOT, SNAPSHOT_PATH)} — run  npm run social:source -- live  first`);
    console.log("\n  Clean exit. Nothing scheduled.\n");
    return;
  }

  const history = loadPostHistory();
  const now = Date.now();
  const plan = buildPlan({ snapshot, history, horizon: HORIZONS[mode], now, simulate });

  printSummary(plan);

  // persist PROPOSED plans for a real run (never for a simulation)
  if (!simulate && !plan.empty && plan.entries.length) {
    const existing = expireStale(loadPlans(), now).plans;
    const fresh = plan.entries.map((e) => ({ ...e, planned_at: new Date(now).toISOString(), snapshot_source: plan.snapshot_source, history: [] }));
    const merged = replaceProposed(existing, fresh, { horizonStartUtc: plan.horizon_start_utc, horizonEndUtc: plan.horizon_end_utc });
    savePlans(merged);
    console.log(`  wrote ${fresh.length} PROPOSED plan(s) to ${path.relative(ROOT, PLANS_PATH)}  (counts: ${JSON.stringify(planCounts(merged))})\n`);
  } else if (simulate) {
    console.log("  SIMULATION — plans.json was NOT modified.\n");
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
