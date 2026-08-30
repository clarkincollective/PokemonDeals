// Phase 4 P1 - catalog-backed /pokemon/[slug] hub rules (lib/speciesHub.js).
// The route's `indexable` check, the species sitemap threshold and the
// card-link precedence all go through these, so they get a contract test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SPECIES_CATALOG_MIN_CARDS, speciesIndexable, cardPermanentHref } from "../../lib/speciesHub.js";

test("SPECIES_CATALOG_MIN_CARDS is the audit-proposed 8", () => {
  assert.equal(SPECIES_CATALOG_MIN_CARDS, 8);
});

test("speciesIndexable: at / above / below the threshold on eligibleCount", () => {
  assert.equal(speciesIndexable({ eligibleCount: 8, cardCount: 40 }), true);
  assert.equal(speciesIndexable({ eligibleCount: 20, cardCount: 45 }), true);
  assert.equal(speciesIndexable({ eligibleCount: 7, cardCount: 40 }), false);
  assert.equal(speciesIndexable({ eligibleCount: 0, cardCount: 3 }), false);
});

test("speciesIndexable: no stats / missing count -> not indexable", () => {
  assert.equal(speciesIndexable(null), false);
  assert.equal(speciesIndexable(undefined), false);
  assert.equal(speciesIndexable({ cardCount: 30 }), false); // eligibleCount undefined
});

test("speciesIndexable: honours an explicit min", () => {
  assert.equal(speciesIndexable({ eligibleCount: 5 }, 5), true);
  assert.equal(speciesIndexable({ eligibleCount: 5 }, 6), false);
});

test("cardPermanentHref: deal hub wins, then catalog page, then nothing", () => {
  assert.equal(cardPermanentHref({ hubSlug: "houndoom-ex-xy-breakthrough", catalogSlug: "x" }), "/cards/houndoom-ex-xy-breakthrough");
  assert.equal(cardPermanentHref({ hubSlug: null, catalogSlug: "houndoom-ex-full-art-xy-breakthrough" }), "/cards/houndoom-ex-full-art-xy-breakthrough");
  assert.equal(cardPermanentHref({ hubSlug: null, catalogSlug: null }), null); // no permanent page -> no link
  assert.equal(cardPermanentHref(null), null);
});
