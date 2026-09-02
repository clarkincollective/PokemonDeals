-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- SEO Phase 11B - hybrid historical price foundation. Extends the
-- existing `price_history` table (see price_history_migration.sql); does
-- NOT replace it. Non-destructive: two nullable columns + one index.
--
-- The table already stores one canonical observation per
-- (tcgplayer_id, condition, source, observed_on) via price_history_daily_uniq,
-- which is exactly right for the hybrid model: a PPT-backfilled historical
-- point and a first-party catalogue snapshot for the SAME card+day are
-- kept as two distinct rows (different `source`), never blurred.
--
-- source values used by Phase 11B:
--   'catalog'      - first-party daily snapshot of card_catalog.market_price
--                    (the printing-corrected canonical price; observed_on
--                    IS the observation date; source_observed_at stays null)
--   'ppt_backfill' - one-time import of PokemonPriceTracker Business raw
--                    Near Mint daily market-reference history. observed_on
--                    is the provider's own point date; source_observed_at
--                    records that same provider date explicitly.
-- (future, NOT in 11B: 'graded_sold', 'listing', ...)

alter table price_history
  add column if not exists source_observed_at timestamptz;  -- the provider's own date for a backfilled point; null for first-party rows

alter table price_history
  add column if not exists card_number text;                -- denormalised card identity aid (nullable)

-- Source-filtered chronological scans (merge read path, backfill audits).
create index if not exists price_history_source_idx
  on price_history (source, observed_on desc);

comment on column price_history.source is
  'catalog = first-party daily snapshot of the canonical card_catalog price; ppt_backfill = one-time PokemonPriceTracker Business raw NM history import; observations from different sources for the same card/day are distinct rows and never merged in storage.';
comment on column price_history.source_observed_at is
  'For provider-backfilled rows: the provider''s own timestamp for the observation. Null for first-party rows, where observed_on is authoritative.';
