// 28 Sep 2026 - the imported board rows reach the category surfaces.
// Owner: "Sealed Deals, singles, and graded should all appear from the
// scrape into the categories ... It should feed all through the site. As
// well as product location" and "Sealed doesn't have many".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const require = createRequire(import.meta.url);
const bd = require("../../lib/boardDeals.js");
const jimmy = require("../../lib/jimmyFeed.js");

test("BC-1 filterBoardDeals: a USD price band reads priceUsd and never guesses", () => {
  const rows = [
    { id: "a", marketplace: "EBAY_US", variant: "Raw", format: "BIN", priceUsd: 12 },
    { id: "b", marketplace: "EBAY_GB", variant: "PSA 10", format: "Auction", priceUsd: 180.5 },
    { id: "c", marketplace: "EBAY_US", variant: "Sealed", format: "BIN", priceUsd: 49.99 },
    { id: "d", marketplace: "EBAY_DE", variant: "Raw", format: null }, // no priceUsd
  ];
  const ids = (opts) => bd.filterBoardDeals(rows, opts).map((r) => r.id);
  assert.deepEqual(ids({ maxPriceUsd: 50 }), ["a", "c"], "under $50; the row without a USD price is left out of a band");
  assert.deepEqual(ids({ maxPriceUsd: 25 }), ["a"]);
  assert.deepEqual(ids({ maxPriceUsd: 250 }), ["a", "b", "c"]);
  assert.deepEqual(ids({}), ["a", "b", "c", "d"], "no band, nothing filtered (BD-14 unchanged)");
  assert.deepEqual(ids({ maxPriceUsd: null }), ["a", "b", "c", "d"]);
  assert.deepEqual(ids({ kind: "sealed", maxPriceUsd: 50 }), ["c"]);
});

test("BC-2 the cached index carries priceUsd (one FX read per build) and the page read takes maxPriceUsd", () => {
  const feed = read("lib/boardDealsFeed.js");
  assert.match(feed, /const stored = await loadBoardIndex\(db\);/, "28 Sep 2026: the index is read as one stored row");
  assert.match(feed, /if \(stored\?\.rows\?\.length\) return stored\.rows;/);
  assert.match(feed, /priceUsd: Number\.isFinite\(usd\) \? Math\.round\(usd \* 100\) \/ 100 : null/, "the fallback rebuild still computes it");
  assert.match(feed, /\["board-deals-index-v3"\]/, "the index shape changed, so its cache key did");
  assert.match(feed, /filterBoardDeals\(index, \{ market, kind, format, maxPriceUsd, card \}\)/);
});

test("BC-3 the section takes the surface's filters and links to /more-deals with the same ones", () => {
  const section = read("components/BoardDealsSection.js");
  assert.match(section, /kind = null, market = null, format = null, maxPriceUsd = null, card = null, id = "board-deals", headingStyle = "page", showSeeAll = true \}\)/);
  assert.match(section, /fetchBoardDealsPage\(\{ page: 1, pageSize: limit, \.\.\.filters \}\)/);
  assert.match(section, /href="\/more-deals"/, "the plain link keeps its literal href (BD-13)");
  assert.match(section, /href=\{seeAll\}/);
  assert.doesNotMatch(section, /pokedealfinder|jimmy/i, "the source is still never named");
  assert.match(section, /check the listing on eBay before buying/);
});

test("BC-4 category pages: the mapping from a category's filter to the board selection", async () => {
  const { boardFiltersForCategory, boardHeadingForCategory } = await import("../../components/DealCategoryPage.js").catch(() => ({}));
  if (!boardFiltersForCategory) {
    // the component imports next/* modules that do not resolve under plain node;
    // pin the source instead
    const src = read("components/DealCategoryPage.js");
    assert.match(src, /export function boardFiltersForCategory\(cat\)/);
    assert.match(src, /if \(f\.cardType === "graded"\) out\.kind = "graded";/);
    assert.match(src, /if \(f\.listingType === "AUCTION"\) out\.format = "auction";/);
    assert.match(src, /if \(f\.country\) out\.market = f\.country;/, "product location: the country pages take their marketplace");
    assert.match(src, /out\.maxPriceUsd = Number\(f\.maxPrice\)/);
    assert.match(src, /if \(Array\.isArray\(f\.sets\) \|\| f\.modernEra \|\| f\.priceDrop\) return null;/, "set-list and price-history categories have no board equivalent");
    assert.match(src, /<BoardDealsSection page="deals" limit=\{24\} heading=\{boardHeading\} \{\.\.\.boardFilters\} \/>/);
    return;
  }
  assert.deepEqual(boardFiltersForCategory({ filter: { cardType: "graded" } }), { kind: "graded" });
  assert.deepEqual(boardFiltersForCategory({ filter: { listingType: "AUCTION" } }), { format: "auction" });
  assert.deepEqual(boardFiltersForCategory({ filter: { country: "EBAY_GB" } }), { market: "EBAY_GB" });
  assert.deepEqual(boardFiltersForCategory({ filter: { maxPrice: 50 } }), { maxPriceUsd: 50 });
  assert.equal(boardFiltersForCategory({ filter: { sets: ["Base Set"] } }), null);
  assert.equal(boardFiltersForCategory({ filter: { modernEra: true } }), null);
  assert.equal(boardFiltersForCategory({ filter: { priceDrop: true } }), null);
  assert.equal(boardHeadingForCategory({ filter: { country: "EBAY_GB" } }), "More deals in the UK");
});

test("BC-5 /sealed-deals shows the boards' sealed rows; /more-deals has the price band", () => {
  const sealed = read("app/sealed-deals/page.js");
  assert.match(sealed, /<BoardDealsSection page="sealed" kind="sealed" limit=\{8\} heading="More sealed deals" id="more-sealed-deals" headingStyle="sub" \/>/);
  const more = read("app/more-deals/page.js");
  assert.match(more, /\["50", "Under \$50"\]/);
  assert.match(more, /maxPrice: pick\(one\(sp\.maxPrice\), PRICES\)/);
  assert.match(more, /maxPriceUsd: p\.maxPrice \? Number\(p\.maxPrice\) : null/);
  assert.match(more, /<ChipRow label="Price"/);
});

test("BC-6 the daily sealed capture: sealed searches only, all-time window, bounded", () => {
  const specs = jimmy.jimmyListSpecs({ mode: "sealed" });
  const lists = Object.keys(jimmy.JIMMY_MARKETS).length * jimmy.JIMMY_FORMATS.length;
  assert.equal(specs.length, lists * 9, "12 lists x 9 sealed search terms");
  assert.ok(specs.every((s) => s.window === "alltime" && s.maxPages === 5 && /^sealed:/.test(s.label) && s.query.search_query));
  // the other modes are unchanged
  assert.equal(jimmy.jimmyListSpecs({ mode: "quick" }).length, lists);
  assert.ok(jimmy.jimmyListSpecs({ mode: "quick" }).every((s) => s.maxPages === 3 && s.label === "quick"));
  assert.equal(jimmy.jimmyListSpecs({ mode: "full" }).length, lists * 2);
  assert.match(read("scripts/boards/captureJimmy.mjs"), /args\.has\("--sealed"\) \? "sealed"/);
});

test("BC-7 /sealed-deals reads as three short parts (owner: 'a big scroll and doesn't look very organised')", () => {
  const sealed = read("app/sealed-deals/page.js");
  assert.match(sealed, /const INITIAL_OPEN_SETS = 1;/, "one set open on first paint, not six");
  assert.match(sealed, /<nav aria-label="On this page"/, "a jump bar");
  for (const id of ["#live-sealed-deals", "#more-sealed-deals", "#browse-sealed"]) assert.match(sealed, new RegExp(`href="${id}"`));
  assert.match(sealed, /<section id="live-sealed-deals" className="mb-10 scroll-mt-6" data-featured-sealed-strip>/, "the featured strip keeps its data attribute (sealed-product-selection test)");
  assert.match(sealed, /<h2 id="browse-sealed"/);
  // a single card with a card number is never filed as sealed, whatever else its title says
  const feed = read("lib/jimmyFeed.js");
  assert.match(feed, /const CARD_NUMBER_RE = /);
  assert.match(feed, /SEALED_TITLE_RE\.test\(title\) && !CARD_NUMBER_RE\.test\(title\) \? "sealed" : "single"/);
});
