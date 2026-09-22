// EXISTING-ROW UPDATE / INVALIDATION behaviour (closeout §2).
//
// The upstream matcher stops NEW bad references. This file pins what
// happens to a row that already has one, because that is where the
// dangerous case lives: when printing resolution fails the scanner
// SKIPS the listing, and skipping writes nothing - so without an
// explicit invalidation the stale reference survives as the row's
// CURRENT usable data, invisible only because a display gate catches it.
//
// Two facts established against the live schema and pinned here:
//
//   1. market_price and discount_pct are NOT NULL on `deals`. The canary
//      run proved it ("null value in column market_price ... violates
//      not-null constraint"), so invalidation clears the reference_*
//      provenance set and leaves those two in place.
//   2. That is sufficient, because storedReferenceEvidence requires
//      reference_product_id AND a reference_amount that reproduces
//      market_price. With the set cleared, no gate can trust the row
//      again regardless of its title - a strictly stronger guarantee
//      than the title-based containment gate alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  savingsClaimTrusted,
  storedReferenceEvidence,
  listingPresentation,
  isDisplayableDeal,
  referenceIsUnevidencedParallelPrinting,
  hasPositiveComparison,
} from "../../lib/dealQuality.js";
import { dealQualityScore } from "../../lib/dealQualityScore.js";
import { CARD_REFERENCE_COLUMNS, clearedReference } from "../../lib/referenceProvenance.js";
import { selectReferencePrinting } from "../../lib/printingMatch.js";

// A persisted row carrying the defect, shaped like the real cohort
// members (deal 33800: "Psyduck 104/147 Aquapolis Regular", reference
// recorded as Reverse Holofoil at $700).
function persistedBadRow(over = {}) {
  return {
    id: 33800,
    title: "Psyduck 104/147 Aquapolis Regular Pokémon Card LP*",
    card_name: "Psyduck",
    card_set: "Aquapolis",
    card_language: "english",
    card_tcgplayer_id: "1111",
    listing_id: "v1|33800|0",
    listing_url: "https://www.ebay.com/itm/33800",
    listing_type: "FIXED_PRICE",
    condition: "Lightly Played",
    is_graded: false,
    price: 250,
    shipping: 50,
    total_price: 300,
    total_price_usd: 300,
    market_price: 700,
    discount_pct: 0.5714,
    reference_source: "ppt_live",
    reference_product_id: "1111",
    reference_amount: 700,
    reference_currency: "USD",
    reference_condition: "Lightly Played",
    reference_printing: "Reverse Holofoil",
    reference_observed_at: "2026-09-20T12:00:00.000Z",
    reference_synced_at: "2026-09-20T12:00:00.000Z",
    is_active: true,
    first_seen_at: "2026-09-06T10:00:00.000Z",
    last_seen_at: "2026-09-21T08:00:56.309Z",
    exact_verified_at: "2026-09-08T11:00:10.000Z",
    image_verdict: "SELLER_FRONT",
    disqualified_reason: null,
    ...over,
  };
}

// Exactly what scripts/integrity/invalidateParallelReferences.mjs writes.
const invalidated = (row) => ({ ...row, ...clearedReference(CARD_REFERENCE_COLUMNS) });

test("the stale reference IS the problem: before invalidation it is still the row's current data", () => {
  const row = persistedBadRow();
  // The display gate already refuses the claim...
  assert.equal(savingsClaimTrusted(row), false);
  // ...but the reference is still present and still reconciles, i.e. it
  // is live data that only a title-shaped rule is holding back.
  assert.ok(storedReferenceEvidence(row), "evidence still reconciles - this is the retention being eliminated");
  assert.equal(row.reference_printing, "Reverse Holofoil");
});

test("invalidation removes the usable-reference state permanently", () => {
  const row = invalidated(persistedBadRow());
  assert.equal(storedReferenceEvidence(row), null, "no evidence can be reconstructed");
  assert.equal(savingsClaimTrusted(row), false);
  assert.equal(listingPresentation(row).savings, null);
  assert.equal(dealQualityScore(row), null, "and no Deal Score survives it");
  for (const col of CARD_REFERENCE_COLUMNS) assert.equal(row[col], null, `${col} cleared`);
});

test("invalidation is stronger than the title gate: even a title that WOULD evidence the parallel stays untrusted", () => {
  // The containment gate reads the title. Once the provenance is gone,
  // the row cannot be trusted even by a title that says "reverse holo" -
  // there is simply no reference left to reconcile against.
  const row = invalidated(persistedBadRow({ title: "Psyduck 104/147 Aquapolis REVERSE HOLO LP" }));
  assert.equal(referenceIsUnevidencedParallelPrinting(row), false, "the title no longer contradicts anything");
  assert.equal(savingsClaimTrusted(row), false, "but it is still untrusted, because there is no evidence");
});

test("the listing stays available as a plain merchant listing - it is not hidden", () => {
  const before = persistedBadRow();
  const after = invalidated(before);
  assert.equal(isDisplayableDeal(before), true);
  assert.equal(isDisplayableDeal(after), true, "clearing a reference must never hide an otherwise-eligible listing");
});

test("invalidation touches no availability timestamp and no history column", () => {
  const before = persistedBadRow();
  const after = invalidated(before);
  for (const col of ["first_seen_at", "last_seen_at", "exact_verified_at", "is_active"]) {
    assert.equal(after[col], before[col], `${col} must be untouched - a reference check is not an availability observation`);
  }
  // NOT NULL on the live schema, so deliberately left in place; inert
  // without provenance (discount ranking and the exported discountPct
  // both gate on savingsClaimTrusted).
  assert.equal(after.market_price, 700);
  assert.equal(after.discount_pct, before.discount_pct);
});

test("invalidation is idempotent", () => {
  const once = invalidated(persistedBadRow());
  const twice = invalidated(once);
  assert.deepEqual(twice, once);
});

// ---- the repair path, proved on a fixture ---------------------------
//
// No live cohort member had been re-priced at closeout time (0 of 213 -
// the scanner re-prices a card only when it next encounters it), so the
// "affected listing with a valid replacement reference" category has no
// production example yet. Rather than invent one, the persistence path
// is proved here: given a provider response where the CORRECT printing
// does carry the listing's condition, resolution picks it and a valid
// reference becomes constructible.

test("REPAIR PATH: the correct printing is chosen when it prices the listing's condition", () => {
  const matrix = {
    Normal: { "Near Mint": 40, "Lightly Played": 30 },
    "Reverse Holofoil": { "Lightly Played": 700 },
  };
  const row = invalidated(persistedBadRow());
  const choice = selectReferencePrinting({
    variantNames: Object.keys(matrix),
    evidenceText: `${row.title} ${row.condition}`,
    catalogPrinting: "Normal",
  });
  assert.equal(choice.printing, "Normal", "the title says Regular, so the plain printing");
  const price = matrix[choice.printing][row.condition];
  assert.equal(price, 30, "and the LP price comes from Normal, not the reverse holo's $700");

  // A row rebuilt from that selection reconciles and becomes trusted.
  const repaired = {
    ...row,
    market_price: price,
    discount_pct: 0, // 300 > 30, so this is no longer a saving at all
    reference_source: "ppt_live",
    reference_product_id: row.card_tcgplayer_id,
    reference_amount: price,
    reference_currency: "USD",
    reference_condition: row.condition,
    reference_printing: choice.printing,
    reference_observed_at: "2026-09-22T02:00:00.000Z",
  };
  assert.ok(storedReferenceEvidence(repaired), "the replacement reference reconciles");
  assert.equal(referenceIsUnevidencedParallelPrinting(repaired), false);
  // Correct reference, no qualifying saving - one of the closeout's
  // legitimate final outcomes. Note WHICH gate says so: the reference is
  // legitimately TRUSTED (savingsClaimTrusted is about whether the
  // comparison may be believed), and it is hasPositiveComparison that
  // reports there is no saving to state. listingPresentation combines
  // them, and it is the display contract.
  assert.equal(savingsClaimTrusted(repaired), true, "the corrected comparison IS trustworthy");
  assert.equal(hasPositiveComparison(repaired), false, "but $300 is not below a $30 reference");
  assert.equal(listingPresentation(repaired).savings, null, "so no savings claim is displayed");
  assert.match(
    listingPresentation(repaired).notes.join(" "),
    /Not priced below its market reference/,
    "and the stated reason is the true one"
  );
  assert.equal(dealQualityScore(repaired), null, "no Deal Score either");
});

test("REPAIR PATH: no correct-condition price means no reference, not a borrowed one", () => {
  // The original defect in the persistence direction: Normal prices only
  // Near Mint, the listing is Lightly Played, and the reverse holo does
  // have an LP price. Resolution must still pick Normal, leaving the
  // LP tier absent - so the scanner skips rather than writes $700.
  const matrix = { Normal: { "Near Mint": 40 }, "Reverse Holofoil": { "Lightly Played": 700 } };
  const row = invalidated(persistedBadRow());
  const choice = selectReferencePrinting({
    variantNames: Object.keys(matrix),
    evidenceText: `${row.title} ${row.condition}`,
    catalogPrinting: "Normal",
  });
  assert.equal(choice.printing, "Normal");
  assert.equal(matrix[choice.printing][row.condition], undefined, "no LP price for the resolved printing");
  // The row therefore stays invalidated, which is the correct outcome.
  assert.equal(savingsClaimTrusted(row), false);
  assert.equal(isDisplayableDeal(row), true, "and still shows as a plain listing");
});
