#!/usr/bin/env node
// Phase SOCIAL-ANALYTICS-1 §32 - MANUAL ANALYTICS COMMAND (READ-ONLY).
//
//   node scripts/socialAnalytics1.mjs --placement <id>   collect + report one placement
//   node scripts/socialAnalytics1.mjs --recent           collect + report every real placement with a provider_ref
//   node scripts/socialAnalytics1.mjs --all --dry-run    report only, no provider calls, no writes
//
// READ-ONLY provider interaction only (getPostStatus/getPostMetrics).
// This script contains no createPost, no deletePost, no reschedule, no
// caption/asset edit, and cannot reach one transitively - see
// tests/scanner/social-analytics-1.test.mjs for a static proof.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const placementIdx = argv.indexOf("--placement");
const PLACEMENT_ID = placementIdx >= 0 ? argv[placementIdx + 1] : null;
const MODE = PLACEMENT_ID ? "placement" : argv.includes("--recent") ? "recent" : argv.includes("--all") ? "all" : null;

if (!MODE) {
  console.log("Usage: node scripts/socialAnalytics1.mjs --placement <id> | --recent | --all [--dry-run]");
  process.exit(1);
}

const { collectOnePlacementMetrics, collectPublishedPostMetrics, placementAnalyticsState } = await import("../lib/social/analytics/collect.mjs");
const { joinPerformanceToStory } = await import("../lib/social/analytics/join.mjs");
const { loadMetricSnapshots } = await import("../lib/social/analytics/metricsHistory.mjs");
const db = await import("../lib/social/newsroom/db.mjs");

console.log(`=== SOCIAL-ANALYTICS-1 (READ-ONLY) === mode=${MODE} dry_run=${DRY_RUN}\n`);

async function reportOne(placement) {
  const { rows: existingSnapshots } = await loadMetricSnapshots(placement.placement_id);
  if (!placement.buffer_provider_ref) {
    console.log(`  [${placement.platform}] ${placement.placement_id}: ${placementAnalyticsState(placement)} - no provider_ref yet.`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  [${placement.platform}] ${placement.placement_id}: dry-run, ${existingSnapshots.length} existing snapshot(s), state=${placementAnalyticsState(placement, { snapshotCount: existingSnapshots.length })}`);
    return;
  }
  const result = await collectOnePlacementMetrics(placement, { persist: true });
  if (!result.ok) {
    console.log(`  [${placement.platform}] ${placement.placement_id}: ${result.state} (${result.failure_class ?? result.reason})`);
    return;
  }
  const joined = joinPerformanceToStory(result.snapshot, placement);
  console.log(`  [${placement.platform}] ${placement.placement_id}: snapshot recorded (written=${result.persist?.written}). reported=${result.reported?.join(",") || "(none yet)"}`);
  console.log(`    engagement_rate: ${joined.kpis.engagement_rate.value ?? "·"} (basis: ${joined.kpis.engagement_rate.basis ?? "—"})`);
}

if (MODE === "placement") {
  const { row } = await db.getPlacement(PLACEMENT_ID);
  if (!row) { console.log(`  placement ${PLACEMENT_ID} not found.`); process.exit(1); }
  await reportOne(row);
} else {
  const { rows } = await db.loadPlacements({ limit: 500 });
  const targets = MODE === "recent" ? rows.filter((r) => r.buffer_provider_ref) : rows;
  console.log(`  ${targets.length} placement(s) to check.\n`);
  for (const placement of targets) {
    // eslint-disable-next-line no-await-in-loop
    await reportOne(placement);
  }
}

console.log("\nREAD-ONLY run complete. No provider write of any kind was made.\n");
