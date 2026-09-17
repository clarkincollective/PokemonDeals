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

// =====================================================================
// r2 - the two gaps the tag alone did not close.
// =====================================================================

// The route's invalidation rule, extracted to exactly the shape the handler
// uses: expire iff rows were actually written, once, and never throw.
function syncInvalidator() {
  const state = { invalidated: 0, errors: [], calls: 0, throwNext: false };
  state.expire = (rowsWritten) => {
    if (!(rowsWritten > 0) || state.invalidated) return;
    try {
      state.calls++;
      if (state.throwNext) throw new Error("revalidateTag unavailable");
      state.invalidated = 1;
    } catch (e) {
      state.errors.push(e.message);
    }
  };
  return state;
}

test("CPF-7. a LIMITED run writes real prices, so it invalidates", () => {
  const src = code("app/api/sync-card-catalog/route.js");
  // the gate is the write count, not the run's shape
  assert.match(src, /expireCatalogPrices\(upserted \+ wotcFixed\)/, "the success path does not invalidate on rows written");
  const at = src.indexOf("expireCatalogPrices(upserted + wotcFixed)");
  // nothing between the previous statement and the call may mention `limit`,
  // in ANY form - a braced block, a bare `if (!limit) expire...`, a ternary
  // or a && guard would each silently restore the gap this closes
  const stmt = src.slice(0, at).split(/[;}{]/).pop();
  assert.ok(!stmt.includes("limit"), `the success-path invalidation is gated on limit: ...${stmt.trim().slice(-80)}`);
  // a limit pass slices the records it writes - it does not skip writing
  assert.match(src, /if \(limit\) records = records\.slice\(0, limit\)/, "limit no longer means 'write a subset'");

  // behaviour: a 50-row limited run invalidates exactly once
  const run = syncInvalidator();
  run.expire(50 + 0);
  assert.equal(run.invalidated, 1, "a limited run that wrote 50 rows did not invalidate");
  assert.deepEqual(run.errors, []);
});

test("CPF-8. a run that writes SOME rows then fails still invalidates; those rows are live", () => {
  const src = code("app/api/sync-card-catalog/route.js");
  const at = src.indexOf('stage: "upsert"');
  assert.ok(at > 0, "the upsert error exit is gone");
  const exit = src.slice(Math.max(0, at - 400), at + 200);
  assert.match(exit, /expireCatalogPrices\(upserted\)/, "the partial-failure exit does not invalidate the rows it already wrote");
  assert.match(exit, /invalidated, invalidationErrors/, "the partial-failure response does not report the invalidation outcome");
  // and the helper is declared before the loop, or that exit could not call it
  assert.ok(
    src.indexOf("const expireCatalogPrices") < src.indexOf("for (let i = 0; i < records.length"),
    "expireCatalogPrices is declared after the upsert loop - the error exit cannot reach it"
  );

  const run = syncInvalidator();
  run.expire(200); // two chunks landed, the third failed
  assert.equal(run.invalidated, 1, "a partial write did not invalidate");
});

test("CPF-9. a run that writes NOTHING does not invalidate", () => {
  for (const wrote of [0, null, undefined, NaN, -1]) {
    const run = syncInvalidator();
    run.expire(wrote);
    assert.equal(run.invalidated, 0, `a run that wrote ${String(wrote)} rows invalidated anyway`);
    assert.equal(run.calls, 0, `a run that wrote ${String(wrote)} rows still called revalidateTag`);
  }
  // the export-failure exit returns before any write, and before the helper
  const src = code("app/api/sync-card-catalog/route.js");
  const exportExit = src.indexOf('stage: "export"');
  assert.ok(
    exportExit < src.indexOf("const expireCatalogPrices"),
    "the export-failure exit is now after the invalidator - it could invalidate having written nothing"
  );
});

test("CPF-10. invalidation is once-only and can never fail the sync", () => {
  const run = syncInvalidator();
  run.expire(10);
  run.expire(10); // the success path after a partial-path call
  assert.equal(run.calls, 1, "revalidateTag was called twice for one run");

  const failing = syncInvalidator();
  failing.throwNext = true;
  assert.doesNotThrow(() => failing.expire(10), "a failed invalidation propagated out of the sync");
  assert.equal(failing.invalidated, 0);
  assert.deepEqual(failing.errors, ["revalidateTag unavailable"], "the failure was swallowed without being reported");
});

// ---------------------------------------------------------------------
// The dateline: independently refreshed ranking / composition.
// ---------------------------------------------------------------------

test("CPF-11. the ranking's date comes from the read that produced its rows", () => {
  const deals = code("lib/deals.js");
  // synced_at is selected in the SAME query as the prices, so the date and
  // the rows cannot come from different reads
  const at = deals.indexOf("fetchTopCatalogCardsUncached");
  const fn = deals.slice(at, at + 2600);
  assert.match(fn, /\.select\("[^"]*synced_at[^"]*"\)/, "the ranking query does not read synced_at");
  assert.match(fn, /snapshotAt:/, "the ranking does not return its own as-of");
  // the OLDEST row wins: the claim can never be fresher than the data
  assert.match(fn, /syncedAt\[0\]/, "the ranking as-of is not the oldest row's timestamp");
  assert.match(fn, /\.sort\(\)/, "the ranking as-of is not ordered before taking the oldest");

  const page = code("app/market-data/most-expensive-cards/page.js");
  assert.match(page, /snapshotAt: rankedAt/, "the page does not take the ranking's own as-of");
  assert.ok(
    !/composition[?.]*\.snapshotAt/.test(page),
    "the page still reads the composition cache's date - that is the borrowed date this fixes"
  );
  assert.match(page, /dateModified: rankedAt/, "the JSON-LD dateModified still describes something other than the ranking");
});

test("CPF-12. when the two caches refresh independently, the date follows the ROWS", async () => {
  const M = cache.model();
  M.entries.clear();
  M.pages.clear();
  M.tagExpiredAt.clear();
  M.now = 0;

  // one source, two independently cached reads of it
  const source = { price: 1602.99, syncedAt: "2026-09-16T02:00:00Z", pricedCards: 21979 };
  const loadRanking = cache.unstable_cache(
    // as the real query does: a NULL price is not ranked at all
    async () => ({
      cards: source.price == null ? [] : [{ name: "Kyogre Star", refPrice: source.price }],
      snapshotAt: source.syncedAt,
    }),
    ["top-catalog-cards"],
    { revalidate: 100, tags: [L.CATALOG_PRICES_TAG] }
  );
  // deliberately a DIFFERENT TTL, to force the drift this test is about
  const loadComposition = cache.unstable_cache(
    async () => ({ pricedCards: source.pricedCards, snapshotAt: source.syncedAt }),
    ["catalog-composition"],
    { revalidate: 10, tags: [L.CATALOG_PRICES_TAG] }
  );
  // the page as it now renders: the ranking's date, never the composition's
  const render = async () => {
    const [{ cards, snapshotAt: rankedAt }, composition] = await Promise.all([loadRanking(), loadComposition()]);
    return { rankedAt, rows: cards.map((c) => c.refPrice), pricedCards: composition.pricedCards };
  };

  const first = await render();
  assert.deepEqual([first.rankedAt, first.rows], ["2026-09-16T02:00:00Z", [1602.99]]);

  // the sync runs: the price is withdrawn and everything gets a new as-of
  source.price = null;
  source.syncedAt = "2026-09-17T02:00:07Z";
  source.pricedCards = 21978;

  // only the SHORT-lived composition entry expires; the ranking is still
  // inside its window. This is the exact drift a shared tag does not prevent.
  M.now += 20 * 1000;
  // the model serves a stale entry and refreshes in the background (as Next
  // does in a request context), so the first read triggers and the second
  // observes it - the ranking's longer window is untouched throughout
  await render();
  const drifted = await render();
  assert.equal(drifted.pricedCards, 21978, "the composition did not refresh - the test is not exercising drift");
  assert.deepEqual(drifted.rows, [1602.99], "the ranking refreshed too - the test is not exercising drift");
  // THE PROTECTED BEHAVIOUR: the date still describes the rows on screen,
  // NOT the newer read sitting beside them
  assert.equal(
    drifted.rankedAt,
    "2026-09-16T02:00:00Z",
    "the ranking borrowed the newer date while still showing the older rows"
  );

  // once the ranking itself refreshes, date and rows move together
  M.now += 200 * 1000;
  await render(); // trigger the ranking's own refresh
  const after = await render();
  assert.deepEqual(after.rows, [], "the withdrawn price is still ranked after the ranking refreshed");
  assert.equal(after.rankedAt, "2026-09-17T02:00:07Z", "the date did not advance with the rows");
});

test("CPF-13. a pre-upgrade cache entry omits the date rather than back-filling one", () => {
  // Entries written before this shipped carry no snapshotAt. The page must
  // print no date at all in that case - falling back to the composition's
  // date is precisely the defect, and any clock-derived value would be
  // manufactured freshness. It self-heals on the next refresh.
  const page = code("app/market-data/most-expensive-cards/page.js");
  assert.match(page, /const rankedOn = formatDate\(rankedAt\)/, "the rendered date is not derived from the ranking's as-of");
  assert.match(page, /\{rankedOn && \(/, "the date is rendered unconditionally - a missing as-of would print something");
  // omitting the field is fine; substituting a DATE is not
  assert.match(page, /dateModified: rankedAt \?\? undefined/, "JSON-LD dateModified does not simply omit a missing as-of");
  assert.ok(
    !/rankedAt \?\? (?!undefined)|Date\.now\(\)|new Date\(\)\.toISOString\(\)/.test(page),
    "the page substitutes a fallback date when the ranking has none"
  );
  // the catalogue count is its own sentence, not sharing a date it cannot vouch for
  assert.match(page, /Catalogue: \$\{pricedCards\.toLocaleString\(\)\} priced English cards tracked\./, "the catalogue count is not a separate claim");
  assert.ok(!/Catalogue snapshot:/.test(page), "the merged 'Catalogue snapshot: <date> · N tracked' label is still there");
});
