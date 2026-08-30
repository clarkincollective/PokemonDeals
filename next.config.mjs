/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
