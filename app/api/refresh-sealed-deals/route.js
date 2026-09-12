import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES, searchListings, getBrowseRateLimit } from "@/lib/ebay";
import { getSealedPrice } from "@/lib/pokemonPriceTracker";
// 17C.10 - provenance of the sealed reference this scan prices against.
import { buildSealedReference } from "@/lib/referenceProvenance";
import { probeReferenceColumns, writesReferenceColumns } from "@/lib/referenceProvenanceDb";
import { getUsdRates, toUsd } from "@/lib/fx";
import { SANITY_FLOOR_PCT, isTrustworthySealedListing, listingMatchesSealedProduct } from "@/lib/dealMatching";
import { ingestSealedListings } from "@/lib/sealedIngest";
import { beginJobRun, finishJobRun, setQuotaSnapshot, markSkipped, markError } from "@/lib/ebayTelemetry";

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

async function scanProductInMarketplace(row, marketplaceId, marketPrice, db, discountThreshold, rates, supportsDisqualifiedReason, reference = null, supportsReferenceColumns = false) {
  const query = row.set ? `${row.name} ${row.set}` : row.name;
  // categoryId: null - see searchListings in lib/ebay.js for why (sealed
  // product's real eBay category id isn't verified; the query text itself
  // plus listingMatchesSealedProduct below do the real filtering).
  const { listings, total } = await searchListings(query, marketplaceId, {
    minPrice: marketPrice * SANITY_FLOOR_PCT,
    categoryId: null,
  });

  // 17C.9 - the decide-and-write path lives in lib/sealedIngest so the real
  // write behaviour (including repairing a row bound to the wrong product,
  // and clearing that product's comparison on reassignment) is testable
  // without a network or a database. Name tokens are necessary but not
  // sufficient: "30th Anniversary Celebrations Elite Trainer Box"
  // satisfies every word of the 2021 "Celebrations Elite Trainer Box", so
  // the identity decision (edition / kind / quantity) runs inside.
  const stats = await ingestSealedListings({
    db,
    product: row,
    listings,
    marketPrice,
    discountThreshold,
    floorUsd: marketPrice * SANITY_FLOOR_PCT,
    isTrustworthy: isTrustworthySealedListing,
    matchesName: listingMatchesSealedProduct,
    priceListing: (listing, mp) => pricedListing(listing, mp, rates),
    buildRow: dealRow,
    supportsDisqualifiedReason,
    reference,
    supportsReferenceColumns,
  });
  const dealsFound = stats.written;
  if (stats.repaired > 0) {
    console.log(`sealed: repaired ${stats.repaired} listing(s) onto "${row.name}" (${row.set})`);
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
  const ctx = beginJobRun({ job: "refresh-sealed-deals" });
  try {
  const url = new URL(request.url);
  const rates = await getUsdRates();

  // 17C.9 - supabase/sealed_availability_migration.sql is NOT applied yet.
  // Until it is, sealed_deals has no `disqualified_reason` column and
  // writing one would fail the whole upsert (42703). Probe once per run and
  // degrade, the same way verify-deals probes exact_verified_at.
  const supportsDisqualifiedReason = !(await db.from("sealed_deals").select("disqualified_reason").limit(1)).error;
  // 17C.10 - same degrade-gracefully probe for the reference columns
  // (supabase/reference_provenance_migration.sql). While they are absent
  // the scan writes no provenance at all rather than a partial row.
  const supportsReferenceColumns = writesReferenceColumns(await probeReferenceColumns(db, "sealed_deals"));

  // Pre-flight Browse API quota check - same guard as app/api/refresh-deals
  // (see docs/ebay-rate-limits.md). This run scans ~194 products (48
  // manual + ~146 auto-promoted Booster Box / ETB) x 6 marketplaces
  // ≈ 1,150 Browse calls, and fires at 06:00 UTC, an hour before the
  // daily reset - the run most likely to hit an already-spent quota.
  // Floor 250.
  const rl = await getBrowseRateLimit();
  setQuotaSnapshot({ remainingStart: rl?.remaining ?? null, limit: rl?.limit ?? null, reserveFloor: 250 });
  if (rl && rl.remaining != null && rl.remaining < 250) {
    markSkipped("ebay_rate_limited");
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
  // 17C.10 - our own copy time for the catalogue figure. sealed_catalog has
  // NO provider as-of column, so a catalogue-sourced sealed reference has an
  // UNKNOWN observation time; this is recorded as reference_synced_at only
  // and can never evidence that the figure was true after release day.
  const catalogSyncedAt = new Map();
  {
    const ids = [...new Set((watchlistRows ?? []).map((r) => String(r.tcgplayer_id)))];
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db
        .from("sealed_catalog")
        .select("tcgplayer_id, market_price, synced_at")
        .in("tcgplayer_id", ids.slice(i, i + 500));
      for (const r of data ?? []) {
        if (r.market_price != null) {
          catalogPrice.set(String(r.tcgplayer_id), Number(r.market_price));
          catalogSyncedAt.set(String(r.tcgplayer_id), r.synced_at ?? null);
        }
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
    // The provenance of whichever figure this product is priced against.
    // Built HERE, where the source is still known - by the time the row is
    // written only the number would survive.
    let reference = null;
    let marketPrice = catalogPrice.get(String(row.tcgplayer_id)) ?? null;
    if (marketPrice != null) {
      reference = buildSealedReference({
        source: "sealed_catalog",
        productId: row.tcgplayer_id,
        amount: marketPrice,
        currency: "USD",
        // sealed_catalog records no provider as-of: unknown stays unknown
        observedAt: null,
        syncedAt: catalogSyncedAt.get(String(row.tcgplayer_id)) ?? null,
      });
    } else {
      // Not in sealed_catalog (or no price there) - fall back to a live
      // PPT lookup for this one product.
      try {
        const raw = await getSealedPrice(row.tcgplayer_id);
        if (!raw) {
          errors.push(`No price for sealed product "${row.name}" (id ${row.id})`);
          return;
        }
        marketPrice = raw.price;
        reference = buildSealedReference({
          source: "ppt_live",
          productId: row.tcgplayer_id,
          amount: raw.price,
          currency: "USD",
          // the PROVIDER's own as-of for this figure
          observedAt: raw.lastUpdated ?? null,
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        errors.push(`Price lookup failed for "${row.name}": ${err.message}`);
        return;
      }
    }

    await Promise.all(
      marketplaceIds.map(async (marketplaceId) => {
        scanned++;
        try {
          dealsFound += await scanProductInMarketplace(row, marketplaceId, marketPrice, db, discountThreshold, rates, supportsDisqualifiedReason, reference, supportsReferenceColumns);
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
  } catch (err) {
    markError(err);
    throw err;
  } finally {
    await finishJobRun(db, ctx);
  }
}
