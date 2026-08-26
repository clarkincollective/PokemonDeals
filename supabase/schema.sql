-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.

create table if not exists cards (
  id bigint generated always as identity primary key,
  name text not null,
  "set" text,
  condition text,
  market_price numeric,
  source text,
  updated_at timestamptz not null default now()
);

-- Prevents duplicate rows when the price-fetching script re-runs for the
-- same card, and lets that script "upsert" (update if exists, else insert).
create unique index if not exists cards_unique_card
  on cards (name, "set", condition, source);

-- Row Level Security: locks the table down by default, then we add back
-- only the access we want.
alter table cards enable row level security;

-- Allow anyone with the public "anon" key (i.e. your website's homepage)
-- to READ cards. Writing is intentionally not allowed here - only the
-- service_role key (used by our server-side script) can insert/update,
-- and that key bypasses RLS entirely.
create policy "Public read access"
  on cards for select
  using (true);
