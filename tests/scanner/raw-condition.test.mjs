// The "played/damaged card priced as Near Mint = fake discount" fix.
// Covers the two pure pieces it rests on:
//   - cardConditionToTier(): eBay's "Card Condition" descriptor strings
//     map to the right TCG tier (and unknown -> null)
//   - worseCondition(): reconciling the title guess with eBay's descriptor
//     always lands on the more-worn tier, ignoring unknowns
//
// getRawCardCondition() itself just does one getItem and reads that
// descriptor; the scan route's resolveRawCondition() budget/hold logic is
// exercised end-to-end by the live refresh cycle, not mocked here.

process.env.EBAY_CLIENT_ID = "test-id";
process.env.EBAY_CLIENT_SECRET = "test-secret";

import { test } from "node:test";
import assert from "node:assert/strict";
import { cardConditionToTier } from "../../lib/ebay.js";
import { worseCondition } from "../../lib/dealMatching.js";

test("cardConditionToTier maps eBay's real descriptor strings", () => {
  assert.equal(cardConditionToTier("Near mint or better"), "Near Mint");
  assert.equal(cardConditionToTier("Lightly played (Excellent)"), "Lightly Played");
  assert.equal(cardConditionToTier("Moderately played (Very good)"), "Moderately Played");
  assert.equal(cardConditionToTier("Heavily played (Poor)"), "Heavily Played");
  assert.equal(cardConditionToTier("Damaged (Poor)"), "Damaged");
});

test("cardConditionToTier checks 'damaged' before the bare 'poor' grade word", () => {
  // "Damaged (Poor)" must not collapse onto Heavily Played.
  assert.equal(cardConditionToTier("Damaged (Poor)"), "Damaged");
  assert.notEqual(cardConditionToTier("Damaged (Poor)"), "Heavily Played");
});

test("cardConditionToTier returns null for unknown / empty / graded", () => {
  assert.equal(cardConditionToTier(""), null);
  assert.equal(cardConditionToTier(null), null);
  assert.equal(cardConditionToTier("Graded"), null);
  assert.equal(cardConditionToTier("some new label eBay invented"), null);
});

test("worseCondition returns the more-worn of two tiers", () => {
  assert.equal(worseCondition("Near Mint", "Moderately Played"), "Moderately Played");
  assert.equal(worseCondition("Heavily Played", "Lightly Played"), "Heavily Played");
  assert.equal(worseCondition("Near Mint", "Near Mint"), "Near Mint");
  assert.equal(worseCondition("Damaged", "Near Mint"), "Damaged");
});

test("worseCondition ignores unknown inputs instead of treating them as Near Mint", () => {
  // eBay stated no card condition (null) -> keep the title guess.
  assert.equal(worseCondition("Near Mint", null), "Near Mint");
  assert.equal(worseCondition("Lightly Played", null), "Lightly Played");
  assert.equal(worseCondition(null, "Heavily Played"), "Heavily Played");
  assert.equal(worseCondition(null, null), "Near Mint");
});
