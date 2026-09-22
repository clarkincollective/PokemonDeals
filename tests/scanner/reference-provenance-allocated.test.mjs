// The allocated tier stored its comparisons WITHOUT evidence.
//
// 17C.10 made referenceFor() evidence a stored comparison only when it can
// find the reference that produced `market_price`. It reads that reference
// off `marketData.byConditionReference` / `.fallbackReference`. The scanner
// has TWO marketData builders: the sweep path carried those fields, and
// loadCardMarketData (the allocated tier, and the cross-match pilot that
// reuses it) did not - so selectConditionReference() was handed `undefined`
// and every RAW row from that path was written with the CLEARED reference
// set, unable to make a savings claim.
//
// Measured in production 2026-09-16, rows first seen inside allocated
// invocations: graded 7/7 evidenced (that branch builds its own reference
// and never touches marketData), raw 14/282. Rows first seen inside sweep
// invocations: raw 31/31. The four cross-match pilot inserts: 0/4.
//
// RP-11 in reference-provenance-17c10.test.mjs asserts the CONSUMER exists
// in this route; nothing asserted that every PRODUCER feeding it carries
// what the consumer reads. These tests close exactly that gap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const ROUTE = read("app/api/refresh-deals/route.js");

const { selectConditionReference } = require("../../lib/dealMatching.js");
const { conditionPricesFromVariants, conditionReferencesFromVariants } = require("../../lib/pokemonPriceTracker.js");
const { buildCardReference, clearedReference, CARD_REFERENCE_COLUMNS } = require("../../lib/referenceProvenance.js");
const { storedReferenceEvidence, savingsClaimTrusted } = require("../../lib/dealQuality.js");

// A realistic provider payload: Near Mint priced, provider-dated.
const PRICES = {
  primaryPrinting: "Holofoil",
  market: 182.57,
  lastUpdated: "2026-09-15T18:00:00.000Z",
  variants: {
    Holofoil: {
      "Near Mint Holofoil": { price: 182.57 },
      "Lightly Played Holofoil": { price: 150.0 },
    },
  },
};
const raw = {
  byCondition: conditionPricesFromVariants(PRICES),
  byConditionReference: conditionReferencesFromVariants(PRICES),
  fallbackPrice: 182.57,
  fallbackReference: { price: 182.57, condition: "Near Mint", printing: "Holofoil" },
  lastUpdated: PRICES.lastUpdated,
};

// The real referenceFor arrow, lifted from the route and evaluated with the
// same dependencies the route gives it. No route import, no I/O.
const REFERENCE_FOR_SRC = ROUTE.match(/const referenceFor = \(core\) => \{[\s\S]*?\n  \};/)[0].replace(/^const referenceFor = /, "");
// 2026-09-22 (deal 42127): referenceFor now reads `listingMarket` - the
// card-level marketData narrowed to the ONE printing the listing
// evidences - instead of the card-wide `marketData`. The provenance
// contract this suite protects is unchanged; only the name of the object
// it reads changed, so the same fixture is bound to the new name.
function referenceFor(core, marketData, row = { justtcg_tcgplayer_id: "113764" }) {
  const fn = runInNewContext("(" + REFERENCE_FOR_SRC.replace(/;$/, "") + ")", {
    row, marketData, listingMarket: marketData,
    selectConditionReference, buildCardReference, clearedReference, CARD_REFERENCE_COLUMNS,
  });
  return fn(core);
}

// the shape loadCardMarketData produced BEFORE the fix
const legacyMarketData = { byCondition: raw.byCondition, fallbackPrice: raw.fallbackPrice, priceChange24hr: null };
// the shape both builders produce now
const fixedMarketData = {
  byCondition: raw.byCondition,
  fallbackPrice: raw.fallbackPrice,
  priceChange24hr: null,
  byConditionReference: raw.byConditionReference,
  fallbackReference: raw.fallbackReference,
  observedAt: raw.lastUpdated ?? null,
};

const rawRow = (over = {}) => ({
  listing_id: "v1|128048980756|0",
  card_tcgplayer_id: "113764", // storedReferenceEvidence matches the reference against this
  market_price: 182.57,
  condition: "Near Mint",
  is_graded: false,
  grader: null,
  grade: null,
  ...over,
});

test("1. the allocated builder's old shape produced NO evidence for a raw row", () => {
  // this is the defect, pinned: same provider data, same figure, no evidence
  const ref = referenceFor(rawRow(), legacyMarketData);
  for (const c of CARD_REFERENCE_COLUMNS) assert.equal(ref[c], null, `${c} was cleared`);
  assert.equal(storedReferenceEvidence({ ...rawRow(), ...ref }), null);
  assert.equal(savingsClaimTrusted({ ...rawRow(), ...ref, card_set: "Generations: Radiant Collection" }), false);
});

test("2. with the provenance fields carried, the SAME row is evidenced", () => {
  const ref = referenceFor(rawRow(), fixedMarketData);
  assert.equal(ref.reference_source, "ppt_live");
  assert.equal(Number(ref.reference_amount), 182.57, "the amount reproduces market_price");
  assert.equal(ref.reference_currency, "USD");
  assert.equal(ref.reference_product_id, "113764");
  assert.equal(ref.reference_condition, "Near Mint");
  assert.equal(ref.reference_observed_at, "2026-09-15T18:00:00.000Z", "the PROVIDER's as-of, not our sync time");
  assert.notEqual(ref.reference_synced_at, ref.reference_observed_at);
  assert.ok(storedReferenceEvidence({ ...rawRow(), ...ref }));
});

test("3. the evidence guard is NOT weakened: a figure the reference cannot reproduce still clears", () => {
  // market_price that no returned reference produces -> cleared, fix or not
  const ref = referenceFor(rawRow({ market_price: 999.99 }), fixedMarketData);
  for (const c of CARD_REFERENCE_COLUMNS) assert.equal(ref[c], null);
  // and a couple of cents of drift is still too much
  const drift = referenceFor(rawRow({ market_price: 182.6 }), fixedMarketData);
  for (const c of CARD_REFERENCE_COLUMNS) assert.equal(drift[c], null);
  // only the figure the reference actually produced is evidenced
  assert.equal(referenceFor(rawRow({ market_price: 182.57 }), fixedMarketData).reference_source, "ppt_live");
});

test("4. graded rows were never affected - that branch builds its own reference", () => {
  const graded = rawRow({ is_graded: true, grader: "PSA", grade: "9", condition: "Graded" });
  for (const md of [legacyMarketData, fixedMarketData]) {
    const ref = referenceFor(graded, md);
    assert.equal(ref.reference_source, "ppt_live");
    assert.equal(ref.reference_grader, "PSA");
    assert.equal(ref.reference_grade, "9");
    assert.equal(ref.reference_observed_at, null, "graded buckets carry no provider as-of");
  }
});

test("5. a card with no product id, or no market_price, still clears", () => {
  const noProduct = referenceFor(rawRow(), fixedMarketData, { justtcg_tcgplayer_id: null });
  for (const c of CARD_REFERENCE_COLUMNS) assert.equal(noProduct[c], null);
  const noPrice = referenceFor(rawRow({ market_price: null }), fixedMarketData);
  for (const c of CARD_REFERENCE_COLUMNS) assert.equal(noPrice[c], null);
});

test("6. BOTH marketData builders carry every field referenceFor reads", () => {
  // the regression that let this through: the consumer was asserted, the
  // producers were not. Each builder is checked independently.
  const builders = [...ROUTE.matchAll(/marketData = \{[\s\S]*?\n(?: {4,})?\};/g)].map((m) => m[0]);
  assert.ok(builders.length >= 2, `expected both marketData builders, found ${builders.length}`);
  for (const [i, b] of builders.entries()) {
    for (const field of ["byCondition", "fallbackPrice", "byConditionReference", "fallbackReference", "observedAt"]) {
      assert.match(b, new RegExp(`\\b${field}\\b`), `marketData builder #${i + 1} must carry ${field}`);
    }
    assert.match(b, /observedAt: raw\.lastUpdated/, `builder #${i + 1} must use the PROVIDER's as-of`);
  }
});

test("7. the pilot prices through the same builder, so it inherits the fix", () => {
  // the cross-match pilot calls loadCardMarketData directly; if it ever
  // grows its own price load, this test says so.
  assert.match(ROUTE, /const marketData = await loadCardMarketData\(pilotRow, pilotErrors\);/);
  assert.match(ROUTE, /const marketData = await loadCardMarketData\(row, errors\);/);
  assert.equal((ROUTE.match(/async function loadCardMarketData\(/g) ?? []).length, 1, "one builder, not a copy per caller");
});
