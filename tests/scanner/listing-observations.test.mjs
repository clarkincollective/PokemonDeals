// SEO-2.5 - append-only listing observation log.
//
// The audit found that `deals` keeps one row per listing and upserts it with
// ignoreDuplicates, so a fixed-price listing's price and discount are frozen
// at first sighting and every later state is lost, while an auction's row is
// overwritten in place by re-pricing. 28,927 listing rows, zero observation
// history. This table stops that loss.
//
// These tests pin the three properties that make it safe: it decides
// nothing, it cannot break a scan, and it stores no personal data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const {
  buildObservation,
  recordObservation,
  OBSERVATION_FIELDS,
  FORBIDDEN_FIELDS,
  utcDay,
} = require("../../lib/listingObservations.js");
const { isMissingObservationTableError } = require("../../lib/listingObservationsDb.js");

const core = (over = {}) => ({
  source: "ebay",
  marketplace: "EBAY_US",
  listing_id: "v1|123456789012|0",
  watchlist_id: 91,
  price: 26.5,
  shipping: 4.25,
  total_price: 30.75,
  total_price_usd: 30.75,
  currency: "USD",
  market_price: 38.26,
  discount_pct: 0.196,
  listing_type: "FIXED_PRICE",
  condition: "Near Mint",
  is_graded: false,
  grader: null,
  grade: null,
  card_language: "english",
  is_active: true,
  disqualified_reason: null,
  first_seen_at: "2026-09-16T01:00:00.000Z",
  // present on a real `core`, must never be stored:
  seller_username: "a-real-seller",
  seller_feedback_pct: 99.8,
  title: "Clefable Jungle 1/64 Holo Rare Near Mint",
  affiliate_url: "https://www.ebay.com/itm/123?campid=5",
  image_urls: ["https://i.ebayimg.com/a.jpg"],
  ...over,
});

const AT = Date.parse("2026-09-16T10:30:00.000Z");

// --- projection ---------------------------------------------------------

test("1. an observation records the listing key, the day and the exact instant", () => {
  const o = buildObservation(core(), { now: AT });
  assert.equal(o.source, "ebay");
  assert.equal(o.marketplace, "EBAY_US");
  assert.equal(o.listing_id, "v1|123456789012|0");
  assert.equal(o.observation_date, "2026-09-16");
  assert.equal(o.observed_at, "2026-09-16T10:30:00.000Z");
  assert.equal(o.kind, "daily");
});

test("2. NO personal or bulk field is ever stored", () => {
  const o = buildObservation(core(), { now: AT });
  for (const f of FORBIDDEN_FIELDS) {
    assert.ok(!(f in o), `${f} must never reach the observation log`);
  }
  // and the allowlist is the mechanism, not a manual filter
  const src = read("lib/listingObservations.js");
  assert.match(src, /for \(const f of OBSERVATION_FIELDS\)/);
  assert.ok(!OBSERVATION_FIELDS.includes("seller_username"));
  assert.ok(!OBSERVATION_FIELDS.includes("seller_feedback_pct"));
});

test("3. the price state keeps item, shipping and total separately", () => {
  // so a future study can never compare an item-only price against a
  // shipping-inclusive one
  const o = buildObservation(core(), { now: AT });
  assert.equal(o.price, 26.5);
  assert.equal(o.shipping, 4.25);
  assert.equal(o.total_price, 30.75);
  assert.equal(o.total_price_usd, 30.75);
  assert.equal(o.currency, "USD");
});

test("4. the reference behind the discount is captured with it", () => {
  // the whole point: a historical discount is only reproducible if the
  // reference used at that moment travels with it
  const o = buildObservation(
    core({ reference_amount: 38.26, reference_currency: "USD", reference_source: "ppt_live", reference_observed_at: "2026-09-15T00:00:00.000Z" }),
    { now: AT }
  );
  assert.equal(o.market_price, 38.26);
  assert.equal(o.discount_pct, 0.196);
  assert.equal(o.reference_amount, 38.26);
  assert.equal(o.reference_observed_at, "2026-09-15T00:00:00.000Z");
});

test("5. normalisation fields survive so analysis stays like-for-like", () => {
  const g = buildObservation(core({ is_graded: true, grader: "PSA", grade: "10", condition: null }), { now: AT });
  assert.equal(g.is_graded, true);
  assert.equal(g.grader, "PSA");
  assert.equal(g.grade, "10");
  assert.equal(g.card_language, "english");
  assert.equal(g.listing_type, "FIXED_PRICE");
});

test("6. auctions are distinguishable from fixed price", () => {
  // auction bids evolve; fixed-price discounts do not. They must never be
  // pooled in a future study.
  const a = buildObservation(core({ listing_type: "AUCTION" }), { now: AT });
  assert.equal(a.listing_type, "AUCTION");
});

test("7. screening state travels so research-grade rows can be selected later", () => {
  const d = buildObservation(core({ disqualified_reason: "authenticity:proxy_or_counterfeit", visual_authenticity_status: "COUNTERFEIT_MISMATCH" }), { now: AT });
  assert.equal(d.disqualified_reason, "authenticity:proxy_or_counterfeit");
  assert.equal(d.visual_authenticity_status, "COUNTERFEIT_MISMATCH");
  // a disqualified listing is still observed - it is excluded at analysis
  // time, not silently dropped at write time
  assert.ok(d);
});

test("8. identity is point-in-time, never re-matched later", () => {
  const o = buildObservation(core(), { now: AT });
  assert.equal(o.watchlist_id, 91);
  const sql = read("supabase/listing_observations_migration.sql");
  assert.match(sql, /Point-in-time card identity/);
});

test("9. the UTC day bucket does not drift at boundaries", () => {
  assert.equal(utcDay("2026-09-16T00:00:00.000Z"), "2026-09-16");
  assert.equal(utcDay("2026-09-16T23:59:59.999Z"), "2026-09-16");
  assert.equal(utcDay("2026-09-17T00:00:00.000Z"), "2026-09-17");
});

test("10. a row that cannot be identified is skipped, never half-written", () => {
  for (const bad of [{}, { source: "ebay" }, { source: "ebay", marketplace: "EBAY_US" }, null]) {
    assert.equal(buildObservation(bad, { now: AT }), null);
  }
  assert.equal(buildObservation(core(), { kind: "nonsense", now: AT }), null);
});

// --- write behaviour ----------------------------------------------------

function fakeDb(behaviour) {
  return {
    from() {
      return {
        upsert() {
          return { select: async () => behaviour };
        },
      };
    },
  };
}

test("11. a first observation is written; a same-day repeat is suppressed", async () => {
  const written = await recordObservation(fakeDb({ data: [{ id: 1 }], error: null }), core(), { now: AT });
  assert.equal(written.outcome, "written");
  // the partial unique index makes Postgres drop the repeat; ignoreDuplicates
  // returns no row rather than an error
  const dup = await recordObservation(fakeDb({ data: [], error: null }), core(), { now: AT });
  assert.equal(dup.outcome, "duplicate");
});

test("12. deduplication is enforced by the DATABASE, not by a pre-read", () => {
  // a read-then-write would double the query cost on every re-sighting
  const src = read("lib/listingObservations.js");
  assert.match(src, /ignoreDuplicates: true/);
  assert.match(src, /onConflict: "source,marketplace,listing_id,observation_date"/);
  assert.doesNotMatch(src, /\.select\("id"\)\s*\n\s*\.eq\(/, "no pre-read before the insert");
  const sql = read("supabase/listing_observations_migration.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS listing_observations_daily_uniq/);
  assert.match(sql, /WHERE kind = 'daily'/, "partial, so transition rows are still allowed");
});

test("13. an unmigrated table is expected and silent; every other error is visible", async () => {
  const absent = await recordObservation(
    fakeDb({ data: null, error: { code: "42P01", message: 'relation "listing_observations" does not exist' } }),
    core(),
    { now: AT }
  );
  assert.equal(absent.outcome, "absent");
  assert.equal(absent.error, null);
  const denied = await recordObservation(
    fakeDb({ data: null, error: { code: "42501", message: "permission denied for table listing_observations" } }),
    core(),
    { now: AT }
  );
  assert.equal(denied.outcome, "error", "a permission failure must NOT be read as 'not migrated'");
  assert.ok(denied.error);
  // the detector is deliberately narrow
  assert.equal(isMissingObservationTableError({ code: "42P01", message: 'relation "deals" does not exist' }), false);
  assert.equal(isMissingObservationTableError({ code: "23505", message: "listing_observations duplicate" }), false);
});

test("14. a thrown database error is contained, never propagated to the scan", async () => {
  const exploding = { from() { throw new Error("connection reset"); } };
  const r = await recordObservation(exploding, core(), { now: AT });
  assert.equal(r.outcome, "error");
  assert.ok(r.error);
});

// --- isolation from the live system ------------------------------------

test("15. logging cannot change the sighting result", () => {
  const src = read("lib/listingAvailability.js");
  const fn = src.slice(src.indexOf("async function writeDiscoverySighting"), src.indexOf("let lastObservationOutcome"));
  // the sighting result is captured BEFORE the log and returned unchanged
  assert.match(fn, /const result = await writeGuardedSighting\(/);
  assert.match(fn, /await recordObservation\(db, core\)/);
  assert.match(fn, /return result;/);
  // and the observation's own outcome is never mixed into it
  assert.doesNotMatch(fn, /result\s*=\s*await recordObservation/);
});

test("16. the observation layer is non-authoritative: nothing reads it to serve or scan", () => {
  // if any serving, pricing, screening or budget path ever reads this table,
  // it stops being an observation log and becomes a dependency
  const readers = [
    "lib/deals.js",
    "lib/dealQuality.js",
    "lib/browseBudget.js",
    "lib/catalogAggregates.js",
    "lib/sitemap.js",
    "app/api/refresh-deals/route.js",
    "app/api/verify-deals/route.js",
  ];
  for (const f of readers) {
    assert.doesNotMatch(read(f), /listing_observations/, `${f} must not read the observation log`);
  }
});

test("17. the migration is additive only", () => {
  const sql = read("supabase/listing_observations_migration.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS listing_observations/);
  // strip -- comments and COMMENT ON bodies: the file DESCRIBES the rule
  // "never UPDATE or DELETE a row here", so only executable SQL is checked
  const stmts = sql
    .replace(/^\s*--.*$/gm, "")
    .replace(/COMMENT ON [\s\S]*?;/g, "");
  for (const destructive of [/\bDROP\b/, /\bALTER TABLE\b/, /\bDELETE\b/, /\bTRUNCATE\b/, /\bUPDATE\b/]) {
    assert.doesNotMatch(stmts, destructive, `migration must not execute ${destructive}`);
  }
  // history is the asset: nothing should ever rewrite a row
  assert.match(sql, /Never UPDATE or DELETE a row here/);
});

test("18. backfill rows are marked so they can be excluded from time series", () => {
  const o = buildObservation(core(), { kind: "backfill", now: AT });
  assert.equal(o.kind, "backfill");
  const sql = read("supabase/listing_observations_migration.sql");
  assert.match(sql, /backfill rows are a one-off snapshot/);
});
