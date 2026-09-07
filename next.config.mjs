/** @type {import('next').NextConfig} */
const nextConfig = {
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
