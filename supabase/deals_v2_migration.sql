-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Adds columns to the existing "deals" table for multi-country scanning,
-- auctions, and graded-card support. Safe to run even if some of this
-- already exists (every statement is "if not exists").

alter table deals
  add column if not exists marketplace text not null default 'EBAY_US',
  add column if not exists listing_type text not null default 'FIXED_PRICE',
  add column if not exists bid_count integer,
  add column if not exists auction_end_at timestamptz,
  add column if not exists is_graded boolean not null default false,
  add column if not exists grader text,
  add column if not exists grade text;

-- A listing_id can repeat across different countries' eBay sites, so the
-- "already seen this listing" check needs to include marketplace too.
drop index if exists deals_unique_listing;
create unique index if not exists deals_unique_listing
  on deals (source, marketplace, listing_id);
