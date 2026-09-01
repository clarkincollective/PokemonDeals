import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES } from "@/lib/ebay";
import { searchCards, getRawPrice, getRawPriceHistory, pickMarketPrice } from "@/lib/pokemonPriceTracker";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { isDisplayableDeal } from "@/lib/dealQuality";
import { cardDisplayName } from "@/lib/cardName";
import { catalogCardSlug, catalogCardResolvable } from "@/lib/cardSlug";
import { rerankCatalogResults } from "@/lib/searchRanking";

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

// sort: "discount" (default, best deal first), "price_asc", "price_desc".
function sortDeals(query, sort) {
  if (sort === "price_asc") return query.order("total_price", { ascending: true });
  if (sort === "price_desc") return query.order("total_price", { ascending: false });
  return query.order("discount_pct", { ascending: false });
}

// Deals we've already found matching this query - shown first, ahead of
// the catalog browse below, since "did we already find something" is
// what a visitor searching a name actually wants to know first.
// country ("card location") and sort (price low/high or best discount)
// are visitor-controlled filters, not fixed defaults.
async function findExistingDeals(db, q, { country, sort }) {
  // English-only - this powers the general card search, which browses
  // PokemonPriceTracker's English catalog (searchCards below has no
  // language param), so a Japanese watchlist row sharing a name substring
  // (e.g. "Pikachu") should never surface here. Japanese cards get their
  // own dedicated /japanese-cards page instead.
  const { data: matchingRows } = await db
    .from("watchlist")
    .select("id")
    .eq("language", "english")
    .ilike("name", `%${q}%`)
    .limit(500);
  if (!matchingRows || matchingRows.length === 0) return [];

  let dealsQuery = db
    .from("deals")
    .select("*, watchlist:watchlist_id (name, set, justtcg_tcgplayer_id, language)")
    .in(
      "watchlist_id",
      matchingRows.map((r) => r.id)
    )
    .eq("is_active", true);
  if (country && MARKETPLACES[country]) dealsQuery = dealsQuery.eq("marketplace", country);

  // Over-fetch, then apply the SHARED display gate - "Deals found (N)" on
  // the search page must mean deals a visitor can actually act on, not
  // raw active rows (stale / ended / disqualified are dropped here).
  const { data } = await sortDeals(dealsQuery, sort).limit(120);
  return (data ?? []).filter(isDisplayableDeal).slice(0, 60);
}

// For one page of catalog results, finds which (if any) already have an
// active deal, so the catalog list can show a "Buy It Now"/"Bid Now"
// link inline without a click-through. Keyed by tcgPlayerId (string).
// Respects the same country filter as findExistingDeals, so "card
// location" narrows both sections consistently.
async function findDealsForCatalogPage(db, tcgPlayerIds, { country }) {
  const dealByTcgId = new Map();
  if (tcgPlayerIds.length === 0) return dealByTcgId;

  const { data: watchlistRows } = await db
    .from("watchlist")
    .select("id, justtcg_tcgplayer_id")
    .in("justtcg_tcgplayer_id", tcgPlayerIds);
  if (!watchlistRows || watchlistRows.length === 0) return dealByTcgId;

  const tcgIdByWatchlistId = new Map(watchlistRows.map((r) => [r.id, r.justtcg_tcgplayer_id]));
  let dealsQuery = db
    // full row so the shared display gate can run - the inline "deal
    // available" badge on a catalogue tile must only show for a deal a
    // visitor could actually open.
    .from("deals")
    .select("*")
    .in(
      "watchlist_id",
      watchlistRows.map((r) => r.id)
    )
    .eq("is_active", true);
  if (country && MARKETPLACES[country]) dealsQuery = dealsQuery.eq("marketplace", country);

  const { data: dealRows } = await dealsQuery.order("discount_pct", { ascending: false });

  // Sorted best-discount-first, so the first deal seen per card is its best.
  for (const deal of (dealRows ?? []).filter(isDisplayableDeal)) {
    const tcgId = tcgIdByWatchlistId.get(deal.watchlist_id);
    if (tcgId && !dealByTcgId.has(tcgId)) dealByTcgId.set(tcgId, deal);
  }
  return dealByTcgId;
}

// For a page of catalogue-search results, resolve each one to its
// PERMANENT /cards/[slug] page - the canonical exact-printing / value
// destination the price checker routes into (SEO Phase 3). We only own a
// page for cards in our own card_catalog, so a result PPT knows about
// but we don't sync just gets no card link (the UI falls back to a plain
// eBay search for it). Matched on the exact TCGplayer id, and the slug
// is built from OUR stored name/set so it always resolves. Also returns
// our canonical name/set/number/rarity so the preview tile is consistent
// with the card page it links to.
async function resolveCatalogHrefs(db, tcgPlayerIds) {
  const out = new Map();
  if (tcgPlayerIds.length === 0) return out;
  const { data } = await db
    .from("card_catalog")
    .select("tcgplayer_id, name, set, card_number, rarity, image_url")
    .eq("language", "english")
    .in("tcgplayer_id", tcgPlayerIds);
  for (const r of data ?? []) {
    if (!catalogCardResolvable(r)) continue;
    out.set(String(r.tcgplayer_id), {
      href: `/cards/${catalogCardSlug(r.name, r.set)}`,
      name: r.name,
      set: r.set,
      cardNumber: r.card_number ?? null,
      rarity: r.rarity ?? null,
    });
  }
  return out;
}

// Step 1: "pikachu" -> deals we've already found, plus a paginated browse
// of the whole matching catalog (not just a fixed top 20 - offset lets a
// visitor page through everything).
async function cardSearch(url) {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ error: "Search query too short" }, { status: 400 });

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  // "Card location" - which country's listings to show, and price sort.
  const country = url.searchParams.get("country");
  const sort = url.searchParams.get("sort"); // "discount" | "price_asc" | "price_desc"

  const db = supabaseAdmin();

  try {
    const [deals, catalogPage] = await Promise.all([
      findExistingDeals(db, q, { country, sort }),
      searchCards(q, { limit: CATALOG_PAGE_SIZE, offset }),
    ]);

    const tcgPlayerIds = catalogPage.results.map((c) => String(c.tcgPlayerId)).filter(Boolean);
    const [dealByTcgId, hrefByTcgId] = await Promise.all([
      findDealsForCatalogPage(db, tcgPlayerIds, { country }),
      resolveCatalogHrefs(db, tcgPlayerIds),
    ]);

    const enriched = catalogPage.results.map((c) => {
      const id = String(c.tcgPlayerId);
      const deal = dealByTcgId.get(id);
      const own = hrefByTcgId.get(id) ?? null;
      // Prefer our own catalogue name/set/number/rarity (matches the
      // /cards/[slug] page it links to); fall back to PPT's fields.
      const name = own?.name ?? c.name;
      const set = own?.set ?? c.setName;
      return {
        tcgplayerId: c.tcgPlayerId,
        name,
        displayName: cardDisplayName({ name }),
        set,
        cardNumber: own?.cardNumber ?? c.number ?? c.cardNumber ?? c.card_number ?? null,
        rarity: own?.rarity ?? c.rarity ?? null,
        imageUrl: upgradeCatalogImage(c.imageCdnUrl200 ?? c.imageUrl ?? null),
        marketPrice: pickMarketPrice(c.prices),
        // The permanent /cards/[slug] this result routes into - null
        // when we don't own a page for this exact print.
        cardHref: own?.href ?? null,
        deal: deal
          ? {
              id: deal.id,
              totalPrice: deal.total_price,
              totalPriceUsd: deal.total_price_usd ?? null,
              marketplace: deal.marketplace,
              discountPct: deal.discount_pct,
              listingType: deal.listing_type,
              affiliateUrl: deal.affiliate_url,
            }
          : null,
      };
    });

    // SMALL deterministic rerank of the returned page: exact name / exact
    // set phrase / collector number win; recognised specialty prints
    // (Jumbo, World Championship) are demoted unless the query asks for
    // them. Ties keep the provider's fuzzy/relevance order.
    const results = rerankCatalogResults(enriched, q);

    return Response.json({
      deals,
      catalog: {
        page,
        pageSize: CATALOG_PAGE_SIZE,
        total: catalogPage.total,
        hasMore: catalogPage.hasMore,
        results,
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
