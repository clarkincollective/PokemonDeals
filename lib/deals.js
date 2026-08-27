import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";

// Real, live perf problem found via SEO audit: every grid page ran its
// Supabase queries fresh on every single request (confirmed: homepage
// took 3.25s to respond, Cache-Control was no-store everywhere) - slow
// for visitors and it eats into Googlebot's crawl budget, since a slow
// TTFB directly limits how much of the site gets crawled per visit.
// These pages all read searchParams for filters, which forces Next to
// render them dynamically per request regardless of a route-level
// `revalidate` export - so the fix has to be at the data layer instead:
// unstable_cache memoizes each distinct filter combination's query result
// for a short window, so the common case (same filters requested again
// within the window) skips the database round-trip entirely.
const POOL_REVALIDATE_SECONDS = 45;

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
async function fetchBestFindsUncached({
  limit = 10,
  graded,
  language = "english",
  maxPrice,
  minPrice,
  country,
  listingType,
} = {}) {
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
  // Same for country/listing type - every filter a visitor picks on the
  // homepage must apply to every section shown there, not just the main
  // "All Deals" grid below it.
  if (country) query = query.eq("marketplace", country);
  if (listingType) query = query.eq("listing_type", listingType);

  const { data, error } = await query.order("discount_pct", { ascending: false }).limit(200);

  if (error || !data) return { deals: [], error: error ? error.message : null };

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

export const fetchBestFinds = unstable_cache(fetchBestFindsUncached, ["best-finds"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

// Real, live auctions ordered by soonest end time - genuinely useful
// urgency, not a fabricated one. Excludes anything whose auction_end_at
// has already passed as an extra safety net (is_active should already
// mean the scan hasn't expired it, but a listing can end between scans).
async function fetchAuctionsEndingSoonUncached({
  limit = 8,
  language = "english",
  maxPrice,
  minPrice,
  country,
  graded,
} = {}) {
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
  if (country) query = query.eq("marketplace", country);
  if (graded === true) query = query.eq("is_graded", true);
  if (graded === false) query = query.eq("is_graded", false);

  const { data, error } = await query.order("auction_end_at", { ascending: true }).limit(50);

  if (error || !data) return { deals: [], error: error ? error.message : null };

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

export const fetchAuctionsEndingSoon = unstable_cache(fetchAuctionsEndingSoonUncached, ["auctions-ending-soon"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

// The shuffled "variety pool" the grid pages use for their default,
// no-page-param view (see fetchDealsPage below for real pagination) -
// kept as its own cached fetch so app/page.js and app/japanese-cards
// only differ by the `language` filter, not by duplicated query logic.
async function fetchDealsPoolUncached({ language, country, cardType, listingType, maxPrice, minPrice }) {
  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true)
    .eq("watchlist.language", language)
    .order("first_seen_at", { ascending: false })
    .limit(500);

  if (country) query = query.eq("marketplace", country);
  if (cardType === "raw") query = query.eq("is_graded", false);
  if (cardType === "graded") query = query.eq("is_graded", true);
  if (listingType) query = query.eq("listing_type", listingType);
  if (maxPrice) query = query.lte("total_price", maxPrice);
  if (minPrice) query = query.gte("total_price", minPrice);

  const { data, error } = await query;
  return { data: data ?? [], error: error ? error.message : null };
}

export const fetchDealsPool = unstable_cache(fetchDealsPoolUncached, ["deals-pool"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

async function fetchSealedDealsPoolUncached({ country, listingType, maxPrice, minPrice }) {
  let query = supabase
    .from("sealed_deals")
    .select("*, sealed_watchlist:sealed_watchlist_id!inner (name, set, tcgplayer_id)")
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(500);

  if (country) query = query.eq("marketplace", country);
  if (listingType) query = query.eq("listing_type", listingType);
  if (maxPrice) query = query.lte("total_price", maxPrice);
  if (minPrice) query = query.gte("total_price", minPrice);

  const { data, error } = await query;
  return { data: data ?? [], error: error ? error.message : null };
}

export const fetchSealedDealsPool = unstable_cache(fetchSealedDealsPoolUncached, ["sealed-deals-pool"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

async function fetchLastScanTimeUncached({ table = "deals", language } = {}) {
  let query = supabase.from(table).select(language ? "last_seen_at, watchlist:watchlist_id!inner(language)" : "last_seen_at");
  if (language) query = query.eq("watchlist.language", language);
  const { data } = await query.order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
  return data?.last_seen_at ?? null;
}

export const fetchLastScanTime = unstable_cache(fetchLastScanTimeUncached, ["last-scan-time"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

// Real, deterministic offset-based pagination (ordered by first_seen_at,
// no shuffle) - separate from the pool-based fetchers above, which
// intentionally rotate a random slice of the newest ~100 for variety on
// repeat visits to the unpaginated default view. Once a visitor (or
// crawler) asks for page 2+, variety no longer makes sense - the whole
// point is a stable, linkable listing so search engines have real
// crawlable paths into the long tail of deal pages instead of relying on
// the sitemap alone. Capped well short of the real total: most value is
// in the first handful of pages (the sitemap already lists up to 5,000
// individual deal pages directly), and this inventory churns fast enough
// that indexing very deep pages just points crawlers at listings likely to
// have already expired by the time they're crawled.
const LIST_PAGE_SIZE = 24;
const MAX_LIST_PAGES = 25;

async function fetchDealsPageUncached({
  table,
  language,
  country,
  cardType,
  listingType,
  maxPrice,
  minPrice,
  page,
}) {
  const idColumn = table === "sealed_deals" ? "sealed_watchlist_id" : "watchlist_id";
  const watchlistTable = table === "sealed_deals" ? "sealed_watchlist" : "watchlist";
  const selectCols =
    table === "sealed_deals"
      ? "*, sealed_watchlist:sealed_watchlist_id!inner (name, set, tcgplayer_id)"
      : "*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)";

  let base = supabase.from(table).select(selectCols, { count: "exact" }).eq("is_active", true);
  if (language) base = base.eq(`${watchlistTable}.language`, language);
  if (country) base = base.eq("marketplace", country);
  if (cardType === "raw") base = base.eq("is_graded", false);
  if (cardType === "graded") base = base.eq("is_graded", true);
  if (listingType) base = base.eq("listing_type", listingType);
  if (maxPrice) base = base.lte("total_price", maxPrice);
  if (minPrice) base = base.gte("total_price", minPrice);

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * LIST_PAGE_SIZE;
  const to = from + LIST_PAGE_SIZE - 1;

  const { data, error, count } = await base.order("first_seen_at", { ascending: false }).range(from, to);
  if (error) return { deals: [], totalPages: 1, error: error.message };

  // Dedup by watched card/product within just this page - a single page's
  // worth of rows can still contain two listings of the same card; the
  // small resulting under-fill (rarely more than 1-2 short of a full page)
  // is preferable to a duplicate-looking page, and correctly bounded
  // since it never reaches into the next page's rows.
  const seen = new Set();
  const deals = [];
  for (const deal of data ?? []) {
    if (seen.has(deal[idColumn])) continue;
    seen.add(deal[idColumn]);
    deals.push(deal);
  }

  const totalPages = Math.max(1, Math.min(MAX_LIST_PAGES, Math.ceil((count ?? 0) / LIST_PAGE_SIZE)));
  return { deals, totalPages, error: null };
}

export const fetchDealsPage = unstable_cache(fetchDealsPageUncached, ["deals-page"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});
