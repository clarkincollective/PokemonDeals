import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";
import { slugifySet } from "@/lib/slugify";
import { extractSpecies } from "@/lib/pokemonSpecies";
import { CARD_HUB_MIN_LISTINGS, SPECIES_MIN_LISTINGS } from "@/lib/indexability";
import { computeAggregates } from "@/lib/catalogAggregates";

// Re-exported for callers that have long imported it from here.
export { SPECIES_MIN_LISTINGS };

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
// - mixing them would let raw deals crowd out every graded one.
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

  // In a country section, in-country listings first (no shipping wait),
  // then by discount. "All countries" is a pure discount ranking.
  if (country) query = query.order("is_local", { ascending: false });
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
//
// Real, live gap found live: eBay's own API rate limit (429s) can block
// the scan crons from finding anything NEW for well over an hour at a
// time - when that happens, a 500-row "newest first" window stops
// growing entirely, so a visitor who reloads later sees a heavily
// overlapping, near-frozen set even with the shuffle. This is never a
// discovery problem (there's no way to show a card no scan has ever
// found), only a rotation-window one - the site has thousands of real,
// still-active deals sitting just outside that narrow window the whole
// time. 2000, not 500: comfortably covers the entire Japanese catalog
// (~750 active) and gives English (~12k active) a far deeper, still-real
// pool to rotate through independent of whether the live scan is
// currently succeeding.
async function fetchDealsPoolUncached({ language, country, cardType, listingType, maxPrice, minPrice }) {
  let query = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true)
    .eq("watchlist.language", language)
    .limit(2000);

  // Country section -> genuinely-local listings first (no shipping wait),
  // then newest. "All countries" just gets newest.
  if (country) query = query.eq("marketplace", country).order("is_local", { ascending: false });
  query = query.order("first_seen_at", { ascending: false });
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
    .limit(500);

  if (country) query = query.eq("marketplace", country).order("is_local", { ascending: false });
  query = query.order("first_seen_at", { ascending: false });
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

// sort: "newest" (default) | "discount" | "price_asc" | "price_desc" | "ending"
const SORTS = {
  newest: { col: "first_seen_at", ascending: false },
  discount: { col: "discount_pct", ascending: false },
  price_asc: { col: "total_price", ascending: true },
  price_desc: { col: "total_price", ascending: false },
  ending: { col: "auction_end_at", ascending: true, nullsFirst: false },
};

async function fetchDealsPageUncached({
  table,
  language,
  set,
  country,
  cardType,
  listingType,
  maxPrice,
  minPrice,
  sort = "newest",
  page,
  pageSize = LIST_PAGE_SIZE,
}) {
  const idColumn = table === "sealed_deals" ? "sealed_watchlist_id" : "watchlist_id";
  const watchlistTable = table === "sealed_deals" ? "sealed_watchlist" : "watchlist";
  const selectCols =
    table === "sealed_deals"
      ? "*, sealed_watchlist:sealed_watchlist_id!inner (name, set, tcgplayer_id)"
      : "*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)";

  // "estimated": Supabase returns an exact count for small result sets and
  // a fast planner estimate for large ones. totalPages only feeds the
  // pager and is already capped at MAX_LIST_PAGES, so a rough count deep
  // in the long tail is fine and avoids a full filtered COUNT(*) on every
  // category-page request.
  let base = supabase.from(table).select(selectCols, { count: "estimated" }).eq("is_active", true);
  if (language) base = base.eq(`${watchlistTable}.language`, language);
  if (set) base = base.eq(`${watchlistTable}.set`, set);
  if (country) base = base.eq("marketplace", country);
  if (cardType === "raw") base = base.eq("is_graded", false);
  if (cardType === "graded") base = base.eq("is_graded", true);
  if (listingType) base = base.eq("listing_type", listingType);
  if (maxPrice) base = base.lte("total_price", maxPrice);
  if (minPrice) base = base.gte("total_price", minPrice);

  const s = SORTS[sort] ?? SORTS.newest;
  // "ending" only makes sense for auctions with a real future end time -
  // scope to those so non-auction rows (null auction_end_at) don't fill
  // the page.
  if (sort === "ending") {
    base = base.eq("listing_type", "AUCTION").gt("auction_end_at", new Date().toISOString());
  }

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const orderOpts = { ascending: s.ascending };
  if (s.nullsFirst != null) orderOpts.nullsFirst = s.nullsFirst;
  // Within a country section, a buyer wants what's actually in their
  // country first (no international shipping wait); listings that merely
  // ship there rank below. Only when a country is selected - the "All
  // countries" view keeps the pure sort - and never for "ending", where
  // the auction's real end time is the whole point.
  if (country && sort !== "ending") base = base.order("is_local", { ascending: false });
  const { data, error, count } = await base.order(s.col, orderOpts).range(from, to);
  if (error) {
    // PostgREST 416: `from` is past the row count (e.g. a stale ?page=N
    // carried onto a filter with fewer results). That's an empty page,
    // not a failure - surface it as an empty result so the page renders
    // its "nothing matches" state instead of a red error.
    if (error.code === "PGRST103") return { deals: [], totalPages: 1, error: null };
    return { deals: [], totalPages: 1, error: error.message };
  }

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

  const totalPages = Math.max(1, Math.min(MAX_LIST_PAGES, Math.ceil((count ?? 0) / pageSize)));
  return { deals, totalPages, error: null };
}

export const fetchDealsPage = unstable_cache(fetchDealsPageUncached, ["deals-page"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

// Real, sets/[slug] category pages target search intent the flat grid
// pages don't ("Paldean Fates deals") - the site had zero dedicated page
// per set despite having 192 real distinct sets in the catalog. No new
// data or fabricated slugs: this derives directly from the real `set`
// values already on every watchlist row.
//
// slugifySet itself now lives in lib/slugify.js (imported below), not
// here - client components (DealCard, bundled into app/search/
// SearchClient.js) need to import just the slug function without
// pulling in this file's next/cache dependency. Re-exported from here
// too since nothing outside this file currently needs that path, but
// keeping it available avoids a breaking change if that changes.
export { slugifySet };

const SET_INDEX_REVALIDATE_SECONDS = 900;

// fetchSets / fetchCardHubs / fetchSpeciesHubs are all per-catalog
// aggregates (counts, slugs, cheapest price) over every active English
// deal. Computing them live means scanning ~8k rows in 1,000-row pages
// and grouping in JS - ~4-7s on a cold cache, and slow at build where
// every static aggregate page recomputes at once. So a 15-minute cron
// (/api/refresh-catalog) precomputes all three into the catalog_snapshot
// table and the read path just reads one JSON row. The live scan below
// stays as the fallback for the window before the first cron run, or if
// the snapshot goes stale (cron broken).

const SNAPSHOT_MAX_AGE_MS = 90 * 60 * 1000;
const AGGREGATE_SELECT =
  "total_price, total_price_usd, image_url, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";
// If the currency migration hasn't been applied yet, total_price_usd
// doesn't exist and the select above 400s - fall back to a select
// without it so /sets, /pokemon and the homepage hubs still work.
const AGGREGATE_SELECT_LEGACY =
  "total_price, image_url, watchlist:watchlist_id!inner (id, name, set, language, justtcg_tcgplayer_id)";

// One sequential paginated scan of every active deal row for a language.
// Deliberately NOT parallelised - firing many page requests at once (or
// in waves) cut isolated wall time but saturated the Supabase pooler
// under real concurrency (build workers, multiple cold pages) and hung
// requests for tens of seconds. This is now only the fallback path.
async function scanActiveDealRows(selectStr, { language = "english" } = {}) {
  const PAGE_SIZE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("deals")
      .select(selectStr)
      .eq("is_active", true)
      .eq("watchlist.language", language)
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows: null, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

// Read one precomputed aggregate ("sets" | "cardHubs" | "speciesHubs")
// from catalog_snapshot. Returns null when the row is missing or older
// than SNAPSHOT_MAX_AGE_MS so the caller falls back to a live scan.
async function readCatalogSnapshot(kind) {
  const { data, error } = await supabase
    .from("catalog_snapshot")
    .select("data, updated_at")
    .eq("kind", kind)
    .maybeSingle();
  if (error || !data?.data) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > SNAPSHOT_MAX_AGE_MS) return null;
  return data.data;
}

// Live fallback: one scan -> all three aggregates. Cached briefly so that
// if the snapshot is missing and all three fetch* fall back at once they
// share a single scan rather than running three.
async function liveAggregatesUncached() {
  let { rows, error } = await scanActiveDealRows(AGGREGATE_SELECT);
  if (error) {
    // pre-migration: retry without total_price_usd
    ({ rows, error } = await scanActiveDealRows(AGGREGATE_SELECT_LEGACY));
  }
  if (error) return { sets: [], cardHubs: [], speciesHubs: [], error };
  return { ...computeAggregates(rows), error: null };
}
const liveAggregates = unstable_cache(liveAggregatesUncached, ["catalog-live-aggregates"], {
  revalidate: 300,
});

async function fetchSetsUncached({ language = "english" } = {}) {
  if (language === "english") {
    const snap = await readCatalogSnapshot("sets");
    if (snap) return { sets: snap, error: null };
  }
  const agg = await liveAggregates();
  return { sets: agg.sets, error: agg.error ?? null };
}

export const fetchSets = unstable_cache(fetchSetsUncached, ["sets-index"], {
  revalidate: SET_INDEX_REVALIDATE_SECONDS,
});

// Resolves a URL slug back to the real set name by matching against the
// same real, active-deal-backed list fetchSets computes - not by trying
// to reverse the slugify transform (lossy: two differently-punctuated
// set names could slugify to the same string). Reuses fetchSets' own
// cache rather than wrapping this in a second cache layer.
export async function resolveSetSlug(slug, language = "english") {
  const { sets } = await fetchSets({ language });
  return sets.find((s) => s.slug === slug) ?? null;
}

// The set slugs that currently resolve to a real /sets/[slug] page - i.e.
// the same SET_MIN_LISTINGS-filtered list fetchSets/resolveSetSlug use.
// Returned as a plain array so it can be handed to client components
// (DealGrid -> DealCard) as a prop. Any component that shows a set name
// as a link should gate on membership here; a set that drops below the
// threshold stops having a page, and a link to it would 404.
export async function fetchSetSlugs(language = "english") {
  const { sets } = await fetchSets({ language });
  return sets.map((s) => s.slug);
}

// Real, live duplicate-content problem found via SEO audit: 12,247
// active card deals but only 1,645 distinct watched cards - 69% of them
// (1,134) have 2+ simultaneous active listings, one as high as 93 at
// once. Every one of those got its own near-identical /deals/[id] page
// (same card, same set, same title pattern, different seller/price),
// competing with each other for the same "<card> <set> deal" search
// instead of consolidating ranking signal onto one strong page. A
// per-card hub page - one per exact print (name+set, not bare Pokemon
// name, which would wrongly mix differently-priced prints together) -
// listing every current offer is the standard "many sellers, one
// product" pattern. Only cards with 2+ active listings get a hub: with
// just 1, a hub page would be near-identical to that single /deals/[id]
// page - a duplicate-content pair in the other direction - so there's
// nothing to consolidate and no hub is generated.
const CARD_HUB_REVALIDATE_SECONDS = 900;

async function fetchCardHubsUncached({ language = "english" } = {}) {
  if (language === "english") {
    const snap = await readCatalogSnapshot("cardHubs");
    if (snap) return { hubs: snap, error: null };
  }
  const agg = await liveAggregates();
  return { hubs: agg.cardHubs, error: agg.error ?? null };
}

export const fetchCardHubs = unstable_cache(fetchCardHubsUncached, ["card-hubs"], {
  revalidate: CARD_HUB_REVALIDATE_SECONDS,
});

// Same reasoning as resolveSetSlug - matches against the real,
// already-computed list rather than reversing the slugify transform.
export async function resolveCardSlug(slug, language = "english") {
  const { hubs } = await fetchCardHubs({ language });
  return hubs.find((h) => h.slug === slug) ?? null;
}

// Looks up one watched card's hub entry by its real watchlist id (not
// slug) - used from /deals/[id] pages, which already know their own
// watchlist_id, to decide whether to show a "N active listings, compare
// prices" link without a second slug-matching pass.
export async function findCardHubByWatchlistId(watchlistId, language = "english") {
  const { hubs } = await fetchCardHubs({ language });
  return hubs.find((h) => h.id === watchlistId) ?? null;
}

// { [watchlist_id]: { count, slug } } for cards with 2+ simultaneous
// listings - lets a DealCard show a real "N sellers" comparison chip that
// deep-links to the exact card hub. Plain object (not a Map) so it
// serialises into a Server Component's props. Reuses fetchCardHubs' 900s
// cache.
export async function fetchHubCounts({ language = "english" } = {}) {
  const { hubs } = await fetchCardHubs({ language });
  const out = {};
  for (const h of hubs) out[h.id] = { count: h.count, slug: h.slug };
  return out;
}

// The newest N distinct-card active deals (English), most-recent first,
// NOT shuffled - powers the homepage "Just added" strip. Separate from
// fetchDealsPool (which is a wide window the homepage then shuffles) so
// the two can't drift.
async function fetchFreshFindsUncached({ language = "english", limit = 12, country } = {}) {
  let q = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)")
    .eq("is_active", true)
    .eq("watchlist.language", language);
  if (country) q = q.eq("marketplace", country);
  const { data, error } = await q.order("first_seen_at", { ascending: false }).limit(limit * 6);
  if (error || !data) return { deals: [], error: error ? error.message : null };
  const seen = new Set();
  const deals = [];
  for (const d of data) {
    if (seen.has(d.watchlist_id)) continue;
    seen.add(d.watchlist_id);
    deals.push(d);
    if (deals.length >= limit) break;
  }
  return { deals, error: null };
}

export const fetchFreshFinds = unstable_cache(fetchFreshFindsUncached, ["fresh-finds"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

// Every current active listing (offer) for one exact watched card,
// cheapest first - the real content a hub page exists to show. Keyed on
// the watchlist id (a primitive, not the row) for a clean cache key,
// same pattern as loadPriceAnalysis in app/deals/[id]/page.js.
async function fetchCardOffersUncached(watchlistId) {
  const { data, error } = await supabase
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
    .eq("watchlist_id", watchlistId)
    .eq("is_active", true);
  if (error) return { deals: [], error: error.message };
  // Sort cheapest-first by the USD-normalised total, since a card's
  // listings can be priced in different marketplace currencies.
  const deals = (data ?? []).sort(
    (a, b) => Number(a.total_price_usd ?? a.total_price) - Number(b.total_price_usd ?? b.total_price)
  );
  return { deals, error: null };
}

export const fetchCardOffers = unstable_cache(fetchCardOffersUncached, ["card-offers"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

// Phase 5 - /pokemon/[slug] species entity pages. Where /cards/[slug] is
// one exact print (name + set) and /sets/[slug] is one set, a species
// page aggregates every active deal for one Pokemon across ALL its prints
// - the level "charizard pokemon card" / "umbreon ex deals" searches
// actually target, which nothing else here serves. Species is derived
// from the (catalog-clean) watchlist card name by lib/pokemonSpecies.js's
// extractSpecies; ~95% of distinct English watchlist names resolve, the
// rest being trainer/energy/stadium singles that correctly have no
// species page.
//
// Only a species with SPECIES_MIN_LISTINGS+ simultaneous active listings
// gets a page (the value + rationale live in lib/indexability.js): the
// same thin-content guard as the card-hub gate, so the page resolves to
// a real canonical species AND has genuine listing density (typically
// spread across several prints/sets - a real price *range*, not one
// number).

// Real per-species aggregate, grouped in JS over the same 1000-row
// paginated scan pattern fetchSets/fetchCardHubs use (PostgREST has no
// GROUP BY). watchlistIds is carried so the per-species deal query and
// prints list below can scope by `.in("watchlist_id", ...)` without
// re-scanning; the /pokemon index page projects it away before handing
// the list to a client component.
async function fetchSpeciesHubsUncached({ language = "english" } = {}) {
  if (language === "english") {
    const snap = await readCatalogSnapshot("speciesHubs");
    if (snap) return { species: snap, error: null };
  }
  const agg = await liveAggregates();
  return { species: agg.speciesHubs, error: agg.error ?? null };
}

export const fetchSpeciesHubs = unstable_cache(fetchSpeciesHubsUncached, ["species-hubs"], {
  revalidate: CARD_HUB_REVALIDATE_SECONDS,
});

// Same reasoning as resolveSetSlug/resolveCardSlug - match the real
// computed list, never reverse the slugify transform.
export async function resolveSpeciesSlug(slug, language = "english") {
  const { species } = await fetchSpeciesHubs({ language });
  return species.find((s) => s.slug === slug) ?? null;
}

// Looks up a species hub entry by its exact canonical name (from
// extractSpecies) - used by /cards/[slug] and /deals/[id] to decide
// whether to show an "All <Species> deals" link, i.e. whether that
// species cleared SPECIES_MIN_LISTINGS. Reuses fetchSpeciesHubs' cache,
// same pattern as findCardHubByWatchlistId.
export async function resolveSpeciesByName(name, language = "english") {
  if (!name) return null;
  const { species } = await fetchSpeciesHubs({ language });
  return species.find((s) => s.name === name) ?? null;
}

// The distinct prints of one species that currently have an active deal,
// most-listed first - powers the "every print of this Pokemon" section
// that links out to each print's /cards/[slug] hub (or /sets/[slug] when
// the print has no hub). Scoped by the species' watchlistIds so it's a
// bounded `.in(...)` query, not another full scan.
async function fetchSpeciesPrintsUncached(speciesName, language = "english") {
  const { species } = await fetchSpeciesHubs({ language });
  const hub = species.find((s) => s.name === speciesName);
  if (!hub) return { prints: [], error: null };

  const [{ data, error }, { hubs }] = await Promise.all([
    supabase
      .from("deals")
      .select("watchlist_id, total_price, image_url, watchlist:watchlist_id!inner (name, set)")
      .eq("is_active", true)
      .in("watchlist_id", hub.watchlistIds)
      .order("total_price", { ascending: true }),
    fetchCardHubs({ language }),
  ]);
  if (error) return { prints: [], error: error.message };

  const hubSlugByWatchlistId = new Map(hubs.map((h) => [h.id, h.slug]));
  const grouped = new Map();
  for (const row of data ?? []) {
    const existing = grouped.get(row.watchlist_id);
    if (existing) {
      existing.count++;
      continue;
    }
    // rows are cheapest-first, so this first one per print is its cheapest
    grouped.set(row.watchlist_id, {
      watchlistId: row.watchlist_id,
      name: row.watchlist?.name ?? "",
      set: row.watchlist?.set ?? "",
      count: 1,
      cheapestPrice: Number(row.total_price),
      image: row.image_url ?? null,
      hubSlug: hubSlugByWatchlistId.get(row.watchlist_id) ?? null,
    });
  }
  const prints = [...grouped.values()].sort((a, b) => b.count - a.count);
  return { prints, error: null };
}

export const fetchSpeciesPrints = unstable_cache(fetchSpeciesPrintsUncached, ["species-prints"], {
  revalidate: CARD_HUB_REVALIDATE_SECONDS,
});

// The full BROWSE view of one species: every known card of it (from the
// PokemonPriceTracker-sourced `card_catalog`), each tagged with whether
// it currently has an active eBay deal. Powers /pokemon/<slug> - a
// visitor can see every card whether or not any of them is a deal right
// now.
//
// Two clearly-separated data sources:
//   * card_catalog  - PPT reference: card existence + `market_price`
//   * deals         - our own eBay scan: which of those cards is underpriced now
// A card's `deal` field is null unless our scan found a live deal for it.
// `refPrice` is always the PPT reference, never presented as a deal.
//
// Falls back to the `watchlist` slice when card_catalog is empty (before
// the first /api/sync-card-catalog run), so the page degrades gracefully.
async function fetchSpeciesCatalogUncached(speciesName, language = "english") {
  if (!speciesName) return { cards: [], dealCount: 0, source: "none", error: null };

  const [{ data: catRows, error: catErr }, { hubs }, hubEntry] = await Promise.all([
    supabase
      .from("card_catalog")
      .select("tcgplayer_id, name, set, card_number, rarity, card_type, market_price, image_url")
      .eq("species", speciesName)
      .eq("language", language)
      .order("market_price", { ascending: false, nullsFirst: false })
      .limit(1000),
    fetchCardHubs({ language }),
    resolveSpeciesByName(speciesName, language),
  ]);
  if (catErr && !/card_catalog/.test(catErr.message || "")) {
    return { cards: [], dealCount: 0, source: "error", error: catErr.message };
  }

  // Per-card active-deal aggregate for this species (empty when the
  // species has no deals - hubEntry is null then).
  const dealByTcgId = new Map();
  if (hubEntry?.watchlistIds?.length) {
    const { data: dealRows } = await supabase
      .from("deals")
      .select("total_price, total_price_usd, marketplace, discount_pct, watchlist:watchlist_id!inner (justtcg_tcgplayer_id)")
      .eq("is_active", true)
      .in("watchlist_id", hubEntry.watchlistIds)
      .order("total_price_usd", { ascending: true });
    for (const d of dealRows ?? []) {
      const id = d.watchlist?.justtcg_tcgplayer_id != null ? String(d.watchlist.justtcg_tcgplayer_id) : null;
      if (!id) continue;
      const prev = dealByTcgId.get(id);
      if (prev) {
        prev.count += 1;
        continue;
      }
      dealByTcgId.set(id, {
        count: 1,
        cheapestUsd: Number(d.total_price_usd ?? d.total_price),
        cheapestNative: Number(d.total_price),
        marketplace: d.marketplace,
        discountPct: d.discount_pct != null ? Number(d.discount_pct) : null,
      });
    }
  }

  const hubSlugByTcgId = new Map(hubs.map((h) => [String(h.justtcg_tcgplayer_id), h.slug]));

  let cards;
  let source;
  if ((catRows ?? []).length > 0) {
    source = "card_catalog";
    cards = catRows.map((r) => {
      const id = String(r.tcgplayer_id);
      return {
        tcgplayerId: id,
        name: r.name,
        set: r.set,
        cardNumber: r.card_number ?? null,
        rarity: r.rarity ?? null,
        cardType: r.card_type ?? null,
        refPrice: r.market_price != null ? Number(r.market_price) : null,
        image: r.image_url ?? null,
        hubSlug: hubSlugByTcgId.get(id) ?? null,
        deal: dealByTcgId.get(id) ?? null,
      };
    });
  } else {
    // Fallback: the value-filtered watchlist slice (pre-first-sync).
    const needle = speciesName.replace(/[^A-Za-z0-9]+/g, "%");
    const { data: wRows } = await supabase
      .from("watchlist")
      .select("name, set, last_known_price, justtcg_tcgplayer_id")
      .eq("active", true)
      .eq("language", language)
      .ilike("name", `%${needle}%`)
      .order("last_known_price", { ascending: false })
      .limit(500);
    const seen = new Set();
    cards = [];
    for (const row of wRows ?? []) {
      if (extractSpecies(row.name) !== speciesName) continue;
      const key = `${row.name}|${row.set}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = row.justtcg_tcgplayer_id != null ? String(row.justtcg_tcgplayer_id) : null;
      cards.push({
        tcgplayerId: id,
        name: row.name,
        set: row.set,
        cardNumber: null,
        rarity: null,
        cardType: "Pokémon",
        refPrice: row.last_known_price != null ? Number(row.last_known_price) : null,
        image: null,
        hubSlug: id ? hubSlugByTcgId.get(id) ?? null : null,
        deal: id ? dealByTcgId.get(id) ?? null : null,
      });
    }
    source = wRows && wRows.length ? "watchlist" : "empty";
  }

  // Deals first (cheapest deal first), then the rest by reference price.
  cards.sort((a, b) => {
    if (Boolean(a.deal) !== Boolean(b.deal)) return a.deal ? -1 : 1;
    if (a.deal && b.deal) return a.deal.cheapestUsd - b.deal.cheapestUsd;
    return (b.refPrice ?? 0) - (a.refPrice ?? 0);
  });

  return { cards, dealCount: cards.filter((c) => c.deal).length, source, error: null };
}

export const fetchSpeciesCatalog = unstable_cache(fetchSpeciesCatalogUncached, ["species-catalog-v3"], {
  revalidate: CARD_HUB_REVALIDATE_SECONDS,
});

// Deterministic offset pagination of every active deal for one species,
// across all its prints - identical shape to fetchDealsPage (same
// filters, same first_seen_at ordering, same per-page dedup and
// MAX_LIST_PAGES cap) but scoped by `.in("watchlist_id", ...)` instead of
// a single set. Exact count, no request-time name re-parsing.
async function fetchSpeciesDealsPageUncached({
  speciesName,
  language = "english",
  country,
  cardType,
  listingType,
  maxPrice,
  minPrice,
  sort = "newest",
  page,
  pageSize = 20,
}) {
  const { species } = await fetchSpeciesHubs({ language });
  const hub = species.find((s) => s.name === speciesName);
  if (!hub) return { deals: [], totalPages: 1, error: null };

  let base = supabase
    .from("deals")
    .select("*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)", {
      // see fetchDealsPageUncached - rough deep-tail count is fine here
      count: "estimated",
    })
    .eq("is_active", true)
    .in("watchlist_id", hub.watchlistIds);

  if (country) base = base.eq("marketplace", country);
  if (cardType === "raw") base = base.eq("is_graded", false);
  if (cardType === "graded") base = base.eq("is_graded", true);
  if (listingType) base = base.eq("listing_type", listingType);
  if (maxPrice) base = base.lte("total_price", maxPrice);
  if (minPrice) base = base.gte("total_price", minPrice);

  const s = SORTS[sort] ?? SORTS.newest;
  if (sort === "ending") {
    base = base.eq("listing_type", "AUCTION").gt("auction_end_at", new Date().toISOString());
  }

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const orderOpts = { ascending: s.ascending };
  if (s.nullsFirst != null) orderOpts.nullsFirst = s.nullsFirst;
  // Within a country section, a buyer wants what's actually in their
  // country first (no international shipping wait); listings that merely
  // ship there rank below. Only when a country is selected - the "All
  // countries" view keeps the pure sort - and never for "ending", where
  // the auction's real end time is the whole point.
  if (country && sort !== "ending") base = base.order("is_local", { ascending: false });
  const { data, error, count } = await base.order(s.col, orderOpts).range(from, to);
  if (error) {
    // PostgREST 416: `from` is past the row count (e.g. a stale ?page=N
    // carried onto a filter with fewer results). That's an empty page,
    // not a failure - surface it as an empty result so the page renders
    // its "nothing matches" state instead of a red error.
    if (error.code === "PGRST103") return { deals: [], totalPages: 1, error: null };
    return { deals: [], totalPages: 1, error: error.message };
  }

  const seen = new Set();
  const deals = [];
  for (const deal of data ?? []) {
    if (seen.has(deal.watchlist_id)) continue;
    seen.add(deal.watchlist_id);
    deals.push(deal);
  }

  const totalPages = Math.max(1, Math.min(MAX_LIST_PAGES, Math.ceil((count ?? 0) / pageSize)));
  return { deals, totalPages, error: null };
}

export const fetchSpeciesDealsPage = unstable_cache(fetchSpeciesDealsPageUncached, ["species-deals-page"], {
  revalidate: POOL_REVALIDATE_SECONDS,
});

const MARKET_DATA_REVALIDATE_SECONDS = 900;

// Real aggregate data pages (/market-data/*) - each of these queries
// already-real fields (market_price, watchlist counts), no fabricated
// stats or invented "trend" numbers. Deliberately does NOT duplicate
// /best-finds (biggest real discounts) under a new URL - that would be
// competing/duplicate content for the same query intent; this only adds
// genuinely new angles /best-finds doesn't cover.
async function fetchMostExpensiveCardsUncached({ language = "english", limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("deals")
    .select("id, market_price, watchlist:watchlist_id!inner (id, name, set, language)")
    .eq("is_active", true)
    .eq("watchlist.language", language)
    .order("market_price", { ascending: false })
    .limit(limit * 3); // dedupe by card below, so over-fetch a bit

  if (error) return { cards: [], error: error.message };

  const seen = new Set();
  const cards = [];
  for (const row of data ?? []) {
    const w = row.watchlist;
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    cards.push({ id: w.id, name: w.name, set: w.set, marketPrice: Number(row.market_price), dealId: row.id });
    if (cards.length >= limit) break;
  }

  return { cards, error: null };
}

export const fetchMostExpensiveCards = unstable_cache(fetchMostExpensiveCardsUncached, ["most-expensive-cards"], {
  revalidate: MARKET_DATA_REVALIDATE_SECONDS,
});

// Real, site-wide headline counts for the /market-data hub page - every
// number here is a direct count query against real active rows, nothing
// estimated or invented.
async function fetchMarketDataSummaryUncached() {
  const [{ count: activeDeals }, { count: activeSealed }, { hubs }, { sets }] = await Promise.all([
    supabase.from("deals").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("sealed_deals").select("*", { count: "exact", head: true }).eq("is_active", true),
    fetchCardHubs({ language: "english" }),
    fetchSets({ language: "english" }),
  ]);

  return {
    activeDeals: activeDeals ?? 0,
    activeSealed: activeSealed ?? 0,
    cardsWithMultipleSellers: hubs.length,
    activeSets: sets.length,
  };
}

export const fetchMarketDataSummary = unstable_cache(fetchMarketDataSummaryUncached, ["market-data-summary"], {
  revalidate: MARKET_DATA_REVALIDATE_SECONDS,
});
