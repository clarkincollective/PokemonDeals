// Phase INFRA-DB-1 - the deal-pool cache shape, isolated in a dependency-
// free module so both lib/deals.js (Next runtime) and
// scripts/infraDbHealth.mjs / the scanner tests (plain node) can share
// ONE definition with no next/cache or "@/..." alias import.
//
// Context: fetchDealsPool was `select("*")` over up to 2000 active rows.
// Serialised that is ~1.9 MB at today's low inventory and 3-4 MB at a
// full ~12k active English catalogue - past Next's ~2 MB data-cache entry
// ceiling, so Next silently refused to cache it and every cache-miss
// request hit Supabase directly. That uncacheable pool was a primary
// driver of the "exhausting multiple resources" Supabase warning.

// Row ceiling for the pool (was 2000). Measured avg ~1.1 KB/row after the
// projection below => ~1.3 MB even at full inventory, comfortably under
// 2 MB with headroom. The paginated /deals browse views use fetchDealsPage
// (real offset pagination, untouched); the pool only feeds the homepage
// grid + /japanese-cards default view, which show a rotating window of at
// most a few dozen tiles.
export const DEAL_POOL_MAX_ROWS = 1200;

// Columns fetched from Supabase for the pool query: the union of what the
// pre-cache display gate (lib/dealQuality.isDisplayableDeal) reads and
// what the post-cache consumers read. Explicit so a new need is a
// deliberate edit, never a silent `select("*")`.
export const DEAL_POOL_SELECT = [
  "id", "title", "image_url", "display_image_url", "image_verdict",
  "affiliate_url", "listing_url", "listing_id",
  "price", "shipping", "total_price", "total_price_usd", "market_price", "discount_pct",
  "condition", "is_graded", "grade", "grader",
  "listing_type", "auction_end_at", "bid_count",
  "marketplace", "is_local", "item_location_country",
  "is_active", "first_seen_at", "last_seen_at", "exact_verified_at",
  "card_name", "card_set", "card_language", "card_tcgplayer_id", "card_catalog_id", "watchlist_id",
  "disqualified_reason", "image_count", "returns_accepted", "seller_feedback_score",
  // integrity-copy-hold-2: the visual screener's verdict (a short enum), read
  // by the gate (dealQuality.visualAuthenticityReason). Without it the pool
  // gate could not see a COUNTERFEIT_MISMATCH (row 38096, 14-15 Sep 2026).
  // reader-consistency: the reason text is the gate's evidence that a vision
  // review actually ran (the UNKNOWN-after-vision rule). Read server-side for
  // the gate only; slimPoolRow never carries it into the cached / client
  // shape. It is null on every unscreened row, so the payload stays small.
  "visual_authenticity_status", "visual_authenticity_reason",
].join(", ");

// The render-only shape actually stored in the cache (post-gate). Every
// field is read by DealCard, lib/homepageVariety diversity keys,
// lib/dealQuality.dealFreshness or conditionLabel; nothing else is kept.
//
// Deal-first review fix (P1): `price` and `shipping` are part of the
// display contract. DealCard tells "Listing total · incl. $X shipping"
// from "Listing price · Shipping not confirmed" by the recorded shipping
// charge, and AuctionPrice headlines the CURRENT BID (`price`) rather
// than the landed total. A row without them renders the honest fallback
// (lib/offerPresentation shippingState "unknown"), never a guess. Two
// numbers per row; the pool stays far under the 2 MB cache ceiling
// (tests/scanner/infra-db-1 IDB-1).
export const POOL_ROW_FIELDS = [
  "id", "title", "image_url", "display_image_url", "image_verdict",
  "affiliate_url", "price", "shipping", "total_price", "total_price_usd", "market_price", "discount_pct",
  "listing_type", "auction_end_at", "bid_count", "is_graded", "grade", "grader", "condition",
  "marketplace", "is_local", "first_seen_at", "last_seen_at", "exact_verified_at",
  "card_name", "card_set", "card_language", "card_tcgplayer_id", "card_catalog_id", "watchlist_id",
];

// Project a gated + withCard() row to the slim cached shape. Preserves a
// real `watchlist` embed when present (legacy pre-feed-discovery path),
// otherwise keeps the synthesised one withCard already attached.
// Idempotent: re-projecting an already-slim row is a no-op.
export function slimPoolRow(row) {
  if (!row) return row;
  const o = {};
  for (const k of POOL_ROW_FIELDS) o[k] = row[k] ?? null;
  o.watchlist = row.watchlist ?? {
    name: row.card_name ?? null,
    set: row.card_set ?? null,
    language: row.card_language ?? null,
    justtcg_tcgplayer_id: row.card_tcgplayer_id ?? null,
  };
  return o;
}
