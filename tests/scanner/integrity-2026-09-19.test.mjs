// integrity-2026-09-19 - the four public-inspection leads and the classes
// they revealed. Pure matcher / display-gate tests, no DB, no network.
//
//   38959  "PSA 8 SHAYMIN EX 77 ROARING SKIES XY"      vs  Shaymin EX / XY Promos
//   19552  "...71/236 ... PSA 8 World Championship"      vs  Mewtwo & Mew GX / SM - Unified Minds
//   39405  "M Garchomp EX XY168 ... *JUMBO*"             vs  M Garchomp EX - XY168 / XY Promos
//   40228  "...Shadowless Charizard Holo Authentic Recolored" (AUCTION)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const {
  listingMatchesCard,
  titleAssertedProductForm,
  titleNamesDifferentExpansion,
} = require("../../lib/dealMatching.js");
const { isDisplayableDeal, disqualificationReason, savingsClaimTrusted } = require("../../lib/dealQuality.js");

const row = (over) => ({
  id: 1, is_active: true, disqualified_reason: null, listing_type: "FIXED_PRICE",
  marketplace: "EBAY_US", currency: "USD", price: 50, shipping: 0, total_price: 50, total_price_usd: 50,
  market_price: 100, discount_pct: 0.5, is_graded: false, condition: "Near Mint",
  listing_url: "https://www.ebay.com/itm/123456789012", affiliate_url: "https://www.ebay.com/itm/123456789012",
  last_seen_at: new Date().toISOString(), first_seen_at: new Date().toISOString(),
  reference_source: "ppt_live", reference_amount: 100, reference_currency: "USD",
  reference_condition: "Near Mint", reference_product_id: "1", card_tcgplayer_id: "1",
  reference_printing: "Holofoil",
  ...over,
});

// ---- the four leads -------------------------------------------------------

test("38959: a title naming Roaring Skies is not the XY Promos Shaymin EX", () => {
  const card = { name: "Shaymin EX", set: "XY Promos", language: "english" };
  const title = "PSA 8 SHAYMIN EX 77 ROARING SKIES XY POKEMON MJ";
  assert.equal(titleNamesDifferentExpansion(card.set, title), "roaring skies");
  assert.equal(listingMatchesCard({ title }, card), false);
  const r = row({ title, card_name: card.name, card_set: card.set, card_language: "english", is_graded: true, grader: "PSA", grade: "8" });
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(disqualificationReason(r), "identity:title_names_other_set:roaring_skies");
});

test("19552: a World Championship reprint is not the standard Unified Minds print", () => {
  const card = { name: "Mewtwo & Mew GX", set: "SM - Unified Minds", language: "english" };
  const title = "Mewtwo & Mew Tag Team GX 71/236 Sm-Unified Minds Holo PSA 8 World Championship";
  assert.equal(titleAssertedProductForm(title, card), "world_championship");
  assert.equal(listingMatchesCard({ title }, card), false);
  const r = row({ title, card_name: card.name, card_set: card.set, card_language: "english", is_graded: true, grader: "PSA", grade: "8" });
  assert.equal(disqualificationReason(r), "variant:title_asserts_world_championship");
});

test("39405: a JUMBO promo is not the standard-size XY168", () => {
  const card = { name: "M Garchomp EX - XY168", set: "XY Promos", language: "english" };
  const title = "The Pokémon Company M Garchomp EX XY168 XY Full Art Holo Promo Eng 2016 *JUMBO*";
  assert.equal(titleAssertedProductForm(title, card), "jumbo");
  assert.equal(listingMatchesCard({ title }, card), false);
  assert.equal(disqualificationReason(row({ title, card_name: card.name, card_set: card.set, card_language: "english" })), "variant:title_asserts_jumbo");
});

test("40228: an altered (recolored) card is not the product its reference prices", () => {
  const title = "Pokémon TCG Base Set Shadowless Charizard Holo Authentic Recolored";
  const r = row({ title, card_name: "Charizard", card_set: "Base Set (Shadowless)", card_language: "english", listing_type: "AUCTION", condition: "Lightly Played", reference_condition: "Lightly Played" });
  assert.equal(isDisplayableDeal(r), false);
  // "altered" already lived in dealQuality's DAMAGE_TITLE_PATTERNS as a
  // condition the reference can never be advertised against; the other
  // alteration words now join it there, so the reason stays in that family.
  assert.match(disqualificationReason(r), /^condition:/);
  for (const t of ["Charizard Base Set Shadowless alter art holo", "Charizard Base Set Shadowless extended art holo", "Charizard Base Set Shadowless repainted"]) {
    const rr = row({ ...r, title: t });
    assert.equal(isDisplayableDeal(rr), false, t);
    assert.match(disqualificationReason(rr), /^condition:/, t);
  }
  // "Extended Artwork" (a seller describing the art style for a genuine XY96)
  // is not "extended art" - word-boundary anchored.
  assert.equal(disqualificationReason(row({ title: "Umbreon XY96 XY Promo Pokemon Extended Artwork For PSA", card_name: "Umbreon - XY96", card_set: "XY Promos", card_language: "english" })), null);
});

test("a promo set's listing may name the expansion the promo shipped with (IR-3 shape)", () => {
  const moltres = { title: "PSA 9 Moltres Zapdos Articuno GX SM210 Hidden Fates ETB Promo Pokemon Card MINT" };
  assert.equal(titleNamesDifferentExpansion("SM Promos", moltres.title), null);
  assert.equal(listingMatchesCard(moltres, { name: "Moltres & Zapdos & Articuno GX", set: "SM Promos", card_number: "SM210", language: "english" }), true);
  // the word "promo" alone is promo evidence too
  assert.equal(titleNamesDifferentExpansion("XY Promos", "Charizard EX Flashfire black star promo"), null);
});

// ---- the gates must be POSITIVE-contradiction only ---------------------------

test("a genuine listing that says nothing extra is unaffected", () => {
  const card = { name: "Shaymin EX", set: "XY Promos", language: "english" };
  assert.equal(listingMatchesCard({ title: "Shaymin EX XY77 Black Star Promo Holo NM" }, card), true);
  assert.equal(titleAssertedProductForm("Shaymin EX XY77 Black Star Promo Holo NM", card), null);
  const uni = { name: "Mewtwo & Mew GX", set: "SM - Unified Minds", language: "english" };
  assert.equal(listingMatchesCard({ title: "Mewtwo & Mew GX 71/236 Unified Minds Holo PSA 8" }, uni), true);
});

test("a title that carries the catalogue set's own strong tokens keeps a second set name from deciding", () => {
  // reprint listing naming both the original and the reprint set: the
  // reprint-family rule decides, not this gate
  assert.equal(titleNamesDifferentExpansion("Legendary Collection", "Dark Blastoise Team Rocket Legendary Collection reverse holo"), null);
  // era-code-only sets ARE subject to it - when the title carries no promo
  // evidence (no promo code, no "promo" word)
  assert.equal(titleNamesDifferentExpansion("XY Promos", "Charizard EX 12/106 Flashfire holo"), "flashfire");
  // the catalogue set contained in a longer phrase is never a conflict
  assert.equal(titleNamesDifferentExpansion("SV01: Scarlet & Violet Base Set", "Pikachu Scarlet & Violet base set 025/198"), null);
  assert.equal(titleNamesDifferentExpansion("SV01: Scarlet & Violet Base Set", "Pikachu Scarlet & Violet 151 holo"), "scarlet violet 151");
});

test("the catalogue's own Jumbo / World Championships / Prerelease rows still match their listings", () => {
  assert.equal(titleAssertedProductForm("Charizard EX XY121 JUMBO promo", { name: "Charizard EX - XY121 (Jumbo)", set: "XY Promos" }), null);
  assert.equal(titleAssertedProductForm("Rayquaza ex World Championships 2007", { name: "Rayquaza ex", set: "World Championship Decks" }), null);
  assert.equal(titleAssertedProductForm("Charizard 11/108 Prerelease promo", { name: "Charizard - 11/108 (Prerelease)", set: "XY Promos" }), null);
});

// ---- auction bids are not secured savings ---------------------------------------

test("DealCard never puts the green savings badge on an auction; the amber bid badge names the bid", () => {
  const src = readFileSync(new URL("../../components/DealCard.js", import.meta.url), "utf8");
  assert.match(src, /savingsSupported && !isAuction && \(/, "green badge is BIN-only");
  assert.match(src, /savingsSupported && isAuction && \(/, "auction badge branch exists");
  assert.match(src, /Bid \{savingsBadgeText\(deal\.discount_pct\)\}/);
  assert.match(src, /bids can raise the final price/);
});

test("the detail page labels the market reference; it is never a struck-through former price", () => {
  const src = readFileSync(new URL("../../app/deals/[id]/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /line-through/);
  assert.match(src, /Market reference/);
});

test("the savings trust rule is untouched by these gates (a clean row still qualifies)", () => {
  const r = row({ title: "Charizard Base Set Shadowless holo 4/102 LP", card_name: "Charizard", card_set: "Base Set (Shadowless)", card_language: "english", condition: "Lightly Played", reference_condition: "Lightly Played" });
  assert.equal(savingsClaimTrusted(r), true);
  assert.equal(isDisplayableDeal(r), true);
});
