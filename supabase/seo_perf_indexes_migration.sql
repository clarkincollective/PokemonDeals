-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Run the statements ONE AT A TIME (CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block, and the SQL Editor wraps a multi-statement
-- run in one).
--
-- Phase 21 - indexes for the SEO page queries. Every statement is
-- non-destructive (adds an index, IF NOT EXISTS) and CONCURRENTLY, so it
-- does not lock `deals` against the 15-minute refresh cron while it
-- builds. Sizes at time of writing: deals ~16.5k rows (12.2k active),
-- watchlist ~8.6k, sealed_deals ~65.
--
-- Which query each index serves (all in lib/deals.js unless noted):

-- 1. deals.watchlist_id is a foreign key with NO index (Postgres does not
--    create one automatically). Every /cards/[slug] render runs
--    fetchCardOffers = `deals where watchlist_id = $1 and is_active`, and
--    the new species pages run `deals where watchlist_id in (...)`
--    (fetchSpeciesPrints, fetchSpeciesDealsPage). Without this those are
--    full scans of all 16.5k rows; with it they are a handful of index
--    probes. Also speeds every `watchlist!inner(...)` join.
create index concurrently if not exists deals_watchlist_id
  on deals (watchlist_id);

-- 2. The homepage/`/japanese-cards` pool (fetchDealsPool, 2000-row slice)
--    and the paginated category/home listings (fetchDealsPage,
--    fetchSpeciesDealsPage) all do `where is_active order by
--    first_seen_at desc`. Currently an in-memory sort of ~12k active
--    rows per cache miss.
create index concurrently if not exists deals_active_first_seen
  on deals (is_active, first_seen_at desc);

-- 3. fetchLastScanTime (every homepage render) and app/sitemap.js's
--    fetchActiveDealIds (every sitemap crawl, up to 5000 rows) both do
--    `where is_active order by last_seen_at desc`.
create index concurrently if not exists deals_active_last_seen
  on deals (is_active, last_seen_at desc);

-- 4. /market-data/most-expensive-cards (fetchMostExpensiveCards):
--    `where is_active order by market_price desc limit 300`.
create index concurrently if not exists deals_active_market_price
  on deals (is_active, market_price desc);

-- 5. Homepage "Auctions Ending Soon" (fetchAuctionsEndingSoon): active
--    auctions with a future end time, ordered by end time. Only ~650
--    rows match, so a small partial index.
create index concurrently if not exists deals_active_auction_end
  on deals (auction_end_at)
  where is_active and listing_type = 'AUCTION' and auction_end_at is not null;

-- 6. /sets/[slug] (fetchDealsPage with a `set` filter) joins deals to
--    watchlist and filters `watchlist.language = $1 and watchlist.set =
--    $2`. watchlist_unique_card is (name, "set", language) so it cannot
--    serve a lookup by (language, set) alone.
create index concurrently if not exists watchlist_language_set
  on watchlist (language, "set");

-- Optional / not included: sealed_deals is only ~65 rows, so
-- fetchSealedDealsPool's sort and the sealed_watchlist_id join are
-- effectively free. Add the equivalents (is_active, first_seen_at desc)
-- and (sealed_watchlist_id) if that table grows past a few thousand rows.
--
-- Optional / future: fetchSets, fetchCardHubs and fetchSpeciesHubs each
-- scan every active English deal (~11.5k rows) in 1000-row pages and
-- group in JS, every 15 minutes. Index #1 speeds their per-row join, but
-- the real fix if they get slow is to precompute the aggregates into a
-- small summary table refreshed by the existing refresh-deals cron,
-- rather than a wider index.
