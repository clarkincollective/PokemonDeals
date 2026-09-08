// Phase SOCIAL-CREATIVE-4B - CONTEXTUAL VISUAL ENRICHMENT (§5).
//
// "What extra FACTUAL visual evidence would make this story more complete
// and more useful?" - and only ever from real data. No decorative fake
// stats. Every enrichment this returns is backed by a value already in
// the FACT_LOCK or the sanctioned resolver output.
//
// Deterministic. No I/O, no OpenAI.

// The enrichment vocabulary (§5). Each is a small deterministic graphic
// the compositor can lay over the deterministic text layer.
export const ENRICHMENT_KINDS = Object.freeze([
  "price_gap_bar",
  "market_range_bar",
  "pct_distribution",
  "percentile",
  "rank",
  "sample_size_badge",
  "tracked_count_badge",
  "variant_marker",
  "era_set_label",
  "rarity_printing_distinction",
  "timeline_marker",
  "comparison_axis",
  "landed_total_breakdown",
  "mini_stat_strip",
  "category_breakdown",
]);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Plan the enrichments for one story.
 *   factLock  - buildFactLock() output (immutable facts)
 *   contract  - storyContracts entry
 *   resolved  - the sanctioned resolver payload (marketData.*), optional
 *   layout    - the card-forward layout family
 * Returns { enrichments: [{ kind, source, value, label }], rejected: [{kind, why}] }.
 * `source` names the exact fact each enrichment traces to.
 */
export function planEnrichments({ factLock = {}, contract = null, resolved = null, layout = null } = {}) {
  const F = factLock || {};
  const R = resolved?.data ?? resolved ?? {};
  const out = [];
  const rejected = [];

  const add = (kind, source, value, label) => out.push({ kind, source, value, label });
  const skip = (kind, why) => rejected.push({ kind, why });

  // price gap bar - needs a real listed vs reference pair
  const listed = num(F.listed_price) ?? num(R.asking_usd) ?? num(R.priceUsd);
  const market = num(F.market_price) ?? num(R.market_ref_usd) ?? num(R.marketUsd);
  if (listed != null && market != null && market > 0) {
    add("price_gap_bar", "listed_price vs market_price", { listed, market, gap: Math.round((market - listed) * 100) / 100 }, "listed vs market reference");
  } else {
    skip("price_gap_bar", "no real listed+reference pair");
  }

  // market range bar - needs an explicit range (sold points / low-high)
  const soldPts = Array.isArray(R.sold_points) ? R.sold_points.map(num).filter((x) => x != null) : null;
  if (soldPts && soldPts.length >= 2) {
    add("market_range_bar", "resolver.sold_points", { min: Math.min(...soldPts), max: Math.max(...soldPts), mid: market }, "recent sold range");
  } else if (num(R.high?.price_usd) != null && num(R.low?.price_usd) != null) {
    add("market_range_bar", "resolver.high/low", { min: num(R.low.price_usd), max: num(R.high.price_usd) }, "printing price spread");
  }

  // pct distribution - MARKET_SNAPSHOT only, real percentages
  const pcts = Array.isArray(F.percentages) ? F.percentages : null;
  if (num(R.under25Pct) != null || num(R.under_25_pct) != null || (pcts && pcts.length)) {
    const under25 = num(R.under25Pct) ?? num(R.under_25_pct) ?? (pcts ? pcts[0] : null);
    const over100 = num(R.over100Pct) ?? num(R.over_100_pct) ?? (pcts && pcts.length > 1 ? pcts[1] : null);
    if (under25 != null) add("pct_distribution", "resolver.under_25_pct/over_100_pct", { under25, over100 }, "market price distribution");
  }

  // sample / tracked badges
  if (num(F.sample_size) != null) add("sample_size_badge", "fact_lock.sample_size", num(F.sample_size), "sample size");
  if (num(F.tracked_count) != null || num(R.pricedCards) != null || num(R.priced_cards) != null) {
    add("tracked_count_badge", "fact_lock.tracked_count / resolver.priced_cards", num(F.tracked_count) ?? num(R.pricedCards) ?? num(R.priced_cards), "cards tracked");
  }

  // variant / era / printing markers - PRINTING_COMPARE
  if (layout === "printing_compare" || contract?.id === "EXACT_PRINTING_MATTERS") {
    const axis = resolved?.data?.relevance?.axis ?? R.relevance?.axis ?? null;
    if (axis) add("variant_marker", "printing relevance axis", axis, "the printing difference");
    if (R.printing_lesson) add("rarity_printing_distinction", "resolver.printing_lesson", R.printing_lesson, "why it matters");
    if (num(R.multiple) != null) add("comparison_axis", "resolver.multiple", num(R.multiple), "value multiple");
    if (R.high?.set && R.low?.set) add("era_set_label", "resolver.high.set / low.set", { a: R.high.set, b: R.low.set }, "set / era");
  }

  // grade / era label for any card story
  if (F.grade) add("rarity_printing_distinction", "fact_lock.grade", F.grade, "grade");
  if (F.card_set && layout !== "printing_compare") add("era_set_label", "fact_lock.card_set", F.card_set, "set");

  // landed total - AUCTION only
  if (num(F.current_bid) != null && num(F.shipping) != null) {
    add("landed_total_breakdown", "fact_lock.current_bid + shipping", { bid: num(F.current_bid), shipping: num(F.shipping), total: num(F.current_bid) + num(F.shipping) }, "what you actually pay");
  }

  // mini stat strip - only if we have >=2 real numeric facts not already shown
  const numericFacts = ["listed_price", "market_price", "sold_price", "discount_pct", "current_bid", "shipping"].filter((k) => num(F[k]) != null).length;
  if (numericFacts >= 3) add("mini_stat_strip", "fact_lock numeric fields", numericFacts, `${numericFacts} real figures`);

  // THREE_UNDER_25 category breakdown
  if (layout === "three_up" && Array.isArray(R.items) && R.items.length === 3) {
    add("category_breakdown", "resolver.items", R.items.map((it) => ({ price: num(it.price_usd), saved: num(it.discount_pct) })), "three real cards");
  }

  // de-dup by kind (keep the first / most-specific)
  const seen = new Set();
  const enrichments = out.filter((e) => (seen.has(e.kind) ? false : (seen.add(e.kind), true)));

  // §13 - rich but ONE dominant story: cap the number of enrichments so we
  // never clutter. Keep the strongest few.
  const PRIORITY = ["price_gap_bar", "market_range_bar", "variant_marker", "comparison_axis", "pct_distribution", "landed_total_breakdown", "rarity_printing_distinction", "era_set_label", "sample_size_badge", "tracked_count_badge", "percentile", "rank", "timeline_marker", "mini_stat_strip", "category_breakdown"];
  enrichments.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  const MAX = 4;
  const trimmed = enrichments.slice(0, MAX);
  for (const e of enrichments.slice(MAX)) rejected.push({ kind: e.kind, why: "over the clarity cap - one dominant story" });

  return { enrichments: trimmed, rejected, available_from_data: enrichments.map((e) => e.kind) };
}

// A guard the compositor calls: every enrichment MUST name a real source.
export function assertEnrichmentsBacked(enrichments = []) {
  for (const e of enrichments) {
    if (!e || !e.kind || !ENRICHMENT_KINDS.includes(e.kind)) throw new Error(`enrichment: unknown kind "${e?.kind}"`);
    if (!e.source || typeof e.source !== "string") throw new Error(`enrichment ${e.kind}: no real data source - decorative fake stats are forbidden (§5)`);
    if (e.value == null) throw new Error(`enrichment ${e.kind}: no value`);
  }
  return true;
}

export const ENRICHMENT_VERSION = "4b.1";
