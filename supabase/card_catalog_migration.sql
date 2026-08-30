-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- The full Pokemon card catalogue from PokemonPriceTracker (PPT), synced
-- into our own DB by /api/sync-card-catalog (daily cron). This is the
-- BROWSING layer's source of card existence + reference pricing - it lets
-- /pokemon and /pokemon/<slug> show every card of a species whether or
-- not it currently has an active eBay deal.
--
-- This is REFERENCE data, kept clearly separate from our own scanned
-- deal data:
--   * deals            - eBay listings we found (our source of truth for deals)
--   * watchlist         - the value-filtered slice we actively re-scan on eBay
--   * card_catalog      - PPT reference: every card, its latest market price
-- `source` + the `market_price` column name (not total_price / discount_pct)
-- mark every row here as PPT-derived reference pricing, never a deal.
--
-- PPT's terms permit caching their data in our own systems and serving it
-- to our end users on the Business plan; they prohibit re-exposing it as
-- a feed / API / bulk dataset. This table is internal + rendered per page,
-- never exported. See IMPLEMENTATION_STATUS.md "Phase 1 licensing check".
--
-- Non-destructive: one new table + indexes.

create table if not exists card_catalog (
  tcgplayer_id text        primary key,          -- PPT/TCGplayer stable card id
  name         text        not null,             -- e.g. "Charizard - 4/102"
  "set"        text        not null,             -- e.g. "Base Set"
  set_id       text,                             -- PPT setId (for grouping / future joins)
  card_number  text,                             -- e.g. "4/102"
  rarity       text,                             -- e.g. "Holo Rare" (nullable - PPT doesn't always have it)
  card_type    text,                             -- "Pokémon" / "Trainer" / "Energy"
  species      text,                             -- extractSpecies(name); null for trainers/energy
  language     text        not null default 'english',
  market_price numeric,                          -- PPT prices.market - REFERENCE price, not a deal
  image_url    text,                             -- TCGplayer CDN thumbnail (200px)
  source       text        not null default 'pokemonpricetracker',
  synced_at    timestamptz not null default now()
);

-- The /pokemon/<slug> join: every card of one species, one language.
create index if not exists card_catalog_species_idx
  on card_catalog (species, language) where species is not null;

-- Set-scoped lookups + the sync job's per-set upsert.
create index if not exists card_catalog_set_idx
  on card_catalog (set_id, language);
