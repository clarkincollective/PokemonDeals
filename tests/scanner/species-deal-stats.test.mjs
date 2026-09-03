// Phase 13B.3.2 - the visible /pokemon/[slug] inventory count
// ("N cards with a live deal") is computed under the SAME canonical
// species membership + display gate + dedupe key the deal grid uses, so
// the number can never disagree with the grid. Pure, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speciesDealStatCounts, speciesDealKey, listingKey } from "../../lib/speciesDealScope.js";

// A fixture already SCOPED to one english species (that scoping is
// speciesScopeOrClause, covered by species-deal-scope.test.mjs). Here we
// prove the count math on top of it.
const rows = [
  // one card, three genuine marketplace listings -> 1 tile, 3 listings
  { id: 1, card_tcgplayer_id: "42382", watchlist_id: 900, marketplace: "EBAY_US", listing_id: "a1", displayable: true },
  { id: 2, card_tcgplayer_id: "42382", watchlist_id: 900, marketplace: "EBAY_US", listing_id: "a2", displayable: true },
  { id: 3, card_tcgplayer_id: "42382", watchlist_id: 900, marketplace: "EBAY_GB", listing_id: "a3", displayable: true },
  // a DIFFERENT card, watchlist-linked
  { id: 4, card_tcgplayer_id: "106999", watchlist_id: 901, marketplace: "EBAY_US", listing_id: "b1", displayable: true },
  // a feed-discovered card - watchlist_id NULL, valid canonical id
  { id: 5, card_tcgplayer_id: "197651", watchlist_id: null, marketplace: "EBAY_US", listing_id: "c1", displayable: true },
  // the SAME feed card, also present as a watchlist-linked listing -> must
  // collapse into card #5's tile, not add a new one
  { id: 6, card_tcgplayer_id: "197651", watchlist_id: 902, marketplace: "EBAY_US", listing_id: "c2", displayable: true },
  // a non-displayable listing (failed a deal gate) - must NOT be counted
  { id: 7, card_tcgplayer_id: "555000", watchlist_id: 903, marketplace: "EBAY_US", listing_id: "d1", displayable: false },
];
const isDisplayable = (r) => r.displayable !== false;

test("1. a null-watchlist feed deal with a valid canonical id contributes to the count", () => {
  const { dealCards } = speciesDealStatCounts(rows, { isDisplayable });
  // cards: 42382, 106999, 197651  -> 3
  assert.equal(dealCards, 3);
  // and it really is the feed card that made the difference
  const without5and6 = speciesDealStatCounts(
    rows.filter((r) => r.id !== 5 && r.id !== 6),
    { isDisplayable }
  );
  assert.equal(without5and6.dealCards, 2);
});

test("2. a deal qualifying via BOTH watchlist and card identity is not double-counted", () => {
  // rows 5 (feed) and 6 (watchlist) are the SAME card 197651
  const { dealCards } = speciesDealStatCounts(rows, { isDisplayable });
  assert.equal(dealCards, 3, "197651 counted once despite two rows / two linkage types");
  assert.equal(speciesDealKey(rows[4]), speciesDealKey(rows[5]));
});

test("3. a non-displayable listing is not counted (count claims LIVE eligible inventory)", () => {
  const { dealCards } = speciesDealStatCounts(rows, { isDisplayable });
  // card 555000 (row 7) is display-gated out
  assert.equal(dealCards, 3);
  const allPass = speciesDealStatCounts(rows, { isDisplayable: () => true });
  assert.equal(allPass.dealCards, 4, "without the gate the bad card would inflate the count");
});

test("4. dealCards is a CARD (tile) count, dealListings is a LISTING count - they differ", () => {
  const { dealCards, dealListings } = speciesDealStatCounts(rows, { isDisplayable });
  assert.equal(dealCards, 3); // 42382, 106999, 197651
  // displayable listings: a1,a2,a3 (card 42382) + b1 + c1 + c2 = 6
  assert.equal(dealListings, 6);
});

test("5. three genuine listings of one card are NOT collapsed into '1 listing'", () => {
  const oneCard = rows.filter((r) => r.card_tcgplayer_id === "42382");
  const { dealCards, dealListings } = speciesDealStatCounts(oneCard, { isDisplayable });
  assert.equal(dealCards, 1, "one card tile");
  assert.equal(dealListings, 3, "three distinct marketplace listings behind it");
});

test("6. two rows for the exact same eBay item DO collapse (listing dedupe)", () => {
  const dupItem = [
    { id: 10, card_tcgplayer_id: "42382", marketplace: "EBAY_US", listing_id: "same", displayable: true },
    { id: 11, card_tcgplayer_id: "42382", marketplace: "EBAY_US", listing_id: "same", displayable: true },
  ];
  const { dealCards, dealListings } = speciesDealStatCounts(dupItem, { isDisplayable });
  assert.equal(dealCards, 1);
  assert.equal(dealListings, 1);
});

test("7. empty / nullish input -> zeroes, no throw", () => {
  assert.deepEqual(speciesDealStatCounts([], {}), { dealCards: 0, dealListings: 0 });
  assert.deepEqual(speciesDealStatCounts(null, {}), { dealCards: 0, dealListings: 0 });
  assert.deepEqual(speciesDealStatCounts(undefined), { dealCards: 0, dealListings: 0 });
});

test("8. listingKey: marketplace + listing_id, falls back to row id", () => {
  assert.equal(listingKey({ marketplace: "EBAY_US", listing_id: "x" }), "EBAY_US:x");
  assert.equal(listingKey({ marketplace: "EBAY_GB", id: 9 }), "EBAY_GB:9");
  assert.equal(listingKey(null), null);
});

// Language boundary (case 3 of the brief's §9) is enforced upstream by
// speciesScopeOrClause: the catalog-id set is (species, language=english)
// and the watchlist list is english-only, so a japanese-catalogue deal is
// never in `rows` to begin with. Documented + covered structurally in
// species-deal-scope.test.mjs ("membership does NOT require watchlist_id"
// uses only english catalog ids); the live japanese-exclusion check is in
// the phase's production smoke test.
