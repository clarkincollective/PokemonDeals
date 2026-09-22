#!/usr/bin/env node
// PRINTING-REPAIR PROGRESS. READ-ONLY. No provider call, no write, no
// polling loop - one pass over retained data and exit.
//
//   node scripts/integrity/printingRepairProgress.mjs
//   node scripts/integrity/printingRepairProgress.mjs --snapshot-dir=<dir>
//   node scripts/integrity/printingRepairProgress.mjs --snapshot=<file.json>
//
// WHAT THIS FIXES. The previous version identified the cohort by asking
// the live table which rows still carry an unevidenced parallel
// reference - it read `reference_printing`. Invalidation NULLs that
// column, so after it ran the monitor printed "0 refused by the
// containment gate" while 207 references were still unresolved. The set
// it measured had been emptied by the fix itself, and a zero there
// silently read as "nothing left to do".
//
// So membership now comes from the invalidation snapshots' STABLE DEAL
// IDS, captured before the change. No mutable field decides who is in
// the cohort. The containment-gate figure is still printed because it is
// useful for catching NEW bad references, but it is reported in its own
// section and says explicitly that it is not a backlog measure.
//
// The four states are mutually exclusive and reconcile to the original
// cohort total. An id that cannot be read is reported as unassessable,
// never dropped - a partial read must not look like progress.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const Q = req("../../lib/dealQuality.js");
const C = req("../../lib/printingCohortProgress.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const SNAP_DIR = args["snapshot-dir"] ?? join(".local", "printing-invalidation");

// ---- cohort: stable ids, or an explicit refusal to report -----------
const snapshotFiles = args.snapshot
  ? [args.snapshot]
  : existsSync(SNAP_DIR)
    ? readdirSync(SNAP_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => join(SNAP_DIR, f))
    : [];

if (snapshotFiles.length === 0) {
  console.error(`NO COHORT SNAPSHOT FOUND (looked in ${SNAP_DIR}).`);
  console.error("");
  console.error("Cohort membership is the snapshot's list of deal ids. Without it this");
  console.error("script cannot tell which rows were invalidated, and it will NOT fall back");
  console.error("to a live-table query on reference_printing - that is the exact mistake");
  console.error("this rewrite exists to remove. Reporting nothing is correct here;");
  console.error("reporting a zero would not be.");
  process.exit(2);
}

const snapshots = [];
const unreadable = [];
for (const f of snapshotFiles) {
  try {
    snapshots.push(JSON.parse(readFileSync(f, "utf8")));
  } catch (e) {
    unreadable.push({ f, message: e.message });
  }
}
const cohortIds = C.cohortIdsFromSnapshots(snapshots);

console.log("COHORT (stable deal ids from the invalidation snapshots)");
for (const s of snapshots) console.log(`  captured ${s.capturedAt ?? "(no timestamp)"}  ${s.rows?.length ?? 0} rows`);
for (const u of unreadable) console.log(`  UNREADABLE ${u.f}: ${u.message}`);
console.log(`  distinct ids in cohort: ${cohortIds.length}`);
if (unreadable.length) console.log(`  WARNING: ${unreadable.length} snapshot file(s) unreadable - the cohort below may be incomplete.`);
console.log("");

// ---- current state of each member -----------------------------------
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rowsById = new Map();
let readFailed = 0;
for (let i = 0; i < cohortIds.length; i += 200) {
  const chunk = cohortIds.slice(i, i + 200);
  const { data, error } = await db.from("deals").select("*").in("id", chunk);
  if (error) {
    // Not fatal and not silently retried: the ids in this chunk simply
    // stay absent from rowsById and fall out as unassessable, which the
    // reconciliation then shows.
    readFailed += chunk.length;
    console.log(`  read error on ids ${chunk[0]}-${chunk[chunk.length - 1]}: ${error.message}`);
    continue;
  }
  for (const r of data ?? []) rowsById.set(r.id, r);
}

const report = C.reconcileCohort(cohortIds, rowsById);

const LABEL = {
  active_unresolved: "Active, reference unresolved",
  active_resolved: "Active, reference resolved",
  inactive_ended: "Inactive / ended",
  unassessable: "Missing or unassessable",
};
console.log("CURRENT STATE (mutually exclusive; reconciles to the cohort total)");
for (const s of C.STATES) console.log(`  ${LABEL[s].padEnd(30)} ${String(report.counts[s]).padStart(4)}`);
console.log(`  ${"-".repeat(30)} ----`);
console.log(`  ${"TOTAL".padEnd(30)} ${String(report.accounted).padStart(4)}  of ${report.total} in cohort`);
console.log(`  reconciles: ${report.reconciles ? "YES" : "NO - INVESTIGATE"}`);
if (readFailed) console.log(`  (${readFailed} id(s) could not be read this run and are counted as unassessable)`);
console.log("");

if (report.counts.active_unresolved > 0) {
  console.log("  why the unresolved are unresolved (breakdown of the count above)");
  for (const [k, v] of Object.entries(report.unresolvedBreakdown)) {
    if (v) console.log(`    ${k.padEnd(30)} ${String(v).padStart(4)}`);
  }
  console.log("");
}

console.log('  "Resolved" means a reference supported under the identity and provenance');
console.log("  rules (savingsClaimTrusted). A residual market_price is NOT proof of");
console.log("  repair, and a positive discount is NOT required - a correctly matched");
console.log("  reference may price a listing at or above market.");
console.log("");

// ---- containment gate: a DIFFERENT measure, labelled as such --------
//
// Kept because it catches NEW unevidenced parallel references arriving
// from the pipeline. It is NOT the backlog: it reads reference_printing,
// which invalidation cleared, so every repaired-by-clearing row is
// invisible to it by construction.
const live = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("deals").select("*").eq("is_active", true).range(from, from + 999);
  if (error) { console.log(`  containment-gate scan read error: ${error.message}`); break; }
  if (!data?.length) break;
  live.push(...data);
  if (data.length < 1000) break;
}
const refused = live.filter((r) => Q.isDisplayableDeal(r) && Q.referenceIsUnevidencedParallelPrinting(r));

console.log("CONTAINMENT GATE (separate measure - NOT the repair backlog)");
console.log(`  displayable rows refused for an unevidenced parallel reference: ${refused.length}`);
console.log("  This counts rows that still HAVE a parallel reference_printing. Invalidation");
console.log("  cleared that column, so a cohort member is invisible here whether or not it");
console.log("  has been repaired.");
console.log(`  ZERO HERE DOES NOT MEAN ZERO UNRESOLVED REFERENCES: ${report.counts.active_unresolved} cohort`);
console.log("  member(s) are still unresolved above. Read this line as 'no NEW bad");
console.log("  references are reaching display', nothing more.");

process.exit(report.reconciles ? 0 : 1);
