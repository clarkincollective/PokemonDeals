// Phase 13B.4.2 - /cards/[slug] structured deal filtering. Pure, no DB.
//
//   * the deal query for a card page is scoped to the CANONICAL CARD
//     IDENTITY (card_tcgplayer_id) unioned with the legacy watchlist id -
//     never title matching - and pulls in feed-discovered listings.
//   * the filter contract is the SHARED one (dealFilters + searchFacets):
//     grader/grade -> graded dependency, canonical-USD price, BIN<->
//     FIXED_PRICE, malformed values dropped with a note.
//   * the dedupe unit is ONE MARKETPLACE LISTING (marketplace + listing_id),
//     NOT one card - a card page compares multiple listings of the same
//     card, so listingKey (not speciesDealKey) is correct here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardScopeOrClause, listingKey, speciesDealKey } from "../../lib/speciesDealScope.js";
import {
  normalizeDealFilters,
  planDealFilters,
  appliedFilterChips,
  relaxationSteps,
} from "../../lib/dealFilters.js";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import { mergeIntentWithFilters, searchFiltersToQuery } from "../../lib/searchFacets.js";

// ===== cardScopeOrClause =========================================

test("card scope = canonical card id OR legacy watchlist id", () => {
  assert.equal(
    cardScopeOrClause({ tcgplayerId: "42382", watchlistId: 900 }),
    "card_tcgplayer_id.eq.42382,watchlist_id.eq.900"
  );
});

test("card id alone still scopes (feed-discovered exact-card deals, watchlist_id NULL)", () => {
  const or = cardScopeOrClause({ tcgplayerId: "42382", watchlistId: null });
  assert.equal(or, "card_tcgplayer_id.eq.42382");
  assert.ok(!/watchlist_id/.test(or));
});

test("watchlist id alone still scopes (no regression for a card with no catalog id)", () => {
  assert.equal(cardScopeOrClause({ watchlistId: 900 }), "watchlist_id.eq.900");
});

test("neither id -> null (caller returns no listings, never 'match everything')", () => {
  assert.equal(cardScopeOrClause({}), null);
  assert.equal(cardScopeOrClause({ tcgplayerId: "  " }), null);
  assert.equal(cardScopeOrClause(), null);
});

test("card id is stringified + trimmed", () => {
  assert.equal(cardScopeOrClause({ tcgplayerId: 42382 }), "card_tcgplayer_id.eq.42382");
  assert.equal(cardScopeOrClause({ tcgplayerId: " 42382 " }), "card_tcgplayer_id.eq.42382");
});

// ===== dedupe unit = one marketplace listing ======================

test("card-page dedupe key is the marketplace LISTING, not the card", () => {
  // two genuine, different listings of the SAME card must stay two rows
  const a = { marketplace: "EBAY_US", listing_id: "111", card_tcgplayer_id: "42382" };
  const b = { marketplace: "EBAY_US", listing_id: "222", card_tcgplayer_id: "42382" };
  assert.notEqual(listingKey(a), listingKey(b), "different listings of one card are NOT one opportunity");
  // whereas speciesDealKey WOULD collapse them (wrong for a card page)
  assert.equal(speciesDealKey(a), speciesDealKey(b));
});

test("duplicate DB rows for the same eBay item DO collapse", () => {
  const a = { marketplace: "EBAY_US", listing_id: "111", id: 1 };
  const b = { marketplace: "EBAY_US", listing_id: "111", id: 2 };
  assert.equal(listingKey(a), listingKey(b));
});

test("listingKey falls back to row id when there is no listing_id", () => {
  assert.equal(listingKey({ marketplace: "EBAY_GB", id: 9 }), "EBAY_GB:9");
});

// ===== the shared filter contract on the card page ================

const M = (qs) => planDealFilters(Object.fromEntries(new URLSearchParams(qs)));

test("matrix: bare card -> no deal filters", () => {
  const p = M("");
  assert.deepEqual(p.eq, {});
  assert.deepEqual(p.lte, {});
});

test("matrix: type=graded&grader=PSA&grade=10&maxPrice=1000", () => {
  const p = M("type=graded&grader=PSA&grade=10&maxPrice=1000");
  assert.deepEqual(p.eq, { is_graded: true, grader: "PSA", grade: "10" });
  assert.equal(p.lte.total_price_usd, 1000, "canonical USD, not native total_price");
  assert.equal(p.lte.total_price, undefined);
});

test("matrix: listing=BIN maps to FIXED_PRICE; AUCTION passes through", () => {
  assert.equal(M("listing=BIN").eq.listing_type, "FIXED_PRICE");
  assert.equal(M("listing=AUCTION").eq.listing_type, "AUCTION");
});

test("contradiction: type=raw&grader=PSA -> keep PSA, flip graded, note", () => {
  const n = normalizeDealFilters({ type: "raw", grader: "PSA" });
  assert.equal(n.type, "graded");
  assert.equal(n.grader, "PSA");
  assert.ok(n.notes.some((x) => x.code === "raw_vs_graded"));
});

test("contradiction: type=raw&grade=10 -> keep grade, flip graded, note", () => {
  const n = normalizeDealFilters({ type: "raw", grade: "10" });
  assert.equal(n.type, "graded");
  assert.equal(n.grade, "10");
  assert.ok(n.notes.some((x) => x.code === "raw_vs_graded"));
});

for (const [label, raw, check] of [
  ["grade=999", { grade: "999" }, (n) => assert.equal(n.grade, null)],
  ["grader=INVALID", { grader: "INVALID" }, (n) => assert.equal(n.grader, null)],
  ["maxPrice=-5", { maxPrice: "-5" }, (n) => assert.equal(n.maxPrice, null)],
  ["listing=INVALID", { listing: "INVALID" }, (n) => assert.equal(n.listing, "all")],
]) {
  test(`malformed ${label} -> dropped with a note, no crash`, () => {
    const n = normalizeDealFilters(raw);
    check(n);
    assert.ok(n.notes.length > 0);
  });
}

// ===== zero-result relaxation (card wording) =====================

test("relaxation for PSA 10 under $500 offers price -> grade -> grader -> clear, in order", () => {
  const steps = relaxationSteps({ type: "graded", grader: "PSA", grade: "10", maxPrice: "500" });
  assert.equal(steps[0].label, "Remove the price limit");
  assert.equal(steps[1].label, "Any PSA grade");
  assert.equal(steps[2].label, "All graded (any grader)");
  assert.equal(steps[steps.length - 1].label, "Clear all filters");
  assert.deepEqual(steps[0].drop.sort(), ["maxPrice", "minPrice"]);
});

// ===== search -> exact card link serialisation ==================

test("search 'charizard 4/102' + filters -> exact card, filters serialise for the /cards link", () => {
  const intent = parseSearchIntent("charizard 4/102");
  const { intent: eff, activeFilters } = mergeIntentWithFilters(intent, {
    type: "graded",
    grader: "PSA",
    grade: "10",
    maxPrice: "1000",
    listing: "BIN",
  });
  // identity untouched
  assert.equal(eff.subject.species, "Charizard");
  assert.equal(eff.subject.collector_number, "4/102");
  assert.equal(eff.subject.kind, "card");
  assert.equal(eff.is_exact, true);
  // the link the search result would carry to /cards/<slug> (stable key order)
  const q = new URLSearchParams(searchFiltersToQuery(activeFilters)).toString();
  assert.equal(q, "type=graded&grader=PSA&grade=10&listing=BIN&maxPrice=1000");
  // and it never contains the raw query text
  assert.ok(!/charizard/i.test(q) && !/4\/102/.test(q));
});

test("no active filters -> empty query object -> bare /cards link", () => {
  const { activeFilters } = mergeIntentWithFilters(parseSearchIntent("charizard 4/102"), {});
  assert.deepEqual(searchFiltersToQuery(activeFilters), {});
});

// ===== chips (card wording is the shared appliedFilterChips) =====

test("chips: Graded chip clears type+grader+grade; price is one chip", () => {
  const chips = appliedFilterChips({ type: "graded", grader: "PSA", grade: "10", maxPrice: "1000", listing: "BIN" });
  assert.deepEqual(chips.map((c) => c.label), ["Graded", "PSA", "Grade 10", "Under $1000", "Buy It Now"]);
  assert.deepEqual(chips[0].clears.sort(), ["grade", "grader", "type"]);
});
