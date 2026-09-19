// 2026-09-20 - the price-history legend counts the dashed points by reason
// (no provenance vs a different reference) and glosses the provider's
// "Unlimited" printing label. Found on /cards/charizard-base-set-shadowless:
// 13 unrecorded readings + 1 verified Moderately Played reading were
// reported as "13 earlier readings didn't record ...".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legendCounts, comparableFromIndex, isUnlimitedPrinting } from "../../lib/priceHistoryLegend.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

// The Shadowless Charizard series as stored on 2026-09-20 (price_history,
// tcgplayer 106999): 13 rows without provenance, one MP row, seven LP rows.
const shadowless = [
  ...Array.from({ length: 13 }, (_, i) => ({ t: i, p: 1200, v: 0 })),
  { t: 13, p: 1163.6, v: 1, c: "Moderately Played", pr: "Unlimited Holofoil" },
  ...Array.from({ length: 7 }, (_, i) => ({ t: 14 + i, p: 2257.87, v: 1, c: "Lightly Played", pr: "Unlimited Holofoil" })),
];

test("the comparable run starts at the first point sharing the latest point's reference", () => {
  assert.equal(comparableFromIndex(shadowless), 14);
  assert.equal(comparableFromIndex([{ t: 0, p: 1, v: 0 }, { t: 1, p: 2, v: 0 }]), null, "latest point unverified -> nothing comparable");
  assert.equal(comparableFromIndex([]), null);
});

test("dashed points are counted by reason, and the other reference is named", () => {
  assert.deepEqual(legendCounts(shadowless), {
    earlier: 14,
    unrecorded: 13,
    differentRef: 1,
    differentRefs: ["Moderately Played, Unlimited Holofoil"],
  });
  // nothing comparable: every point is "earlier"
  assert.deepEqual(legendCounts([{ t: 0, p: 1, v: 0 }, { t: 1, p: 2, v: 0 }]), { earlier: 2, unrecorded: 2, differentRef: 0, differentRefs: [] });
  // all comparable: nothing dashed
  assert.deepEqual(legendCounts(shadowless.slice(14)), { earlier: 0, unrecorded: 0, differentRef: 0, differentRefs: [] });
});

test("'Unlimited' is glossed as the not-1st-Edition printing; other labels are not", () => {
  assert.equal(isUnlimitedPrinting("Unlimited Holofoil"), true);
  assert.equal(isUnlimitedPrinting("unlimited"), true);
  assert.equal(isUnlimitedPrinting("1st Edition Holofoil"), false);
  assert.equal(isUnlimitedPrinting("Holofoil"), false);
  assert.equal(isUnlimitedPrinting(null), false);
});

test("the chart renders the split counts and the gloss from the points' own records", () => {
  const src = read("components/PriceHistoryChart.js");
  assert.match(src, /legendCounts\(sorted\)/);
  assert.match(src, /data-history-unrecorded=\{dashed\.unrecorded\}/);
  assert.match(src, /data-history-other-reference=\{dashed\.differentRef\}/);
  assert.match(src, /for a different reference \(\{dashed\.differentRefs\.join\("; "\)\}\)/);
  assert.match(src, /isUnlimitedPrinting\(last\.pr\) && <>&ldquo;Unlimited&rdquo; is the printing that is not 1st Edition/);
  assert.doesNotMatch(src, /or were for a different reference\)/, "the merged sentence is gone");
});
