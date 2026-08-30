import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES, searchListings, getBrowseRateLimit } from "@/lib/ebay";
import { getSealedPrice } from "@/lib/pokemonPriceTracker";
import { getUsdRates, toUsd } from "@/lib/fx";
import { SANITY_FLOOR_PCT, isTrustworthySealedListing, listingMatchesSealedProduct } from "@/lib/dealMatching";

// Real work (API calls + database writes) - never cached, and a small
// (~30-50 product) watchlist scanned once/day on its own dedicated tier,
// isolated from the card-scanning cron budget entirely (see vercel.json).
export const dynamic = "force-dynamic";
// Raised from 300 when the watchlist grew from ~48 hand-picked products
// to ~48 manual + ~150 auto-promoted (Booster Box + ETB, see
// /api/sync-sealed-watchlist). ~194 products x 6 marketplaces (EBAY_IT
// added 2026-08-31) at CONCURRENCY 5 fits comfortably; 500 is headroom
// for PPT price-lookup pacing + retries.
export const maxDuration = 500;

const CONCURRENCY = 5;
const DISCOUNT_THRESHOLD = 0.1;

function pricedListing(listing, marketPriceUsd, rates) {
  const totalLocal = listing.price + listing.shipping;
  const totalUsd = toUsd(totalLocal, listing.currency, rates);
  return { totalLocal, totalUsd, discountPct: (marketPriceUsd - totalUsd) / marketPriceUsd };
}

function dealRow({ productId, listing, totalPrice, totalPriceUsd, marketPrice, discountPct }) {
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
    total_price_usd: totalPriceUsd ?? totalPrice,
    currency: listing.currency ?? "USD",
    item_location_country: listing.itemLocationCountry ?? null,
    is_local:
      Boolean(listing.itemLocationCountry) &&
      listing.itemLocationCountry === listing.marketplace.replace("EBAY_", ""),
    market_price: marketPrice,
    discount_pct: discountPct,
    seller_username: listing.sellerUsername,
    seller_feedback_pct: listing.sellerFeedbackPct,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };
}

async function scanProductInMarketplace(row, marketplaceId, marketPrice, db, discountThreshold, rates) {
  const query = row.set ? `${row.name} ${row.set}` : row.name;
  // categoryId: null - see searchListings in lib/ebay.js for why (sealed
  // product's real eBay category id isn't verified; the query text itself
  // plus listingMatchesSealedProduct below do the real filtering).
  const { listings, total } = await searchListings(query, marketplaceId, {
    minPrice: marketPrice * SANITY_FLOOR_PCT,
    categoryId: null,
  });

  let dealsFound = 0;

  for (const listing of listings) {
    if (!isTrustworthySealedListing(listing)) continue;
    if (!listingMatchesSealedProduct(listing, row)) continue;

    const { totalLocal, totalUsd, discountPct } = pricedListing(listing, marketPrice, rates);
    if (discountPct < discountThreshold) continue;
    if (totalUsd < marketPrice * SANITY_FLOOR_PCT) continue;

    const { error } = await db
      .from("sealed_deals")
      .upsert(
        dealRow({ productId: row.id, listing, totalPrice: totalLocal, totalPriceUsd: totalUsd, marketPrice, discountPct }),
        { onConflict: "source,marketplace,listing_id" }
      );
    if (error) console.error(`Failed to upsert sealed deal ${listing.listingId}:`, error.message);
    else dealsFound++;
  }

  // Same expire pattern and grace window as the card scanner (see
  // app/api/refresh-deals/route.js): only reconcile on a trustworthy view
  // (matched something, or eBay returned a real `total`), and retire only
  // what no scan has seen for the grace window rather than on the spot -
  // sealed runs once a day, so an instant expire would flap the section.
  const graceDays = marketplaceId === "EBAY_US" ? 2 : 5;
  const graceCutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();
  const canReconcile = listings.length > 0 || total !== null;

  if (canReconcile) {
    await db
      .from("sealed_deals")
      .update({ is_active: false })
      .eq("sealed_watchlist_id", row.id)
      .eq("marketplace", marketplaceId)
      .eq("is_active", true)
      .lt("last_seen_at", graceCutoff);
  }

  return dealsFound;
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const url = new URL(request.url);
  const rates = await getUsdRates();

  // Pre-flight Browse API quota check - same guard as app/api/refresh-deals
  // (see docs/ebay-rate-limits.md). This run scans ~194 products (48
  // manual + ~146 auto-promoted Booster Box / ETB) x 6 marketplaces
  // ≈ 1,150 Browse calls, and fires at 06:00 UTC, an hour before the
  // daily reset - the run most likely to hit an already-spent quota.
  // Floor 250.
  const rl = await getBrowseRateLimit();
  if (rl && rl.remaining != null && rl.remaining < 250) {
    return Response.json({
      skipped: "ebay_rate_limited",
      remaining: rl.remaining,
      limit: rl.limit,
      reset: rl.reset,
    });
  }

  const minDiscountParam = url.searchParams.get("minDiscount");
  const discountThreshold = minDiscountParam != null ? Number(minDiscountParam) : DISCOUNT_THRESHOLD;

  const countryParam = url.searchParams.get("country");
  const marketplaceIds =
    countryParam && MARKETPLACES[countryParam] ? [countryParam] : Object.keys(MARKETPLACES);

  const { data: watchlistRows, error: watchlistError } = await db
    .from("sealed_watchlist")
    .select("*")
    .eq("active", true);

  // Reference prices: batch-read them from `sealed_catalog` (populated
  // daily by /api/sync-sealed-catalog, ~1h before this cron) keyed by
  // tcgplayer_id, instead of one live PPT `getSealedPrice` call per
  // product. With the watchlist now ~200 products, per-product live
  // lookups slammed PPT's 500/min window and half the run was skipped.
  // Live `getSealedPrice` stays as the fallback for the handful of
  // products not in `sealed_catalog` (mostly older manual rows).
  const catalogPrice = new Map();
  {
    const ids = [...new Set((watchlistRows ?? []).map((r) => String(r.tcgplayer_id)))];
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db
        .from("sealed_catalog")
        .select("tcgplayer_id, market_price")
        .in("tcgplayer_id", ids.slice(i, i + 500));
      for (const r of data ?? []) {
        if (r.market_price != null) catalogPrice.set(String(r.tcgplayer_id), Number(r.market_price));
      }
    }
  }

  if (watchlistError) return Response.json({ error: watchlistError.message }, { status: 500 });
  if (!watchlistRows || watchlistRows.length === 0) {
    return Response.json({ scanned: 0, dealsFound: 0, message: "Sealed watchlist is empty" });
  }

  let dealsFound = 0;
  let scanned = 0;
  const errors = [];

  async function scanOneProduct(row) {
    let marketPrice = catalogPrice.get(String(row.tcgplayer_id)) ?? null;
    if (marketPrice == null) {
      // Not in sealed_catalog (or no price there) - fall back to a live
      // PPT lookup for this one product.
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
    }

    await Promise.all(
      marketplaceIds.map(async (marketplaceId) => {
        scanned++;
        try {
          dealsFound += await scanProductInMarketplace(row, marketplaceId, marketPrice, db, discountThreshold, rates);
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
