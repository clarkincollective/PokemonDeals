// Phase SOCIAL-NEWSROOM-1 - DATA SUPPORT MATRIX (§7, §21).
//
// For EVERY series: SUPPORTED_NOW | SUPPORTED_WITH_LIMITATIONS |
// DATA_NOT_READY, decided against a `stats` object the caller builds from
// a READ-ONLY DB snapshot (scripts/socialBacklog.mjs). No series is ever
// run on fabricated data - a series whose required facts are absent is
// DATA_NOT_READY and produces nothing.
//
// Pure. The caller owns the DB read; this file only interprets counts.

import { SERIES_REGISTRY, getSeries } from "./series.mjs";

export const SUPPORT_LEVELS = Object.freeze(["SUPPORTED_NOW", "SUPPORTED_WITH_LIMITATIONS", "DATA_NOT_READY"]);
const RANK = { SUPPORTED_NOW: 2, SUPPORTED_WITH_LIMITATIONS: 1, DATA_NOT_READY: 0 };

// Each fact name -> a predicate over `stats` returning one of the three
// levels + a short reason. `stats` fields are all plain integers/booleans
// the caller derives from the deal pool + catalog + price history.
export const FACT_CHECKS = Object.freeze({
  // ---- live BIN deal inventory ----
  fresh_bin_deal: (s) => lvl(s.fresh_bin_deal_count, 1, 3, "fresh (<=6h) BIN deals"),
  graded_deal: (s) => lvl(s.fresh_graded_bin_count, 1, 2, "fresh graded BIN deals"),
  recent_discovery: (s) => lvl(s.recent_discovery_bin_count, 1, 3, "BIN deals discovered <=48h"),
  multi_fresh_bin_under_25: (s) => lvl(s.fresh_bin_under_25_count, 3, 5, "fresh BIN deals under $25"),
  multi_fresh_bin_under_50: (s) => lvl(s.fresh_bin_under_50_count, 3, 6, "fresh BIN deals under $50"),
  multi_fresh_bin_under_100: (s) => lvl(s.fresh_bin_under_100_count, 3, 8, "fresh BIN deals under $100"),
  multi_fresh_bin_same_set: (s) => lvl(s.max_fresh_bin_per_set, 3, 5, "fresh BIN deals sharing one set"),
  multi_fresh_graded_bin: (s) => lvl(s.fresh_graded_bin_count, 3, 5, "fresh graded BIN deals"),
  vintage_bin_inventory: (s) => lvl(s.vintage_bin_count, 3, 8, "vintage BIN inventory"),

  // ---- multi-listing comparison ----
  multi_listing_same_printing: (s) => lvl(s.max_live_listings_one_printing, 2, 3, "live comparable listings for one exact printing"),
  same_printing_multi_marketplace: (s) => lvl(s.printings_across_marketplaces, 1, 3, "one printing priced across >=2 marketplaces (FX-normalised)"),
  shipping_flips_ranking: (s) => bool(s.has_shipping_rank_flip_example, "an example where shipping changes the cheapest-seller ranking"),

  // ---- raw vs graded ----
  raw_and_graded_reference: (s) => bool(s.has_raw_and_graded_reference, "comparable raw + graded market reference for one card"),
  multi_grade_reference: (s) => lvl(s.cards_with_multi_grade_reference, 1, 3, "cards with >=3 grade-level references"),

  // ---- market / price history ----
  price_history_observations: (s) => lvl(s.price_history_days, 7, 21, "days of price-history observations"),
  long_price_history: (s) => lvl(s.max_price_history_points_one_card, 8, 20, "history points on a single card"),
  low_volatility_uptrend: (s) => lvl(s.quiet_climber_count, 1, 3, "low-volatility steady-uptrend cards"),
  set_price_observations: (s) => lvl(s.sets_with_price_observations, 3, 10, "sets with enough price observations"),
  species_price_observations: (s) => lvl(s.species_with_price_observations, 3, 10, "Pokemon with enough price observations"),
  catalog_price_distribution: (s) => lvl(s.catalog_priced_card_count, 1000, 5000, "priced catalogue cards for a distribution"),
  weekly_top_deal_history: (s) => lvl(s.weekly_top_deal_history_days, 5, 7, "days of top-deal history"),
  weekly_activity_summary: (s) => lvl(s.weekly_new_deal_count, 5, 20, "new deals this week for a recap"),

  // ---- example-driven editorial ----
  deal_with_shipping_delta: (s) => bool(s.has_shipping_delta_example, "a deal where shipping materially changes the maths"),
  deal_price_history: (s) => bool(s.has_bin_price_drop_signal, "a persisted per-listing BIN price-drop signal"),
  vintage_and_modern_reference: (s) => lvl(s.vintage_and_modern_reference_count, 1, 3, "paired vintage + modern references"),
  safe_rejection_example: (s) => lvl(s.safe_rejection_example_count, 1, 3, "non-defamatory disqualified_reason examples"),
});

function lvl(v, limitedAt, nowAt, label) {
  const n = Number(v) || 0;
  if (n >= nowAt) return { level: "SUPPORTED_NOW", detail: `${n} ${label}` };
  if (n >= limitedAt) return { level: "SUPPORTED_WITH_LIMITATIONS", detail: `${n} ${label} (thin)` };
  return { level: "DATA_NOT_READY", detail: `only ${n} ${label} (need >=${limitedAt})` };
}
function bool(v, label) {
  return v ? { level: "SUPPORTED_NOW", detail: `has ${label}` } : { level: "DATA_NOT_READY", detail: `no ${label}` };
}

// Evaluate ONE series against stats. A series with no `requires` inherits
// its static baseline (evergreen explainers need no live data).
export function evaluateSeries(seriesId, stats = {}) {
  const def = getSeries(seriesId);
  if (!def) return null;
  if (!def.requires.length) {
    return { series: def.id, pillar: def.pillar, clock: def.clock, support: def.baseline, requires: [], checks: [], note: def.note };
  }
  const checks = def.requires.map((fact) => {
    const fn = FACT_CHECKS[fact];
    const res = fn ? fn(stats) : { level: "DATA_NOT_READY", detail: `no check registered for '${fact}'` };
    return { fact, ...res };
  });
  // worst required fact caps the series; baseline caps it further (a
  // series marked DATA_NOT_READY in the registry stays there).
  const worst = checks.reduce((acc, c) => Math.min(acc, RANK[c.level]), 2);
  const capped = Math.min(worst, RANK[def.baseline]);
  const support = SUPPORT_LEVELS.find((k) => RANK[k] === capped) ?? "DATA_NOT_READY";
  return { series: def.id, pillar: def.pillar, clock: def.clock, support, requires: def.requires, checks, note: def.note };
}

export function buildSupportMatrix(stats = {}) {
  const rows = SERIES_REGISTRY.map((s) => evaluateSeries(s.id, stats));
  const summary = { SUPPORTED_NOW: [], SUPPORTED_WITH_LIMITATIONS: [], DATA_NOT_READY: [] };
  for (const r of rows) summary[r.support].push(r.series);
  return { rows, summary, generated_at: new Date().toISOString() };
}

// series that may currently produce autonomous content (NOW or LIMITED).
export function supportedSeries(stats = {}) {
  return buildSupportMatrix(stats).rows.filter((r) => r.support !== "DATA_NOT_READY");
}
