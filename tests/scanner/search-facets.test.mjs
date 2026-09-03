// Phase 13B.4.1 - /search structured facets: URL filter state overlaid
// onto a text-parsed SearchIntent. Pure, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearchIntent } from "../../lib/searchIntent.js";
import {
  readSearchFilters,
  mergeIntentWithFilters,
  searchFiltersToQuery,
  SEARCH_FILTER_KEYS,
} from "../../lib/searchFacets.js";

const P = (q) => parseSearchIntent(q);
const merge = (q, filters) => mergeIntentWithFilters(P(q), filters);

// ===== readSearchFilters ==========================================

test("readSearchFilters pulls only present keys (empty string kept = explicit clear)", () => {
  const sp = new URLSearchParams("q=pikachu&type=graded&grade=&country=EBAY_US&bogus=1");
  const f = readSearchFilters(sp);
  assert.deepEqual(f, { type: "graded", grade: "" });
  // works on a plain object too
  assert.deepEqual(readSearchFilters({ grader: "PSA", nope: "x" }), { grader: "PSA" });
});

test("SEARCH_FILTER_KEYS is the deal-refinement set (country/sort handled separately)", () => {
  assert.deepEqual([...SEARCH_FILTER_KEYS], ["type", "grader", "grade", "minPrice", "maxPrice", "listing"]);
});

// ===== URL -> effective intent ====================================

test("bare q=pikachu -> species subject, no refinement", () => {
  const { intent, hasActiveFilters } = merge("pikachu", {});
  assert.equal(intent.subject.species, "Pikachu");
  assert.equal(intent.format, "any");
  assert.equal(intent.grader, null);
  assert.equal(hasActiveFilters, false);
  assert.equal(intent.result_mode, "catalogue");
});

test("q=pikachu + type=graded&grader=PSA&grade=10&maxPrice=200 behaves like 'PSA 10 Pikachu under $200'", () => {
  const viaFilters = merge("pikachu", { type: "graded", grader: "PSA", grade: "10", maxPrice: "200" }).intent;
  const viaText = P("psa 10 pikachu under $200");
  assert.equal(viaFilters.subject.species, "Pikachu");
  assert.equal(viaFilters.format, "graded");
  assert.equal(viaFilters.grader, "PSA");
  assert.equal(viaFilters.grade, "10");
  assert.equal(viaFilters.price_max, 200);
  // same effective grading/price intent as the typed form
  assert.equal(viaText.grader, "PSA");
  assert.equal(viaText.grade, "10");
  assert.equal(viaText.price_max, 200);
  assert.equal(viaFilters.result_mode, "deals");
});

test("the visible query text is NOT rewritten - raw stays 'pikachu'", () => {
  const { intent } = merge("pikachu", { type: "graded", grader: "PSA" });
  assert.equal(intent.raw, "pikachu");
});

// ===== precedence: URL wins per key, absent defers to text ========

test("URL grade overrides a conflicting free-text grade; untouched text grader is kept", () => {
  // text says PSA 10; URL says grade 9 -> effective PSA 9
  const { intent } = merge("psa 10 pikachu", { grade: "9" });
  assert.equal(intent.grader, "PSA", "grader came from text, not overridden");
  assert.equal(intent.grade, "9", "grade overridden by the URL");
});

test("absent URL keys defer entirely to the text parse", () => {
  const { intent } = merge("psa 10 pikachu under $50", {});
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
  assert.equal(intent.price_max, 50);
});

test("type=all in the URL explicitly clears a text 'graded'", () => {
  const withText = P("graded pikachu");
  assert.equal(withText.format, "graded");
  const { intent } = merge("graded pikachu", { type: "all" });
  assert.equal(intent.format, "any", "type=all overrides the text graded modifier");
});

test("empty-string param (?grader=) clears a text grader", () => {
  const { intent } = merge("psa pikachu", { grader: "" });
  assert.equal(intent.grader, null);
});

// ===== dependent grader/grade normalisation ======================

test("grader alone implies graded", () => {
  const { intent, activeFilters } = merge("pikachu", { grader: "PSA" });
  assert.equal(intent.format, "graded");
  assert.equal(activeFilters.type, "graded");
});

test("grade alone implies graded", () => {
  assert.equal(merge("pikachu", { grade: "10" }).intent.format, "graded");
});

test("type=raw + grader=PSA -> keep PSA, flip to graded, note the conflict", () => {
  const { intent, notes } = merge("pikachu", { type: "raw", grader: "PSA" });
  assert.equal(intent.format, "graded");
  assert.equal(intent.grader, "PSA", "grader NOT silently dropped");
  assert.ok(notes.some((n) => n.code === "raw_vs_graded"));
});

test("type=raw + grade=10 -> keep grade 10, flip to graded, note it", () => {
  const { intent, notes } = merge("pikachu", { type: "raw", grade: "10" });
  assert.equal(intent.format, "graded");
  assert.equal(intent.grade, "10");
  assert.ok(notes.some((n) => n.code === "raw_vs_graded"));
});

// ===== malformed values -> dropped with a note, never a crash ====

for (const [label, filters, check] of [
  ["grade=999", { grade: "999" }, (i) => assert.equal(i.grade, null)],
  ["grader=INVALID", { grader: "INVALID" }, (i) => assert.equal(i.grader, null)],
  ["listing=INVALID", { listing: "INVALID" }, (i) => assert.equal(i.listing_type, "any")],
  ["maxPrice=-5", { maxPrice: "-5" }, (i) => assert.equal(i.price_max, null)],
  ["maxPrice=0", { maxPrice: "0" }, (i) => assert.equal(i.price_max, null)],
  ["type=bogus", { type: "bogus" }, (i) => assert.equal(i.format, "any")],
]) {
  test(`malformed ${label} -> dropped with a note, intent still coherent`, () => {
    const { intent, notes } = merge("pikachu", filters);
    assert.equal(intent.subject.species, "Pikachu", "subject survives a bad filter");
    check(intent);
    assert.ok(notes.length > 0, "a note explains what was ignored");
  });
}

test("inverted price range: minPrice > maxPrice -> minimum dropped with a note", () => {
  const { intent, notes } = merge("pikachu", { minPrice: "500", maxPrice: "100" });
  assert.equal(intent.price_max, 100);
  assert.equal(intent.price_min, null);
  assert.ok(notes.some((n) => n.code === "price_range_inverted"));
});

// ===== exact-card + filters: identity preserved ==================

test("charizard 4/102 + graded PSA 10 -> subject stays the exact card; grading refines", () => {
  const { intent } = merge("charizard 4/102", { type: "graded", grader: "PSA", grade: "10" });
  assert.equal(intent.subject.species, "Charizard");
  assert.equal(intent.subject.collector_number, "4/102");
  assert.equal(intent.subject.kind, "card");
  assert.equal(intent.is_exact, true);
  assert.equal(intent.format, "graded");
  assert.equal(intent.grader, "PSA");
  assert.equal(intent.grade, "10");
});

test("filter params never become card-name / collector-number tokens", () => {
  // the merge does NOT touch subject.card_name or subject.collector_number
  const base = P("pikachu");
  const { intent } = merge("pikachu", { type: "graded", grader: "PSA", grade: "10", maxPrice: "200", listing: "BIN" });
  assert.equal(intent.subject.card_name, base.subject.card_name);
  assert.equal(intent.subject.collector_number, base.subject.collector_number);
  assert.equal(intent.subject.species, "Pikachu");
});

// ===== listing ===================================================

test("listing=BIN / listing=AUCTION map to listing_type", () => {
  assert.equal(merge("pikachu", { listing: "BIN" }).intent.listing_type, "BIN");
  assert.equal(merge("pikachu", { listing: "AUCTION" }).intent.listing_type, "AUCTION");
  assert.equal(merge("pikachu", { listing: "all" }).intent.listing_type, "any");
});

// ===== searchFiltersToQuery (the /pokemon link + chip URLs) ======

test("searchFiltersToQuery emits only non-default params", () => {
  const { activeFilters } = merge("pikachu", { type: "graded", grader: "PSA", grade: "10", maxPrice: "200", listing: "BIN" });
  assert.deepEqual(searchFiltersToQuery(activeFilters), {
    type: "graded",
    grader: "PSA",
    grade: "10",
    maxPrice: "200",
    listing: "BIN",
  });
  assert.deepEqual(searchFiltersToQuery({ type: "all", grader: null, grade: null, listing: "all", minPrice: null, maxPrice: null }), {});
});

test("searchFiltersToQuery is a stable serialisation for the /pokemon/[slug] link", () => {
  const { activeFilters } = merge("pikachu", { type: "graded", grader: "PSA", grade: "10", listing: "BIN" });
  const qs = new URLSearchParams(searchFiltersToQuery(activeFilters)).toString();
  assert.equal(qs, "type=graded&grader=PSA&grade=10&listing=BIN");
});

// ===== 13B.2 identity regression through the merge ================

test("pikachu 10/102 + filters still parses collector 10/102 (not a grade)", () => {
  const { intent } = merge("pikachu 10/102", { type: "graded", grader: "PSA" });
  assert.equal(intent.subject.collector_number, "10/102");
  assert.equal(intent.subject.species, "Pikachu");
  // grade came from neither text nor URL
  assert.equal(intent.grade, null);
});

test("base set charizard 4/102 + filters keeps set + number", () => {
  const { intent } = merge("base set charizard 4/102", { maxPrice: "300" });
  assert.equal(intent.subject.set, "Base Set");
  assert.equal(intent.subject.collector_number, "4/102");
  assert.equal(intent.price_max, 300);
});
