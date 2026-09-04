// Phase 13B.4.3 - /sets/[slug] structured deal filtering. Pure, no DB.
//
//   * the set deal grid is on the SAME shared contract as /search,
//     /pokemon/[slug] and /cards/[slug] (dealFilters + searchFacets).
//   * set membership is canonical CARD IDENTITY (card_tcgplayer_id in the
//     set's card_catalog ids) unioned with the legacy watchlist ids -
//     never listing-title set matching - and includes feed-discovered
//     deals (watchlist_id NULL).
//   * the dedupe unit on the set grid is ONE CANONICAL CARD per tile
//     (speciesDealKey), matching the existing set grid (fetchDealsPage
//     deduped per-page by watchlist_id + a per-card "N listings" badge).
//   * set identity never changes because of a filter param.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speciesScopeOrClause, speciesDealKey } from "../../lib/speciesDealScope.js";
import {
  normalizeDealFilters,
  planDealFilters,
  appliedFilterChips,
  relaxationSteps,
} from "../../lib/dealFilters.js";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import { mergeIntentWithFilters, searchFiltersToQuery } from "../../lib/searchFacets.js";
import { slugifySet } from "../../lib/slugify.js";

// ===== set scope = canonical card identity OR legacy watchlist =====

test("set scope from catalog ids alone (no watchlist ids) still produces a query", () => {
  const or = speciesScopeOrClause({ catalogTcgIds: ["42382", "106999", "44429"], watchlistIds: [] });
  assert.equal(or, "card_tcgplayer_id.in.(42382,106999,44429)");
  assert.ok(!/watchlist_id/.test(or), "no watchlist term -> membership does not require watchlist_id");
});

test("set scope: catalog ids UNION legacy watchlist ids", () => {
  assert.equal(
    speciesScopeOrClause({ catalogTcgIds: ["42382"], watchlistIds: [900, 901] }),
    "card_tcgplayer_id.in.(42382),watchlist_id.in.(900,901)"
  );
});

test("set scope: neither -> null (empty result, never 'match all')", () => {
  assert.equal(speciesScopeOrClause({ catalogTcgIds: [], watchlistIds: [] }), null);
});

// ===== dedupe unit = one canonical CARD per tile ==================

test("two listings of the same Base Set card collapse to one tile", () => {
  const a = { card_tcgplayer_id: "42382", watchlist_id: 900, marketplace: "EBAY_US", listing_id: "x1" };
  const b = { card_tcgplayer_id: "42382", watchlist_id: 900, marketplace: "EBAY_US", listing_id: "x2" };
  assert.equal(speciesDealKey(a), speciesDealKey(b), "one card = one set-grid tile");
});

test("a feed-discovered Base Set deal (watchlist_id NULL) keys on the card id", () => {
  assert.equal(speciesDealKey({ card_tcgplayer_id: "44429", watchlist_id: null, id: 31495 }), "c:44429");
});

test("two different Base Set cards are two tiles", () => {
  assert.notEqual(
    speciesDealKey({ card_tcgplayer_id: "42382" }),
    speciesDealKey({ card_tcgplayer_id: "106999" })
  );
});

// ===== the shared filter contract on the set page ================

const M = (qs) => planDealFilters(Object.fromEntries(new URLSearchParams(qs)));

test("matrix: bare set -> no filters", () => {
  assert.deepEqual(M("").eq, {});
  assert.deepEqual(M("").lte, {});
});

test("matrix: type=graded&grader=PSA&grade=10&maxPrice=1000", () => {
  const p = M("type=graded&grader=PSA&grade=10&maxPrice=1000");
  assert.deepEqual(p.eq, { is_graded: true, grader: "PSA", grade: "10" });
  assert.equal(p.lte.total_price_usd, 1000, "canonical USD");
  assert.equal(p.lte.total_price, undefined);
});

test("matrix: listing=BIN -> FIXED_PRICE; AUCTION passthrough", () => {
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

// ===== chips + relaxation (shared) ================================

test("chips: Graded chip clears type+grader+grade; price is one chip", () => {
  const chips = appliedFilterChips({ type: "graded", grader: "PSA", grade: "10", maxPrice: "200", listing: "BIN" });
  assert.deepEqual(chips.map((c) => c.label), ["Graded", "PSA", "Grade 10", "Under $200", "Buy It Now"]);
  assert.deepEqual(chips[0].clears.sort(), ["grade", "grader", "type"]);
});

test("relaxation for PSA 10 under $100 offers price -> grade -> grader -> clear-all", () => {
  const steps = relaxationSteps({ type: "graded", grader: "PSA", grade: "10", maxPrice: "100" });
  assert.equal(steps[0].label, "Remove the price limit");
  assert.equal(steps[1].label, "Any PSA grade");
  assert.equal(steps[2].label, "All graded (any grader)");
  assert.equal(steps[steps.length - 1].label, "Clear all filters");
});

// ===== search -> set continuity ==================================

test("'base set' parses a SET subject, no card-name / collector-number", () => {
  const i = parseSearchIntent("base set");
  assert.equal(i.subject.set, "Base Set");
  assert.equal(i.subject.card_name, null);
  assert.equal(i.subject.collector_number, null);
  assert.equal(i.subject.species, null);
});

test("'base set' + URL facets -> subject.set preserved; filters serialise for the /sets link", () => {
  const { intent, activeFilters } = mergeIntentWithFilters(parseSearchIntent("base set"), {
    type: "graded",
    grader: "PSA",
    grade: "10",
  });
  assert.equal(intent.subject.set, "Base Set");
  assert.equal(intent.format, "graded");
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
  const qs = new URLSearchParams(searchFiltersToQuery(activeFilters)).toString();
  assert.equal(qs, "type=graded&grader=PSA&grade=10");
  // and the slug the route emits
  assert.equal(slugifySet("Base Set"), "base-set");
  // never the raw query text
  assert.ok(!/base\s*set/i.test(qs));
});

// ===== set-resolution regression (13B.4.3 §13) ===================

test("'base set charizard' -> set + species, filter params never become subject tokens", () => {
  const { intent } = mergeIntentWithFilters(parseSearchIntent("base set charizard"), {
    type: "graded",
    grader: "PSA",
    grade: "10",
    maxPrice: "1000",
    listing: "BIN",
  });
  assert.equal(intent.subject.set, "Base Set");
  assert.equal(intent.subject.species, "Charizard");
  assert.equal(intent.subject.collector_number, null);
  assert.ok(!/graded|psa|1000|bin/i.test(String(intent.subject.card_name ?? "")));
});

test("'base set charizard 4/102' stays an exact-card subject even with set + filters", () => {
  const { intent } = mergeIntentWithFilters(parseSearchIntent("base set charizard 4/102"), {
    type: "graded",
    grader: "PSA",
  });
  assert.equal(intent.subject.set, "Base Set");
  assert.equal(intent.subject.species, "Charizard");
  assert.equal(intent.subject.collector_number, "4/102");
  assert.equal(intent.is_exact, true);
});

test("'charizard 4/102' unaffected by a set-less query + filters", () => {
  const { intent } = mergeIntentWithFilters(parseSearchIntent("charizard 4/102"), { type: "graded" });
  assert.equal(intent.subject.set, null);
  assert.equal(intent.subject.collector_number, "4/102");
  assert.equal(intent.is_exact, true);
});

test("'pikachu 10/102' stays a collector number (not a grade) through the merge", () => {
  const { intent } = mergeIntentWithFilters(parseSearchIntent("pikachu 10/102"), { type: "graded", grader: "PSA" });
  assert.equal(intent.subject.collector_number, "10/102");
  assert.equal(intent.grade, null);
});
