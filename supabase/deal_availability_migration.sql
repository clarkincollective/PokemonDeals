-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase P0.2 - deal availability & freshness integrity incident.
--
-- Root cause: `deals.last_seen_at` was the ONLY freshness timestamp, and it
-- is written by TWO different kinds of eBay response:
--   1. a broad discovery/re-scan search result that merely mentions this
--      listing_id again (app/api/refresh-deals) - NOT an authoritative
--      per-item confirmation;
--   2. an exact, single-item get_item_by_legacy_id lookup that positively
--      confirms the SPECIFIC listing is still active/purchasable
--      (app/api/verify-deals).
-- Both wrote the same column, so a row that was only ever discovered once
-- (search-matched) and never independently re-confirmed could sit
-- "last_seen_at looks recent" for its entire freshness TTL (previously up
-- to 168 hours) while the underlying eBay listing had already sold -
-- confirmed live in production (see docs/p02-availability-incident.md).
--
-- Fix: a SEPARATE column that is written ONLY by an exact, positive,
-- single-item eBay response. Premium/flagship surfaces require this column
-- to be recently fresh; ordinary display keeps using last_seen_at (now on
-- a much shorter TTL - see lib/dealQuality.js FRESHNESS_TTL_HOURS).
--
-- No backfill: an existing row's exact_verified_at starts NULL (never
-- fabricate a fresh timestamp for historical evidence that doesn't exist -
-- P0.2 brief, section 4). A NULL value is treated as "never exactly
-- verified" everywhere it is read, which is the conservative, correct
-- default - it will be set the first time app/api/verify-deals confirms
-- (or fails to confirm) the row after this migration runs.

alter table deals add column if not exists exact_verified_at timestamptz;

-- Powers the priority query in app/api/verify-deals (oldest/never-verified
-- rows first) without a sequential scan.
create index if not exists deals_exact_verified_at
  on deals (exact_verified_at nulls first);
