import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MARKETPLACES,
  getItemsByLegacyIds,
  getBrowseRateLimit,
  cardConditionDescriptorContent,
  languageAspect,
} from "@/lib/ebay";
import { fetchFeed } from "@/lib/pokeFeed";
import { getUsdRates, toUsd } from "@/lib/fx";
import { logDiscoveryEvent, legacyIdFromListingId } from "@/lib/discoveryLog";
import {
  SANITY_FLOOR_PCT,
  coreTokens,
  qualifiesAsTradingCard,
  admitsProxyOrCounterfeit,
  listingMatchesCard,
  isTrustworthyListing,
} from "@/lib/dealMatching";
import {
  classifyListingCondition,
  conditionAllowsPromotion,
  classifyListingLanguage,
  languageCompatible,
} from "@/lib/dealQuality";

// External discovery ingestion.
//
// PokeDealFinder's public board (lib/pokeFeed.js) is a DISCOVERY HINT ONLY.
// Each item it names is independently re-fetched through our own eBay
// Browse API, re-validated through the identical trust + match + score
// pipeline the scanner uses, matched against our own card_catalog, and
// wrapped with our own affiliate links. Nothing from the board is trusted
// or shown. This pipeline is ADDITIVE to app/api/refresh-deals - it never
// disables or replaces it.
//
// COST: verification is one Browse call per genuinely-new item (eBay's
// batch getItems endpoint 403s on this keyset). So this runs HOURLY, only
// when the Browse quota has real headroom (floor 800 - it is a supplement
// for spare capacity, not a substitute when our own quota is spent), and
// caps how many new items it verifies per cycle. Feed-only deals expire on
// absence from the board (2-day grace). See docs/scanning-architecture.md
// and IMPLEMENTATION_STATUS.md "External discovery ingestion".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DISCOUNT_THRESHOLD = 0.1; // same value as refresh-deals / refresh-sealed-deals
const RATE_LIMIT_FLOOR = 800; // only supplement when we genuinely have room
const MAX_NEW_PER_CYCLE = 40; // hard ceiling on Browse spend per run
const RECENT_VERIFY_HOURS = 20; // skip re-verifying an item seen this recently
const FEED_ONLY_GRACE_DAYS = 2; // expire a feed-only deal absent from the board this long
const CATALOG_PAGE = 1000;

// The scanner stores listing_id as eBay's RESTful id; for a single-variation
// listing that's exactly `v1|<legacy>|0` (verified). Constructing it lets us
// (a) skip the Browse call for an item we verified recently and (b) refresh
// last_seen_at for a still-listed item without a lookup. A variation-item
// mismatch just means one wasted lookup - the upsert still dedups correctly.
const restId = (legacy) => `v1|${legacy}|0`;

export async function GET(request) {
  const startedAt = Date.now();
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pre-flight quota guard. A high floor on purpose: this is spare-capacity
  // supplementation. A failed meta-call (null) -> proceed.
  const rl = await getBrowseRateLimit();
  if (rl && rl.remaining != null && rl.remaining < RATE_LIMIT_FLOOR) {
    return Response.json({
      skipped: "ebay_rate_limited",
      floor: RATE_LIMIT_FLOOR,
      remaining: rl.remaining,
      reset: rl.reset,
    });
  }

  const db = supabaseAdmin();

  // 1. Pull the board.
  const { listings: feedItems, error: feedError } = await fetchFeed();
  if (feedError) {
    return Response.json({ skipped: "feed_unavailable", error: feedError });
  }
  if (feedItems.length === 0) {
    return Response.json({ feedItems: 0, note: "board parsed to zero items" });
  }

  // 2. Which of these do we already have a fresh row for? Skip the Browse
  //    call for those, just bump last_seen_at so the grace window is honest.
  const byMarketplace = new Map();
  for (const it of feedItems) {
    if (!MARKETPLACES[it.marketplace]) continue;
    if (!byMarketplace.has(it.marketplace)) byMarketplace.set(it.marketplace, []);
    byMarketplace.get(it.marketplace).push(it);
  }

  const recentCutoff = new Date(Date.now() - RECENT_VERIFY_HOURS * 3600 * 1000).toISOString();
  const seenListingIds = new Set();
  for (const [marketplace, items] of byMarketplace) {
    const candidateIds = items.map((it) => restId(it.ebayItemId));
    const { data: rows } = await db
      .from("deals")
      .select("listing_id, last_seen_at")
      .eq("source", "ebay")
      .eq("marketplace", marketplace)
      .in("listing_id", candidateIds);
    const stillListed = [];
    for (const r of rows ?? []) {
      if (r.last_seen_at > recentCutoff) seenListingIds.add(r.listing_id);
      stillListed.push(r.listing_id);
    }
    // Refresh last_seen_at for every still-listed item we're not re-verifying.
    if (stillListed.length > 0) {
      await db
        .from("deals")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("source", "ebay")
        .eq("marketplace", marketplace)
        .eq("is_active", true)
        .in("listing_id", stillListed);
    }
  }

  // 3. Genuinely-new items, capped.
  const newByMarketplace = new Map();
  let newCount = 0;
  for (const [marketplace, items] of byMarketplace) {
    const fresh = items.filter((it) => !seenListingIds.has(restId(it.ebayItemId)));
    if (fresh.length === 0) continue;
    newByMarketplace.set(marketplace, fresh);
    newCount += fresh.length;
  }
  // Apply the per-cycle ceiling proportionally across marketplaces.
  let budget = MAX_NEW_PER_CYCLE;
  const toVerify = new Map();
  for (const [marketplace, items] of newByMarketplace) {
    if (budget <= 0) break;
    const take = items.slice(0, budget);
    toVerify.set(marketplace, take);
    budget -= take.length;
  }

  // 4. Load the card_catalog match index + the watched-card id set, once.
  const rates = await getUsdRates();
  const catalogRows = [];
  for (let from = 0; ; from += CATALOG_PAGE) {
    const { data, error } = await db
      .from("card_catalog")
      .select('tcgplayer_id, name, "set", language, market_price, card_number')
      .range(from, from + CATALOG_PAGE - 1);
    if (error) return Response.json({ error: `card_catalog read: ${error.message}` }, { status: 500 });
    if (!data || data.length === 0) break;
    catalogRows.push(...data);
    if (data.length < CATALOG_PAGE) break;
  }
  const catalogIndex = new Map(); // token -> rows[]
  for (const row of catalogRows) {
    for (const token of coreTokens(row.name)) {
      if (!catalogIndex.has(token)) catalogIndex.set(token, []);
      catalogIndex.get(token).push(row);
    }
  }
  const { data: watchRows } = await db
    .from("watchlist")
    .select("id, justtcg_tcgplayer_id")
    .eq("active", true);
  const watchedId = new Map((watchRows ?? []).map((w) => [String(w.justtcg_tcgplayer_id), w.id]));

  // 5. Verify + run the pipeline.
  let browseCalls = 0;
  let verified = 0;
  const counts = { untrusted: 0, graded: 0, noMatch: 0, noPrice: 0, notDeal: 0, upserted: 0 };

  for (const [marketplace, items] of toVerify) {
    const feedByLegacy = new Map(items.map((it) => [String(it.ebayItemId), it]));
    const { listings, calls } = await getItemsByLegacyIds(
      items.map((it) => it.ebayItemId),
      marketplace
    );
    browseCalls += calls;
    verified += listings.length;

    for (const listing of listings) {
      const feedItem = feedByLegacy.get(String(legacyIdFromListingId(listing.listingId)));
      // One discovery-analytics event per VERIFIED listing (Phase 2, Step 9
      // acceptance-rate denominator). Best-effort - never blocks ingestion.
      const logFeed = (becameDeal, extra = {}) =>
        logDiscoveryEvent(db, {
          marketplace: listing.marketplace,
          listingId: listing.listingId,
          source: "external",
          searchType: "external",
          becameDeal,
          externalSourceUrl: feedItem?.sourceUrl ?? null,
          ...extra,
        });

      if (!qualifiesAsTradingCard(listing) || admitsProxyOrCounterfeit(listing, null)) {
        counts.untrusted++;
        logFeed(false);
        continue;
      }
      if (!isTrustworthyListing(listing)) {
        counts.untrusted++;
        logFeed(false);
        continue;
      }
      // Graded needs a grader-specific reference price (extra PPT + Browse
      // calls). The scanner already covers graded for watched cards; here we
      // skip it in v1 rather than price a graded card against a raw number.
      if (listing.isGraded) {
        counts.graded++;
        logFeed(false);
        continue;
      }

      const match = matchCatalog(listing, catalogIndex);
      if (!match) {
        counts.noMatch++;
        logFeed(false);
        continue;
      }

      // QUALITY GATE - same rules as the scanner. The legacy-id fetch
      // already returned the structured "Card Condition" descriptor and
      // the "Language" item-specific, so this costs no extra API call.
      // "Cheap != good deal": a Heavily-Played / Damaged card or a
      // wrong-language print must not become a deal against a normal
      // market reference.
      const condition = classifyListingCondition({
        title: listing.title,
        ebayCondition: listing.condition,
        descriptorContent: cardConditionDescriptorContent(listing.conditionDescriptors),
      });
      if (!conditionAllowsPromotion(condition, { requireExactRef: true })) {
        counts.badCondition = (counts.badCondition ?? 0) + 1;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id });
        continue;
      }
      const listingLang = classifyListingLanguage({
        title: listing.title,
        itemSpecificLanguage: languageAspect(listing.localizedAspects),
      });
      if (!languageCompatible(listingLang, match.language)) {
        counts.langMismatch = (counts.langMismatch ?? 0) + 1;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id });
        continue;
      }

      const marketPrice = Number(match.market_price);
      if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
        counts.noPrice++;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id });
        continue;
      }

      const totalLocal = listing.price + listing.shipping;
      const totalUsd = toUsd(totalLocal, listing.currency, rates);
      const discountPct = (marketPrice - totalUsd) / marketPrice;
      if (discountPct < DISCOUNT_THRESHOLD || totalUsd < marketPrice * SANITY_FLOOR_PCT) {
        counts.notDeal++;
        logFeed(false, { cardTcgplayerId: match.tcgplayer_id, discountPct });
        continue;
      }

      const watchlistId = watchedId.get(String(match.tcgplayer_id)) ?? null;
      const { error } = await db.from("deals").upsert(
        {
          watchlist_id: watchlistId,
          card_catalog_id: match.tcgplayer_id,
          discovery_source: "external",
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
          total_price: totalLocal,
          total_price_usd: totalUsd,
          currency: listing.currency ?? "USD",
          item_location_country: listing.itemLocationCountry ?? null,
          is_local:
            Boolean(listing.itemLocationCountry) &&
            listing.itemLocationCountry === listing.marketplace.replace("EBAY_", ""),
          market_price: marketPrice,
          discount_pct: discountPct,
          // The classified physical tier ("Near Mint" here - worse tiers
          // AND Unknown were rejected by conditionAllowsPromotion above),
          // never eBay's bare "Ungraded" grading-status string.
          condition,
          is_graded: false,
          seller_username: listing.sellerUsername,
          seller_feedback_pct: listing.sellerFeedbackPct,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "source,marketplace,listing_id" }
      );
      if (error) counts.upsertError = (counts.upsertError ?? 0) + 1;
      else {
        counts.upserted++;
        logFeed(true, { cardTcgplayerId: match.tcgplayer_id, discountPct });
      }
    }
  }

  // 6. Expire feed-ONLY deals that have been off the board past the grace
  //    window. Deals also seen by the scanner (discovery_source
  //    'scan+external') or linked to a watchlist row are reconciled by the
  //    scanner's own per-card expiry - leave those alone.
  const graceCutoff = new Date(Date.now() - FEED_ONLY_GRACE_DAYS * 86400 * 1000).toISOString();
  const { data: expired } = await db
    .from("deals")
    .update({ is_active: false })
    .eq("discovery_source", "external")
    .is("watchlist_id", null)
    .eq("is_active", true)
    .lt("last_seen_at", graceCutoff)
    .select("id");

  return Response.json({
    feedItems: feedItems.length,
    alreadyFresh: seenListingIds.size,
    newDiscovered: newCount,
    verifyBudget: MAX_NEW_PER_CYCLE,
    verified,
    browseCalls,
    ...counts,
    expiredFeedOnly: expired?.length ?? 0,
    rateLimitRemaining: rl?.remaining ?? null,
    tookMs: Date.now() - startedAt,
  });
}

// Same whole-word candidate-index approach the scanner's sweep uses, but
// over card_catalog instead of watchlist. First trustworthy whole-word
// name+set match wins.
function matchCatalog(listing, index) {
  const words = (listing.title.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 40);
  const candidates = new Map();
  for (const w of words) {
    for (const row of index.get(w) ?? []) {
      if (!candidates.has(row.tcgplayer_id)) candidates.set(row.tcgplayer_id, row);
    }
  }
  for (const row of candidates.values()) {
    if (admitsProxyOrCounterfeit(listing, { name: row.name, set: row.set })) continue;
    if (
      listingMatchesCard(listing, {
        name: row.name,
        set: row.set,
        language: row.language,
        card_number: row.card_number,
      })
    ) {
      return row;
    }
  }
  return null;
}
