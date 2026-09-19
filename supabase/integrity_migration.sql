-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- 2026-09-19 (GEO follow-up) - listing integrity report, two additions.
--
-- 1. deals.deactivated_at - WHEN a listing stopped being shown. Stamped
--    by a trigger the moment is_active flips true -> false, so none of the
--    six code paths that deactivate a row (verify, sweep, availability
--    quarantine, feed ingest, refresh, auction re-pricing) change at all.
--    /integrity reads it for "stopped being shown in the last 24 hours";
--    until this runs the page omits that sentence rather than print 0.
--
-- 2. integrity_snapshots - one row per UTC day with the report's counts,
--    written by the /api/integrity-snapshot cron (vercel.json). The page
--    charts the series; an AI engine can cite a dated time series of
--    "listings shown / withheld and why". Aggregate counts only - no
--    listing, seller or visitor data - so anon SELECT is allowed.
--
-- Additive and idempotent. No existing row is rewritten.

alter table deals add column if not exists deactivated_at timestamptz;

create or replace function deals_stamp_deactivated_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_active = false and (old.is_active is distinct from false) then
    new.deactivated_at = now();
  elsif new.is_active = true then
    new.deactivated_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_stamp_deactivated_at on deals;
create trigger deals_stamp_deactivated_at
  before update of is_active on deals
  for each row
  execute function deals_stamp_deactivated_at();

create index if not exists deals_deactivated_at_idx
  on deals (deactivated_at)
  where deactivated_at is not null;

comment on column deals.deactivated_at is
  'Set by trigger when is_active flips to false (cleared when it flips back). Read by /integrity for "stopped being shown" counts.';

create table if not exists integrity_snapshots (
  day date primary key,
  generated_at timestamptz not null default now(),
  active_shown integer not null,
  withheld_active integer not null,
  checked_24h integer not null,
  stopped_24h integer,
  withheld_by_reason jsonb not null default '[]'::jsonb
);

alter table integrity_snapshots enable row level security;

drop policy if exists integrity_snapshots_public_read on integrity_snapshots;
create policy integrity_snapshots_public_read
  on integrity_snapshots for select
  to anon, authenticated
  using (true);

comment on table integrity_snapshots is
  'Daily aggregate counts behind /integrity (shown, withheld by reason family, checked / stopped in 24 h). Public read; written by the service role only.';
