// Phase SOCIAL-NEWSROOM-1 - SERIES REGISTRY (§6) + per-series data
// requirements (§7) + shelf-life class (§8) + CTA intensity (§21).
//
// A SERIES is a repeatable editorial format inside a PILLAR. Each entry
// declares EXACTLY what real factual fields it needs so supportMatrix.mjs
// can decide SUPPORTED_NOW / SUPPORTED_WITH_LIMITATIONS / DATA_NOT_READY
// against a live read - no series is ever run on fabricated data.
//
// `requires` values are checked by supportMatrix.mjs against a stats
// object it builds from a read-only DB snapshot. `baseline` is the
// conservative expectation absent a live read (used by tests + docs).
//
// Pure data. No I/O.

import { PILLAR_GOAL } from "./pillars.mjs";

// CTA_INTENSITY lives in ./ctaIntensity.mjs (single definition).
// platform ids match lib/social/planner/platformRoles serviceOf() coarse keys
export const PLATFORMS = Object.freeze(["instagram", "tiktok", "x", "youtube"]);

// helper to keep entries terse
const S = (id, pillar, clock, requires, opts = {}) => ({
  id,
  pillar,
  clock, // LIVE | SHORT | EDITORIAL | EVERGREEN
  goal: opts.goal ?? PILLAR_GOAL[pillar] ?? "TRUST",
  cta: opts.cta ?? "SOFT",
  requires: Object.freeze(requires),
  platforms: Object.freeze(opts.platforms ?? PLATFORMS),
  narrative: Boolean(opts.narrative),
  // conservative static support baseline; supportMatrix.mjs overrides it
  // from a live read.
  baseline: opts.baseline ?? "SUPPORTED_WITH_LIMITATIONS",
  note: opts.note ?? null,
});

export const SERIES_REGISTRY = Object.freeze([
  // ---------------- DEALS ----------------
  S("DEAL_DROP", "DEALS", "LIVE", ["fresh_bin_deal"], { cta: "HARD", baseline: "SUPPORTED_NOW", note: "reuses lib/social deal_drop family" }),
  S("DEAL_OF_THE_DAY", "DEALS", "SHORT", ["fresh_bin_deal"], { cta: "HARD", baseline: "SUPPORTED_WITH_LIMITATIONS", note: "best single fresh BIN of the day; SHORT only if facts frozen" }),
  S("BIGGEST_FIND_WEEK", "DEALS", "EDITORIAL", ["weekly_top_deal_history"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("THREE_UNDER_25", "DEALS", "SHORT", ["multi_fresh_bin_under_25"], { cta: "HARD", baseline: "SUPPORTED_NOW", note: "reuses hook_carousel; data-gated" }),
  S("THREE_UNDER_50", "DEALS", "SHORT", ["multi_fresh_bin_under_50"], { cta: "HARD", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("THREE_UNDER_100", "DEALS", "SHORT", ["multi_fresh_bin_under_100"], { cta: "HARD", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("GRADED_DEAL", "DEALS", "LIVE", ["fresh_bin_deal", "graded_deal"], { cta: "HARD", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("SET_DEAL_HUNT", "DEALS", "SHORT", ["multi_fresh_bin_same_set"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("PRICE_DROP", "DEALS", "LIVE", ["deal_price_history"], { cta: "HARD", baseline: "DATA_NOT_READY", note: "needs a per-listing price-drop signal not currently persisted for BINs" }),
  S("NEW_LISTING_ALERT", "DEALS", "LIVE", ["fresh_bin_deal", "recent_discovery"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),

  // ---------------- COMPARISON ----------------
  S("SAME_CARD_DIFFERENT_PRICES", "COMPARISON", "SHORT", ["multi_listing_same_printing"], { cta: "SOFT", narrative: true, baseline: "DATA_NOT_READY", note: "needs >=2 live comparable listings for the exact same printing" }),
  S("RAW_VS_GRADED", "COMPARISON", "EDITORIAL", ["raw_and_graded_reference"], { cta: "SOFT", baseline: "DATA_NOT_READY", note: "needs comparable raw + graded market references for one card" }),
  S("GRADE_LADDER", "COMPARISON", "EDITORIAL", ["multi_grade_reference"], { cta: "SOFT", baseline: "DATA_NOT_READY" }),
  S("REGION_PRICE_GAP", "COMPARISON", "SHORT", ["same_printing_multi_marketplace"], { cta: "SOFT", baseline: "DATA_NOT_READY", note: "needs FX-normalised comparable listings across marketplaces" }),
  S("VINTAGE_VS_MODERN", "COMPARISON", "EVERGREEN", ["vintage_and_modern_reference"], { cta: "NONE", baseline: "SUPPORTED_WITH_LIMITATIONS" }),

  // ---------------- MARKET ----------------
  S("WEEKLY_WINNERS_LOSERS", "MARKET", "EDITORIAL", ["price_history_observations"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_WITH_LIMITATIONS", note: "reuses lib/social/marketSnapshot + priceMovement" }),
  S("MARKET_SNAPSHOT", "MARKET", "EDITORIAL", ["catalog_price_distribution"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW", note: "reuses lib/social/marketSnapshot" }),
  S("SET_WATCH", "MARKET", "EDITORIAL", ["set_price_observations"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("POKEMON_WATCH", "MARKET", "EDITORIAL", ["species_price_observations"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("QUIET_CLIMBERS", "MARKET", "EDITORIAL", ["price_history_observations", "low_volatility_uptrend"], { cta: "NONE", baseline: "DATA_NOT_READY" }),
  S("HISTORICAL_DEEP_DIVE", "MARKET", "EVERGREEN", ["long_price_history"], { cta: "NONE", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("BIGGEST_MOVERS", "MARKET", "EDITORIAL", ["price_history_observations"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_WITH_LIMITATIONS", note: "reuses lib/social market_mover family" }),

  // ---------------- BUDGET ----------------
  S("WHAT_25_BUYS", "BUDGET", "SHORT", ["multi_fresh_bin_under_25"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("WHAT_50_BUYS", "BUDGET", "SHORT", ["multi_fresh_bin_under_50"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("WHAT_100_BUYS", "BUDGET", "SHORT", ["multi_fresh_bin_under_100"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("BUDGET_COLLECTION", "BUDGET", "EDITORIAL", ["catalog_price_distribution"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("SLABS_UNDER_X", "BUDGET", "SHORT", ["multi_fresh_graded_bin"], { cta: "SOFT", baseline: "DATA_NOT_READY" }),
  S("VINTAGE_UNDER_X", "BUDGET", "EDITORIAL", ["vintage_bin_inventory"], { cta: "SOFT", baseline: "SUPPORTED_WITH_LIMITATIONS" }),

  // ---------------- EDUCATION ----------------
  S("WHY_SOLD_PRICES_MATTER", "EDUCATION", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("SHIPPING_CHANGES_DEAL", "EDUCATION", "EVERGREEN", ["deal_with_shipping_delta"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_WITH_LIMITATIONS", note: "best with a real example where shipping flips the maths" }),
  S("EXACT_PRINTING_MATTERS", "EDUCATION", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("AUCTION_BID_VS_TOTAL", "EDUCATION", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("RAW_VS_GRADED_EXPLAINER", "EDUCATION", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("MARKET_REFERENCE_EXPLAINER", "EDUCATION", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),

  // ---------------- BEHIND_THE_FINDER ----------------
  S("WHY_WE_REJECTED_IT", "BEHIND_THE_FINDER", "EDITORIAL", ["safe_rejection_example"], { cta: "NONE", narrative: true, baseline: "SUPPORTED_WITH_LIMITATIONS", note: "only non-defamatory disqualified_reason values; never a fraud accusation" }),
  S("HOW_MATCHING_WORKS", "BEHIND_THE_FINDER", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("LOT_DETECTION_EXPLAINER", "BEHIND_THE_FINDER", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("IMAGE_VERIFICATION_EXPLAINER", "BEHIND_THE_FINDER", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("HOW_WE_FIND_DEALS", "BEHIND_THE_FINDER", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),

  // ---------------- STORY ----------------
  S("THOUGHT_IT_WAS_A_DEAL", "STORY", "EDITORIAL", ["safe_rejection_example"], { cta: "NONE", narrative: true, baseline: "SUPPORTED_WITH_LIMITATIONS" }),
  S("THREE_SELLERS_ONE_CARD", "STORY", "SHORT", ["multi_listing_same_printing"], { cta: "SOFT", narrative: true, baseline: "DATA_NOT_READY" }),
  S("CHEAPEST_WASNT_CHEAPEST", "STORY", "SHORT", ["multi_listing_same_printing", "shipping_flips_ranking"], { cta: "SOFT", narrative: true, baseline: "DATA_NOT_READY" }),
  S("PRICE_STORY", "STORY", "EDITORIAL", ["long_price_history"], { cta: "NONE", narrative: true, baseline: "SUPPORTED_WITH_LIMITATIONS" }),

  // ---------------- BRAND ----------------
  S("PRODUCT_EXPLAINER", "BRAND", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW", note: "reuses lib/social brand_ad family" }),
  S("METHODOLOGY", "BRAND", "EVERGREEN", [], { cta: "BRAND_ONLY", baseline: "SUPPORTED_NOW" }),
  S("WEEKLY_RECAP", "BRAND", "EDITORIAL", ["weekly_activity_summary"], { cta: "BRAND_ONLY", baseline: "SUPPORTED_WITH_LIMITATIONS" }),
]);

const BY_ID = Object.freeze(Object.fromEntries(SERIES_REGISTRY.map((s) => [s.id, s])));

export function getSeries(id) {
  return BY_ID[String(id || "").toUpperCase()] ?? null;
}

export function seriesInPillar(pillar) {
  const p = String(pillar || "").toUpperCase();
  return SERIES_REGISTRY.filter((s) => s.pillar === p);
}

// every distinct factual field name any series needs (for supportMatrix
// coverage + docs).
export function allRequiredFacts() {
  return [...new Set(SERIES_REGISTRY.flatMap((s) => s.requires))].sort();
}
