// Phase 13B.3.1 - species deal membership is CARD-IDENTITY based, not
// ingestion-source based. Pure, no DB.
//
// Root cause: computeAggregates() (which produces
// speciesHubs[].watchlistIds, the only thing the old species deal query
// scoped by) is built from an `!inner` watchlist join and drops every
// deal row with no joined watchlist - so a feed-discovered deal
// (watchlist_id NULL) whose card_tcgplayer_id canonically belongs to the
// species was invisible on its /pokemon/<slug> page. speciesScopeOrClause
// restores it via card identity, without needing a watchlist_id at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speciesScopeOrClause, speciesDealKey } from "../../lib/speciesDealScope.js";

// ===== speciesScopeOrClause ======================================

test("membership does NOT require watchlist_id: catalog ids alone produce a scope", () => {
  const or = speciesScopeOrClause({ catalogTcgIds: ["186015", "594174"], watchlistIds: [] });
  assert.equal(or, "card_tcgplayer_id.in.(186015,594174)");
  assert.ok(!/watchlist_id/.test(or), "no watchlist_id term when there are no watchlist ids");
});

test("watchlist ids alone still produce the legacy scope (no regression)", () => {
  assert.equal(
    speciesScopeOrClause({ catalogTcgIds: [], watchlistIds: [11, 22] }),
    "watchlist_id.in.(11,22)"
  );
});

test("both paths -> a single OR of two IN terms (identity UNION legacy)", () => {
  assert.equal(
    speciesScopeOrClause({ catalogTcgIds: ["186015"], watchlistIds: [45945] }),
    "card_tcgplayer_id.in.(186015),watchlist_id.in.(45945)"
  );
});

test("empty on both sides -> null (caller short-circuits to no results, never 'match all')", () => {
  assert.equal(speciesScopeOrClause({ catalogTcgIds: [], watchlistIds: [] }), null);
  assert.equal(speciesScopeOrClause({}), null);
  assert.equal(speciesScopeOrClause(), null);
});

test("catalog ids are de-duped, stringified and blank-filtered", () => {
  const or = speciesScopeOrClause({
    catalogTcgIds: [186015, "186015", " 594174 ", "", null, undefined],
    watchlistIds: [1, 1, null],
  });
  assert.equal(or, "card_tcgplayer_id.in.(186015,594174),watchlist_id.in.(1)");
});

// ===== speciesDealKey (null-safe dedupe) ==========================

test("deal keys on the canonical card id (card_tcgplayer_id) first", () => {
  assert.equal(speciesDealKey({ watchlist_id: 45945, card_tcgplayer_id: "186015", id: 1 }), "c:186015");
});

test("feed-discovered deal (watchlist_id NULL) keys on the canonical card id, not null", () => {
  assert.equal(speciesDealKey({ watchlist_id: null, card_tcgplayer_id: "197651", id: 31449 }), "c:197651");
});

test("two different feed cards do NOT collapse to one (the bug this fixes)", () => {
  const a = speciesDealKey({ watchlist_id: null, card_tcgplayer_id: "197651", id: 31449 });
  const b = speciesDealKey({ watchlist_id: null, card_tcgplayer_id: "126027", id: 32119 });
  assert.notEqual(a, b);
  // the old `seen.has(deal.watchlist_id)` would have hashed BOTH to `null`
  // and dropped the second real card.
});

test("same card via a feed listing AND a watchlist listing collapses to one tile", () => {
  // real case: "Haunter (21)" tcg 44429 - one row watchlist_id NULL
  // (feed), one row watchlist_id 15393. Same canonical card -> one tile.
  const rows = [
    { watchlist_id: null, card_tcgplayer_id: "44429", id: 31495 },
    { watchlist_id: 15393, card_tcgplayer_id: "44429", id: 40001 },
  ];
  const seen = new Set();
  const kept = rows.filter((r) => {
    const k = speciesDealKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  assert.equal(kept.length, 1);
});

test("a deal with NO identity at all falls back to the row id", () => {
  assert.equal(speciesDealKey({ watchlist_id: null, card_tcgplayer_id: null, id: 7 }), "d:7");
  assert.equal(speciesDealKey({ watchlist_id: null, card_tcgplayer_id: "  ", id: 7 }), "d:7");
});

test("a deal with only a watchlist_id keys on it", () => {
  assert.equal(speciesDealKey({ watchlist_id: 500, card_tcgplayer_id: null, id: 1 }), "w:500");
});

test("a deal qualifying via BOTH paths is one key -> appears once", () => {
  const rows = [
    { watchlist_id: 500, card_tcgplayer_id: "186015", id: 1 },
    { watchlist_id: 500, card_tcgplayer_id: "186015", id: 2 }, // 2nd listing of same card
  ];
  const seen = new Set();
  const kept = rows.filter((r) => {
    const k = speciesDealKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  assert.equal(kept.length, 1);
});

test("speciesDealKey is null-safe on a nullish input", () => {
  assert.equal(speciesDealKey(null), null);
  assert.equal(speciesDealKey(undefined), null);
});

// ===== the end-to-end guarantee ==================================

test("a species with feed-only deals is still scopable (no watchlist ids at all)", () => {
  // computeAggregates would give this species an empty watchlistIds, so
  // the pre-13B.3.1 `.in('watchlist_id', [])` scoped to nothing. Card
  // identity still produces a real query.
  const or = speciesScopeOrClause({
    catalogTcgIds: ["126027", "197651", "44429"],
    watchlistIds: [],
  });
  assert.ok(or && or.startsWith("card_tcgplayer_id.in.("));
  assert.ok(!or.includes("watchlist_id"));
});
