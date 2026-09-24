import { NextResponse } from "next/server";

// Next 16.3.3 can duplicate Location when an ISR render first redirects.
// Canonicalise species case before rendering, preserving the normal page's
// ISR and data caches. This boundary performs no provider/database work.
// finding 4 (audit 2026-09-23): the sealed catalogue's filter state lives
// in the query string, so /sealed-deals?product=... is one page in many
// states rather than many pages. The unfiltered page keeps its existing
// indexing policy; a FILTERED state is marked noindex, follow here.
//
// Doing it as a response header rather than a metadata tag is deliberate:
// reading searchParams inside the page would opt the whole route out of
// static rendering, and /sealed-deals is ~780 KB of server-rendered HTML
// that is currently served from the CDN. X-Robots-Tag is equivalent to the
// meta tag, supports `follow`, and costs nothing at render time. The page's
// canonical already points at the unfiltered /sealed-deals, so the two
// signals agree.
const SEALED_FILTER_PARAMS = ["product", "set", "type", "q", "deals"];

export function proxy(request) {
  if (request.nextUrl.pathname === "/sealed-deals") {
    const filtered = SEALED_FILTER_PARAMS.some((p) => {
      const v = request.nextUrl.searchParams.get(p);
      return v != null && v !== "";
    });
    if (!filtered) return NextResponse.next();
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, follow");
    return res;
  }
  const match = /^\/pokemon\/([^/]+)\/?$/.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();
  let slug;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return NextResponse.next();
  }
  const canonical = slug.toLowerCase();
  if (slug === canonical) return NextResponse.next();
  // Match the existing page redirect: one lowercase path, without query
  // parameters. Unknown species still reach the normal lowercase 404.
  return NextResponse.redirect(new URL(`/pokemon/${encodeURIComponent(canonical)}`, request.url), 308);
}

export const config = { matcher: ["/pokemon/:slug", "/sealed-deals"] };
