// SEO-4 - the savings-evidence hole, closed (16 Sep 2026).
//
// savingsClaimTrusted used to begin:
//
//     const release = officialReleaseFor(row);
//     if (!release) return true;   // outside the tracked releases
//
// so the evidence rule only ever ran on the handful of sets with an
// official release record. Measured over 1,300 countable live rows that
// day: 1,259 could claim savings, 472 carried evidence. The other ~787
// showed a "% below market" nobody could check, and the deal-38589 sweep
// found real breakages behind exactly those claims.
//
// These tests pin the new rule and, just as importantly, that closing the
// hole does not hide a single listing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const { savingsClaimTrusted, listingPresentation, isDisplayableDeal } = require("../../lib/dealQuality.js");

// A raw card row in an UNTRACKED set (no official release record) with
// complete stored reference evidence.
function evidencedRow(over = {}) {
  return {
    id: 1,
    is_active: true,
    title: "Blastoise Base Set 2/102 Near Mint",
    card_name: "Blastoise",
    card_set: "Base Set",
    card_tcgplayer_id: "42386",
    condition: "Near Mint",
    is_graded: false,
    total_price: 120,
    total_price_usd: 120,
    market_price: 200,
    discount_pct: 0.4,
    reference_product_id: "42386",
    reference_amount: 200,
    reference_currency: "USD",
    reference_condition: "Near Mint",
    reference_printing: "Holofoil",
    reference_observed_at: "2026-09-14T00:00:00.000Z",
    ...over,
  };
}

test("1. an untracked-set row WITH full evidence may claim savings", () => {
  assert.equal(savingsClaimTrusted(evidencedRow()), true);
});

test("2. the hole is closed: an untracked-set row with NO evidence may not", () => {
  // this is the exact shape that used to be waved through by `if (!release) return true`
  const bare = evidencedRow({
    reference_product_id: null,
    reference_amount: null,
    reference_condition: null,
    reference_printing: null,
    reference_observed_at: null,
  });
  assert.equal(savingsClaimTrusted(bare), false);
});

test("3. each evidence element is load-bearing on an untracked set", () => {
  for (const [field, value] of [
    ["reference_product_id", null],
    ["reference_product_id", "999999"], // a reference for a DIFFERENT product
    ["reference_amount", null],
    ["reference_amount", 175], // does not reproduce the stored market_price
    ["reference_condition", null],
    ["reference_condition", "Damaged"], // not the condition this row is priced at
    ["reference_printing", null],
  ]) {
    assert.equal(
      savingsClaimTrusted(evidencedRow({ [field]: value })),
      false,
      `${field}=${JSON.stringify(value)} should defeat the claim`
    );
  }
});

test("4. a graded row is evidenced by grader and grade, not condition", () => {
  const graded = evidencedRow({
    is_graded: true,
    grader: "PSA",
    grade: "9",
    condition: null,
    reference_condition: null,
    reference_printing: null,
    reference_grader: "PSA",
    reference_grade: "9",
  });
  assert.equal(savingsClaimTrusted(graded), true);
  assert.equal(savingsClaimTrusted({ ...graded, reference_grade: "10" }), false, "a PSA 10 reference cannot price a PSA 9");
  assert.equal(savingsClaimTrusted({ ...graded, reference_grader: "BGS" }), false, "a different grader is different evidence");
});

test("5. an unknown observation time is fine OUTSIDE a tracked release, fatal inside one", () => {
  // outside: identity + amount + what-it-was-for already establish the claim,
  // and sealed_catalog records no provider as-of at all
  assert.equal(savingsClaimTrusted(evidencedRow({ reference_observed_at: null })), true);
  // the tracked-release floor is unchanged and still needs a real time
  const src = read("lib/dealQuality.js");
  assert.match(src, /if \(!release\) return true;/);
  assert.match(src, /if \(evidence\.capturedAt == null\) return false;/);
  assert.match(src, /return evidence\.capturedAt >= releaseStartFor\(release\)\.getTime\(\);/);
  // and the early return no longer precedes the evidence lookup
  const evidenceAt = src.indexOf("const evidence = row.sealed_watchlist");
  const releaseAt = src.indexOf("const release = officialReleaseFor(row);", evidenceAt);
  assert.ok(evidenceAt > 0 && releaseAt > evidenceAt, "evidence must be required before the release branch");
});

test("6. sealed rows are routed to the sealed evidence rule, not the card one", () => {
  // sealed products have no condition, printing or grade; judging them with
  // the card rule would fail every one of them forever
  const sealed = {
    id: 9,
    is_active: true,
    title: "Base Set Booster Box",
    sealed_watchlist: { id: 3, name: "Base Set Booster Box", set: "Base Set", tcgplayer_id: "593355" },
    total_price: 8000,
    total_price_usd: 8000,
    market_price: 12000,
    discount_pct: 0.33,
    reference_product_id: "593355",
    reference_amount: 12000,
    reference_currency: "USD",
    reference_observed_at: null,
  };
  assert.equal(savingsClaimTrusted(sealed), true);
  assert.equal(savingsClaimTrusted({ ...sealed, reference_product_id: null }), false);
  assert.equal(savingsClaimTrusted({ ...sealed, reference_amount: 99 }), false);
});

test("7. a row that cannot claim savings is still SHOWN, as a plain listing", () => {
  // the user-facing guarantee: closing the hole must not lose a listing
  const bare = evidencedRow({ reference_product_id: null, reference_amount: null });
  const p = listingPresentation(bare);
  assert.equal(p.savings, null, "no savings figure");
  assert.equal(typeof isDisplayableDeal(bare), "boolean");
  // the display gate must not consult the savings rule at all
  const src = read("lib/dealQuality.js");
  const gate = src.slice(src.indexOf("function isDisplayableDeal"), src.indexOf("function isVerificationCandidate"));
  assert.ok(gate.length > 0, "isDisplayableDeal not found");
  assert.doesNotMatch(gate, /savingsClaimTrusted/, "showing a listing must not depend on it claiming savings");
});

test("8. hub membership is decoupled from the savings rule", () => {
  // conflating them meant tightening the savings rule deleted pages:
  // simulated live, set hubs would have gone 89 -> 49 and five card hubs
  // would have 404'd, while the listings stayed on the site throughout
  const src = read("lib/catalogAggregates.js");
  // strip comments: the rationale above the filter necessarily QUOTES the
  // old coupled predicate, so only executable code is checked here
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /rows = \(rows \?\? \[\]\)\.filter\(\(row\) => isOfferCountable\(row\)\);/);
  assert.doesNotMatch(code, /savingsClaimTrusted/, "hub counts must not depend on savings evidence");
});

test("9. a count that is not a savings claim says 'listings', not 'deals'", () => {
  const sets = read("components/SetsFilterList.js");
  // finding 6 (2026-09-25): the number shown is now the distinct-LISTING
  // count rather than the stored-row count. The wording contract this test
  // exists for - "listings", never "deals" - is unchanged.
  assert.match(sets, /\? "listing" : "listings"/);
  assert.match(sets, /s\.listingCount \?\? s\.count/, "the tile must show buying options, not stored rows");
  assert.doesNotMatch(sets, /\? "deal" : "deals"/);
  const species = read("components/PokemonFilterList.js");
  assert.doesNotMatch(species, /active deal\$\{/, "species tooltip must not call an unevidenced listing a deal");
});

test("10. the savings figure is still gated at every render site", () => {
  // closing the hole only matters if the rendered discount consults it
  const deals = read("lib/deals.js");
  const gated = deals.match(/discountPct: d\.discount_pct != null && savingsClaimTrusted\(d\)/g) ?? [];
  assert.ok(gated.length >= 3, `expected the gated discount projection at several read paths, saw ${gated.length}`);
  const search = read("lib/searchEngine.js");
  assert.match(search, /savingsClaimTrusted\(deal\)/);
});
