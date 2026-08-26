-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Lets the catalog-sync job tell auto-added cards apart from your original
-- hand-picked 30, so it only ever adds/retires cards it added itself.

alter table watchlist
  add column if not exists source text not null default 'manual';
