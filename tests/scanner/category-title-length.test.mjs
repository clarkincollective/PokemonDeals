// Deal-category title length, at two different scopes.
//
// TWO CAPS, and they are not the same measurement:
//
//   AUTHORED CAP (site-wide convention, every category): the string
//   lib/dealCategories declares, before the root layout appends
//   " | Pokemon Deal Finder". This is what tests/seo/pages.test.mjs has
//   always measured via titleCore(), and ten of the twelve categories are
//   inside 65 on this measure but OVER 65 once the suffix is added.
//
//   RENDERED CAP (/deals/modern and /deals/australia only): the complete
//   <title> a browser and a result page see, suffix included. These two were
//   corrected to satisfy it; the other ten were deliberately left alone in
//   that batch and are NOT asserted here. Naming that scope honestly matters
//   more than a green tick - see the list this file prints if it ever fails.
//
// The suffix is derived from the root layout rather than hard-coded, so a
// brand rename cannot leave these assertions quietly measuring the wrong
// thing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SRC = read("lib/dealCategories.js");
const LAYOUT = read("app/layout.js");

const CAP = 65;
const siteTitle = (LAYOUT.match(/const SITE_TITLE = "([^"]+)"/) ?? [])[1];
const templateSuffix = (() => {
  const m = LAYOUT.match(/template: `([^`]+)`/);
  return m ? m[1].replace("%s", "").replace("${SITE_TITLE}", siteTitle) : null;
})();
const rendered = (authored) => `${authored}${templateSuffix}`;

// Parsed from source rather than imported: lib/dealCategories pulls in the
// deal/query stack, and this only needs the declared strings.
const titleOf = (slug) => {
  const block = SRC.slice(SRC.indexOf(`  ${slug}: {`));
  return (block.match(/^ {4}title: "([^"]+)",/m) ?? [])[1];
};
const titles = [...SRC.matchAll(/^ {4}title: "([^"]+)",/gm)].map((m) => m[1]);

// The two pages corrected against the RENDERED cap.
const RENDERED_CAPPED = ["modern", "australia"];

test("0. the brand suffix is read from the root layout, not assumed", () => {
  assert.equal(siteTitle, "Pokemon Deal Finder");
  assert.equal(templateSuffix, " | Pokemon Deal Finder");
  assert.equal(templateSuffix.length, 22, "the authored budget for a rendered-capped title is 65 - 22 = 43");
});

test("1. /deals/modern and /deals/australia fit the 65-char COMPLETE RENDERED title", () => {
  for (const slug of RENDERED_CAPPED) {
    const authored = titleOf(slug);
    assert.ok(authored, `${slug}: no title found`);
    const full = rendered(authored);
    assert.ok(
      full.length <= CAP,
      `${slug}: rendered title is ${full.length} chars (>${CAP}): ${full}`
    );
    assert.ok(authored.length <= CAP - templateSuffix.length, `${slug}: authored ${authored.length} > ${CAP - templateSuffix.length}`);
  }
});

test("2. every category fits the AUTHORED 65-char cap (the site-wide convention)", () => {
  // deliberately the authored measure: the other ten categories have not
  // been shortened for the rendered cap, and this batch did not touch them
  assert.ok(titles.length >= 10, `expected the category set, found ${titles.length} titles`);
  const over = titles.filter((t) => t.length > CAP).map((t) => `${t.length}: ${t}`);
  assert.deepEqual(over, [], `authored titles past the ${CAP}-char cap:\n  ${over.join("\n  ")}`);
});

test("3. the ten categories outside the rendered-cap scope are recorded, not silently passing", () => {
  // If this list ever empties, every category satisfies the rendered cap and
  // test 1 can be widened. Until then the gap is stated rather than hidden.
  const outside = titles.filter((t) => !RENDERED_CAPPED.map(titleOf).includes(t));
  const overRendered = outside.filter((t) => rendered(t).length > CAP);
  assert.equal(overRendered.length, 10, `expected 10 categories still over the rendered cap, found ${overRendered.length}`);
  for (const slug of RENDERED_CAPPED) {
    assert.ok(rendered(titleOf(slug)).length <= CAP, `${slug} must be inside the rendered cap`);
  }
});

test("4. the two corrected titles keep their meaning and claim nothing they cannot support", () => {
  const modern = titleOf("modern");
  const australia = titleOf("australia");
  assert.match(modern, /^Modern Pokemon Card Deals/, "modern lost its category identity");
  // both facts the country-landing contract names (audit-r1-stage2 AR1S2-1)
  assert.match(australia, /eBay\.com\.au/, "australia lost the local site that defines its filter");
  assert.match(australia, /\(AUD\)/, "australia lost the native currency AR1S2-1 requires");
  assert.match(australia, /Pokemon Card Deals/, "australia lost its category identity");
  // the country word moved to the H1/intro, which still carry it
  assert.match(SRC, /h1: "Pokemon Card Deals in Australia"/);

  // "Below Market" is NOT claimable on a regional category page: the gate is
  // isDisplayableDeal, and savingsClaimTrusted is applied only when
  // sort === "discount" while the default sort is "newest". Measured
  // 2026-09-17, displayable rows with no evidenced below-market comparison:
  // GB 113/204, CA 180/264, US 290/959, AU 81/171.
  assert.ok(!/below market/i.test(australia), "australia must not promise a below-market comparison it does not gate on");
  assert.ok(!/below market/i.test(modern), "modern must not promise a below-market comparison");

  // no freshness, availability or savings claim in any category title
  for (const t of titles) {
    assert.ok(!/\b(today|now|live|in stock|guaranteed|cheapest|lowest ever|\d+% off)\b/i.test(t), `unsupported claim in: ${t}`);
  }
});

test("5. H1s, descriptions and intros are untouched by the title change", () => {
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

test("6. shortening a title never removed a field - every category still has all four", () => {
  const count = (re) => (SRC.match(re) ?? []).length;
  assert.equal(titles.length, 12, `expected 12 category titles, found ${titles.length}`);
  assert.equal(count(/^ {4}description:/gm), titles.length, "a category lost its description");
  assert.equal(count(/^ {4}intro:/gm), titles.length, "a category lost its intro");
  assert.equal(count(/^ {4}h1: "/gm), titles.length, "a category lost its H1");
});
