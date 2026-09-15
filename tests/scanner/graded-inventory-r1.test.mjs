// graded-inventory-r1 - /deals/graded counts and paginates the All deals
// inventory. Compares the graded page's query (categoryInventoryParams over
// the real lib/allDealsInventory) with the equivalent All deals filter
// (/deals?type=graded) over ONE fixture snapshot (gradedInventoryRows.js).
// The only intended differences are the page's retained behaviour:
//   English-catalogue cards only; local listings first within a selected
//   marketplace; savings / ending-soon sorts list only the rows they rank.
// No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");
const inv = await import(pathToFileURL(join(REPO, "lib/allDealsInventory.js")).href);
const { DEAL_CATEGORIES, categoryInventoryParams } = require(join(REPO, "lib/dealCategories.js"));
const dq = require(join(REPO, "lib/dealQuality.js"));
const { gradedInventorySnapshot, GRADED_EXTRA_EXCLUDED_ROW_IDS } = await import(pathToFileURL(join(REPO, "tests/browser/r3/runtime/gradedInventoryRows.js")).href);

const NOW = Date.now();
const build = (rows = gradedInventorySnapshot, opts = () => ({})) =>
  inv.ALL_DEALS_MARKETPLACES.map((m, i) => inv.encodeMarketplaceInventory(rows, { marketplace: m, ...opts(m, i) }));
const CHUNKS = build();
const GRADED = DEAL_CATEGORIES.graded;

function pages(params, chunks = CHUNKS) {
  const first = inv.queryAllDeals(chunks, { ...params, page: 1 }, { now: NOW });
  const all = [first];
  for (let p = 2; p <= first.totalPages; p++) all.push(inv.queryAllDeals(chunks, { ...params, page: p }, { now: NOW }));
  const deals = all.flatMap((r) => r.deals);
  return { first, all, deals, ids: deals.map((d) => d.listing_id) };
}
const gradedPage = (user = {}, chunks) => pages(categoryInventoryParams(GRADED, user), chunks);
const allDealsGraded = (user = {}, chunks) => pages({ ...user, cardType: "graded" }, chunks);
const english = (d) => d.card_language === "english";
const ranked = (d) => dq.savingsClaimTrusted(d, NOW) && Number(d.market_price) > 0 && Number(d.discount_pct) > 0;
const liveAuction = (d) => d.listing_type === "AUCTION" && d.auction_end_at && Date.parse(d.auction_end_at) > NOW;
// what the graded page must show for the same URL: the All deals order, narrowed
// and partitioned exactly as the page's retained rules say
function expectedFromAllDeals(user) {
  const sort = user.sort ?? "newest";
  let rows = allDealsGraded(user).deals.filter(english);
  if (sort === "discount") rows = rows.filter(ranked);
  if (sort === "ending") rows = rows.filter(liveAuction);
  if (user.country && sort !== "ending") rows = [...rows.filter((d) => d.is_local === true), ...rows.filter((d) => d.is_local !== true)];
  return rows.map((d) => d.listing_id);
}
const SCOPES = [null, ...inv.ALL_DEALS_MARKETPLACES];
const SORTS = ["newest", "price_asc", "price_desc", "discount", "ending"];

test("GI-1. unique listing identities and exact totals match All deals type=graded, minus Japanese-catalogue slabs only", () => {
  const page = gradedPage();
  const all = allDealsGraded();
  assert.equal(page.first.exact, true);
  assert.equal(page.first.totalCount, 67);
  assert.equal(page.first.totalPages, 3);
  assert.deepEqual(page.all.map((p) => p.deals.length), [24, 24, 19]);
  assert.equal(new Set(page.ids).size, page.ids.length, "no listing repeats across pages");
  assert.equal(page.deals.length, page.first.totalCount, "tiles across pages == total");
  assert.ok(page.deals.every((d) => d.is_graded === true && english(d)));
  const missing = all.deals.filter((d) => !page.ids.includes(d.listing_id));
  assert.equal(all.first.totalCount, 69);
  assert.deepEqual(missing.map((d) => d.card_language), ["japanese", "japanese"], "the only difference is the English-catalogue scope");
  assert.deepEqual(page.ids, expectedFromAllDeals({}), "same order as All deals (no marketplace selected)");
  // excluded and conflicting rows never appear or count
  const shownRowIds = new Set(page.deals.map((d) => d.id));
  for (const id of GRADED_EXTRA_EXCLUDED_ROW_IDS) assert.ok(!shownRowIds.has(id), `row ${id}`);
  assert.ok(!page.ids.includes("v1|3840000005|0"), "listing whose copies disagree on grade is withheld");
  assert.equal(page.first.identityConflictsWithheld, 2);
  // distinct listings of the same card and grade all show (old page deduplicated them by card + grade)
  assert.equal(page.deals.filter((d) => d.grader === "PSA" && d.grade === "10" && d.card_name === "Charizard").length, 12);
});

test("GI-2. one marketplace and All marketplaces: same identities as All deals, local first, exact broadening count", () => {
  let nonLocalReordered = 0;
  const everywhere = gradedPage();
  for (const country of SCOPES) {
    for (const sort of SORTS) {
      const user = { country, sort };
      const page = gradedPage(user);
      assert.deepEqual(page.ids, expectedFromAllDeals(user), `${country} ${sort}`);
      assert.equal(page.first.totalCount, page.ids.length);
      assert.equal(new Set(page.ids).size, page.ids.length);
      if (country) {
        assert.ok(page.deals.every((d) => d.marketplace === country), `${country}: tiles come from that marketplace's own copy`);
        const narrowedAll = gradedPage({ sort });
        const visible = new Set(page.ids);
        assert.equal(page.first.additionalOnOtherMarketplaces, narrowedAll.ids.filter((id) => !visible.has(id)).length, `${country} ${sort} additional`);
        const plainOrder = allDealsGraded(user).deals.filter(english).map((d) => d.listing_id);
        if (sort === "newest" && page.ids.join() !== plainOrder.join()) nonLocalReordered++;
      } else {
        assert.equal(page.first.additionalOnOtherMarketplaces, null);
      }
    }
  }
  assert.ok(nonLocalReordered >= 3, "fixture exercises local-first reordering in several marketplaces");
  assert.equal(everywhere.first.totalCount, 67);
  // the cross-listed slab: home copy with no marketplace selected, GB's own copy on GB
  const pick = (r, id) => r.deals.find((d) => d.listing_id === id);
  assert.equal(pick(everywhere, "v1|3810000001|0").marketplace, "EBAY_US");
  assert.deepEqual(pick(everywhere, "v1|3810000001|0").also_on, ["EBAY_GB"]);
  const gb = pick(gradedPage({ country: "EBAY_GB" }), "v1|3810000001|0");
  assert.equal(gb.currency, "GBP");
  assert.equal(gb.is_local, false);
});

test("GI-3. grader / grade filters count exactly, and the graded preset cannot be loosened from the URL", () => {
  const combos = [{ grader: "PSA" }, { grader: "CGC" }, { grade: "10" }, { grader: "PSA", grade: "10" }, { grader: "CGC", grade: "9.5" }, { grader: "BGS", grade: "9.5" }, { grader: "SGC", grade: "10" }, { grader: "PSA", grade: "9" }];
  for (const f of combos) {
    for (const country of [null, "EBAY_US"]) {
      const user = { ...f, country };
      const page = gradedPage(user);
      assert.deepEqual(page.ids, expectedFromAllDeals(user), JSON.stringify(user));
      assert.ok(page.deals.every((d) => (!f.grader || d.grader === f.grader) && (!f.grade || String(d.grade) === f.grade)));
    }
  }
  assert.equal(gradedPage({ grader: "PSA", grade: "10" }).first.totalCount, 12);
  const loosened = gradedPage({ cardType: "raw" });
  assert.equal(loosened.first.totalCount, 67, "?type=raw on /deals/graded still returns graded listings");
  assert.ok(loosened.deals.every((d) => d.is_graded));
  assert.deepEqual(gradedPage({ language: "japanese", localFirst: false, narrowingSorts: false }).ids, gradedPage().ids, "inventory options come from the category, not the URL");
});

test("GI-4. savings and ending-soon sorts list only the rows they rank; All deals keeps its own sort semantics", () => {
  const discount = gradedPage({ sort: "discount" });
  assert.equal(discount.first.totalCount, 46);
  assert.ok(discount.deals.every(ranked), "never a plain or above-comparison listing under a savings sort");
  const pct = discount.deals.map((d) => Number(d.discount_pct));
  assert.deepEqual(pct, [...pct].sort((a, b) => b - a));
  assert.ok(allDealsGraded({ sort: "discount" }).deals.some((d) => !ranked(d)), "All deals still lists plain listings after ranked ones");
  const ending = gradedPage({ sort: "ending" });
  assert.equal(ending.first.totalCount, 3);
  assert.ok(ending.deals.every(liveAuction));
  assert.equal(allDealsGraded({ sort: "ending" }).first.totalCount, 69, "All deals: auctions first, then everything else");
  // non-narrowing sorts count the same inventory as newest
  for (const sort of ["price_asc", "price_desc"]) assert.equal(gradedPage({ sort }).first.totalCount, 67);
});

test("GI-5. pagination, out-of-range pages and empty results", () => {
  const p3 = inv.queryAllDeals(CHUNKS, categoryInventoryParams(GRADED, { page: 3 }), { now: NOW });
  assert.equal(p3.deals.length, 19);
  const p4 = inv.queryAllDeals(CHUNKS, categoryInventoryParams(GRADED, { page: 4 }), { now: NOW });
  assert.equal(p4.outOfRange, true);
  assert.deepEqual(p4.deals, []);
  assert.equal(p4.totalCount, 67);
  const none = inv.queryAllDeals(CHUNKS, categoryInventoryParams(GRADED, { grader: "PSA", grade: "8", page: 2 }), { now: NOW });
  assert.equal(none.totalCount, 0);
  assert.equal(none.outOfRange, false, "an empty selection is an empty state, not out of range");
  assert.equal(none.totalPages, 1);
  const deNone = inv.queryAllDeals(CHUNKS, categoryInventoryParams(GRADED, { country: "EBAY_DE" }), { now: NOW });
  assert.equal(deNone.totalCount, 0);
  assert.equal(deNone.additionalOnOtherMarketplaces, 67, "empty marketplace still offers the exact broadening count");
});

test("GI-6. incomplete inventory: counts become lower bounds and the broadening number is withheld", () => {
  const limited = build(gradedInventorySnapshot, (m) => ({ readLimitHit: m === "EBAY_GB" }));
  const everywhere = gradedPage({}, limited);
  assert.equal(everywhere.first.exact, false);
  const us = gradedPage({ country: "EBAY_US" }, limited);
  assert.equal(us.first.exact, true, "a complete marketplace is still exact");
  assert.equal(us.first.additionalOnOtherMarketplaces, null);
  assert.equal(gradedPage({ country: "EBAY_GB" }, limited).first.exact, false);
  assert.equal(gradedPage({}, CHUNKS.slice(0, 5)).first.exact, false, "a missing marketplace");
});

test("GI-7. every tile is one whole stored copy: price, currency, shipping and exact eBay link travel together", () => {
  const stored = new Map(gradedInventorySnapshot.map((r) => [`${r.listing_id}|${r.marketplace}`, r]));
  for (const country of SCOPES) {
    for (const d of gradedPage({ country }).deals) {
      const row = stored.get(`${d.listing_id}|${d.marketplace}`);
      assert.ok(row, d.listing_id);
      for (const k of ["id", "price", "total_price", "total_price_usd", "currency", "market_price", "discount_pct", "affiliate_url", "grader", "grade", "item_location_country"]) {
        assert.deepEqual(d[k] ?? null, row[k] ?? null, `${d.listing_id} ${k}`);
      }
      assert.equal(d.shipping ?? null, row.shipping ?? null);
      assert.match(d.affiliate_url, /^https:\/\/www\.ebay\.com\/itm\/\d+$/);
    }
  }
});

test("GI-8. wiring: same route and canonical, region default kept, one inventory, other categories unchanged", () => {
  const page = read("components/DealCategoryPage.js");
  assert.match(page, /const canonical = `\/deals\/\$\{slug\}`;/);
  assert.match(page, /<RegionRedirect \/>/, "graded keeps the visitor-region default");
  assert.match(page, /cat\.inventory\s*\?\s*fetchAllDealsPage\(categoryInventoryParams\(cat, \{ sort: cat\.defaultSort \?\? "newest", page: 1 \}\)\)\s*:\s*fetchDealsPage\(/);
  assert.match(page, /exactInventory=\{Boolean\(cat\.inventory\)\}/);
  const route = read("app/api/deals-page/route.js");
  const category = route.slice(route.indexOf('if (kind === "category")'));
  assert.ok(category.indexOf("if (cat.inventory)") < category.indexOf("const r = await fetchDealsPage("), "inventory categories return before the legacy loader");
  assert.match(category, /fetchAllDealsPage\(\s*categoryInventoryParams\(cat, \{/);
  const cats = read("lib/dealCategories.js");
  assert.equal((cats.match(/\binventory: \{/g) ?? []).length, 1, "graded is the only inventory category");
  assert.match(cats, /graded:\s*\{\s*filter:\s*\{\s*cardType:\s*"graded"\s*\},[\s\S]{0,600}inventory: \{ language: "english", localFirst: true, narrowingSorts: true \}/);
  const grid = read("components/DealGrid.js");
  assert.match(grid, /const exactInventory = allDeals \|\| \(kind === "category" && inventoryCategory\);/);
  assert.match(grid, /additional=\{exactInventory && view\.exact \? view\.additional : null\}/);
  assert.match(grid, /pinned=\{!allDeals\}/, "region pinning unchanged");
  // /deals passes none of the category options
  assert.doesNotMatch(read("app/deals/page.js"), /localFirst|narrowingSorts|categoryInventoryParams/);
  assert.doesNotMatch(read("lib/deals.js"), /localFirst|narrowingSorts/);
  // no second inventory: the graded page reads the same per-marketplace cache
  assert.equal((read("lib/deals.js").match(/unstable_cache\(fetchAllDealsMarketplaceUncached/g) ?? []).length, 1);
});

test("GI-9. /deals without category options is unchanged: every language, no narrowing, no local-first", () => {
  const plain = pages({ cardType: "graded", country: "EBAY_US" });
  assert.ok(plain.deals.some((d) => d.card_language === "japanese"));
  assert.equal(pages({ cardType: "graded", sort: "ending" }).first.totalCount, 69);
  assert.equal(inv.queryAllDeals(CHUNKS, {}, { now: NOW }).filters.language, null);
});
