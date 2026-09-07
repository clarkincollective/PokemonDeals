-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase CRM-1 - email capture + return-visitor loop.
--
-- The existing `newsletter_subscribers` table (supabase/newsletter_
-- migration.sql) already carries: id, email (unique), token (unique),
-- confirmed bool, source, created_at, confirmed_at, unsubscribed_at.
--
-- CRM-1 adds a lightweight subscriber model on TOP of it (no new table,
-- no data rewritten):
--
--   status           - lifecycle: PENDING | ACTIVE | UNSUBSCRIBED |
--                      BOUNCED | COMPLAINED. Authoritative going forward.
--                      `confirmed` (bool) + `unsubscribed_at` are RETAINED
--                      and kept in sync by the API routes for backward
--                      compat with the weekly digest cron; BOUNCED /
--                      COMPLAINED are only ever set by a future provider
--                      webhook (none in this phase).
--   utm_source/medium/campaign/content - the campaign tag on the link the
--                      subscriber signed up from (short codes only, never
--                      free text - the API validates with the same
--                      sanitizeUtmValue() rule the analytics layer uses).
--   signup_route     - the on-site path the capture form was submitted
--                      from (e.g. '/', '/deals/[id]', 'expired_deal').
--   consent_version  - which consent copy string was shown at signup
--                      (lib/crm/subscribers.CONSENT_VERSION).
--
-- Non-destructive: nullable columns + one backfill UPDATE + one partial
-- index + comments. RLS on `newsletter_subscribers` is unchanged (enabled,
-- zero policies = deny-all for anon; every access is via an API route
-- using the service-role key).

alter table newsletter_subscribers
  add column if not exists status          text,
  add column if not exists utm_source      text,
  add column if not exists utm_medium      text,
  add column if not exists utm_campaign    text,
  add column if not exists utm_content     text,
  add column if not exists signup_route    text,
  add column if not exists consent_version text;

-- Backfill `status` from the existing two-field encoding. Order matters:
-- an unsubscribe is terminal regardless of whether they had confirmed.
update newsletter_subscribers
  set status = case
    when unsubscribed_at is not null then 'UNSUBSCRIBED'
    when confirmed then 'ACTIVE'
    else 'PENDING'
  end
  where status is null;

comment on column newsletter_subscribers.status is
  'CRM-1 lifecycle: PENDING | ACTIVE | UNSUBSCRIBED | BOUNCED | COMPLAINED. Authoritative. `confirmed`/`unsubscribed_at` are kept in sync for the digest cron. BOUNCED/COMPLAINED set only by a future provider webhook.';
comment on column newsletter_subscribers.signup_route is
  'CRM-1: the on-site path/placement the capture form was submitted from. Not a URL with query string - a bare route or placement token.';
comment on column newsletter_subscribers.consent_version is
  'CRM-1: identifier of the consent copy shown at signup (lib/crm/subscribers.CONSENT_VERSION).';

-- The digest cron reads confirmed + not-unsubscribed; keep that index.
-- This one serves the operator summary (counts by status) and the
-- new-model sends.
create index if not exists newsletter_status
  on newsletter_subscribers (status);

create index if not exists newsletter_signups_recent
  on newsletter_subscribers (created_at desc);
