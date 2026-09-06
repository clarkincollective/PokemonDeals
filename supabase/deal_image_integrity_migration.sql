-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
--
-- P0 DEAL IMAGE INTEGRITY - card-back-only / unusable primary seller photo.
--
-- A deal's `image_url` is whatever eBay returns as the listing's primary
-- photo. Some sellers upload ONLY the card BACK; it loads fine, so the
-- deal hero showed a back with no card face (deal 32672). These columns
-- let an OUT-OF-BAND worker (app/api/screen-deal-images) record, per deal:
--
--   image_urls        - every seller photo eBay returned (primary first),
--                       captured at scan time so the worker can prefer an
--                       alternate seller FRONT over the catalogue art.
--   image_verdict     - SELLER_FRONT | SELLER_OTHER | CARD_BACK |
--                       CANONICAL_FALLBACK | NO_TRUSTED_IMAGE  (lib/listingImage)
--   display_image_url - the selected alternate seller photo, when the
--                       primary was a back but another seller photo is a
--                       usable face. NULL means "use the row's own
--                       image_url, or the canonical fallback per the
--                       verdict".
--   image_checked_at  - last time the worker classified this row's images.
--
-- Best-effort, like the visual-authenticity columns: every read/write is
-- guarded, and the render path degrades to the plain seller `image_url`
-- when these are absent. Non-destructive. RLS already on `deals`.

alter table deals
  add column if not exists image_urls        text[],
  add column if not exists image_verdict     text,
  add column if not exists display_image_url text,
  add column if not exists image_checked_at  timestamptz;

-- The worker's queue: unscreened rows first (nulls first), then oldest
-- re-check.
create index if not exists deals_image_checked_at
  on deals (image_checked_at nulls first);
