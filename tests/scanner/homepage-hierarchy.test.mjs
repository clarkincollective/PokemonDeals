// Homepage hierarchy contracts.
//
// Phase 13C.1 established the two homepage jobs (SEARCH a card / DISCOVER
// found deals) and 13C.3 the below-the-fold consolidation. Deal-first R2
// (2026-09-13) re-cut the page around ONE dominant deal feed: the
// structural pins below are the R2 hierarchy; the behavioural contracts
// the earlier phases guarded (search in the hero, the coverage prose out
// of the hero and still server-rendered, returning-user memory below the
// first offers, the Impact tag through next/script, every destination
// still linked, no ranking helper touched from the page, lane limits in
// the shared contract) are carried forward unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { LANES } from "../../lib/homepageVariety.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const pageOnly = read("app/page.js");
const layout = read("app/layout.js");
const laneLimit = (key) => LANES().find((l) => l.key === key)?.limit;

// Homepage-caching r1 split the feed/explore markup out of app/page.js
// into components/HomeFeed.js (a client component, so the host page reads
// no searchParams and stays statically cacheable - see that file's own
// header comment). Splicing HomeFeed's source in at the <HomeFeed ... />
// call site reconstructs the same top-to-bottom document order the two
// files render at runtime, so every structural/order assertion below
// still means what it always meant.
const homeFeed = read("components/HomeFeed.js");
const page = pageOnly.replace(/<HomeFeed[\s\S]*?\/>/, () => homeFeed);

const idx = (s, needle) => {
  const i = s.indexOf(needle);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(needle)} in app/page.js + components/HomeFeed.js`);
  return i;
};

test("hero shows SEARCH (HeroSearch) before the first offer", () => {
  assert.ok(idx(page, "<HeroSearch") < idx(page, 'data-analytics-section="best_deals"'), "HeroSearch must render inside the hero, above the feed");
});

test("R2 - the hero is offer-led and compact: one heading, no CTA that only scrolls to offers already in view", () => {
  // GEO 2026-09-20: the heading names what the page is, in search words - not a slogan
  assert.match(page, /Pokemon card deals below market price on eBay\s*<\/h1>/);
  const heroEnd = idx(page, "</header>");
  const hero = page.slice(idx(page, "<header"), heroEnd);
  assert.ok(!hero.includes('href="#best-deals"'), "no scroll-to-offers CTA in the hero (the first offers are already visible)");
  assert.ok(!/Browse today(&apos;|')s deals/.test(hero), "the old discovery CTA label is gone");
  // the first offers really are the next thing after the hero
  assert.ok(idx(page, 'data-analytics-section="best_deals"') < idx(page, 'data-analytics-section="browse"'));
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
  assert.ok(prose < idx(page, 'id="how-it-works"'), "coverage prose reads as the lead-in to How comparisons work");
  assert.match(page.slice(prose - 200, prose + 600), /href="\/methodology"/, "the methodology link is retained with the prose");
});

test("returning-user memory (CardMemoryStrip) renders below the first offers", () => {
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
// Deal-first R2 - one dominant feed, then explore / guides / how it works
// ===================================================================

test("R2 - section order: feed (flagship row -> grid) -> explore -> guides -> how comparisons work", () => {
  const order = [
    'data-analytics-section="best_deals"',
    'data-analytics-section="all_deals"',
    'data-analytics-section="browse"', // "Explore more ways to collect"
    'data-analytics-section="guides"',
    'data-analytics-section="how_it_works"',
    'id="how-it-works"',
  ];
  const positions = order.map((m) => idx(page, m));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1], `${order[i]} must come after ${order[i - 1]}`);
  }
  // the three extra lanes are no longer separate grids on the page ...
  for (const gone of ['data-analytics-section="ending_soon"', 'data-analytics-section="just_added"', 'data-analytics-section="under_25"']) {
    assert.ok(!page.includes(gone), `${gone} is folded into the feed's mode row`);
  }
  // ... their destinations are reached through the mode row instead
  for (const href of ["/deals/auctions", "/deals/under-25", "/?sort=newest", "/?listing=FIXED_PRICE"]) {
    assert.ok(page.includes(`href: "${href}"`), `mode row keeps ${href}`);
  }
  // review fix P2: the default feed is MIXED (flagship BIN row + a grid
  // that may contain auctions), so it is labelled "Featured"; "Buy it now"
  // is the existing FIXED_PRICE filter, never the default's label
  assert.match(pageOnly, /\{ href: "\/", label: "Featured", chip: "featured", home: true \}/);
  assert.match(pageOnly, /\{ href: "\/\?listing=FIXED_PRICE", label: "Buy it now", chip: "buy_it_now" \}/);
  assert.match(page, /kicker=\{params\.anyFilter \? "Filtered" : "Buy it now and auctions"\}/);
});

test("R2 - the flagship row stays the first commercial content and keeps the shared lane contract", () => {
  assert.equal(laneLimit("flagship"), 4, "flagship homepage lane must be 4 tiles");
  assert.equal(laneLimit("grid"), 9, "All Deals unfiltered page-1 renders a 9-card preview");
  assert.match(page, /flagshipDeals = lanes\.flagship/);
  assert.match(page, /deals = lanes\.grid/);
  assert.match(page, /const HOME_PREVIEW_SIZE = 9;/);
  assert.match(page, /<section id="best-deals" data-analytics-section="best_deals"[^>]*scroll-mt-/, "flagship row owns the #best-deals anchor");
  assert.match(page, /data-analytics-section="best_deals"[\s\S]{0,400}lg:grid-cols-4/, "flagship renders a 4-up row");
  assert.match(page, /pageName="home_best"/);
  assert.match(page, /pageName="home_all_deals"/);
  // the surfaces the folded lanes used are simply unused now - never renamed
  assert.ok(!page.includes("home_ending") && !page.includes("home_fresh") && !page.includes("home_under25"));
});

test("R2 - the feed keeps its FilterBar (collapsible, rows still in the DOM) and pagination on the homepage", () => {
  assert.match(page, /data-analytics-filter-bar="all_deals"/);
  assert.match(page, /<FilterBar[\s\S]{0,400}collapsible\s*\/>/);
  assert.match(page, /<Pagination\b/);
  assert.match(read("components/FilterToggle.js"), /collapsible = false/);
  // the collapsible variant hides with a class, never unmounts
  assert.match(read("components/FilterToggle.js"), /<div className=\{open \? "mt-4 block" : "hidden"\}>\{children\}<\/div>/);
  // and it sits BEFORE the explore section (a primary browse tool, not buried)
  assert.ok(idx(page, 'data-analytics-section="all_deals"') < idx(page, 'title="Explore more ways to collect"'));
  assert.ok(page.includes("Browse all live deals"), "prominent 'Browse all live deals' CTA present");
  assert.match(page, /href="\/deals"/, "the Browse-all CTA points at the dedicated /deals route");
});

test("R2 - one 'Explore more ways to collect' section: links + events preserved from the merged 13C.3 section", () => {
  assert.equal((page.match(/data-analytics-section="browse"/g) ?? []).length, 1);
  assert.ok(!page.includes('data-analytics-section="most_active"'), "the standalone most_active section stays merged away");
  assert.match(page, /title="Explore more ways to collect"/);
  // truthful terminology kept
  assert.match(page, /Cards with the most active listings/);
  assert.ok(!/most popular/i.test(page), "must not call listing volume 'popular'");
  for (const ev of ["most_active_clicked", "browse_catalogue_clicked", "browse_sets_clicked", "browse_pokemon_clicked"]) {
    assert.ok(page.includes(`"${ev}"`), `click event ${ev} preserved`);
  }
});

test("homepage still links every major destination (no internal-link loss)", () => {
  const linked = (path) => new RegExp(`(?:href="${path}"|href: "${path}"|actionHref="${path}")`).test(page);
  for (const path of ["/cards", "/sets", "/pokemon", "/methodology", "/guides", "/market-data/most-listed-cards", "/deals", "/deals/auctions", "/deals/graded", "/deals/under-25", "/sealed-deals", "/japanese-cards"]) {
    assert.ok(linked(path), `homepage must still link ${path}`);
  }
  // HomeBrowseLinks (Popular Pokemon / Key sets rows) still rendered
  assert.match(page, /<HomeBrowseLinks \/>/);
});

test("no flagship / auction ranking helper touched from the homepage", () => {
  assert.ok(!/flagshipRanking|rankFlagshipDeals/.test(page));
  assert.ok(!/fetchAuctionsEndingSoon\([^)]*sort/.test(page), "homepage must not re-sort the auction lane");
});
