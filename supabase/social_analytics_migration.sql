-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase SOCIAL-ANALYTICS-1 - performance measurement (§3, §34).
--
-- Adds ONE new table. Reuses the EXISTING social_story_placements /
-- social_stories tables (SOCIAL-NEWSROOM-1 migration) for placement/story
-- identity - does not duplicate them. Reuses the EXISTING metric
-- normalization model from lib/social/distribution/metrics.mjs (built in
-- Phase 13E.7A) - this table just gives that model durable, queryable
-- storage for the CURRENT (AUTOPILOT/DISCOVERY) placement system, which
-- persists placements in social_story_placements, not the older
-- lib/social/distribution/ledger.json file 13E.7A's own snapshots live in.
--
-- Append-only, same discipline as social_qa_runs: a metrics sync NEVER
-- updates or deletes a prior snapshot row - each observation is its own
-- immutable record, so historical performance can never be silently
-- rewritten. A provider read error is not written here at all (no row =
-- no fabricated zero); the caller surfaces the error separately.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Safe to run more than once. This table's ABSENCE degrades every reader
-- in this codebase to a graceful "not ready" result (see
-- lib/social/analytics/metricsHistory.mjs's tablesReady() probe) - nothing
-- ever throws if this migration has not been applied yet.

create table if not exists social_post_metric_snapshots (
  id                  bigint generated always as identity primary key,
  placement_id        text not null references social_story_placements (placement_id) on delete cascade,
  story_id            text references social_stories (story_id) on delete cascade,
  snapshot_hash       text,                       -- the frozen SocialStorySnapshot hash this placement used
  provider_ref        text,                       -- Buffer post id at the time of this observation
  platform            text not null,              -- instagram | x | tiktok | youtube_shorts
  channel             text,                       -- resolved channel id/name, informational only

  observed_at         timestamptz not null default now(),  -- when THIS snapshot was captured
  published_at        timestamptz,                          -- the post's own published_at, if known at capture time
  post_age_seconds    integer,                               -- observed_at - published_at, precomputed for fast windowing

  metrics             jsonb not null default '{}'::jsonb,    -- normalized METRIC_KEYS -> number | null (never fabricated 0)
  unsupported         jsonb not null default '[]'::jsonb,    -- METRIC_KEYS this platform cannot report at all
  units                jsonb not null default '{}'::jsonb,   -- provider-reported unit per metric, where given
  provider_metrics_raw_sanitized jsonb,                       -- the sanitized raw provider payload (no secrets/auth headers)
  provider_metrics_updated_at    timestamptz,                 -- the provider's own freshness stamp, when it gives one

  source              text not null default 'buffer',        -- 'buffer' | 'manual' | future providers
  collector_version   text not null,                          -- lib/social/analytics module version that wrote this row
  dedupe_key          text,                                   -- placement_id + provider_metrics_updated_at (or observed hour) - lets a rerun skip a true duplicate observation safely

  error               jsonb,                                  -- { reason, detail } when this specific sync attempt failed - see note below

  created_at          timestamptz not null default now()
);

-- A sync ERROR is not written as a metrics row in the normal path (the
-- caller keeps the last good snapshot and records the error alongside the
-- placement instead - see metricsHistory.mjs). The `error` column exists
-- only so a caller that explicitly wants an auditable error trail can
-- write one without inventing a second table; it is never required.

create index if not exists social_metrics_placement       on social_post_metric_snapshots (placement_id);
create index if not exists social_metrics_story           on social_post_metric_snapshots (story_id);
create index if not exists social_metrics_platform        on social_post_metric_snapshots (platform);
create index if not exists social_metrics_observed        on social_post_metric_snapshots (observed_at desc);
create unique index if not exists social_metrics_dedupe   on social_post_metric_snapshots (dedupe_key) where dedupe_key is not null;

alter table social_post_metric_snapshots enable row level security;

comment on table social_post_metric_snapshots is
  'SOCIAL-ANALYTICS-1: one immutable, timestamped, provider-read-only performance observation per placement. Never updated or deleted - a correction is a NEW row, not an edit. metrics uses null (not 0) for anything the provider did not report; unsupported lists metrics the platform structurally cannot report at all. RLS: deny-all for anon; server-side service-role access only, exactly like social_story_placements.';
