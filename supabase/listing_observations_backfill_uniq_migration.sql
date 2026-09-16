-- SEO-2.5.2 - BACKFILL IDEMPOTENCY. Run in the Supabase dashboard:
-- SQL Editor > New query > paste > Run.
--
-- PURELY ADDITIVE. One new index. No table, column, policy, trigger or
-- function is altered; no existing row is inserted, updated or deleted. The
-- existing kind='daily' index is NOT touched. IF NOT EXISTS, so re-running
-- this file is a no-op.
--
-- WHY THIS EXISTS. listing_observations_daily_uniq is PARTIAL
-- (WHERE kind = 'daily'), so it constrains daily rows and nothing else. That
-- is correct for live capture, but it left backfill rows with no uniqueness
-- guarantee at all: a second `observations:backfill --apply`, or a retry
-- after an interrupted one, would insert a second copy of all ~29,000 rows
-- and quietly corrupt the dataset the log exists to protect. The backfill
-- writer must be able to lean on the database for idempotency, exactly as
-- live capture does, rather than on a pre-read it cannot make atomic.
--
-- WHAT THE TWO INDEXES ALLOW TOGETHER, for one (source, marketplace,
-- listing_id, observation_date):
--
--   * exactly ONE kind='daily'    row  - enforced by listing_observations_daily_uniq
--   * exactly ONE kind='backfill' row  - enforced by the index below
--   * ANY NUMBER of kind='transition' rows - deliberately unconstrained, so a
--     real same-day change (an auction re-price, a retirement) can still be
--     recorded more than once in a day
--
-- A daily row and a backfill row for the same listing and day therefore
-- coexist without colliding: each index only sees its own kind. That matters
-- right now - 19 live daily rows already exist for listings the backfill
-- would also snapshot on 2026-09-16.
--
-- SAFE TO RUN NOW. A unique index can only be created if the data already
-- satisfies it; there are currently ZERO kind='backfill' rows, so it cannot
-- fail on existing data. Run it BEFORE any `--apply`, never after.

CREATE UNIQUE INDEX IF NOT EXISTS listing_observations_backfill_uniq
  ON listing_observations (source, marketplace, listing_id, observation_date)
  WHERE kind = 'backfill';

COMMENT ON INDEX listing_observations_backfill_uniq IS
  'SEO-2.5.2 idempotency guard for the one-off backfill snapshot. Partial on kind=backfill so it can never collide with a live daily observation. The backfill writer inserts plainly and treats 23505 from this index as an already-done row.';

-- VERIFICATION. Run this after the CREATE above; it should return BOTH rows,
-- the daily one unchanged and the backfill one new.
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'listing_observations'
  AND indexname IN ('listing_observations_daily_uniq', 'listing_observations_backfill_uniq')
ORDER BY indexname;
