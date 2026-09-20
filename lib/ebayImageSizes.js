// Responsive sizing for eBay listing photos (2026-09-21).
//
// THE PROBLEM this closes. `lib/ebayLinks.js` stores every listing photo
// at eBay's largest CDN size (`s-l1600`) on purpose: the stored URL is the
// counterfeit-screening worker's evidence, and a screening decision should
// be made on the biggest photo the seller uploaded. That storage choice is
// correct and is NOT changed here.
//
// What was wrong was rendering it. Deal cards display the photo at 116 CSS
// px on a phone and 192 px on the deal page, and eBay photos bypass Vercel
// Image Optimization (VERCEL-COST-1), so the browser was downloading the
// full 1600 px original - measured at 852 KB for a single thumbnail, and
// about 6 MB across one homepage. Lighthouse 2026-09-21 put the homepage
// at performance 69 with that as the dominant diagnostic.
//
// THE FIX is free: eBay's CDN serves the same already-uploaded photo at
// several fixed widths from the identical URL, differing only in the size
// suffix. Verified by measurement on 2026-09-21 against a real listing
// photo - every width below returned HTTP 200 with a genuinely different
// payload:
//
//   s-l225 26 KB · s-l300 43 KB · s-l400 71 KB · s-l500 108 KB
//   s-l640 167 KB · s-l800 247 KB · s-l960 347 KB · s-l1200 518 KB
//   s-l1600 853 KB
//
// So we hand the browser a srcset across those widths and let it pick
// against the `sizes` the layout already declares. A phone card goes from
// 853 KB to about 43 KB for the same visible result. No API call, no
// stored value changes, no new host.

// Six of the nine measured widths - enough granularity for 1x/2x/3x at
// every size we actually display (116 px cards, 192 px deal hero, larger
// hub art) without bloating the HTML with nine candidates per image.
export const EBAY_WIDTHS = Object.freeze([225, 300, 400, 640, 960, 1600]);

// The width used for `src` itself, for anything that ignores srcset.
// Deliberately mid-range: sharp on the largest surface we render, and a
// fraction of the original.
export const EBAY_FALLBACK_WIDTH = 640;

const SIZE_SUFFIX = /\/s-l\d+(\.[a-z]+)(?=$|[?#])/i;

export function isEbayImage(url) {
  return typeof url === "string" && /(^|\.)ebayimg\.com\//.test(url);
}

// Same photo, different CDN width. Returns the url unchanged when it is
// not an eBay URL or carries no size suffix, so this is always safe to
// apply - it never invents a URL shape the CDN has not been seen to serve.
export function ebayImageAt(url, width) {
  if (!isEbayImage(url) || !SIZE_SUFFIX.test(url)) return url ?? null;
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return url;
  return url.replace(SIZE_SUFFIX, (_m, ext) => `/s-l${Math.round(w)}${ext}`);
}

// `srcSet` across the measured widths, or null when this URL cannot be
// resized - in which case the caller renders a plain src and nothing is
// worse than before.
export function ebaySrcSet(url, widths = EBAY_WIDTHS) {
  if (!isEbayImage(url) || !SIZE_SUFFIX.test(url)) return null;
  const seen = new Set();
  const parts = [];
  for (const w of widths) {
    const at = ebayImageAt(url, w);
    if (!at || seen.has(at)) continue;
    seen.add(at);
    parts.push(`${at} ${w}w`);
  }
  return parts.length > 1 ? parts.join(", ") : null;
}
