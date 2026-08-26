-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Stores each auto-added card's price at sync time, so the priority/
-- extended thresholds can be tuned instantly with SQL afterward instead
-- of re-running the full catalog sync (which costs several minutes and
-- API credits) every time.

alter table watchlist
  add column if not exists last_known_price numeric;
