// Marketplace broadening r1 - "All marketplaces" as an explicit, persistent
// choice (?country=all) and a "Browse all marketplaces" action on scoped
// results. The additional-listings count is exercised against the REAL
// lib/allDealsInventory over the shared all-deals fixture (cross-marketplace
// copies, identity conflicts, grades, search). No network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const read = (p) => readFileSync(join(REPO, p), "utf8");
// Homepage-caching r1 moved the country-scoping/MarketplaceScopeNote
// markup out of app/page.js into components/HomeFeed.js - reading a path
// through this instead of plain read() keeps checking real homepage
// content regardless of which of the two files it now lives in.
const readPage = (p) =>
  p === "app/page.js" ? read(p).replace(/<HomeFeed[\s\S]*?\/>/, () => read("components/HomeFeed.js")) : read(p);

const scope = await imp("lib/marketplaceScope.js");
const { relaxationSteps } = await imp("lib/dealFilters.js");
const inv = await imp("lib/allDealsInventory.js");
const { allDealsRows } = await imp("tests/browser/r3/runtime/allDealsRows.js");

const build = (rows = allDealsRows, opts = {}) =>
  inv.ALL_DEALS_MARKETPLACES.map((m) => inv.encodeMarketplaceInventory(rows, { marketplace: m, ...opts }));
const CHUNKS = build();
const all = (params, chunks = CHUNKS) => inv.queryAllDeals(chunks, params, { pageSize: 100000 });
const grid0 = () => read("components/DealGrid.js");
const ids = (r) => new Set(r.deals.map((d) => d.listing_id));
const marketsOf = new Map();
for (const r of allDealsRows) (marketsOf.get(r.listing_id) ?? marketsOf.set(r.listing_id, new Set()).get(r.listing_id)).add(r.marketplace);

test("MB-1. scope helpers: all is explicit, loaders get null, hrefs keep filters and reset the page", () => {
  assert.equal(scope.isAllMarketplaces("all"), true);
  assert.equal(scope.isAllMarketplaces("ALL"), true);
  assert.equal(scope.isAllMarketplaces(""), false);
  assert.equal(scope.isAllMarketplaces(null), false);
  assert.equal(scope.marketplaceFilterValue("all"), null);
  assert.equal(scope.marketplaceFilterValue(null), null);
  assert.equal(scope.marketplaceFilterValue(""), null);
  assert.equal(scope.marketplaceFilterValue("EBAY_DE"), "EBAY_DE", "a marketplace passes through unchanged");
  assert.equal(scope.selectedMarketplace("EBAY_GB"), "EBAY_GB");
  assert.equal(scope.selectedMarketplace("all"), null);
  assert.equal(scope.selectedMarketplace("EBAY_ZZ"), null);
  assert.equal(scope.marketplaceName("EBAY_DE"), "eBay Germany");
  assert.equal(scope.MARKETPLACE_COUNT, 6);

  const href = scope.allMarketplacesHref(
    { country: "EBAY_DE", type: "graded", grader: "PSA", grade: "10", listing: "FIXED_PRICE", minPrice: "50", maxPrice: "500", q: "charizard", sort: "discount", page: "3" },
    "/deals/graded",
  );
  const u = new URL(href, "https://x.test");
  assert.equal(u.pathname, "/deals/graded");
  assert.equal(u.searchParams.get("country"), "all");
  assert.equal(u.searchParams.has("page"), false, "pagination resets");
  for (const [k, v] of Object.entries({ type: "graded", grader: "PSA", grade: "10", listing: "FIXED_PRICE", minPrice: "50", maxPrice: "500", q: "charizard", sort: "discount" }))
    assert.equal(u.searchParams.get(k), v, `${k} preserved`);
  // /deals already defaults to every marketplace: the clean URL, no duplicate variant
  assert.equal(scope.allMarketplacesHref({ country: "EBAY_US", page: "2" }, "/deals", { defaultIsAll: true }), "/deals");
  assert.equal(scope.allMarketplacesHref({ country: "EBAY_US", type: "graded" }, "/deals", { defaultIsAll: true }), "/deals?type=graded");
  assert.match(scope.DELIVERY_NOT_CONFIRMED, /doesn't mean it delivers to you/);
  assert.doesNotMatch(scope.DELIVERY_NOT_CONFIRMED, /ships to you|delivers worldwide|confirmed delivery/i);
});

test("MB-2. relaxation: Browse all marketplaces comes first, keeps every filter, and only when one marketplace is selected", () => {
  const raw = { type: "graded", grader: "PSA", grade: "10", listing: "AUCTION", maxPrice: "100" };
  const scoped = relaxationSteps({ ...raw, country: "EBAY_IT" });
  assert.deepEqual(scoped[0], { label: "Browse all marketplaces", drop: [], set: { country: "all" } });
  assert.equal(scoped.at(-1).label, "Clear all filters");
  assert.ok(scoped.findIndex((s) => s.set) < scoped.findIndex((s) => s.label === "Clear all filters"));
  // unchanged for every existing caller
  assert.deepEqual(relaxationSteps(raw), relaxationSteps({ ...raw, country: "all" }));
  assert.deepEqual(relaxationSteps(raw), relaxationSteps({ ...raw, country: "EBAY_ZZZ" }));
  assert.ok(!relaxationSteps(raw).some((s) => s.set));
  // the empty state applies `set` and still resets ?page
  const chips = read("components/DealFilterChips.js");
  assert.match(chips, /for \(const \[k, v\] of Object\.entries\(setParams \?\? \{\}\)\) params\.set\(k, v\);/);
  assert.match(chips, /s\.set\?\.country === "all"\s*\? allMarketplacesHref\(params, basePath, \{ defaultIsAll: allByDefault \}\)\s*: hrefWithout\(params, s\.drop, basePath, s\.set\)/);
  assert.match(read("components/DealGrid.js"), /<FilteredEmptyState[\s\S]{0,300}allByDefault=\{allDeals\}/);
  assert.match(read("components/DealGrid.js"), /<EmptyGridState [^>]*allByDefault=\{allDeals\}/);
  assert.match(chips, /country: params\.country,\s*\}\);/, "the page's country reaches relaxationSteps");
});

test("MB-3. additional count is exact: the all-marketplaces result minus listings already visible, same filters and identities", () => {
  const world = all({});
  assert.equal(world.additionalOnOtherMarketplaces, null, "no count when nothing is scoped");
  const paramSets = [{}, { cardType: "graded" }, { cardType: "raw" }, { cardType: "graded", grader: "PSA" }, { listingType: "AUCTION" }, { maxPrice: 50 }, { q: "char" }];
  let crossListedSeen = 0;
  for (const params of paramSets) {
    const destination = ids(all(params));
    for (const m of inv.ALL_DEALS_MARKETPLACES) {
      const r = all({ ...params, country: m });
      const visible = ids(r);
      for (const id of visible) assert.ok(destination.has(id), `${m} ${JSON.stringify(params)}: visible listing ${id} missing from destination`);
      const expected = [...destination].filter((id) => !visible.has(id)).length;
      assert.equal(r.additionalOnOtherMarketplaces, expected, `${m} ${JSON.stringify(params)}`);
      assert.equal(r.additionalOnOtherMarketplaces, all(params).totalCount - r.totalCount);
      // a listing copied onto this marketplace AND another is visible here, so never counted as additional
      crossListedSeen += [...visible].filter((id) => (marketsOf.get(id)?.size ?? 0) > 1).length;
    }
  }
  assert.ok(crossListedSeen > 0, "fixture exercises cross-marketplace copies");
});

test("MB-4. no count when inventory is incomplete or a marketplace is missing", () => {
  const capped = inv.ALL_DEALS_MARKETPLACES.map((m, i) => inv.encodeMarketplaceInventory(allDealsRows, { marketplace: m, readLimitHit: i === 4 }));
  const r = all({ country: "EBAY_US" }, capped);
  assert.equal(r.exact, true, "the US view itself is still exact");
  assert.equal(r.additionalOnOtherMarketplaces, null, "but the other side is a lower bound -> no number");
  assert.equal(all({ country: "EBAY_US" }, CHUNKS.slice(0, 5)).additionalOnOtherMarketplaces, null);
  // the grid only ever shows the number for the exact all-deals inventory
  // (/deals, or an inventory category served from it - graded-inventory-r1)
  const grid = read("components/DealGrid.js");
  assert.match(grid, /additional=\{exactInventory && view\.exact \? view\.additional : null\}/);
  assert.match(grid, /const exactInventory = allDeals \|\| \(kind === "category" && inventoryCategory\);/);
  assert.match(grid, /typeof d\.additionalOnOtherMarketplaces === "number" \? d\.additionalOnOtherMarketplaces : null/);
  // legacy loaders never return it
  assert.doesNotMatch(read("lib/deals.js"), /additionalOnOtherMarketplaces/);
});

test("MB-5. country=all reaches every loader as no marketplace filter", () => {
  const route = read("app/api/deals-page/route.js");
  assert.match(route, /country: marketplaceFilterValue\(u\.searchParams\.get\("country"\)\)/);
  for (const p of ["app/best-finds/page.js", "app/japanese-cards/page.js"]) {
    const src = read(p);
    assert.match(src, /const country = marketplaceFilterValue\(countryChoice\)/, p);
  }
  // Homepage-caching r1: app/page.js no longer resolves country itself -
  // it only ever renders the country: null default. HomeFeed forwards the
  // raw ?country= value to /api/deals-page (like components/DealGrid.js
  // does for every other page that route serves), which resolves it via
  // the SAME marketplaceFilterValue() checked above.
  assert.match(read("app/page.js"), /fetchHomepageLanes\(\{ country: null \}\)/);
  const homeFeed = read("components/HomeFeed.js");
  assert.match(homeFeed, /if \(params\.country\) q\.set\("country", params\.country\);/);
  assert.doesNotMatch(homeFeed, /marketplaceFilterValue/, "resolution belongs in the API route, not the client");
  for (const p of ["components/CardDealFilters.js", "app/search/SearchClient.js"]) {
    assert.match(read(p), /const country = isAllMarketplaces\(sp\.get\("country"\)\) \? "" : sp\.get\("country"\) \?\? "";/, p);
  }
});

test("MB-6. explicit URL choice wins over stored preference and geo-detection; the choice persists", () => {
  const redirect = read("components/RegionRedirect.js");
  assert.match(redirect, /if \(searchParams\.has\("country"\)\) return;/, "any explicit ?country (incl. all) is never redirected");
  const control = read("components/RegionControl.js");
  const eff = control.slice(control.indexOf("function readEffectiveRegion"), control.indexOf("function rememberMarketplaceChoice"));
  assert.ok(eff.indexOf("fromUrl") < eff.indexOf("readStoredRegion()"), "RegionControl reads the URL before storage");
  assert.match(eff, /fromUrl\.toLowerCase\(\) === "all"\) return "";/);
  assert.match(control, /url\.searchParams\.set\("country", code \|\| "all"\);/, "menu All marketplaces is explicit on the URL");
  assert.match(control, /window\.localStorage\.setItem\(REGION_KEY, code\);/);
  assert.match(control, /closest\?\.\("\[data-marketplace-choice\]"\)/);
  const hook = read("lib/useRegion.js");
  const snap = hook.slice(hook.indexOf("function snapshot"), hook.indexOf("const serverSnapshot"));
  assert.ok(snap.indexOf("fromUrl") < snap.indexOf("localStorage"), "useRegion reads the URL before storage");
  // back link returns to the same explicit choice
  assert.match(read("components/DealBackLink.js"), /KNOWN_COUNTRY\.has\(rawCountry\) \|\| rawCountry === "all"/);
});

test("MB-7. visible controls: All marketplaces pill everywhere, scope note, broaden in empty states", () => {
  const bar = read("components/FilterBar.js");
  const row = bar.slice(bar.indexOf("export function CountryFilterRow"), bar.indexOf("export function ListingTypeFilterRow"));
  assert.doesNotMatch(row, /\{allOption && \(/, "no longer gated to /deals");
  assert.match(row, /data-marketplace-choice="all"/);
  assert.match(row, /not where it ships or where the seller is/);
  assert.match(bar, /\{\.\.\.rest\}\s*href=\{href\}/);
  const chips = read("components/DealFilterChips.js");
  const note = read("components/MarketplaceScopeNote.js");
  assert.match(note, /^"use client";/);
  assert.match(note, /Showing listings on \{marketplaceName\(code\)\} only/);
  assert.match(note, /effectiveMarketplaceScope\(\{/);
  assert.match(grid0(), /pinned=\{!allDeals\}/);
  assert.match(chips, /export function EmptyGridState\(\{ label, params, basePath, allByDefault = false \}\)/);
  const grid = read("components/DealGrid.js");
  assert.match(grid, /<EmptyGridState label=\{emptyLabel\} params=\{params\.obj\} basePath=\{basePath\} allByDefault=\{allDeals\} \/>/);
  for (const p of ["app/page.js", "app/best-finds/page.js", "app/japanese-cards/page.js"]) assert.match(readPage(p), /<MarketplaceScopeNote /, p);
});

test("MB-8. wording: the header control names the marketplace, not shipping", () => {
  const control = read("components/RegionControl.js");
  const code = control.replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /Shipping to|shipping from|All countries/);
  assert.match(code, /Show listings on/);
  const ctx = read("components/ShoppingContext.js").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(ctx, /Shipping to|All countries/);
});

test("MB-9. attribution and indexing unchanged", () => {
  const card = read("components/DealCard.js");
  assert.match(card, /wrapEbayAffiliateUrl\(deal\.affiliate_url, \{ surface: surfaceForPageName\(pageName\) \}\)/);
  // new links are internal, nofollow query links
  const note = read("components/MarketplaceScopeNote.js");
  assert.match(note, /rel="nofollow"/);
  assert.doesNotMatch(note, /ebay\.|affiliate/i);
  // /deals variants stay noindex (country covered); other pages keep static canonicals
  assert.match(read("next.config.mjs"), /"country"/);
  assert.match(read("components/DealCategoryPage.js"), /const canonical = `\/deals\/\$\{slug\}`;/);
  assert.match(read("app/best-finds/page.js"), /alternates: \{ canonical: "\/best-finds" \}/);
});

test("MB-10. effective scope: the delivery note follows what the page actually shows", () => {
  const e = scope.effectiveMarketplaceScope;
  // explicit URL choices, whatever is stored
  assert.deepEqual(e({ urlCountry: "EBAY_DE", pinned: true, stored: "" }), { kind: "one", code: "EBAY_DE" });
  assert.deepEqual(e({ urlCountry: "all", pinned: true, stored: "EBAY_DE" }), { kind: "all" });
  // saved All marketplaces on a pinned URL without country -> worldwide results, note shown
  assert.deepEqual(e({ urlCountry: null, pinned: true, stored: "" }), { kind: "all" });
  assert.deepEqual(e({ urlCountry: undefined, pinned: true, stored: "", geoResolved: true, detected: "EBAY_US" }), { kind: "all" }, "saved All beats geo");
  // saved single marketplace or a geo default: RegionRedirect is about to scope -> no note
  assert.deepEqual(e({ urlCountry: null, pinned: true, stored: "EBAY_DE" }), { kind: "pending" });
  assert.deepEqual(e({ urlCountry: null, pinned: true, stored: null, geoResolved: true, detected: "EBAY_GB" }), { kind: "pending" });
  assert.deepEqual(e({ urlCountry: null, pinned: true, stored: null, geoResolved: false }), { kind: "pending" });
  // no choice and no detected marketplace: stays worldwide
  assert.deepEqual(e({ urlCountry: null, pinned: true, stored: null, geoResolved: true, detected: null }), { kind: "all" });
  // server render cannot see storage
  assert.deepEqual(e({ urlCountry: null, pinned: true, stored: undefined }), { kind: "pending" });
  // /deals is never pinned: no country = every marketplace, even with a saved single marketplace
  assert.deepEqual(e({ urlCountry: null, pinned: false, stored: "EBAY_DE" }), { kind: "all" });
  // junk on the URL is not claimed as worldwide on a pinned page
  assert.deepEqual(e({ urlCountry: "EBAY_ZZ", pinned: true, stored: "" }), { kind: "pending" });
  // RegionRedirect applies exactly the rule the scope mirrors
  const redirect = read("components/RegionRedirect.js");
  assert.match(redirect, /if \(stored === null && !detected\) return;\s*const target = stored === null \? detected : stored;\s*if \(!target\) return;/);
  // the /deals broadening link is the clean URL: filters kept, no country, so a saved single marketplace is not restored (no RegionRedirect there)
  assert.equal(scope.allMarketplacesHref({ country: "EBAY_DE", type: "graded", grader: "PSA", q: "char", page: "2" }, "/deals", { defaultIsAll: true }), "/deals?type=graded&grader=PSA&q=char");
  assert.doesNotMatch(read("app/deals/page.js").replace(/\/\/[^\n]*/g, ""), /RegionRedirect/);
});
