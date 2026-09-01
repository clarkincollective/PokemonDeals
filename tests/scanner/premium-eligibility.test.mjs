// Premium placement trust gate (lib/dealQuality.isPremiumDealEligible) -
// stricter than isDisplayableDeal, for Top 10 / Best Finds / Fresh Finds
// / homepage promo. Verified live on deal 12750: a $220 Reshiram &
// Charizard GX Rainbow Rare at 55% off, matched to the genuine printing,
// that was a gold-metal counterfeit and reached Best Finds because
// premium placement only ran isDisplayableDeal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isDisplayableDeal,
  isPremiumDealEligible,
  premiumNeedsVisualMatch,
  PREMIUM_HIGH_RISK_MARKET_USD,
  PREMIUM_HIGH_RISK_DISCOUNT,
} from "../../lib/dealQuality.js";
import { isVisualScreeningCandidate } from "../../lib/visualAuthenticity.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();

// a fully-populated displayable deal
const deal = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard GX 9/68 SM Hidden Fates Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  card_name: "Charizard GX",
  card_set: "SM - Hidden Fates",
  card_tcgplayer_id: "191319",
  image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg",
  market_price: 40,
  discount_pct: 0.3,
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  last_seen_at: ago(2),
  listing_id: "v1|123456789012|0",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  disqualified_reason: null,
  visual_authenticity_status: null,
  ...over,
});

// --- 1: builds ON TOP OF isDisplayableDeal -------------------------

test("1. isPremiumDealEligible always requires isDisplayableDeal", () => {
  const notDisplayable = deal({ is_active: false });
  assert.equal(isDisplayableDeal(notDisplayable), false);
  assert.equal(isPremiumDealEligible(notDisplayable), false);
  // a fresh low-risk displayable deal IS premium-eligible
  assert.equal(isPremiumDealEligible(deal()), true);
});

// --- 2-3: mismatch verdicts can never qualify --------------------

test("2. a counterfeit-mismatch deal cannot qualify for premium", () => {
  const r = deal({ market_price: 250, discount_pct: 0.55, visual_authenticity_status: "COUNTERFEIT_MISMATCH", visual_authenticity_reason: "vision:metal plate" });
  assert.equal(isDisplayableDeal(r), false); // also fails the base gate
  assert.equal(isPremiumDealEligible(r), false);
});

test("3. an identity-mismatch deal cannot qualify for premium", () => {
  const r = deal({ market_price: 250, discount_pct: 0.55, visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:wrong print" });
  assert.equal(isPremiumDealEligible(r), false);
});

// --- 4: stale cannot qualify -----------------------------------

test("4. a stale deal cannot qualify for premium", () => {
  // low tier (mkt<100, disc<55%) TTL is 168h
  const r = deal({ market_price: 40, discount_pct: 0.3, last_seen_at: ago(200) });
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(isPremiumDealEligible(r), false);
});

// --- 5-7: the high-risk visual-MATCH requirement ---------------

test("5. a high-risk UNSCREENED deal cannot qualify for premium (deal 12750's class)", () => {
  const r = deal({ market_price: 220, discount_pct: 0.55, visual_authenticity_status: null });
  assert.equal(isDisplayableDeal(r), true); // ordinary discovery still shows it
  assert.equal(premiumNeedsVisualMatch(r), true);
  assert.equal(isPremiumDealEligible(r), false); // but NOT premium
});

test("6. a high-risk UNKNOWN deal cannot qualify for premium (suppression, not an accusation)", () => {
  const r = deal({ market_price: 220, discount_pct: 0.55, visual_authenticity_status: "UNKNOWN", visual_authenticity_reason: "vision:cannot tell | stage1 ..." });
  assert.equal(isPremiumDealEligible(r), false);
});

test("7. a high-risk MATCH deal CAN qualify for premium", () => {
  const r = deal({ market_price: 700, discount_pct: 0.5, visual_authenticity_status: "MATCH", visual_authenticity_reason: "stage1 colour_consistent" });
  assert.equal(isDisplayableDeal(r), true);
  assert.equal(isPremiumDealEligible(r), true);
});

// --- 8: lower-risk deals still qualify without a verdict -------

test("8. a lower-risk deal (below the value/discount band) still qualifies with no visual verdict", () => {
  assert.equal(premiumNeedsVisualMatch(deal({ market_price: 90, discount_pct: 0.6 })), false); // < $100
  assert.equal(isPremiumDealEligible(deal({ market_price: 90, discount_pct: 0.6, visual_authenticity_status: null })), true);
  assert.equal(premiumNeedsVisualMatch(deal({ market_price: 400, discount_pct: 0.3 })), false); // < 40% off
  assert.equal(isPremiumDealEligible(deal({ market_price: 400, discount_pct: 0.3, visual_authenticity_status: null })), true);
  // the band constants are the expected value/discount shape
  assert.equal(PREMIUM_HIGH_RISK_MARKET_USD, 100);
  assert.equal(PREMIUM_HIGH_RISK_DISCOUNT, 0.4);
});

// --- 9: genuine gold/foil card not rejected by appearance -----

test("9. a genuine gold / foil card with a MATCH verdict is NOT rejected for looking premium", () => {
  const gold = deal({
    card_name: "Charizard VMAX",
    card_set: "SM - Hidden Fates",
    title: "Charizard VMAX Gold SM Hidden Fates Shiny Vault Holo Rare",
    market_price: 300,
    discount_pct: 0.45,
    visual_authenticity_status: "MATCH",
    visual_authenticity_reason: "stage1 genuine_printing_is_metal_or_gold",
  });
  assert.equal(isPremiumDealEligible(gold), true);
});

// --- 10: premium high-risk unscreened enters the visual queue -

test("10. a premium-high-risk unscreened deal is a visual-screening candidate (queued, not bypassed)", () => {
  const r = deal({ market_price: 220, discount_pct: 0.5, visual_authenticity_status: null });
  assert.equal(isVisualScreeningCandidate(r), true);
  assert.equal(isPremiumDealEligible(r), false); // stays out of premium until MATCH
});

// --- 11-12: ranking + normal surfaces unchanged --------------

test("11. Best Finds ranking still works - premiumDisplayable filters, the sort/limit is unchanged", () => {
  const src = readFileSync(join(HERE, "..", "..", "lib", "deals.js"), "utf8");
  // the 3 premium fetchers filter with premiumDisplayable; ordering/limit lines untouched
  assert.equal((src.match(/premiumDisplayable\(data\)/g) ?? []).length, 3);
  assert.match(src, /function premiumDisplayable\(rows\)/);
  assert.match(src, /\.filter\(isPremiumDealEligible\)/);
  // fetchBestFinds still orders by discount and slices to `limit`
  assert.match(src, /\.order\("discount_pct", \{ ascending: false \}\)\.limit\(200\)/);
});

test("12. normal deal surfaces still use the plain display gate", () => {
  const src = readFileSync(join(HERE, "..", "..", "lib", "deals.js"), "utf8");
  // the grid/pool/species/hub paths keep displayable(), not premiumDisplayable()
  assert.ok((src.match(/[^m] displayable\(/g) ?? []).length >= 3, "displayable() still used on normal surfaces");
});
