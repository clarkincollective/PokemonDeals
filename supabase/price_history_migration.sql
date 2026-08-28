-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Starts collecting a real price time-series. The site currently keeps
-- only CURRENT prices (watchlist.last_known_price is overwritten every
-- day, deals.market_price is per-listing and churns) - so there is no
-- history to build a "biggest movers / price trends" page from. This
-- table fixes that going forward: /api/sync-watchlist appends one row
-- per tracked card per daily run.
--
-- No user-facing feature yet - pure collection. A movers page needs
-- ~4-8 weeks of rows before it's meaningful.
--
-- Non-destructive: one new table + indexes, nothing else touched.

create table if not exists price_history (
  id           bigint generated always as identity primary key,
  tcgplayer_id text        not null,            -- watchlist.justtcg_tcgplayer_id, the stable card id
  name         text        not null,            -- denormalised so a row is still readable if the watchlist entry is later retired
  "set"        text        not null,
  language     text        not null default 'english',
  condition    text        not null default 'Near Mint',  -- only NM today; column reserved for LP/MP/graded rows a future job can add
  price        numeric     not null,            -- USD market reference (PokemonPriceTracker, sold-data-derived)
  source       text        not null default 'catalog',    -- 'catalog' = PPT catalog market price; future: 'listing', 'graded_sold'
  observed_on  date        not null default (now() at time zone 'utc')::date,
  observed_at  timestamptz not null default now()
);

-- One observation per card + condition + source + calendar day. Makes a
-- same-day re-run of sync-watchlist (manual trigger + cron) idempotent
-- via upsert instead of piling up duplicates.
create unique index if not exists price_history_daily_uniq
  on price_history (tcgplayer_id, condition, source, observed_on);

-- Per-card history lookups (a future card page or movers query).
create index if not exists price_history_card_idx
  on price_history (tcgplayer_id, observed_on desc);

-- Day-slice scans (a future "biggest movers between date A and B" query).
create index if not exists price_history_day_idx
  on price_history (observed_on desc);
