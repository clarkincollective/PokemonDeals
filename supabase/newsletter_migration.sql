-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Separate marketing/newsletter consent, kept distinct from the
-- transactional price alerts. A row is created unconfirmed when someone
-- ticks "also send me the weekly deals digest"; it's confirmed by the
-- same double-opt-in click that confirms their price alert (or by a
-- standalone confirmation email). unsubscribed_at set = never email.
--
-- Non-destructive: one new table + a read-block RLS (all access via the
-- API routes with the service-role key).

create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  token text not null unique,
  confirmed boolean not null default false,
  source text,                       -- e.g. 'price_alert_form'
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);

create index if not exists newsletter_sendable
  on newsletter_subscribers (confirmed)
  where confirmed and unsubscribed_at is null;

alter table newsletter_subscribers enable row level security;
