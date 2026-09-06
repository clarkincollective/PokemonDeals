-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- P0.4.2 - scan-target allocation state + per-run observability.
--
-- Replaces the static 26-card "priority" tier + the ~30-day "extended"
-- chunk rotation with one evidence-based per-target priority queue
-- (lib/scanAllocator, driven by ?tier=allocated&country=X). This table is
-- the queue's memory: one row per (card, marketplace), upserted by the
-- scanner after every per-card search it runs in that marketplace.
--
-- Best-effort, like discovery_events: the allocated scan route degrades
-- gracefully if this table is missing (every target reads as
-- never-searched -> a pure least-recently-searched rotation, which is
-- still a safe, breadth-maximising schedule). Internal only - RLS on, no
-- public policy; the scanner uses the service-role key.
--
-- Non-destructive: two new tables + indexes. Nothing on `deals`,
-- `watchlist`, `discovery_events` changes.

create table if not exists scan_target_state (
  card_tcgplayer_id        text        not null,
  marketplace              text        not null,   -- EBAY_US | EBAY_GB | ...
  last_searched_at         timestamptz,            -- last time this (card,market) was searched
  last_deal_at             timestamptz,            -- last time a search here produced a real deal
  searches_total           integer     not null default 0,
  searches_since_deal      integer     not null default 0,
  consecutive_no_new       integer     not null default 0, -- searches in a row returning 0 NEW distinct listings
  last_unique_listings     integer,                -- distinct listings the last search returned
  state                    text        not null default 'normal', -- hot | warm | normal | long_tail (advisory)
  -- §7: a genuinely strong deal on this exact printing recently
  -- expired/sold -> the printing gets a bounded score boost to look for
  -- NEW listings (never the dead listing) until this timestamp.
  expired_deal_boost_until timestamptz,
  updated_at               timestamptz not null default now(),
  primary key (card_tcgplayer_id, marketplace)
);

-- The allocator's hot path: "least-recently-searched in this marketplace"
-- (nulls first = never searched = highest priority).
create index if not exists scan_target_state_lrs_idx
  on scan_target_state (marketplace, last_searched_at nulls first);

-- The §7 recently-expired boost lookup.
create index if not exists scan_target_state_boost_idx
  on scan_target_state (marketplace, expired_deal_boost_until)
  where expired_deal_boost_until is not null;

alter table scan_target_state enable row level security;

-- One row per allocated run: enough to audit "why did the scanner spend
-- its budget the way it did" without a second analytics system.
create table if not exists scan_allocation_runs (
  id                    bigint generated always as identity primary key,
  marketplace           text        not null,
  ran_at                timestamptz not null default now(),
  budget                integer,                   -- targets the run was allowed (== Browse calls)
  eligible_targets      integer,
  targets_selected      integer,
  by_state              jsonb,                     -- {hot,warm,normal,long_tail} of the selection
  by_lane               jsonb,                     -- {hot,explore,exploit} of the selection
  explore_count         integer,
  exploit_count         integer,
  boosted_count         integer,
  browse_calls          integer,                   -- actual per-card searches issued
  deals_found           integer,
  new_printings         integer,                   -- selected targets never searched here before
  p95_days_since_search numeric,                   -- of the eligible pool, at run time
  never_searched_in_pool integer,
  rate_limit_remaining  integer,
  quota_skipped         boolean     not null default false,
  took_ms               integer
);

create index if not exists scan_allocation_runs_time_idx
  on scan_allocation_runs (marketplace, ran_at desc);

alter table scan_allocation_runs enable row level security;
