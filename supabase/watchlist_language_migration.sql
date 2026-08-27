-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- PokemonPriceTracker's /cards endpoint (search, price lookup, sold comps -
-- everything) takes a required `language` parameter and covers exactly two
-- catalogs: "english" (the default, what the whole site has used so far)
-- and "japanese" (442 sets, ~26,000 cards, its own real market prices and
-- TCGPlayer product ids, verified live against our API key). This column
-- records which catalog a watchlist row belongs to, so scanning/pricing
-- code knows which one to query.

alter table watchlist
  add column if not exists language text not null default 'english';

-- The (name, "set") unique index assumed one global catalog. English and
-- Japanese are independent catalogs with their own naming, and a handful
-- of Japanese sets use English-style names (e.g. promo sets) - without
-- language in the key, an auto-synced Japanese card could silently upsert
-- over an unrelated English row (or vice versa) if their name+set text
-- ever happened to match.
drop index if exists watchlist_unique_card;
create unique index if not exists watchlist_unique_card
  on watchlist (name, "set", language);

create index if not exists watchlist_active_language on watchlist (active, language);
