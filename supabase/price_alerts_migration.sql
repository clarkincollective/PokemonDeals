-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Phase E - email price-drop alerts.
--
-- A visitor on a card hub can ask to be emailed when that card next has
-- a listing at or below a target price (or, with no target, any new
-- below-market listing). Double opt-in: a row is created unconfirmed
-- with a token, and only starts matching once the confirmation link is
-- clicked.
--
-- The feature stays dormant until RESEND_API_KEY is set in the
-- environment (lib/email.js no-ops without it, /api/alerts returns
-- "disabled", and the form renders a "coming soon" state), so no email
-- is ever collected that can't be confirmed.
--
-- Non-destructive: one new table + policies. No existing data touched.

create table if not exists price_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  card_slug text not null,
  card_name text not null,
  target_price numeric,                -- null = "any new below-market listing"
  token text not null unique,          -- confirm / unsubscribe token
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_notified_at timestamptz,
  last_notified_deal_id bigint         -- so we don't re-send for the same listing
);

create index if not exists price_alerts_active
  on price_alerts (card_slug)
  where confirmed;

create index if not exists price_alerts_email on price_alerts (lower(email));

alter table price_alerts enable row level security;

-- No anon access at all - every read and write goes through the API
-- routes using the service-role key. (RLS on with no policy = deny all
-- for anon, which is what we want.)
