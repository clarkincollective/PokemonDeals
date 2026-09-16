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
// observation: the unique index is partial on kind='daily'.
//
// Run ONCE, after the migration. Safe to re-run: the insert is
// ignoreDuplicates on the same natural key.

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const require = createRequire(import.meta.url);
const { buildObservation } = require("../lib/listingObservations.js");
const { isMissingObservationTableError } = require("../lib/listingObservationsDb.js");

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

  if (!APPLY) {
    console.error("\n--apply not given: nothing written.");
    return;
  }

  let written = 0;
  for (let i = 0; i < observations.length; i += 500) {
    const slice = observations.slice(i, i + 500);
    const { data, error } = await db
      .from("listing_observations")
      .upsert(slice, { onConflict: "source,marketplace,listing_id,observation_date", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error(`  batch ${i} FAILED: ${error.message}`);
      continue;
    }
    written += (data ?? []).length;
  }
  console.error(`\nwrote ${written} backfill observations.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
