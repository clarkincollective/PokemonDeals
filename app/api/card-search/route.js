import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES } from "@/lib/ebay";
import { searchCards, getRawPrice, getRawPriceHistory } from "@/lib/pokemonPriceTracker";

// Public, read-only, on-demand - not on the cron schedule, so no
// CRON_SECRET check. Doesn't touch eBay's request budget at all: pricing
// and history come from PokemonPriceTracker (generous daily credits),
// and "deals" are whatever our own scheduled scans have already found in
// the database, not a fresh live eBay search.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const tcgplayerId = url.searchParams.get("tcgplayerId");

  if (tcgplayerId) return cardDetail(url, tcgplayerId);
  return cardSearch(url);
}

// Step 1: "charizard 151" -> a list of specific matching prints for the
// visitor to pick from (a name alone is almost always ambiguous across
// many different sets).
async function cardSearch(url) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ error: "Search query too short" }, { status: 400 });

  try {
    const results = await searchCards(q, { limit: 20 });
    return Response.json({
      results: results.map((c) => ({
        tcgplayerId: c.tcgPlayerId,
        name: c.name,
        set: c.setName,
        rarity: c.rarity ?? null,
        imageUrl: c.imageCdnUrl200 ?? c.imageUrl ?? null,
        marketPrice: c.prices?.market ?? null,
      })),
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
