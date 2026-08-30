-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- PREREQUISITE: supabase/deals_feed_discovery_migration.sql must be applied first.
--
-- Phase 2 discovery-gap analytics. Append-only event log: one row every time
-- the scanner OR the external-feed ingestion *evaluates* a listing far
-- enough to know what card it is. Kept separate from `deals` on purpose -
-- `deals` is mutable current-state (~20 read paths depend on its shape);
-- this is immutable history, written best-effort (a failed insert never
-- breaks a scan), and only ever read by the admin discovery report.
--
-- What it powers: discovery overlap over time (Step 3), per-marketplace gap
-- rates (Step 7), scan-vs-feed discovery latency (Step 8), and
-- listings-vs-accepted-deals acceptance rates (Step 9). It deliberately
-- does NOT store the scanner's constant filters/category (183454,
-- FIXED_PRICE|AUCTION, deliveryCountry) - those are invariant, storing them
-- per row is noise.

create table if not exists discovery_events (
  id            bigint generated always as identity primary key,
  -- Stable across both pipelines: 'EBAY_GB:377442529729' (marketplace +
  -- eBay legacy numeric id). Lets scan and feed sightings of one listing
  -- be lined up on a timeline.
  listing_key   text        not null,
  marketplace   text        not null,
  source        text        not null,          -- 'scan' | 'external'
  search_type   text,                          -- 'sweep' | 'priority' | 'extended' | 'external'
  card_tcgplayer_id text,                      -- matched card when known (null = no confident match)
  became_deal   boolean     not null default false,  -- passed every gate -> upserted into deals
  discount_pct  numeric,                       -- our computed discount at this sighting (null unless became_deal)
  external_discount_hint numeric,              -- the discount the board displayed (external only)
  external_source_url text,                    -- the board row href - INTERNAL/debug only, never rendered
  occurred_at   timestamptz not null default now()
);

create index if not exists discovery_events_key_time_idx    on discovery_events (listing_key, occurred_at);
create index if not exists discovery_events_source_time_idx  on discovery_events (source, occurred_at desc);
create index if not exists discovery_events_deal_time_idx    on discovery_events (became_deal, occurred_at desc);

-- Internal analytics only - never read by the anon (public) client. RLS on,
-- no public policy; the admin report route uses the service-role key.
alter table discovery_events enable row level security;
