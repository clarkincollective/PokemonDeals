// Phase 13C.1 - homepage discovery hierarchy & first-action compression.
// Structural contracts for the reworked above-the-fold: the two homepage
// jobs (SEARCH a card / DISCOVER found deals) must both be present in the
// hero, the marketplace-coverage prose must NOT gate the first action,
// returning-user memory must sit below the first deal lane, and the
// Impact tag must render through next/script (one DOM id, not a raw
// <script id> that duplicates on static routes).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const page = read("app/page.js");
const layout = read("app/layout.js");

const idx = (s, needle) => {
  const i = s.indexOf(needle);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(needle)} in app/page.js`);
  return i;
};

test("hero shows SEARCH (HeroSearch) before the first promo section", () => {
  assert.ok(idx(page, "<HeroSearch") < idx(page, 'data-analytics-section="best_deals"'), "HeroSearch must render inside the hero, above Best deals");
});

test("hero shows an explicit DISCOVER action pointing at the first deal lane", () => {
  const heroEnd = idx(page, "</header>");
  const cta = page.indexOf('href="#best-deals"');
  assert.ok(cta !== -1 && cta < heroEnd, "a #best-deals discovery CTA must be in the hero");
  assert.match(page.slice(cta, cta + 700), /Browse today(&apos;|')s deals/, "discovery CTA keeps its label");
});

test("the Best deals lane owns the #best-deals anchor the hero jumps to", () => {
  assert.match(page, /<section id="best-deals"[^>]*data-analytics-section="best_deals"/, "best_deals section needs id=best-deals");
  assert.match(page, /id="best-deals"[^>]*scroll-mt-/, "anchor needs scroll-margin so the heading clears the sticky header");
});

test("hero teaches search by concrete example queries, not instructional prose", () => {
  assert.match(page, /const SEARCH_EXAMPLES = \[/, "SEARCH_EXAMPLES list is defined");
  for (const q of ["PSA 10 Pikachu", "Charizard 4/102", "Evolving Skies Umbreon"]) {
    assert.ok(page.includes(`"${q}"`), `example query ${JSON.stringify(q)} present`);
  }
  const heroEnd = idx(page, "</header>");
  assert.ok(page.indexOf("SEARCH_EXAMPLES.map") < heroEnd, "examples render in the hero");
});

test("the 'what is this' marketplace-coverage prose is out of the hero, still server-rendered", () => {
  const prose = idx(page, "scans eBay listings for Pokemon TCG cards");
  assert.ok(prose > idx(page, "</header>"), "coverage prose must sit BELOW the hero so it never gates the first action");
  assert.ok(prose < idx(page, 'id="how-it-works"'), "coverage prose reads as the lead-in to How it works");
  assert.match(page.slice(prose - 200, prose + 600), /href="\/methodology"/, "the methodology link is retained with the prose");
});

test("returning-user memory (CardMemoryStrip) renders below the first deal lane", () => {
  assert.ok(
    idx(page, "<CardMemoryStrip />") > idx(page, 'data-analytics-section="best_deals"'),
    "CardMemoryStrip must not sit between a new visitor and the first real deal"
  );
});

test("Impact tag renders via next/script beforeInteractive - one DOM id, not a raw <script id>", () => {
  assert.match(layout, /import Script from "next\/script"/, "layout imports next/script");
  assert.match(layout, /<Script\s+id="impact-verification"\s+strategy="beforeInteractive"/, "Impact tag uses next/script beforeInteractive");
  assert.ok(
    !/<script\s+id="impact-verification"/.test(layout),
    "the raw <script id=\"impact-verification\"> (which duplicated the id in the hydrated DOM on static routes) must be gone"
  );
  assert.ok(layout.includes("utt.impactcdn.com/P-A7555826"), "the Impact UTT snippet itself is unchanged");
});
