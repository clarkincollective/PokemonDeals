-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase 17C.9 - sealed availability evidence.
--
-- 17C.7 requires an EARLY listing (one that existed before its set's
-- release day) to carry eBay's own positive confirmation that the exact
-- listing is active before it may be shown, even plainly. `deals` has
-- that column (supabase/deal_availability_migration.sql); `sealed_deals`
-- does not, so an early sealed listing can never produce the evidence and
-- is hidden outright. This adds the same column, with the same meaning
-- and the same conservative default.
--
-- Written ONLY by an exact, positive, single-item eBay response
-- (get_item_by_legacy_id), never by a search sighting - `last_seen_at`
-- keeps that job. NULL means "never exactly verified", which every reader
-- treats as not-confirmed. No backfill: historical evidence that does not
-- exist is never fabricated.
--
-- `disqualified_reason` mirrors the `deals` column that lib/dealQuality
-- already treats as an unconditional hide, so an availability retirement
-- (availability:sold / availability:not_found_in_marketplace, see
-- lib/listingAvailability.js) can be persisted for sealed rows too.

alter table sealed_deals add column if not exists exact_verified_at timestamptz;
alter table sealed_deals add column if not exists disqualified_reason text;

-- Powers the "oldest / never-verified first" priority queue the verifier
-- builds, without a sequential scan over the active set.
create index if not exists sealed_deals_exact_verified_at
  on sealed_deals (exact_verified_at nulls first);

-- The verifier only ever considers active rows; this keeps that scan cheap.
create index if not exists sealed_deals_active_verified
  on sealed_deals (is_active, exact_verified_at nulls first);
