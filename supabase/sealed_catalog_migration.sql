-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- The full sealed-product catalogue from PokemonPriceTracker (PPT),
-- synced into our own DB by /api/sync-sealed-catalog (daily cron). This
-- is the BROWSING layer's source of sealed-product existence + reference
-- pricing - it lets /sets/<slug> and /sealed-deals show every booster
-- box / ETB / bundle / blister / tin for a set whether or not it
-- currently has an active eBay deal.
--
-- Exact sealed twin of `card_catalog`. REFERENCE data, kept clearly
-- separate from our own scanned deal data:
--   * sealed_deals      - eBay listings we found (source of truth for deals)
--   * sealed_watchlist   - the ~48 hand-picked products we re-scan on eBay
--   * sealed_catalog     - PPT reference: every sealed product + its price
-- `source` + the `market_price` column name (not total_price / discount_pct)
-- mark every row here as PPT-derived reference pricing, never a deal.
--
-- PPT's terms permit caching their API responses in our own systems and
-- serving them to our end users on the Business plan; they prohibit
-- re-exposing the data as a feed / API / bulk dataset. Same clause that
-- covers `card_catalog` - it is about PPT API responses generally and
-- does not distinguish singles from sealed. Images are TCGplayer-CDN
-- product photos (tcgplayer-cdn.tcgplayer.com/product/*), the exact host
-- + path already used for card thumbnails. Internal + rendered per page,
-- never exported. See IMPLEMENTATION_STATUS.md.
--
-- Non-destructive: one new table + indexes.

create table if not exists sealed_catalog (
  tcgplayer_id text        primary key,          -- PPT/TCGplayer stable product id
  name         text        not null,             -- e.g. "Evolving Skies Booster Box"
  "set"        text        not null,             -- e.g. "SWSH07: Evolving Skies" (PPT setName)
  set_id       text,                             -- PPT numeric setId (tcgPlayerNumericId)
  product_type text,                             -- derived: 'Booster Box' | 'Elite Trainer Box' | 'Booster Bundle' | 'Blister' | 'Tin' | 'Booster Pack' | 'Collection Box' | 'Build & Battle' | 'Case' | 'Hanger Box' | 'Other'
  language     text        not null default 'english',
  market_price numeric,                          -- PPT unopenedPrice - REFERENCE price, not a deal
  image_url    text,                             -- TCGplayer CDN product photo (200px)
  source       text        not null default 'pokemonpricetracker',
  synced_at    timestamptz not null default now()
);

-- The /sets/<slug> section join: every sealed product of one set.
create index if not exists sealed_catalog_set_idx
  on sealed_catalog ("set", language);

-- The standalone hub's product-type filter.
create index if not exists sealed_catalog_type_idx
  on sealed_catalog (product_type, language);

-- Public reference data (no user rows) - the site's anon client must be
-- able to read it, same as `card_catalog` / `deals` / `sealed_deals`.
-- Without this the pages silently render an empty section.
alter table sealed_catalog disable row level security;
grant select on sealed_catalog to anon, authenticated;
