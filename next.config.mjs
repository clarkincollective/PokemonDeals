/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // eBay listing photos (used on deal cards) are served from this domain.
    remotePatterns: [{ protocol: "https", hostname: "i.ebayimg.com" }],
  },
};

export default nextConfig;
