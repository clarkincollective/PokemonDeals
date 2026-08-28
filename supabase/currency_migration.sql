-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Currency correctness for non-US listings.
--
-- eBay returns each marketplace's prices in that marketplace's currency
-- (a UK listing is priced in GBP, an AU listing in AUD, ...). Until now
-- `total_price` was stored raw with no currency, and `discount_pct` was
-- computed against a USD market price - so for ~57% of active listings
-- the discount compared e.g. £2,950 against $4,147 as if equal.
--
-- New columns:
--   currency          - the listing's own currency (USD/GBP/EUR/AUD/CAD)
--   total_price_usd    - total_price converted to USD via ECB FX rates,
--                        which is what discount_pct is now computed from
--
-- Non-destructive: adds two nullable columns. No existing data changed
-- here - run scripts/fixCurrencyPricing.js afterwards to backfill and
-- re-price the existing rows.

alter table deals add column if not exists currency text;
alter table deals add column if not exists total_price_usd numeric;

alter table sealed_deals add column if not exists currency text;
alter table sealed_deals add column if not exists total_price_usd numeric;
