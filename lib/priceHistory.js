// SEO Phase 11B - hybrid historical price foundation.
//
// Merge + trend helpers over the `price_history` table (a PPT-backfilled
// historical PREFIX + a first-party daily-snapshot FORWARD series). Pure
// where it can be, so it is fully unit-testable. No public route wires
// this in yet - it is data infrastructure.

const { WOTC_DUAL_PRINTING_SETS, isSentinelPrice } = require("./pokemonPriceTracker");

const HISTORY_SOURCES = {
  // First-party daily snapshot of the printing-corrected canonical
  // card_catalog price. observed_on IS the observation date.
  CATALOG: "catalog",
  // One-time import of PokemonPriceTracker Business raw Near Mint daily
  // market-reference history. observed_on = the provider's point date.
  PPT_BACKFILL: "ppt_backfill",
};

// A history price we will store / trust: a real, positive, non-placeholder
// number. Sentinel repdigits (999 / 9999 / ...) and null/0/negative are
// "no data", never a data point (§7, §8 - no fake history).
function isValidHistoryPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && !isSentinelPrice(n);
}

// The 11 WOTC dual-printing sets whose PPT `priceHistory.conditions`
// series is a 1st-Edition / Unlimited BLEND (getFullPriceAnalysis already
// returns [] for them). Their history must grow only from the clean
// first-party catalogue snapshots - NOT from a PPT backfill (§7, §10).
function isWotcDualPrintingSet(setName) {
  return WOTC_DUAL_PRINTING_SETS.has(String(setName ?? ""));
}

// A card is eligible for the PokemonPriceTracker historical backfill when
// it is a real, priced English card that is NOT in a dual-printing WOTC
// set. Everything else's history comes from first-party snapshots only.
function isBackfillEligible(card) {
  if (!card) return false;
  if ((card.language ?? "english") !== "english") return false;
  if (!isValidHistoryPrice(card.market_price)) return false;
  if (isWotcDualPrintingSet(card.set)) return false;
  return true;
}

// --- merge read path (§11) -------------------------------------------
//
// `rows` = raw price_history rows for ONE card + ONE condition, any
// sources, unsorted. Produces one canonical point per calendar day,
// oldest -> newest, sentinels dropped. When both a first-party ('catalog')
// and a provider ('ppt_backfill') observation exist for the same day the
// FIRST-PARTY one wins (§11). Provenance is retained on each point.
function mergeHistoryRows(rows, { maxPoints = 800 } = {}) {
  const rank = (src) => (src === HISTORY_SOURCES.CATALOG ? 2 : src === HISTORY_SOURCES.PPT_BACKFILL ? 1 : 0);
  const byDay = new Map();
  for (const r of rows ?? []) {
    if (!isValidHistoryPrice(r?.price)) continue;
    const day = String(r.observed_on).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const cand = { date: day, price: Number(r.price), source: r.source ?? null };
    const cur = byDay.get(day);
    if (!cur || rank(cand.source) > rank(cur.source)) byDay.set(day, cand);
  }
  const series = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Bound the response - keep the NEWEST maxPoints (a chart wants recent
  // detail; the deep prefix can be thinned later).
  return series.length > maxPoints ? series.slice(series.length - maxPoints) : series;
}

// db-backed convenience. `db` is a Supabase client. Reads only.
async function getCanonicalPriceHistory(
  db,
  tcgplayerId,
  { condition = "Near Mint", language = "english", sinceDays = null, maxPoints = 800 } = {}
) {
  let q = db
    .from("price_history")
    .select("observed_on, price, source")
    .eq("tcgplayer_id", String(tcgplayerId))
    .eq("condition", condition)
    .eq("language", language)
    .order("observed_on", { ascending: true });
  if (sinceDays) {
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
    q = q.gte("observed_on", since);
  }
  const { data, error } = await q;
  if (error) return { series: [], error: error.message };
  return { series: mergeHistoryRows(data, { maxPoints }), error: null };
}

// --- trend windows (§12) -------------------------------------------
//
// A change is returned ONLY when a real observation exists near the
// comparison date, within a window-specific tolerance. No forward-fill,
// no interpolation - insufficient history => null.
const TREND_WINDOWS = [
  { key: "d7", days: 7, toleranceDays: 2 },
  { key: "d30", days: 30, toleranceDays: 5 },
  { key: "d90", days: 90, toleranceDays: 10 },
  { key: "d365", days: 365, toleranceDays: 21 },
];

function daysBetween(aIso, bIso) {
  return Math.round((Date.parse(aIso) - Date.parse(bIso)) / 86400_000);
}

// `series` = output of mergeHistoryRows (oldest -> newest).
function trendOverWindow(series, windowDays, { toleranceDays } = {}) {
  const tol = Number.isFinite(toleranceDays) ? toleranceDays : Math.max(2, Math.round(windowDays * 0.1));
  if (!Array.isArray(series) || series.length < 2) return null;
  const latest = series[series.length - 1];
  const targetTs = Date.parse(latest.date) - windowDays * 86400_000;

  // closest observation to the target date, must be within tolerance AND
  // strictly older than `latest` (a 30d change can't compare to today).
  let best = null;
  let bestGap = Infinity;
  for (const pt of series) {
    if (pt.date >= latest.date) continue;
    const gap = Math.abs(Date.parse(pt.date) - targetTs);
    if (gap < bestGap) {
      bestGap = gap;
      best = pt;
    }
  }
  if (!best) return null;
  if (bestGap > tol * 86400_000) return null;

  const changeAbs = Math.round((latest.price - best.price) * 100) / 100;
  const changePct = best.price > 0 ? Math.round((changeAbs / best.price) * 1000) / 10 : null;
  return {
    windowDays,
    latestDate: latest.date,
    latestPrice: latest.price,
    comparedOn: best.date,
    comparedPrice: best.price,
    comparisonAgeDays: daysBetween(latest.date, best.date),
    toleranceDays: tol,
    changeAbs,
    changePct,
  };
}

// All four windows for one series; each key is null or a trend object.
function trendWindows(series) {
  const out = {};
  for (const w of TREND_WINDOWS) {
    out[w.key] = trendOverWindow(series, w.days, { toleranceDays: w.toleranceDays });
  }
  return out;
}

// --- customer-facing market signal (Phase 11C) --------------------
//
// ONE deterministic status derived from real history. This is NOT
// investment advice and deliberately avoids buy/sell/undervalued
// language.
//
// Basis: the 30-day window ONLY. Audited over a ~1,100-card sample of
// the Phase 11B backfill, |30d change| is < 5% for ~55% of cards,
// >= +5% for ~31%, <= -5% for ~14% - a +/-5% band cleanly separates
// "moved" from "day-to-day noise" without overfitting to the sample. If
// the 30-day window is unavailable we say "Limited history" rather than
// fall back to the noisier 7-day read.
const MARKET_SIGNAL_BAND_PCT = 5;

function marketSignal(trends) {
  const d30 = trends && trends.d30 ? trends.d30 : null;
  if (!d30 || !Number.isFinite(d30.changePct)) {
    return { status: "limited", label: "Limited history", direction: 0, basisWindowDays: null, changePct: null };
  }
  const pct = d30.changePct;
  if (pct >= MARKET_SIGNAL_BAND_PCT) {
    return { status: "rising", label: "Rising", direction: 1, basisWindowDays: 30, changePct: pct };
  }
  if (pct <= -MARKET_SIGNAL_BAND_PCT) {
    return { status: "falling", label: "Falling", direction: -1, basisWindowDays: 30, changePct: pct };
  }
  return { status: "stable", label: "Stable", direction: 0, basisWindowDays: 30, changePct: pct };
}

// --- coverage phrasing (Phase 11C) -------------------------------
//
// Historical depth is NOT uniform (clean PPT-backed cards reach back to
// ~2025-01-27; the 11 WOTC dual-printing sets have NO PPT prefix and
// grow only from first-party snapshots that began ~late Aug 2026; some
// cards have no usable PPT history at all). This phrase is ALWAYS
// derived from the card's own merged series, never a global claim.
const COVERAGE_MIN_POINTS = 5;
const COVERAGE_MIN_SPAN_DAYS = 21;

function historyCoverage(series) {
  const pts = Array.isArray(series) ? series : [];
  if (pts.length === 0) {
    return { level: "none", label: null, firstDate: null, lastDate: null, points: 0, spanDays: 0 };
  }
  const firstDate = pts[0].date;
  const lastDate = pts[pts.length - 1].date;
  const spanDays = Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86400_000);
  if (pts.length < COVERAGE_MIN_POINTS || spanDays < COVERAGE_MIN_SPAN_DAYS) {
    return { level: "recent", label: "Price tracking recently started.", firstDate, lastDate, points: pts.length, spanDays };
  }
  const month = new Date(`${firstDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { level: "since", label: `Price history since ${month}.`, firstDate, lastDate, points: pts.length, spanDays };
}

// --- chart point reduction (Phase 11C, §10) ---------------------
//
// The merged spine can be ~500 daily points. A card-page chart needs far
// fewer to read correctly, and the full array should not be duplicated
// into the RSC/HTML payload. Evenly sample down to `maxPoints`, ALWAYS
// keeping the true first and last observations. Chronology is preserved
// and every retained value is a genuine observation - no interpolation,
// no invented dates.
function downsampleSeries(series, maxPoints = 180) {
  const pts = Array.isArray(series) ? series : [];
  if (pts.length <= maxPoints || maxPoints < 2) return pts.slice();
  const step = (pts.length - 1) / (maxPoints - 1);
  const picked = [];
  let lastIdx = -1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? pts.length - 1 : Math.round(i * step);
    if (idx !== lastIdx) {
      picked.push(pts[idx]);
      lastIdx = idx;
    }
  }
  return picked;
}

module.exports = {
  HISTORY_SOURCES,
  TREND_WINDOWS,
  MARKET_SIGNAL_BAND_PCT,
  isValidHistoryPrice,
  isWotcDualPrintingSet,
  isBackfillEligible,
  mergeHistoryRows,
  getCanonicalPriceHistory,
  trendOverWindow,
  trendWindows,
  marketSignal,
  historyCoverage,
  downsampleSeries,
};
