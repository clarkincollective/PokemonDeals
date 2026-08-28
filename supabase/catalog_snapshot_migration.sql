-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase A - precomputed catalogue aggregates.
--
-- fetchSets / fetchCardHubs / fetchSpeciesHubs each scanned every active
-- English deal row (~8k) in 1,000-row pages and grouped in JS on every
-- cold cache. That made the first hit of /sets, /pokemon, every
-- /pokemon/[slug] and every filtered listing page take ~7s, and made the
-- build slow (all the static aggregate pages recompute at once).
--
-- This table holds the three aggregates as JSON blobs, one row per kind,
-- refreshed every 15 minutes by /api/refresh-catalog (a cheap DB-only
-- job - no eBay calls). The read path (lib/deals.js) reads one row
-- instead of scanning, and falls back to a live scan if the row is
-- missing or older than ~90 minutes.
--
-- Non-destructive: creates one new table, adds a read policy. No existing
-- data touched.

create table if not exists catalog_snapshot (
  kind text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table catalog_snapshot enable row level security;

-- The aggregates are just counts/slugs derived from deals that are
-- already publicly readable, so anon read is fine. Writes only ever come
-- from the service-role key (which bypasses RLS).
drop policy if exists "catalog_snapshot public read" on catalog_snapshot;
create policy "catalog_snapshot public read"
  on catalog_snapshot for select
  using (true);
