-- Bounded visual counterfeit screening (out-of-band). Run in the Supabase
-- SQL editor.
--
-- A cron worker (/api/screen-visual-authenticity) compares the eBay
-- listing photo of each HIGH-RISK deal against the canonical TCGplayer
-- image for its exact matched printing and writes one verdict here. The
-- display gate (lib/dealQuality) reads it:
--
--   MISMATCH -> disqualified_reason 'authenticity:proxy_or_counterfeit'
--   UNKNOWN + high-value + extreme-discount -> 'authenticity:visual_unverified'
--   MATCH / UNKNOWN(ordinary) / NULL(unscreened) -> no effect
--
-- Nothing on the ingestion path writes these columns, and the display
-- gate treats an absent column as "unscreened", so ingestion is safe
-- before this migration runs (as with the earlier trust-signal columns).

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS visual_authenticity_status     text,        -- MATCH | MISMATCH | UNKNOWN
  ADD COLUMN IF NOT EXISTS visual_authenticity_reason     text,
  ADD COLUMN IF NOT EXISTS visual_authenticity_checked_at timestamptz;

-- Worker picks unscreened / stale rows fast.
CREATE INDEX IF NOT EXISTS deals_visual_checked_at_idx
  ON deals (visual_authenticity_checked_at NULLS FIRST)
  WHERE is_active = true;
