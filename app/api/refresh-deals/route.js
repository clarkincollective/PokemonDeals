import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETPLACES, searchListings, searchNewlyListed, getGradingDetails } from "@/lib/ebay";
import { getConditionPrices, getGradedPrice } from "@/lib/pokemonPriceTracker";
import {
  SANITY_FLOOR_PCT,
  coreTokens,
  listingMatchesCard,
  isTrustworthyListing,
  detectListingCondition,
  selectConditionPrice,
} from "@/lib/dealMatching";

// This route does real work (API calls + database writes) and must never
// be cached by Next.js. A full priority-tier run measured at ~6.5 min
// sequential - give it real headroom rather than get killed mid-scan.
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// Both PokemonPriceTracker (500 req/min) and eBay comfortably support this
// many requests in flight at once - running cards sequentially was the
// actual cause of the 6.5 min runtime, not a rate limit.
const CONCURRENCY = 8;

// How far under market a listing has to be to count as a "deal". Lowered
// from 15% so more genuine below-market listings qualify and new finds
// show up more often, not just the rarer bigger discounts.
const DISCOUNT_THRESHOLD = 0.1;

// The extended tier now covers ~8,500 cards ($15+: ~5,100 English per the
// pokedealfinder.uk competitive check, plus ~3,500 Japanese once that
// catalog was added) - too many to scan in one country in one day.
// Splitting it into EXTENDED_CHUNKS stable pieces, one scanned per
// country-day, keeps genuine coverage of the whole tier in every country
// without busting eBay's ~5,000/day cap - sweep mode (see runSweep below)
// now handles fast new-deal discovery cheaply, so this budget only needs
// to cover confirming/expiring existing deals, not speed. Bumped from 2
// to 3 when the catalog grew ~70% (Japanese addition) - at 2 chunks, a
// day running an extended-tier chunk alongside sweep+priority's own daily
// volume was pushing past the 5,000/day cap; 3 keeps real headroom, at
// the cost of a slightly slower full-rotation cadence (~15 days instead
// of ~10 - see vercel.json's now-15 extended cron entries). Hash-based on
// watchlist id rather than a stored column - deterministic and needs no
// migration; a card's chunk only changes if its id changes.
const EXTENDED_CHUNKS = 3;

// Supabase/PostgREST silently caps any single request at 1,000 rows
// regardless of no explicit .limit() being set - a real, significant bug
// found via a live "deep crawl" check: both the extended-tier query and
// sweep mode's watchlist query below had no .range() pagination, so they
// were silently only ever seeing the first 1,000 of 8,556 active
// watchlist rows (verified live) - sweep mode (the fast, every-15-min
// discovery path) had ~12% real coverage of the watchlist, not the ~100%
// it was designed for; the extended tier's chunking was splitting that
// same wrong 1,000-row subset three ways instead of the real ~8,500.
// Same paginate-with-.range() pattern already used in app/sitemap.js -
// buildQuery is called fresh each page (a Supabase query builder isn't
// safe to re-range() and re-await after it's already been sent once).
async function fetchAllRows(buildQuery) {
  const PAGE_SIZE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}

function chunkOf(row, totalChunks) {
  let hash = 0;
  const key = String(row.id);
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return String((hash % totalChunks) + 1);
}

// condition, when passed, overrides listing.condition - used for raw
// listings to store the real detected wear tier (Near Mint/Lightly
// Played/.../Damaged) instead of eBay's own item.condition, which for
// cards only ever says "Graded" or "Ungraded" and says nothing about
// physical wear.
function dealRow({ watchlistId, listing, totalPrice, marketPrice, discountPct, priceChange24hr, grading, condition }) {
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
    condition: condition ?? listing.condition,
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
  const baseQuery = row.set ? `${row.name} ${row.set}` : row.name;
  // Biases eBay's own relevance ranking toward genuine Japanese-print
  // listings (sellers overwhelmingly include "Japanese" in the title) -
  // listingMatchesCard's language check below is what actually enforces
  // it, this just makes the search results worth checking in the first
  // place.
  const query = row.language === "japanese" ? `${baseQuery} Japanese` : baseQuery;
  // Push the sanity floor into the eBay query itself, so a full page of
  // results is actually viable candidates instead of getting drowned out
  // by near-$0 junk that happens to loosely match the card's name. Uses
  // the LOWEST known condition price (not just the fallback/Near-Mint-ish
  // one) so a genuine Damaged-condition listing - legitimately priced
  // below fallbackPrice * SANITY_FLOOR_PCT - still gets fetched at all;
  // the real per-listing condition check below is what actually prices it.
  const knownPrices = [marketData.fallbackPrice, ...Object.values(marketData.byCondition ?? {})].filter(
    (p) => p != null
  );
  const lowestKnownPrice = knownPrices.length > 0 ? Math.min(...knownPrices) : marketData.fallbackPrice;
  const listings = await searchListings(query, marketplaceId, {
    minPrice: lowestKnownPrice * SANITY_FLOOR_PCT,
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

    // Price THIS listing against its own real detected condition, not a
    // flat Near Mint assumption for every listing regardless of actual
    // wear (see selectConditionPrice/detectListingCondition for the real
    // bug this fixes).
    const condition = detectListingCondition(listing.title);
    const marketPrice = selectConditionPrice(marketData.byCondition, condition, marketData.fallbackPrice);
    if (marketPrice == null) continue;

    const totalPrice = listing.price + listing.shipping;
    const discountPct = (marketPrice - totalPrice) / marketPrice;
    if (discountPct < discountThreshold) continue;
    if (totalPrice < marketPrice * SANITY_FLOOR_PCT) continue;

    seenListingIds.push(listing.listingId);
    await tryUpsert(
      dealRow({
        watchlistId: row.id,
        listing,
        totalPrice,
        marketPrice,
        discountPct,
        priceChange24hr: marketData.priceChange24hr,
        condition,
      })
    );
  }

  if (cheapestGraded && isTrustworthyListing(cheapestGraded) && listingMatchesCard(cheapestGraded, row)) {
    try {
      const grading = await getGradingDetails(cheapestGraded.listingId, marketplaceId);
      const gradedPrice = grading.grader
        ? await getGradedPrice(row.justtcg_tcgplayer_id, grading.grader, grading.grade, row.language)
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

// Inverted index: token -> watchlist rows containing it. Lets sweep mode
// (below) find candidate cards for a listing without checking it against
// every one of ~5,000 watchlist rows individually.
function buildWatchlistIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    for (const token of coreTokens(row.name)) {
      if (!index.has(token)) index.set(token, []);
      index.get(token).push(row);
    }
  }
  return index;
}

function candidateRowsForListing(listing, index) {
  const words = listing.title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const candidates = new Map();
  for (const word of words) {
    for (const row of index.get(word) ?? []) {
      if (!candidates.has(row.id)) candidates.set(row.id, row);
    }
  }
  return [...candidates.values()];
}

// Sweeps the newest listings across the whole category (see
// searchNewlyListed in lib/ebay.js) and matches each one against every
// active watchlist card client-side, instead of searching per card. This
// is dramatically cheaper - a handful of requests can cover the same
// ground as thousands of per-card searches - which is what makes running
// this often, in every country, affordable. Unlike scanCardInMarketplace,
// a sweep only ever sees a recent slice of new listings, never a card's
// full current listing set, so it never expires anything - that stays the
// tiered per-card scans' job.
async function runSweep(marketplaceId, watchlistRows, db, discountThreshold, pages) {
  const index = buildWatchlistIndex(watchlistRows);
  const listings = await searchNewlyListed(marketplaceId, { pages });

  const marketPriceCache = new Map();
  async function cachedConditionPrices(row) {
    const key = `${row.justtcg_tcgplayer_id}|${row.language}`;
    if (marketPriceCache.has(key)) return marketPriceCache.get(key);
    let marketData = null;
    try {
      const raw = await getConditionPrices(row.justtcg_tcgplayer_id, row.language);
      if (raw) marketData = { byCondition: raw.byCondition, fallbackPrice: raw.fallbackPrice, priceChange24hr: null };
    } catch {
      marketData = null;
    }
    marketPriceCache.set(key, marketData);
    return marketData;
  }

  let dealsFound = 0;
  let matched = 0;
  let gradedLookups = 0;
  // Bounds worst-case extra eBay getItem + PokemonPriceTracker calls if an
  // unusually large number of graded matches show up in one sweep.
  const GRADED_LOOKUP_CAP = 30;
  const errors = [];

  const tryUpsert = async (row_) => {
    const { error } = await db.from("deals").upsert(row_, { onConflict: "source,marketplace,listing_id" });
    if (error) console.error(`Failed to upsert deal ${row_.listing_id}:`, error.message);
    else dealsFound++;
  };

  for (const listing of listings) {
    if (!isTrustworthyListing(listing)) continue;

    for (const row of candidateRowsForListing(listing, index)) {
      if (!listingMatchesCard(listing, row)) continue;
      matched++;

      if (listing.isGraded) {
        if (gradedLookups >= GRADED_LOOKUP_CAP) continue;
        gradedLookups++;
        try {
          const grading = await getGradingDetails(listing.listingId, marketplaceId);
          const gradedPrice = grading.grader
            ? await getGradedPrice(row.justtcg_tcgplayer_id, grading.grader, grading.grade, row.language)
            : null;
          if (!gradedPrice) continue;

          const totalPrice = listing.price + listing.shipping;
          const discountPct = (gradedPrice.price - totalPrice) / gradedPrice.price;
          if (discountPct < discountThreshold) continue;
          if (totalPrice < gradedPrice.price * SANITY_FLOOR_PCT) continue;

          await tryUpsert(
            dealRow({ watchlistId: row.id, listing, totalPrice, marketPrice: gradedPrice.price, discountPct, grading })
          );
        } catch (err) {
          errors.push(`Graded lookup failed for ${row.name} (${marketplaceId}): ${err.message}`);
        }
        continue;
      }

      const marketData = await cachedConditionPrices(row);
      if (!marketData) continue;

      const condition = detectListingCondition(listing.title);
      const marketPrice = selectConditionPrice(marketData.byCondition, condition, marketData.fallbackPrice);
      if (marketPrice == null) continue;

      const totalPrice = listing.price + listing.shipping;
      const discountPct = (marketPrice - totalPrice) / marketPrice;
      if (discountPct < discountThreshold) continue;
      if (totalPrice < marketPrice * SANITY_FLOOR_PCT) continue;

      await tryUpsert(
        dealRow({
          watchlistId: row.id,
          listing,
          totalPrice,
          marketPrice,
          discountPct,
          priceChange24hr: marketData.priceChange24hr,
          condition,
        })
      );
    }
  }

  return { swept: listings.length, matched, dealsFound, errors };
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

  // ?minDiscount=0.03 overrides the real 10% threshold for a one-off test
  // scan (e.g. to see real UI with real listings without waiting for a
  // genuine 10%+ deal). Never used by the scheduled cron calls, so
  // production behavior is unaffected unless this is passed explicitly.
  const minDiscountParam = url.searchParams.get("minDiscount");
  const discountThreshold = minDiscountParam != null ? Number(minDiscountParam) : DISCOUNT_THRESHOLD;

  // ?mode=sweep&country=EBAY_US - fast, cheap discovery of brand-new
  // listings across the WHOLE category (see runSweep above), matched
  // against every active watchlist card regardless of tier. This is what
  // makes true 15-min freshness affordable; it never expires deals, so
  // the tiered per-card scans below still run on their own schedule to
  // keep confirming/retiring existing ones.
  const mode = url.searchParams.get("mode");
  if (mode === "sweep") {
    const marketplaceId =
      url.searchParams.get("country") && MARKETPLACES[url.searchParams.get("country")]
        ? url.searchParams.get("country")
        : "EBAY_US";
    const pages = Number(url.searchParams.get("pages")) || 5;

    const { data: allActiveRows, error: activeError } = await fetchAllRows(() =>
      db.from("watchlist").select("*").eq("active", true)
    );
    if (activeError) return Response.json({ error: activeError.message }, { status: 500 });

    const result = await runSweep(marketplaceId, allActiveRows ?? [], db, discountThreshold, pages);
    return Response.json({ mode: "sweep", marketplace: marketplaceId, ...result, scannedAt: new Date().toISOString() });
  }

  // ?chunk=1..2 - only meaningful for tier=extended (see EXTENDED_CHUNKS
  // above). vercel.json runs each chunk/country combination on its own
  // days so the full tier gets covered in every country roughly every 10
  // days.
  const chunk = url.searchParams.get("chunk");
  // ?country=EBAY_GB - a single marketplace, used both by tier=extended
  // and by sweep mode above.
  const countryParam = url.searchParams.get("country");
  // ?countries=EBAY_GB,EBAY_AU,EBAY_CA,EBAY_DE - an explicit list,
  // overrides everything else.
  const countriesParam = url.searchParams.get("countries");

  const { data: watchlistRowsRaw, error: watchlistError } = await fetchAllRows(() => {
    let q = db.from("watchlist").select("*").eq("active", true);
    if (tier) q = q.eq("tier", tier);
    return q;
  });
  const watchlistRows = chunk
    ? (watchlistRowsRaw ?? []).filter((row) => chunkOf(row, EXTENDED_CHUNKS) === chunk)
    : watchlistRowsRaw;

  // eBay's ~5,000/day request cap, split two ways now that sweep mode (see
  // above) handles fast new-deal discovery cheaply and separately:
  // - Priority (~30 hand-picked cards, all 5 countries, every 4h via
  //   vercel.json): confirms/expires their existing deals.
  // - Extended (~5,000 auto-synced cards): one country at a time, split
  //   into EXTENDED_CHUNKS pieces per country (~2,500/day), rotating
  //   through all 5 countries every ~10 days - also just confirm/expiry
  //   duty now, since sweep already finds new ones fast.
  const marketplaceIds = countriesParam
    ? countriesParam.split(",").filter((id) => MARKETPLACES[id])
    : countryParam && MARKETPLACES[countryParam]
      ? [countryParam]
      : tier === "extended"
        ? ["EBAY_US"]
        : Object.keys(MARKETPLACES);

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
      const raw = await getConditionPrices(row.justtcg_tcgplayer_id, row.language);
      if (!raw || (raw.fallbackPrice == null && Object.keys(raw.byCondition).length === 0)) {
        errors.push(`No price for watchlist item "${row.name}" (id ${row.id})`);
        return;
      }
      marketData = { byCondition: raw.byCondition, fallbackPrice: raw.fallbackPrice, priceChange24hr: null };
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
