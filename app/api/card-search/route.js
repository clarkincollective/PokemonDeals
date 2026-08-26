import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES } from "@/lib/ebay";
import { searchCards, getRawPrice, getRawPriceHistory } from "@/lib/pokemonPriceTracker";

// Public, read-only, on-demand - not on the cron schedule, so no
// CRON_SECRET check. Deals come straight from our own database (never a
// fresh live eBay search per query); only the catalog browse and
// pricing/history touch PokemonPriceTracker, which has a large daily
// credit allowance.
export const dynamic = "force-dynamic";

const CATALOG_PAGE_SIZE = 20;

export async function GET(request) {
  const url = new URL(request.url);
  const tcgplayerId = url.searchParams.get("tcgplayerId");

  if (tcgplayerId) return cardDetail(url, tcgplayerId);
  return cardSearch(url);
}

// Deals we've already found matching this query - shown first, ahead of
// the catalog browse below, since "did we already find something" is
// what a visitor searching a name actually wants to know first.
async function findExistingDeals(db, q) {
  const { data: matchingRows } = await db.from("watchlist").select("id").ilike("name", `%${q}%`).limit(500);
  if (!matchingRows || matchingRows.length === 0) return [];

  const { data } = await db
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set)")
    .in(
      "watchlist_id",
      matchingRows.map((r) => r.id)
    )
    .eq("is_active", true)
    .order("discount_pct", { ascending: false })
    .limit(60);
  return data ?? [];
}

// For one page of catalog results, finds which (if any) already have an
// active deal, so the catalog list can show a "Buy It Now"/"Bid Now"
// link inline without a click-through. Keyed by tcgPlayerId (string).
async function findDealsForCatalogPage(db, tcgPlayerIds) {
  const dealByTcgId = new Map();
  if (tcgPlayerIds.length === 0) return dealByTcgId;

  const { data: watchlistRows } = await db
    .from("watchlist")
    .select("id, justtcg_tcgplayer_id")
    .in("justtcg_tcgplayer_id", tcgPlayerIds);
  if (!watchlistRows || watchlistRows.length === 0) return dealByTcgId;

  const tcgIdByWatchlistId = new Map(watchlistRows.map((r) => [r.id, r.justtcg_tcgplayer_id]));
  const { data: dealRows } = await db
    .from("deals")
    .select("id, watchlist_id, total_price, discount_pct, listing_type, affiliate_url")
    .in(
      "watchlist_id",
      watchlistRows.map((r) => r.id)
    )
    .eq("is_active", true)
    .order("discount_pct", { ascending: false });

  // Sorted best-discount-first, so the first deal seen per card is its best.
  for (const deal of dealRows ?? []) {
    const tcgId = tcgIdByWatchlistId.get(deal.watchlist_id);
    if (tcgId && !dealByTcgId.has(tcgId)) dealByTcgId.set(tcgId, deal);
  }
  return dealByTcgId;
}

// Step 1: "pikachu" -> deals we've already found, plus a paginated browse
// of the whole matching catalog (not just a fixed top 20 - offset lets a
// visitor page through everything).
async function cardSearch(url) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ error: "Search query too short" }, { status: 400 });

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const offset = (page - 1) * CATALOG_PAGE_SIZE;

  const db = supabaseAdmin();

  try {
    const [deals, catalogPage] = await Promise.all([
      findExistingDeals(db, q),
      searchCards(q, { limit: CATALOG_PAGE_SIZE, offset }),
    ]);

    const tcgPlayerIds = catalogPage.results.map((c) => String(c.tcgPlayerId)).filter(Boolean);
    const dealByTcgId = await findDealsForCatalogPage(db, tcgPlayerIds);

    return Response.json({
      deals,
      catalog: {
        page,
        pageSize: CATALOG_PAGE_SIZE,
        total: catalogPage.total,
        hasMore: catalogPage.hasMore,
        results: catalogPage.results.map((c) => {
          const deal = dealByTcgId.get(String(c.tcgPlayerId));
          return {
            tcgplayerId: c.tcgPlayerId,
            name: c.name,
            set: c.setName,
            rarity: c.rarity ?? null,
            imageUrl: c.imageCdnUrl200 ?? c.imageUrl ?? null,
            marketPrice: c.prices?.market ?? null,
            deal: deal
              ? {
                  id: deal.id,
                  totalPrice: deal.total_price,
                  discountPct: deal.discount_pct,
                  listingType: deal.listing_type,
                  affiliateUrl: deal.affiliate_url,
                }
              : null,
          };
        }),
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Step 2: instant pricing + sales history for the specific print (any
// card PokemonPriceTracker knows about), plus every deal WE'VE already
// found for it - not just whatever happens to be on the homepage's
// top-24 view - filterable by country, condition, price target.
async function cardDetail(url, tcgplayerId) {
  const condition = url.searchParams.get("condition") || "Near Mint";
  const country = url.searchParams.get("country");
  const graded = url.searchParams.get("graded"); // "true" | "false" | absent (either)
  const listingType = url.searchParams.get("listingType"); // "FIXED_PRICE" | "AUCTION" | absent (either)
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
      .select("*, watchlist:watchlist_id (name, set)")
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
    deals = data ?? [];
  }

  return Response.json({
    marketPrice,
    history,
    tracked: (watchlistRows?.length ?? 0) > 0,
    deals,
  });
}
