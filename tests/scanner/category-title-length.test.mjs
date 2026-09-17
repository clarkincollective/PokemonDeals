// Deal-category titles stay inside the 65-character cap.
//
// /deals/modern (76) and /deals/australia (71) had drifted past it. The live
// SEO suite catches this only when it happens to sample the offending route,
// so the cap is pinned here, deterministically, over EVERY category at once.
//
// The cap is on the authored title. The " | Pokemon Deal Finder" suffix is
// appended by the root layout's title template, so it is not part of what
// lib/dealCategories declares - but a title long enough to push the rendered
// string past what a result page shows is exactly what the cap exists to
// prevent, so the authored value is what must fit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SRC = read("lib/dealCategories.js");

// Parsed from source rather than imported: lib/dealCategories pulls in the
// deal/query stack, and this only needs the declared strings.
const titles = [...SRC.matchAll(/^ {4}title: "([^"]+)",/gm)].map((m) => m[1]);
const CAP = 65;

test("1. every deal-category title fits the 65-character cap", () => {
  assert.ok(titles.length >= 10, `expected the category set, found ${titles.length} titles`);
  const over = titles.filter((t) => t.length > CAP).map((t) => `${t.length}: ${t}`);
  assert.deepEqual(over, [], `titles past the ${CAP}-char cap:\n  ${over.join("\n  ")}`);
});

test("2. the two corrected titles keep their meaning and claim nothing new", () => {
  const modern = titles.find((t) => t.startsWith("Modern Pokemon Card Deals"));
  const australia = titles.find((t) => t.startsWith("Australian Pokemon Card Deals"));
  assert.ok(modern && australia, "the corrected categories are still present");

  // modern: the era range survives, and Mega Evolution is still named
  // (tests/scanner/me-era-17c7.test.mjs R-6 depends on that too)
  assert.match(modern, /Sword & Shield/);
  assert.match(modern, /Mega Evolution/);
  // australia: marketplace, currency and the below-market intent survive
  assert.match(australia, /eBay\.com\.au/);
  assert.match(australia, /\(AUD\)/);
  assert.match(australia, /Below Market/);

  // no freshness, availability or savings claim was introduced
  for (const t of titles) {
    assert.ok(!/\b(today|now|live|in stock|guaranteed|cheapest|lowest ever|\d+% off)\b/i.test(t), `unsupported claim in: ${t}`);
  }
});

test("3. H1s, descriptions and intros are untouched by the title change", () => {
  // the H1 is authored separately and must not have followed the title
  assert.match(SRC, /h1: "Modern Pokemon Card Deals"/);
  assert.match(SRC, /h1: "Pokemon Card Deals in Australia"/);
  // the full era list still lives in the body copy, where there is room
  const modernBlock = SRC.slice(SRC.indexOf("  modern: {"), SRC.indexOf("  uk: {"));
  for (const era of ["Sword & Shield", "Scarlet & Violet", "Mega Evolution"]) {
    assert.ok(modernBlock.includes(era), `modern body copy lost ${era}`);
  }
  const auBlock = SRC.slice(SRC.indexOf("  australia: {"), SRC.indexOf("  canada: {"));
  assert.ok(auBlock.includes("priced in AUD"), "australia intro lost its currency statement");
  assert.ok(auBlock.includes("eBay.com.au"), "australia intro lost its marketplace");
});

test("4. shortening a title never removed a field - every category still has all four", () => {
  const count = (re) => (SRC.match(re) ?? []).length;
  assert.equal(titles.length, 12, `expected 12 category titles, found ${titles.length}`);
  assert.equal(count(/^ {4}description:/gm), titles.length, "a category lost its description");
  assert.equal(count(/^ {4}intro:/gm), titles.length, "a category lost its intro");
  assert.equal(count(/^ {4}h1: "/gm), titles.length, "a category lost its H1");
});
