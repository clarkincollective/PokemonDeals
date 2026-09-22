// WHY the price-history chart is not the basis for a saving, as opposed
// to the mere FACT that it isn't.
//
// The deal page gates the chart's label on !showSavings:
//
//   showSavings = hasPrice(total_price)
//              && presentation.savings === "trusted"
//              && shipping.savingClaim !== "none"
//
// Three INDEPENDENT gates, and only the middle one is about the
// reference. The first version of the widened label said "this listing
// has no supported market comparison" whenever the conjunction failed,
// which denies a reference we do hold in two of the three cases:
//
//   * a listing priced AT OR ABOVE a perfectly valid reference, and
//   * a valid reference whose claim is blocked by unknown shipping.
//
// So the wording is chosen from listingPresentation's `savingsReason`,
// plus one page-level distinction: when presentation.savings is already
// "trusted", the reference is supported and the comparison is positive,
// so a !showSavings can only have come from the price or the shipping
// breakdown. That case gets the safe generic statement.
//
// These tests pin the REASON. They deliberately assert the shipping and
// pricing gates' own outputs alongside it, so a change that quietly
// loosens a gate to make a label read better fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listingPresentation,
  savingsClaimTrusted,
  hasPositiveComparison,
  storedReferenceEvidence,
  isDisplayableDeal,
} from "../../lib/dealQuality.js";
import { CARD_REFERENCE_COLUMNS, clearedReference } from "../../lib/referenceProvenance.js";
import { hasPrice } from "../../lib/money.js";
import { offerShipping } from "../../lib/offerPresentation.js";

// Exactly the expression app/deals/[id]/page.js computes. Kept here so a
// drift between the page and this reasoning is a test failure rather
// than a wrong sentence on a live page.
function pageState(row) {
  const presentation = listingPresentation(row);
  const shipping = offerShipping(row);
  const showSavings =
    hasPrice(row.total_price) && presentation.savings === "trusted" && shipping.savingClaim !== "none";
  const chartBasisReason =
    presentation.savings === "trusted" ? "blocked_not_reference" : presentation.savingsReason;
  return { presentation, shipping, showSavings, chartBasisReason };
}

// Availability stamps are relative: isDisplayableDeal has a freshness
// component, so a literal date would make these tests expire by wall
// clock (it already happened to two sibling files). Reference dates stay
// literal - they are what the provenance gates read, and they carry no
// TTL.
const HOURS = 3600 * 1000;
const agoISO = (h) => new Date(Date.now() - h * HOURS).toISOString();

// A row whose reference is genuinely supported: a plain (non-parallel)
// printing, identity + amount that reconcile against market_price, and an
// untracked set so no release-date proof is required.
function validReferenceRow(over = {}) {
  return {
    id: 90001,
    title: "Clefable 1/64 Jungle Pokemon Card NM",
    card_name: "Clefable",
    card_set: "Jungle",
    card_language: "english",
    card_tcgplayer_id: "5150",
    listing_id: "v1|90001|0",
    listing_url: "https://www.ebay.com/itm/90001",
    listing_type: "FIXED_PRICE",
    condition: "Near Mint",
    is_graded: false,
    price: 40,
    shipping: 5,
    total_price: 45,
    total_price_usd: 45,
    market_price: 60,
    discount_pct: 0.25,
    reference_source: "ppt_live",
    reference_product_id: "5150",
    reference_amount: 60,
    reference_currency: "USD",
    reference_condition: "Near Mint",
    reference_printing: "Normal",
    reference_observed_at: "2026-09-20T12:00:00.000Z",
    reference_synced_at: "2026-09-20T12:00:00.000Z",
    is_active: true,
    first_seen_at: agoISO(6),
    last_seen_at: agoISO(1),
    exact_verified_at: agoISO(1),
    image_verdict: "SELLER_FRONT",
    disqualified_reason: null,
    ...over,
  };
}

// The control: nothing is wrong with this row, so the chart is a
// reference and carries no amber label at all.
test("CONTROL: a supported reference with a positive comparison shows savings, so no basis label", () => {
  const row = validReferenceRow();
  const { presentation, showSavings, chartBasisReason } = pageState(row);
  assert.equal(savingsClaimTrusted(row), true);
  assert.equal(hasPositiveComparison(row), true);
  assert.equal(presentation.savings, "trusted");
  assert.equal(presentation.savingsReason, null, "nothing to explain when a saving IS claimed");
  assert.equal(showSavings, true);
  assert.equal(chartBasisReason, "blocked_not_reference", "unused - the label does not render at all here");
});

// ---- CASE 1: invalidated / unsupported reference --------------------
//
// The only case where denying the reference is TRUE.

test("CASE 1: an invalidated reference is genuinely unsupported - 'no supported market comparison'", () => {
  const row = { ...validReferenceRow(), ...clearedReference(CARD_REFERENCE_COLUMNS) };
  const { presentation, showSavings, chartBasisReason } = pageState(row);
  assert.equal(storedReferenceEvidence(row), null, "no evidence survives invalidation");
  assert.equal(savingsClaimTrusted(row), false);
  assert.equal(presentation.savings, null);
  assert.equal(showSavings, false);
  assert.equal(chartBasisReason, "no_reference");
  for (const col of CARD_REFERENCE_COLUMNS) assert.equal(row[col], null, `${col} cleared`);
  assert.equal(isDisplayableDeal(row), true, "and the listing is still shown, as a plain listing");
});

test("CASE 1: a parallel-printing reference keeps its own, more specific reason", () => {
  // Deal 42127's original shape. We DO hold a reference; it prices a
  // finish this listing does not state. Saying "no supported comparison"
  // would be true enough, but the specific reason is more useful and was
  // already shipped, so it must survive this change.
  const row = validReferenceRow({
    title: "Bulbasaur 94/165 Expedition Pokemon Card LP",
    condition: "Lightly Played",
    reference_condition: "Lightly Played",
    reference_printing: "Reverse Holofoil",
  });
  const { presentation, showSavings, chartBasisReason } = pageState(row);
  assert.equal(savingsClaimTrusted(row), false, "the parallel-printing gate refuses it");
  assert.equal(showSavings, false);
  assert.equal(chartBasisReason, "parallel_printing");
  assert.match(presentation.notes.join(" "), /reverse holofoil printing/);
});

// ---- CASE 2: valid reference, listing at or above it ----------------
//
// The reference is SUPPORTED. The label must not deny it.

test("CASE 2: priced at or above a valid reference - the reference is supported, so say so", () => {
  // $75 total against a $60 reference: a real, trustworthy comparison
  // that simply is not a saving.
  const row = validReferenceRow({ price: 70, shipping: 5, total_price: 75, total_price_usd: 75, discount_pct: 0 });
  const { presentation, shipping, showSavings, chartBasisReason } = pageState(row);
  assert.equal(savingsClaimTrusted(row), true, "the comparison IS believable - nothing is wrong with the reference");
  assert.equal(hasPositiveComparison(row), false, "there is just no saving to state");
  assert.equal(presentation.savings, null);
  assert.equal(shipping.savingClaim, "delivered", "shipping is not the blocker here");
  assert.equal(hasPrice(row.total_price), true, "and neither is the price");
  assert.equal(showSavings, false);
  assert.equal(chartBasisReason, "not_below_reference");
  assert.notEqual(chartBasisReason, "no_reference", "THE BUG: this reference is supported and must not be denied");
});

test("CASE 2: an equal price is the boundary, and still not an unsupported reference", () => {
  const row = validReferenceRow({ price: 55, shipping: 5, total_price: 60, total_price_usd: 60, discount_pct: 0 });
  const { showSavings, chartBasisReason } = pageState(row);
  assert.equal(savingsClaimTrusted(row), true);
  assert.equal(showSavings, false);
  assert.equal(chartBasisReason, "not_below_reference");
});

// ---- CASE 3: valid reference, shipping uncertainty blocks the claim --
//
// The reference is SUPPORTED and the comparison is POSITIVE. Only the
// shipping breakdown stops the claim, so the label may not describe the
// reference at all.

test("CASE 3: unknown shipping blocks the claim without touching the reference", () => {
  // shipping absent -> offerShipping's "unknown" state: the stored total
  // may or may not already include a charge, so neither "delivered" nor
  // "before shipping" is supportable and savingClaim is "none".
  const row = validReferenceRow({ shipping: null });
  const { presentation, shipping, showSavings, chartBasisReason } = pageState(row);
  assert.equal(shipping.state, "unknown");
  assert.equal(shipping.savingClaim, "none", "the shipping gate is the blocker");
  assert.equal(savingsClaimTrusted(row), true, "the reference is fully supported");
  assert.equal(hasPositiveComparison(row), true, "and the comparison is positive");
  assert.equal(presentation.savings, "trusted", "presentation alone WOULD claim it");
  assert.equal(showSavings, false, "but the page does not, because of shipping");
  assert.equal(chartBasisReason, "blocked_not_reference");
  assert.notEqual(chartBasisReason, "no_reference", "THE BUG: shipping uncertainty is not a missing reference");
  assert.notEqual(chartBasisReason, "not_below_reference", "nor is it a listing above its reference");
});

test("CASE 3: a missing recorded price is likewise not a statement about the reference", () => {
  const row = validReferenceRow({ price: null, total_price: null, total_price_usd: null });
  const { presentation, showSavings, chartBasisReason } = pageState(row);
  assert.equal(hasPrice(row.total_price), false, "the price gate is the blocker");
  assert.equal(savingsClaimTrusted(row), true, "the reference is still supported");
  assert.equal(presentation.savings, "trusted");
  assert.equal(showSavings, false);
  assert.equal(chartBasisReason, "blocked_not_reference");
  assert.notEqual(chartBasisReason, "no_reference");
});

// ---- the gates themselves are unchanged -----------------------------
//
// savingsReason is a LABEL, not a decision. Adding it must not have
// moved what any gate returns.

test("naming the reason changed no gate: savings, displayability and notes are as before", () => {
  const cases = [
    validReferenceRow(),
    { ...validReferenceRow(), ...clearedReference(CARD_REFERENCE_COLUMNS) },
    validReferenceRow({ price: 70, shipping: 5, total_price: 75, total_price_usd: 75, discount_pct: 0 }),
    validReferenceRow({ shipping: null }),
    validReferenceRow({ reference_printing: "Reverse Holofoil" }),
  ];
  for (const row of cases) {
    const p = listingPresentation(row);
    // `savings` is still exactly trusted AND positive, nothing else.
    assert.equal(p.savings, savingsClaimTrusted(row) && hasPositiveComparison(row) ? "trusted" : null);
    // A row without a savings claim still carries exactly one reason note.
    if (!p.savings) assert.ok(p.notes.length >= 1, "the prose reason is still emitted");
    // And no row is hidden for lacking a claim.
    assert.equal(isDisplayableDeal(row), true);
  }
});

test("the reason codes are a closed set", () => {
  const seen = new Set();
  for (const row of [
    validReferenceRow(),
    { ...validReferenceRow(), ...clearedReference(CARD_REFERENCE_COLUMNS) },
    validReferenceRow({ price: 70, shipping: 5, total_price: 75, total_price_usd: 75, discount_pct: 0 }),
    validReferenceRow({ reference_printing: "1st Edition" }),
  ]) {
    seen.add(listingPresentation(row).savingsReason);
  }
  for (const r of seen) {
    assert.ok(
      [null, "parallel_printing", "not_below_reference", "no_reference"].includes(r),
      `unexpected savingsReason ${r}`
    );
  }
});
