// audit-r1 stage 2: country landing pages, alert prefill, Recently Viewed
// click coverage, DealCard readability, the catalogue set index snapshot,
// and the verifier's featured tier. Source pins plus the allocator run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { allocateVerifyBatch, featuredCandidate, FEATURED_MIN_MARKET_PRICE, FEATURED_MAX_DISCOUNT_PCT } from "../../lib/verifyAllocator.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } = require(join(ROOT, "lib/dealCategories.js"));

test("AR1S2-1 country landing pages: one clean route per market with the local site and currency in the title, listed in the sitemap and nav, the country locked in the filter bar", () => {
  for (const [slug, mk, cur] of [["uk", "EBAY_GB", "GBP"], ["australia", "EBAY_AU", "AUD"], ["canada", "EBAY_CA", "CAD"], ["usa", "EBAY_US", "USD"]]) {
    const cat = DEAL_CATEGORIES[slug];
    assert.deepEqual(cat.filter, { country: mk }, slug);
    assert.ok(cat.title.includes(cur), `${slug} title names ${cur}`);
    assert.ok(DEAL_CATEGORY_SLUGS.includes(slug));
  }
  assert.match(read("lib/sitemap.js"), /\.\.\.DEAL_CATEGORY_SLUGS\.map\(\(s\) => \(\{\n\s*loc: `\$\{SITE_URL\}\/deals\/\$\{s\}`/);
  const nav = read("lib/navLinks.js");
  for (const h of ["/deals/uk", "/deals/australia", "/deals/canada"]) assert.ok(nav.includes(`href: "${h}"`), h);
  assert.match(read("components/DealCategoryPage.js"), /lockedCountry=\{cat\.filter\?\.country \?\? null\}/);
  const grid = read("components/DealGrid.js");
  assert.match(grid, /country=\{lockedCountry \?\? params\.country\}/);
  assert.match(grid, /lockedCountry=\{lockedCountry\}/);
  const bar = read("components/FilterBar.js");
  assert.match(bar, /lockedCountry \? null : country,/, "a locked country never counts as an active filter");
  assert.match(bar, /\{marketplaceName\(lockedCountry\) \?\? lockedCountry\} listings only/);
  // the preset still wins in the inventory query
  assert.match(read("lib/dealCategories.js"), /return \{ \.\.\.params, \.\.\.cat\.filter, \.\.\.cat\.inventory \};/);
});

test("AR1S2-2 price alerts suggest 10% under the catalogue reference when no live offer sets the price", () => {
  assert.match(read("app/cards/[slug]/page.js"), /isUsableUsdPrice\(hubRaw\) \? Math\.round\(Number\(hubRaw\) \* 0\.9 \* 100\) \/ 100 : null/);
  assert.match(read("components/CatalogCardView.js"), /suggestedPrice: isUsableUsdPrice\(refPrice\) \? Math\.round\(Number\(refPrice\) \* 0\.9 \* 100\) \/ 100 : null/);
  assert.match(read("components/CardNextSteps.js"), /suggestedPrice=\{alert\.suggestedPrice \?\? null\}/);
});

test("AR1S2-3 Recently Viewed tile clicks are instrumented and reported", () => {
  assert.match(read("components/CardMemoryStrip.js"), /data-analytics-click="recently_viewed_clicked"/);
  assert.match(read("lib/analytics/events.js"), /RECENTLY_VIEWED_CLICKED: "recently_viewed_clicked"/);
  const agg = read("scripts/reporting/aggregate.mjs");
  assert.match(agg, /recently_viewed_clicked: sum\(byEvent\(EVENTS\.RECENTLY_VIEWED_CLICKED\)\)/);
  assert.match(agg, /lane\("recently_viewed", "recently_viewed_clicked", null\)/);
  assert.doesNotMatch(agg, /NOT CURRENTLY INSTRUMENTED/);
});

test("AR1S2-4 DealCard: no 10 px text; the 11 px facts moved to 12 px", () => {
  const card = read("components/DealCard.js");
  assert.doesNotMatch(card, /text-\[10px\]/);
  assert.ok((card.match(/text-\[11px\]/g) ?? []).length <= 1, "only the freshness badge stays at 11 px");
});

test("AR1S2-5 the catalogue set index reads the precomputed snapshot first and keeps the scan as fallback", () => {
  const deals = read("lib/deals.js");
  const fn = deals.slice(deals.indexOf("async function fetchCatalogSetIndexUncached"), deals.indexOf("export const fetchCatalogSetIndex"));
  assert.match(fn, /readCatalogSnapshot\("setVocabulary"\)/);
  assert.match(fn, /sets\.sort\(\(a, b\) => b\.slug\.length - a\.slug\.length\);[\s\S]*return \{ sets, error: null \};[\s\S]*const bySet = new Map\(\);/);
});

test("AR1S2-6 verifier featured tier: a deal the premium lanes would show once verified is checked before other high-value rows, highest savings first; auctions and new listings keep precedence; a freshly verified one is not re-checked", () => {
  const NOW = Date.parse("2026-09-15T12:00:00Z");
  const iso = (h) => new Date(NOW + h * 3.6e6).toISOString();
  const bin = (o) => ({ listing_type: "FIXED_PRICE", is_active: true, card_set: "Base Set", title: "Charizard 4/102 Base Set Holo", first_seen_at: iso(-300), last_seen_at: iso(-1), exact_verified_at: iso(-30), visual_authenticity_status: "MATCH", market_price: 200, discount_pct: 0.4, ...o });
  assert.equal(FEATURED_MIN_MARKET_PRICE, 75);
  assert.equal(FEATURED_MAX_DISCOUNT_PCT, 0.65);
  // mirrors the Best Finds band in lib/deals
  const deals = read("lib/deals.js");
  assert.match(deals, /const BEST_FINDS_MIN_MARKET_PRICE = 75;/);
  assert.match(deals, /const BEST_FINDS_MAX_DISCOUNT_PCT = 0\.65;/);
  assert.equal(featuredCandidate(bin({}), NOW), true);
  assert.equal(featuredCandidate(bin({ exact_verified_at: iso(-2) }), NOW), false, "verified inside the premium window");
  assert.equal(featuredCandidate(bin({ market_price: 50 }), NOW), false, "below the band");
  assert.equal(featuredCandidate(bin({ discount_pct: 0.8 }), NOW), false, "above the band");
  assert.equal(featuredCandidate(bin({ listing_type: "AUCTION" }), NOW), false);
  assert.equal(featuredCandidate(bin({ market_price: 150, discount_pct: 0.5, visual_authenticity_status: null }), NOW), false, "high-risk band without a visual match");
  assert.equal(featuredCandidate(bin({ market_price: 150, discount_pct: 0.3, visual_authenticity_status: null }), NOW), true, "not in the high-risk band: no match needed");
  // allocation: general slots only (batch 3, no reserve headroom, no graded slots)
  const pool = [
    bin({ id: 1, market_price: 800, discount_pct: 0.8 }), // highValue, outside the band
    bin({ id: 2, discount_pct: 0.3 }), // featured
    bin({ id: 3, discount_pct: 0.5 }), // featured, bigger savings
    bin({ id: 4, first_seen_at: iso(-2), exact_verified_at: null, market_price: 50, discount_pct: 0.2 }), // justAdded
  ];
  const { batch } = allocateVerifyBatch({ pool, batch: 3, now: NOW, quotaRemaining: 5000, reserve: 800, gradedSlots: 0 });
  assert.deepEqual(batch.map((r) => r.id), [4, 3, 2], "new listing, then featured by savings, before the plain high-value row");
  // the general rank order the older suites pin is intact (justAdded > highValue > midValue)
  const src = read("lib/verifyAllocator.mjs");
  assert.match(src, /if \(isAuction\) return 0;\n\s*if \(justAdded\) return 1;\n\s*if \(featuredCandidate\(r, now\)\) return 2;[^\n]*\n\s*if \(highValue\) return 3;\n\s*if \(midValue\) return 4;\n\s*return 5;/);
});
