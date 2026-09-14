// All deals r1 - /deals browses every eligible stored listing with exact
// counts. Exercises the REAL lib/allDealsInventory build + query over the
// shared fixture inventory (tests/browser/r3/runtime/allDealsRows.js, the
// same rows the browser fixture serves): 96 distinct eligible listings over
// 4 pages, cross-marketplace copies that disagree, distinct grades,
// auctions, unknown shipping, plain listings, Japanese-catalogue listings,
// and rows that must never show (quarantined, slab-titled raw, inactive,
// stale, language-mismatched, ended auction).
// No network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const read = (p) => readFileSync(join(REPO, p), "utf8");

const inv = await imp("lib/allDealsInventory.js");
const { allDealsRows, ALL_DEALS_ELIGIBLE_LISTING_IDS, ALL_DEALS_EXCLUDED_ROW_IDS } = await imp("tests/browser/r3/runtime/allDealsRows.js");
const dq = require(join(REPO, "lib/dealQuality.js"));
const { offerShipping } = require(join(REPO, "lib/offerPresentation.js"));
const { currencyForDeal } = require(join(REPO, "lib/money.js"));

const build = (rows = allDealsRows, opts = {}) =>
  inv.ALL_DEALS_MARKETPLACES.map((m) => inv.encodeMarketplaceInventory(rows, { marketplace: m, ...opts }));
const CHUNKS = build();
const byId = new Map(allDealsRows.map((r) => [r.id, r]));

function allPages(params = {}, chunks = CHUNKS) {
  const first = inv.queryAllDeals(chunks, { ...params, page: 1 });
  const pages = [first];
  for (let p = 2; p <= first.totalPages; p++) pages.push(inv.queryAllDeals(chunks, { ...params, page: p }));
  const deals = pages.flatMap((r) => r.deals);
  return { first, pages, deals, ids: deals.map((d) => d.listing_id) };
}
const distinctListingsWhere = (pred) =>
  new Set(allDealsRows.filter((r) => ALL_DEALS_ELIGIBLE_LISTING_IDS.includes(r.listing_id) && pred(r)).map((r) => r.listing_id)).size;

test("AD-1. every eligible listing appears exactly once across all pages, and the count is exact", () => {
  const { first, pages, deals, ids } = allPages();
  assert.equal(ALL_DEALS_ELIGIBLE_LISTING_IDS.length, 96);
  assert.equal(first.totalCount, 96);
  assert.equal(first.totalPages, 4);
  assert.equal(first.exact, true);
  assert.deepEqual(pages.map((p) => p.deals.length), [24, 24, 24, 24]);
  assert.equal(deals.length, first.totalCount, "sum of tiles across pages == totalCount");
  assert.equal(new Set(ids).size, ids.length, "no listing repeats across page boundaries");
  assert.deepEqual([...ids].sort(), [...ALL_DEALS_ELIGIBLE_LISTING_IDS].sort(), "no gaps, no extras");
  for (const p of pages) assert.equal(p.totalCount, 96, "every page reports the same total");
});

test("AD-2. quarantined, slab-titled raw, inactive, stale, language-mismatched and ended rows never appear or count", () => {
  const { deals } = allPages();
  const shownRowIds = new Set(deals.map((d) => d.id));
  for (const id of ALL_DEALS_EXCLUDED_ROW_IDS) {
    assert.ok(!shownRowIds.has(id), `excluded row ${id} shown`);
    assert.ok(!ALL_DEALS_ELIGIBLE_LISTING_IDS.includes(byId.get(id).listing_id), `excluded row ${id} counted`);
  }
  // ... and nothing ineligible is even stored in the cached chunks
  const stored = new Set(CHUNKS.flatMap(inv.decodeMarketplaceInventory).map((r) => r.id));
  for (const id of ALL_DEALS_EXCLUDED_ROW_IDS) assert.ok(!stored.has(id), `excluded row ${id} cached`);
  // the two named integrity reasons are the real gate's
  assert.equal(byId.get(974001).disqualified_reason, "identity:collector_number_conflict");
  assert.equal(dq.disqualificationReason(byId.get(974002)), "identity:graded_title_on_raw");
  // every shown tile passes the real display gate
  for (const d of deals) assert.ok(dq.isDisplayableDeal(byId.get(d.id)), `row ${d.id} shown but not displayable`);
});

test("AD-3. one tile per exact eBay listing: a whole copy is chosen deterministically (home market, then preference order)", () => {
  const { deals } = allPages();
  const tile = (lid) => deals.filter((d) => d.listing_id === lid);
  const cases = [
    ["v1|3200000001|0", 971002, ["EBAY_US", "EBAY_AU"]], // item in GB -> the GB copy, though US is preferred otherwise
    ["v1|3200000002|0", 971012, ["EBAY_AU"]], // item in JP (no scanned home) -> CA before AU
    ["v1|3200000003|0", 971022, ["EBAY_DE"]], // item in US -> US
  ];
  for (const [lid, chosenId, alsoOn] of cases) {
    const t = tile(lid);
    assert.equal(t.length, 1, `${lid} must be one tile`);
    assert.equal(t[0].id, chosenId, `${lid} chose the wrong copy`);
    assert.deepEqual(t[0].also_on, alsoOn);
  }
  // copies really disagree, so a mixed tile would be detectable
  const copies = allDealsRows.filter((r) => r.listing_id === "v1|3200000001|0");
  assert.equal(new Set(copies.map((c) => c.currency)).size, 3);
  assert.equal(new Set(copies.map((c) => c.shipping)).size, 3);
  // input order never changes the choice
  const reversed = allPages({}, build([...allDealsRows].reverse())).deals;
  for (const [lid, chosenId] of cases) assert.equal(reversed.find((d) => d.listing_id === lid).id, chosenId);
  // a single-marketplace listing reports no other marketplaces
  assert.ok(deals.filter((d) => !d.listing_id.startsWith("v1|32")).every((d) => d.also_on.length === 0));
});

test("AD-4. every tile's price, currency, shipping statement and destination come from ONE stored row, and presentation is unchanged", () => {
  const { deals } = allPages();
  const COHERENT = ["price", "shipping", "total_price", "total_price_usd", "currency", "marketplace", "item_location_country", "affiliate_url", "market_price", "discount_pct", "listing_type", "auction_end_at", "grade", "grader", "condition"];
  for (const d of deals) {
    const src = byId.get(d.id);
    for (const k of COHERENT) assert.deepEqual(d[k] ?? null, src[k] ?? null, `row ${d.id} field ${k}`);
    // truthful wording: identical to rendering the full stored row
    assert.deepEqual(dq.listingPresentation(d), dq.listingPresentation(src), `presentation ${d.id}`);
    assert.deepEqual(offerShipping(d), offerShipping(src), `shipping wording ${d.id}`);
    assert.equal(currencyForDeal(d), currencyForDeal(src));
    assert.equal(dq.conditionLabel(d), dq.conditionLabel(src));
    assert.equal(dq.savingsClaimTrusted(d), dq.savingsClaimTrusted(src));
  }
  // the fixture really spans the neutral and unknown-shipping states
  assert.ok(deals.some((d) => !dq.savingsClaimTrusted(d)), "plain listings present");
  assert.ok(deals.some((d) => offerShipping(d).state === "unconfirmed"), "shipping 0 present");
  assert.ok(deals.some((d) => offerShipping(d).state === "unknown"), "no shipping breakdown present");
});

test("AD-5. distinct grades of the same card stay separate listings, and grading filters count exactly", () => {
  const all = allPages().deals.filter((d) => d.card_name === "Charizard");
  assert.deepEqual(all.map((d) => `${d.grader} ${d.grade}`).sort(), ["CGC 9", "PSA 10", "PSA 9"]);
  const count = (p) => inv.queryAllDeals(CHUNKS, p).totalCount;
  assert.equal(count({ cardType: "graded" }), 3);
  assert.equal(count({ cardType: "raw" }), 93);
  assert.equal(count({ grader: "PSA" }), 2);
  assert.equal(count({ grader: "PSA", grade: "10" }), 1);
  assert.equal(count({ grade: "9" }), 2);
  assert.equal(count({ cardType: "raw", grader: "CGC" }), 1, "a grader implies graded (planDealFilters)");
});

test("AD-6. marketplace scope counts a multi-marketplace listing once in each of its marketplaces", () => {
  let sum = 0;
  for (const m of inv.ALL_DEALS_MARKETPLACES) {
    const { first, ids } = allPages({ country: m });
    assert.equal(first.totalCount, distinctListingsWhere((r) => r.marketplace === m), m);
    assert.equal(ids.length, first.totalCount, `${m} pages sum to total`);
    assert.equal(first.country, m);
    assert.ok(first.exact);
    sum += first.totalCount;
  }
  assert.equal(sum, 96 + 2 + 1 + 1, "3-copy listing adds 2, the two 2-copy listings add 1 each");
  // an invalid country is ignored, not an empty result
  assert.equal(inv.queryAllDeals(CHUNKS, { country: "EBAY_XX" }).totalCount, 96);
  // scoped to AU, the AU copy of the GB-home listing is the one shown
  assert.equal(allPages({ country: "EBAY_AU" }).deals.find((d) => d.listing_id === "v1|3200000001|0").id, 971003);
});

test("AD-7. buying format, price and search filters count exactly across pages", () => {
  const check = (params, expected) => {
    const { first, ids } = allPages(params);
    assert.equal(first.totalCount, expected, JSON.stringify(params));
    assert.equal(ids.length, expected);
    assert.equal(new Set(ids).size, expected);
  };
  check({ listingType: "AUCTION" }, 4);
  check({ listingType: "BIN" }, 92);
  check({ listingType: "FIXED_PRICE" }, 92);
  const { deals } = allPages();
  check({ maxPrice: 50 }, deals.filter((d) => d.total_price_usd <= 50).length);
  check({ minPrice: 500 }, deals.filter((d) => d.total_price_usd >= 500).length);
  check({ q: "zekrom" }, 14);
  check({ q: "ZEKROM" }, 14);
  check({ q: "z" }, 96); // under 2 characters: ignored, never a silent partial match
  check({ q: "no such card" }, 0);
  check({ q: "charizard", cardType: "graded", country: "EBAY_US" }, 2);
});

test("AD-8. sorts change order only: same identities and count, deterministic, ordered across page boundaries", () => {
  const base = allPages().ids.sort();
  for (const sort of ["newest", "discount", "price_asc", "price_desc", "ending"]) {
    const a = allPages({ sort });
    const b = allPages({ sort });
    assert.equal(a.first.totalCount, 96, sort);
    assert.deepEqual([...a.ids].sort(), base, `${sort} identities`);
    assert.deepEqual(a.ids, b.ids, `${sort} deterministic`);
  }
  const asc = allPages({ sort: "price_asc" }).deals.map((d) => d.total_price_usd);
  assert.deepEqual(asc, [...asc].sort((x, y) => x - y));
  const newest = allPages({ sort: "newest" }).deals.map((d) => Date.parse(d.first_seen_at));
  assert.deepEqual(newest, [...newest].sort((x, y) => y - x));
  // discount: every trusted saving ranks before any plain listing
  const disc = allPages({ sort: "discount" }).deals;
  const firstPlain = disc.findIndex((d) => !dq.savingsClaimTrusted(d));
  assert.ok(firstPlain > 0 && disc.slice(firstPlain).every((d) => !dq.savingsClaimTrusted(d) || !(Number(d.discount_pct) > 0)));
  // ending: live auctions first, soonest end first
  const ending = allPages({ sort: "ending" }).deals;
  assert.deepEqual(ending.slice(0, 4).map((d) => d.listing_type), ["AUCTION", "AUCTION", "AUCTION", "AUCTION"]);
  const ends = ending.slice(0, 4).map((d) => Date.parse(d.auction_end_at));
  assert.deepEqual(ends, [...ends].sort((x, y) => x - y));
  // an unknown sort falls back to newest rather than erroring
  assert.equal(inv.queryAllDeals(CHUNKS, { sort: "bogus" }).sort, "newest");
});

test("AD-9. out-of-range and malformed pages", () => {
  const past = inv.queryAllDeals(CHUNKS, { page: 5 });
  assert.equal(past.outOfRange, true);
  assert.deepEqual(past.deals, []);
  assert.equal(past.totalCount, 96);
  assert.equal(past.totalPages, 4);
  for (const page of [0, -3, "abc", undefined]) assert.equal(inv.queryAllDeals(CHUNKS, { page }).page, 1);
  const empty = inv.queryAllDeals(CHUNKS, { q: "no such card", page: 3 });
  assert.equal(empty.outOfRange, false, "an empty result is an empty state, not out of range");
  assert.equal(empty.totalPages, 1);
});

test("AD-10. resource limits are never silent: an incomplete or missing marketplace makes the count a lower bound", () => {
  const over = Array.from({ length: inv.MAX_ELIGIBLE_ROWS_PER_MARKETPLACE + 5 }, (_, i) => ({
    ...byId.get(970000),
    id: 990000 + i,
    listing_id: `v1|39${String(i).padStart(8, "0")}|0`,
    affiliate_url: `https://www.ebay.com/itm/39${String(i).padStart(8, "0")}`,
    listing_url: `https://www.ebay.com/itm/39${String(i).padStart(8, "0")}`,
  }));
  const capped = inv.encodeMarketplaceInventory(over, { marketplace: "EBAY_US" });
  assert.equal(capped.rows.length, inv.MAX_ELIGIBLE_ROWS_PER_MARKETPLACE);
  assert.equal(capped.eligibleCount, inv.MAX_ELIGIBLE_ROWS_PER_MARKETPLACE + 5);
  assert.equal(capped.complete, false);
  assert.equal(inv.queryAllDeals([capped, ...CHUNKS.slice(1)], {}).exact, false);

  const readLimited = inv.encodeMarketplaceInventory(allDealsRows, { marketplace: "EBAY_GB", readLimitHit: true });
  assert.equal(readLimited.complete, false);
  assert.equal(inv.queryAllDeals([CHUNKS[0], readLimited, ...CHUNKS.slice(2)], {}).exact, false);
  // a scoped view is exact when ITS marketplace is complete
  assert.equal(inv.queryAllDeals([CHUNKS[0], readLimited, ...CHUNKS.slice(2)], { country: "EBAY_US" }).exact, true);
  assert.equal(inv.queryAllDeals(CHUNKS.slice(1), {}).exact, false, "a missing marketplace chunk");
  assert.equal(inv.MAX_ACTIVE_ROWS_READ_PER_MARKETPLACE, 2500);
});

test("AD-11. time-dependent gates are re-applied at request time, after the cache was built", () => {
  const liveAuction = byId.get(973002); // the soonest-ending fixture auction
  const later = Date.parse(liveAuction.auction_end_at) + 60_000;
  const r = inv.queryAllDeals(CHUNKS, { listingType: "AUCTION" }, { now: later });
  assert.ok(!r.deals.some((d) => d.id === 973002), "an auction that ended since the build is dropped");
  assert.equal(r.totalCount, 3, "and not counted");
  const muchLater = Date.now() + 90 * 24 * 3600 * 1000;
  assert.equal(inv.queryAllDeals(CHUNKS, {}, { now: muchLater }).totalCount, 0, "rows past their freshness TTL drop out");
});

test("AD-12. the compact cache entry stays inside the data-cache budget at the documented cap", () => {
  // 897 B was the largest encoded production row (2026-09-14); the cap
  // keeps one marketplace entry under the repo's 1.6 MB headroom target.
  assert.ok(inv.MAX_ELIGIBLE_ROWS_PER_MARKETPLACE * 897 <= 1.6 * 1024 * 1024);
  const bytes = Buffer.byteLength(JSON.stringify(CHUNKS[0]));
  assert.ok(bytes / CHUNKS[0].rows.length < 1024, `fixture row ${Math.round(bytes / CHUNKS[0].rows.length)} B`);
});

// ---- wiring (source pins) --------------------------------------------------

test("AD-13. /deals is the All deals page: canonical unchanged, no region redirect, same grid, no provider call", () => {
  const page = read("app/deals/page.js");
  assert.match(page, /alternates: \{ canonical: "\/deals" \}/);
  assert.match(page, /export const revalidate = 600;/);
  assert.doesNotMatch(page.replace(/\/\/[^\n]*/g, ""), /RegionRedirect/, "an all-marketplaces default must not be rewritten to the visitor's region");
  assert.match(page, /fetchAllDealsPage\(\{ sort: "newest", page: 1 \}\)/);
  assert.match(page, /<DealGrid\s+kind="all"\s+basePath="\/deals"/);
  assert.match(page, />\s*All deals\s*</);
  assert.doesNotMatch(page.replace(/\/\/[^\n]*/g, ""), /searchParams|robots:/, "the clean page reads no request params and keeps default indexing");
  for (const slug of ["/japanese-cards", "/sealed-deals"]) assert.ok(page.includes(`href="${slug}"`));
  assert.match(page, /DEAL_CATEGORY_SLUGS\.map/);
  // no second browse-all route
  assert.doesNotMatch(read("lib/dealCategories.js"), /\ball:\s*\{|"all":\s*\{/);
});

test("AD-14. loader, API and grid wiring", () => {
  const deals = read("lib/deals.js");
  assert.match(deals, /unstable_cache\(fetchAllDealsMarketplaceUncached, \["all-deals-inventory-v2"\], \{\s*revalidate: POOL_REVALIDATE_SECONDS/);
  const reader = deals.slice(deals.indexOf("async function fetchAllDealsMarketplaceUncached"), deals.indexOf("export const fetchAllDealsMarketplace"));
  assert.match(reader, /\.eq\("is_active", true\)\s*\.eq\("marketplace", marketplace\)/);
  assert.doesNotMatch(reader.replace(/\/\/[^\n]*/g, ""), /language/, "no language pre-filter: every card language reaches the real display gate");
  const route = read("app/api/deals-page/route.js");
  assert.match(route, /kind === "all"/);
  for (const k of ["grader: gradedFilters.grader", "grade: gradedFilters.grade", 'q: u.searchParams.get("q")', "country: filters.country"]) assert.ok(route.includes(k), k);
  const grid = read("components/DealGrid.js");
  assert.match(grid, /const guardColdNav = allDeals \|\|/);
  assert.match(grid, /const searchable = allDeals \|\|/);
  assert.match(grid, /if \(slug\) q\.set\("slug", slug\);/);
  assert.match(grid, /exact \? "" : "at least "/, "a lower bound is labelled");
  assert.match(grid, /pageName=\{allDeals \? "deals_index"/, "existing /deals affiliate surface kept");
  const bar = read("components/FilterBar.js");
  assert.match(bar, /All marketplaces/);
  assert.match(bar, /withoutParams\(params, \["country"\], basePath\)/);
  const card = read("components/DealCard.js");
  assert.match(card, /Array\.isArray\(deal\.also_on\)/);
  assert.match(card, /"Price shown from" : "Listed on"/);
  // homepage stays curated: it does not use the all-deals inventory
  assert.doesNotMatch(read("app/page.js"), /fetchAllDeals|allDealsInventory/);
  // the pure module does no I/O
  assert.doesNotMatch(read("lib/allDealsInventory.js"), /supabase|fetch\(|from "@\/lib\/ebay"|next\/cache/);
});

test("AD-15. navigation: All deals is the prominent Deals entry and category pages link to it", () => {
  const { NAV_PRIMARY } = require(join(REPO, "lib/navLinks.js"));
  const first = NAV_PRIMARY.find((e) => e.group === "deals");
  assert.deepEqual({ href: first.href, label: first.label, menuShortcut: first.menuShortcut }, { href: "/deals", label: "All deals", menuShortcut: true });
  const cat = read("components/DealCategoryPage.js");
  assert.match(cat, /\{ name: "All deals", href: "\/deals" \}/);
  assert.match(cat, /name: "All deals", item: `\$\{SITE_URL\}\/deals`/);
  assert.match(cat, /href="\/deals"[\s\S]{0,400}All deals\s*<\/Link>/);
});

// ---- acceptance review (2026-09-14) ---------------------------------------

test("AD-16. Japanese-catalogue inventory is included under the same display gate, with its own identity and reference", () => {
  const { deals } = allPages();
  const jp = deals.filter((d) => d.card_language === "japanese");
  assert.deepEqual(jp.map((d) => d.id).sort(), [975001, 975002]);
  for (const d of jp) {
    assert.equal(d.watchlist.language, "japanese", "decoded identity keeps the catalogue language (DealCard labels it Japanese)");
    assert.ok(dq.isDisplayableDeal(byId.get(d.id)));
  }
  // the gate's identity/language protection still applies: a Japanese
  // identity on a listing that states English is hidden and not counted
  assert.equal(dq.isDisplayableDeal(byId.get(974005)), false);
  assert.ok(!deals.some((d) => d.id === 974005));
  // no language pre-filter in the pure module either
  assert.doesNotMatch(read("lib/allDealsInventory.js").replace(/\/\/[^\n]*/g, ""), /card_language\s*[!=]==|language\s*===\s*"english"/);
  assert.match(read("app/deals/page.js"), /English and Japanese/);
});

test("AD-17. selecting a marketplace includes every listing stored there, shown from that marketplace's own coherent copy", () => {
  const COHERENT = ["price", "shipping", "total_price", "total_price_usd", "currency", "marketplace", "item_location_country", "affiliate_url", "market_price", "discount_pct"];
  // v1|3200000001|0 is stored on US, GB and AU; its All-marketplaces tile is the GB (home) copy
  assert.equal(allPages().deals.find((d) => d.listing_id === "v1|3200000001|0").id, 971002);
  for (const [country, rowId, currency] of [["EBAY_AU", 971003, "AUD"], ["EBAY_US", 971001, "USD"], ["EBAY_GB", 971002, "GBP"]]) {
    const { deals, first } = allPages({ country });
    const tiles = deals.filter((d) => d.listing_id === "v1|3200000001|0");
    assert.equal(tiles.length, 1, `${country}: listing included once`);
    assert.equal(tiles[0].id, rowId, `${country}: that marketplace's copy is the one shown`);
    assert.equal(tiles[0].currency, currency);
    for (const k of COHERENT) assert.deepEqual(tiles[0][k] ?? null, byId.get(rowId)[k] ?? null, `${country} ${k}`);
    assert.deepEqual(tiles[0].also_on, [], "scoped: no other marketplace's copy is mixed in");
    assert.ok(deals.every((d) => d.marketplace === country), `${country}: every tile is that marketplace's copy`);
    assert.equal(first.totalCount, distinctListingsWhere((r) => r.marketplace === country));
  }
  // the JP-located listing whose All-marketplaces tile is the CA copy is still included under AU, as its AU copy
  assert.equal(allPages().deals.find((d) => d.listing_id === "v1|3200000002|0").id, 971012);
  assert.equal(allPages({ country: "EBAY_AU" }).deals.find((d) => d.listing_id === "v1|3200000002|0").id, 971011);
  // label: DealCard names the copy shown ("Listed on eBay Australia" when no other copy is in scope)
  assert.match(read("components/DealCard.js"), /"Price shown from" : "Listed on"\} eBay \{marketInfo\.label\}/);
});

test("AD-18. an incomplete inventory is reported on every result built from it, including small, empty and out-of-range results", () => {
  const readLimited = inv.encodeMarketplaceInventory(allDealsRows, { marketplace: "EBAY_GB", readLimitHit: true });
  const capped = [CHUNKS[0], readLimited, ...CHUNKS.slice(2)];
  const small = inv.queryAllDeals(capped, { grader: "PSA", grade: "10" });
  assert.equal(small.totalCount, 1);
  assert.equal(small.exact, false, "a 1-listing filtered result from an incomplete inventory is not exact");
  const empty = inv.queryAllDeals(capped, { q: "no such card" });
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.exact, false);
  const past = inv.queryAllDeals(capped, { page: 99 });
  assert.equal(past.outOfRange, true);
  assert.equal(past.exact, false);
  // the eligible-row cap marks a chunk incomplete the same way
  const overCapChunk = { ...CHUNKS[3], complete: false, limits: { readLimitHit: false, overCap: true } };
  assert.equal(inv.queryAllDeals([...CHUNKS.slice(0, 3), overCapChunk, ...CHUNKS.slice(4)], { listingType: "AUCTION" }).exact, false);
  // UI: the summary renders whenever the result is inexact, even with no tiles
  const grid = read("components/DealGrid.js");
  assert.match(grid, /allDeals && !loading && !view\.error && \(view\.deals\.length > 0 \|\| !view\.exact\) && \(/);
  assert.match(grid, /\{!exact && \(\s*<p data-inventory-incomplete/);
  assert.match(grid, /exact \? "" : "at least "/);
});

test("AD-19. /deals variants are noindex,follow at the server; the clean page is not", async () => {
  const cfg = (await import(pathToFileURL(join(REPO, "next.config.mjs")).href)).default;
  const rules = await cfg.headers();
  const keys = rules.filter((r) => r.source === "/deals").map((r) => {
    assert.deepEqual(r.headers, [{ key: "X-Robots-Tag", value: "noindex, follow" }]);
    assert.equal(r.has.length, 1);
    assert.equal(r.has[0].type, "query");
    assert.equal(r.has[0].value, undefined, "any non-empty value matches (an empty param renders the clean default page)");
    return r.has[0].key;
  });
  // every browse param DealGrid, FilterBar, Pagination and the search form use
  assert.deepEqual(keys.sort(), ["country", "grade", "grader", "listing", "maxPrice", "minPrice", "page", "q", "sort", "type"]);
  assert.ok(rules.every((r) => r.has?.length), "no unconditional rule: the clean /deals stays indexable");
  const grid = read("components/DealGrid.js");
  for (const k of keys) assert.ok(grid.includes(`'${k}'`), `cold-navigation guard also treats ${k} as a variant`);
});
