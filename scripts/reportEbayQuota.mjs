#!/usr/bin/env node
// Phase 14R - local, admin-only, READ-ONLY daily eBay Browse quota report.
//
//   npm run ebay:quota-report [-- --date 2026-09-10] [-- --json]
//
// Reads today's (or --date's) ebay_job_runs rows (supabase/
// ebay_job_runs_migration.sql, written by lib/ebayTelemetry.js) and prints
// a summary: total Browse calls, calls by job, calls by hour, calls
// skipped by reserve/rate-limit, Phase 14Q dedupe-savings counters, quota
// remaining, the largest consumer, the peak hour, and a linear end-of-day
// projection from the current burn rate.
//
// Makes ZERO eBay calls itself - one Supabase read only. Requires
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same as every
// other admin script in this repo).

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { summarizeEbayQuotaDay } from "../lib/ebayQuotaReport.js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

function parseArgs(argv) {
  const out = { json: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--date") out.date = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY - see .env.local.");
    process.exitCode = 1;
    return;
  }
  const db = createClient(url, key);

  const dayStart = args.date ? new Date(`${args.date}T00:00:00.000Z`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const now = new Date();

  const { data, error } = await db
    .from("ebay_job_runs")
    .select("*")
    .gte("started_at", dayStart.toISOString())
    .lt("started_at", dayEnd.toISOString())
    .order("started_at", { ascending: true });

  if (error) {
    // Most likely cause: the migration hasn't been applied yet.
    console.error(`ebay_job_runs read failed (has supabase/ebay_job_runs_migration.sql been applied?): ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const report = summarizeEbayQuotaDay(data ?? [], { dayStart, now });

  if (args.json) {
    console.log(JSON.stringify({ date: dayStart.toISOString().slice(0, 10), ...report }, null, 2));
    return;
  }

  console.log(`eBay Browse quota report - ${dayStart.toISOString().slice(0, 10)} (UTC)`);
  console.log(`  invocations recorded: ${report.invocationCount}`);
  console.log(`  total Browse calls:   ${report.totalBrowseCalls}`);
  console.log(`  total Analytics calls (separate pool): ${report.totalAnalyticsCalls}`);
  console.log(`  graded-detail calls (subset of Browse): ${report.totalGradedDetailCalls}`);
  console.log(`  calls skipped (cap reached, not dedupe): ${report.totalCallsSkipped}`);
  console.log(`  14Q dedupe saved - image: ${report.dedupeSavedImage}, grading: ${report.dedupeSavedGrading}, total: ${report.dedupeSavedTotal}`);
  console.log(`  skipped invocations - quota_reserve: ${report.skippedByReserve}, any rate-limit reason: ${report.skippedByRateLimit}`);
  console.log(`  quota remaining (latest observed): ${report.quotaRemaining ?? "unobserved"} / ${report.quotaLimit ?? "?"}`);
  console.log(`  largest consumer: ${report.largestConsumer ?? "n/a"} (${report.largestConsumerCalls} calls)`);
  console.log(`  peak hour (UTC): ${report.peakHour ?? "n/a"} (${report.peakHourCalls} calls)`);
  console.log(`  burn rate: ${report.burnRatePerHour != null ? report.burnRatePerHour.toFixed(1) + "/hr" : "n/a (too early in the day)"}`);
  console.log(`  estimated end-of-day total: ${report.estimatedEndOfDay ?? "n/a"}`);
  console.log("  by job:");
  for (const [job, agg] of Object.entries(report.byJob)) {
    console.log(`    ${job}: ${agg.browseCalls} calls over ${agg.invocations} invocation(s) (skipped ${agg.skipped}, errors ${agg.errors})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
