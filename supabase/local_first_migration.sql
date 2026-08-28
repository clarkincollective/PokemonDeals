-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Country sections now filter by deliveryCountry (cards a buyer in that
-- country can get) instead of itemLocationCountry (cards physically
-- there), so the small markets (AU/CA/DE) aren't nearly empty. To keep
-- honouring the "no shipping wait" preference, each deal now records
-- where the item actually is, and the site sorts genuinely-local
-- listings first within a country section.
--
--   item_location_country - ISO-2 code from eBay (nullable; older rows
--                           and the rare listing with no location = null)
--   is_local              - item_location_country == the section's country
--
-- Non-destructive: two nullable/defaulted columns per table + one index.

alter table deals add column if not exists item_location_country text;
alter table deals add column if not exists is_local boolean not null default false;

alter table sealed_deals add column if not exists item_location_country text;
alter table sealed_deals add column if not exists is_local boolean not null default false;

-- Every existing active row was found under the old itemLocationCountry
-- filter, so it IS physically in its marketplace's country - backfill
-- both columns from that fact. New rows get the real values from eBay.
update deals
  set item_location_country = replace(marketplace, 'EBAY_', ''),
      is_local = true
  where is_active = true and item_location_country is null;

update sealed_deals
  set item_location_country = replace(marketplace, 'EBAY_', ''),
      is_local = true
  where is_active = true and item_location_country is null;

create index if not exists deals_marketplace_local_idx
  on deals (marketplace, is_local)
  where is_active;
