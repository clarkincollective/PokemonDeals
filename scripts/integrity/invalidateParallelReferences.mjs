#!/usr/bin/env node
// EXPLICIT INVALIDATION of unevidenced parallel-printing references.
//
//   node scripts/integrity/invalidateParallelReferences.mjs              # dry run + cohort snapshot
//   node scripts/integrity/invalidateParallelReferences.mjs --canary=3   # write 3, through the real path
//   node scripts/integrity/invalidateParallelReferences.mjs --apply      # the rest of the cohort
//   node scripts/integrity/invalidateParallelReferences.mjs --rollback=<snapshot.json>
//
// WHY THIS EXISTS. The upstream matcher stops NEW bad references, but a
// row written before it shipped keeps its old one. When printing
// resolution now fails, the scanner SKIPS the listing - and skipping
// writes nothing, so the stale invalid reference survives as the row's
// CURRENT usable data. The display gate refuses the claim, so nothing
// wrong is shown; but "invisible because a gate caught it" is not the
// same as "corrected", and silent stale-reference retention is the thing
// this closeout is meant to eliminate.
//
// WHAT IT CHANGES, and nothing else. Only the comparison columns:
// market_price, discount_pct and the reference_* provenance set, via
// updateWithProvenance - the repository's existing column-scoped, safe
// update. It does NOT touch:
//   * first_seen_at / last_seen_at / exact_verified_at - a reference
//     check is not an availability observation, and moving those would
//     make a listing look freshly verified when it was not;
//   * price_history or listing_observations - the old comparison stays
//     in the audit record exactly as it was observed;
//   * is_active, or anything that decides whether the listing shows.
//
// Verified before writing: a listing with its reference cleared is still
// isDisplayableDeal === true. It remains available as a plain merchant
// listing with no savings claim, which is the correct end state - not
// hidden for lacking a trustworthy reference.
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const req = createRequire(import.meta.url);
const Q = req("../../lib/dealQuality.js");
const { CARD_REFERENCE_COLUMNS, clearedReference } = req("../../lib/referenceProvenance.js");
const { updateWithProvenance } = req("../../lib/referenceProvenanceDb.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const APPLY = "apply" in args;
const CANARY = args.canary ? Number(args.canary) : 0;
const ROLLBACK = args.rollback;
const SNAP_DIR = join(".local", "printing-invalidation");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// The exact fields this script may write. Listed explicitly so a reader
// can confirm at a glance that no availability or history column is here.
const MUTABLE = ["market_price", "discount_pct", ...CARD_REFERENCE_COLUMNS];

function invalidationValues() {
  return { market_price: null, discount_pct: null, ...clearedReference(CARD_REFERENCE_COLUMNS) };
}

// ---------------------------------------------------------- rollback
if (ROLLBACK) {
  const snap = JSON.parse(readFileSync(ROLLBACK, "utf8"));
  console.log(`ROLLBACK from ${ROLLBACK} (cohort captured ${snap.capturedAt}, ${snap.rows.length} rows)\n`);
  let restored = 0;
  for (const r of snap.rows) {
    const values = {};
    for (const k of MUTABLE) values[k] = r.before[k] ?? null;
    const { error } = await updateWithProvenance(db, "deals", values, "id", r.id, {});
    if (error) console.log(`  x ${r.id}: ${error.message}`);
    else restored++;
  }
  console.log(`\n  restored ${restored}/${snap.rows.length}`);
  process.exit(0);
}

// ------------------------------------------------------------ cohort
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("deals").select("*").eq("is_active", true).range(from, from + 999);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}
const live = rows.filter((r) => Q.isDisplayableDeal(r));
// The cohort is defined by the SHIPPED gate, so it is exactly the set
// whose claims production is already refusing.
const cohort = live.filter((r) => Q.referenceIsUnevidencedParallelPrinting(r));

const capturedAt = new Date().toISOString();
console.log(`cohort captured   ${capturedAt}`);
console.log(`active rows       ${rows.length}`);
console.log(`displayable       ${live.length}`);
console.log(`COHORT            ${cohort.length}  (unevidenced parallel reference, claim already refused)\n`);

if (cohort.length === 0) {
  console.log("  nothing to invalidate - the cohort is empty (idempotent re-run).");
  process.exit(0);
}

const snapshot = {
  capturedAt,
  mutableColumns: MUTABLE,
  rows: cohort.map((r) => ({
    id: r.id,
    listing_id: r.listing_id,
    title: r.title,
    before: Object.fromEntries(MUTABLE.map((k) => [k, r[k] ?? null])),
  })),
};
mkdirSync(SNAP_DIR, { recursive: true });
const snapPath = join(SNAP_DIR, `cohort-${capturedAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
console.log(`  snapshot (rollback source): ${snapPath}`);

const byPrinting = {};
for (const r of cohort) byPrinting[r.reference_printing] = (byPrinting[r.reference_printing] ?? 0) + 1;
console.log(`  by reference_printing: ${Object.entries(byPrinting).map(([k, v]) => `${k}=${v}`).join(", ")}`);

if (!APPLY && !CANARY) {
  console.log("\n  (dry run - pass --canary=N to write a few, then --apply for the rest)");
  console.log(`  would clear: ${MUTABLE.join(", ")}`);
  console.log("  would NOT touch: first_seen_at, last_seen_at, exact_verified_at, price_history, listing_observations, is_active");
  process.exit(0);
}

// ------------------------------------------------------------- write
const target = CANARY ? cohort.slice(0, CANARY) : cohort;
console.log(`\n${CANARY ? `CANARY (${target.length})` : `APPLY (${target.length})`}\n`);
let ok = 0;
const failed = [];
for (const r of target) {
  const { error } = await updateWithProvenance(db, "deals", invalidationValues(), "id", r.id, {});
  if (error) {
    failed.push({ id: r.id, error: error.message });
    console.log(`  x ${r.id}: ${error.message}`);
    continue;
  }
  ok++;
  if (CANARY) console.log(`  ok ${r.id}  ${String(r.reference_printing).padEnd(18)} was $${r.market_price} / ${Math.round(r.discount_pct * 100)}%  ${String(r.title).slice(0, 44)}`);
}
console.log(`\n  invalidated ${ok}/${target.length}${failed.length ? `, ${failed.length} failed` : ""}`);
console.log(`  rollback: node scripts/integrity/invalidateParallelReferences.mjs --rollback=${snapPath}`);
process.exit(failed.length ? 1 : 0);
