-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- Price-drop lane (audit-r1 follow-up). The site only ever kept a
-- listing's CURRENT price: every discovery sighting and every verifier
-- refresh overwrites deals.price in place (lib/listingAvailability.js
-- updateGuarded), so "this listing got cheaper" was not knowable. Two
-- columns and one BEFORE UPDATE trigger record it at the moment the
-- overwrite happens, in the row itself, with no change to any writer.
--
-- A drop is MATERIAL only: the new item price is at least 2% and at least
-- 0.50 (in the listing's own currency) under the previous stored price,
-- and both the old and new rows are active (a retired row's stored price
-- is stale evidence, not a live drop). A later rise clears the pair, so
-- previous_price never advertises a price the seller has since undone.
-- Shipping is excluded on purpose (price, not total_price): a courier
-- change is not a seller price cut.
--
-- Non-destructive: two nullable columns, one function, one trigger, one
-- partial index. Nothing existing is touched or rewritten.

alter table deals
  add column if not exists previous_price   numeric,
  add column if not exists price_dropped_at timestamptz;

comment on column deals.previous_price   is 'Item price (listing currency) before the most recent material drop; null once the price rises again';
comment on column deals.price_dropped_at is 'When deals.price was last overwritten with a materially lower value while the listing was active';

create or replace function deals_track_price_drop()
returns trigger
language plpgsql
as $$
begin
  if new.price is null or old.price is null then
    return new;
  end if;
  if new.price < old.price then
    if old.is_active and new.is_active
       and old.price - new.price >= 0.5
       and new.price <= old.price * 0.98 then
      new.previous_price := old.price;
      new.price_dropped_at := now();
    end if;
  elsif new.price > old.price then
    new.previous_price := null;
    new.price_dropped_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_track_price_drop on deals;
create trigger deals_track_price_drop
  before update of price on deals
  for each row
  execute function deals_track_price_drop();

-- The lane reads "active rows with a recent drop, newest drop first".
create index if not exists deals_price_dropped_at_idx
  on deals (price_dropped_at desc)
  where price_dropped_at is not null and is_active;
