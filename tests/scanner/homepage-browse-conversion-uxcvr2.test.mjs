// Phase UX-CVR-2 - HOMEPAGE + DEAL BROWSE CONVERSION POLISH.
//
// Source-scanning guards for the polish changes:
//   * one dominant homepage primary CTA;
//   * the deal CTA contract is finalised - BIN "View on eBay", auction
//     "Bid on eBay", everywhere; no "Buy Now" / "Bid Now" / purchase
//     certainty; the P2 "Check deal on eBay" / "View Deal on eBay"
//     lexical split is gone;
//   * browse filter + sort labels are human, not dev tokens;
//   * an empty filtered/category grid offers real recovery actions
//     (Clear filters / Browse all / Under $25 / Newest) - never a dead
//     blank page, never a fabricated match;
//   * active-filter visibility on every grid;
//   * no eBay call at render on the homepage / browse surfaces;
//   * the affiliate disclosure stays present;
//   * P0.4.1 diversity/rotation wiring is untouched;
//   * mobile filters stay crawl-safe (rows in the DOM, nofollow'd).
// No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Homepage-caching r1 moved the feed/explore markup into
// components/HomeFeed.js (a client component) and the country/filter/
// page-driven data fetching into app/api/deals-page/route.js (kind=home),
// so app/page.js can go back to reading no searchParams and stay
// statically cacheable. HOME below splices HomeFeed's source in at the
// <HomeFeed ... /> call site to keep checking real document order; HOME_ALL
// additionally appends the API route for the "is this wiring still used
// anywhere reachable from the homepage" checks.
const HOME_PAGE_ONLY = read("app/page.js");
const HOME_FEED = read("components/HomeFeed.js");
const HOME_ROUTE = read("app/api/deals-page/route.js");
const HOME = HOME_PAGE_ONLY.replace(/<HomeFeed[\s\S]*?\/>/, () => HOME_FEED);
const HOME_ALL = HOME + "\n" + HOME_ROUTE;
const DEALS_INDEX = read("app/deals/page.js");
const DEALCARD = read("components/DealCard.js");
const SPECIESCARD = read("components/SpeciesCard.js");
const CATALOGUE = read("components/CatalogueBrowser.js");
const FILTERBAR = read("components/FilterBar.js");
const FILTERTOGGLE = read("components/FilterToggle.js");
const DEALGRID = read("components/DealGrid.js");
const FILTERCHIPS = read("components/DealFilterChips.js");
const CATPAGE = read("components/DealCategoryPage.js");

// ---- homepage primary CTA (§2) --------------------------------

test("UX-CVR-2-1. the homepage has one dominant primary action per offer, and no competing hero buttons", () => {
  // Deal-first R2: the primary action is each offer's own red "View deal
  // on eBay"; the hero carries the search shortcut only. No filled hero
  // button competes with the offers, and the example searches beside the
  // search box are plain text links, not buttons.
  const hero = HOME.slice(HOME.indexOf("<header"), HOME.indexOf("</header>"));
  assert.doesNotMatch(hero, /bg-zinc-900 px-4 py-2\.5|bg-red-600 px-4/, "no filled hero CTA button");
  // fold revision: the example queries are a plain "Try …" text line
  // beside the price-checker link (shown from `sm`; always in the DOM)
  assert.match(HOME, /<span>Try<\/span>/);
  assert.match(HOME, /className="hidden sm:contents">/);
  assert.doesNotMatch(HOME, /hero_example_clicked[\s\S]{0,120}(bg-zinc-900|bg-red-600|rounded-lg bg-)/);
  assert.match(DEALCARD, /Buy this deal/);
});

// ---- deal CTA contract (§7) ---------------------------------

test("UX-CVR-2-2. every deal CTA names eBay; BIN = 'View (deal) on eBay', auction = 'Bid on eBay' / 'View auction on eBay'", () => {
  // Deal-first R1: DealCard reads "View deal on eBay" / "View auction on
  // eBay" (the deal-card contract wording); the older tiles keep "View on
  // eBay" / "Bid on eBay" until their own slice. Both name eBay and neither
  // implies a settled purchase. Consistency phase 1: DealCard's non-auction
  // branch is now a further showSavings ? "deal" : "listing" split - a
  // plain (untrusted-comparison) offer must never say "deal".
  // CRO 2026-09-22 (§17): transactional copy where the visitor can
  // actually transact. The three-way split and its guarantees are
  // unchanged - an auction never says "buy" (you cannot buy it), and a
  // listing with no trusted saving never says "deal". The marketplace
  // moved to the button's second line, so every CTA still names eBay.
  // 2026-09-22: the three-way rule moved to lib/dealCta so the card, the
  // deal-page purchase panel and the sticky bar share one source.
  // Guarantees unchanged, now asserted on the rule itself.
  assert.match(DEALCARD, /ctaLabelFor\(\{ isAuction, savingsSupported \}\)/, "DealCard reads the shared CTA rule");
  const CTA_RULE = readFileSync(join(ROOT, "lib/dealCta.js"), "utf8");
  assert.match(CTA_RULE, /if \(isAuction\) return "View auction";/);
  assert.match(CTA_RULE, /return savingsSupported \? "Buy this deal" : "View listing";/);
  assert.match(DEALCARD, /on eBay\{marketInfo \? ` \$\{marketInfo\.short\}` : ""\}/, "the DealCard CTA still names eBay");
  for (const [name, src] of [["SpeciesCard", SPECIESCARD], ["CatalogueBrowser", CATALOGUE]]) {
    assert.match(src, /isAuction \? "(Bid on eBay|View auction on eBay)(?: →)?" : "View (deal )?on eBay(?: →)?"/, `${name} CTA is not the unified contract`);
    // the deferred P2 lexical variants are gone from the VISIBLE label
    // (an internal Vercel-Analytics `eventName` may keep its old string
    //  for historical continuity - it carries no arrow glyph).
    assert.doesNotMatch(src, /(Check deal on eBay|View Deal on eBay) →/, `${name} still shows an old CTA label`);
  }
});

test("UX-CVR-2-3. no deal CTA implies purchase certainty", () => {
  for (const src of [DEALCARD, SPECIESCARD, CATALOGUE, HOME, DEALS_INDEX]) {
    assert.doesNotMatch(src, />\s*(Buy Now|Buy It Now →|Bid Now|Purchase|Get it now)\s*</i);
  }
  // auctions stay auction-worded (never a plain "View on eBay" for an auction)
  for (const src of [DEALCARD, SPECIESCARD, CATALOGUE]) {
    assert.match(src, /"(Bid on eBay|View auction on eBay)/);
  }
});

// ---- filter + sort labels (§9, §12) ------------------------

test("UX-CVR-2-4. sort + filter labels are human, never dev tokens", () => {
  // SORT_OPTIONS labels
  assert.match(FILTERBAR, /label: "Biggest discount"/);
  assert.match(FILTERBAR, /label: "Price: low to high"/);
  assert.match(FILTERBAR, /label: "Newest"/);
  assert.match(FILTERBAR, /label: "Ending soon"/);
  // no raw value used AS a visible label
  assert.doesNotMatch(FILTERBAR, />\s*(price_asc|price_desc|FIXED_PRICE|discount)\s*</);
  // price / listing pills read as a shopper would say them
  for (const l of ["Under $25", "Under $50", "Buy It Now", "Auction", "Raw", "Graded"]) {
    assert.ok(FILTERBAR.includes(l), `FilterBar is missing the "${l}" pill`);
  }
});

// ---- empty-state recovery (§13) ---------------------------

test("UX-CVR-2-5. an empty grid offers real recovery actions, never a dead blank page", () => {
  // the shared escape links
  assert.match(FILTERCHIPS, /export function EmptyStateEscapes/);
  assert.match(FILTERCHIPS, /Browse all live deals →/);
  assert.match(FILTERCHIPS, /Under \$25 →/);
  assert.match(FILTERCHIPS, /Newest →/);
  assert.match(FILTERCHIPS, /export function EmptyGridState/);
  // DealGrid uses them for BOTH the filtered and the non-filtered empty
  assert.match(DEALGRID, /filtered \? \(\s*<FilteredEmptyState/);
  assert.match(DEALGRID, /<EmptyGridState label=\{emptyLabel\}/);
  // the homepage feed empty branch is a real block with Clear filters
  assert.match(HOME, /const feedEmpty = !loading && !view\.error && view\.flagshipDeals\.length === 0 && \(view\.deals\?\.length \?\? 0\) === 0;/);
  assert.match(HOME, /\{feedEmpty && \(/);
  assert.match(HOME, /Clear filters/);
  assert.match(HOME, /<EmptyStateEscapes \/>/);
  // truthful - no fabricated matches: the copy says the filters run
  // against real active listings and nothing was broadened
  assert.match(HOME, /nothing was broadened/i);
});

test("UX-CVR-2-6. active-filter visibility is on every grid now, not just the Pokemon page", () => {
  // the showGrading-only guard was dropped for AppliedFilters / FilterNotes
  assert.match(DEALGRID, /\n\s*<FilterNotes params=\{params\.obj\} \/>/);
  // 2026-09-19 §6: a wrapper row places "Save this search" beside the chips;
  // the chips still render for EVERY filtered grid, gated on `filtered` alone
  assert.match(DEALGRID, /\{filtered && \(\s*<div className="flex flex-wrap items-start justify-between gap-x-4">\s*<AppliedFilters/);
  assert.doesNotMatch(DEALGRID, /showGrading && filtered && \(\s*<AppliedFilters/);
});

// ---- no eBay call at render (§18) -------------------------

test("UX-CVR-2-7. the homepage + browse surfaces make no eBay call at render", () => {
  const BROWSE_EBAY = /from ["'][^"']*lib\/ebay["']|getListingFreshness|searchListings|searchNewlyListed|getBrowseRateLimit|browseSearch/;
  for (const [name, src] of [["app/page.js", HOME_PAGE_ONLY], ["components/HomeFeed.js", HOME_FEED], ["app/api/deals-page/route.js", HOME_ROUTE], ["app/deals/page.js", DEALS_INDEX], ["components/DealGrid.js", DEALGRID], ["components/DealCategoryPage.js", CATPAGE], ["components/DealFilterChips.js", FILTERCHIPS]]) {
    assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), BROWSE_EBAY, `${name} reaches an eBay API at render`);
  }
});

// ---- trust (§4, §17) -------------------------------------

test("UX-CVR-2-8. the affiliate disclosure stays present on the homepage and in the footer", () => {
  assert.match(read("components/SiteFooter.js"), /eBay and TCGPlayer affiliate.*commission/is);
  // the slim homepage trust strip near the deals
  assert.match(HOME, /We may earn a commission on eBay purchases/);
  // no invented superlatives
  assert.doesNotMatch(HOME, /best prices|guaranteed savings|lowest price guaranteed/i);
});

// ---- P0.4.1 untouched (§5) -------------------------------

test("UX-CVR-2-9. P0.4.1 diversity / rotation wiring is untouched", () => {
  // the homepage still drives its lanes through the diversity + 3h rotation
  // helpers - rotateForBucket/selectDiverseLane now run in the API route
  // that powers any non-default (filtered/paged) client fetch.
  for (const sym of ["buildHomepageLanes", "rotationBucket", "rotateForBucket", "selectDiverseLane"]) {
    assert.ok(HOME_ALL.includes(sym), `homepage no longer uses ${sym}`);
  }
  assert.match(HOME_ALL, /speciesCap: 3/); // the species soft cap on the filtered grid
  // the under-$25 route is reached from the feed's mode row (deal-first R2
  // folded the separate lane into the single feed; review fix P3: the page
  // asks the selector for only the two lanes it renders, so the folded
  // lanes no longer reserve printings - the selector contract itself is
  // unchanged for every other caller)
  assert.match(HOME, /\/deals\/under-25/);
  assert.match(HOME, /buildHomepageLanes\(homeLanesResult\?\.pools \?\? \{\}, \{ bucket, lanes: \["flagship", "grid"\] \}\)/);
});

// ---- related discovery (§15) ----------------------------

test("UX-CVR-2-10. related-discovery links are real routes", () => {
  // category page pivots
  assert.match(CATPAGE, /href="\/sets"/);
  assert.match(CATPAGE, /href="\/pokemon"/);
  assert.match(CATPAGE, /More deal categories/);
  // empty-state escapes point at real, existing routes
  assert.match(FILTERCHIPS, /href="\/"/);
  assert.match(FILTERCHIPS, /href="\/deals\/under-25"/);
  assert.match(FILTERCHIPS, /href="\/\?sort=newest"/);
});

// ---- social UTM does not alter factual content (§16, §21) -

test("UX-CVR-2-11. the homepage server render never branches on utm_* params", () => {
  assert.doesNotMatch(HOME, /searchParams[\s\S]{0,120}utm_/i);
  assert.doesNotMatch(HOME, /params\.utm_/);
});

// ---- mobile filters crawl-safe (§11, §21) ---------------

test("UX-CVR-2-12. mobile filters stay crawl-safe: rows in the DOM + nofollow'd", () => {
  // FilterToggle hides the rows with a class, it does NOT unmount them -
  // so a crawler (and a no-JS visitor) still sees every filter link.
  assert.match(FILTERTOGGLE, /\$\{open \? "mt-4 block" : "hidden"\} lg:mt-0 lg:block/);
  assert.doesNotMatch(FILTERTOGGLE, /\{open && </); // never conditionally rendered away
  // every filter / sort permutation link is rel="nofollow" (crawl hygiene)
  assert.match(FILTERBAR, /rel="nofollow"/);
});
