-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase 17C.9 - sealed availability evidence + guarded discovery writes.
--
-- PURELY ADDITIVE. Two nullable columns and three indexes on sealed_deals.
-- No column is dropped, renamed, retyped or backfilled; no existing row is
-- modified; no constraint is added that existing rows could violate. Every
-- statement is IF NOT EXISTS, so re-running it is a no-op. Applying it
-- while the current code is live changes nothing on its own: both columns
-- read as NULL, which every reader already treats as "no evidence".
--
-- WHY THESE COLUMNS
--
-- 1. exact_verified_at
--    17C.7 requires an EARLY listing (one first seen before its set's
--    release day) to carry eBay's own positive confirmation that the exact
--    listing is active before it may be shown, even plainly. `deals` has
--    this column (supabase/deal_availability_migration.sql); sealed_deals
--    does not, so no sealed row can ever produce the evidence and all 138
--    early sealed rows stay hidden indefinitely - before AND after release.
--    Written ONLY by an exact, positive, single-item eBay response
--    (get_item_by_legacy_id), never by a search sighting: `last_seen_at`
--    keeps that job. NULL means "never exactly verified". No backfill -
--    historical evidence that does not exist is never fabricated.
--
-- 2. disqualified_reason
--    Mirrors the `deals` column. Two jobs:
--      a. persists an availability retirement ('availability:sold' /
--         'availability:not_found_in_marketplace', see
--         lib/listingAvailability.js), which lib/dealQuality treats as an
--         unconditional hide;
--      b. it is the GUARD COLUMN for the guarded discovery write
--         (lib/listingAvailability.writeGuardedSighting). Without it the
--         sealed scanner's plain upsert re-sets is_active=true and a fresh
--         last_seen_at on a row the verifier has just retired as sold, so a
--         sighting silently undoes a retirement. The daily sealed scan is
--         the writer that would do it.
--
-- ORDER MATTERS: this migration must be applied BEFORE the code that
-- writes these columns is deployed. The code probes for the columns and
-- degrades (plain upsert, no availability evidence) while they are absent,
-- so applying the migration first is safe in both directions.

alter table sealed_deals add column if not exists exact_verified_at timestamptz;
alter table sealed_deals add column if not exists disqualified_reason text;

-- Powers the "oldest / never-verified first" priority queue the sealed
-- verifier lane builds, without a sequential scan over the active set.
create index if not exists sealed_deals_exact_verified_at
  on sealed_deals (exact_verified_at nulls first);

-- The verifier only ever considers active rows; keeps that scan cheap.
create index if not exists sealed_deals_active_verified
  on sealed_deals (is_active, exact_verified_at nulls first);

-- The recovery queue reads retired rows by their seen-again marker
-- (partial: only retired rows are ever scanned this way).
create index if not exists sealed_deals_disqualified_reason
  on sealed_deals (disqualified_reason)
  where disqualified_reason is not null;
