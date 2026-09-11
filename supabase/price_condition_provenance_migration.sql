-- PRICE-CONDITION PROVENANCE (2026-09-11). Run in the Supabase dashboard:
-- SQL Editor > New query > paste > Run.
--
-- ADDITIVE ONLY: four nullable columns + column comments. No row is
-- inserted, updated or deleted; no index, constraint, policy or function
-- is changed. Safe to re-run (IF NOT EXISTS). Historical data corrections
-- are deliberately NOT part of this file - see
-- supabase/data_corrections/ (each one is a separate, evidence-backed,
-- individually approved statement).
--
-- WHY. The site's raw market reference is not always a Near Mint price.
-- For a printing whose Unlimited variant PokemonPriceTracker prices only
-- in a played condition, pickMarketPrice() (lib/pokemonPriceTracker.js)
-- takes that variant's first entry - so Magneton 009/102 "Base Set
-- (Shadowless)" (tcgplayer 107003) carries the LIGHTLY PLAYED Unlimited
-- Holofoil figure ($73.99) as its reference, and until this fix every
-- consumer (card summary, worth answer, price_history) labelled it Near
-- Mint. The figure was right; the label was not. The code now carries the
-- reference's real condition / printing end to end, and these columns let
-- the stored copies carry it too. Every writer is best-effort: it retries
-- WITHOUT these columns when (and only when) the specific missing-column
-- schema error names one of them, so nothing depends on this migration
-- having run - only the labels on catalogue-fallback pages and the
-- history provenance stay "unknown" until it has.
--
-- PROVENANCE VALUES are DIRECT only: the condition named by the provider
-- entry the figure was selected from, or an explicit Near Mint entry.
-- A headline / aggregate figure has no documented condition semantics and
-- is stored as NULL. NULL is never read as Near Mint anywhere.

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
  'Condition tier market_price is actually for (direct PPT provenance). NULL = provider does not state it. Never assume Near Mint.';
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
-- FOR COMPATIBILITY and the truth is recorded alongside it:
--   reference_condition  the condition the stored price is really for
--                        (same values as card_catalog.market_condition)
--   reference_printing   the printing it belongs to
-- Rows written before this migration have reference_condition NULL,
-- which means "not recorded" - NOT "Near Mint". Consumers that compare
-- two observations (trend windows) withhold a window whose two points
-- carry different recorded conditions / printings, so a change of
-- reference is never shown as a price movement.
alter table price_history
  add column if not exists reference_condition text,
  add column if not exists reference_printing  text;

comment on column price_history.condition is
  'Series key (legacy name, kept for compatibility). The observed reference''s real condition is reference_condition - NULL there = not recorded, not Near Mint.';
comment on column price_history.reference_condition is
  'Condition tier `price` is actually for (direct PPT provenance). NULL = not recorded (pre-2026-09 rows) or provider does not state it.';
comment on column price_history.reference_printing is
  'PPT printing/variant name `price` belongs to. NULL = unknown.';
