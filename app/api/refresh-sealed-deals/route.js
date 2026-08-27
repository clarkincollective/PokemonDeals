import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES, searchListings } from "@/lib/ebay";
import { getSealedPrice } from "@/lib/pokemonPriceTracker";
import { SANITY_FLOOR_PCT, isTrustworthySealedListing, listingMatchesSealedProduct } from "@/lib/dealMatching";

// Real work (API calls + database writes) - never cached, and a small
// (~30-50 product) watchlist scanned once/day on its own dedicated tier,
// isolated from the card-scanning cron budget entirely (see vercel.json).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 5;
const DISCOUNT_THRESHOLD = 0.1;

function dealRow({ productId, listing, totalPrice, marketPrice, discountPct }) {
  return {
    sealed_watchlist_id: productId,
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
    seller_username: listing.sellerUsername,
    seller_feedback_pct: listing.sellerFeedbackPct,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };
}

async function scanProductInMarketplace(row, marketplaceId, marketPrice, db, discountThreshold) {
  const query = row.set ? `${row.name} ${row.set}` : row.name;
  // categoryId: null - see searchListings in lib/ebay.js for why (sealed
  // product's real eBay category id isn't verified; the query text itself
  // plus listingMatchesSealedProduct below do the real filtering).
  const listings = await searchListings(query, marketplaceId, {
    minPrice: marketPrice * SANITY_FLOOR_PCT,
    categoryId: null,
  });

  const seenListingIds = [];
  let dealsFound = 0;

  for (const listing of listings) {
    if (!isTrustworthySealedListing(listing)) continue;
    if (!listingMatchesSealedProduct(listing, row)) continue;

    const totalPrice = listing.price + listing.shipping;
    const discountPct = (marketPrice - totalPrice) / marketPrice;
    if (discountPct < discountThreshold) continue;
    if (totalPrice < marketPrice * SANITY_FLOOR_PCT) continue;

    seenListingIds.push(listing.listingId);
    const { error } = await db
      .from("sealed_deals")
      .upsert(
        dealRow({ productId: row.id, listing, totalPrice, marketPrice, discountPct }),
        { onConflict: "source,marketplace,listing_id" }
      );
    if (error) console.error(`Failed to upsert sealed deal ${listing.listingId}:`, error.message);
    else dealsFound++;
  }

  // Same expire-what-wasn't-seen pattern as the card scanner.
  let expireQuery = db
    .from("sealed_deals")
    .update({ is_active: false })
    .eq("sealed_watchlist_id", row.id)
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
  const url = new URL(request.url);

  const minDiscountParam = url.searchParams.get("minDiscount");
  const discountThreshold = minDiscountParam != null ? Number(minDiscountParam) : DISCOUNT_THRESHOLD;

  const countryParam = url.searchParams.get("country");
  const marketplaceIds =
    countryParam && MARKETPLACES[countryParam] ? [countryParam] : Object.keys(MARKETPLACES);

  const { data: watchlistRows, error: watchlistError } = await db
    .from("sealed_watchlist")
    .select("*")
    .eq("active", true);

  if (watchlistError) return Response.json({ error: watchlistError.message }, { status: 500 });
  if (!watchlistRows || watchlistRows.length === 0) {
    return Response.json({ scanned: 0, dealsFound: 0, message: "Sealed watchlist is empty" });
  }

  let dealsFound = 0;
  let scanned = 0;
  const errors = [];

  async function scanOneProduct(row) {
    let marketPrice;
    try {
      const raw = await getSealedPrice(row.tcgplayer_id);
      if (!raw) {
        errors.push(`No price for sealed product "${row.name}" (id ${row.id})`);
        return;
      }
      marketPrice = raw.price;
    } catch (err) {
      errors.push(`Price lookup failed for "${row.name}": ${err.message}`);
      return;
    }

    await Promise.all(
      marketplaceIds.map(async (marketplaceId) => {
        scanned++;
        try {
          dealsFound += await scanProductInMarketplace(row, marketplaceId, marketPrice, db, discountThreshold);
        } catch (err) {
          errors.push(`${row.name} (${marketplaceId}): ${err.message}`);
        }
      })
    );
  }

  const queue = [...watchlistRows];
  async function worker() {
    let row;
    while ((row = queue.shift())) {
      await scanOneProduct(row);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return Response.json({
    scanned,
    dealsFound,
    errors,
    scannedAt: new Date().toISOString(),
  });
}
