/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // AVIF first (~20-30% smaller than WebP) so the larger source images
    // (see lib/cardImage - catalogue art is now the ~1000px TCGplayer
    // derivative, not the old 144x200 thumbnail) don't inflate transfer.
    formats: ["image/avif", "image/webp"],
    // Next 16 rejects any `quality` prop not listed here (default is [75]).
    // Card art uses 85 in grids, 90 on detail heroes.
    qualities: [75, 85, 90],
    // A TCGplayer product image is immutable for a given id - cache the
    // optimized derivatives for a month instead of re-optimizing every 4h.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      // eBay listing photos (used on deal cards).
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
