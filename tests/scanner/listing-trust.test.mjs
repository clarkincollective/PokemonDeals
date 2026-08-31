// Phase 1 deal-trust / matching pipeline. Two new stages, kept distinct:
//
//   STAGE 0  qualifiesAsTradingCard(listing)  - is it a card at all,
//            before we decide WHICH card it is? (keychain / sticker /
//            coin / "Extended Art Case" display piece / fan-made proxy)
//   STAGE 3  listingTrustRisk / isHighRiskBelowMarket - a steep
//            below-market price on a valuable raw single is only promoted
//            when the LISTING itself is trustworthy: multi-signal
//            (seller history + photo count + returns + description), never
//            any single weak signal on its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  qualifiesAsTradingCard,
  listingTrustRisk,
  isHighRiskBelowMarket,
  listingMatchesCard,
  HIGH_RISK_SCORE,
} from "../../lib/dealMatching.js";
import { isDisplayableDeal, disqualificationReason } from "../../lib/dealQuality.js";

// ---------------------------------------------------------------------------
// STAGE 0 - product-type gate
// ---------------------------------------------------------------------------

test("1. a keychain with exact Pokemon name + set + collector number is rejected", () => {
  // deal 24217, live: matched the real Lickitung IR 180/162 and was shown.
  assert.equal(
    qualifiesAsTradingCard({ title: "Pokémon TCG Lickitung IR 180/162 SV05 Temporal Forces Novelty Keychain " }),
    false
  );
  assert.equal(qualifiesAsTradingCard({ title: "Charizard 4/102 Base Set Holo keychain key ring" }), false);
});

test("2. card-style jewellery (pendant / necklace / charm) is rejected", () => {
  for (const t of [
    "Pokemon Charizard Base Set Card Pendant Necklace 24/102 Holo",
    "Pikachu 58/102 Base Set trading card style pendant charm",
    "Umbreon VMAX Alt Art 215/203 acrylic charm keyring",
  ]) {
    assert.equal(qualifiesAsTradingCard({ title: t }), false, t);
  }
});

test("3. proxy / custom / fan-made / novelty items are rejected", () => {
  for (const t of [
    "M Charizard EX Full Art Evolutions Ultra Rare Pokémon Card FAN MADE",
    "Blastoise Base Set 2/102 custom holo proxy card",
    "Pokemon Manaphy XY113 Promo Extended Art Binder Insert 3x3 9-Pocket",
    "POKEMON TCG EXTENDED ART CASE MEGA ZYGARDE EX 124/088 ME03: Perfect Order",
    "Zapdos Base Set 2 Holographic Pokemon Sticker Card",
    "Pokemon Eevee Black Star Holographic Trading Card Game Coin 2000 WOTC",
  ]) {
    assert.equal(qualifiesAsTradingCard({ title: t }), false, t);
  }
});

test("4. a legitimate card whose name/finish contains 'Gold' is NOT rejected for the word", () => {
  for (const t of [
    "Charizard V 079/073 Champions Path Secret Rare Gold",
    "Lugia Legend Gold Star HeartGold SoulSilver Unlimited Holo",
    "Pikachu VMAX Gold Rainbow 188/185 Vivid Voltage",
  ]) {
    assert.equal(qualifiesAsTradingCard({ title: t }), true, t);
  }
});

test("5. a legitimate official metal / textured product is NOT rejected solely for 'metal'", () => {
  for (const t of [
    "Metal Energy Special Deluxe Promo Pokemon Card",
    "Pikachu VMAX Gold Metal Card 188/185 Vivid Voltage Secret Rare",
  ]) {
    assert.equal(qualifiesAsTradingCard({ title: t }), true, t);
  }
});

test("6. a legitimate promo card is NOT rejected for the word 'promo'", () => {
  assert.equal(
    qualifiesAsTradingCard({ title: "Pikachu & Zekrom GX SM168 Black Star Promo Holo English" }),
    true
  );
  assert.equal(
    qualifiesAsTradingCard({ title: "Reshiram & Charizard GX SM201 SM Promo Tag Team NM" }),
    true
  );
});

test("a real card that merely THROWS IN a coin/token is kept; a coin that IS the product is rejected", () => {
  assert.equal(qualifiesAsTradingCard({ title: "Charizard EX XY121 XY Holo Rare + FREE COIN!" }), true);
  assert.equal(qualifiesAsTradingCard({ title: "Seviper 11/100 EX Sandstorm Holo Pokémon Card With Bonus Coin" }), true);
  assert.equal(qualifiesAsTradingCard({ title: "Pokemon Meowth Black Star Trading Card Game Coin 2000 WOTC" }), false);
  assert.equal(qualifiesAsTradingCard({ title: "VTG 2001 Tazo Pokemon #133 Eevee Matutano WOTC Promo Token" }), false);
});

test("'top loader' / 'sleeve' / 'jumbo' packaging words do NOT make a card non-card", () => {
  for (const t of [
    "Pokémon Venusaur 13/147 Supreme Victors Deck NM Top Loader & Sleeve",
    "Umbreon & Darkrai GX SM241 JUMBO NM Top Loader Pokémon",
    "Primarina GX Jumbo SM39 With Toploader NM",
  ]) {
    assert.equal(qualifiesAsTradingCard({ title: t }), true, t);
  }
});

test("12. exact listing identity is still required after the product-type gate", () => {
  // a genuine card title still has to match the catalogue name+set
  assert.equal(
    listingMatchesCard(
      { title: "Charizard Expedition Base Set Reverse Holo 40/165" },
      { name: "Charizard", set: "Base Set 2" }
    ),
    false
  );
  assert.equal(
    listingMatchesCard(
      { title: "Charizard 4/102 Base Set Shadowless Holo" },
      { name: "Charizard", set: "Base Set" }
    ),
    true
  );
});

// ---------------------------------------------------------------------------
// STAGE 3 - multi-signal listing trust
// ---------------------------------------------------------------------------

test("7. a low-feedback seller ALONE is not enough to reject", () => {
  // new seller (score 12), but real photos + a real description + a
  // moderate discount -> not high risk.
  const r = listingTrustRisk({
    sellerFeedbackScore: 12,
    imageCount: 6,
    returnsAccepted: true,
    descriptionLength: 900,
    discountPct: 0.55,
  });
  assert.ok(r < HIGH_RISK_SCORE, `risk ${r} should be below ${HIGH_RISK_SCORE}`);
  assert.equal(isHighRiskBelowMarket({ sellerFeedbackScore: 12, imageCount: 6, returnsAccepted: true, descriptionLength: 900, discountPct: 0.55 }), false);
});

test("8. a one-photo listing ALONE is not enough to reject", () => {
  // established seller (score 27,000), one photo, long description.
  const sig = {
    sellerFeedbackScore: 27000,
    imageCount: 1,
    returnsAccepted: false,
    descriptionLength: 800,
    discountPct: 0.6,
  };
  assert.ok(listingTrustRisk(sig) < HIGH_RISK_SCORE);
  assert.equal(isHighRiskBelowMarket(sig), false);
});

test("10. the multi-signal combination IS rejected (thin seller + 1-2 photos + no returns + title-echo desc + steep)", () => {
  // deal 4220 shape.
  const sig = {
    sellerFeedbackScore: 34,
    imageCount: 2,
    returnsAccepted: false,
    descriptionLength: 77,
    descriptionIsTitleEcho: true,
    discountPct: 0.63,
  };
  assert.ok(listingTrustRisk(sig) >= HIGH_RISK_SCORE, `risk ${listingTrustRisk(sig)}`);
  assert.equal(isHighRiskBelowMarket(sig), true);
});

test("a steep discount is REQUIRED before trust risk can hide a listing", () => {
  // same thin signals but only a 30% discount -> a small seller's modest
  // bargain, left alone.
  const sig = {
    sellerFeedbackScore: 20,
    imageCount: 1,
    returnsAccepted: false,
    descriptionLength: 0,
    discountPct: 0.3,
  };
  assert.equal(isHighRiskBelowMarket(sig), false);
});

test("11. a normal high-value raw listing from a real shop is unaffected", () => {
  // Rayquaza ex EX Dragon at 61% off, 281-feedback seller, 5 photos,
  // returns accepted, 5,000-char description (deal 8132).
  const sig = {
    sellerFeedbackScore: 281,
    imageCount: 5,
    returnsAccepted: true,
    descriptionLength: 5299,
    discountPct: 0.61,
  };
  assert.equal(isHighRiskBelowMarket(sig), false);
  assert.ok(listingTrustRisk(sig) <= 2);
});

test("missing signals never add risk (unknown != guilty)", () => {
  assert.equal(listingTrustRisk({ discountPct: 0.8 }), 2); // only the discount tiers
  assert.equal(listingTrustRisk({}), 0);
});

// ---------------------------------------------------------------------------
// display gate wiring
// ---------------------------------------------------------------------------

const row = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard 4/102 Base Set Holo Rare NM",
  condition: "Near Mint",
  card_language: "english",
  discount_pct: 0.65,
  listing_id: "v1|168631568736|0",
  listing_url: "https://www.ebay.com/itm/168631568736?x=1",
  affiliate_url: "https://www.ebay.com/itm/168631568736?x=1&campid=5339197414",
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  ...over,
});

test("13. a non-card stored row is not displayable and gets type:not_a_card", () => {
  const kc = row({ title: "Pokémon TCG Lickitung IR 180/162 SV05 Temporal Forces Novelty Keychain" });
  assert.equal(isDisplayableDeal(kc), false);
  assert.equal(disqualificationReason(kc), "type:not_a_card");
});

test("an enriched high-risk stored row is hidden with trust:high_risk_below_market", () => {
  // deal 4608 shape: tiny seller + a single photo + no returns + a very
  // steep discount. Reaches the threshold on the PERSISTED signals alone
  // (description length is not stored, so display-time is deliberately
  // less sensitive than scan-time).
  const hr = row({
    seller_feedback_score: 20,
    image_count: 1,
    returns_accepted: false,
    discount_pct: 0.72,
  });
  assert.equal(isDisplayableDeal(hr), false);
  assert.equal(disqualificationReason(hr), "trust:high_risk_below_market");
});

test("a NON-enriched historical row (no image_count / returns) is NOT judged on trust risk", () => {
  // image_count + returns_accepted both null -> the one-time backfill owns
  // these, not the live gate; the row stays displayable on its other merits.
  const legacy = row({ seller_feedback_score: 20, image_count: null, returns_accepted: null });
  assert.equal(isDisplayableDeal(legacy), true);
});

test("an enriched but clearly-legit row still displays", () => {
  const ok = row({
    seller_feedback_score: 4000,
    image_count: 5,
    returns_accepted: true,
    discount_pct: 0.6,
  });
  assert.equal(isDisplayableDeal(ok), true);
  assert.equal(disqualificationReason(ok), null);
});

test("13b. condition + language gates still bite (unchanged)", () => {
  assert.equal(isDisplayableDeal(row({ title: "Charizard 4/102 Base Set Holo HEAVILY PLAYED" })), false);
  assert.equal(
    isDisplayableDeal(row({ title: "Charizard 4/102 Base Set Holo Japanese", card_language: "english" })),
    false
  );
});
