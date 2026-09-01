import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";
import { slugifySet } from "@/lib/slugify";
import {
  catalogCardSlug,
  splitCardSlug,
  isRealCardName,
  catalogPriceOk,
  pickCatalogMatch,
  catalogCardResolvable,
  catalogCardIndexable,
} from "@/lib/cardSlug";
import { SPECIES_CATALOG_MIN_CARDS, speciesIndexable, isEligibleSpeciesCard } from "@/lib/speciesHub";
import { extractSpecies, speciesSlug } from "@/lib/pokemonSpecies";
import { CARD_HUB_MIN_LISTINGS, SPECIES_MIN_LISTINGS } from "@/lib/indexability";
import { computeAggregates } from "@/lib/catalogAggregates";
import { isDisplayableDeal, isExactEbayDealDestination, auctionEnded } from "@/lib/dealQuality";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { buildEbaySearchLink } from "@/lib/ebay";
import { normalizePublicText } from "@/lib/publicText";

// A catalogue card's "deal" object only earns the green "View Deal on
// eBay" treatment if it carries the exact verified /itm/ listing URL the
// display gate already vouched for. Anything else -> treat the card as
// having no live deal (fall back to a card-specific eBay search), never a
// stale "See deal" that dead-ends.
function dealCtaUrl(row) {
  const u = row?.affiliate_url || row?.listing_url || null;
  return typeof u === "string" && /\.ebay\.[^/]+\/itm\/\d+/.test(u) ? u : null;
}

// Shared display/ranking quality gate (lib/dealQuality). "Cheap != good
// deal" - a damaged card must not be advertised as "70% below market", and
// a wrong-language listing must not become an English-card deal. Applied to
// EVERY prominent deal surface here (Top Deals, country/species/set grids,
// pagination) as a defense-in-depth net over rows that were accepted before
// the scanner learned these rules. Graded deals pass through (priced
// against grade-specific data, not a raw condition).
function displayable(rows) {
  return (rows ?? []).filter(isDisplayableDeal).map(normalizeDealDisplay);
}

// Sealed product has no raw-card condition/language to gate, but the
// exact-listing + ended-auction rules apply the same: a sealed deal CTA
// must open the one listing, and an ended auction isn't live.
function sealedDisplayable(rows) {
  return (rows ?? [])
    .filter((r) => isExactEbayDealDestination(r) && !auctionEnded(r))
    .map(normalizeDealDisplay);
}

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

// --- External-discovery support -------------------------------------------
// A deal can now come from the eBay scan (watchlist_id set) OR the external
// discovery feed (card_catalog_id set, watchlist_id often null). The
// deals_feed_discovery migration adds flat resolved columns
// (card_name/card_set/card_language/card_tcgplayer_id) so the read path can
// filter/dedupe without a two-way join. Until that migration runs we fall
// back to the old watchlist !inner embed - same defensive pattern as
// AGGREGATE_SELECT / AGGREGATE_SELECT_LEGACY below.
let _cardColsReady = null;
async function cardColsReady() {
  if (_cardColsReady !== null) return _cardColsReady;
  const { error } = await supabase.from("deals").select("card_language").limit(1);
  _cardColsReady = !error;
  return _cardColsReady;
}
// The raw eBay listing title (deals.title) is upstream data - kept
// verbatim in the DB for matching - but wherever it becomes OUR public
// output it follows the site's unaccented "Pokemon" convention. Normalise
// the display copy once here, at the read boundary, so grids, cards,
// detail pages, metadata and serialised client props are all consistent.
// The accented/unaccented spelling of the franchise word is never a token
// the matcher keys on (not a card or set name), so this does not affect
// any match decision.
function normalizeDealDisplay(row) {
  if (!row || typeof row.title !== "string") return row;
  const title = normalizePublicText(row.title);
  return title === row.title ? row : { ...row, title };
}

// Guarantee `row.watchlist` is populated so every existing consumer
// (DealCard, deal detail, ...) keeps reading `deal.watchlist?.name` etc.
// unchanged, whether the row carried the real embed or the flat card_* cols.
function withCard(row) {
  if (!row) return row;
  row = normalizeDealDisplay(row);
  if (row.watchlist && row.watchlist.name) return row;
  return {
    ...row,
    watchlist: {
      name: row.card_name ?? null,
      set: row.card_set ?? null,
      language: row.card_language ?? null,
      justtcg_tcgplayer_id: row.card_tcgplayer_id ?? null,
    },
  };
}
export { cardColsReady, withCard, normalizeDealDisplay };
// -----------------------------------------------------------------------

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
  // smaller curated pool independently. Quality gate first: no damaged /
  // wrong-language listing in Top Deals.
  const seen = new Set();
  const deals = [];
  for (const deal of displayable(data)) {
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
  // several ending auctions shouldn't fill the whole row. Quality-gated.
  const seen = new Set();
  const deals = [];
  for (const deal of displayable(data)) {
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
  const ready = await cardColsReady();
  let query = supabase
    .from("deals")
    .select(
      ready
        ? "*"
        : "*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)"
    )
    .eq("is_active", true)
    .eq(ready ? "card_language" : "watchlist.language", language)
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
  return { data: displayable(data).map(withCard), error: error ? error.message : null };
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
  return { data: sealedDisplayable(data), error: error ? error.message : null };
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
  sets,
  country,
  cardType,
  listingType,
  maxPrice,
  minPrice,
  sort = "newest",
  page,
  pageSize = LIST_PAGE_SIZE,
}) {
  const sealed = table === "sealed_deals";
  const idColumn = sealed ? "sealed_watchlist_id" : "watchlist_id";
  const watchlistTable = sealed ? "sealed_watchlist" : "watchlist";
  // Card deals: prefer the flat resolved card_* columns (feed-discovered
  // deals have no watchlist row); sealed is unchanged. `ready` is false
  // until the deals_feed_discovery migration runs.
  const ready = !sealed && (await cardColsReady());
  const langCol = ready ? "card_language" : `${watchlistTable}.language`;
  const setCol = ready ? "card_set" : `${watchlistTable}.set`;
  const selectCols = sealed
    ? "*, sealed_watchlist:sealed_watchlist_id!inner (name, set, tcgplayer_id)"
    : ready
      ? "*"
      : "*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)";

  // "estimated": Supabase returns an exact count for small result sets and
  // a fast planner estimate for large ones. totalPages only feeds the
  // pager and is already capped at MAX_LIST_PAGES, so a rough count deep
  // in the long tail is fine and avoids a full filtered COUNT(*) on every
  // category-page request.
  let base = supabase.from(table).select(selectCols, { count: "estimated" }).eq("is_active", true);
  if (language) base = base.eq(langCol, language);
  if (set) base = base.eq(setCol, set);
  // `sets` (an array) scopes to a fixed set list - used by the
  // /deals/vintage/ and /deals/modern/ landing routes. An empty array
  // would match everything via PostgREST, so guard it.
  if (Array.isArray(sets) && sets.length > 0) base = base.in(setCol, sets);
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
    // Quality gate (single cards only - sealed has its own exclusion list
    // at scan time and no raw-card condition to speak of).
    if (sealed ? !isExactEbayDealDestination(deal) || auctionEnded(deal) : !isDisplayableDeal(deal)) continue;
    // Feed-discovered card deals have no watchlist_id - fall back to the
    // resolved catalogue id, then the row id, so they aren't all collapsed
    // into one "null" bucket.
    const key = deal[idColumn] ?? deal.card_tcgplayer_id ?? deal.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deals.push(sealed ? deal : withCard(deal));
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

// --- Catalog-backed card pages (Phase 4 P0) -------------------------------
//
// /cards/[slug] used to exist ONLY while >=2 live eBay listings backed it
// (fetchCardHubs / CARD_HUB_MIN_LISTINGS), so a page that ranked in Google
// vanished the moment its listings sold. card_catalog is a stable ~21k-row
// reference (name / set / number / rarity / image / market_price, ~99%
// priced). These helpers let the page fall back to that record when no
// deal hub exists, keeping one permanent URL per real card. Live deals,
// when present, still take precedence and keep their Product/Offer schema.

// Sitemap safety cap. There are ~21k catalog cards and ~99% are priced;
// this stays comfortably under the 50k-per-file sitemap protocol limit
// while bounding the query. Highest-value cards first (most search-worthy).
export const CATALOG_CARD_SITEMAP_CAP = 30000;

// Distinct English card_catalog set names, each with its slug, sorted
// longest-slug-first. A card slug is slugifySet(name)-slugifySet(set); to
// split it back we can't reverse slugify, so we test each known set slug
// as a suffix (longest first, so "xy-breakthrough" wins over "xy").
async function fetchCatalogSetIndexUncached() {
  const bySet = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("set")
      .eq("language", "english")
      .range(from, from + 999);
    if (error) return { sets: [], error: error.message };
    if (!data || data.length === 0) break;
    for (const r of data) if (r.set && !bySet.has(r.set)) bySet.set(r.set, slugifySet(r.set));
    if (data.length < 1000) break;
  }
  const sets = [...bySet.entries()].map(([name, slug]) => ({ name, slug }));
  sets.sort((a, b) => b.slug.length - a.slug.length);
  return { sets, error: null };
}

export const fetchCatalogSetIndex = unstable_cache(fetchCatalogSetIndexUncached, ["catalog-set-index"], {
  revalidate: 21600,
});

// Resolve a /cards/<slug> URL to a card_catalog record, used only when
// resolveCardSlug (the deal hub) misses. Returns the card, or null only
// when the slug matches no genuine catalog card (real card + image +
// stable id). A matched card with NO trustworthy market price still
// resolves (200) - `indexable` is then false and `refPrice` null, so the
// page shows "Market price unavailable", carries noindex,follow, and is
// left out of the sitemap, but its permanent URL never 404s just because
// the price provider has no value right now.
async function resolveCatalogCardUncached(slug, language = "english") {
  const { sets } = await fetchCatalogSetIndex();
  const split = splitCardSlug(slug, sets);
  if (!split) return null;

  // Paginate: PostgREST silently caps a single request at 1,000 rows, and
  // one set can exceed that ("World Championship Decks" ~1,960 English
  // rows) - without this, a card past row 1,000 in an oversized set can't
  // resolve and its /cards/[slug] 404s. Same .range() loop as
  // fetchCatalogSetIndex / fetchCatalogCardSlugs / refresh-deals'
  // fetchAllRows. Ordered by the primary key so pages are stable.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("tcgplayer_id, name, set, card_number, rarity, card_type, species, market_price, image_url")
      .eq("set", split.setName)
      .eq("language", language)
      .order("tcgplayer_id", { ascending: true })
      .range(from, from + 999);
    if (error) return null;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  // Deterministic pick across the FULLY-paginated set (real card + image;
  // a same-slug tie breaks on the lowest tcgplayer_id, never on price).
  // null -> 404 only for a slug that is no genuine card at all.
  const pick = pickCatalogMatch(rows, split.nameSlug);
  if (!pick) return null;

  const priceOk = catalogPriceOk(pick.market_price);
  return {
    tcgplayerId: String(pick.tcgplayer_id),
    name: normalizePublicText(pick.name),
    set: pick.set,
    cardNumber: pick.card_number ?? null,
    rarity: pick.rarity ?? null,
    cardType: pick.card_type ?? null,
    species: pick.species ?? null,
    image: upgradeCatalogImage(pick.image_url),
    // null (not a fabricated 0 / sentinel / other printing) when there's
    // no trustworthy price - the view renders "Market price unavailable".
    refPrice: priceOk ? Number(pick.market_price) : null,
    indexable: priceOk,
    slug,
  };
}

export const resolveCatalogCard = unstable_cache(resolveCatalogCardUncached, ["resolve-catalog-card"], {
  revalidate: 3600,
});

// Eligible catalog-backed /cards/<slug> for the sitemap: English, priced
// (non-sentinel), imaged. De-duplication against deal-hub slugs is the
// caller's job (lib/sitemap.js). Highest-value first, capped.
async function fetchCatalogCardSlugsUncached() {
  const slugs = new Set();
  for (let from = 0; from < CATALOG_CARD_SITEMAP_CAP; from += 1000) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("name, set, market_price, image_url")
      .eq("language", "english")
      .not("image_url", "is", null)
      .not("market_price", "is", null)
      .gt("market_price", 0)
      .order("market_price", { ascending: false })
      .range(from, from + 999);
    if (error) return { slugs: [], error: error.message };
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!catalogPriceOk(r.market_price) || !isRealCardName(r.name)) continue;
      slugs.add(catalogCardSlug(r.name, r.set));
    }
    if (data.length < 1000) break;
  }
  return { slugs: [...slugs], error: null };
}

export const fetchCatalogCardSlugs = unstable_cache(fetchCatalogCardSlugsUncached, ["catalog-card-slugs"], {
  revalidate: 21600,
});

// Species that qualify for a stable, indexable catalog-backed
// /pokemon/[slug] hub even with no live deal: >= SPECIES_CATALOG_MIN_CARDS
// real (isRealCardName), priced (non-sentinel), imaged English catalog
// cards. Same predicate the route uses for `indexable`, so the sitemap
// never lists a page the route would noindex. Returns [{ species, slug,
// count }].
async function fetchCatalogSpeciesUncached() {
  const bySpecies = new Map(); // species -> count of eligible cards
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("card_catalog")
      .select("species, name, card_type, market_price, image_url")
      .eq("language", "english")
      .not("species", "is", null)
      .not("image_url", "is", null)
      .not("market_price", "is", null)
      .gt("market_price", 0)
      .range(from, from + 999);
    if (error) return { species: [], error: error.message };
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!catalogPriceOk(r.market_price)) continue;
      // Same shared entity-identity predicate the /pokemon/[slug] route
      // uses, so a species the sitemap lists is never one the route would
      // noindex.
      if (!isEligibleSpeciesCard({ name: r.name, card_type: r.card_type }, r.species)) continue;
      bySpecies.set(r.species, (bySpecies.get(r.species) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }
  const species = [];
  for (const [name, count] of bySpecies) {
    if (count < SPECIES_CATALOG_MIN_CARDS) continue;
    const slug = speciesSlug(name);
    if (slug) species.push({ species: name, slug, count });
  }
  return { species, error: null };
}

export const fetchCatalogSpecies = unstable_cache(fetchCatalogSpeciesUncached, ["catalog-species"], {
  revalidate: 21600,
});

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
  for (const d of displayable(data)) {
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
  // listings can be priced in different marketplace currencies. Quality
  // gate first so a hub never leads with a damaged/wrong-language listing.
  const deals = displayable(data).sort(
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
      .select("*, watchlist:watchlist_id!inner (justtcg_tcgplayer_id)")
      .eq("is_active", true)
      .in("watchlist_id", hubEntry.watchlistIds)
      .order("total_price_usd", { ascending: true });
    // Only DISPLAYABLE deals - a disqualified listing must not become a
    // green "deal" tile or a stale CTA.
    for (const d of displayable(dealRows ?? [])) {
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
        // The cheapest DISPLAYABLE listing's own exact /itm/ URL - rows
        // are total_price_usd asc, so the first per card is the cheapest.
        // This is the direct "View Deal on eBay" / "Bid on eBay" target,
        // never a search or a #deals anchor.
        affiliateUrl: dealCtaUrl(d),
        listingType: d.listing_type ?? "FIXED_PRICE",
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
      const refPrice = catalogPriceOk(r.market_price) ? Number(r.market_price) : null;
      // The permanent /cards/[slug] exists (200) for any genuine, imaged
      // card - so we link to it (catalogSlug) whenever it's RESOLVABLE,
      // even with no price. `indexable` (additionally a trustworthy
      // price) is the separate bar for counting toward the species hub's
      // own indexability - a priceless card links fine but doesn't make
      // a thin species hub eligible.
      const resolvable = catalogCardResolvable(r);
      return {
        tcgplayerId: id,
        name: normalizePublicText(r.name),
        set: r.set,
        cardNumber: r.card_number ?? null,
        rarity: r.rarity ?? null,
        cardType: r.card_type ?? null,
        refPrice,
        image: upgradeCatalogImage(r.image_url) ?? null,
        hubSlug: hubSlugByTcgId.get(id) ?? null,
        catalogSlug: resolvable ? catalogCardSlug(r.name, r.set) : null,
        ebayHref: buildEbaySearchLink([r.name, r.card_number, r.set].filter(Boolean).join(" ")),
        indexable: catalogCardIndexable(r),
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
        name: normalizePublicText(row.name),
        set: row.set,
        cardNumber: null,
        rarity: null,
        // Synthesised by us for the pre-sync fallback (not an upstream
        // value). isEligibleSpeciesCard matches /^pok[eé]mon$/, and the
        // site convention is the unaccented spelling everywhere we author.
        cardType: "Pokemon",
        refPrice: row.last_known_price != null ? Number(row.last_known_price) : null,
        image: null,
        hubSlug: id ? hubSlugByTcgId.get(id) ?? null : null,
        catalogSlug: null, // no image on the pre-sync watchlist fallback -> no P0 page
        ebayHref: buildEbaySearchLink([row.name, row.set].filter(Boolean).join(" ")),
        indexable: false,
        deal: id ? dealByTcgId.get(id) ?? null : null,
      });
    }
    source = wRows && wRows.length ? "watchlist" : "empty";
  }

  // ENTITY-IDENTITY FILTER (shared predicate): drop catalogue records that
  // are tagged with this species but aren't actually a Pokemon card of it
  // - Trainer/Energy cards that merely name it ("Houndoom Spirit Link",
  // "Fire Energy (#9 Charizard Stamped)"), decks/boxes/products. Not a
  // price filter. Everything downstream (grid, stats, ItemList,
  // indexability, sitemap) is computed from this filtered list.
  cards = cards.filter((c) => isEligibleSpeciesCard(c, speciesName));

  // Deals first (cheapest deal first), then the rest by reference price.
  cards.sort((a, b) => {
    if (Boolean(a.deal) !== Boolean(b.deal)) return a.deal ? -1 : 1;
    if (a.deal && b.deal) return a.deal.cheapestUsd - b.deal.cheapestUsd;
    return (b.refPrice ?? 0) - (a.refPrice ?? 0);
  });

  // Real stats for the P1 catalog-backed species hub - all computed from
  // card_catalog, nothing fabricated. `eligibleCount` = cards that are
  // real + imaged + trustworthily priced (c.indexable), i.e. cards that
  // have an *indexable* permanent /cards/[slug]; that is the species-hub
  // indexability basis. A resolvable-but-priceless card has a working
  // c.catalogSlug link but is deliberately NOT counted here.
  const priced = cards.filter((c) => catalogPriceOk(c.refPrice));
  const eligible = cards.filter((c) => c.indexable);
  const prices = priced.map((c) => Number(c.refPrice));
  const stats = {
    cardCount: cards.length,
    pricedCount: priced.length,
    eligibleCount: eligible.length,
    setCount: new Set(cards.map((c) => c.set)).size,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
  const indexable = source === "card_catalog" && speciesIndexable(stats);

  return { cards, dealCount: cards.filter((c) => c.deal).length, stats, indexable, source, error: null };
}

// Re-exported for callers that have imported it from here.
export { SPECIES_CATALOG_MIN_CARDS };

export const fetchSpeciesCatalog = unstable_cache(fetchSpeciesCatalogUncached, ["species-catalog-v3"], {
  revalidate: CARD_HUB_REVALIDATE_SECONDS,
});

// Don't render the "every card in this set" grid until card_catalog has
// at least this many cards for the set. A real set has dozens to a few
// hundred cards; with card_catalog still mid-backfill (see
// IMPLEMENTATION_STATUS "A4 - three-way coverage spot-check"), a set with
// 2-3 synced rows would show a misleading near-empty "full catalogue"
// section. Below the threshold the page still shows its active-deal grid,
// just not the browse-everything grid. Judgment call - 10 is ~two rows
// on desktop, enough to read as a real browse surface.
export const SET_CATALOG_MIN_CARDS = 10;

// Upper bound on the browse (non-deal) tiles rendered in that grid. Every
// real expansion tops out around ~360 cards, so this keeps them whole;
// it only truncates the handful of oversized grab-bag "sets" (World
// Championship Decks ~1960, Prize Pack Series ~886) whose full grid would
// be a multi-MB HTML payload. Deal-matched cards are always kept in full
// (they're bounded by the set's active deals). The page notes when the
// grid is truncated.
export const SET_CATALOG_MAX_BROWSE = 600;

// The full BROWSE view of one set: every card in it (from card_catalog),
// each tagged with whether it currently has an active eBay deal - the
// set-page analogue of fetchSpeciesCatalog, powering the "every card in
// <set>" grid on /sets/<slug>. Sorted by the set's own card numbering so
// a large set reads in order instead of as one arbitrary wall.
//
// Same two clearly-separated sources as fetchSpeciesCatalog:
//   * card_catalog - PokemonPriceTracker reference: card existence + market_price
//   * deals        - our own eBay scan: which of those is underpriced now
// A card's `deal` is null unless our scan found a live deal for it;
// `refPrice` is always the PPT reference, never presented as a deal.
//
// `setName` is a watchlist.set string (from resolveSetSlug). card_catalog
// uses the same set names, so an exact match is right; when a set has no
// card_catalog rows (backfill gap, or a rare naming mismatch) this simply
// returns [] and the caller drops the grid.
async function fetchSetCatalogUncached(setName, language = "english") {
  if (!setName) return { cards: [], dealCount: 0, totalCards: 0, truncated: false, error: null };

  // PostgREST caps a response at 1000 rows regardless of .limit(), and a
  // few outsized "sets" (World Championship Decks ~1960) exceed that -
  // page through in 1000-row windows like scanActiveDealRows does.
  async function readAllCatalogRows() {
    const PAGE = 1000;
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("card_catalog")
        .select("tcgplayer_id, name, set, card_number, rarity, card_type, market_price, image_url")
        .eq("set", setName)
        .eq("language", language)
        .range(from, from + PAGE - 1);
      if (error) return { rows: null, error };
      if (!data || data.length === 0) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return { rows: out, error: null };
  }

  const [{ rows: catRows, error: catErr }, { hubs }, { data: dealRows }] = await Promise.all([
    readAllCatalogRows(),
    fetchCardHubs({ language }),
    supabase
      .from("deals")
      // Full row so isDisplayableDeal (condition / language / exact CTA /
      // identity / auction / visual authenticity / trust) can run, and so
      // the aggregate can carry the cheapest DISPLAYABLE listing's own
      // /itm/ affiliate URL for a direct "View Deal on eBay" CTA.
      .select("*, watchlist:watchlist_id!inner (justtcg_tcgplayer_id, set, language)")
      .eq("is_active", true)
      .eq("watchlist.set", setName)
      .eq("watchlist.language", language)
      .order("total_price_usd", { ascending: true }),
  ]);
  if (catErr && !/card_catalog/.test(catErr.message || "")) {
    return { cards: [], dealCount: 0, totalCards: 0, truncated: false, error: catErr.message };
  }

  // Per-card active-deal aggregate for this set. Only DISPLAYABLE deals
  // count (a disqualified listing must never produce a green "deal" tile
  // or a stale CTA); rows arrive cheapest-first, so the first per card is
  // the cheapest displayable listing and its exact URL is the CTA target.
  const dealByTcgId = new Map();
  for (const d of displayable(dealRows ?? [])) {
    const id =
      d.watchlist?.justtcg_tcgplayer_id != null ? String(d.watchlist.justtcg_tcgplayer_id) : null;
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
      affiliateUrl: dealCtaUrl(d),
      listingType: d.listing_type ?? "FIXED_PRICE",
    });
  }

  const hubSlugByTcgId = new Map(hubs.map((h) => [String(h.justtcg_tcgplayer_id), h.slug]));

  const cards = (catRows ?? []).map((r) => {
    const id = String(r.tcgplayer_id);
    return {
      tcgplayerId: id,
      name: normalizePublicText(r.name),
      set: r.set,
      cardNumber: r.card_number ?? null,
      rarity: r.rarity ?? null,
      cardType: r.card_type ?? null,
      refPrice: r.market_price != null ? Number(r.market_price) : null,
      image: upgradeCatalogImage(r.image_url) ?? null,
      hubSlug: hubSlugByTcgId.get(id) ?? null,
      // Permanent internal link for the image/title, even with no live
      // hub (any resolvable genuine imaged card has a 200 /cards/[slug]).
      catalogSlug: catalogCardResolvable(r) ? catalogCardSlug(r.name, r.set) : null,
      // Server-built, campaign-wrapped card-specific eBay search - the
      // client re-points only the host for the visitor's marketplace.
      ebayHref: buildEbaySearchLink([r.name, r.card_number, r.set].filter(Boolean).join(" ")),
      deal: dealByTcgId.get(id) ?? null,
    };
  });

  // Sort by the set's own numbering: the leading integer in card_number
  // ("103/130" -> 103, "H9" -> 9, "SWSH262" -> 262), then a numeric-aware
  // string compare so "1","2","10" and lettered promos stay stable.
  // Cards with no parseable number sort last. SpeciesCardList still
  // splits deals into their own section first - this fixes order WITHIN
  // each section, which is what makes a 200-card set readable.
  const numOf = (s) => {
    const m = String(s ?? "").match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
  };
  cards.sort((a, b) => {
    const na = numOf(a.cardNumber);
    const nb = numOf(b.cardNumber);
    if (na !== nb) return na - nb;
    return String(a.cardNumber ?? a.name).localeCompare(String(b.cardNumber ?? b.name), "en", {
      numeric: true,
    });
  });

  // Keep every deal-matched card; cap only the browse tail (see
  // SET_CATALOG_MAX_BROWSE). Both halves stay in card-number order.
  const dealCards = cards.filter((c) => c.deal);
  const browseCards = cards.filter((c) => !c.deal);
  const trimmed = [...dealCards, ...browseCards.slice(0, SET_CATALOG_MAX_BROWSE)];

  return {
    cards: trimmed,
    dealCount: dealCards.length,
    totalCards: cards.length,
    truncated: browseCards.length > SET_CATALOG_MAX_BROWSE,
    error: null,
  };
}

export const fetchSetCatalog = unstable_cache(fetchSetCatalogUncached, ["set-catalog-v2"], {
  revalidate: CARD_HUB_REVALIDATE_SECONDS,
});

// ---------------------------------------------------------------------------
// Sealed products - the sealed twin of the card catalogue above. Same
// deal-vs-browse merge, sourced from `sealed_catalog` (PPT reference) +
// `sealed_deals` (our eBay scan). Powers the sealed section on
// /sets/<slug> and the standalone /sealed-deals hub.
// ---------------------------------------------------------------------------

// Don't render a set's "sealed products" section until sealed_catalog has
// at least this many for it - parallels SET_CATALOG_MIN_CARDS. Sealed
// counts are much smaller than card counts (a set has ~5-30 sealed
// products vs ~60-360 cards), so the floor is lower. Below it the set
// page still shows any active sealed deals, just not the browse grid.
export const SET_SEALED_MIN_PRODUCTS = 4;

// Cap on browse (non-deal) sealed tiles per grouping. Even the biggest
// sets top out ~35 sealed products; this only guards against a future
// data anomaly. Deal-matched products are always kept.
export const SEALED_CATALOG_MAX_BROWSE = 200;

// Shape one sealed_catalog row + optional deal aggregate into the same
// card object SpeciesCard renders (product_type stands in for the card
// number/rarity meta line; no hubSlug - a sealed deal links to the
// #sealed-deals grid on the same page).
function sealedCardFrom(r, deal) {
  return {
    tcgplayerId: String(r.tcgplayer_id),
    name: normalizePublicText(r.name),
    set: r.set,
    cardNumber: null,
    rarity: null,
    cardType: r.product_type ?? null,
    productType: r.product_type ?? null,
    meta: [r.set, r.product_type].filter(Boolean).join(" · "),
    // eBay search is accent-insensitive, so the unaccented public form is
    // both on-convention and returns the same listings.
    searchQuery: normalizePublicText(r.name), // sealed product names are self-contained
    ebayHref: buildEbaySearchLink(r.name),
    refPrice: r.market_price != null ? Number(r.market_price) : null,
    image: upgradeCatalogImage(r.image_url) ?? null,
    hubSlug: null,
    deal: deal ?? null,
  };
}

// Browse-order priority for sealed product types - marquee items first,
// cases / misc last. Anything unlisted (incl. "Other") sorts after.
const SEALED_TYPE_RANK = [
  "Booster Box",
  "Elite Trainer Box",
  "Booster Bundle",
  "Build & Battle",
  "Collection Box",
  "Blister",
  "Booster Pack",
  "Tin",
  "Deck",
  "Hanger Box",
  "Case",
].reduce((m, t, i) => m.set(t, i), new Map());

function compareSealedForBrowse(a, b) {
  const ra = SEALED_TYPE_RANK.has(a.productType) ? SEALED_TYPE_RANK.get(a.productType) : 99;
  const rb = SEALED_TYPE_RANK.has(b.productType) ? SEALED_TYPE_RANK.get(b.productType) : 99;
  if (ra !== rb) return ra - rb;
  return (b.refPrice ?? -1) - (a.refPrice ?? -1);
}

// Active sealed-deal aggregate keyed by the watched product's
// tcgplayer_id (sealed_deals -> sealed_watchlist join). Cheapest wins.
function sealedDealMap(dealRows) {
  const byId = new Map();
  // Only sealed deals that pass the exact-listing + live-auction gate -
  // same as sealedDisplayable - so a sealed catalogue tile never gets a
  // green "deal" badge or a CTA pointing at a dead listing.
  for (const d of sealedDisplayable(dealRows ?? [])) {
    const id =
      d.sealed_watchlist?.tcgplayer_id != null ? String(d.sealed_watchlist.tcgplayer_id) : null;
    if (!id) continue;
    const prev = byId.get(id);
    if (prev) {
      prev.count += 1;
      continue;
    }
    byId.set(id, {
      count: 1,
      cheapestUsd: Number(d.total_price_usd ?? d.total_price),
      cheapestNative: Number(d.total_price),
      marketplace: d.marketplace,
      discountPct: d.discount_pct != null ? Number(d.discount_pct) : null,
      affiliateUrl: dealCtaUrl(d),
      listingType: d.listing_type ?? "FIXED_PRICE",
    });
  }
  return byId;
}

// Every sealed product for one set, each tagged with whether it has an
// active eBay deal. Mirrors fetchSetCatalog. `setName` is a
// watchlist.set-style string; sealed_catalog.set uses the same PPT set
// names, so an exact match is right (empty result -> caller drops the
// section).
async function fetchSetSealedCatalogUncached(setName, language = "english") {
  if (!setName) {
    return { products: [], dealCount: 0, totalProducts: 0, truncated: false, error: null };
  }

  const [{ data: catRows, error: catErr }, { data: dealRows }] = await Promise.all([
    supabase
      .from("sealed_catalog")
      .select("tcgplayer_id, name, set, product_type, market_price, image_url")
      .eq("set", setName)
      .eq("language", language)
      .limit(1000),
    supabase
      .from("sealed_deals")
      .select("*, sealed_watchlist:sealed_watchlist_id!inner (tcgplayer_id, set)")
      .eq("is_active", true)
      .eq("sealed_watchlist.set", setName)
      .order("total_price_usd", { ascending: true }),
  ]);
  if (catErr && !/sealed_catalog/.test(catErr.message || "")) {
    return { products: [], dealCount: 0, totalProducts: 0, truncated: false, error: catErr.message };
  }

  const dealByTcgId = sealedDealMap(dealRows);
  const all = (catRows ?? []).map((r) => sealedCardFrom(r, dealByTcgId.get(String(r.tcgplayer_id))));

  // Deals first (cheapest), then browse by product-type priority so the
  // marquee items (booster box, ETB, bundle) lead and cases / misc sink,
  // with price as the tiebreak inside a type.
  const deals = all.filter((c) => c.deal).sort((a, b) => a.deal.cheapestUsd - b.deal.cheapestUsd);
  const browse = all.filter((c) => !c.deal).sort(compareSealedForBrowse);
  const trimmed = [...deals, ...browse.slice(0, SEALED_CATALOG_MAX_BROWSE)];

  return {
    products: trimmed,
    dealCount: deals.length,
    totalProducts: all.length,
    truncated: browse.length > SEALED_CATALOG_MAX_BROWSE,
    error: null,
  };
}

export const fetchSetSealedCatalog = unstable_cache(
  fetchSetSealedCatalogUncached,
  ["set-sealed-catalog-v2"],
  { revalidate: CARD_HUB_REVALIDATE_SECONDS }
);

// The whole sealed catalogue, grouped by set (newest-released first),
// each product tagged with active-deal status - powers the standalone
// /sealed-deals hub. One scan of sealed_catalog + one of active
// sealed_deals, grouped in JS.
async function fetchSealedCatalogUncached({ language = "english" } = {}) {
  const [catRes, dealRes, setRes] = await Promise.all([
    (async () => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("sealed_catalog")
          .select("tcgplayer_id, name, set, product_type, market_price, image_url")
          .eq("language", language)
          .range(from, from + 999);
        if (error) return { rows: null, error };
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return { rows, error: null };
    })(),
    supabase
      .from("sealed_deals")
      .select("*, sealed_watchlist:sealed_watchlist_id!inner (tcgplayer_id, set)")
      .eq("is_active", true)
      .order("total_price_usd", { ascending: true }),
    supabase.from("catalog_snapshot").select("data").eq("kind", "sets").maybeSingle(),
  ]);

  if (catRes.error) return { groups: [], productCount: 0, dealCount: 0, error: catRes.error.message };
  const catRows = catRes.rows ?? [];
  const dealByTcgId = sealedDealMap(dealRes.data);

  // Set release order, if the sets snapshot carries it; otherwise groups
  // fall back to alpha. (snapshot `sets` entries are { set, slug, ... }.)
  const setOrder = new Map();
  const snapSets = Array.isArray(setRes.data?.data) ? setRes.data.data : [];
  snapSets.forEach((s, i) => setOrder.set(s.set, i));

  const groups = new Map();
  for (const r of catRows) {
    const card = sealedCardFrom(r, dealByTcgId.get(String(r.tcgplayer_id)));
    if (!groups.has(r.set)) groups.set(r.set, []);
    groups.get(r.set).push(card);
  }

  const out = [...groups.entries()].map(([set, products]) => {
    products.sort((a, b) => {
      if (Boolean(a.deal) !== Boolean(b.deal)) return a.deal ? -1 : 1;
      return compareSealedForBrowse(a, b);
    });
    return {
      set,
      slug: slugifySet(set),
      products,
      dealCount: products.filter((p) => p.deal).length,
    };
  });

  // Sets the snapshot knows about (has a /sets page) first, in its order;
  // the rest after, alphabetically.
  out.sort((a, b) => {
    const ia = setOrder.has(a.set) ? setOrder.get(a.set) : Infinity;
    const ib = setOrder.has(b.set) ? setOrder.get(b.set) : Infinity;
    if (ia !== ib) return ia - ib;
    return a.set.localeCompare(b.set);
  });

  return {
    groups: out,
    productCount: catRows.length,
    dealCount: out.reduce((n, g) => n + g.dealCount, 0),
    error: null,
  };
}

export const fetchSealedCatalog = unstable_cache(fetchSealedCatalogUncached, ["sealed-catalog-v2"], {
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
  for (const deal of displayable(data)) {
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
    // "live deals" headline: active AND not disqualified (identity /
    // authenticity / condition / freshness). The /api/sweep-stale-deals
    // cron retires ended + stale rows so is_active stays meaningful; this
    // filter drops the still-active-but-not-promotable ones from the
    // number a visitor sees.
    supabase
      .from("deals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .is("disqualified_reason", null),
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
