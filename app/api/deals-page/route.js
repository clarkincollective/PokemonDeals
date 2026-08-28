import {
  fetchDealsPage,
  fetchSpeciesDealsPage,
  resolveSetSlug,
  resolveSpeciesSlug,
} from "@/lib/deals";

export const dynamic = "force-dynamic";

// Powers client-side pagination + filtering on /sets/[slug] and
// /pokemon/[slug] so those pages can stay statically cacheable (their
// server render reads no searchParams). Page 1 with no filters is
// rendered server-side; anything else comes from here.
//   /api/deals-page?kind=set&slug=base-set&page=2&country=EBAY_GB&sort=price_asc
export async function GET(request) {
  const u = new URL(request.url);
  const kind = u.searchParams.get("kind");
  const slug = u.searchParams.get("slug");
  const num = (k) => {
    const n = Number(u.searchParams.get(k));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const filters = {
    country: u.searchParams.get("country") || null,
    cardType: u.searchParams.get("type") || null,
    listingType: u.searchParams.get("listing") || null,
    maxPrice: num("maxPrice"),
    minPrice: num("minPrice"),
    sort: u.searchParams.get("sort") || "newest",
    page: Math.max(1, Number(u.searchParams.get("page")) || 1),
    pageSize: 20,
  };

  try {
    if (kind === "set") {
      const resolved = await resolveSetSlug(slug);
      if (!resolved) return Response.json({ deals: [], totalPages: 1, error: "not found" }, { status: 404 });
      const r = await fetchDealsPage({ table: "deals", language: "english", set: resolved.set, ...filters });
      return Response.json(r);
    }
    if (kind === "species") {
      const resolved = await resolveSpeciesSlug(slug);
      if (!resolved) return Response.json({ deals: [], totalPages: 1, error: "not found" }, { status: 404 });
      const r = await fetchSpeciesDealsPage({ speciesName: resolved.name, language: "english", ...filters });
      return Response.json(r);
    }
    return Response.json({ deals: [], totalPages: 1, error: "bad kind" }, { status: 400 });
  } catch (err) {
    return Response.json({ deals: [], totalPages: 1, error: err.message }, { status: 500 });
  }
}
