// P0 DEAL IMAGE INTEGRITY - the shared, DETERMINISTIC deal-image
// selection contract. PURE + dependency-light (no sharp, no fetch): this
// is imported by client components (DealCard) and server pages alike.
//
// The out-of-band worker (app/api/screen-deal-images, via
// lib/listingImageClassify) records a per-deal `image_verdict`; this
// module turns that verdict + the row's fields into the single image a
// surface should render, or the OG / JSON-LD identity image.
//
// THE BUG this closes: a deal's `image_url` is whatever eBay returns as
// the listing's primary photo. Some sellers upload ONLY the card BACK
// (blue swirl / Poke Ball / "Pokemon" wordmark); it loads fine, so the
// deal hero showed a back with no card face (deal 32672). NEVER a
// fabricated or AI-generated image - the fallback is the trusted
// exact-printing catalogue art, then a neutral no-image state.

const { catalogImageUrl } = require("./cardImage");

// The conceptual image states (brief section 11).
const IMAGE_VERDICT = {
  SELLER_FRONT: "SELLER_FRONT", // the seller's own primary photo is a usable card face
  SELLER_OTHER: "SELLER_OTHER", // primary was unusable; another seller photo is a usable face
  CARD_BACK: "CARD_BACK", // the only usable seller photo is a card back
  CANONICAL_FALLBACK: "CANONICAL_FALLBACK", // showing the trusted exact-printing catalogue art
  NO_TRUSTED_IMAGE: "NO_TRUSTED_IMAGE", // nothing trustworthy -> neutral no-image
};

// Card-back structural-feature thresholds. Kept here (not in the sharp
// module) so a pure unit test can lock the gate. See
// lib/listingImageClassify for how the features are measured, and the
// calibration note there.
const CARD_BACK_BALL_RED = 20;
const CARD_BACK_BALL_BRI = 20;
const CARD_BACK_BORDER_BLUE = 8;
const CARD_BACK_WM_MIRROR = -25;

// PURE: given the four measured features, is this a Pokemon card back?
// ALL four must hold - four independent structural confirmations keeps
// false positives near zero (0/250 real fronts in calibration).
function isCardBackFeatures(f) {
  if (!f) return false;
  return (
    Number(f.ballRed) > CARD_BACK_BALL_RED &&
    Number(f.ballBri) > CARD_BACK_BALL_BRI &&
    Number(f.borderBlue) > CARD_BACK_BORDER_BLUE &&
    Number(f.wmMirror) > CARD_BACK_WM_MIRROR
  );
}

const isHttp = (u) => typeof u === "string" && /^https?:\/\//.test(u);

// PURE, DETERMINISTIC selection contract. Inputs are what the worker
// recorded plus the row's own fields:
//
//   1. a positively-usable seller face       -> that photo
//   2. primary is a back, alternate face set -> that alternate (SELLER_OTHER)
//   3. primary is a back, no alternate       -> canonical exact-printing art
//   4. no exact canonical                    -> null (neutral no-image)
//
// An UNSCREENED row (imageVerdict null) keeps its seller primary - a
// seller photo is never hidden before it's positively classified a back.
function selectDealImageUrl({ imageVerdict, imageUrl, displayImageUrl, cardTcgplayerId } = {}) {
  const canonical = cardTcgplayerId != null ? catalogImageUrl(cardTcgplayerId) : null;

  if (imageVerdict === IMAGE_VERDICT.SELLER_OTHER && isHttp(displayImageUrl)) {
    return { url: displayImageUrl, verdict: IMAGE_VERDICT.SELLER_OTHER, provenance: "seller_alternate" };
  }
  if (
    imageVerdict === IMAGE_VERDICT.CARD_BACK ||
    imageVerdict === IMAGE_VERDICT.CANONICAL_FALLBACK ||
    imageVerdict === IMAGE_VERDICT.NO_TRUSTED_IMAGE
  ) {
    if (canonical) return { url: canonical, verdict: IMAGE_VERDICT.CANONICAL_FALLBACK, provenance: "canonical" };
    return { url: null, verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, provenance: "none" };
  }
  // SELLER_FRONT, or unscreened.
  if (isHttp(imageUrl)) return { url: imageUrl, verdict: IMAGE_VERDICT.SELLER_FRONT, provenance: "seller_primary" };
  if (canonical) return { url: canonical, verdict: IMAGE_VERDICT.CANONICAL_FALLBACK, provenance: "canonical" };
  return { url: null, verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, provenance: "none" };
}

const tcgIdOf = (deal) =>
  deal?.card_tcgplayer_id ?? deal?.watchlist?.justtcg_tcgplayer_id ?? deal?.justtcg_tcgplayer_id ?? null;

function selectionFor(deal) {
  return selectDealImageUrl({
    imageVerdict: deal?.image_verdict ?? null,
    imageUrl: deal?.image_url ?? null,
    displayImageUrl: deal?.display_image_url ?? null,
    cardTcgplayerId: tcgIdOf(deal),
  });
}

// Props for <DealImage>. A CARD_BACK / fallback row is handed to
// DealImage with src=null so ITS OWN canonical -> placeholder chain (and
// the "Reference image" badge) does the rest - one code path for "seller
// photo unusable", whether detected here or a dead URL in the browser.
function dealImageProps(deal) {
  if (!deal) return { src: null, cardTcgplayerId: null };
  const sel = selectionFor(deal);
  if (sel.provenance === "seller_primary" || sel.provenance === "seller_alternate") {
    return { src: sel.url, cardTcgplayerId: tcgIdOf(deal) };
  }
  if (sel.provenance === "canonical") return { src: null, cardTcgplayerId: tcgIdOf(deal) };
  return { src: null, cardTcgplayerId: null }; // NO_TRUSTED_IMAGE -> placeholder
}

// The URL to expose as the deal's identity image in OG / Twitter /
// Product JSON-LD. Never a card back: yields the canonical exact-printing
// art for a CARD_BACK / fallback row, or null (omit the image) when there
// is no trusted image.
function trustedDealImageUrl(deal) {
  if (!deal) return null;
  return selectionFor(deal).url;
}

module.exports = {
  IMAGE_VERDICT,
  CARD_BACK_BALL_RED,
  CARD_BACK_BALL_BRI,
  CARD_BACK_BORDER_BLUE,
  CARD_BACK_WM_MIRROR,
  isCardBackFeatures,
  selectDealImageUrl,
  dealImageProps,
  trustedDealImageUrl,
};
