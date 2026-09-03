-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase 12A closeout - alert-target currency integrity.
--
-- `price_alerts.target_price` was a bare `numeric` with NO currency. The
-- cron (`/api/check-alerts`) compared it against a listing's NATIVE
-- `total_price` (AUD / CAD / GBP / EUR / USD depending on which
-- marketplace happened to have the cheapest listing that run) - an
-- undefined-unit comparison that can trigger, or fail to trigger, an
-- alert incorrectly on non-US marketplaces.
--
-- New contract: alert thresholds are stored and compared in USD.
--   match := deals.total_price_usd <= price_alerts.target_price_usd
-- `total_price_usd` is the USD form of the listing's TOTAL acquisition
-- cost (item + shipping), so shipping treatment is unchanged.
--
-- The form now asks for the target explicitly in USD (no client-side FX,
-- no conversion at creation) and writes `target_price_usd` directly.
--
-- Legacy rows: `target_price` cannot be assigned a currency
-- deterministically (the card-hub form used to suggest the listing's
-- NATIVE price, the deal page suggested USD, and a hand-typed number is
-- unknowable). We FAIL CLOSED: a row with `target_price` set and
-- `target_price_usd` null is DORMANT for price-matching - the cron skips
-- it (no email) until the subscriber re-submits the form, which writes
-- `target_price_usd`. Untargeted alerts (`target_price` null) are
-- unaffected: "any below-market listing" is a percentage, currency-free.
--
-- Non-destructive: one nullable column + comments. No data rewritten, no
-- threshold reinterpreted, no notification state touched.

alter table price_alerts
  add column if not exists target_price_usd numeric;

comment on column price_alerts.target_price is
  'DEPRECATED (Phase 12A closeout). Unitless legacy threshold - do NOT compare against it. A row with this set and target_price_usd null is dormant for price-matching until the subscriber re-sets the alert.';

comment on column price_alerts.target_price_usd is
  'Alert threshold in USD. Cron matches deals.total_price_usd (USD total incl. shipping) <= this. Null = notify on any below-market listing.';
