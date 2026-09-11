import { segmentXml, SITEMAP_SEGMENTS, cacheControlForSegment } from "@/lib/sitemap";

// One child sitemap per page type. Request path is /sitemaps/<segment>.xml
// (the ".xml" is stripped); an unknown segment 404s rather than serving an
// empty urlset.
//
// SEO-3.1: rendered per request from the shared data caches (lib/sitemap.js
// unstable_cache'd datasets - 6h for the catalogue/card snapshot, 300s
// for the ephemeral deal ids) instead of a per-child ISR copy. Every
// child is therefore serialised from the SAME current cached dataset
// generation at the moment it is requested: the four card shards can no
// longer diverge because one child's ISR copy aged independently of
// another's. Serialisation is milliseconds; the queries stay behind the
// data caches. The edge window is set per segment by
// cacheControlForSegment (stable segments 15m/24h SWR, card shards and
// ephemeral segments 5m/5m).
export const dynamic = "force-dynamic";
// Only the very first population of the 6h data caches after a deploy
// does real work (parallel catalogue pages + the lastmod RPC, a few
// seconds); everything after is served stale-while-revalidate from the
// data cache in milliseconds. This guards that one cold path.
export const maxDuration = 60;

export async function GET(_request, { params }) {
  const { segment } = await params;
  const key = String(segment).replace(/\.xml$/, "");

  if (!SITEMAP_SEGMENTS.includes(key)) {
    return new Response("Not found", { status: 404 });
  }

  const xml = await segmentXml(key);
  return new Response(xml ?? "", {
    headers: {
      "content-type": "application/xml",
      "cache-control": cacheControlForSegment(key),
    },
  });
}
