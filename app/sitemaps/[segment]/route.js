import { segmentEntries, urlsetXml, SITEMAP_SEGMENTS, cacheControlForSegment } from "@/lib/sitemap";

// One child sitemap per page type. Request path is /sitemaps/<segment>.xml
// (the ".xml" is stripped); an unknown segment 404s rather than serving an
// empty urlset.
//
// 300s: the stable segments (pages/sets/pokemon/cards) are backed by
// their own longer-lived caches so this just re-serialises them; the
// value that matters is the deal / sealed segments, where a shorter
// window keeps a just-expired (now-noindex) listing from lingering in
// the sitemap. Served stale-while-revalidate, so no request ever waits.
// VERCEL-COST-1: 300 -> 900. The per-segment `cache-control`
// (cacheControlForSegment) already gives the ephemeral deal/sealed
// segments a 300s edge window, so a just-expired listing still clears in
// minutes; the route-level ISR data cache only needs to re-serialise the
// stable segments occasionally.
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
      // ephemeral segments (deals/sealed-deals) get a short edge cache so
      // a just-expired -> noindex listing clears in minutes, not ~48h.
      "cache-control": cacheControlForSegment(key),
    },
  });
}
