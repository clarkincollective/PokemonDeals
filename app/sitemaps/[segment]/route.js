import { segmentEntries, urlsetXml, SITEMAP_SEGMENTS, SITEMAP_CACHE_CONTROL } from "@/lib/sitemap";

// One child sitemap per page type. Request path is /sitemaps/<segment>.xml
// (the ".xml" is stripped); an unknown segment 404s rather than serving an
// empty urlset.
export const revalidate = 900;

export function generateStaticParams() {
  return SITEMAP_SEGMENTS.map((segment) => ({ segment: `${segment}.xml` }));
}

export async function GET(_request, { params }) {
  const { segment } = await params;
  const key = String(segment).replace(/\.xml$/, "");

  if (!SITEMAP_SEGMENTS.includes(key)) {
    return new Response("Not found", { status: 404 });
  }

  const entries = await segmentEntries(key);
  return new Response(urlsetXml(entries ?? []), {
    headers: {
      "content-type": "application/xml",
      "cache-control": SITEMAP_CACHE_CONTROL,
    },
  });
}
