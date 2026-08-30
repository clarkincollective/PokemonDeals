-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- External-discovery ingestion (app/api/ingest-feed): lets a deal exist for
-- a card that isn't on the `watchlist`, by referencing `card_catalog`
-- instead. Non-destructive - nullable column relax + new columns + two
-- BEFORE triggers + a one-off backfill. Safe to run more than once.
--
-- Deploy order doesn't matter: lib/deals.js prefers the new flat card_*
-- columns and falls back to the watchlist embed if this hasn't run yet
-- (same defensive pattern as the currency migration's SELECT_LEGACY).

-- 1. A deal no longer has to belong to a watchlist row.
alter table deals alter column watchlist_id drop not null;

-- 2. The card a catalogue-matched (non-watched) listing is for. card_catalog's
--    primary key is the tcgplayer id (text).
alter table deals add column if not exists card_catalog_id text
  references card_catalog (tcgplayer_id) on delete set null;

-- 3. Which discovery pipeline found this listing. Distinct from `source`
--    (the listing's origin marketplace family, always 'ebay'):
--      'scan'          - our own eBay Browse API scans (refresh-deals)
--      'external'       - the external discovery feed (ingest-feed)
--      'scan+external'  - both pipelines have seen this listing
alter table deals add column if not exists discovery_source text not null default 'scan';

-- 4. Every deal must identify a card one way or the other.
alter table deals drop constraint if exists deals_has_card_ref;
alter table deals add constraint deals_has_card_ref
  check (watchlist_id is not null or card_catalog_id is not null);

-- 5. Resolved card identity, filled by trigger from whichever ref is set, so
--    the deal read paths filter/dedup on real columns instead of each doing
--    a two-way LEFT JOIN + coalesce across watchlist and card_catalog.
alter table deals add column if not exists card_name text;
alter table deals add column if not exists card_set text;
alter table deals add column if not exists card_language text;
alter table deals add column if not exists card_tcgplayer_id text;

create or replace function deals_resolve_card() returns trigger as $$
begin
  -- Watched card: its clean catalogue name/set/id win.
  if new.watchlist_id is not null then
    select w.name, w."set", w.language, w.justtcg_tcgplayer_id
      into new.card_name, new.card_set, new.card_language, new.card_tcgplayer_id
      from watchlist w where w.id = new.watchlist_id;
  end if;
  -- Catalogue match fills anything the watchlist row didn't (or everything,
  -- when there's no watchlist row).
  if new.card_catalog_id is not null
     and (new.card_name is null or new.card_tcgplayer_id is null) then
    select coalesce(new.card_name, c.name),
           coalesce(new.card_set, c."set"),
           coalesce(new.card_language, c.language),
           coalesce(new.card_tcgplayer_id, c.tcgplayer_id)
      into new.card_name, new.card_set, new.card_language, new.card_tcgplayer_id
      from card_catalog c where c.tcgplayer_id = new.card_catalog_id;
  end if;
  if new.card_language is null then new.card_language := 'english'; end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_resolve_card_trg on deals;
create trigger deals_resolve_card_trg
  before insert or update on deals
  for each row execute function deals_resolve_card();

-- 6. Merge discovery_source rather than letting the last writer clobber it.
--    The scanner never sends the column (so its upserts leave it alone); the
--    feed always sends 'external'. First feed sighting of a scanned listing
--    therefore flips 'scan' -> 'scan+external', and vice versa.
create or replace function deals_merge_discovery_source() returns trigger as $$
begin
  if tg_op = 'UPDATE'
     and old.discovery_source is not null
     and new.discovery_source is not null
     and old.discovery_source <> new.discovery_source then
    new.discovery_source := 'scan+external';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_merge_discovery_source_trg on deals;
create trigger deals_merge_discovery_source_trg
  before update on deals
  for each row execute function deals_merge_discovery_source();

-- 7. Backfill existing rows (all are scanner/watchlist deals).
update deals d set
  card_name = w.name,
  card_set = w."set",
  card_language = w.language,
  card_tcgplayer_id = w.justtcg_tcgplayer_id
from watchlist w
where d.watchlist_id = w.id and d.card_name is null;

-- 8. Indexes for the new read + lifecycle patterns.
create index if not exists deals_card_language_active_idx on deals (card_language, is_active);
create index if not exists deals_card_tcgplayer_idx      on deals (card_tcgplayer_id);
create index if not exists deals_card_set_idx            on deals (card_set);
create index if not exists deals_discovery_source_idx    on deals (discovery_source) where discovery_source <> 'scan';
create index if not exists deals_feed_lifecycle_idx      on deals (discovery_source, is_active, last_seen_at);

-- RLS: `deals` already has "Public read active"; the new columns inherit it.
-- No policy change needed.
