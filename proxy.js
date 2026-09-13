import { NextResponse } from "next/server";

// Next 16.3.3 can duplicate Location when an ISR render first redirects.
// Canonicalise species case before rendering, preserving the normal page's
// ISR and data caches. This boundary performs no provider/database work.
export function proxy(request) {
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

export const config = { matcher: "/pokemon/:slug" };
