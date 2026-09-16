-- APPEND-ONLY LISTING OBSERVATION LAYER (SEO-2.5).
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- PURELY ADDITIVE. One new table, its constraint and its indexes. No
-- existing table, column, index, policy, trigger or function is touched;
-- no existing row is inserted, updated or deleted. Every statement is
-- IF NOT EXISTS, so re-running it is a no-op.
--
-- WHY THIS EXISTS. `deals` holds one row per (source, marketplace,
-- listing_id) and is upserted with ignoreDuplicates, so a re-sighting never
-- writes anything new. A fixed-price listing's price and discount are
-- therefore frozen at first sighting and every later state is lost; an
-- auction's row is overwritten in place by re-pricing, so its earlier bids
-- are lost too. Measured 2026-09-16: 28,927 listing rows, but zero
-- observation history, and only 4.2% of rows carry reference provenance
-- (those columns arrived at 17C.10). Every day without this table is a day
-- of market history that cannot be reconstructed later.
--
-- NON-AUTHORITATIVE, BY DESIGN. Nothing that serves a page, qualifies a
-- deal, prices a listing, screens a card or allocates scanner budget reads
-- this table. It records what the existing system already concluded; it
-- never recomputes a conclusion and never feeds one back. A failed write
-- here must never fail a scan.
--
-- SAFE IN EITHER ORDER with the code deploy. The writer is best-effort and
-- swallows a missing-table error, so deploying the code first simply
-- records nothing until this runs.

CREATE TABLE IF NOT EXISTS listing_observations (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- WHICH LISTING. The same natural key `deals` uses, so an observation
  -- joins to its listing row without a surrogate. Stored rather than a
  -- deals.id FK so an observation survives a listing row being rewritten.
  source          text        NOT NULL,
  marketplace     text        NOT NULL,
  listing_id      text        NOT NULL,

  -- WHEN. `observed_at` is the exact instant; `observation_date` is the
  -- UTC day it is deduplicated on. Both are recorded because a day bucket
  -- alone cannot order two observations within a day.
  observed_at     timestamptz NOT NULL DEFAULT now(),
  observation_date date       NOT NULL,

  -- WHAT KIND. 'daily' is the once-per-UTC-day snapshot and is the only
  -- kind the uniqueness constraint applies to. 'transition' is an extra,
  -- deliberately-written row for a meaningful same-day change (a retirement
  -- or an auction re-price) and is exempt. 'backfill' marks the single
  -- snapshot taken from the state `deals` happened to retain when this
  -- table was created - it is NOT a real historical observation and must be
  -- excluded from any time-series analysis.
  kind            text        NOT NULL DEFAULT 'daily',

  -- POINT-IN-TIME IDENTITY. watchlist_id is the card the system believed
  -- this listing was at the moment of observation. Card and set are
  -- resolved through it, so a later reassignment of the listing cannot
  -- silently rewrite history. Deliberately NOT a fuzzy re-match later.
  watchlist_id    bigint,

  -- PRICE STATE, in the listing's own currency plus the USD canonical the
  -- system already computed. item + shipping + total are kept separately so
  -- a future study can never accidentally compare an item-only price with a
  -- shipping-inclusive one.
  price           numeric,
  shipping        numeric,
  total_price     numeric,
  total_price_usd numeric,
  currency        text,

  -- THE COMPARISON THE SYSTEM MADE, and the provenance of the reference it
  -- used. This is the whole point of the table: a discount is only
  -- reproducible if the reference behind it is recorded at the same moment.
  -- Never recompute a historical discount from a later reference.
  market_price        numeric,
  discount_pct        numeric,
  reference_amount    numeric,
  reference_currency  text,
  reference_source    text,
  reference_observed_at timestamptz,

  -- NORMALISATION. Required to keep future analysis like-for-like: a raw
  -- Near Mint discount is not comparable with a PSA 10 one, and an English
  -- reference is not comparable with a Japanese listing.
  listing_type    text,
  condition       text,
  is_graded       boolean,
  grader          text,
  grade           text,
  card_language   text,

  -- STATE AND SCREENING. Enough to tell later whether an observation was
  -- research-grade. 26% of stored listings carry a disqualification, and
  -- research must be able to exclude them without re-deriving the rule.
  is_active             boolean,
  disqualified_reason   text,
  visual_authenticity_status text,
  exact_verified_at     timestamptz,

  -- Listing discovery time, copied so persistence can be computed from this
  -- table alone without joining `deals`.
  first_seen_at   timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- DEDUPLICATION. The scanner re-sights an active listing many times a day;
-- without this, one unchanged listing would write dozens of identical rows.
-- PARTIAL on kind='daily' so a deliberate 'transition' row for a real
-- same-day change is still allowed, and a 'backfill' row cannot collide
-- with the first live daily observation.
CREATE UNIQUE INDEX IF NOT EXISTS listing_observations_daily_uniq
  ON listing_observations (source, marketplace, listing_id, observation_date)
  WHERE kind = 'daily';

-- Listing lifecycle lookups: "every observation of this listing, in order".
CREATE INDEX IF NOT EXISTS listing_observations_listing_idx
  ON listing_observations (source, marketplace, listing_id, observed_at);

-- Period scans: "every observation in this window", the shape every
-- set-level or era-level study starts from.
CREATE INDEX IF NOT EXISTS listing_observations_date_idx
  ON listing_observations (observation_date);

-- Card-level history without a join back through the listing.
CREATE INDEX IF NOT EXISTS listing_observations_watchlist_idx
  ON listing_observations (watchlist_id, observation_date);

COMMENT ON TABLE listing_observations IS
  'SEO-2.5 append-only market observation log. One row per listing per UTC day (kind=daily), plus explicit transition rows. Non-authoritative: nothing in the serving or scanning path reads it. Never UPDATE or DELETE a row here - the history is the asset.';
COMMENT ON COLUMN listing_observations.kind IS
  'daily | transition | backfill. backfill rows are a one-off snapshot of retained state, not real historical observations - exclude them from time series.';
COMMENT ON COLUMN listing_observations.reference_amount IS
  'The reference actually used for this observation''s discount_pct. Historical discounts must be reproduced from this, never from a current catalogue price.';
COMMENT ON COLUMN listing_observations.watchlist_id IS
  'Point-in-time card identity. Resolve card/set through watchlist; do not re-match identity later.';
