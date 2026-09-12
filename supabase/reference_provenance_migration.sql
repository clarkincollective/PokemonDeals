-- REFERENCE PROVENANCE FOR STORED COMPARISONS (Phase 17C.10).
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- ADDITIVE ONLY. Nullable columns and column comments. No row is inserted,
-- updated or deleted; no index, constraint, policy, trigger or function is
-- changed; nothing is renamed or retyped. Every statement is IF NOT EXISTS,
-- so re-running it is a no-op.
--
-- NO BACKFILL, BY DESIGN. Every existing row keeps NULL in every column
-- below. NULL means "not recorded" - it is never read as Near Mint, never
-- read as a match, and never upgraded by the clock, by a later sync, or by
-- today's catalogue. Existing comparisons are therefore NOT certified by
-- this migration: a tracked recent-release row without recorded evidence
-- stays a plain listing, which is the conservative outcome. Any historical
-- correction is a separate, individually approved, evidence-backed
-- statement under supabase/data_corrections/ (see the 2026-09-11 Magneton
-- file for the standard) - never part of this file.
--
-- SAFE IN EITHER ORDER with the code deploy. The writers send these
-- columns best-effort through lib/referenceProvenanceDb, which retries
-- without them ONLY on PGRST204 / 42703 that NAMES one of these columns;
-- every other failure stays visible. Until the migration runs, evidence is
-- simply absent and recent-release listings stay plain.
--
-- WHY. lib/dealQuality.storedReferenceEvidence already required the
-- provenance of the figure a discount was computed against, but no table
-- had anywhere to put it, so `savingsClaimTrusted` could never be
-- satisfied for a tracked release. These columns are that storage.
--
-- THE TWO TIMESTAMPS ARE NOT INTERCHANGEABLE:
--   reference_observed_at  the PROVIDER's own as-of for the figure
--                          (PokemonPriceTracker prices.lastUpdated /
--                          product.updatedAt). NULL = the provider did not
--                          state one. ONLY this column can evidence that a
--                          reference is post-release.
--   reference_synced_at    when WE copied the figure into our catalogue.
--                          Syncing a months-old figure after release day
--                          does not make it a post-release reference, so
--                          this is never read as evidence - it exists for
--                          debugging and audit only.

-- ---------------------------------------------------------------- cards
alter table deals
  add column if not exists reference_source       text,
  add column if not exists reference_product_id   text,
  add column if not exists reference_amount       numeric,
  add column if not exists reference_currency     text,
  add column if not exists reference_observed_at  timestamptz,
  add column if not exists reference_synced_at    timestamptz,
  add column if not exists reference_fx_rate      numeric,
  add column if not exists reference_fx_asof      timestamptz,
  add column if not exists reference_condition    text,
  add column if not exists reference_printing     text,
  add column if not exists reference_grader       text,
  add column if not exists reference_grade        text;

comment on column deals.reference_source is
  'Where the compared figure came from: card_catalog | ppt_live | feed. NULL = not recorded.';
comment on column deals.reference_product_id is
  'Catalogue product id (justtcg_tcgplayer_id) the figure is FOR. Must equal the row''s own card identity or the evidence is rejected.';
comment on column deals.reference_amount is
  'The figure as captured, in reference_currency. Must reproduce market_price (converted via reference_fx_rate when the currencies differ) or the evidence is rejected. Never inferred from an equal price.';
comment on column deals.reference_currency is
  'Currency reference_amount is denominated in. Currency equality alone does not validate a reference - the amounts must reconcile.';
comment on column deals.reference_observed_at is
  'PROVIDER''s own as-of for the figure. NULL = unknown and stays unknown. The only column that can evidence a post-release reference.';
comment on column deals.reference_synced_at is
  'When we copied the figure into our catalogue. NEVER evidence of when the price was true.';
comment on column deals.reference_fx_rate is
  'Explicit conversion evidence: multiplier applied to reference_amount to reach market_price. NULL when no conversion was needed.';
comment on column deals.reference_fx_asof is
  'As-of timestamp for reference_fx_rate. Required whenever reference_fx_rate is set.';
comment on column deals.reference_condition is
  'Condition tier the figure is actually for (raw cards). Must equal the row''s own stored condition tier or the evidence is rejected.';
comment on column deals.reference_printing is
  'Exact printing/variant the figure belongs to. Required for a raw-card claim.';
comment on column deals.reference_grader is
  'Grader the figure is for (graded cards). Must equal the row''s grader.';
comment on column deals.reference_grade is
  'Grade the figure is for (graded cards). Must equal the row''s grade.';

-- --------------------------------------------------------------- sealed
-- Sealed product has no condition, printing or grade, so those columns are
-- deliberately NOT added here - they would be permanently NULL and would
-- invite a false "unknown vs not-applicable" reading.
alter table sealed_deals
  add column if not exists reference_source       text,
  add column if not exists reference_product_id   text,
  add column if not exists reference_amount       numeric,
  add column if not exists reference_currency     text,
  add column if not exists reference_observed_at  timestamptz,
  add column if not exists reference_synced_at    timestamptz,
  add column if not exists reference_fx_rate      numeric,
  add column if not exists reference_fx_asof      timestamptz;

comment on column sealed_deals.reference_source is
  'Where the compared figure came from: sealed_catalog | ppt_live. NULL = not recorded.';
comment on column sealed_deals.reference_product_id is
  'sealed_watchlist product tcgplayer_id the figure is FOR. Must equal the product the row is priced against.';
comment on column sealed_deals.reference_amount is
  'The figure as captured, in reference_currency. Must reproduce market_price or the evidence is rejected.';
comment on column sealed_deals.reference_currency is
  'Currency reference_amount is denominated in.';
comment on column sealed_deals.reference_observed_at is
  'PROVIDER''s own as-of (PPT product.updatedAt). NULL = unknown. sealed_catalog does not carry one, so catalogue-sourced sealed references are unknown by construction and stay plain.';
comment on column sealed_deals.reference_synced_at is
  'When we copied the figure. NEVER evidence of when the price was true.';
comment on column sealed_deals.reference_fx_rate is
  'Explicit conversion evidence. NULL when no conversion was needed.';
comment on column sealed_deals.reference_fx_asof is
  'As-of timestamp for reference_fx_rate.';
