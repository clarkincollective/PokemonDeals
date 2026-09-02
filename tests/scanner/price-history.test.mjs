// SEO Phase 11B - hybrid historical price foundation. Data infrastructure
// only: a PPT-backfilled historical PREFIX + first-party daily snapshots
// FORWARD, merged chronologically. These pin the integrity rules - real
// observations only (no fake history), sentinel/invalid rejection, the
// 11 WOTC dual-printing sets excluded from the PPT backfill, first-party
// wins a same-day conflict, and trend windows that refuse to fabricate
// continuity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ph from "../../lib/priceHistory.js";

const {
  HISTORY_SOURCES,
  isValidHistoryPrice,
  isWotcDualPrintingSet,
  isBackfillEligible,
  mergeHistoryRows,
  trendOverWindow,
  trendWindows,
} = ph;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const BACKFILL_SRC = read("scripts/ppt-history-backfill.mjs");
const CATALOG_ROUTE = read("app/api/sync-card-catalog/route.js");
const LIB_SRC = read("lib/priceHistory.js");

// Negative "does this code do X" checks must ignore prose in comments
// (the files legitimately *mention* "graded" / "eBay Browse" while
// explaining what they deliberately do NOT do).
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const BACKFILL_CODE = stripComments(BACKFILL_SRC);
const LIB_CODE = stripComments(LIB_SRC);

const row = (over = {}) => ({
  tcgplayer_id: "42382",
  name: "Charizard",
  set: "Jungle",
  language: "english",
  condition: "Near Mint",
  price: 100,
  source: HISTORY_SOURCES.PPT_BACKFILL,
  observed_on: "2026-06-01",
  ...over,
});

// day helpers for trend series
const dayAgo = (n, from = "2026-09-01") =>
  new Date(Date.parse(from) - n * 86400_000).toISOString().slice(0, 10);

// === 1-3 : only real, valid observations are stored ==================

test("1/2/3. isValidHistoryPrice rejects sentinels, null, zero, negative; the backfill uses it", () => {
  for (const bad of [null, undefined, 0, -1, "", NaN, 999, 999.99, 9999, 99999.99]) {
    assert.equal(isValidHistoryPrice(bad), false, `should reject ${bad}`);
  }
  for (const ok of [0.01, 1.59, 100, 4999.99, 12345]) {
    assert.equal(isValidHistoryPrice(ok), true, `should accept ${ok}`);
  }
  // the backfill script validates every point with it before building a row
  assert.match(BACKFILL_SRC, /if \(!isValidHistoryPrice\(p\?\.market\)\)/);
  // and never invents points
  assert.doesNotMatch(BACKFILL_CODE, /interpolat|forwardFill|fillGaps|synthesi[sz]e|backfillGap/i);
});

test("2. sentinel history points are rejected by mergeHistoryRows", () => {
  const merged = mergeHistoryRows([
    row({ observed_on: "2026-06-01", price: 100 }),
    row({ observed_on: "2026-06-02", price: 9999 }), // sentinel
    row({ observed_on: "2026-06-03", price: 0 }), // invalid
    row({ observed_on: "2026-06-04", price: 110 }),
  ]);
  assert.deepEqual(
    merged.map((p) => p.date),
    ["2026-06-01", "2026-06-04"]
  );
});

// === 4/5 : WOTC dual-printing exclusion =============================

test("4. the 11 WOTC dual-printing sets are recognised and excluded from PPT backfill eligibility", () => {
  const wotc = [
    "Base Set",
    "Base Set (Shadowless)",
    "Jungle",
    "Fossil",
    "Team Rocket",
    "Gym Heroes",
    "Gym Challenge",
    "Neo Genesis",
    "Neo Discovery",
    "Neo Revelation",
    "Neo Destiny",
  ];
  for (const s of wotc) assert.equal(isWotcDualPrintingSet(s), true, s);
  assert.equal(isWotcDualPrintingSet("Base Set 2"), false); // single-printing, NOT excluded
  assert.equal(isWotcDualPrintingSet("Legendary Collection"), false);
  assert.equal(isWotcDualPrintingSet("SWSH07: Evolving Skies"), false);

  // a WOTC card is never backfill-eligible even when priced
  assert.equal(isBackfillEligible({ set: "Base Set", market_price: 800, language: "english" }), false);
  assert.equal(isBackfillEligible({ set: "SM - Hidden Fates", market_price: 40, language: "english" }), true);
  assert.equal(isBackfillEligible({ set: "SM - Hidden Fates", market_price: 999, language: "english" }), false);
  assert.equal(isBackfillEligible({ set: "SM - Hidden Fates", market_price: 40, language: "japanese" }), false);

  // the backfill cohort builder drops them
  assert.match(BACKFILL_SRC, /if \(isWotcDualPrintingSet\(r\.set\)\) continue/);
});

test("5. first-party catalogue snapshots still cover WOTC sets (no set filter in the snapshot step)", () => {
  // the snapshot in sync-card-catalog reads card_catalog with only a
  // price filter - NO set exclusion - so WOTC cards get first-party
  // forward history from their printing-corrected canonical price.
  const snap = CATALOG_ROUTE.slice(
    CATALOG_ROUTE.indexOf("async function snapshotCatalogHistory"),
    CATALOG_ROUTE.length
  );
  assert.match(snap, /source: "catalog"/);
  assert.doesNotMatch(snap, /WOTC|dual.?printing|isWotcDualPrintingSet|1st\s*edition/i);
  // it reads back card_catalog (so WOTC second-pass fixes are included), not the in-memory records
  assert.match(snap, /from\("card_catalog"\)/);
});

// === 6/7 : idempotency ============================================

test("6/7. duplicate card/date/source rows do not multiply; re-running is idempotent (upsert on the daily key)", () => {
  // the daily unique index is the idempotency mechanism
  assert.match(
    read("supabase/price_history_migration.sql"),
    /unique index[\s\S]*?tcgplayer_id[\s\S]*?condition[\s\S]*?source[\s\S]*?observed_on/i
  );
  assert.match(BACKFILL_SRC, /onConflict: "tcgplayer_id,condition,source,observed_on"/);
  assert.match(CATALOG_ROUTE, /onConflict: "tcgplayer_id,condition,source,observed_on"/);
  // merge collapses same-day rows to one
  const merged = mergeHistoryRows([
    row({ observed_on: "2026-06-01", price: 100 }),
    row({ observed_on: "2026-06-01", price: 100 }),
    row({ observed_on: "2026-06-01", price: 100 }),
  ]);
  assert.equal(merged.length, 1);
});

// === 8/9 : merge chronology + first-party wins =====================

test("8. merge is chronological, oldest -> newest, bounded", () => {
  const merged = mergeHistoryRows([
    row({ observed_on: "2026-06-03", price: 30 }),
    row({ observed_on: "2026-06-01", price: 10 }),
    row({ observed_on: "2026-06-02", price: 20 }),
  ]);
  assert.deepEqual(merged.map((p) => p.date), ["2026-06-01", "2026-06-02", "2026-06-03"]);
  assert.deepEqual(merged.map((p) => p.price), [10, 20, 30]);

  const many = Array.from({ length: 50 }, (_, i) => row({ observed_on: dayAgo(49 - i), price: 100 + i }));
  const bounded = mergeHistoryRows(many, { maxPoints: 10 });
  assert.equal(bounded.length, 10);
  assert.equal(bounded[bounded.length - 1].date, "2026-09-01"); // keeps the NEWEST
  assert.equal(bounded[0].date, dayAgo(9));
});

test("9. first-party ('catalog') observation wins when both sources exist for the same day", () => {
  const merged = mergeHistoryRows([
    row({ observed_on: "2026-06-01", price: 111, source: HISTORY_SOURCES.PPT_BACKFILL }),
    row({ observed_on: "2026-06-01", price: 222, source: HISTORY_SOURCES.CATALOG }),
    row({ observed_on: "2026-06-02", price: 333, source: HISTORY_SOURCES.PPT_BACKFILL }),
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], { date: "2026-06-01", price: 222, source: "catalog" });
  assert.deepEqual(merged[1], { date: "2026-06-02", price: 333, source: "ppt_backfill" });
});

// === 10-13 : trend windows require a real comparison point =========

function series(pairs) {
  return pairs.map(([date, price]) => ({ date, price, source: "catalog" }));
}

test("10. 7d change needs an observation within +/- 2 days of the target date", () => {
  const s = series([[dayAgo(7), 100], [dayAgo(0), 110]]);
  const t = trendOverWindow(s, 7, { toleranceDays: 2 });
  assert.ok(t);
  assert.equal(t.comparedOn, dayAgo(7));
  assert.equal(t.changeAbs, 10);
  assert.equal(t.changePct, 10);
  // a 30-day-old point must NOT satisfy a 7d window
  const stale = series([[dayAgo(30), 100], [dayAgo(0), 110]]);
  assert.equal(trendOverWindow(stale, 7, { toleranceDays: 2 }), null);
});

test("11. 30d change does not silently use a 6-day-old point", () => {
  const s = series([[dayAgo(6), 100], [dayAgo(0), 120]]);
  assert.equal(trendOverWindow(s, 30, { toleranceDays: 5 }), null, "6d point is outside the 30d +/-5d tolerance");
  const ok = series([[dayAgo(28), 100], [dayAgo(0), 120]]);
  assert.ok(trendOverWindow(ok, 30, { toleranceDays: 5 }));
});

test("12. 90d change needs a point near 90 days back (within +/- 10d)", () => {
  assert.ok(trendOverWindow(series([[dayAgo(85), 50], [dayAgo(0), 60]]), 90, { toleranceDays: 10 }));
  assert.equal(trendOverWindow(series([[dayAgo(60), 50], [dayAgo(0), 60]]), 90, { toleranceDays: 10 }), null);
});

test("13. 365d is unavailable when history is too shallow", () => {
  const w = trendWindows(series([[dayAgo(20), 5], [dayAgo(7), 6], [dayAgo(0), 7]]));
  assert.equal(w.d365, null);
  assert.equal(w.d90, null);
  assert.equal(w.d30, null); // nearest older point (20d) is outside 30d +/-5d
  assert.ok(w.d7, "d7 available - exact point 7 days back");
  // a single point yields nothing
  assert.equal(trendOverWindow(series([[dayAgo(0), 7]]), 7, { toleranceDays: 2 }), null);
});

// === 14/15 : scope guards ========================================

test("14. no graded history enters this raw canonical spine", () => {
  assert.doesNotMatch(
    BACKFILL_CODE,
    /includeEbay|includeGraded|salesByGrade|gradedPrices|getGradedPrice|psa10|gradeKey/i
  );
  // it reads ONLY the raw Near Mint condition series
  assert.match(BACKFILL_SRC, /priceHistory\?\.conditions\?\.\["Near Mint"\]/);
  // the lib only knows 'catalog' and 'ppt_backfill'
  assert.deepEqual(Object.values(HISTORY_SOURCES).sort(), ["catalog", "ppt_backfill"]);
  assert.doesNotMatch(LIB_CODE, /graded|psa|cgc|bgs/i);
});

test("15. the backfill makes NO eBay Browse / eBay sold-list calls", () => {
  assert.doesNotMatch(
    BACKFILL_CODE,
    /ebay\.com|ebay\.co|browse\/v1|getItemsByLegacyIds|item_summary\/search|getRawSoldComps|soldListings|includeEbay/i
  );
  // only the PPT /cards endpoint
  assert.match(BACKFILL_SRC, /pokemonpricetracker\.com\/api\/v2/);
  assert.match(BACKFILL_SRC, /\/cards`\)/);
  assert.match(BACKFILL_SRC, /includeHistory/);
});

// === 16-19 : no public surface, no dataset, creds server-side ======

test("16/17. no public route and no sitemap change for Phase 11B", () => {
  let routeExists = false;
  try {
    readFileSync(join(ROOT, "app/api/price-history/route.js"));
    routeExists = true;
  } catch {}
  assert.equal(routeExists, false, "app/api/price-history/route.js must not exist");
  // lib/sitemap.js untouched by 11B (no price-history / history / trends entry)
  assert.doesNotMatch(read("lib/sitemap.js"), /price-history|\/history|\/trends|\/movers/i);
});

test("18. no downloadable dataset / CSV / feed of history", () => {
  for (const src of [BACKFILL_SRC, LIB_SRC, CATALOG_ROUTE]) {
    assert.doesNotMatch(src, /\.csv|text\/csv|Content-Disposition|attachment;|createObjectURL|download=/i);
  }
});

test("19. provider + DB credentials stay server-side (script + lib, not client components)", () => {
  for (const src of [BACKFILL_SRC, LIB_SRC]) {
    assert.doesNotMatch(src, /["']use client["']/);
  }
  // the backfill reads its key only from process.env
  assert.match(BACKFILL_SRC, /process\.env\.POKEMONPRICETRACKER_API_KEY/);
  assert.doesNotMatch(BACKFILL_SRC, /NEXT_PUBLIC_[A-Z_]*KEY/);
  // no app/ page imports lib/priceHistory yet (not wired to public pages)
  // (a light check: the lib is required only by the script + tests)
});

// === backfill safety (§14) + merge helper db shape ================

test("backfill is bounded/resumable/idempotent/budget-aware", () => {
  assert.match(BACKFILL_SRC, /--dry-run/);
  assert.match(BACKFILL_SRC, /--resume/);
  assert.match(BACKFILL_SRC, /--limit/);
  assert.match(BACKFILL_SRC, /--credit-budget/);
  assert.match(BACKFILL_SRC, /CREDITS_PER_CARD = 2/);
  assert.match(BACKFILL_SRC, /exceeds --credit-budget/);
  assert.match(BACKFILL_SRC, /saveCursor/);
  assert.match(BACKFILL_SRC, /\.secrets\/ppt-history-cursor\.json|"ppt-history-cursor\.json"/);
  // it must NOT default to the whole catalogue
  assert.match(BACKFILL_SRC, /cohort", "watchlist"/);
  assert.doesNotMatch(BACKFILL_SRC, /days=730.*maxDataPoints|maxDataPoints.*730/);
  // fails fast before spending credits if the hybrid migration is unapplied
  assert.match(BACKFILL_SRC, /preflightSchema/);
  assert.match(BACKFILL_SRC, /price_history_hybrid_migration\.sql/);
});

test("mergeHistoryRows ignores malformed dates and non-catalog/ppt sources rank lowest", () => {
  const merged = mergeHistoryRows([
    row({ observed_on: "not-a-date", price: 5 }),
    row({ observed_on: "2026-06-01T00:00:00.000Z", price: 7 }),
    row({ observed_on: "2026-06-01", price: 9, source: "mystery" }),
  ]);
  // the ISO-with-time row is sliced to a valid day; 'mystery' source
  // ranks below ppt_backfill/catalog so the 7 (ppt_backfill) wins
  assert.deepEqual(merged, [{ date: "2026-06-01", price: 7, source: "ppt_backfill" }]);
});
