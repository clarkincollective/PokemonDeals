// P0 auction-price-integrity: decide how to re-price (or retire) an
// active AUCTION deal row from a fresh eBay listing snapshot.
//
// PURE. No I/O. app/api/verify-deals gets the snapshot (lib/ebay
// getListingSnapshot) and the USD-base FX map (lib/fx) and applies what
// this returns.
//
// Why auctions need this at all: a fixed-price row's price can't move, so
// re-confirming it exists is enough. An auction is discovered at an
// opening bid and its stored `discount_pct` / `total_price*` are frozen at
// that moment - as bids come in the real landed price climbs, and without
// re-pricing the row keeps advertising the opening-bid discount. Once the
// recomputed discount falls below the publish floor the row is no longer a
// deal and is retired (never grandfathered).

const { toUsd } = require("./fx");
const { DEAL_DISCOUNT_THRESHOLD } = require("./dealQuality");

const MARKETPLACE_CURRENCY = {
  EBAY_US: "USD",
  EBAY_GB: "GBP",
  EBAY_AU: "AUD",
  EBAY_CA: "CAD",
  EBAY_DE: "EUR",
  EBAY_IT: "EUR",
};

// eBay auction bids are monotonic (they only ever go up). A snapshot that
// reports a CURRENT BID meaningfully below what we already stored is a bad
// / partial response, not a real price drop - treat it as inconclusive
// rather than lowering a stored bid (which would fabricate a bigger
// discount than is real).
const BID_REGRESSION_EPS = 0.02; // 2% tolerance for rounding / fee jitter

// row: the stored deals row (needs price, shipping, total_price,
//      total_price_usd, currency, marketplace, market_price, bid_count).
// snapshot: lib/ebay getListingSnapshot result.
// rates: lib/fx getUsdRates() map. nowIso: timestamp string to stamp.
//
// returns one of:
//   { action: "retire",   patch, reason }   -> set is_active=false (+patch)
//   { action: "reprice",  patch, reason }   -> apply patch, stays active
//   { action: "none",     reason }          -> leave the row untouched
function repricedAuctionPatch({ row, snapshot, rates, nowIso = new Date().toISOString() }) {
  if (!row || !snapshot) return { action: "none", reason: "no_input" };

  if (snapshot.status === "ENDED") {
    return { action: "retire", patch: { exact_verified_at: nowIso }, reason: "listing_ended" };
  }
  if (snapshot.status === "SOLD") {
    return { action: "retire", patch: { exact_verified_at: nowIso }, reason: "listing_sold" };
  }
  if (snapshot.status !== "ACTIVE") {
    return { action: "none", reason: "inconclusive_status" };
  }
  // A fixed-price listing must not be re-priced by this path (BIN
  // behaviour is unchanged). If eBay now reports this listing as
  // fixed-price, just leave it for the normal freshness path.
  if (snapshot.listingType && snapshot.listingType !== "AUCTION") {
    return { action: "none", reason: "not_auction_live" };
  }

  const bidNative = Number(snapshot.price);
  if (!Number.isFinite(bidNative) || bidNative <= 0) {
    return { action: "none", reason: "no_live_price" };
  }
  const storedBid = Number(row.price);
  if (Number.isFinite(storedBid) && storedBid > 0 && bidNative < storedBid * (1 - BID_REGRESSION_EPS)) {
    return { action: "none", reason: "bid_regression" };
  }

  const shipNative = Number.isFinite(Number(snapshot.shipping)) && Number(snapshot.shipping) > 0
    ? Number(snapshot.shipping)
    : 0;
  const currency =
    snapshot.currency || row.currency || MARKETPLACE_CURRENCY[row.marketplace] || "USD";
  const totalNative = bidNative + shipNative;
  const totalUsd = toUsd(totalNative, currency, rates);
  const marketUsd = Number(row.market_price);
  const discountPct =
    Number.isFinite(marketUsd) && marketUsd > 0 ? (marketUsd - totalUsd) / marketUsd : null;

  const patch = {
    price: bidNative,
    shipping: shipNative,
    total_price: totalNative,
    total_price_usd: totalUsd,
    currency,
    bid_count: snapshot.bidCount != null ? snapshot.bidCount : row.bid_count ?? null,
    discount_pct: discountPct,
    last_seen_at: nowIso,
    exact_verified_at: nowIso,
  };

  if (discountPct == null || discountPct < DEAL_DISCOUNT_THRESHOLD) {
    // Numbers are now truthful on the row, but it is no longer a deal.
    return { action: "retire", patch: { ...patch, is_active: false }, reason: "below_threshold" };
  }
  return { action: "reprice", patch, reason: "repriced" };
}

module.exports = { repricedAuctionPatch, BID_REGRESSION_EPS, MARKETPLACE_CURRENCY };
