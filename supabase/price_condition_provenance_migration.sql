-- PRICE-CONDITION PROVENANCE (2026-09-11). Run in the Supabase dashboard:
-- SQL Editor > New query > paste > Run. Non-destructive: four nullable
-- columns, no data rewritten, no index changed, no function changed.
--
-- WHY. The site's raw market reference is not always a Near Mint price.
-- For a printing whose Unlimited variant PokemonPriceTracker prices only
-- in a played condition, pickMarketPrice() (lib/pokemonPriceTracker.js)
-- takes that variant's first entry - so Magneton 009/102 "Base Set
-- (Shadowless)" (tcgplayer 107003) carries the LIGHTLY PLAYED Unlimited
-- Holofoil figure ($73.99) as its reference, and until this fix every
-- consumer (card summary, worth answer, price_history) labelled it Near
-- Mint. The figure was right; the label was not. The code now carries the
-- reference's real condition / printing end to end and these columns let
-- the stored copies carry it too. Every writer is best-effort: it retries
-- WITHOUT these columns when they are missing, so nothing depends on this
-- migration having run - only the labels on catalogue-fallback pages and
-- the history provenance stay "unknown" until it has.

-- card_catalog: the condition / printing market_price is really for.
--   market_condition  'Near Mint' | 'Lightly Played' | 'Moderately Played'
--                     | 'Heavily Played' | 'Damaged' | NULL (provider does
--                     not state it - an unattributed headline figure)
--   market_printing   the PPT printing / variant name the figure belongs
--                     to (e.g. 'Unlimited Holofoil'), or NULL
alter table card_catalog
  add column if not exists market_condition text,
  add column if not exists market_printing  text;

comment on column card_catalog.market_condition is
  'Condition tier market_price is actually for (PPT provenance). NULL = provider does not state it. Never assume Near Mint.';
comment on column card_catalog.market_printing is
  'PPT printing/variant name market_price belongs to (e.g. Unlimited Holofoil). NULL = unknown.';

-- price_history: the observed reference''s real condition / printing.
--
-- NOTE ON `condition`. The existing `condition` column is the SERIES KEY
-- (default 'Near Mint'): it is part of price_history_daily_uniq, it is
-- what card_reference_lastmod() filters on (ph.condition = 'Near Mint'),
-- what the card-page chart reads, and what the ppt_backfill prefix was
-- imported under. Re-keying rows by their real condition would split a
-- card's series and freeze its sitemap lastmod, so the key is left alone
-- and the truth is recorded alongside it:
--   reference_condition  the condition the stored price is really for
--                        (same values as card_catalog.market_condition)
--   reference_printing   the printing it belongs to
-- Rows written before this migration have reference_condition NULL,
-- which means "not recorded" - NOT "Near Mint". See the data-correction
-- note at the end before relabelling anything.
alter table price_history
  add column if not exists reference_condition text,
  add column if not exists reference_printing  text;

comment on column price_history.condition is
  'Series key (legacy name). The observed reference''s real condition is reference_condition; NULL there = not recorded, not Near Mint.';
comment on column price_history.reference_condition is
  'Condition tier `price` is actually for (PPT provenance). NULL = not recorded (pre-2026-09 rows) or provider does not state it.';
comment on column price_history.reference_printing is
  'PPT printing/variant name `price` belongs to. NULL = unknown.';

-- ---------------------------------------------------------------------
-- DATA CORRECTION - NOT PART OF THIS MIGRATION. Do not run blindly.
--
-- Historical 'catalog' rows were stamped condition='Near Mint' whatever
-- the reference's real condition was. Relabelling needs evidence per
-- card: the provider's current per-condition entries prove the figure's
-- condition only when (a) the card's reference today is a non-Near-Mint
-- tier AND (b) the historical price equals that same tier's figure AND
-- (c) the provider has no Near Mint entry for the canonical printing at
-- all (so the number could not have been Near Mint on those days either).
-- After this migration + one catalogue sync, the candidate set is:
--
--   select ph.tcgplayer_id, cc.market_condition, count(*) as rows,
--          min(ph.observed_on), max(ph.observed_on)
--     from price_history ph
--     join card_catalog cc on cc.tcgplayer_id = ph.tcgplayer_id
--    where ph.source = 'catalog'
--      and ph.reference_condition is null
--      and cc.market_condition is not null
--      and cc.market_condition <> 'Near Mint'
--      and ph.price = cc.market_price
--    group by 1, 2;
--
-- Confirmed case (evidence gathered 2026-09-11 from the live PPT record:
-- no Near Mint entry exists for either printing; the only Unlimited
-- Holofoil entry is Lightly Played $73.99; all 13 catalog rows are 73.99):
--
--   update price_history
--      set reference_condition = 'Lightly Played',
--          reference_printing  = 'Unlimited Holofoil'
--    where tcgplayer_id = '107003' and source = 'catalog'
--      and price = 73.99 and reference_condition is null;
--
-- The series key (`condition`) is deliberately NOT changed by that
-- statement.
