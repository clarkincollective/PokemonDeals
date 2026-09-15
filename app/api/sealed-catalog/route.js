import { fetchSealedCatalog, slimSealedProduct } from "@/lib/deals";

// audit-r1 (page-weight) - the sealed catalogue's products, one set or a
// filtered slice at a time, for components/SealedProductBrowser. Until
// 15 Sep 2026 /sealed-deals shipped every product (2,344, 1.8 MB of client
// payload) to the browser as props so the client could filter; now the
// page carries only the first six open sets and the browser asks here for
// the rest. Read-only, DB-backed via the same 15-minute cache the page
// uses; no provider call.
//   ?set=<slug>                       one set's products
//   ?q=<text>&type=<type>&deals=1     products matching the filters, grouped by set
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600", "X-Robots-Tag": "noindex" };

export function filterSealedGroups(groups, { q = "", type = "all", dealsOnly = false } = {}) {
  const needle = String(q ?? "").trim().toLowerCase();
  return groups
    .map((g) => ({
      set: g.set,
      slug: g.slug,
      dealCount: g.dealCount,
      products: g.products.filter((p) => {
        if (dealsOnly && !p.deal) return false;
        if (type && type !== "all" && p.productType !== type) return false;
        if (needle && !p.name.toLowerCase().includes(needle) && !g.set.toLowerCase().includes(needle)) return false;
        return true;
      }),
    }))
    .filter((g) => g.products.length > 0);
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const catalog = await fetchSealedCatalog({ language: "english" });
  if (catalog.error) return Response.json({ ok: false, reason: "catalogue_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const setSlug = (sp.get("set") ?? "").trim();
  if (setSlug) {
    const g = catalog.groups.find((x) => x.slug === setSlug);
    if (!g) return Response.json({ ok: false, reason: "unknown_set" }, { status: 404, headers: HEADERS });
    return Response.json({ ok: true, set: g.set, slug: g.slug, products: g.products.map(slimSealedProduct) }, { headers: HEADERS });
  }
  const q = (sp.get("q") ?? "").slice(0, 80);
  const type = (sp.get("type") ?? "all").slice(0, 40);
  const dealsOnly = sp.get("deals") === "1";
  const groups = filterSealedGroups(catalog.groups, { q, type, dealsOnly }).map((g) => ({ ...g, products: g.products.map(slimSealedProduct) }));
  return Response.json({ ok: true, groups }, { headers: HEADERS });
}
