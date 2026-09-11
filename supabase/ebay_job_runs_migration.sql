-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase 14R - real eBay Browse call telemetry. One row per ROUTE
-- INVOCATION (not per API call - see lib/ebayTelemetry.js), written best
-- effort when the invocation finishes, however it finishes. Same
-- append-only / internal-analytics-only shape as discovery_events
-- (supabase/discovery_analytics_migration.sql): a missing table or a
-- failed insert must never break a scan, a verify run, or an image sweep.
--
-- Distinguishes at least: refresh-deals:sweep, refresh-deals:allocated,
-- verify-deals, screen-deal-images, refresh-sealed-deals, ingest-feed -
-- the `job` column, never a shared generic "ebay" bucket. The sweep's own
-- getGradingDetails sub-consumer is broken out via graded_detail_calls
-- rather than a separate job value, since it happens inside the SAME
-- sweep/allocated invocation, not as its own route.

create table if not exists ebay_job_runs (
  id                     bigint generated always as identity primary key,
  job                    text        not null,   -- 'refresh-deals:sweep' | 'refresh-deals:allocated' | 'refresh-deals:manual' | 'verify-deals' | 'screen-deal-images' | 'refresh-sealed-deals' | 'ingest-feed'
  mode                   text,                    -- free-form: e.g. the ?tier or ?mode value, kept for grouping only
  country                text,                    -- marketplace id when the invocation is single-country, e.g. 'EBAY_US'
  started_at             timestamptz not null,
  completed_at           timestamptz,
  browse_calls           integer     not null default 0,  -- every real outbound Browse HTTP request, retries included
  analytics_calls        integer     not null default 0,  -- getBrowseRateLimit calls - a SEPARATE quota pool, never counted in browse_calls
  graded_detail_calls    integer     not null default 0,  -- subset of browse_calls that were getGradingDetails lookups
  calls_skipped          integer     not null default 0,  -- candidates deliberately not looked up this run (e.g. a cap reached) - may still be looked up later
  quota_remaining_start  integer,                 -- live buy.browse `remaining` at invocation start, when observed
  quota_remaining_end    integer,                 -- live buy.browse `remaining` at invocation end, when observed
  quota_limit            integer,
  reserve_floor          integer,                 -- the RESERVE/floor this invocation was gated against (unchanged by this phase)
  skip_reason            text,                    -- e.g. 'quota_reserve' | 'ebay_rate_limited' | 'rate_limit_unknown' - null when the run proceeded
  dedupe_saved_image     integer     not null default 0,  -- Phase 14Q image-recovery calls avoided (never a generic NOOP)
  dedupe_saved_grading   integer     not null default 0,  -- Phase 14Q graded-lookup calls avoided (never a generic NOOP)
  status                 text        not null default 'success', -- 'success' | 'skipped' | 'partial' | 'error'
  error_class            text,                    -- err.name when status = 'error' - never a full message/stack (no payload logging)
  created_at             timestamptz not null default now()
);

create index if not exists ebay_job_runs_job_time_idx on ebay_job_runs (job, started_at desc);
create index if not exists ebay_job_runs_time_idx on ebay_job_runs (started_at desc);

-- Internal analytics only - never read by the anon (public) client. RLS
-- on, no public policy; only the service-role key (lib/supabaseAdmin)
-- reads or writes this table.
alter table ebay_job_runs enable row level security;
