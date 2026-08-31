// The shared deal-quality gate (lib/dealQuality): condition + language
// compatibility with the market reference. "Cheap != good deal."

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyListingCondition,
  conditionAllowsPromotion,
  physicalConditionOf,
  storedDealCondition,
  conditionLabel,
  classifyListingLanguage,
  languageCompatible,
  isExactEbayDealDestination,
  auctionEnded,
  legacyItemId,
  isDisplayableDeal,
  disqualificationReason,
} from "../../lib/dealQuality.js";

// A well-formed deal row: exact /itm/ destination whose id matches
// listing_id, fixed-price (no auction end). Overrides via `over`.
const deal = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard Base Set 4/102 Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  discount_pct: 0.2,
  listing_id: "v1|168631568736|0",
  listing_url: "https://www.ebay.com/itm/168631568736?_skw=x&hash=item1",
  affiliate_url:
    "https://www.ebay.com/itm/168631568736?_skw=x&hash=item1&mkevt=1&mkcid=1&campid=5339197414",
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  ...over,
});

// ---------- VALID ----------
test("Near Mint English correct card can qualify", () => {
  assert.equal(isDisplayableDeal(deal()), true);
});

test("a genuine clean deeply-discounted listing still qualifies", () => {
  assert.equal(isDisplayableDeal(deal({ discount_pct: 0.72, title: "Charizard Base Set 4/102 Holo Rare NM" })), true);
});

test("correct language + condition is unaffected", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Pikachu VMAX 044/185 English Near Mint" })), true);
});

test("graded deal passes the raw-condition gate (grade is its condition)", () => {
  assert.equal(isDisplayableDeal(deal({ is_graded: true, title: "Charizard Base Set PSA 3 (Poor)" })), true);
});

// ---------- CONDITION FAILURES ----------
for (const [label, title] of [
  ["Damaged", "Charizard Base Set 4/102 DAMAGED"],
  ["DMG", "Charizard Base Set 4/102 Holo DMG"],
  ["Heavily Played", "Charizard Base Set 4/102 Heavily Played"],
  ["creased", "Charizard Base Set 4/102 Holo - creased"],
  ["water damaged", "Charizard Base Set 4/102 water damaged"],
  ["torn", "Charizard Base Set 4/102 corner torn"],
  ["altered", "Dark Gengar 6/105 Neo Destiny ** Altered Pin Holes"],
  ["inked", "INKED Kyogre 12/95 Call of Legends Holo Rare"],
  ["(Poor)", "Ninetales H19/H32 Aquapolis Holo ENG (Poor)"],
  ["trailing POOR", "Pokemon Dark Gengar 12/105 holo ENG Neo Destiny POOR"],
]) {
  test(`condition: ${label} -> rejected`, () => {
    assert.equal(isDisplayableDeal(deal({ title })), false);
    assert.match(disqualificationReason(deal({ title })), /^condition:/);
  });
}

test("card's own '200HP' hit points is NOT read as Heavily Played", () => {
  const t = "Espeon GX Full Art Secret Rare Holo 152/149 SM Base Set 200HP";
  assert.notEqual(classifyListingCondition({ title: t }), "Heavily Played");
  assert.equal(isDisplayableDeal(deal({ title: t })), true); // title alone is clean
});

test("a lone trailing 'HP'/'PL' abbreviation (after a word, not a number) is a wear tag", () => {
  assert.equal(classifyListingCondition({ title: "Pokemon Card Raikou H26/H32 Holo Rare Skyridge HP" }), "Heavily Played");
  assert.equal(classifyListingCondition({ title: "Feraligatr 4/111 Neo Genesis Holo PL" }), "Moderately Played");
  assert.equal(isDisplayableDeal(deal({ title: "Raikou H26/H32 Holo Rare Skyridge HP" })), false);
  // still not a false positive on a real HP stat
  assert.notEqual(classifyListingCondition({ title: "Charizard VMAX 020/189 Darkness Ablaze 330 HP" }), "Heavily Played");
});

test("structured 'Card Condition' descriptor is authoritative over a clean title", () => {
  assert.equal(
    classifyListingCondition({ title: "Espeon GX 152/149 SM Base Set 200HP", descriptorContent: "Heavily played (Poor)" }),
    "Heavily Played"
  );
});

test("Lightly Played allowed by default, dropped when an exact reference is required", () => {
  assert.equal(conditionAllowsPromotion("Lightly Played"), true);
  assert.equal(conditionAllowsPromotion("Lightly Played", { requireExactRef: true }), false);
  assert.equal(conditionAllowsPromotion("Moderately Played"), false);
});

// ---------- LANGUAGE ----------
test("Japanese listing vs English card -> rejected", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Charizard Base Set Japanese Holo" })), false);
  assert.match(disqualificationReason(deal({ title: "Charizard Base Set Japanese Holo" })), /^language:/);
});

test("Korean / German / Italian / French listing vs English card -> rejected", () => {
  for (const t of [
    "2011 Pokemon Korean Blastoise Evolution Set",
    "Charizard German Pokémon Diamond & Pearl #3",
    "Snorlax 100/144 Skyridge Non-Holo Rare ITALIAN WOTC",
    "Feraligatr 4/111 Neo Genesis Holo (French - Aligatueur)",
  ]) {
    assert.equal(isDisplayableDeal(deal({ title: t })), false, t);
  }
});

test("English listing vs English card -> allowed", () => {
  assert.equal(isDisplayableDeal(deal({ title: "Charizard Base Set English Holo Rare" })), true);
});

test("unknown language with no evidence -> NOT invented as foreign", () => {
  assert.equal(classifyListingLanguage({ title: "Charizard Base Set 4/102 Holo Rare" }), "unknown");
  assert.equal(languageCompatible("unknown", "english"), true);
  assert.equal(isDisplayableDeal(deal({ title: "Charizard Base Set 4/102 Holo Rare" })), true);
});

test("Japanese listing IS allowed for a Japanese catalogue row (match, not english-only)", () => {
  assert.equal(languageCompatible("japanese", "japanese"), true);
  assert.equal(isDisplayableDeal(deal({ title: "Pikachu Japanese Promo", card_language: "japanese" })), true);
});

// ---------- DISPLAY PROTECTION (legacy rows) ----------
test("historically-accepted damaged row is excluded from display even while is_active", () => {
  assert.equal(
    isDisplayableDeal({ is_active: true, is_graded: false, condition: "Ungraded", card_language: "english",
      title: "2002 Neo Destiny Dark Gengar 6/105 Holo Foil Rare Pokemon ** Altered Pin Holes" }),
    false
  );
});

test("historically-accepted wrong-language row is excluded from display", () => {
  assert.equal(
    isDisplayableDeal({ is_active: true, is_graded: false, condition: "Near Mint", card_language: "english",
      title: "Pokémon Card Neo Destiny No. 2/105 Dark Crobat Holo German" }),
    false
  );
});

test("an explicit disqualified_reason (if the column exists) hides the row", () => {
  assert.equal(isDisplayableDeal(deal({ disqualified_reason: "condition:damaged" })), false);
});

test("inactive rows are never displayable", () => {
  assert.equal(isDisplayableDeal(deal({ is_active: false })), false);
});

test("clean genuine rows are untouched", () => {
  assert.equal(disqualificationReason(deal({ title: "Umbreon VMAX 215/203 Evolving Skies Alt Art English NM" })), null);
});

// ---------- UNGRADED / UNKNOWN != NEAR MINT ----------
test("'Ungraded' (grading status) is NOT a physical condition -> Unknown", () => {
  for (const s of ["Ungraded", "Non gradata", "Nicht bewertet", "Sin clasificar", "Used", "Unspecified", "", null]) {
    assert.equal(physicalConditionOf(s), "Unknown", `${s}`);
  }
  assert.equal(physicalConditionOf("Near Mint"), "Near Mint");
  assert.equal(physicalConditionOf("Heavily Played"), "Heavily Played");
});

test("Unknown physical condition is never promotable", () => {
  assert.equal(conditionAllowsPromotion("Unknown"), false);
  assert.equal(conditionAllowsPromotion(null), false);
  assert.equal(conditionAllowsPromotion("Ungraded"), false); // not a tier
  assert.equal(conditionAllowsPromotion("Near Mint"), true);
});

test("an Unknown / Ungraded raw row cannot be a verified deal or enter rankings", () => {
  assert.equal(isDisplayableDeal(deal({ condition: "Ungraded" })), false);
  assert.equal(isDisplayableDeal(deal({ condition: null })), false);
  assert.equal(isDisplayableDeal(deal({ condition: "Non gradée" })), false);
  assert.match(disqualificationReason(deal({ condition: "Ungraded" })), /^condition:unknown_unverified$/);
});

test("explicit structured Near Mint can still qualify", () => {
  assert.equal(
    classifyListingCondition({ title: "Raikou H26 Skyridge Holo Rare", descriptorContent: "Near mint or better" }),
    "Near Mint"
  );
  assert.equal(isDisplayableDeal(deal({ condition: "Near Mint" })), true);
});

test("conditionDescription contradiction overrides a benign generic 'Ungraded'", () => {
  // deal 23710 shape: title + eBay condition both benign, structured says HP
  assert.equal(
    classifyListingCondition({
      title: "2003 Pokemon, Skyridge, #H26/H32 Raikou, Holo Rare",
      ebayCondition: "Ungraded",
      descriptorContent: "Heavily played (Poor)",
    }),
    "Heavily Played"
  );
});

test("conditionLabel never says 'Near Mint' by default", () => {
  assert.equal(conditionLabel(deal({ condition: "Ungraded" })), "Condition not verified");
  assert.equal(conditionLabel(deal({ condition: null })), "Condition not verified");
  assert.equal(conditionLabel(deal({ condition: "Near Mint" })), "Near Mint");
  assert.equal(conditionLabel(deal({ condition: "Heavily Played" })), "Heavily Played");
  assert.equal(conditionLabel({ is_graded: true, grader: "PSA", grade: "10" }), "PSA 10");
});

test("grading status stays separate from physical condition", () => {
  // a graded slab in poor condition is still a graded deal (its grade IS
  // the condition) - not raw-condition-gated
  assert.equal(isDisplayableDeal(deal({ is_graded: true, grader: "PSA", grade: "1", condition: "Ungraded" })), true);
});

test("historical Unknown row cannot remain a Top Deal through the display gate", () => {
  const legacy = { is_active: true, is_graded: false, condition: "Ungraded", card_language: "english",
    discount_pct: 0.55, title: "2003 Pokemon, Skyridge, #H26/H32 Raikou, Holo Rare" };
  assert.equal(isDisplayableDeal(legacy), false);
});

test("storedDealCondition worsens a stored NM by a title damage word, never upgrades", () => {
  assert.equal(storedDealCondition({ condition: "Near Mint", title: "Charizard Base Set ** Altered Pin Holes" }), "Damaged");
  assert.equal(storedDealCondition({ condition: "Heavily Played", title: "Charizard Base Set NM" }), "Heavily Played");
});

// ---------- EXACT-LISTING DESTINATION ----------
test("legacyItemId pulls the numeric id from a stored listing_id", () => {
  assert.equal(legacyItemId("v1|168631568736|0"), "168631568736");
  assert.equal(legacyItemId("287326449028"), "287326449028");
  assert.equal(legacyItemId("v1|123|4|5"), "123");
  assert.equal(legacyItemId(null), null);
});

test("exact item-specific affiliate URL passes; /p/<epid> and /sch/ fail", () => {
  assert.equal(isExactEbayDealDestination(deal()), true); // /itm/168631568736 matches listing_id
  assert.equal(
    isExactEbayDealDestination(deal({ affiliate_url: "https://www.ebay.com/p/22063031433?campid=5339197414", listing_url: "https://www.ebay.com/p/22063031433" })),
    false
  );
  assert.equal(
    isExactEbayDealDestination(deal({ affiliate_url: "https://www.ebay.com/sch/i.html?_nkw=Radiant+Charizard", listing_url: "https://www.ebay.com/sch/i.html?_nkw=x" })),
    false
  );
  assert.equal(isExactEbayDealDestination(deal({ affiliate_url: "https://www.ebay.com/", listing_url: "https://www.ebay.com/" })), false);
  assert.equal(isExactEbayDealDestination(deal({ affiliate_url: null, listing_url: null })), false);
  assert.equal(isExactEbayDealDestination(deal({ affiliate_url: "not a url", listing_url: "also not" })), false);
});

test("CTA pointing at a DIFFERENT item id than listing_id fails", () => {
  assert.equal(
    isExactEbayDealDestination(deal({ affiliate_url: "https://www.ebay.com/itm/999999999999?campid=5339197414" })),
    false
  );
});

test("plain /itm/ listing_url is accepted when affiliate_url is missing", () => {
  assert.equal(isExactEbayDealDestination(deal({ affiliate_url: null })), true);
});

test("the exact affiliate URL keeps campaign 5339197414 and is still exact", () => {
  const d = deal();
  assert.match(d.affiliate_url, /campid=5339197414/);
  assert.equal(isExactEbayDealDestination(d), true);
});

// ---------- ENDED AUCTIONS ----------
const HOUR = 3600 * 1000;
test("an AUCTION past its end time is not a live deal", () => {
  const past = new Date(Date.now() - 48 * HOUR).toISOString();
  const future = new Date(Date.now() + 48 * HOUR).toISOString();
  assert.equal(auctionEnded(deal({ listing_type: "AUCTION", auction_end_at: past })), true);
  assert.equal(auctionEnded(deal({ listing_type: "AUCTION", auction_end_at: future })), false);
  assert.equal(auctionEnded(deal({ listing_type: "FIXED_PRICE", auction_end_at: past })), false); // not an auction
  assert.equal(auctionEnded(deal({ listing_type: "AUCTION", auction_end_at: null })), false); // unknown -> live

  assert.equal(isDisplayableDeal(deal({ listing_type: "AUCTION", auction_end_at: past })), false);
  assert.equal(isDisplayableDeal(deal({ listing_type: "AUCTION", auction_end_at: future })), true);
});

test("an ended auction / non-exact destination never falls back to /p/ - it's soft-expired", () => {
  const past = new Date(Date.now() - 72 * HOUR).toISOString();
  assert.equal(disqualificationReason(deal({ listing_type: "AUCTION", auction_end_at: past })), "auction_ended");
  assert.equal(
    disqualificationReason(deal({ affiliate_url: "https://www.ebay.com/p/22063031433", listing_url: "https://www.ebay.com/p/22063031433" })),
    "destination:non_exact"
  );
});

test("Buy It Now with an exact item URL is unaffected", () => {
  assert.equal(isDisplayableDeal(deal({ listing_type: "FIXED_PRICE" })), true);
});

test("a graded deal still needs an exact destination and a live auction", () => {
  assert.equal(isDisplayableDeal(deal({ is_graded: true, grader: "PSA", grade: "9" })), true);
  const past = new Date(Date.now() - HOUR).toISOString();
  assert.equal(isDisplayableDeal(deal({ is_graded: true, grader: "PSA", grade: "9", listing_type: "AUCTION", auction_end_at: past })), false);
  assert.equal(isDisplayableDeal(deal({ is_graded: true, affiliate_url: "https://www.ebay.com/p/123", listing_url: "https://www.ebay.com/p/123" })), false);
});
