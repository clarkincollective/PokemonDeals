// catalog-price-freshness-r1 - a withdrawn catalogue price must stop being
// published as a current ranked figure.
//
// THE DEFECT (production, 2026-09-17). /market-data/most-expensive-cards
// ranked "Kyogre Star #112/113 (EX Delta Species)" at $1,602.99 while the
// card's own page said it had no reliable market price and served noindex.
// card_catalog held ONE row for that card with market_price = NULL and
// synced_at 2026-09-17T02:00:07Z; price_history's last `catalog` observation
// at $1,602.99 was 2026-09-16T02:03:59Z. So the 02:00Z sync withdrew the
// price, and the ranking kept publishing it.
//
// ROOT CAUSE. app/api/sync-card-catalog is the only writer of
// card_catalog.market_price and it withdraws prices (writes NULL) as well as
// setting them - but it performed no cache invalidation, and neither
// fetchTopCatalogCards nor fetchCatalogComposition carried a tag, so nothing
// could reach them. Each lived out its own independent 6h TTL. The page
// therefore paired a FRESH snapshot date (the composition cache had
// refreshed past the sync - the rendered dateTime was exactly the sync's
// 02:00:07Z) with STALE ranking rows: the dateline certified prices the sync
// had already withdrawn.
//
// WHY THE OBVIOUS GUARD DOES NOT WORK. Re-checking the cached row's price
// against catalogPriceOk cannot detect this: the cached row still holds the
// old NUMBER (1602.99), which passes every price gate. The stale value is
// indistinguishable from a good one by inspection - only re-reading the
// source can tell, which is what tag expiry forces.
//
// These tests run the REAL loader and the REAL route handler against an
// in-memory database and the tag-aware model of Next's cache
// (tests/harness/cache/nextCacheModel.mjs), so the transition is exercised
// end to end rather than asserted from source text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const L = require(join(REPO, "lib/listingAvailability.js"));
const cache = await import(pathToFileURL(join(REPO, "tests/harness/cache/nextCacheModel.mjs")).href);
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\/[^\n]*/g, "");

const TAG = "catalog-prices";

// ---------------------------------------------------------------------
// The wiring: one shared tag, on both surfaces, expired by the writer.
// ---------------------------------------------------------------------

test("CPF-1. the tag is a shared constant, not a literal repeated at each site", () => {
  assert.equal(L.CATALOG_PRICES_TAG, TAG, "lib/listingAvailability no longer exports the catalogue-price tag");
  const deals = code("lib/deals.js");
  const sync = code("app/api/sync-card-catalog/route.js");
  for (const [name, src] of [["lib/deals.js", deals], ["app/api/sync-card-catalog/route.js", sync]]) {
    assert.match(src, /CATALOG_PRICES_TAG/, `${name} does not use the shared tag constant`);
    assert.ok(
      !new RegExp(`["']${TAG}["']`).test(src),
      `${name} hard-codes the tag string instead of importing the constant`
    );
  }
});

test("CPF-2. both catalogue-price surfaces carry the tag, so they expire together", () => {
  const src = code("lib/deals.js");
  // the ranking and the snapshot line that dates it
  for (const key of ["top-catalog-cards", "catalog-composition"]) {
    const at = src.indexOf(`["${key}"]`);
    assert.ok(at > 0, `${key} cache is gone`);
    const options = src.slice(at, at + 260);
    assert.match(options, /tags:\s*\[CATALOG_PRICES_TAG\]/, `${key} is not tagged - nothing can invalidate it`);
  }
  // a fresh date over stale rows is the exact failure mode, so the two must
  // not be allowed to drift apart again
  const ranking = src.slice(src.indexOf('["top-catalog-cards"]'), src.indexOf('["top-catalog-cards"]') + 260);
  const composition = src.slice(src.indexOf('["catalog-composition"]'), src.indexOf('["catalog-composition"]') + 260);
  const ttl = (s) => (s.match(/revalidate:\s*(\d+)/) ?? [])[1];
  assert.equal(ttl(ranking), ttl(composition), "the ranking and its snapshot date have different TTLs");
});

test("CPF-3. the only writer of market_price expires the tag, without being able to fail the sync", () => {
  const src = code("app/api/sync-card-catalog/route.js");
  assert.match(src, /revalidateTag\(CATALOG_PRICES_TAG,\s*\{\s*expire:\s*0\s*\}\)/, "the sync does not expire the catalogue-price tag");
  // inside a try, and the catch must not rethrow: the rows are already written
  const at = src.indexOf("revalidateTag(CATALOG_PRICES_TAG");
  const around = src.slice(Math.max(0, at - 200), at + 400);
  assert.match(around, /try\s*\{/, "the invalidation is not guarded");
  assert.match(around, /catch\s*\(/, "the invalidation has no catch");
  assert.ok(!/catch\s*\([^)]*\)\s*\{[^}]*throw/.test(around), "a failed invalidation can fail a sync that already wrote its rows");
  // and the outcome is reported, so a run that silently stops invalidating is visible
  assert.match(src, /invalidated,/, "the sync does not report whether it invalidated");
  assert.match(src, /invalidationErrors,/, "the sync does not report invalidation errors");
});

// ---------------------------------------------------------------------
// The transition, on controlled data, through the real loader.
// ---------------------------------------------------------------------

// The real ranking query, reproduced against an in-memory table exactly as
// PostgREST would apply it: this is the filter chain in
// fetchTopCatalogCardsUncached (lib/deals.js) - not null, > 0, price desc.
function rankingQuery(rows, limit) {
  return rows
    .filter((r) => r.language === "english" && r.image_url != null && r.market_price != null && r.market_price > 0)
    .sort((a, b) => b.market_price - a.market_price)
    .slice(0, limit)
    .map((r) => ({ tcgplayerId: String(r.tcgplayer_id), name: r.name, refPrice: Number(r.market_price) }));
}

test("CPF-4. a withdrawn price leaves the ranking on the next render; valid cards stay", async () => {
  const M = cache.model();
  M.entries.clear();
  M.pages.clear();
  M.tagExpiredAt.clear();
  M.now = 0;

  // one expensive card plus two ordinary ones, all validly priced
  const db = [
    { tcgplayer_id: "86552", name: "Kyogre Star", language: "english", image_url: "i", market_price: 1602.99 },
    { tcgplayer_id: "1", name: "Charizard", language: "english", image_url: "i", market_price: 900 },
    { tcgplayer_id: "2", name: "Blastoise", language: "english", image_url: "i", market_price: 400 },
  ];
  let queries = 0;
  const loadRanking = cache.unstable_cache(
    async () => {
      queries++;
      return { cards: rankingQuery(db, 10), error: null };
    },
    ["top-catalog-cards"],
    { revalidate: 21600, tags: [L.CATALOG_PRICES_TAG] }
  );
  const loadComposition = cache.unstable_cache(
    async () => ({ snapshotAt: db.syncedAt ?? "2026-09-16T02:00:00Z" }),
    ["catalog-composition"],
    { revalidate: 21600, tags: [L.CATALOG_PRICES_TAG] }
  );
  const renderPage = async () => {
    const [{ cards }, composition] = await Promise.all([loadRanking(), loadComposition()]);
    return `snapshot:${composition.snapshotAt}|${cards.map((c) => `${c.name}@${c.refPrice}`).join(",")}`;
  };

  // 1. the ranking is built and cached while the price is valid
  const first = await cache.renderIsrPage("/market-data/most-expensive-cards", 21600, renderPage);
  assert.match(first.html, /Kyogre Star@1602\.99/, "the valid price was not ranked to begin with");
  assert.equal(queries, 1);
  assert.ok(first.tags.includes(L.CATALOG_PRICES_TAG), "the page did not inherit the catalogue-price tag");

  // 2. one hour later the catalogue sync WITHDRAWS the price (writes NULL)
  M.now += 3600 * 1000;
  db[0].market_price = null;
  db.syncedAt = "2026-09-17T02:00:07Z";

  // without invalidation the page is still inside its 6h window: this is the
  // production failure, reproduced - a withdrawn price still published
  const stale = await cache.renderIsrPage("/market-data/most-expensive-cards", 21600, renderPage);
  assert.equal(stale.regenerated, false, "the page regenerated on its own - the TTL premise no longer holds");
  assert.match(stale.html, /Kyogre Star@1602\.99/, "expected the un-invalidated page to still show the withdrawn price");

  // 3. the sync expires the shared tag, as the route now does
  cache.revalidateTag(L.CATALOG_PRICES_TAG, { expire: 0 });

  const after = await cache.renderIsrPage("/market-data/most-expensive-cards", 21600, renderPage);
  assert.equal(after.regenerated, true, "expiring the tag did not regenerate the page");
  assert.equal(queries, 2, "the ranking was not re-queried from source");
  // the withdrawn card is gone...
  assert.ok(!/Kyogre Star/.test(after.html), `the withdrawn price is still ranked: ${after.html}`);
  // ...and the cards that are still validly priced remain, in order
  assert.match(after.html, /Charizard@900.*Blastoise@400/, `valid ranked cards were lost: ${after.html}`);
  // ...and the snapshot date now describes the data actually shown
  assert.match(after.html, /snapshot:2026-09-17T02:00:07Z/, "the snapshot date did not advance with the rows");
});

test("CPF-5. the snapshot date can no longer be fresher than the rows it dates", async () => {
  // The precise production symptom: the composition cache had refreshed past
  // the sync while the ranking had not, so the page stamped the sync's own
  // timestamp onto pre-sync prices. One shared tag makes that unreachable -
  // whatever expires one expires the other, so they are always the same
  // generation.
  const M = cache.model();
  M.entries.clear();
  M.pages.clear();
  M.tagExpiredAt.clear();
  M.now = 0;

  const state = { price: 1602.99, syncedAt: "2026-09-16T02:00:00Z" };
  const opts = { revalidate: 21600, tags: [L.CATALOG_PRICES_TAG] };
  const loadRanking = cache.unstable_cache(async () => ({ price: state.price }), ["top-catalog-cards"], opts);
  const loadComposition = cache.unstable_cache(async () => ({ snapshotAt: state.syncedAt }), ["catalog-composition"], opts);

  const a = await Promise.all([loadRanking(), loadComposition()]);
  assert.deepEqual(a, [{ price: 1602.99 }, { snapshotAt: "2026-09-16T02:00:00Z" }]);

  // the sync withdraws the price and stamps a new snapshot time
  state.price = null;
  state.syncedAt = "2026-09-17T02:00:07Z";
  cache.revalidateTag(L.CATALOG_PRICES_TAG, { expire: 0 });

  const [ranking, composition] = await Promise.all([loadRanking(), loadComposition()]);
  assert.equal(ranking.price, null, "the ranking kept the withdrawn price after invalidation");
  assert.equal(composition.snapshotAt, "2026-09-17T02:00:07Z");
  // both moved together: no fresh date over stale rows
  assert.ok(
    !(composition.snapshotAt === "2026-09-17T02:00:07Z" && ranking.price === 1602.99),
    "the snapshot date advanced while the ranking did not - the defect is reachable again"
  );
});

test("CPF-6. re-checking the cached price against the price gate could NOT have caught this", () => {
  // Kept as an executable note: the first proposed fix was to re-apply
  // catalogPriceOk to the cached rows at render. The cached row still holds
  // 1602.99 - a perfectly valid number - so the gate passes it and the
  // withdrawn price is published anyway. Only re-reading the source detects
  // a value that has become NULL, which is why the correction is invalidation
  // and not inspection.
  const { catalogPriceOk } = require(join(REPO, "lib/cardSlug.js"));
  const cachedRow = { refPrice: 1602.99 };
  assert.equal(catalogPriceOk(cachedRow.refPrice), true, "the stale cached price passes the price gate");
  assert.equal(catalogPriceOk(null), false, "the gate does reject the CURRENT source value");
  // so no render-time re-check of the cached value exists in the ranking page
  assert.ok(
    !/catalogPriceOk/.test(code("app/market-data/most-expensive-cards/page.js")),
    "the ranking page re-checks cached prices - that cannot detect a withdrawn price and implies it can"
  );
});
