// Phase 17C.10 - reference provenance for a stored comparison.
// Covers each correction: numeric APIs preserved, amount validated against
// the market_price actually used, exact identity/printing/condition or
// grader/grade, provider time distinguished from sync time, sealed
// reassignment resets, a narrowly restricted missing-column fallback, and
// no historical certification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { reassignmentReset, RECOMPUTED_ON_REASSIGNMENT } from "../../lib/sealedIngest.js";

const require = createRequire(import.meta.url);
const RP = require("../../lib/referenceProvenance.js");
const RPDB = require("../../lib/referenceProvenanceDb.js");
const { selectConditionPrice, selectConditionReference } = require("../../lib/dealMatching.js");
const { conditionPricesFromVariants, conditionReferencesFromVariants } = require("../../lib/pokemonPriceTracker.js");
const { storedReferenceEvidence, storedSealedReferenceEvidence } = require("../../lib/dealQuality.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");

// A realistic sparse PPT response: the Unlimited printing is priced only
// in Lightly Played - the exact shape that produced the original mislabel.
const PRICES = {
  primaryPrinting: "Unlimited Holofoil",
  market: 134.69,
  variants: {
    "Unlimited Holofoil": {
      "Lightly Played Unlimited Holofoil": { price: 73.99 },
      "Damaged Unlimited Holofoil": { price: 18.81 },
    },
    "1st Edition Holofoil": { "Near Mint 1st Edition Holofoil": { price: 900 } },
  },
};

// ---------------------------------------------------------------- (1)
test("RP-1. the numeric selector APIs are unchanged; the reference helpers sit ALONGSIDE them", () => {
  const byCondition = conditionPricesFromVariants(PRICES);
  const byRef = conditionReferencesFromVariants(PRICES);

  // the price map is still a map of NUMBERS
  for (const v of Object.values(byCondition)) assert.equal(typeof v, "number");
  assert.equal(byCondition["Lightly Played"], 73.99);

  // and the reference map reproduces exactly those numbers, with provenance
  assert.deepEqual(Object.keys(byRef).sort(), Object.keys(byCondition).sort(), "same tiers in both maps");
  for (const tier of Object.keys(byCondition)) {
    assert.equal(byRef[tier].price, byCondition[tier], `${tier} price must be identical`);
    assert.equal(byRef[tier].condition, tier);
    // the printing is the variant the entry was actually filed under -
    // recorded, never inferred
    assert.ok(byRef[tier].printing, `${tier} must name its printing`);
    assert.ok(PRICES.variants[byRef[tier].printing], `${tier} printing must be a real variant`);
  }
  assert.equal(byRef["Lightly Played"].printing, "Unlimited Holofoil");
  // a 1st-Edition variant is only skipped when the PRIMARY printing is
  // itself 1st Edition; here it is not, so both maps carry it identically
  assert.equal(byRef["Near Mint"].printing, "1st Edition Holofoil");
  assert.equal(byCondition["Near Mint"], byRef["Near Mint"].price);

  // when the primary printing IS 1st Edition, both maps drop it together
  const firstEd = { ...PRICES, primaryPrinting: "1st Edition Holofoil" };
  assert.equal(conditionPricesFromVariants(firstEd)["Near Mint"], undefined);
  assert.equal(conditionReferencesFromVariants(firstEd)["Near Mint"], undefined);
});

test("RP-2. selectConditionReference mirrors selectConditionPrice for every tier", () => {
  const byCondition = conditionPricesFromVariants(PRICES);
  const byRef = conditionReferencesFromVariants(PRICES);
  const fallbackRef = { price: 134.69, condition: null, printing: "Unlimited Holofoil" };

  for (const tier of ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged", "Unknown"]) {
    const price = selectConditionPrice(byCondition, tier, fallbackRef.price);
    const ref = selectConditionReference(byRef, tier, fallbackRef);
    assert.equal(ref?.price ?? null, price ?? null, `tier ${tier} must select the same figure`);
  }
  // the documented safety rule still holds on the reference path: a
  // DETECTED worse tier never falls back to the Near-Mint-targeted figure
  assert.equal(selectConditionPrice(byCondition, "Moderately Played", fallbackRef.price), 18.81);
  assert.equal(selectConditionReference(byRef, "Moderately Played", fallbackRef).price, 18.81);
});

// ---------------------------------------------------------------- (2)
const cardRow = (over = {}) => ({
  market_price: 73.99,
  card_tcgplayer_id: "107003",
  condition: "Lightly Played",
  is_graded: false,
  reference_source: "ppt_live",
  reference_product_id: "107003",
  reference_amount: 73.99,
  reference_currency: "USD",
  reference_observed_at: "2026-09-10T00:00:00Z",
  reference_synced_at: "2026-09-11T00:00:00Z",
  reference_condition: "Lightly Played",
  reference_printing: "Unlimited Holofoil",
  reference_fx_rate: null,
  reference_fx_asof: null,
  ...over,
});

test("RP-3. reference_amount must reproduce the market_price actually used", () => {
  assert.ok(storedReferenceEvidence(cardRow()), "matching amount is evidence");
  // a figure that is not the one the discount used is not evidence
  assert.equal(storedReferenceEvidence(cardRow({ reference_amount: 134.69 })), null);
  assert.equal(storedReferenceEvidence(cardRow({ market_price: 80 })), null);
  // missing amount or currency -> no evidence
  assert.equal(storedReferenceEvidence(cardRow({ reference_amount: null })), null);
  assert.equal(storedReferenceEvidence(cardRow({ reference_currency: null })), null);
});

test("RP-4. currency equality alone is insufficient; a conversion needs explicit evidence", () => {
  // same currency but a different amount is still rejected
  assert.equal(storedReferenceEvidence(cardRow({ reference_amount: 70 })), null);
  // a foreign-currency reference with NO conversion evidence cannot be checked
  assert.equal(storedReferenceEvidence(cardRow({ reference_currency: "GBP" })), null);
  // with an explicit rate + as-of that reconciles, it is evidence
  const converted = cardRow({ reference_currency: "GBP", reference_amount: 58.5, reference_fx_rate: 1.2648, reference_fx_asof: "2026-09-10T00:00:00Z" });
  assert.ok(RP.referenceAmountMatches(converted), "58.50 GBP x 1.2648 = 73.99 USD");
  assert.ok(storedReferenceEvidence(converted));
  // a rate without an as-of is not evidence
  assert.equal(storedReferenceEvidence({ ...converted, reference_fx_asof: null }), null);
  // a rate that does not reconcile is not evidence
  assert.equal(storedReferenceEvidence({ ...converted, reference_fx_rate: 2 }), null);
});

// ---------------------------------------------------------------- (3)
test("RP-5. identity, printing and condition must all match exactly", () => {
  // a reference for a DIFFERENT product is never evidence for this row
  assert.equal(storedReferenceEvidence(cardRow({ reference_product_id: "999999" })), null);
  assert.equal(storedReferenceEvidence(cardRow({ reference_product_id: null })), null);
  // the tier must equal the row's own stored condition
  assert.equal(storedReferenceEvidence(cardRow({ reference_condition: "Near Mint" })), null);
  // the exact printing is required
  assert.equal(storedReferenceEvidence(cardRow({ reference_printing: null })), null);
});

test("RP-6. graded rows need grader and grade, and never borrow a raw reference", () => {
  const graded = (over = {}) =>
    cardRow({ is_graded: true, grader: "PSA", grade: "10", reference_grader: "PSA", reference_grade: "10", reference_condition: null, reference_printing: null, ...over });
  assert.equal(storedReferenceEvidence(graded())?.kind, "graded");
  assert.equal(storedReferenceEvidence(graded({ reference_grader: "CGC" })), null);
  assert.equal(storedReferenceEvidence(graded({ reference_grade: "9" })), null);
  assert.equal(storedReferenceEvidence(graded({ reference_grader: null })), null);
});

test("RP-7. provenance is NEVER inferred from an equal price", () => {
  // identical amounts, but nothing recorded about what the figure was for
  const bare = cardRow({ reference_condition: null, reference_printing: null });
  assert.equal(storedReferenceEvidence(bare), null, "equal prices are not evidence of a shared condition");
  // and an unrelated product whose price happens to match is still rejected
  assert.equal(storedReferenceEvidence(cardRow({ reference_product_id: "555" })), null);
});

// ---------------------------------------------------------------- (4)
test("RP-8. provider observation time is evidence; our sync time never is", () => {
  const ev = storedReferenceEvidence(cardRow());
  assert.equal(ev.capturedAt, Date.parse("2026-09-10T00:00:00Z"), "capturedAt comes from reference_observed_at");

  // an old figure SYNCED after release day is still an old reference:
  // with no provider as-of the capture time stays unknown (null), so it
  // can never satisfy a post-release comparison.
  const syncedOnly = cardRow({ reference_observed_at: null, reference_synced_at: "2026-09-20T00:00:00Z" });
  const ev2 = storedReferenceEvidence(syncedOnly);
  assert.ok(ev2, "the rest of the evidence is still well-formed");
  assert.equal(ev2.capturedAt, null, "unknown source time stays unknown - the sync time is not substituted");
  assert.equal(RP.referenceObservedAtMs(syncedOnly), null);
});

// ---------------------------------------------------------------- sealed
test("RP-9. sealed evidence is identity + amount + provider time (no condition/printing)", () => {
  const sealed = {
    market_price: 177.39,
    sealed_watchlist: { tcgplayer_id: "704143" },
    reference_source: "ppt_live",
    reference_product_id: "704143",
    reference_amount: 177.39,
    reference_currency: "USD",
    reference_observed_at: "2026-09-11T00:00:00Z",
    reference_synced_at: "2026-09-12T00:00:00Z",
  };
  assert.equal(storedSealedReferenceEvidence(sealed)?.kind, "sealed");
  assert.equal(storedSealedReferenceEvidence({ ...sealed, reference_product_id: "704144" }), null);
  assert.equal(storedSealedReferenceEvidence({ ...sealed, reference_amount: 361.84 }), null);
  // catalogue-sourced sealed references carry no provider as-of
  assert.equal(storedSealedReferenceEvidence({ ...sealed, reference_observed_at: null })?.capturedAt, null);
});

// ---------------------------------------------------------------- (5)
test("RP-10. sealed reassignment clears the OLD product's reference over the real schema", () => {
  // the reset list now names the columns that actually exist
  for (const c of RP.SEALED_REFERENCE_COLUMNS) {
    assert.ok(RECOMPUTED_ON_REASSIGNMENT.includes(c), `reassignment must account for ${c}`);
  }
  const moved = reassignmentReset({ sealed_watchlist_id: 76 }, 123, { supportsDisqualifiedReason: true, supportsReferenceColumns: true });
  for (const c of RP.SEALED_REFERENCE_COLUMNS) assert.equal(moved[c], null, `${c} cleared on reassignment`);
  assert.equal(moved.disqualified_reason, null);

  // an availability retirement is still never lifted by a re-attribution,
  // but the stale reference is still cleared
  const retired = reassignmentReset({ sealed_watchlist_id: 76, disqualified_reason: "availability:sold" }, 123, { supportsDisqualifiedReason: true, supportsReferenceColumns: true });
  assert.equal("disqualified_reason" in retired, false, "the retirement is untouched");
  for (const c of RP.SEALED_REFERENCE_COLUMNS) assert.equal(retired[c], null);

  // pre-migration nothing is written at all
  assert.deepEqual(reassignmentReset({ sealed_watchlist_id: 76 }, 123, {}), {});
  // unchanged product -> inert
  assert.deepEqual(reassignmentReset({ sealed_watchlist_id: 123 }, 123, { supportsReferenceColumns: true }), {});
});

test("RP-11. every comparison writer either supplies matching evidence or clears it", () => {
  // the feed has no provider-dated reference -> it CLEARS
  const feed = read("app/api/ingest-feed/route.js");
  assert.match(feed, /clearedReference\(CARD_REFERENCE_COLUMNS\)/);
  // the card scanner SUPPLIES, from the same selection the price came from
  const cards = read("app/api/refresh-deals/route.js");
  assert.match(cards, /selectConditionReference\(/);
  assert.match(cards, /buildCardReference\(/);
  assert.match(cards, /clearedReference\(CARD_REFERENCE_COLUMNS\)/, "and clears when it cannot evidence");
  // the sealed scanner supplies, distinguishing provider time from sync time
  const sealed = read("app/api/refresh-sealed-deals/route.js");
  assert.match(sealed, /buildSealedReference\(/);
  assert.match(sealed, /observedAt: raw\.lastUpdated/);
  assert.match(sealed, /observedAt: null/);
  // scripts that rewrite market_price clear; the one that does NOT touch
  // market_price is deliberately left alone
  assert.match(read("scripts/fix1stEditionDeals.js"), /clearedReference\(CARD_REFERENCE_COLUMNS\)/);
  assert.match(read("scripts/fixConditionPricing.js"), /clearedReference\(CARD_REFERENCE_COLUMNS\)/);
  assert.doesNotMatch(read("scripts/fixCurrencyPricing.js"), /clearedReference/);
  // auction repricing does not rewrite market_price, so the reference it
  // already carries still describes the stored comparison
  assert.doesNotMatch(read("lib/auctionPricing.js"), /market_price:/);
});

// ---------------------------------------------------------------- (6)
test("RP-12. the missing-column fallback is restricted to these columns only", () => {
  const named = { code: "42703", message: 'column deals.reference_observed_at does not exist' };
  assert.equal(RPDB.isMissingProvenanceColumnError(named), true);
  assert.equal(RPDB.isMissingProvenanceColumnError({ code: "PGRST204", message: "Could not find the 'reference_amount' column of 'deals'" }), true);
  // a DIFFERENT missing column must stay visible
  assert.equal(RPDB.isMissingProvenanceColumnError({ code: "42703", message: "column deals.some_other_column does not exist" }), false);
  // every other failure class stays visible
  for (const e of [
    { code: "42501", message: "permission denied for table deals" },
    { code: "23505", message: "duplicate key value violates unique constraint" },
    { code: "PGRST301", message: "JWT expired" },
    { message: "fetch failed" },
    null,
  ]) {
    assert.equal(RPDB.isMissingProvenanceColumnError(e), false, JSON.stringify(e));
  }
});

test("RP-13. a non-provenance write failure is returned, not swallowed", async () => {
  const fail = (error) => ({ from: () => ({ update: () => ({ match: async () => ({ error }) }) }) });
  const state = {};
  const other = await RPDB.writeReferenceBestEffort(fail({ code: "42501", message: "permission denied" }), "deals", { id: 1 }, { reference_source: "x" }, state);
  assert.equal(other.error.code, "42501", "surfaced");
  assert.equal(state.provenance, undefined, "and not memoised as missing-column");

  const missing = await RPDB.writeReferenceBestEffort(fail({ code: "42703", message: "column deals.reference_source does not exist" }), "deals", { id: 1 }, { reference_source: "x" }, {});
  assert.equal(missing.error, null, "the narrow case is tolerated");
  assert.equal(missing.provenance, false);
});

// ---------------------------------------------------------------- (7)
test("RP-14. the migration is additive and certifies nothing historical", () => {
  const sql = read("supabase/reference_provenance_migration.sql");
  const stmts = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(stmts, /\b(update|insert|delete|drop|truncate)\b/i, "no data is written or destroyed");
  assert.doesNotMatch(stmts, /\balter column\b|\brename\b/i, "nothing is retyped or renamed");
  const adds = stmts.match(/add column if not exists/g) ?? [];
  assert.equal(adds.length, 20, "12 card columns + 8 sealed columns, all IF NOT EXISTS");
  // both timestamps exist and are documented as distinct
  assert.match(sql, /reference_observed_at/);
  assert.match(sql, /reference_synced_at/);
  assert.match(sql, /NEVER evidence/i);
});

// ------------------------------------------------------- verifier log
test("RP-15. one structured verifier completion line: counts only, failure-isolated", () => {
  const route = read("app/api/verify-deals/route.js");
  const idx = route.indexOf('event: "verify_deals_complete"');
  assert.ok(idx > 0, "the completion line exists");
  // the log payload ONLY - the surrounding route code is not what this
  // asserts about (an earlier window caught neighbouring lines).
  const payloadEnd = route.indexOf("})", idx);
  const block = route.slice(idx, payloadEnd > idx ? payloadEnd : idx + 900);
  for (const field of [
    "sha:",
    "sealed_entered:",
    "sealed_candidates:",
    "sealed_slots:",
    "sealed_used:",
    "sealed_results:",
    "provider_calls:",
    "write_errors:",
  ]) {
    assert.ok(block.includes(field), `missing ${field}`);
  }
  assert.match(block, /VERCEL_GIT_COMMIT_SHA/, "deployment SHA");
  // the whole emit is failure-isolated
  const guarded = route.slice(Math.max(0, idx - 600), idx);
  assert.match(guarded, /try \{/, "logging failure must not affect verification");
  assert.match(route.slice(idx, idx + 1400), /\} catch \{/, "and the catch swallows it");
  // no secrets and no listing identifiers in the payload
  assert.doesNotMatch(block, /listing_id|listingId|listing_url|affiliate|title|CRON_SECRET|SERVICE_ROLE/);
  // the lane reports whether it was entered at all, so a healthy run with
  // zero candidates is distinguishable from the lane never running
  assert.match(read("lib/sealedVerifyLane.mjs"), /entered: false/);
  assert.match(read("lib/sealedVerifyLane.mjs"), /out\.entered = true/);
});
