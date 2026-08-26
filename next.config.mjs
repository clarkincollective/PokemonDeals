/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // eBay listing photos (used on deal cards).
      { protocol: "https", hostname: "i.ebayimg.com" },
      // PokemonPriceTracker/TCGPlayer catalog images (used on the search page).
      { protocol: "https", hostname: "tcgplayer-cdn.tcgplayer.com" },
    ],
  },
};

export default nextConfig;
