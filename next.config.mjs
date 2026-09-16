// "All deals" (/deals) is one static page: every browse, filter, search
// and pagination variant is served the clean page's HTML (canonical
// /deals) and filtered in the browser. A rendered variant still differs
// from the clean page, so - like /search?q= and homepage ?page=N - it is
// kept out of the index at the server, not only by nofollow links:
// X-Robots-Tag noindex,follow whenever one of these params is present.
// Header rules keep the page static (no per-request render, no proxy).
const ALL_DEALS_VARIANT_PARAMS = ["country", "type", "grader", "grade", "listing", "minPrice", "maxPrice", "q", "sort", "page"];

// Homepage-caching r1: "/" follows the same static-page-plus-client-filter
// shape as /deals now (components/HomeFeed.js + /api/deals-page?kind=home)
// instead of reading searchParams itself - RegionRedirect's client-side geo
// default was writing ?country= into the URL for almost every real visitor
// right after hydration, which previously forced the WHOLE homepage to
// render dynamically on every one of those requests, not just once per
// country. No grader/grade/q - the homepage feed never took those.
const HOME_VARIANT_PARAMS = ["country", "type", "listing", "minPrice", "maxPrice", "sort", "page"];

// SEO-1.1 P2: the same rule for everything UNDER /deals.
//
// The rule above uses source "/deals", which path-matches that exact path
// and nothing else - so /deals?page=2 was served X-Robots-Tag noindex while
// /deals/under-50?page=2 was not, even though the category pages render the
// same DealGrid with the same 28 filter/sort/page variant links. The audit
// confirmed the gap on /deals/graded?page=2 and ?sort=discount.
//
// The variants were never an open crawl trap - every one of those links is
// rel="nofollow" and every variant already self-canonicalises to the bare
// category URL - so this is the third layer of the same defence, applied
// consistently rather than only to one of the two shapes.
//
// `:slug` also covers /deals/[id] detail pages, which take a `from=`
// attribution parameter on internal links. Those links are likewise
// nofollowed and the bare URL is canonical, so the same header belongs on
// them for the same reason; `from` is in the list below for that case.
//
// The bare category page is untouched: `has` fires only when one of these
// query keys is actually present, so /deals/under-50 stays indexable.
const DEALS_SUBPATH_VARIANT_PARAMS = [...ALL_DEALS_VARIANT_PARAMS, "from"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      ...ALL_DEALS_VARIANT_PARAMS.map((key) => ({
        source: "/deals",
        has: [{ type: "query", key }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      })),
      ...DEALS_SUBPATH_VARIANT_PARAMS.map((key) => ({
        source: "/deals/:slug",
        has: [{ type: "query", key }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      })),
      ...HOME_VARIANT_PARAMS.map((key) => ({
        source: "/",
        has: [{ type: "query", key }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      })),
    ];
  },
  images: {
    // VERCEL-COST-1: WebP only. AVIF is ~20% smaller than WebP but each
    // AVIF encode is a separate billed Image-Optimization transformation
    // AND cache write, and AVIF encoding is 2-3x more CPU per transform.
    // Serving one format roughly halves transformations + cache writes for
    // any image hit by both an AVIF- and a WebP-capable browser over its
    // lifetime. WebP is universally supported by every current browser.
    formats: ["image/webp"],
    // VERCEL-COST-1: two qualities, not three. 85 and 90 are visually
    // indistinguishable on a 128-256 CSS-px card image; every extra
    // quality is a full variant multiplier. Card detail heroes now use 85.
    qualities: [75, 85],
    // VERCEL-COST-1: cap the width matrix. The Next defaults are 8
    // deviceSizes up to 3840px + 8 imageSizes; NOTHING on this site
    // renders an image wider than ~half the viewport (the widest is the
    // homepage deal grid at 50vw mobile / the card detail hero at 256 CSS
    // px). A `vw`-based `sizes` on the old matrix could pull a 1920/2048
    // variant per source image. 4 device widths + 2 image widths cover
    // every real slot at 1x and 2x and collapse the variant count.
    deviceSizes: [384, 640, 828, 1080],
    imageSizes: [128, 256],
    // A TCGplayer product image is immutable for a given id - cache the
    // optimized derivatives for a month instead of re-optimizing every 4h.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      // eBay listing photos (used on deal cards). NOTE (VERCEL-COST-1):
      // components/DealImage.js serves these `unoptimized` - they are
      // unique per ephemeral listing, already web-optimized JPEGs on
      // eBay's own CDN, and had near-zero Vercel-cache reuse. This pattern
      // stays only so a stored eBay URL still passes next/image's
      // allowlist when rendered unoptimized.
      { protocol: "https", hostname: "i.ebayimg.com" },
      // PokemonPriceTracker/TCGPlayer catalog images (used on the search page).
      { protocol: "https", hostname: "tcgplayer-cdn.tcgplayer.com" },
      // pokemontcg.io set logos/symbols (used on /sets). Both hosts appear
      // in their API's `images` field depending on set age.
      { protocol: "https", hostname: "images.pokemontcg.io" },
      { protocol: "https", hostname: "images.scrydex.com" },
    ],
  },
};

export default nextConfig;
