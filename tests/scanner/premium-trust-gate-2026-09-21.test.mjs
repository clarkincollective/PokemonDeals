// 2026-09-21, owner-authorised. Three listings the owner reported as
// counterfeit passed every shipped check. Their shared shape: premium
// high-risk band, 52-63 % below a three-figure reference, weak seller
// trust signals. The existing scorer missed them because it needs
// discount >= 0.55 AND a composite score; 41914 sat at 52 %.
//
// This gate is deliberately narrow: inside the band, an explicit returns
// refusal AND a present-but-low feedback score. Measured impact before
// shipping was 21 of 91 band rows, 1.6 % of everything displayed.
//
// The tests that matter most here are the ones pinning what the rule must
// NOT do - a display gate that over-fires hides real inventory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { premiumBandLacksSellerTrust, PREMIUM_TRUST_MIN_FEEDBACK, isDisplayableDeal } =
  createRequire(import.meta.url)("../../lib/dealQuality.js");

// In the band ($100+ reference, 40 %+ off) with both adverse signals.
const banded = (over = {}) => ({
  market_price: 764.12,
  discount_pct: 0.57,
  seller_feedback_score: 33,
  returns_accepted: false,
  ...over,
});

test("fires on the reported shape: in band, low feedback, returns refused", () => {
  assert.equal(premiumBandLacksSellerTrust(banded()), true);
  // 41914: 52 % off, feedback 147 - under the old 0.55 scorer floor.
  assert.equal(premiumBandLacksSellerTrust(banded({ market_price: 125.28, discount_pct: 0.52, seller_feedback_score: 147 })), true);
});

test("a missing feedback score is NOT this rule", () => {
  // 21 % of band rows have no score. Withholding for our own enrichment
  // gap would punish the seller for a hole on our side; that variant was
  // measured at 3.0 % of displayed inventory and deliberately not adopted.
  assert.equal(premiumBandLacksSellerTrust(banded({ seller_feedback_score: null })), false);
  assert.equal(premiumBandLacksSellerTrust(banded({ seller_feedback_score: undefined })), false);
});

test("returns must be explicitly refused, never merely unknown", () => {
  for (const v of [null, undefined, true]) {
    assert.equal(premiumBandLacksSellerTrust(banded({ returns_accepted: v })), false, `returns_accepted ${String(v)}`);
  }
});

test("outside the band the rule never fires, however weak the seller", () => {
  // Cheap card, same seller profile.
  assert.equal(premiumBandLacksSellerTrust(banded({ market_price: 42 })), false);
  // Expensive card, ordinary discount.
  assert.equal(premiumBandLacksSellerTrust(banded({ discount_pct: 0.2 })), false);
  // Exactly on both thresholds is inside the band (>=, not >).
  assert.equal(premiumBandLacksSellerTrust(banded({ market_price: 100, discount_pct: 0.4 })), true);
  // A hair under either bound is outside it.
  assert.equal(premiumBandLacksSellerTrust(banded({ market_price: 99.99 })), false);
  assert.equal(premiumBandLacksSellerTrust(banded({ discount_pct: 0.399 })), false);
});

test("an established seller in the band is untouched", () => {
  assert.equal(premiumBandLacksSellerTrust(banded({ seller_feedback_score: PREMIUM_TRUST_MIN_FEEDBACK })), false);
  assert.equal(premiumBandLacksSellerTrust(banded({ seller_feedback_score: 5000 })), false);
});

test("garbage inputs do not fire the gate", () => {
  for (const bad of [null, undefined, {}, { market_price: "x", discount_pct: "y" }]) {
    assert.equal(premiumBandLacksSellerTrust(bad), false, JSON.stringify(bad));
  }
  assert.equal(premiumBandLacksSellerTrust(banded({ seller_feedback_score: "not a number" })), false);
});

test("the gate actually hides the listing, graded or raw", () => {
  // A row that would otherwise display. Graded matters: displayGate
  // returns early for is_graded, and this rule runs BEFORE that, because
  // a slab from a low-feedback seller refusing returns is the
  // counterfeit-slab shape rather than a reason to relax.
  const base = {
    is_active: true,
    disqualified_reason: null,
    title: "Charizard GX SV49/SV94 Hidden Fates Shiny Vault",
    card_name: "Charizard GX",
    card_set: "Hidden Fates: Shiny Vault",
    // isExactEbayDealDestination reads listing_url/affiliate_url and
    // cross-checks the id against listing_id - both are required or the
    // row fails the destination gate for an unrelated reason.
    listing_id: "123456789012",
    listing_url: "https://www.ebay.com/itm/123456789012",
    last_seen_at: new Date().toISOString(),
    listing_type: "FIXED_PRICE",
    condition: "Near Mint",
    market_price: 764.12,
    discount_pct: 0.57,
  };
  const trusted = { ...base, is_graded: true, seller_feedback_score: 5000, returns_accepted: true };
  const untrusted = { ...base, is_graded: true, seller_feedback_score: 33, returns_accepted: false };
  assert.equal(isDisplayableDeal(trusted), true, "an established seller's graded row still shows");
  assert.equal(isDisplayableDeal(untrusted), false, "the gate runs before the graded early-return");
});
