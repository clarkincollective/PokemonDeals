// DEFENCE IN DEPTH for reference integrity (deal 42127).
//
// The upstream matcher (lib/printingMatch, wired into refresh-deals) now
// prevents a plain listing being assigned a parallel-printing reference.
// The display-time gate in lib/dealQuality is NOT removed by that fix -
// it is the second line, and these tests exist to prove it still holds
// when the first line is bypassed entirely.
//
// The rows below are DELIBERATELY CORRUPTED: they carry exactly the
// reference a fixed matcher would never produce. If someone reverts the
// matcher, restores an old cached row, replays a pre-fix backup, or
// writes the column by hand, nothing may display a savings claim from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  savingsClaimTrusted,
  listingPresentation,
  isDisplayableDeal,
  referenceIsUnevidencedParallelPrinting,
} from "../../lib/dealQuality.js";
import { dealQualityScore } from "../../lib/dealQualityScore.js";

// The reported row, reconstructed from the stored evidence.
// AVAILABILITY STAMPS ARE RELATIVE, NOT LITERAL. These were hardcoded
// to the day the defect was reported, and isDisplayableDeal has a
// freshness component (freshnessTierTtl, 36h for this tier). 36 hours
// after that day the fixture went STALE and the "the listing still
// shows" assertions started failing for a reason that has nothing to do
// with what these tests assert. A test that expires by wall clock is
// testing the clock, so the stamps are now derived from now(). The
// staleness rule itself is unchanged and is covered by its own tests.
const HOURS = 3600 * 1000;
const agoISO = (h) => new Date(Date.now() - h * HOURS).toISOString();

function corruptedRow(over = {}) {
  return {
    id: 42127,
    title: "BULBASAUR 94/165 EXPEDITION BASE SET POKEMON TCG NM/LP",
    card_name: "Bulbasaur (94)",
    card_set: "Expedition",
    card_language: "english",
    card_tcgplayer_id: "84026",
    listing_id: "v1|128000469412|0",
    listing_url: "https://www.ebay.com/itm/128000469412",
    listing_type: "FIXED_PRICE",
    condition: "Lightly Played",
    is_graded: false,
    price: 40,
    shipping: 20,
    total_price: 60,
    total_price_usd: 60,
    market_price: 173.49,
    discount_pct: 0.6036,
    reference_source: "ppt_live",
    reference_product_id: "84026",
    reference_amount: 173.49,
    reference_currency: "USD",
    reference_condition: "Lightly Played",
    // the corruption: a parallel printing the listing never evidences
    reference_printing: "Reverse Holofoil",
    reference_observed_at: "2026-09-20T12:03:16.827+00:00",
    reference_synced_at: "2026-09-20T12:03:16.827+00:00",
    is_active: true,
    first_seen_at: agoISO(6),
    last_seen_at: agoISO(1),
    exact_verified_at: agoISO(1),
    visual_authenticity_status: "MATCH",
    image_verdict: "SELLER_FRONT",
    disqualified_reason: null,
    seller_feedback_score: 101,
    ...over,
  };
}

test("a deliberately corrupted stored row still cannot display a savings claim", () => {
  const row = corruptedRow();
  assert.equal(referenceIsUnevidencedParallelPrinting(row), true);
  assert.equal(savingsClaimTrusted(row), false);
  assert.equal(listingPresentation(row).savings, null);
  // and it is still SHOWN - the gate refuses the claim, not the listing
  assert.equal(isDisplayableDeal(row), true);
});

test("the same corruption in the 1st-Edition family is refused too", () => {
  const row = corruptedRow({
    title: "Charizard 4/102 Base Set Holo",
    reference_printing: "1st Edition Holofoil",
  });
  assert.equal(savingsClaimTrusted(row), false);
});

// ---- Deal Score may never be computed from a refused comparison -------

test("DEAL SCORE: a refused claim yields NO score, not a reduced one", () => {
  const row = corruptedRow();
  // The score is gated on savingsClaimTrusted + storedReferenceEvidence,
  // so a refused comparison cannot leave a residue behind. null means the
  // badge renders nothing; it must never fall back to a number derived
  // from the rejected 60% discount.
  assert.equal(dealQualityScore(row), null);
});

test("DEAL SCORE: the same listing scores once the printing IS evidenced", () => {
  // Proves the null above comes from the REFUSAL, not from some unrelated
  // gate quietly failing - otherwise the test above would pass for the
  // wrong reason and keep passing if the rule were removed.
  const evidenced = corruptedRow({
    title: "BULBASAUR 94/165 EXPEDITION REVERSE HOLO LP",
    last_seen_at: new Date().toISOString(),
  });
  assert.equal(referenceIsUnevidencedParallelPrinting(evidenced), false);
  const score = dealQualityScore(evidenced);
  assert.ok(score && score.score > 0, "an evidenced comparison does score");
  assert.ok(/Deal$/.test(score.label));
});

test("DEAL SCORE: no score component survives without a trusted reference", () => {
  // Strip the evidence entirely (no amount to reconcile) - still null,
  // never a discount-only score.
  for (const over of [
    { reference_amount: null },
    { reference_product_id: null },
    { reference_printing: "Reverse Holofoil", title: "plain card 1/100" },
  ]) {
    assert.equal(dealQualityScore(corruptedRow(over)), null, JSON.stringify(over));
  }
});
