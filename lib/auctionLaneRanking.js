// Phase 13C.4 - deterministic ordering for the homepage "Auctions ending
// soon" lane (and ONLY that lane - the /deals/auctions browser and All
// Deals ?listing=AUCTION are a separate path via fetchDealsPage).
//
// The lane means: "interesting below-market auctions that are ending
// soon." End time stays PRIMARY - auctions are placed in time tiers
// (soonest tier first) and quality only re-orders WITHIN a tier, so an
// auction ending tomorrow can never outrank one ending in 90 minutes.
//
// An auction's price is a CURRENT BID that can rise. `market_price -
// current_bid` is a "current gap to the market reference", NOT a saving
// and NOT a predicted final price. Nothing here predicts the hammer
// price, recommends a max bid, or estimates the odds it stays cheap.
//
// The score is INTERNAL and never rendered. The card shows the evidence:
// current bid, market reference, "N% under market ref", end time,
// grade/condition, "can rise".
//
// Pure module: no I/O, client-safe, synthetic-fixture testable.
// `freshnessOf` is injected so lib/dealQuality is not pulled in.

// Time tiers, in minutes-to-end. Derived from live inventory: auctions
// almost never end within 30 min, ~a handful end within 2h, ~20 within
// 6h, ~50 within 24h. Anything ending more than 24h out is not "ending
// soon" and is excluded from this lane.
const AUCTION_TIER_MINUTES = [120, 360, 1440];
const AUCTION_MAX_MINUTES = AUCTION_TIER_MINUTES[AUCTION_TIER_MINUTES.length - 1];

// within-tier quality: % under reference and the ABSOLUTE current gap get
// equal weight (a $130 gap on a $250 card is more interesting than a $4
// gap on a $21 card even at a similar %), scaled by reference confidence.
const DISCOUNT_WEIGHT = 0.5;
const GAP_WEIGHT = 0.5;
const DISCOUNT_NORM = 0.65; // matches the flagship discount cap; a bigger
                            // headline % than this is mismatch-risk, not extra quality
const GAP_FULL_USD = 150; // current gap (USD) that earns full gap marks -
                          // auctions in this lane are lower-value than the BIN flagship
const SOFT_REF_FACTOR = 0.85;
const SOFT_REF_DISCOUNT = 0.55;

function minutesToEnd(row, now = Date.now()) {
  const t = Date.parse(row?.auction_end_at ?? "");
  return Number.isFinite(t) ? (t - now) / 60000 : Infinity;
}

function auctionTier(row, now = Date.now()) {
  const m = minutesToEnd(row, now);
  for (let i = 0; i < AUCTION_TIER_MINUTES.length; i++) {
    if (m <= AUCTION_TIER_MINUTES[i]) return i;
  }
  return AUCTION_TIER_MINUTES.length; // beyond the last tier -> not "ending soon"
}

// CURRENT gap to the market reference, USD, from canonical fields only.
// Never a native AUD/GBP/EUR figure. null when there is no valid positive
// gap to rank on. This is NOT a saving.
function currentGapUsd(row) {
  const refUsd = Number(row?.market_price);
  const bidUsd = Number(row?.total_price_usd ?? row?.total_price);
  if (!Number.isFinite(refUsd) || !Number.isFinite(bidUsd)) return null;
  const gap = refUsd - bidUsd;
  return gap > 0 ? gap : null;
}

function hasPositiveReferenceSignal(row) {
  return Boolean(row?.is_graded) || row?.visual_authenticity_status === "MATCH";
}

function referenceConfidenceFactor(row) {
  const discount = Number(row?.discount_pct) || 0;
  if (discount <= SOFT_REF_DISCOUNT) return 1;
  if (hasPositiveReferenceSignal(row)) return 1;
  return SOFT_REF_FACTOR;
}

function discountComponent(row) {
  const d = Number(row?.discount_pct) || 0;
  return Math.max(0, Math.min(d, DISCOUNT_NORM)) / DISCOUNT_NORM;
}

function gapComponent(row) {
  const g = currentGapUsd(row);
  if (g == null) return 0;
  return Math.min(Math.log10(1 + g) / Math.log10(1 + GAP_FULL_USD), 1);
}

// internal, never displayed
function auctionQualityScore(row) {
  const base = DISCOUNT_WEIGHT * discountComponent(row) + GAP_WEIGHT * gapComponent(row);
  return base * referenceConfidenceFactor(row);
}

const FRESHNESS_RANK = { FRESH: 0, AGING: 1, STALE: 2, ENDED: 3 };

// rows: AUCTION rows already through isDisplayableDeal / isPremiumDealEligible.
// opts.freshnessOf(row) -> "FRESH" | "AGING" | ...   (injected)
// opts.now -> ms (injected for tests)
// opts.limit -> max tiles
//
// order: time tier ASC  ->  quality DESC (within tier)  ->  soonest end
//        ASC  ->  FRESH before AGING  ->  local before non-local  ->  id
function rankAuctionLane(rows, { freshnessOf = () => "FRESH", now = Date.now(), limit = 3 } = {}) {
  const eligible = (rows ?? [])
    .filter((r) => r?.listing_type === "AUCTION")
    .filter((r) => minutesToEnd(r, now) <= AUCTION_MAX_MINUTES)
    .filter((r) => currentGapUsd(r) != null); // must be below the reference right now

  const scored = eligible.map((row) => ({
    row,
    tier: auctionTier(row, now),
    score: auctionQualityScore(row),
    ends: minutesToEnd(row, now),
    fresh: FRESHNESS_RANK[freshnessOf(row)] ?? FRESHNESS_RANK.AGING,
    local: row?.is_local ? 0 : 1,
  }));

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.score - a.score ||
      a.ends - b.ends ||
      a.fresh - b.fresh ||
      a.local - b.local ||
      String(a.row.id ?? "").localeCompare(String(b.row.id ?? ""))
  );

  // one tile per canonical card - the strongest eligible listing wins.
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
  AUCTION_TIER_MINUTES,
  AUCTION_MAX_MINUTES,
  DISCOUNT_WEIGHT,
  GAP_WEIGHT,
  DISCOUNT_NORM,
  GAP_FULL_USD,
  SOFT_REF_FACTOR,
  SOFT_REF_DISCOUNT,
  minutesToEnd,
  auctionTier,
  currentGapUsd,
  hasPositiveReferenceSignal,
  referenceConfidenceFactor,
  discountComponent,
  gapComponent,
  auctionQualityScore,
  rankAuctionLane,
};
