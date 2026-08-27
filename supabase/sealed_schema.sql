-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Sealed product (booster boxes, elite trainer boxes, bundles, etc.)
-- tracked separately from single cards - PokemonPriceTracker's
-- /sealed-products endpoint has a completely different shape (no
-- condition/grading, one real "unopenedPrice" field) and its own market
-- data, verified live against our API key. Two tables mirroring
-- watchlist/deals, not reusing them - the field shapes don't match
-- (no condition, no grading, no per-condition pricing).

create table if not exists sealed_watchlist (
  id bigint generated always as identity primary key,
  name text not null,
  "set" text,
  tcgplayer_id text not null,
  active boolean not null default true,
  source text not null default 'manual', -- 'manual' (hand-picked) | 'auto' (future catalog sync)
  created_at timestamptz not null default now()
);

create unique index if not exists sealed_watchlist_unique_product
  on sealed_watchlist (name, "set");

-- One row per live underpriced eBay listing found for a watched sealed
-- product.
create table if not exists sealed_deals (
  id bigint generated always as identity primary key,
  sealed_watchlist_id bigint not null references sealed_watchlist (id) on delete cascade,
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
  seller_username text,
  seller_feedback_pct numeric,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists sealed_deals_unique_listing
  on sealed_deals (source, marketplace, listing_id);

create index if not exists sealed_deals_active_watchlist
  on sealed_deals (is_active, sealed_watchlist_id);

-- RLS + a real public-read policy from day one - the original watchlist
-- table shipped with RLS enabled and no read policy, which silently
-- nulled out every public join for months until caught (see
-- watchlist_public_read_migration.sql). Not repeating that here.
alter table sealed_watchlist enable row level security;
alter table sealed_deals enable row level security;

create policy "Public read access to sealed_watchlist"
  on sealed_watchlist for select
  using (true);

create policy "Public read access to sealed_deals"
  on sealed_deals for select
  using (true);
