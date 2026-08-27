// Deliberately dependency-free (no Supabase client, no next/cache) - this
// needs to be safely importable from client components too. DealCard is
// bundled into app/search/SearchClient.js ("use client"), so anything it
// imports gets pulled into the client bundle; lib/deals.js pulls in
// next/cache (unstable_cache), which is server-only and breaks the
// client build if DealCard imports slugify logic from there instead of
// here.
export function slugifySet(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
