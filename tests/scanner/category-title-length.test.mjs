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
//   RENDERED CAP (the five corrected routes): the complete <title> a browser
//   and a result page see, suffix included. /deals/modern and the four
//   country landings have been brought inside it; the seven remaining
//   categories have NOT, and are reported as a backlog rather than asserted.
//   A test must never require a known defect to persist, so that report is
//   non-blocking - it prints what is left and fails only if one of the five
//   corrected routes regresses.
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
// One category's declaration, title + description + intro, comments stripped
// so a comment explaining the rule cannot satisfy or trip an assertion.
const categoryBlock = (slug) => {
  // a hyphenated slug is a quoted key ("price-drops": {), a bare one is not
  let start = SRC.indexOf(`  ${slug}: {`);
  if (start === -1) start = SRC.indexOf(`  "${slug}": {`);
  if (start === -1) return "";
  const end = SRC.indexOf("\n  },", start);
  return SRC.slice(start, end === -1 ? undefined : end).replace(/^\s*\/\/.*$/gm, "");
};

// The routes corrected against the RENDERED cap so far.
const RENDERED_CAPPED = ["modern", "australia", "uk", "canada", "usa"];
// The regional landings, whose copy may not promise a comparison the page
// does not gate on (see lib/dealCategories' note above the country block).
const REGIONAL = ["uk", "australia", "canada", "usa"];

test("0. the brand suffix is read from the root layout, not assumed", () => {
  assert.equal(siteTitle, "Pokemon Deal Finder");
  assert.equal(templateSuffix, " | Pokemon Deal Finder");
  assert.equal(templateSuffix.length, 22, "the authored budget for a rendered-capped title is 65 - 22 = 43");
});

test("1. the corrected routes fit the 65-char COMPLETE RENDERED title", () => {
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

test("3. the remaining rendered-cap backlog is REPORTED, never required to persist", () => {
  // Non-blocking by design: asserting a fixed count would make the suite
  // demand that known-too-long titles stay too long, so shortening one
  // elsewhere would "break" a test. This prints what is left and asserts
  // only that the corrected routes have not regressed.
  const corrected = new Set(RENDERED_CAPPED.map(titleOf));
  const backlog = titles.filter((t) => !corrected.has(t) && rendered(t).length > CAP);
  if (backlog.length) {
    console.error(`  rendered-title backlog: ${backlog.length} categor${backlog.length === 1 ? "y" : "ies"} still over ${CAP} rendered:`);
    for (const t of backlog.sort((a, b) => rendered(b).length - rendered(a).length)) {
      console.error(`    - ${rendered(t).length}: ${rendered(t)}`);
    }
  }
  for (const slug of RENDERED_CAPPED) {
    assert.ok(rendered(titleOf(slug)).length <= CAP, `${slug} regressed past the rendered cap`);
  }
});

test("4. the corrected titles keep their meaning and claim nothing they cannot support", () => {
  assert.match(titleOf("modern"), /^Modern Pokemon Card Deals/, "modern lost its category identity");
  // every country landing keeps the two facts its contract names
  // (audit-r1-stage2 AR1S2-1: the local site and the native currency)
  for (const [slug, site, ccy] of [
    ["uk", "eBay.co.uk", "GBP"],
    ["australia", "eBay.com.au", "AUD"],
    ["canada", "eBay.ca", "CAD"],
    ["usa", "eBay.com", "USD"],
  ]) {
    const t = titleOf(slug);
    assert.ok(t.includes(site), `${slug} lost the local site that defines its filter: ${t}`);
    assert.ok(t.includes(`(${ccy})`), `${slug} lost the native currency AR1S2-1 requires: ${t}`);
    assert.match(t, /Pokemon Card Deals/, `${slug} lost its category identity: ${t}`);
  }
  // the country words live in the H1s, which are unchanged
  for (const h1 of ["Pokemon Card Deals in the UK", "Pokemon Card Deals in Australia", "Pokemon Card Deals in Canada"]) {
    assert.ok(SRC.includes(`h1: "${h1}"`), `missing H1 ${h1}`);
  }

  // no freshness, availability or savings claim in any category title
  for (const t of titles) {
    assert.ok(!/\b(today|now|live|in stock|guaranteed|cheapest|lowest ever|\d+% off)\b/i.test(t), `unsupported claim in: ${t}`);
  }
});

test("4b. no category promises a comparison it does not gate on - but evidenced savings copy is kept", () => {
  // A regional page gates on isDisplayableDeal; savingsClaimTrusted applies
  // only when sort === "discount", and the default sort is "newest". So it
  // shows ordinary market-price listings alongside evidenced discounts and
  // must not promise a comparison for all of them in advance. Measured
  // 2026-09-17: GB 113/204, CA 180/264, US 290/959, AU 81/171 displayable
  // rows carried NO evidenced below-market comparison.
  const UNCONDITIONAL = [
    /below[\s-]market/i,
    /priced below (their|its|the) market/i,
    /each (one|deal|listing) is compared with/i,
    /every (listing|deal) is (priced )?below/i,
  ];
  for (const slug of REGIONAL) {
    const block = categoryBlock(slug);
    for (const re of UNCONDITIONAL) {
      assert.ok(!re.test(block), `${slug}: unconditional comparison promise ${re} in its copy`);
    }
    // the conditional explanation is KEPT, not deleted - a real comparison
    // is still described where one exists
    assert.match(block, /where a supported market reference is available/i, `${slug}: lost its conditional market-reference explanation`);
    // and the remainder that says what happens to everything else
    assert.match(block, /others are shown as ordinary listings/i, `${slug}: lost the ordinary-listing remainder`);
    // the reference is a provider figure, not an observed sale of this card:
    // the intro must not upgrade it into a verified recent sale
    assert.ok(
      !/(recent-sold|recent sold|verified|confirmed|actual|real) sale/i.test(block),
      `${slug}: describes the market reference as a verified recent sale`
    );
    // and the marketplace / currency meaning stays clear
    assert.match(block, /priced in (GBP|AUD|CAD|USD)|in (pounds|Australian dollars|Canadian dollars|US dollars)/i, `${slug}: lost its currency statement`);
  }
  // the honest conditional phrasing the other categories already use is
  // untouched - this batch removed a promise, not the concept of a discount
  assert.match(categoryBlock("price-drops"), /market reference appears where a matching comparison is available/i);
  assert.match(categoryBlock("auctions"), /any comparison reflects the recorded bid/i);
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
