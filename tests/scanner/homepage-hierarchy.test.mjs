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

import { LANES } from "../../lib/homepageVariety.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const page = read("app/page.js");
const layout = read("app/layout.js");
const laneLimit = (key) => LANES().find((l) => l.key === key)?.limit;

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

// ===================================================================
// Phase 13C.3 - below-the-fold consolidation. Deliberate section order,
// compact preview counts, and no loss of internal-link / filter value.
// ===================================================================

test("13C.3 - homepage section order: flagship -> auctions -> All Deals -> Just Added -> Explore -> support", () => {
  const order = [
    'data-analytics-section="best_deals"',
    'data-analytics-section="ending_soon"',
    'data-analytics-section="all_deals"',
    'data-analytics-section="just_added"',
    'data-analytics-section="browse"',      // "Explore Pokemon cards" (merged)
    'id="how-it-works"',
    'data-analytics-section="guides"',
  ];
  const positions = order.map((m) => idx(page, m));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1], `${order[i]} must come after ${order[i - 1]}`);
  }
});

test("13C.3 - flagship stays first commercial lane; auctions before any supporting content", () => {
  assert.ok(idx(page, 'data-analytics-section="best_deals"') < idx(page, 'data-analytics-section="ending_soon"'));
  assert.ok(idx(page, 'data-analytics-section="ending_soon"') < idx(page, 'id="how-it-works"'));
  // P0.4.1 - flagship is still 4 Buy It Now tiles; the count now lives in
  // the shared lane contract (lib/homepageVariety.LANES) rather than a
  // fetchHomepageFlagshipDeals({ limit: 4 }) literal in the page.
  assert.equal(laneLimit("flagship"), 4, "flagship homepage lane must be 4 tiles");
  assert.match(page, /flagshipDeals = lanes\.flagship/);
  assert.match(page, /data-analytics-section="best_deals"[\s\S]{0,600}lg:grid-cols-4/, "flagship still renders a 4-up grid");
});

test("13C.3 - preview lanes are compacted (auctions 3, just-added 3, Under $25 3, All Deals preview 9)", () => {
  // P0.4.1 - the per-lane limits moved into the shared lane contract.
  assert.equal(laneLimit("auctions"), 3, "auctions homepage preview is 3 cards");
  assert.equal(laneLimit("justAdded"), 3, "just-added homepage preview is 3 cards");
  assert.equal(laneLimit("underPrice"), 3, "Under $25 homepage preview is 3 cards");
  assert.equal(laneLimit("grid"), 9, "All Deals unfiltered page-1 renders a 9-card preview");
  assert.match(page, /const HOME_PREVIEW_SIZE = 9;/);
  // the deeper paths still exist
  assert.match(page, /actionHref="\/\?listing=AUCTION&sort=ending"/, "'See all auctions' path retained");
  assert.match(page, /actionHref="\/\?sort=newest"/, "'Browse newest' path retained");
  assert.match(page, /actionHref="\/deals\/under-25"/, "'See all under $25' path retained");
  assert.ok(page.includes("Browse all live deals"), "prominent 'Browse all live deals' CTA present");
  assert.match(page, /href="\/deals"/, "the Browse-all CTA points at the dedicated /deals route");
});

test("13C.3 - All Deals keeps its FilterBar + pagination on the homepage", () => {
  assert.match(page, /data-analytics-filter-bar="all_deals"/);
  assert.match(page, /<FilterBar\b/);
  assert.match(page, /<Pagination\b/);
  // and it sits BEFORE the catalogue/explore section (a primary browse tool, not buried)
  assert.ok(idx(page, 'data-analytics-section="all_deals"') < idx(page, 'title="Explore Pokemon cards"'));
});

test("13C.3 - Most Listed + Browse-catalogue merged into one 'Explore Pokemon cards' section, links + events preserved", () => {
  // exactly one section carries data-analytics-section="browse" now
  assert.equal((page.match(/data-analytics-section="browse"/g) ?? []).length, 1);
  // the old standalone most_active section is gone
  assert.ok(!page.includes('data-analytics-section="most_active"'), "the standalone most_active section must be merged away");
  assert.match(page, /title="Explore Pokemon cards"/);
  // truthful terminology kept
  assert.match(page, /Cards with the most active listings/);
  assert.ok(!/most popular/i.test(page), "must not call listing volume 'popular'");
  // every click event from both old lanes survives
  for (const ev of ["most_active_clicked", "browse_catalogue_clicked", "browse_sets_clicked", "browse_pokemon_clicked"]) {
    assert.ok(page.includes(`"${ev}"`), `click event ${ev} preserved`);
  }
});

test("13C.3 - homepage still links every major destination (no internal-link loss)", () => {
  // accept href="X" (Link/anchor), href: "X" (data object), actionHref="X" (SectionHeader)
  const linked = (path) =>
    new RegExp(`(?:href="${path}"|href: "${path}"|actionHref="${path}")`).test(page);
  for (const path of ["/cards", "/sets", "/pokemon", "/best-finds", "/methodology", "/guides", "/market-data/most-listed-cards"]) {
    assert.ok(linked(path), `homepage must still link ${path}`);
  }
  // HomeBrowseLinks (Popular Pokemon / Key sets rows) still rendered
  assert.match(page, /<HomeBrowseLinks \/>/);
});

test("13C.3 - no flagship / auction ranking helper touched from the homepage", () => {
  // page.js does not import or call the ranking primitives directly
  assert.ok(!/flagshipRanking|rankFlagshipDeals/.test(page));
  // auction lane still ordered by end time in lib/deals.js (guard lives in flagship-ranking.test.mjs);
  // here just assert the homepage didn't add a sort/limit override
  assert.ok(!/fetchAuctionsEndingSoon\([^)]*sort/.test(page), "homepage must not re-sort the auction lane");
});
