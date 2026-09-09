// Phase SOCIAL-AUTOPILOT-1 §2 - DAILY SOCIAL STORY DISCOVERY ENGINE.
//
// Reuses the EXISTING real-data resolvers (lib/social/newsroom/marketData)
// unchanged - this module does not re-implement any query they already
// run. It wraps each resolver's result into a STANDARDIZED discovery
// candidate whose `facts` object is shaped exactly to
// storySnapshot.SNAPSHOT_FIELDS, so a candidate can be frozen immediately
// after selection with no further DB reads.
//
// Buckets implemented this phase (real DB data, per §2):
//   A. LIVE DEALS            - DEAL_DROP, THREE_UNDER_25
//   B. MARKET INTELLIGENCE   - MARKET_SNAPSHOT, PRICE_BAND_INSIGHT
//   C. PRICE EDUCATION       - ASKING_VS_SOLD
//   D. PRINTING EDUCATION    - PRINTING_COMPARE (exact-relevance gated)
//   G. EVERGREEN EDUCATION   - fixed, DB-independent fallback angles
//
// NOT implemented this phase (§2 sections E/F): POKEMON_MARKET_SNAPSHOT /
// SET_MARKET_SNAPSHOT / MOST_ACCESSIBLE_CARDS / ENTRY_POINTS (need a
// per-species/per-set aggregation query this phase does not add) and every
// TREND family (NEW_DEALS_APPEARING / PRICE_BAND_SHIFT / ...  - a trend
// claim requires a historical comparison this phase does not build; §2 is
// explicit that a trend must never be manufactured from one observation).
// Both are left for a future phase rather than faked.

import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  resolveAskingVsSold, resolveMarketShape, resolveThreeUnder, resolvePrintingPair,
} from "../social/newsroom/marketData.mjs";

export const STORY_DISCOVERY_VERSION = "auto1.1";

// §2G - evergreen collector education. No live numbers are claimed (no
// timeframe, no source_statements) - these are always eligible content,
// used to fill days when live data is thin, never to replace a strong
// live story.
export const EVERGREEN_ANGLES = Object.freeze([
  {
    id: "evergreen_compare_before_buying",
    headline_fact: "An asking price is not the same thing as market value.",
    lesson: "Compare an asking price against real recent market evidence before judging whether a listing is a deal.",
  },
  {
    id: "evergreen_exact_printing_matters",
    headline_fact: "The exact printing of a card changes what it is worth.",
    lesson: "1st Edition vs Unlimited, Shadowless vs Unlimited, and holo vs non-holo are different collectibles, not the same card at a different price.",
  },
  {
    id: "evergreen_condition_matters",
    headline_fact: "Condition materially changes a card's value.",
    lesson: "The same printing can be worth very different amounts depending on centering, edge wear, and surface condition.",
  },
  {
    id: "evergreen_raw_vs_graded",
    headline_fact: "A raw card and a graded card are priced differently for real reasons.",
    lesson: "Grading verifies condition and authenticity; that verification itself carries value beyond the card.",
  },
]);

function familyCandidate({ family, series, angle, facts, cards = [], priority = 5, editorialAngle }) {
  return { family, series, angle, editorialAngle: editorialAngle ?? angle, facts, cards, priority, bucket: familyBucket(family) };
}

function familyBucket(family) {
  if (family === "deal_drop" || family === "three_under_25") return "LIVE_DEALS";
  if (family === "market_snapshot" || family === "price_band_insight") return "MARKET_INTELLIGENCE";
  if (family === "asking_vs_sold") return "PRICE_EDUCATION";
  if (family === "printing_compare") return "PRINTING_EDUCATION";
  if (family === "evergreen") return "EVERGREEN_EDUCATION";
  return "OTHER";
}

// §2B - PRICE_BAND_INSIGHT: what portion of the tracked catalogue sits
// under $10/$25/$50/$100. Only meaningful once the catalogue is large
// enough to make a percentage claim honest.
async function resolvePriceBandInsight({ minCatalogSize = 500 } = {}) {
  const db = supabaseAdmin();
  const [{ count: total }, { count: u10 }, { count: u25 }, { count: u50 }, { count: u100 }] = await Promise.all([
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0),
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0).lt("market_price", 10),
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0).lt("market_price", 25),
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0).lt("market_price", 50),
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0).lt("market_price", 100),
  ]);
  if (!total || total < minCatalogSize) return { ok: false, reason: "VISUALLY_UNDERPOWERED_DATA", detail: `catalogue too small for a price-band claim (${total ?? 0} priced rows)` };
  const pct = (n) => Math.round((n / total) * 1000) / 10;
  return {
    ok: true,
    data: { tracked_population: total, bands: { under_10: pct(u10), under_25: pct(u25), under_50: pct(u50), under_100: pct(u100) } },
    cards: [],
  };
}

// §1 - each resolver's raw shape is mapped inline (below) into the frozen-
// snapshot fact shape. Every candidate's `facts` is already exactly what
// buildStorySnapshot expects - no further derivation happens after this.
export async function discoverCandidates({ now = Date.now() } = {}) {
  const candidates = [];
  const rejected = [];

  // --- A. LIVE DEALS ---
  const deal = await resolveAskingVsSold({ minDiscount: 0.35, minMarket: 20 }).catch((e) => ({ ok: false, reason: "ERR", detail: e.message }));
  if (deal?.ok) {
    candidates.push(familyCandidate({
      family: "deal_drop", series: "DEAL_DROP", angle: "a real live listing sitting meaningfully under market",
      facts: {
        source_records: [{ type: "deal", id: deal.data.tcgplayerId }],
        canonical_card_ids: [deal.data.tcgplayerId],
        canonical_card_metadata: { name: deal.data.card_name, set: deal.data.card_set },
        prices: { asking_usd: deal.data.asking_usd },
        market_reference_values: { market_ref_usd: deal.data.market_ref_usd },
        derived_percentages: { below_market_pct: deal.data.gap_pct },
        tracked_population: null,
        distribution_values: null,
        comparison_direction: "BELOW_MARKET",
        timeframe: null,
        source_statements: null,
        semantic_scope: "SINGLE_LISTING",
        fact_trace: [{ field: "asking_usd", source: "deals.total_price_usd" }, { field: "market_ref_usd", source: "deals.market_price" }],
        fact_lock_hash: null,
        visualization_manifest: null,
        classification: "COMMERCIAL",
        cta_class: "WEBSITE_FIRST",
        disclosure_required: true,
        data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: deal.cards, priority: 8,
    }));
  } else rejected.push({ family: "deal_drop", reason: deal?.reason ?? "UNKNOWN", detail: deal?.detail ?? null });

  const threeUnder = await resolveThreeUnder({ cap: 25, n: 3 }).catch((e) => ({ ok: false, reason: "ERR", detail: e.message }));
  if (threeUnder?.ok) {
    candidates.push(familyCandidate({
      family: "three_under_25", series: "THREE_UNDER_25", angle: "three legitimate affordable opportunities, grouped coherently",
      facts: {
        source_records: threeUnder.data.items.map((i) => ({ type: "deal", id: i.tcgplayerId })),
        canonical_card_ids: threeUnder.data.items.map((i) => i.tcgplayerId),
        canonical_card_metadata: Object.fromEntries(threeUnder.data.items.map((i) => [i.tcgplayerId, { name: i.card_name, set: i.card_set }])),
        prices: Object.fromEntries(threeUnder.data.items.map((i) => [i.tcgplayerId, i.price_usd])),
        market_reference_values: Object.fromEntries(threeUnder.data.items.map((i) => [i.tcgplayerId, i.market_usd])),
        derived_percentages: Object.fromEntries(threeUnder.data.items.map((i) => [i.tcgplayerId, i.discount_pct])),
        tracked_population: null, distribution_values: null, comparison_direction: "BELOW_MARKET",
        timeframe: null, source_statements: null, semantic_scope: "THREE_LISTINGS",
        fact_trace: threeUnder.data.items.map((i) => ({ field: `price_usd:${i.tcgplayerId}`, source: "deals.total_price_usd" })),
        fact_lock_hash: null, visualization_manifest: null, classification: "COMMERCIAL",
        cta_class: "WEBSITE_FIRST", disclosure_required: true, data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: threeUnder.cards, priority: 6,
    }));
  } else rejected.push({ family: "three_under_25", reason: threeUnder?.reason ?? "UNKNOWN", detail: threeUnder?.detail ?? null });

  // --- B. MARKET INTELLIGENCE ---
  const shape = await resolveMarketShape().catch((e) => ({ ok: false, reason: "ERR", detail: e.message }));
  if (shape?.ok) {
    candidates.push(familyCandidate({
      family: "market_snapshot", series: "MARKET_SNAPSHOT", angle: "the shape of the whole tracked market, illustrated by one real example",
      facts: {
        source_records: [{ type: "catalog_aggregate" }],
        canonical_card_ids: shape.data.featured ? [shape.data.featured.tcgplayerId] : [],
        canonical_card_metadata: shape.data.featured ? { name: shape.data.featured.card_name } : {},
        prices: null, market_reference_values: null,
        derived_percentages: { under_25_pct: shape.data.under_25_pct, over_100_pct: shape.data.over_100_pct },
        tracked_population: shape.data.priced_cards,
        distribution_values: { under_25_pct: shape.data.under_25_pct, mid_pct: Math.round((100 - shape.data.under_25_pct - shape.data.over_100_pct) * 10) / 10, over_100_pct: shape.data.over_100_pct },
        comparison_direction: null, timeframe: null, source_statements: null, semantic_scope: "GLOBAL_TRACKED_POPULATION",
        fact_trace: [{ field: "under_25_pct", source: "card_catalog aggregate count" }],
        fact_lock_hash: null, visualization_manifest: null, classification: "EDITORIAL",
        cta_class: "WEBSITE_FIRST", disclosure_required: false, data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: shape.cards, priority: 7,
    }));
  } else rejected.push({ family: "market_snapshot", reason: shape?.reason ?? "UNKNOWN", detail: shape?.detail ?? null });

  const bands = await resolvePriceBandInsight().catch((e) => ({ ok: false, reason: "ERR", detail: e.message }));
  if (bands?.ok) {
    candidates.push(familyCandidate({
      family: "price_band_insight", series: "PRICE_BAND_INSIGHT", angle: "what portion of the market sits in each price band",
      facts: {
        source_records: [{ type: "catalog_aggregate" }], canonical_card_ids: [], canonical_card_metadata: {},
        prices: null, market_reference_values: null, derived_percentages: bands.data.bands,
        tracked_population: bands.data.tracked_population, distribution_values: bands.data.bands,
        comparison_direction: null, timeframe: null, source_statements: null, semantic_scope: "GLOBAL_TRACKED_POPULATION",
        fact_trace: [{ field: "bands", source: "card_catalog aggregate count" }],
        fact_lock_hash: null, visualization_manifest: null, classification: "EDITORIAL",
        cta_class: "WEBSITE_FIRST", disclosure_required: false, data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: [], priority: 4,
    }));
  } else rejected.push({ family: "price_band_insight", reason: bands?.reason ?? "UNKNOWN", detail: bands?.detail ?? null });

  // --- C. PRICE EDUCATION ---
  const askEdu = await resolveAskingVsSold({ minDiscount: 0.2, minMarket: 20 }).catch((e) => ({ ok: false, reason: "ERR", detail: e.message }));
  if (askEdu?.ok) {
    candidates.push(familyCandidate({
      family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", angle: "asking price contrasted against verified market reference - a buyer lesson",
      facts: {
        source_records: [{ type: "deal", id: askEdu.data.tcgplayerId }],
        canonical_card_ids: [askEdu.data.tcgplayerId],
        canonical_card_metadata: { name: askEdu.data.card_name, set: askEdu.data.card_set },
        prices: { asking_usd: askEdu.data.asking_usd }, market_reference_values: { market_ref_usd: askEdu.data.market_ref_usd },
        derived_percentages: { gap_pct: askEdu.data.gap_pct },
        tracked_population: null, distribution_values: null, comparison_direction: askEdu.data.gap_pct >= 0 ? "BELOW_MARKET" : "ABOVE_MARKET",
        timeframe: null, source_statements: null, semantic_scope: "SINGLE_LISTING",
        fact_trace: [{ field: "asking_usd", source: "deals.total_price_usd" }, { field: "market_ref_usd", source: "deals.market_price" }],
        fact_lock_hash: null, visualization_manifest: null, classification: "EDITORIAL",
        cta_class: "WEBSITE_FIRST", disclosure_required: true, data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: askEdu.cards, priority: 5,
    }));
  } else rejected.push({ family: "asking_vs_sold", reason: askEdu?.reason ?? "UNKNOWN", detail: askEdu?.detail ?? null });

  // --- D. PRINTING / CARD EDUCATION ---
  const printing = await resolvePrintingPair().catch((e) => ({ ok: false, reason: "ERR", detail: e.message }));
  if (printing?.ok) {
    candidates.push(familyCandidate({
      family: "printing_compare", series: "EXACT_PRINTING_MATTERS", angle: `${printing.data.printing_lesson}`,
      facts: {
        source_records: [{ type: "catalog", id: printing.data.high.tcgplayerId }, { type: "catalog", id: printing.data.low.tcgplayerId }],
        canonical_card_ids: [printing.data.high.tcgplayerId, printing.data.low.tcgplayerId],
        canonical_card_metadata: { [printing.data.high.tcgplayerId]: printing.data.high, [printing.data.low.tcgplayerId]: printing.data.low },
        prices: { [printing.data.high.tcgplayerId]: printing.data.high.price_usd, [printing.data.low.tcgplayerId]: printing.data.low.price_usd },
        market_reference_values: null, derived_percentages: { multiple: printing.data.multiple },
        tracked_population: null, distribution_values: null, comparison_direction: null,
        timeframe: null, source_statements: null, semantic_scope: "TWO_PRINTINGS_SAME_SPECIES",
        fact_trace: [{ field: "multiple", source: "printingComparisonRelevance" }],
        fact_lock_hash: null, visualization_manifest: null, classification: "EDITORIAL",
        cta_class: "WEBSITE_FIRST", disclosure_required: false, data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: printing.cards, priority: 6,
    }));
  } else rejected.push({ family: "printing_compare", reason: printing?.reason ?? "UNKNOWN", detail: printing?.detail ?? null });

  // --- G. EVERGREEN (always available, no live numbers claimed) ---
  for (const ev of EVERGREEN_ANGLES) {
    candidates.push(familyCandidate({
      family: "evergreen", series: "EVERGREEN_EDUCATION", angle: ev.headline_fact, editorialAngle: ev.lesson,
      facts: {
        source_records: [], canonical_card_ids: [], canonical_card_metadata: {},
        prices: null, market_reference_values: null, derived_percentages: null, tracked_population: null, distribution_values: null,
        comparison_direction: null, timeframe: null, source_statements: null, semantic_scope: "EVERGREEN",
        fact_trace: [], fact_lock_hash: null, visualization_manifest: null, classification: "EDITORIAL",
        cta_class: "WEBSITE_FIRST", disclosure_required: false, data_freshness: { captured_at: new Date(now).toISOString() },
      },
      cards: [], priority: 2,
    }));
  }

  return { candidates, rejected, discovered: candidates.length + rejected.length };
}
