import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES, searchListings, getGradingDetails } from "@/lib/ebay";
import { getRawPrice, getGradedPrice } from "@/lib/pokemonPriceTracker";

// This route does real work (API calls + database writes) and must never
// be cached by Next.js. A full priority-tier run measured at ~6.5 min
// sequential - give it real headroom rather than get killed mid-scan.
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// Both PokemonPriceTracker (500 req/min) and eBay comfortably support this
// many requests in flight at once - running cards sequentially was the
// actual cause of the 6.5 min runtime, not a rate limit.
const CONCURRENCY = 8;

// How far under market a listing has to be to count as a "deal".
const DISCOUNT_THRESHOLD = 0.15;
// Filters out obviously-wrong/scam-tier listings (e.g. a $2 "Charizard"
// that's actually a proxy or the wrong item) rather than genuine deals.
const SANITY_FLOOR_PCT = 0.25;
const MIN_SELLER_FEEDBACK_PCT = 95;
const MIN_SELLER_FEEDBACK_SCORE = 10;
// "Choose your card" / "pick your card" listings sell a pool of cards at
// one price - the listing's price isn't actually for the specific card
// we matched it to, so it can't be trusted for a discount calculation.
// acrylic/sketch/coa/fan art/original art catch novelty items (display
// cases, hand-drawn "sketch cards") that aren't the actual TCG card but
// still legitimately mention the card's name in their title.
const EXCLUDED_TITLE_PATTERN =
  /\b(lot|bundle|playset|proxy|custom|repack|digital|code|acrylic|sketch|coa)\b|choose your|pick your|fan ?art|original art|case card|display case|trading service|pokemon ?go\b|account trade/i;

// eBay's search is relevance-based, not a strict title match - a search
// for one card can return a completely different card that just ranks in
// the same category (verified: a "Pikachu" search returned a Darkrai
// promo and a Rayquaza promo, both priced against Pikachu's market
// value). Requires every meaningful word from the watchlist card's name
// to actually appear in the listing title before trusting the price
// comparison. Cards whose watchlist name has no distinctive token left
// after filtering (rare) skip the check rather than reject everything.
const MATCH_STOPWORDS = new Set([
  "ex", "gx", "v", "vmax", "vstar", "promo", "promos", "full", "art",
  "holo", "holofoil", "near", "mint", "nm", "the", "a", "an", "of",
  "star", "black", "prerelease",
]);

function coreTokens(name) {
  return (name.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length >= 2 && !MATCH_STOPWORDS.has(word)
  );
}

function listingMatchesCard(listing, row) {
  const tokens = coreTokens(row.name);
  if (tokens.length === 0) return true;
  const normalizedTitle = listing.title.toLowerCase();
  return tokens.every((token) => normalizedTitle.includes(token));
}

// The extended tier now covers ~5,000 cards ($15+, per the pokedealfinder.uk
// competitive check) - too many to scan in one country in one day alongside
// the priority tier without busting eBay's ~5,000/day cap. Splitting it into
// two stable halves, each scanned every other day, keeps genuine daily
// coverage of the whole tier while roughly halving the daily request count.
// Hash-based on watchlist id rather than a stored column - deterministic and
// needs no migration; a card's half only changes if its id changes.
function halfOf(row) {
  let hash = 0;
  const key = String(row.id);
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % 2 === 0 ? "1" : "2";
}

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
// PokemonPriceTracker's raw market price. At most the single cheapest
// graded listing gets the extra getGradingDetails() + graded-price lookup,
// to keep both eBay's per-item budget and PokemonPriceTracker's metered
// credits bounded per scan cycle.
async function scanCardInMarketplace(row, marketplaceId, marketData, db, discountThreshold) {
  const query = row.set ? `${row.name} ${row.set}` : row.name;
  // Push the sanity floor into the eBay query itself, so a full page of
  // results is actually viable candidates instead of getting drowned out
  // by near-$0 junk that happens to loosely match the card's name.
  const listings = await searchListings(query, marketplaceId, {
    minPrice: marketData.marketPrice * SANITY_FLOOR_PCT,
  });

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
    if (!listingMatchesCard(listing, row)) continue;

    const totalPrice = listing.price + listing.shipping;
    const discountPct = (marketData.marketPrice - totalPrice) / marketData.marketPrice;
    if (discountPct < discountThreshold) continue;
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

  if (cheapestGraded && isTrustworthyListing(cheapestGraded) && listingMatchesCard(cheapestGraded, row)) {
    try {
      const grading = await getGradingDetails(cheapestGraded.listingId, marketplaceId);
      const gradedPrice = grading.grader
        ? await getGradedPrice(row.justtcg_tcgplayer_id, grading.grader, grading.grade)
        : null;

      if (gradedPrice) {
        const totalPrice = cheapestGraded.price + cheapestGraded.shipping;
        const discountPct = (gradedPrice.price - totalPrice) / gradedPrice.price;

        if (discountPct >= discountThreshold && totalPrice >= gradedPrice.price * SANITY_FLOOR_PCT) {
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
  const url = new URL(request.url);
  const tier = url.searchParams.get("tier");

  // ?minDiscount=0.03 overrides the real 15% threshold for a one-off test
  // scan (e.g. to see real UI with real listings without waiting for a
  // genuine 15%+ deal). Never used by the scheduled cron calls, so
  // production behavior is unaffected unless this is passed explicitly.
  const minDiscountParam = url.searchParams.get("minDiscount");
  const discountThreshold = minDiscountParam != null ? Number(minDiscountParam) : DISCOUNT_THRESHOLD;

  // ?half=1 or ?half=2 - only meaningful for tier=extended, which is too
  // large to scan in one day (see halfOf() above). vercel.json runs each
  // half on alternating days so the full tier gets covered every 2 days.
  const half = url.searchParams.get("half");

  let watchlistQuery = db.from("watchlist").select("*").eq("active", true);
  if (tier) watchlistQuery = watchlistQuery.eq("tier", tier);

  const { data: watchlistRowsRaw, error: watchlistError } = await watchlistQuery;
  const watchlistRows = half ? (watchlistRowsRaw ?? []).filter((row) => halfOf(row) === half) : watchlistRowsRaw;

  // eBay's ~5,000/day request cap: the ~30 hand-picked priority cards get
  // a fast lane across US + Australia (your own market); the much larger
  // extended tier (the real $15-$200 "sweet spot" catalog) is scanned
  // single-country (US) and split across two days via ?half.
  const marketplaceIds =
    tier === "extended" ? ["EBAY_US"] : tier === "priority" ? ["EBAY_US", "EBAY_AU"] : Object.keys(MARKETPLACES);

  if (watchlistError) {
    return Response.json({ error: watchlistError.message }, { status: 500 });
  }

  if (!watchlistRows || watchlistRows.length === 0) {
    return Response.json({ scanned: 0, dealsFound: 0, message: "Watchlist is empty" });
  }

  let dealsFound = 0;
  let scanned = 0;
  const errors = [];

  async function scanOneCard(row) {
    let marketData;
    try {
      const raw = await getRawPrice(row.justtcg_tcgplayer_id, row.justtcg_condition);
      if (!raw) {
        errors.push(`No price for watchlist item "${row.name}" (id ${row.id})`);
        return;
      }
      marketData = { marketPrice: raw.price, priceChange24hr: null };
    } catch (err) {
      errors.push(`Price lookup failed for "${row.name}": ${err.message}`);
      return;
    }

    // At most 2 marketplaces per card, so running those in parallel too
    // is cheap and doesn't need its own concurrency cap.
    await Promise.all(
      marketplaceIds.map(async (marketplaceId) => {
        scanned++;
        try {
          dealsFound += await scanCardInMarketplace(row, marketplaceId, marketData, db, discountThreshold);
        } catch (err) {
          errors.push(`${row.name} (${marketplaceId}): ${err.message}`);
        }
      })
    );
  }

  // PokemonPriceTracker has no multi-card batch endpoint, and running
  // cards fully sequentially took ~6.5 min for 76 cards - both APIs
  // comfortably support CONCURRENCY cards in flight at once.
  const queue = [...watchlistRows];
  async function worker() {
    let row;
    while ((row = queue.shift())) {
      await scanOneCard(row);
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
