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
const { newObservationTally, countObservation } = require("../../lib/listingObservations.js");
const {
  isMissingObservationTableError,
  isDailyDuplicateError,
  DAILY_UNIQUE_CONSTRAINT,
} = require("../../lib/listingObservationsDb.js");

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
        insert() {
          return { select: async () => behaviour };
        },
      };
    },
  };
}

test("11. a first observation is written", async () => {
  const written = await recordObservation(fakeDb({ data: [{ id: 1 }], error: null }), core(), { now: AT });
  assert.equal(written.outcome, "written");
  assert.equal(written.error, null);
});

test("11b. SEO-2.5.1 - a same-day repeat is the 23505 duplicate, not an error", async () => {
  // THE REGRESSION THIS REPAIRS. The writer used .upsert(..., { onConflict }),
  // but the daily index is PARTIAL (WHERE kind = 'daily') and PostgreSQL
  // cannot infer a partial index as an ON CONFLICT target without repeating
  // its predicate, which PostgREST cannot express. Every write failed 42P10
  // and production recorded nothing for its first 25 minutes.
  const dup = await recordObservation(
    fakeDb({ data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${DAILY_UNIQUE_CONSTRAINT}"` } }),
    core(),
    { now: AT }
  );
  assert.equal(dup.outcome, "duplicate");
  assert.equal(dup.error, null, "a routine same-day re-sighting is not an error");
});

test("11c. a 23505 from a DIFFERENT constraint stays an error", async () => {
  // matched on the constraint NAME, not just the code, so an unrelated
  // uniqueness failure is never silently counted as a routine duplicate
  const other = await recordObservation(
    fakeDb({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "some_other_uniq"' } }),
    core(),
    { now: AT }
  );
  assert.equal(other.outcome, "error");
  assert.ok(other.error);
  assert.equal(isDailyDuplicateError({ code: "23505", message: `violates "${DAILY_UNIQUE_CONSTRAINT}"` }), true);
  assert.equal(isDailyDuplicateError({ code: "23505", message: 'violates "deals_unique_listing"' }), false);
  assert.equal(isDailyDuplicateError({ code: "42P10", message: DAILY_UNIQUE_CONSTRAINT }), false);
});

test("11d. the next UTC day is a new observation, not a duplicate", () => {
  const d1 = buildObservation(core(), { now: Date.parse("2026-09-16T23:59:59Z") });
  const d2 = buildObservation(core(), { now: Date.parse("2026-09-17T00:00:01Z") });
  assert.equal(d1.observation_date, "2026-09-16");
  assert.equal(d2.observation_date, "2026-09-17");
});

test("11e. the health tally distinguishes written / duplicate / absent / error", () => {
  // the defect was invisible because the scan reported success while every
  // observation write failed; this is what makes that visible
  const t = newObservationTally();
  countObservation(t, { outcome: "written" });
  countObservation(t, { outcome: "duplicate" });
  countObservation(t, { outcome: "absent" });
  countObservation(t, { outcome: "error", error: { code: "42P10" } });
  assert.deepEqual(
    { written: t.written, duplicate: t.duplicate, absent: t.absent, error: t.error },
    { written: 1, duplicate: 1, absent: 1, error: 1 }
  );
  assert.equal(t.firstError, "42P10", "the first error code is retained for diagnosis");
});

test("12. deduplication is the DATABASE's job - plain insert, no pre-read, no upsert", () => {
  const src = read("lib/listingObservations.js");
  // strip // comments: the file DESCRIBES the upsert that failed, so only
  // executable code is checked here
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /\.from\("listing_observations"\)\.insert\(row\)/, "plain insert");
  assert.doesNotMatch(code, /onConflict/, "a partial index cannot be an ON CONFLICT target");
  assert.doesNotMatch(code, /ignoreDuplicates/);
  assert.doesNotMatch(code, /\.select\("id"\)\s*\n\s*\.eq\(/, "no pre-read before the insert");
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

test("19. SEO-2.5.1 - BOTH discovery paths record observations", () => {
  // the cross-match pricing pilot enters `deals` through insertNewSighting,
  // not writeDiscoverySighting, and was recording nothing
  const src = read("lib/listingAvailability.js");
  const cross = src.slice(src.indexOf("async function insertNewSighting"), src.indexOf("// crossmatch-price-pilot-r1 - PUBLICATION IN TWO STEPS"));
  assert.match(cross, /await logObservation\(db, core\);/, "the cross-match path must record");
  const discovery = src.slice(src.indexOf("async function writeDiscoverySighting"), src.indexOf("async function logObservation"));
  assert.match(discovery, /await logObservation\(db, core\);/);
  // one shared writer, so pricing / identity / screening logic is not duplicated
  assert.equal((src.match(/async function logObservation/g) ?? []).length, 1);
});

test("20. a listing entering by BOTH paths cannot double-count for one day", () => {
  // the database constraint stays authoritative; neither path second-guesses it
  const src = read("lib/listingAvailability.js");
  assert.match(src, /the partial unique index is authoritative/);
  const obs = read("lib/listingObservations.js");
  assert.doesNotMatch(obs, /\.select\("id"\)[\s\S]{0,40}\.eq\("listing_id"/, "no path-level dedupe guess");
});

test("21. an observation failure cannot change a sighting or deal result", () => {
  const src = read("lib/listingAvailability.js");
  const log = src.slice(src.indexOf("async function logObservation"), src.indexOf("let observationTally"));
  // it swallows everything and returns nothing the caller can branch on
  assert.match(log, /try \{/);
  assert.match(log, /catch \(e\)/);
  assert.doesNotMatch(log, /return (?!;)/, "logObservation must not hand a value back");
  // the cross-match path logs BEFORE its own error return, and the returned
  // shape is untouched by logging
  const cross = src.slice(src.indexOf("async function insertNewSighting"), src.indexOf("// crossmatch-price-pilot-r1 - PUBLICATION IN TWO STEPS"));
  assert.match(cross, /if \(ins\.error\) return \{ outcome: "error", error: ins\.error, where: null \};/);
  assert.match(cross, /return \{ outcome: "exists", error: null, where: "concurrent_insert" \};/);
});

test("22. the tally is reported, never acted on, and costs no Browse call", () => {
  const route = read("app/api/refresh-deals/route.js");
  assert.match(route, /const observations = takeObservationTally\(\);/);
  assert.match(route, /^\s*observations,$/m, "folded into the existing response");
  // no branching on it, and no scanner budget or eBay call involved
  assert.doesNotMatch(route, /if \(observations\./, "nothing may branch on the tally");
  const lib = read("lib/listingObservations.js");
  for (const forbidden of ["searchListings", "getBrowseRateLimit", "acquireBrowseLease", "recordBrowseCall"]) {
    assert.ok(!lib.includes(forbidden), `the observation layer must not touch ${forbidden}`);
  }
});

test("23. the repair changed no deal qualification, pricing, screening or visibility rule", () => {
  // the observation layer still reads nothing and decides nothing
  for (const f of ["lib/dealQuality.js", "lib/dealMatching.js", "lib/browseBudget.js", "lib/catalogAggregates.js", "lib/sitemap.js"]) {
    assert.doesNotMatch(read(f), /listing_observations|recordObservation|logObservation/, `${f} must be untouched by the observation layer`);
  }
});

test("18. backfill rows are marked so they can be excluded from time series", () => {
  const o = buildObservation(core(), { kind: "backfill", now: AT });
  assert.equal(o.kind, "backfill");
  const sql = read("supabase/listing_observations_migration.sql");
  assert.match(sql, /backfill rows are a one-off snapshot/);
});
