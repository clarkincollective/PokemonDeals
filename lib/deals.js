import { supabase } from "@/lib/supabaseClient";

// "Today's Best Finds" - the higher-value, bigger-discount deals worth
// spotlighting, as opposed to the full $15+ catalog on the homepage.
// minMarketPrice keeps this from being dominated by $15-30 bargain-bin
// cards; it's independent of DISCOUNT_THRESHOLD in refresh-deals, which
// already gates what counts as a "deal" at all.
const BEST_FINDS_MIN_MARKET_PRICE = 75;
// refresh-deals' SANITY_FLOOR_PCT (25%) makes 75% off the hard maximum
// discount possible - there are always enough listings sitting right at
// that ceiling to permanently fill this ranking, crowding out genuinely
// varied standout deals underneath. A listing priced at almost exactly
// 25% of its computed market value is also more likely to be a
// condition/edition mismatch than a real once-in-a-while bargain, so this
// caps ranking well below the ceiling rather than right up against it.
const BEST_FINDS_MAX_DISCOUNT_PCT = 0.65;

// graded: true -> only graded cards, false -> only raw cards, omitted ->
// either. Raw and graded are ranked as separate lists (not one list
// filtered after the fact) because graded cards are a much smaller pool
// (see BestFindsBanner) - mixing them would let raw deals crowd out
// every graded one.
export async function fetchBestFinds({ limit = 10, graded, language = "english", maxPrice, minPrice } = {}) {
  // !inner + watchlist.language scopes this to one catalog - English by
  // default (Japanese-print deals get their own /japanese-cards page
  // instead of mixing into this ranking).
  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true)
    .eq("watchlist.language", language)
    .gte("market_price", BEST_FINDS_MIN_MARKET_PRICE)
    .lte("discount_pct", BEST_FINDS_MAX_DISCOUNT_PCT);

  if (graded === true) query = query.eq("is_graded", true);
  if (graded === false) query = query.eq("is_graded", false);
  // total_price is what a buyer actually pays - the same field the
  // homepage's price pills filter on, so a visitor's chosen budget stays
  // consistent across every section on the page, not just the main grid.
  if (maxPrice) query = query.lte("total_price", maxPrice);
  if (minPrice) query = query.gte("total_price", minPrice);

  const { data, error } = await query.order("discount_pct", { ascending: false }).limit(200);

  if (error || !data) return { deals: [], error };

  // Same one-listing-per-card dedup as the homepage, applied to this
  // smaller curated pool independently.
  const seen = new Set();
  const deals = [];
  for (const deal of data) {
    if (seen.has(deal.watchlist_id)) continue;
    seen.add(deal.watchlist_id);
    deals.push(deal);
    if (deals.length >= limit) break;
  }

  return { deals, error: null };
}

// Real, live auctions ordered by soonest end time - genuinely useful
// urgency, not a fabricated one. Excludes anything whose auction_end_at
// has already passed as an extra safety net (is_active should already
// mean the scan hasn't expired it, but a listing can end between scans).
export async function fetchAuctionsEndingSoon({ limit = 8, language = "english", maxPrice, minPrice } = {}) {
  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true)
    .eq("watchlist.language", language)
    .eq("listing_type", "AUCTION")
    .not("auction_end_at", "is", null)
    .gt("auction_end_at", new Date().toISOString());

  if (maxPrice) query = query.lte("total_price", maxPrice);
  if (minPrice) query = query.gte("total_price", minPrice);

  const { data, error } = await query.order("auction_end_at", { ascending: true }).limit(50);

  if (error || !data) return { deals: [], error };

  // Same one-listing-per-card dedup as fetchBestFinds - one card with
  // several ending auctions shouldn't fill the whole row.
  const seen = new Set();
  const deals = [];
  for (const deal of data) {
    if (seen.has(deal.watchlist_id)) continue;
    seen.add(deal.watchlist_id);
    deals.push(deal);
    if (deals.length >= limit) break;
  }

  return { deals, error: null };
}
