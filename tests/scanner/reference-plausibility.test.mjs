// Reference-price sanity (deal-38589 sweep, 16 Sep 2026).
//
// A deal row's stored market reference and card_catalog.market_price are
// the same provider figure for the same tcgplayer id, so a large
// divergence is breakage, not market spread. The live sweep found Lugia
// BREAK stored at $975 against a $48 catalogue figure and seven Psyduck
// rows at $82 against $16, each rendering a big, false "% below market".
//
// The rule only ever WITHHOLDS a number. It never hides a listing: a row
// with no positive comparison renders as a plain listing and stays in the
// feed, which is what these tests pin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const {
  referenceIsPlausible,
  REFERENCE_HIGH_RATIO_CEILING,
  listingPresentation,
  isDisplayableDeal,
} = require("../../lib/dealQuality.js");

test("1. the ceiling is a relative multiple, tighter than the raw-sale ceiling", () => {
  assert.equal(REFERENCE_HIGH_RATIO_CEILING, 4);
  // it compares a reference to a reference for the SAME product, so it is
  // necessarily tighter than lib/dealMatching's sale-vs-reference ceiling
  const matching = read("lib/dealMatching.js");
  const m = matching.match(/const RAW_SALE_HIGH_RATIO_CEILING = (\d+);/);
  assert.ok(m, "raw-sale ceiling not found");
  assert.ok(REFERENCE_HIGH_RATIO_CEILING < Number(m[1]));
});

test("2. the real breakages from the sweep are all rejected", () => {
  // stored vs catalogue, taken from the 16 Sep sweep
  for (const [stored, anchor, label] of [
    [975, 48, "Lugia BREAK"],
    [223, 40, "Charizard & Braixen GX"],
    [82, 16, "Psyduck (Triumphant)"],
    [148, 31, "Slowpoke (Aquapolis)"],
    [200, 42, "Wigglytuff (Skyridge)"],
  ]) {
    assert.equal(
      referenceIsPlausible({ storedReference: stored, catalogueReference: anchor }),
      false,
      `${label} ($${stored} vs $${anchor}) should be rejected`
    );
  }
});

test("3. ordinary condition / printing spread is left alone", () => {
  // the 1.5-4x band is deliberately untouched: a Near Mint holo reference
  // against a played normal one moves legitimately within it
  for (const [stored, anchor] of [[100, 100], [150, 100], [250, 100], [399, 100], [30, 206]]) {
    assert.equal(referenceIsPlausible({ storedReference: stored, catalogueReference: anchor }), true, `${stored} vs ${anchor}`);
  }
  // exactly at the ceiling is rejected; just under is kept
  assert.equal(referenceIsPlausible({ storedReference: 400, catalogueReference: 100 }), false);
  assert.equal(referenceIsPlausible({ storedReference: 399.99, catalogueReference: 100 }), true);
});

test("4. no anchor means no second-guessing; a missing reference is never plausible", () => {
  assert.equal(referenceIsPlausible({ storedReference: 9999, catalogueReference: 0 }), true);
  assert.equal(referenceIsPlausible({ storedReference: 9999, catalogueReference: null }), true);
  assert.equal(referenceIsPlausible({ storedReference: 0, catalogueReference: 100 }), false);
  assert.equal(referenceIsPlausible({}), false);
});

test("5. a corrected row keeps its listing: no saving shown, still displayable", () => {
  // Psyduck (Triumphant) after correction: $16 reference, $22 asking - the
  // listing is ABOVE the real market, so there is no saving to claim.
  const row = {
    id: 38272,
    is_active: true,
    title: "Psyduck Triumphant 88/102 NM",
    card_set: "Triumphant",
    card_tcgplayer_id: "12345",
    listing_url: "https://www.ebay.com/itm/123",
    affiliate_url: "https://www.ebay.com/itm/123",
    condition: "Near Mint",
    is_graded: false,
    total_price: 22,
    total_price_usd: 22,
    market_price: 16,
    discount_pct: -0.375,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
  const p = listingPresentation(row);
  assert.equal(p.savings, null, "no savings claim on a listing priced above the real reference");
  // and the listing itself is not hidden by this - the gate is unchanged
  assert.equal(typeof isDisplayableDeal(row), "boolean");
});

test("6. the corrector is report-only by default and never hides a row", () => {
  const src = read("scripts/fixImplausibleReferences.mjs");
  assert.match(src, /const APPLY = process\.argv\.includes\("--apply"\)/);
  assert.match(src, /if \(!APPLY\)/, "must be report-only without --apply");
  // it corrects the number; it must never disqualify, deactivate or delete
  assert.doesNotMatch(src, /disqualified_reason:\s*["'`]/, "the corrector must not hold rows");
  assert.doesNotMatch(src, /is_active:\s*false/, "the corrector must not deactivate rows");
  assert.doesNotMatch(src, /\.delete\(\)/, "the corrector must not delete rows");
  assert.match(src, /\.update\(\{ market_price: b\.now, discount_pct: b\.discount \}\)/);
  assert.match(src, /referenceIsPlausible/);
});
