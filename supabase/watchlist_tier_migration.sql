-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Splits the watchlist into a "priority" tier (scanned very frequently -
-- this is where affiliate clicks actually come from) and an "extended"
-- tier (broader $5+ catalog coverage, scanned less often so it doesn't
-- eat the request budget the priority tier needs).

alter table watchlist
  add column if not exists tier text not null default 'priority';

create index if not exists watchlist_active_tier on watchlist (active, tier);
