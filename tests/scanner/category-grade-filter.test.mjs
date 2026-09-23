// CATEGORY FILTER CONTRACT: grader / grade, and the item-price vs
// delivered-total distinction.
//
// WHY THIS EXISTS. An SEO plan (2026-09-23) proposed a "PSA 10 Pokemon
// cards under $50" destination and assumed the category filter contract
// could not express grader/grade. It can - both category paths already
// forward them - so the honest outcome was to PROVE the capability rather
// than add plumbing that already existed. These tests pin that, so a
// future refactor cannot quietly drop the keys and leave a graded
// category silently serving every grade.
//
// THE DESTINATION ITSELF WAS NOT CREATED. Measured on the live table the
// same day: 14 active PSA 10 listings site-wide, 10 of them EBAY_US, and
// ZERO under $50 on either item price or delivered total (one qualifies
// across all marketplaces). A category page there would be empty, which
// the substance rule forbids. The capability is ready; the supply is not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { planDealFilters } = require_("../../lib/dealFilters.js");
const { DEAL_CATEGORIES, categoryInventoryParams } = require_("../../lib/dealCategories.js");

test("1. a category's grader/grade reach the query plan as exact matches", () => {
  const cat = { filter: { cardType: "graded", grader: "PSA", grade: "10" }, inventory: { language: "english" } };
  const params = categoryInventoryParams(cat, { sort: "newest", page: 1 });
  assert.equal(params.grader, "PSA", "categoryInventoryParams dropped grader");
  assert.equal(params.grade, "10", "categoryInventoryParams dropped grade");

  const plan = planDealFilters({ type: params.cardType, grader: params.grader, grade: params.grade });
  assert.equal(plan.eq.is_graded, true, "a graded category must constrain is_graded");
  assert.equal(plan.eq.grader, "PSA");
  assert.equal(plan.eq.grade, "10", "grade must be compared as a string - '10' and 10 are different column values");
});

test("2. the category's own filter wins over a conflicting URL parameter", () => {
  // the existing rule: a ?grade=9 cannot turn a PSA 10 page into a PSA 9 one
  const cat = { filter: { cardType: "graded", grader: "PSA", grade: "10" }, inventory: {} };
  const params = categoryInventoryParams(cat, { grader: "CGC", grade: "9", cardType: "raw" });
  assert.equal(params.grader, "PSA");
  assert.equal(params.grade, "10");
  assert.equal(params.cardType, "graded");
});

test("3. an under-$N category filters the DELIVERED total, not the item price", () => {
  // This is the distinction a page titled "under $50" has to get right: a
  // $46 card with $9 postage is not a sub-$50 purchase. maxPrice must
  // constrain total_price_usd, and must never be applied to `price`.
  const plan = planDealFilters({ maxPrice: 50 });
  assert.equal(plan.lte.total_price_usd, 50, "maxPrice must bound the delivered total");
  assert.equal(plan.lte.price, undefined, "maxPrice must NOT be applied to the item price");
  assert.equal(plan.gte.price, undefined);

  const withMin = planDealFilters({ minPrice: 10, maxPrice: 50 });
  assert.equal(withMin.gte.total_price_usd, 10);
  assert.equal(withMin.lte.total_price_usd, 50);

  // and every shipped under-$N category relies on exactly that
  for (const slug of ["under-25", "under-50", "under-100", "under-250"]) {
    const cap = DEAL_CATEGORIES[slug]?.filter?.maxPrice;
    assert.ok(Number.isFinite(cap), `${slug}: no maxPrice`);
    assert.equal(planDealFilters({ maxPrice: cap }).lte.total_price_usd, cap, `${slug} must bound the delivered total`);
  }
});

test("4. grader/grade are only meaningful alongside a graded type, and raw excludes them", () => {
  const raw = planDealFilters({ type: "raw" });
  assert.equal(raw.eq.is_graded, false);
  assert.equal(raw.eq.grader, undefined, "a raw category must not pin a grader");
  assert.equal(raw.eq.grade, undefined);
});

test("5. no shipped category claims a grade it does not filter on", () => {
  // a title/h1 naming a specific grade must be backed by a real filter,
  // or the page advertises something it does not deliver
  for (const [slug, cat] of Object.entries(DEAL_CATEGORIES)) {
    if (cat.redirect) continue;
    const text = `${cat.title ?? ""} ${cat.h1 ?? ""}`;
    const claimsGrade = /\bPSA\s*\d|\bCGC\s*\d|\bBGS\s*\d/i.test(text);
    if (!claimsGrade) continue;
    assert.ok(cat.filter?.grader, `${slug}: names a specific grade but pins no grader`);
    assert.ok(cat.filter?.grade != null, `${slug}: names a specific grade but pins no grade`);
  }
});
