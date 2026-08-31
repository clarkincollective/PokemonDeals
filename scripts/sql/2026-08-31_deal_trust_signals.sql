-- Phase 1 deal-trust / matching work. Run in the Supabase SQL editor.
--
-- Three listing-trust signals the ~141-listing Browse audit proved
-- materially useful for the "advertise this as a verified bargain?"
-- decision, persisted so future scans enforce the rule with no extra
-- Browse calls:
--
--   seller_feedback_score  - eBay seller's numeric feedback count. In
--                            every search result already; distinguishes a
--                            34-feedback flipper from an established shop.
--   image_count            - number of listing photos (1 primary + extras).
--                            getItem-only; a single stock photo on a $100+
--                            raw card is a dropship / proxy signal.
--   returns_accepted       - listing's returns policy. getItem-only.
--
-- image_count / returns_accepted are populated only when a scan already
-- spends its one getItem call on a listing (suspicious discount / high
-- value); an ordinary modest-discount row keeps them NULL and is judged
-- on the other signals. No other new columns - these are the only three
-- the derived rule (lib/dealMatching listingTrustRisk) actually reads.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS seller_feedback_score integer,
  ADD COLUMN IF NOT EXISTS image_count           smallint,
  ADD COLUMN IF NOT EXISTS returns_accepted       boolean;
