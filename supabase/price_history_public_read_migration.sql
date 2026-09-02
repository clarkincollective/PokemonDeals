-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- SEO Phase 11C - the card page (/cards/[slug]) now renders its price
-- history + trend intelligence from the canonical `price_history` spine
-- (Phase 11B) instead of a per-request PokemonPriceTracker history call.
-- That read happens through the site's public anon Supabase client (the
-- same one lib/deals.js already uses for `deals` / `watchlist` /
-- `card_catalog` / `catalog_snapshot`).
--
-- `price_history` has RLS enabled with no policy, so the anon key
-- currently gets a silent empty result (RLS deny-by-default). This adds a
-- read-only policy. The table holds public reference data only - a
-- TCGplayer card id, a date, a USD market-reference price, and a source
-- tag ('catalog' | 'ppt_backfill'). No user rows, nothing sensitive.
-- Same pattern as `catalog_snapshot public read` and
-- `Public read access to watchlist`.
--
-- Non-destructive: one policy, no schema or data change. Writes still
-- only ever come from the service-role cron jobs.

alter table price_history enable row level security;

drop policy if exists "price_history public read" on price_history;
create policy "price_history public read"
  on price_history for select
  using (true);
