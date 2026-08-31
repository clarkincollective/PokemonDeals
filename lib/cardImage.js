// Catalogue card images come from TCGplayer's product CDN. The sync
// pipeline historically stored the `_in_200x200` derivative, which is a
// ~144x200 thumbnail - fine for the old dense grid, blurry in the current
// larger premium card layout (a 144px source stretched to 300-500 CSS px,
// 2x again on retina).
//
// The SAME product image is available at larger derivatives from the same
// URL - just a different size token. `_in_1000x1000` returns the biggest
// master the CDN has for that exact product id: ~325x450 for old vintage
// scans, up to ~1000px for modern cards. It is ALWAYS the same printing /
// identity - never a different card, language, or variant - so upgrading
// the size token can't introduce a wrong-image bug. Next/Image then
// downsizes per device from that better source.
//
// CJS + dependency-free: imported by ESM routes/components AND the CJS
// sync/backfill scripts.

const CATALOG_CDN_HOST = "tcgplayer-cdn.tcgplayer.com";

// The size token to store / request. `_in_1000x1000` = "fit inside a
// 1000x1000 box, keep aspect" -> the CDN returns the largest real
// derivative it has, capped at that box. No 404s (verified across vintage
// / modern / promo / WCD product ids).
const CATALOG_IMAGE_TOKEN = "_in_1000x1000.jpg";

// Build the catalogue image URL for a TCGplayer product id.
function catalogImageUrl(tcgplayerId) {
  if (tcgplayerId == null) return null;
  return `https://${CATALOG_CDN_HOST}/product/${String(tcgplayerId)}${CATALOG_IMAGE_TOKEN}`;
}

// Render-time safety net: upgrade a stored TCGplayer product URL that
// still points at a small derivative (`_in_200x200.jpg`, `_200w.jpg`,
// `_in_400x400.jpg`, or a bare `<id>.jpg`) to the large one, so a row that
// hasn't been re-synced/backfilled yet still renders sharp. Any non-
// TCGplayer URL (eBay listing photos, set logos, ...) is returned
// unchanged - this must never touch those. Idempotent on an already-large
// URL.
const SMALL_TCG_DERIVATIVE =
  /^(https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+)(?:_in_\d+x\d+|_\d+w)?\.(?:jpg|jpeg|png|webp)(\?.*)?$/i;

function upgradeCatalogImage(url) {
  if (typeof url !== "string" || !url.includes(CATALOG_CDN_HOST)) return url;
  const m = url.match(SMALL_TCG_DERIVATIVE);
  if (!m) return url;
  return `${m[1]}${CATALOG_IMAGE_TOKEN}${m[2] ?? ""}`;
}

module.exports = { CATALOG_IMAGE_TOKEN, catalogImageUrl, upgradeCatalogImage };
