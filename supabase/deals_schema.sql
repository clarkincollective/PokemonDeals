-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- (Same workflow as supabase/schema.sql - this adds two new tables alongside
-- the existing "cards" table, which is untouched.)

-- The curated list of cards the scheduled job actively watches.
create table if not exists watchlist (
  id bigint generated always as identity primary key,
  name text not null,
  "set" text,
  -- Resolved once when the card is added (via a GET /cards?q= search) so
  -- every scheduled scan afterwards can use JustTCG's cheap batch-by-id
  -- endpoint instead of re-searching by name each time.
  justtcg_tcgplayer_id text not null,
  justtcg_condition text not null default 'Near Mint',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists watchlist_unique_card
  on watchlist (name, "set");

-- One row per live underpriced eBay listing found for a watched card.
create table if not exists deals (
  id bigint generated always as identity primary key,
  watchlist_id bigint not null references watchlist (id) on delete cascade,
  source text not null default 'ebay',
  marketplace text not null default 'EBAY_US',
  listing_id text not null,
  title text not null,
  image_url text,
  listing_url text not null,
  affiliate_url text not null,
  listing_type text not null default 'FIXED_PRICE', -- FIXED_PRICE | AUCTION
  bid_count integer,
  auction_end_at timestamptz,
  price numeric not null,
  shipping numeric not null default 0,
  total_price numeric not null,
  market_price numeric not null,
  discount_pct numeric not null,
  -- How much the market price itself moved in the last 24h. Shown as
  -- supporting evidence that the market price is live/real, since eBay's
  -- own sold-comps API (Marketplace Insights) is currently closed to new
  -- developers and can't be used directly for a "recent sales" comparison.
  price_change_24hr numeric,
  condition text,
  -- Graded-card fields (via PokemonPriceTracker's sold-comp data - JustTCG
  -- only covers raw card conditions, not grader-specific pricing).
  is_graded boolean not null default false,
  grader text, -- PSA | CGC | BGS | SGC | TAG | ACE
  grade text,  -- e.g. '10', '9.5'
  seller_username text,
  seller_feedback_pct numeric,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Lets the refresh job upsert (update if the same listing shows up again,
-- insert if it's new) instead of creating duplicate rows every scan. A
-- listing_id can repeat across different countries' eBay sites, so
-- marketplace is part of the uniqueness check too.
create unique index if not exists deals_unique_listing
  on deals (source, marketplace, listing_id);

create index if not exists deals_active_discount
  on deals (is_active, discount_pct desc);

alter table watchlist enable row level security;
alter table deals enable row level security;

-- Only active deals are publicly readable; the watchlist itself is
-- an internal detail, not shown to visitors, so no public read policy
-- is added for it. Writes to both tables only happen via the
-- service_role key (the scheduled refresh job), which bypasses RLS.
create policy "Public read access to active deals"
  on deals for select
  using (is_active = true);
