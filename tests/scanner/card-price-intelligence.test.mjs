// SEO Phase 11C - Card Price Intelligence on /cards/[slug].
//
// The card page's history chart + trend panel are driven by the canonical
// Phase 11B merged spine (getCanonicalPriceHistory), NOT a per-request
// PokemonPriceTracker history call. These pin: canonical source, no
// page-time provider history, catalog-wins merge, WOTC = first-party only,
// per-window trend sufficiency, the deterministic market-signal rule, the
// coverage phrasing, currency-invariant percentages, and that no new
// route / sitemap / schema surface was added.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ph from "../../lib/priceHistory.js";

const {
  mergeHistoryRows,
  trendWindows,
  marketSignal,
  historyCoverage,
  downsampleSeries,
  isWotcDualPrintingSet,
  MARKET_SIGNAL_BAND_PCT,
  HISTORY_SOURCES,
} = ph;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const DEALS_SRC = read("lib/deals.js");
const PAGE_SRC = read("app/cards/[slug]/page.js");
const PANEL_SRC = read("components/CardPriceIntelligence.js");
const CATVIEW_SRC = read("components/CatalogCardView.js");
const PPT_SRC = read("lib/pokemonPriceTracker.js");

const day = (n, from = "2026-09-02") =>
  new Date(Date.parse(from) - n * 86400_000).toISOString().slice(0, 10);
// merged-series shape (output of mergeHistoryRows / input to trend + coverage helpers)
const series = (pairs, source = "catalog") =>
  pairs.map(([d, p]) => ({ date: d, price: p, source }));
// raw DB-row shape (input to mergeHistoryRows) - keyed on observed_on
const rows = (pairs, source = "catalog") =>
  pairs.map(([d, p]) => ({ observed_on: d, price: p, source }));

// === 1. canonical history is the source ============================

test("1. fetchCardPriceHistory reads the canonical spine, not a provider call", () => {
  const code = stripComments(DEALS_SRC);
  assert.match(code, /export const fetchCardPriceHistory = unstable_cache\(/);
  assert.match(code, /getCanonicalPriceHistory\(\s*supabase\s*,/);
  // it must NOT reach for the provider history / ebay from this path
  const fn = code.slice(code.indexOf("fetchCardPriceHistoryUncached"), code.indexOf("card-price-history-v1"));
  assert.doesNotMatch(fn, /pokemonpricetracker|getFullPriceAnalysis|getRawPriceHistory|includeHistory|includeEbay|ebay/i);
});

// === 2. no page-time PPT history request ==========================

test("2. the card page asks getFullPriceAnalysis for NO history series", () => {
  assert.match(PAGE_SRC, /getFullPriceAnalysis\(tcgplayerId, \{ includeHistory: false \}\)/);
  // getFullPriceAnalysis honours the opt-out (only sets includeHistory when asked)
  assert.match(PPT_SRC, /if \(includeHistory\) url\.searchParams\.set\("includeHistory", "true"\)/);
  assert.match(PPT_SRC, /includeHistory = true/); // default preserved for other callers
});

test("2b. the intelligence panel is a pure client component - no data fetching", () => {
  assert.doesNotMatch(stripComments(PANEL_SRC), /\bfetch\s*\(|https?:\/\/|pokemonpricetracker|supabase|getCanonicalPriceHistory/i);
  assert.match(PANEL_SRC, /^"use client";/);
});

// === 3. catalog wins the same-day merge ==========================

test("3. a same-day catalog + ppt_backfill collision resolves to catalog", () => {
  const merged = mergeHistoryRows([
    { observed_on: "2026-09-01", price: 111, source: "ppt_backfill" },
    { observed_on: "2026-09-01", price: 222, source: "catalog" },
    { observed_on: "2026-09-02", price: 333, source: "ppt_backfill" },
  ]);
  assert.deepEqual(merged, [
    { date: "2026-09-01", price: 222, source: "catalog" },
    { date: "2026-09-02", price: 333, source: "ppt_backfill" },
  ]);
});

// === 4. WOTC dual-printing = first-party only ====================

test("4. WOTC dual-printing cards carry no ppt_backfill history", () => {
  for (const s of ["Base Set", "Jungle", "Fossil", "Team Rocket", "Neo Genesis", "Base Set (Shadowless)"]) {
    assert.equal(isWotcDualPrintingSet(s), true, s);
  }
  // a WOTC canonical series is catalog-only by construction (the backfill
  // never wrote ppt_backfill rows for these sets) - merging catalog-only
  // rows keeps them catalog-only.
  const wotc = mergeHistoryRows(rows([[day(3), 800], [day(2), 810], [day(1), 805], [day(0), 815]]));
  assert.equal(wotc.length, 4);
  assert.ok(wotc.every((p) => p.source === HISTORY_SOURCES.CATALOG));
  assert.ok(wotc.every((p) => p.source !== HISTORY_SOURCES.PPT_BACKFILL));
});

// === 5-8. per-window trend sufficiency ===========================

test("5. 7d trend is null when the nearest older point is outside tolerance", () => {
  const s = series([[day(30), 100], [day(0), 120]]);
  assert.equal(trendWindows(s).d7, null);
});
test("6. 30d trend is null on a 5-day-old series", () => {
  assert.equal(trendWindows(series([[day(5), 100], [day(0), 110]])).d30, null);
});
test("7. 90d trend is null when history is ~30 days deep", () => {
  const s = series([[day(30), 50], [day(15), 55], [day(0), 60]]);
  assert.equal(trendWindows(s).d90, null);
});
test("8. 365d trend is null without a ~1-year-old observation", () => {
  const s = series([[day(120), 5], [day(60), 6], [day(0), 7]]);
  assert.equal(trendWindows(s).d365, null);
});

test("real windows resolve when the history supports them", () => {
  const s = series([[day(365), 40], [day(90), 60], [day(30), 66], [day(7), 70], [day(0), 72]]);
  const tw = trendWindows(s);
  for (const k of ["d7", "d30", "d90", "d365"]) assert.ok(tw[k], `${k} should resolve`);
  assert.equal(tw.d30.comparedOn, day(30));
  assert.equal(tw.d30.changePct, 9.1); // (72-66)/66
});

// === 9-10. market-signal rule ===================================

test("9. market signal: ±5% band, 30-day basis, deterministic", () => {
  assert.equal(MARKET_SIGNAL_BAND_PCT, 5);
  const mk = (pct) => marketSignal({ d30: { changePct: pct } });
  assert.equal(mk(5).status, "rising");
  assert.equal(mk(5).label, "Rising");
  assert.equal(mk(4.9).status, "stable");
  assert.equal(mk(0).status, "stable");
  assert.equal(mk(-4.9).status, "stable");
  assert.equal(mk(-5).status, "falling");
  assert.equal(mk(-5).direction, -1);
  assert.equal(mk(12).basisWindowDays, 30);
});

test("10. no 30-day window => 'Limited history', never a 7-day fallback", () => {
  assert.equal(marketSignal({ d7: { changePct: 40 }, d30: null }).status, "limited");
  assert.equal(marketSignal({ d7: { changePct: 40 }, d30: null }).label, "Limited history");
  assert.equal(marketSignal(null).status, "limited");
  assert.equal(marketSignal({ d30: { changePct: NaN } }).status, "limited");
});

// === 11. short-history messaging ================================

test("11. coverage phrasing is derived from the card's own series", () => {
  assert.equal(historyCoverage([]).level, "none");
  assert.equal(historyCoverage([]).label, null);
  // < 5 points OR < 21 days span => "recently started"
  assert.equal(historyCoverage(series([[day(3), 5], [day(2), 6], [day(0), 7]])).level, "recent");
  assert.equal(
    historyCoverage(series([[day(3), 5], [day(2), 6], [day(0), 7]])).label,
    "Price tracking recently started."
  );
  // deep series (>=5 points, >21d span) => "Price history since <Month YYYY>" from the FIRST date
  const deep = series([
    ["2025-01-27", 100],
    ["2025-06-01", 120],
    [day(60), 125],
    [day(30), 130],
    [day(0), 140],
  ]);
  const c = historyCoverage(deep);
  assert.equal(c.level, "since");
  assert.equal(c.label, "Price history since January 2025.");
  assert.equal(c.firstDate, "2025-01-27");
});

// === 12. live-deal comparison + no-deal state ===================

test("12. deal context maths: only 'below' when the listing is genuinely under the reference", () => {
  // mirrors CardPriceIntelligence: belowPct = round((1 - listing/mv)*100), shown only when >=1
  const belowPct = (listing, mv) => (listing < mv ? Math.round((1 - listing / mv) * 100) : null);
  assert.equal(belowPct(84, 100), 16);
  assert.equal(belowPct(100, 100), null); // equal -> no savings framing
  assert.equal(belowPct(120, 100), null); // above -> no savings framing
  assert.equal(belowPct(99.6, 100), 0); // <1% rounds to 0 -> component suppresses it
  // component only renders the block when belowPct >= 1
  assert.match(PANEL_SRC, /const showDealContext = belowPct != null && belowPct >= 1/);
  // and the offers it compares against are already display-gated upstream
  assert.match(DEALS_SRC, /displayable\(data\)/);
});

test("12b. no-deal state: panel still renders value + windows with a null listing", () => {
  assert.match(PANEL_SRC, /cheapestListingUsd = null/);
  // page passes the cheapest USD listing (or null in the catalog view)
  assert.match(PAGE_SRC, /cheapestListingUsd=\{rangeLowUsd\}/);
  assert.match(CATVIEW_SRC, /cheapestListingUsd=\{null\}/);
});

// === 13. currency-safe percentages =============================

test("13. trend % and signal are currency-invariant (computed from the USD series)", () => {
  const usd = series([[day(90), 100], [day(30), 108], [day(7), 112], [day(0), 115]]);
  const scaled = usd.map((p) => ({ ...p, price: +(p.price * 1.3743).toFixed(4) }));
  const a = trendWindows(usd);
  const b = trendWindows(scaled);
  for (const k of ["d30", "d90"]) {
    assert.equal(a[k].changePct, b[k].changePct, `${k} changePct must not depend on scale`);
  }
  assert.equal(marketSignal(a).status, marketSignal(b).status);
  // the panel only sends absolute money through <Price>; every % is raw
  assert.match(PANEL_SRC, /computed from the USD-canonical merged series/);
});

// === 14. zero / sentinel history excluded =====================

test("14. sentinel and non-positive points never enter the trend basis", () => {
  const merged = mergeHistoryRows([
    { observed_on: day(30), price: 100, source: "catalog" },
    { observed_on: day(20), price: 9999, source: "catalog" }, // sentinel
    { observed_on: day(10), price: 0, source: "catalog" }, // invalid
    { observed_on: day(0), price: 110, source: "catalog" },
  ]);
  assert.deepEqual(merged.map((p) => p.date), [day(30), day(0)]);
});

// === 15. metadata unchanged / stable ==========================

test("15. card-page metadata carries no trend percentages", () => {
  const meta = PAGE_SRC.slice(
    PAGE_SRC.indexOf("export async function generateMetadata"),
    PAGE_SRC.indexOf("export default async function CardHubPage")
  );
  assert.doesNotMatch(meta, /changePct|trend|marketSignal|Rising|Falling|% (up|down)|priceHistory/i);
  assert.match(meta, /catalogCardTitle\(/); // same title builder as before
  assert.match(meta, /alternates: \{ canonical: `\/cards\/\$\{slug\}` \}/);
});

// === 16. no new route / sitemap / schema surface ==============

test("16. Phase 11C adds no route family, no sitemap change, no finance schema", () => {
  for (const p of [
    "app/price-history",
    "app/card-trends",
    "app/rising-cards",
    "app/falling-cards",
    "app/cards/[slug]/price-history",
  ]) {
    assert.equal(existsSync(join(ROOT, p)), false, `${p} must not exist`);
  }
  assert.doesNotMatch(read("lib/sitemap.js"), /price-history|card-trends|rising-cards|falling-cards|\/trends/i);
  for (const src of [PAGE_SRC, PANEL_SRC, CATVIEW_SRC]) {
    assert.doesNotMatch(src, /FinancialProduct|InvestmentOrDeposit|"@type":\s*"Dataset"|Dataset/);
  }
  // Product/Offer JSON-LD on the card page still describes only live offers
  assert.match(PAGE_SRC, /"@type": "Product"/);
  assert.match(PAGE_SRC, /offers: allOffers\.map/);
});

// === downsample: chronology + endpoints preserved ============

test("downsampleSeries keeps first + last and stays chronological", () => {
  const big = Array.from({ length: 500 }, (_, i) => ({ date: day(500 - i), price: 100 + i, source: "catalog" }));
  const small = downsampleSeries(big, 120);
  assert.ok(small.length <= 120 && small.length >= 100);
  assert.equal(small[0].date, big[0].date);
  assert.equal(small[small.length - 1].date, big[big.length - 1].date);
  for (let i = 1; i < small.length; i++) assert.ok(small[i - 1].date < small[i].date);
});
