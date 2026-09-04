import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES } from "@/lib/ebay";
import { getRawPrice, getRawPriceHistory } from "@/lib/pokemonPriceTracker";
import { isDisplayableDeal } from "@/lib/dealQuality";
import { readSearchFilters } from "@/lib/searchFacets";
import { runCardSearch } from "@/lib/searchEngine";

// Public, read-only, on-demand - not on the cron schedule, so no
// CRON_SECRET check. Deals come straight from our own database (never a
// fresh live eBay search per query); catalogue identity is resolved
// LOCALLY against card_catalog first (Phase 13B.2), and only queries that
// can't be resolved locally fall through to PokemonPriceTracker.
//
// 13B.6.2 - the search itself is `runCardSearch` in lib/searchEngine.js;
// this route and app/search/page.js (the initial deep-link render) call
// the SAME function. This route serves client-side searches after
// hydration (typing, facet / sort / country changes, Back/Forward).
export const dynamic = "force-dynamic";

const IS_DEV = process.env.NODE_ENV !== "production";

export async function GET(request) {
  const url = new URL(request.url);
  const tcgplayerId = url.searchParams.get("tcgplayerId");

  if (tcgplayerId) return cardDetail(url, tcgplayerId);

  const q = (url.searchParams.get("q") ?? "").trim();
  const result = await runCardSearch({
    q,
    page: Number(url.searchParams.get("page")) || 1,
    country: url.searchParams.get("country"),
    sort: url.searchParams.get("sort"),
    filters: readSearchFilters(url.searchParams),
    debug: IS_DEV,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.body);
}

// ------------------------------------------------------- card detail (unchanged)

async function cardDetail(url, tcgplayerId) {
  const condition = url.searchParams.get("condition") || "Near Mint";
  const country = url.searchParams.get("country");
  const graded = url.searchParams.get("graded");
  const listingType = url.searchParams.get("listingType");
  const minDiscount = url.searchParams.get("minDiscount");
  const maxPrice = url.searchParams.get("maxPrice");

  let marketPrice = null;
  let history = [];
  try {
    const [raw, hist] = await Promise.all([
      getRawPrice(tcgplayerId, condition),
      getRawPriceHistory(tcgplayerId, condition),
    ]);
    marketPrice = raw?.price ?? null;
    history = hist;
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  const db = supabaseAdmin();
  const { data: watchlistRows } = await db
    .from("watchlist")
    .select("id, name, set")
    .eq("justtcg_tcgplayer_id", String(tcgplayerId));

  let deals = [];
  if (watchlistRows && watchlistRows.length > 0) {
    let dealsQuery = db
      .from("deals")
      .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
      .in(
        "watchlist_id",
        watchlistRows.map((r) => r.id)
      )
      .eq("is_active", true);

    if (country && MARKETPLACES[country]) dealsQuery = dealsQuery.eq("marketplace", country);
    if (graded === "true") dealsQuery = dealsQuery.eq("is_graded", true);
    if (graded === "false") dealsQuery = dealsQuery.eq("is_graded", false);
    if (listingType === "FIXED_PRICE" || listingType === "AUCTION")
      dealsQuery = dealsQuery.eq("listing_type", listingType);
    if (minDiscount) dealsQuery = dealsQuery.gte("discount_pct", Number(minDiscount));
    if (maxPrice) dealsQuery = dealsQuery.lte("total_price", Number(maxPrice));

    const { data } = await dealsQuery.order("discount_pct", { ascending: false });
    deals = (data ?? []).filter(isDisplayableDeal);
  }

  return Response.json({
    marketPrice,
    history,
    tracked: (watchlistRows?.length ?? 0) > 0,
    deals,
  });
}
