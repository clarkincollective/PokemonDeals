-- PLAIN LISTINGS - an honest representation for "no supported comparison"
-- (2026-09-26). NOT APPLIED YET. Apply in the Supabase SQL editor.
--
-- deals.market_price and deals.discount_pct were created NOT NULL
-- (supabase/deals_schema.sql:39-40). A listing that clears every identity,
-- availability and trust gate but has no supported market reference
-- therefore cannot be stored without inventing a market price or a zero
-- discount - and lib/dealQuality already treats a null market_price /
-- discount_pct as a plain listing (hasPositiveComparison, savingsReason
-- "no_reference"), so NULL is the representation the display layer
-- expects. This migration makes it storable.
--
-- Nothing else changes. No existing row is touched, no default is added,
-- and the scanner writes NULLs only for a listing it deliberately publishes
-- WITHOUT a comparison (route flag PLAIN_LISTINGS_ENABLED, off by default
-- until this has run). Every discount-ordered read already sorts NULLS
-- LAST (lib/deals.js, 2026-09-26), so a plain listing never leads a
-- discount ranking.
--
-- sealed_deals is left as it is: the sealed lane keeps a stored reference
-- for 99.7% of products and has no plain-listing path.

alter table deals alter column market_price drop not null;
alter table deals alter column discount_pct drop not null;

comment on column deals.market_price is
  'USD market reference this listing was compared against. NULL = published without a supported comparison (plain listing); never a fabricated figure. See lib/dealQuality.hasPositiveComparison.';
comment on column deals.discount_pct is
  'Fraction below market_price on the delivered USD total. NULL = no supported comparison (plain listing). Discount-ordered reads sort NULLS LAST.';
