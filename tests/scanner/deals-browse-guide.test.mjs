// /deals browse guide (2026-09-21) - the page had an H1, two caveat
// lines, a chip strip and the grid, and no headings at all. The guide
// answers what a browser of this list asks, links every category with a
// real description derived from the registry, and stays out of the head
// term the homepage owns (docs/seo-headterm-strategy.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const require = createRequire(import.meta.url);
const { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } = require(resolve(root, "lib/dealCategories.js"));
const guide = read("components/DealsBrowseGuide.js");
const page = read("app/deals/page.js");

test("every H2 is a question and the first one opens with the direct answer", () => {
  const h2s = [...guide.matchAll(/<h2[^>]*>\s*([^<{]+?)\s*<\/h2>/g)].map((m) => m[1].replace(/&apos;/g, "'").trim());
  assert.equal(h2s.length, 5, h2s.join(" | "));
  for (const h of h2s) assert.ok(h.endsWith("?"), `H2 is a question: ${h}`);
  assert.match(guide, /<p className=\{P\} data-direct-answer>\s*Every Pokemon card listing the scanner currently tracks/);
});

test("the category table covers every registry category plus Japanese and sealed, each described from the registry's own intro", () => {
  assert.match(guide, /\.\.\.DEAL_CATEGORY_SLUGS\.map\(\(slug\) => \(\{/);
  assert.match(guide, /blurb: firstSentence\(DEAL_CATEGORIES\[slug\]\.intro\)/, "descriptions are derived, never retyped");
  assert.match(guide, /href: `\/deals\/\$\{slug\}`/);
  for (const href of ["/japanese-cards", "/sealed-deals"]) assert.ok(guide.includes(`href: "${href}"`), href);
  assert.match(guide, /data-category-table=\{rows\.length\}/);
  // the registry really does carry an intro for every advertised category
  for (const slug of DEAL_CATEGORY_SLUGS) {
    const intro = DEAL_CATEGORIES[slug]?.intro;
    assert.ok(typeof intro === "string" && intro.trim().length > 20, `${slug}: usable intro`);
  }
});

test("firstSentence takes one sentence and never mangles a short intro", async () => {
  const { default: _ } = { default: null };
  const src = guide.match(/function firstSentence\(text\) \{[\s\S]*?\n\}/)[0];
  const fn = new Function(`${src}; return firstSentence;`)();
  assert.equal(fn("One. Two."), "One.");
  assert.equal(fn("Only one sentence."), "Only one sentence.");
  assert.equal(fn("No terminator"), "No terminator");
  assert.equal(fn(null), "");
  assert.equal(fn("Tracked eBay listings for Pokemon single cards under US$25. Sorted newest first."), "Tracked eBay listings for Pokemon single cards under US$25.");
});

test("the guide states no figure and never claims a saving; the head term stays the homepage's", () => {
  // comments carry the rationale (and quote example long-tail keywords);
  // the rule is about what the component RENDERS
  const copy = guide.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(copy, /\$\s?\d|\d+\s?%/, "no prices or percentages in static copy");
  assert.doesNotMatch(guide, /verified authentic|guaranteed/i);
  assert.doesNotMatch(guide, /new Date\(|Date\.now\(/, "static - nothing dated at render");
  // the exact head phrase is not used as a heading or lead on this page
  const headings = [...guide.matchAll(/<h2[^>]*>\s*([^<{]+?)\s*<\/h2>/g)].map((m) => m[1].toLowerCase());
  for (const h of headings) assert.ok(!h.includes("pokemon card deals"), `heading avoids the head term: ${h}`);
});

test("placement: below the grid, and the page's own pins still hold", () => {
  assert.ok(page.indexOf("<DealGrid") < page.indexOf("<DealsBrowseGuide />"), "listings come first");
  assert.match(page, /alternates: \{ canonical: "\/deals" \}/);
  assert.match(page, /export const revalidate = 600;/);
  assert.match(page, /fetchAllDealsPage\(\{ sort: "newest", page: 1 \}\)/);
});
