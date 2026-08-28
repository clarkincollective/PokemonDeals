import { indexXml, SITEMAP_CACHE_CONTROL } from "@/lib/sitemap";

// Sitemap index - lists the per-type child sitemaps at
// /sitemaps/<segment>.xml. robots.txt points crawlers here.
export const revalidate = 3600;

export function GET() {
  return new Response(indexXml(), {
    headers: {
      "content-type": "application/xml",
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}
