-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase SOCIAL-NEWSROOM-1 - editorial content database (§3, §48).
--
-- Adds THREE new tables. It does NOT touch `deals`, the distribution
-- ledger's JSON files, `newsletter_subscribers`, `catalog_snapshot`, or
-- `digest_state`. The newsroom's editorial truth lives here; Buffer stays
-- the delivery/schedule provider only (§28).
--
-- Reuse decisions (why these are new tables, not columns elsewhere):
--   * lib/social/distribution/ledger.json  - per-PLACEMENT send state
--     (QUEUED/PUBLISHED). Unchanged. A newsroom placement points AT a
--     ledger job by content_id/platform; it does not duplicate its state.
--   * lib/social/planner/plans.json        - short-horizon PROPOSED plans.
--     Unchanged. The newsroom calendar is a longer editorial horizon and
--     is regenerated, so it is not worth persisting as rows yet - only
--     committed STORIES + their PLACEMENTS are.
--   * social_stories       - the platform-independent editorial idea (§2).
--   * social_story_placements - one row per platform-native placement.
--   * social_qa_runs       - an append-only audit of every QA layer result.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
-- ADD COLUMN IF NOT EXISTS. Safe to run more than once.
--
-- RLS: enabled with ZERO policies = deny-all for anon (same posture as
-- newsletter_subscribers / price_alerts). Every access is server-side
-- with the service-role key via lib/social/newsroom/db.mjs (read-only in
-- this phase).

-- ============================================================
-- 1. social_stories
-- ============================================================
create table if not exists social_stories (
  story_id            text primary key,
  series              text not null,
  pillar              text not null,
  bucket              text,                       -- CONVERSION | ORGANIC_GROWTH | AUTHORITY | BRAND
  content_goal        text,                       -- REACH | ENGAGEMENT | TRUST | CONVERSION | BRAND
  cta_intensity       text,                       -- HARD | SOFT | BRAND_ONLY | NONE
  shelf_life_class    text,                       -- LIVE | SHORT | EDITORIAL | EVERGREEN
  lane                text,                       -- FRESH | PLANNED
  subject_type        text,                       -- card | set | species | catalog | concept
  subject_id          text,
  pokemon             text,
  set_id              text,
  card_ids            jsonb default '[]'::jsonb,
  deal_ids            jsonb default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  captured_at         timestamptz,                -- when facts_json was frozen
  valid_from          timestamptz,
  valid_until         timestamptz,
  latest_safe_publish_at timestamptz,
  shelf_basis         text,
  organic_score       numeric,
  conversion_score    numeric,
  originality_score   numeric,
  professional_score  text,                       -- PASS | WATCH | FAIL (last QA stack)
  status              text not null default 'OPPORTUNITY',
  facts_json          jsonb not null default '{}'::jsonb,
  experiment_id       text,
  source_commit       text,
  narrative           boolean default false,
  updated_at          timestamptz not null default now()
);

alter table social_stories
  add column if not exists professional_score text,
  add column if not exists source_commit      text,
  add column if not exists narrative          boolean default false;

create index if not exists social_stories_status      on social_stories (status);
create index if not exists social_stories_series      on social_stories (series);
create index if not exists social_stories_pillar      on social_stories (pillar);
create index if not exists social_stories_lane        on social_stories (lane);
create index if not exists social_stories_valid_until on social_stories (valid_until);
create index if not exists social_stories_created     on social_stories (created_at desc);

alter table social_stories enable row level security;

comment on table social_stories is
  'SOCIAL-NEWSROOM-1: the platform-independent editorial idea. One story fans out into social_story_placements. facts_json holds the FROZEN factual fields - never regenerated, never fabricated. RLS: deny-all for anon; server-side service-role access only.';

-- ============================================================
-- 2. social_story_placements
-- ============================================================
create table if not exists social_story_placements (
  placement_id        text primary key,
  story_id            text not null references social_stories (story_id) on delete cascade,
  platform            text not null,              -- instagram | tiktok | x | youtube
  placement_type      text,                       -- reel | carousel | video | post | short
  planned_for         timestamptz,
  status              text not null default 'PLANNED',
  -- links OUT to the existing systems (no duplicated state):
  content_id          text,                       -- distribution ledger job key
  artifact_hash       text,                       -- lib/social/storage/hostedAssets sha256
  hosted_url          text,                       -- Supabase-hosted rendered asset
  buffer_provider_ref text,                       -- Buffer post id (BUFFER_QUEUED)
  scheduled_for       timestamptz,                -- Buffer's own dueAt
  provider_state      text,                       -- last polled Buffer PostStatus
  published_at        timestamptz,
  platform_post_url   text,
  caption_style       jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table social_story_placements
  add column if not exists scheduled_for  timestamptz,
  add column if not exists provider_state text;

create index if not exists social_placements_story    on social_story_placements (story_id);
create index if not exists social_placements_platform on social_story_placements (platform);
create index if not exists social_placements_status   on social_story_placements (status);
create index if not exists social_placements_planned  on social_story_placements (planned_for);
create unique index if not exists social_placements_story_platform
  on social_story_placements (story_id, platform);

alter table social_story_placements enable row level security;

comment on table social_story_placements is
  'SOCIAL-NEWSROOM-1: one platform-native placement of a story. Points AT the distribution ledger (content_id), hosted assets (artifact_hash), and Buffer (buffer_provider_ref) - it never duplicates their state. Provider acceptance of a scheduled post = BUFFER_QUEUED, never PUBLISHED.';

-- ============================================================
-- 3. social_qa_runs (append-only)
-- ============================================================
create table if not exists social_qa_runs (
  qa_id        bigint generated always as identity primary key,
  story_id     text references social_stories (story_id) on delete cascade,
  placement_id text references social_story_placements (placement_id) on delete cascade,
  qa_type      text not null,                     -- FACT | RIGHTS_IMAGE | CREATIVE | ORIGINALITY_SEQUENCE | VISUAL_REVIEW | STACK
  result       text not null,                     -- PASS | WATCH | FAIL
  score        numeric,
  blockers     jsonb default '[]'::jsonb,
  detail       jsonb default '{}'::jsonb,
  checked_at   timestamptz not null default now()
);

create index if not exists social_qa_runs_story     on social_qa_runs (story_id);
create index if not exists social_qa_runs_placement on social_qa_runs (placement_id);
create index if not exists social_qa_runs_checked   on social_qa_runs (checked_at desc);

alter table social_qa_runs enable row level security;

comment on table social_qa_runs is
  'SOCIAL-NEWSROOM-1: append-only audit of every QA layer result for a story/placement. A WATCH or FAIL row means the placement cannot autonomously reach BUFFER_READY.';
