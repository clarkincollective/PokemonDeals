// Phase EBAY-14Q - shared, pure image-recovery decision logic.
//
// Two routes can end up asking eBay the same question about the same
// listing's image: app/api/verify-deals (which already has a live single-
// item snapshot in hand while checking price/status) and app/api/screen-
// deal-images (whose OWN job is exactly image recovery). Before this
// phase, verify-deals only used its live snapshot for this on AUCTION
// rows; a fixed-price (BIN) row with no image got NO benefit from
// verify-deals' call (it used getListingFreshness, which discards the
// image fields the identical get_item_by_legacy_id response already
// carries) - so screen-deal-images had to make its OWN separate eBay
// call, on its own next run, to ask the exact same endpoint the exact
// same question. This module gives BOTH routes ONE shared, pure decision
// so behaviour (and the screen-deal-images.NO_TRUSTED_IMAGE / 14-day
// re-screen convention) stays identical no matter which route made the
// live call.
//
// Pure. No I/O, no randomness.

const isHttpUrl = (u) => typeof u === "string" && /^https?:\/\//.test(u);

// A row already has a usable stored image reference (nothing to recover).
function hasStoredImage(row) {
  return isHttpUrl(row?.image_url) || (Array.isArray(row?.image_urls) && row.image_urls.some(isHttpUrl));
}

// Given a row and the image fields from a LIVE eBay single-item snapshot
// (getListingSnapshot's primaryImage/imageUrls - the SAME response shape
// both routes now read from), decide what to do. Never called unless the
// caller already made (or is about to make) the real eBay request - this
// function makes no network decision, only a data decision.
//
//   NOOP              - row already has an image; nothing to change
//   RECOVERED         - row had none, the snapshot has one - the caller
//                       should write it and null image_checked_at so the
//                       row is queued for classification ASAP (same
//                       convention verify-deals' auction branch already
//                       used before this phase)
//   CONFIRMED_NO_IMAGE - row had none, the snapshot ALSO has none - the
//                       caller should stamp image_checked_at=now (the
//                       SAME convention screen-deal-images' own
//                       NO_TRUSTED_IMAGE outcome already uses), which
//                       naturally keeps this row out of screen-deal-
//                       images' re-screen candidate pool for its normal
//                       14-day window - no SEPARATE suppression window,
//                       no new schema, no new TTL invented.
//   INCONCLUSIVE      - the snapshot's own status was not a real read
//                       (ended/unknown) - no write, unchanged retry-later
//                       behaviour.
function decideImageRecovery({ row, snapStatus, snapPrimaryImage, snapImageUrls } = {}) {
  if (hasStoredImage(row)) return { outcome: "NOOP" };
  if (snapStatus !== "ACTIVE" && snapStatus !== "SOLD") return { outcome: "INCONCLUSIVE" };
  const urls = (Array.isArray(snapImageUrls) ? snapImageUrls : []).filter(isHttpUrl);
  const primary = isHttpUrl(snapPrimaryImage) ? snapPrimaryImage : (urls[0] ?? null);
  if (!primary) return { outcome: "CONFIRMED_NO_IMAGE" };
  return { outcome: "RECOVERED", imageUrl: primary, imageUrls: urls.length ? urls : [primary] };
}

module.exports = { hasStoredImage, decideImageRecovery };
