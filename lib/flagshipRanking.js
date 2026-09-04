// Phase 13C.2 - deterministic internal ranking for the homepage flagship
// "Best deals right now" lane and its /best-finds expansion.
//
// The lane answers ONE collector question:
//   "Show me a great Pokemon card, below a trustworthy market reference,
//    that I could actually buy right now."
//
// So the ranking:
//   1. EXCLUDES auctions. An auction's price is a current bid that can
//      rise - it is not a "buy now" price. Auctions keep their own
//      "Auctions ending soon" lane; nothing here changes that.
//   2. blends the % below market with the ABSOLUTE dollars saved, so a
//      $180 card at 55% off ($99 saved) is not buried under an $80 card
//      at 63% off ($50 saved).
//   3. softens a large discount taken against a weak reference basis - a
//      raw card with no positive authenticity signal, discounted hard,
//      is more likely a condition/edition mismatch than a rare bargain.
//   4. uses freshness only to break ties (never to put a slightly newer
//      listing above a materially better deal).
//
// The score is INTERNAL and never rendered. The visible evidence on the
// card - price, struck market reference, "Save $X - N% below market",
// "Buy It Now" - is what justifies the order. No public "Deal Score".
//
// Pure module: no I/O, no next/cache, client-safe, synthetic-fixture
// testable. `dealFreshness` is injected so lib/dealQuality is not pulled
// in here.

// --- the six ranking constants, each with a reason -----------------------
// "% below market" and "dollars actually saved" get equal billing - a
// hard discount on a cheap card and a modest discount on a valuable card
// are both real, and neither should automatically bury the other.
const DISCOUNT_WEIGHT = 0.5;
const SAVING_WEIGHT = 0.5;
// normaliser for the discount component: the flagship discount cap
// (BEST_FINDS_MAX_DISCOUNT_PCT in lib/deals.js). A listing at the cap
// scores the full discount component.
const DISCOUNT_NORM = 0.65;
// the absolute USD saving that earns the full saving component. Chosen
// from live inventory: flagship market references cluster around
// $100-$200, so a ~$300 saving is a genuinely standout result.
const SAVING_FULL_USD = 300;
// multiplier applied to a hard discount that has no positive reference
// signal - a soft penalty, not exclusion (keeps the lane populated when
// verified inventory is thin).
const SOFT_REF_FACTOR = 0.85;
// discounts at or below this are unremarkable against any reasonable
// reference and are never penalised; only steeper discounts need a
// positive authenticity signal to rank at full weight.
const SOFT_REF_DISCOUNT = 0.55;

// A live auction is never flagship inventory. Treat an explicit
// "AUCTION" as the only exclusion (a null / "FIXED_PRICE" / "BIN" style
// value is a buy-now listing).
function isFlagshipListingType(row) {
  return row?.listing_type !== "AUCTION";
}

// Absolute saving in USD from the canonical fields only: market_price is
// already a USD reference; total_price_usd is the pre-computed USD
// equivalent of what the buyer pays. Never subtract a native AUD/GBP/EUR
// figure from a USD reference. null when there is no valid positive
// saving to rank on.
function savingUsd(row) {
  const marketUsd = Number(row?.market_price);
  const paidUsd = Number(row?.total_price_usd ?? row?.total_price);
  if (!Number.isFinite(marketUsd) || !Number.isFinite(paidUsd)) return null;
  const saving = marketUsd - paidUsd;
  return saving > 0 ? saving : null;
}

// A strong basis for the market reference we are discounting against:
// graded slabs are priced against grade-specific sold data and
// authenticated by the grader; a completed visual MATCH confirms the
// listing really is the catalogue card.
function hasPositiveReferenceSignal(row) {
  return Boolean(row?.is_graded) || row?.visual_authenticity_status === "MATCH";
}

// 1.0 = rank at full weight; SOFT_REF_FACTOR = soft-penalised.
function referenceConfidenceFactor(row) {
  const discount = Number(row?.discount_pct) || 0;
  if (discount <= SOFT_REF_DISCOUNT) return 1;
  if (hasPositiveReferenceSignal(row)) return 1;
  return SOFT_REF_FACTOR;
}

// 0..1
function discountComponent(row) {
  const d = Number(row?.discount_pct) || 0;
  return Math.max(0, Math.min(d, DISCOUNT_NORM)) / DISCOUNT_NORM;
}

// 0..1, log-scaled: a very large saving still ranks higher, but does not
// crush a solid mid-size saving by its raw ratio.
function savingComponent(row) {
  const s = savingUsd(row);
  if (s == null) return 0;
  return Math.min(Math.log10(1 + s) / Math.log10(1 + SAVING_FULL_USD), 1);
}

// The internal composite. Not displayed anywhere.
function flagshipScore(row) {
  const base =
    DISCOUNT_WEIGHT * discountComponent(row) + SAVING_WEIGHT * savingComponent(row);
  return base * referenceConfidenceFactor(row);
}

const FRESHNESS_RANK = { FRESH: 0, AGING: 1, STALE: 2, ENDED: 3 };

// rows: display rows already through isDisplayableDeal / isPremiumDealEligible.
// opts.freshnessOf(row) -> "FRESH" | "AGING" | ... (injected).
// opts.preferLocal: in a country view, in-country listings rank first
//   (no shipping wait) - mirrors the pre-13C.2 `is_local` DB ordering.
// opts.limit: max flagship tiles to return (fewer is fine - never padded).
function rankFlagshipDeals(rows, { freshnessOf = () => "FRESH", preferLocal = false, limit = 4 } = {}) {
  const eligible = (rows ?? [])
    .filter(isFlagshipListingType)
    .filter((r) => savingUsd(r) != null);

  const scored = eligible.map((row) => ({
    row,
    score: flagshipScore(row),
    local: preferLocal && row?.is_local ? 1 : 0,
    fresh: FRESHNESS_RANK[freshnessOf(row)] ?? FRESHNESS_RANK.AGING,
  }));

  scored.sort(
    (a, b) =>
      b.local - a.local ||
      b.score - a.score ||
      a.fresh - b.fresh ||
      (Number(b.row.discount_pct) || 0) - (Number(a.row.discount_pct) || 0) ||
      String(a.row.id ?? "").localeCompare(String(b.row.id ?? ""))
  );

  // one flagship tile per canonical card (never two listings of the same
  // print) - the strongest listing wins the slot, the next slot goes to a
  // different card.
  const seen = new Set();
  const out = [];
  for (const { row } of scored) {
    const key =
      row.watchlist_id ??
      row.card_catalog_id ??
      `${row.card_name ?? row.watchlist?.name}|${row.card_set ?? row.watchlist?.set}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  DISCOUNT_WEIGHT,
  SAVING_WEIGHT,
  DISCOUNT_NORM,
  SAVING_FULL_USD,
  SOFT_REF_FACTOR,
  SOFT_REF_DISCOUNT,
  isFlagshipListingType,
  savingUsd,
  hasPositiveReferenceSignal,
  referenceConfidenceFactor,
  discountComponent,
  savingComponent,
  flagshipScore,
  rankFlagshipDeals,
};
