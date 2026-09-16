#!/usr/bin/env node
// SEO-2.5 - ONE backfill snapshot of the state `deals` happens to retain.
//
//   npm run observations:backfill            # report only, writes nothing
//   npm run observations:backfill -- --apply # write the snapshot
//
// WHAT THIS CAN AND CANNOT DO.
//
// CAN: record, for every stored listing, the single state the `deals` row
// currently holds - its price, its stored reference, its discount, its
// condition, its screening state. That is real, it is what the system
// concluded, and it is worth keeping.
//
// CANNOT: reconstruct history. There is none. A fixed-price listing's row
// was written at first sighting and never updated, and an auction's row was
// overwritten in place by re-pricing, so the intermediate states are gone.
// This script does NOT invent daily rows between first_seen_at and
// last_seen_at, and it never will - synthetic observations would poison
// every future study far more than missing ones.
//
// Every row it writes carries kind='backfill' and observation_date =
// last_seen_at's UTC day, so analysis can exclude it from any time series
// with one predicate. A backfill row can never collide with a live daily
// observation: each uniqueness index is partial on its own kind.
//
// IDEMPOTENT (SEO-2.5.2). Re-running, or resuming after an interruption,
// converges on exactly one backfill row per (source, marketplace,
// listing_id, observation_date). That guarantee is the database's:
// listing_observations_backfill_uniq, added by
// supabase/listing_observations_backfill_uniq_migration.sql, which MUST be
// run before the first --apply. Without it there is no constraint on
// backfill rows and a second run would duplicate the whole snapshot.
// See lib/listingObservationsBackfill.js for the write mechanism.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const require = createRequire(import.meta.url);
const { buildObservation } = require("../lib/listingObservations.js");
const { isMissingObservationTableError, BACKFILL_UNIQUE_CONSTRAINT } = require("../lib/listingObservationsDb.js");
const { fetchExistingBackfillKeys, planBackfill, writeBackfillObservations } = require("../lib/listingObservationsBackfill.js");

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000;

async function main() {
  const probe = await db.from("listing_observations").select("id").limit(1);
  if (probe.error) {
    if (isMissingObservationTableError(probe.error)) {
      console.error("listing_observations does not exist yet - run supabase/listing_observations_migration.sql first.");
      process.exit(1);
    }
    throw new Error(probe.error.message);
  }

  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("deals")
      .select(
        "source, marketplace, listing_id, watchlist_id, price, shipping, total_price, total_price_usd, currency, " +
          "market_price, discount_pct, reference_amount, reference_currency, reference_source, reference_observed_at, " +
          "listing_type, condition, is_graded, grader, grade, card_language, is_active, disqualified_reason, " +
          "visual_authenticity_status, exact_verified_at, first_seen_at, last_seen_at"
      )
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`deals read failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const observations = [];
  let skipped = 0;
  for (const r of rows) {
    // The snapshot is dated to when the listing was LAST actually seen, not
    // to today: that is the moment this state was true.
    const o = buildObservation(r, { kind: "backfill", now: Date.parse(r.last_seen_at ?? r.first_seen_at ?? Date.now()) });
    if (!o) { skipped++; continue; }
    observations.push(o);
  }

  const withRef = observations.filter((o) => o.reference_amount != null).length;
  const withCard = observations.filter((o) => o.watchlist_id != null).length;
  console.error(`deals rows read            : ${rows.length}`);
  console.error(`backfill observations built: ${observations.length} (skipped ${skipped})`);
  console.error(`  with reference provenance: ${withRef} (${((withRef / observations.length) * 100).toFixed(1)}%)`);
  console.error(`  with point-in-time card  : ${withCard} (${((withCard / observations.length) * 100).toFixed(1)}%)`);
  console.error(`  fixed price / auction    : ${observations.filter((o) => o.listing_type !== "AUCTION").length} / ${observations.filter((o) => o.listing_type === "AUCTION").length}`);
  console.error("\nThese are a SNAPSHOT of retained state, not observed history.");
  console.error("They carry kind='backfill' and must be excluded from time series.");

  // RESUME. One paged read of the keys already snapshotted - not a SELECT
  // per row - so a completed backfill re-runs in seconds. It is only an
  // optimisation: the final state is identical without it, because
  // listing_observations_backfill_uniq rejects a repeat as 23505 and the
  // writer counts that as already-done.
  //
  // Read in BOTH modes, so a preview can answer the only question that
  // matters after an apply: how much is left. A preview that could not see
  // the existing snapshot would report 29,098 rows "to write" forever.
  const { keys: existingKeys, error: keysError } = await fetchExistingBackfillKeys(db);
  if (keysError) {
    console.error(`\ncould not read existing backfill keys (${keysError.message}); relying on the database constraint alone.`);
  }
  const { pending, skipped: alreadyDone } = planBackfill(observations, existingKeys);
  console.error(`\nalready snapshotted        : ${alreadyDone.length}`);
  console.error(`pending insert             : ${pending.length}`);

  if (!APPLY) {
    console.error("\n--apply not given: nothing written.");
    if (alreadyDone.length) {
      // The snapshot has already been taken. Anything still pending is a
      // listing DISCOVERED SINCE, which live daily capture is already
      // recording properly - it does not need a backfill row and re-running
      // --apply is not how it should be added.
      console.error(
        pending.length
          ? `the snapshot is complete; the ${pending.length} pending row(s) are listings discovered since, already covered by live daily capture.`
          : "the snapshot is complete; a further --apply would insert nothing."
      );
    } else {
      console.error(`--apply requires ${BACKFILL_UNIQUE_CONSTRAINT}; run`);
      console.error("supabase/listing_observations_backfill_uniq_migration.sql first, or a re-run");
      console.error("would insert a SECOND copy of every row above.");
    }
    return;
  }

  // WRITE.
  console.error(`\nwriting (plain inserts, idempotent via ${BACKFILL_UNIQUE_CONSTRAINT})...`);
  const tally = await writeBackfillObservations(db, observations, {
    existingKeys,
    onProgress: ({ done, total }) => {
      if (done % 5000 === 0 || done === total) console.error(`  ${done}/${total}`);
    },
  });

  console.error(
    `\ninserted ${tally.inserted} | already present ${tally.duplicate + tally.skipped} ` +
      `(${tally.skipped} skipped by resume, ${tally.duplicate} rejected by the constraint) | failed ${tally.failed}`
  );
  console.error(`statements issued: ${tally.statements}`);
  if (tally.failed) {
    console.error(`FIRST ERROR: ${tally.firstError}`);
    console.error("nothing was updated or deleted; re-run to retry exactly the failed rows.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
