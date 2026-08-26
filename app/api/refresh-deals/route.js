import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { batchPrices } from "@/lib/justtcg";
import { MARKETPLACES, searchListings, getGradingDetails } from "@/lib/ebay";
import { getGradedPrice } from "@/lib/pokemonPriceTracker";

// This route does real work (API calls + database writes) and must never
// be cached by Next.js.
export const dynamic = "force-dynamic";

// How far under market a listing has to be to count as a "deal".
const DISCOUNT_THRESHOLD = 0.15;
// Filters out obviously-wrong/scam-tier listings (e.g. a $2 "Charizard"
// that's actually a proxy or the wrong item) rather than genuine deals.
const SANITY_FLOOR_PCT = 0.25;
const MIN_SELLER_FEEDBACK_PCT = 95;
const MIN_SELLER_FEEDBACK_SCORE = 10;
const EXCLUDED_TITLE_PATTERN = /\b(lot|bundle|playset|proxy|custom|repack|digital|code)\b/i;

function isTrustworthyListing(listing) {
  if (EXCLUDED_TITLE_PATTERN.test(listing.title)) return false;
  if (listing.sellerFeedbackScore != null && listing.sellerFeedbackScore < MIN_SELLER_FEEDBACK_SCORE)
    return false;
  if (listing.sellerFeedbackPct != null && listing.sellerFeedbackPct < MIN_SELLER_FEEDBACK_PCT)
    return false;
  return true;
}

function dealRow({ watchlistId, listing, totalPrice, marketPrice, discountPct, priceChange24hr, grading }) {
  return {
    watchlist_id: watchlistId,
    source: "ebay",
    marketplace: listing.marketplace,
    listing_id: listing.listingId,
    title: listing.title,
    image_url: listing.imageUrl,
    listing_url: listing.listingUrl,
    affiliate_url: listing.affiliateUrl,
    listing_type: listing.listingType,
    bid_count: listing.bidCount,
    auction_end_at: listing.auctionEndAt,
    price: listing.price,
    shipping: listing.shipping,
    total_price: totalPrice,
    market_price: marketPrice,
    discount_pct: discountPct,
    price_change_24hr: priceChange24hr ?? null,
    condition: listing.condition,
    is_graded: Boolean(grading),
    grader: grading?.grader ?? null,
    grade: grading?.grade ?? null,
    seller_username: listing.sellerUsername,
    seller_feedback_pct: listing.sellerFeedbackPct,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };
}

// Scans one watchlist card in one country. Raw listings are priced against
// JustTCG's market price (cheap, already batch-fetched). At most the
// single cheapest graded listing gets the extra getGradingDetails() +
// PokemonPriceTracker lookup, to keep both eBay's per-item budget and
// PokemonPriceTracker's metered credits bounded per scan cycle.
async function scanCardInMarketplace(row, marketplaceId, marketData, db) {
  const query = row.set ? `${row.name} ${row.set}` : row.name;
  const listings = await searchListings(query, marketplaceId);

  const rawListings = listings.filter((l) => !l.isGraded);
  const cheapestGraded = listings.find((l) => l.isGraded) ?? null;

  const seenListingIds = [];
  let dealsFound = 0;

  const tryUpsert = async (row_) => {
    const { error } = await db
      .from("deals")
      .upsert(row_, { onConflict: "source,marketplace,listing_id" });
    if (error) console.error(`Failed to upsert deal ${row_.listing_id}:`, error.message);
    else dealsFound++;
  };

  for (const listing of rawListings) {
    if (!isTrustworthyListing(listing)) continue;

    const totalPrice = listing.price + listing.shipping;
    const discountPct = (marketData.marketPrice - totalPrice) / marketData.marketPrice;
    if (discountPct < DISCOUNT_THRESHOLD) continue;
    if (totalPrice < marketData.marketPrice * SANITY_FLOOR_PCT) continue;

    seenListingIds.push(listing.listingId);
    await tryUpsert(
      dealRow({
        watchlistId: row.id,
        listing,
        totalPrice,
        marketPrice: marketData.marketPrice,
        discountPct,
        priceChange24hr: marketData.priceChange24hr,
      })
    );
  }

  if (cheapestGraded && isTrustworthyListing(cheapestGraded)) {
    try {
      const grading = await getGradingDetails(cheapestGraded.listingId, marketplaceId);
      const gradedPrice = grading.grader
        ? await getGradedPrice(row.justtcg_tcgplayer_id, grading.grader, grading.grade)
        : null;

      if (gradedPrice) {
        const totalPrice = cheapestGraded.price + cheapestGraded.shipping;
        const discountPct = (gradedPrice.price - totalPrice) / gradedPrice.price;

        if (discountPct >= DISCOUNT_THRESHOLD && totalPrice >= gradedPrice.price * SANITY_FLOOR_PCT) {
          seenListingIds.push(cheapestGraded.listingId);
          await tryUpsert(
            dealRow({
              watchlistId: row.id,
              listing: cheapestGraded,
              totalPrice,
              marketPrice: gradedPrice.price,
              discountPct,
              grading,
            })
          );
        }
      }
    } catch (err) {
      console.error(`Graded lookup failed for ${row.name} (${marketplaceId}):`, err.message);
    }
  }

  // Anything for this card+country that was active before but isn't in
  // this scan's results anymore (sold, ended, no longer underpriced) gets
  // retired instead of left showing as a live deal.
  let expireQuery = db
    .from("deals")
    .update({ is_active: false })
    .eq("watchlist_id", row.id)
    .eq("marketplace", marketplaceId)
    .eq("is_active", true);

  if (seenListingIds.length > 0) {
    expireQuery = expireQuery.not("listing_id", "in", `(${seenListingIds.join(",")})`);
  }
  await expireQuery;

  return dealsFound;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  // ?tier=priority (frequent, high-value cards) or ?tier=extended (broader
  // $5+ catalog, scanned less often) - vercel.json's two cron entries pass
  // this. No param = scan everything (useful for manual/test runs).
  const tier = new URL(request.url).searchParams.get("tier");

  let watchlistQuery = db.from("watchlist").select("*").eq("active", true);
  if (tier) watchlistQuery = watchlistQuery.eq("tier", tier);

  const { data: watchlistRows, error: watchlistError } = await watchlistQuery;

  if (watchlistError) {
    return Response.json({ error: watchlistError.message }, { status: 500 });
  }

  if (!watchlistRows || watchlistRows.length === 0) {
    return Response.json({ scanned: 0, dealsFound: 0, message: "Watchlist is empty" });
  }

  const marketPricesByWatchlistId = await batchPrices(watchlistRows);

  let dealsFound = 0;
  let scanned = 0;
  const errors = [];

  for (const row of watchlistRows) {
    const marketData = marketPricesByWatchlistId.get(row.id);
    if (!marketData) {
      errors.push(`No JustTCG price for watchlist item "${row.name}" (id ${row.id})`);
      continue;
    }

    for (const marketplaceId of Object.keys(MARKETPLACES)) {
      scanned++;
      try {
        dealsFound += await scanCardInMarketplace(row, marketplaceId, marketData, db);
      } catch (err) {
        errors.push(`${row.name} (${marketplaceId}): ${err.message}`);
      }
    }
  }

  return Response.json({
    scanned,
    dealsFound,
    errors,
    scannedAt: new Date().toISOString(),
  });
}
