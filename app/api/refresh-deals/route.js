import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MARKETPLACES,
  searchListings,
  searchNewlyListed,
  getGradingDetails,
  getRawListingDetail,
  getBrowseRateLimit,
} from "@/lib/ebay";
import { getConditionPrices, getGradedPrice } from "@/lib/pokemonPriceTracker";
import { getUsdRates, toUsd } from "@/lib/fx";
import { logDiscoveryEvent } from "@/lib/discoveryLog";
import {
  SANITY_FLOOR_PCT,
  coreTokens,
  qualifiesAsTradingCard,
  listingMatchesCard,
  isTrustworthyListing,
  isHighRiskBelowMarket,
  selectConditionPrice,
} from "@/lib/dealMatching";
import {
  classifyListingCondition,
  conditionAllowsPromotion,
  classifyListingLanguage,
  languageCompatible,
  isHighValueVintage,
} from "@/lib/dealQuality";

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

// The extended tier covers ~8,530 cards - too many to scan in one
// country in one day. Splitting it into EXTENDED_CHUNKS stable pieces,
// one scanned per country-day, keeps genuine coverage of the whole tier
// in every country without busting eBay's daily request cap - sweep
// mode (see runSweep below) handles fast new-deal discovery cheaply, so
// this budget only needs to cover confirming/expiring existing deals,
// not speed.
//
// Bumped from 3 to 6 after a real, live outage: every country's sweep
// started failing with a 429 ("request limit reached") for 10+ hours
// straight, verified live via direct eBay calls and Vercel logs, not
// just a brief blip - the eBay Developer dashboard doesn't expose the
// actual quota number to check against, so this can't be tuned to an
// exact figure. 3 chunks was itself a prior bump for the same reason
// (see git history) and evidently isn't enough margin anymore - 6 roughly
// halves this tier's single biggest daily spike (~2,843 -> ~1,422 calls
// in the one country-chunk that runs each day), at the cost of a slower
// full-rotation cadence (~30 days instead of ~15 - see vercel.json's
// now-30 extended cron entries, one per country-chunk-day). Hash-based
// on watchlist id rather than a stored column - deterministic and needs
// no migration; a card's chunk only changes if its id changes.
//
// Reduced 6 -> 5 on 2026-08-31 when EBAY_IT was added as the 6th
// marketplace. The extended tier runs one country-chunk per day and the
// full rotation is packed into 30 daily cron slots (days 1-30). 6
// marketplaces x 5 chunks = 30 slots keeps the whole rotation inside one
// month exactly as 5 x 6 did; the per-country full-rotation cadence
// (~30 days) is unchanged. Each daily chunk is ~20% larger (~4,900
// English extended rows / 5 instead of / 6 ≈ ~980 vs ~815 cards) - still
// well inside the pre-flight guard's 1,500 extended floor. `chunkOf` is
// pure hash-of-id % totalChunks, so re-chunking just reshuffles which
// day a card is confirmed on - no migration, no stored column to update.
const EXTENDED_CHUNKS = 5;

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
// The listing's total in its own currency, and in USD (market prices are
// USD, so the discount has to be computed against the USD figure). `rates`
// is a USD-base FX map from lib/fx.js.
function pricedListing(listing, marketPriceUsd, rates) {
  const totalLocal = listing.price + listing.shipping;
  const totalUsd = toUsd(totalLocal, listing.currency, rates);
  return { totalLocal, totalUsd, discountPct: (marketPriceUsd - totalUsd) / marketPriceUsd };
}

// A would-be raw deal priced against Near Mint whose apparent discount is
// at least this big gets one eBay getItem call to check its real
// structured "Card Condition" descriptor before we publish it - a large
// share of these turn out to be correctly-cheap played/damaged cards, not
// deals (the fake-discount the seller never claimed in the title - e.g.
// deal 24391, a "Heavily played (Poor)" card at 38% "off" NM). Lowered
// 0.45 -> 0.25 after that class of miss; the reorder in the scan loops
// means this only ever fires for a listing that already cleared the
// discount + sanity-floor gates, so the call volume is bounded by the
// number of would-be deals, not the number of candidates. Below this a
// missing signal is still taken at its word (Near Mint) - a 10-25%-under
// NM card is perfectly plausible.
const SUSPICIOUS_RAW_DISCOUNT_PCT = 0.25;

// getItem lookups are the scarce resource (shared ~5,000/day Browse
// budget - see EXTENDED_CHUNKS and the pre-flight guard in GET). Cap the
// raw-condition checks per scan unit the same way GRADED_LOOKUP_CAP does.
// Listings are processed cheapest-first, so the budget lands on the most
// suspicious ones; any suspicious listing left unverified when the budget
// runs out is HELD (not published) that cycle rather than shown on a
// guess.
const RAW_CONDITION_LOOKUP_PER_CARD = 3;
const RAW_CONDITION_LOOKUP_CAP_SWEEP = 12;

// Decide the condition to actually price a raw listing at. `budget` is a
// mutable { left } counter shared across one scan unit; `cache` (optional)
// memoises the getItem result per listing id so a listing that matches
// several watchlist rows only costs one call. Returns either { condition }
// to use, or { hold: true } meaning "can't safely price this now - skip".
async function resolveRawCondition({
  listing,
  titleCondition,
  provisionalDiscountPct,
  listingUsd,
  lpPrice,
  budget,
  cache,
  highValueVintage = false,
}) {
  // Seller positively stated a wear tier in the title - trusted as-is.
  if (titleCondition !== "Near Mint" && titleCondition !== "Unknown") {
    return { condition: titleCondition };
  }

  const suspicious =
    provisionalDiscountPct >= SUSPICIOUS_RAW_DISCOUNT_PCT ||
    (lpPrice != null && listingUsd != null && listingUsd <= lpPrice * 1.1) ||
    titleCondition === "Unknown" ||
    highValueVintage;

  // Non-suspicious modest discount, non-vintage, and the title at least
  // implied Near Mint - the long-standing plausible default holds.
  if (!suspicious) return { condition: "Near Mint" };

  const cached = cache?.get(listing.listingId);
  if (cached) return cached;

  // Suspicious but no budget to verify - don't publish a maybe-fake.
  if (budget.left <= 0) return { hold: true };

  budget.left -= 1;
  let result;
  try {
    // One getItem call - also carries the listing-trust signals
    // (photo count / returns policy / sold state) that only exist here.
    const detail = await getRawListingDetail(listing.listingId, listing.marketplace);
    const extra = {
      imageCount: detail.imageCount ?? null,
      returnsAccepted: detail.returnsAccepted,
      soldOut: detail.soldOut === true,
    };
    if (detail.tier) {
      result = { condition: detail.tier, verified: true, ...extra };
    } else if (highValueVintage || provisionalDiscountPct >= SUSPICIOUS_RAW_DISCOUNT_PCT) {
      // eBay states no "Card Condition" and this is a high-value-vintage /
      // steep-discount listing - we could NOT establish the physical
      // condition, so it is Unknown, not Near Mint. It won't be published
      // as a verified deal (conditionAllowsPromotion rejects Unknown).
      result = { condition: "Unknown", verified: true, ...extra };
    } else {
      // Modest discount, non-vintage, eBay silent - the Near Mint
      // assumption is still reasonable here.
      result = { condition: "Near Mint", verified: true, ...extra };
    }
  } catch {
    result = { hold: true };
  }
  cache?.set(listing.listingId, result);
  return result;
}

function dealRow({ watchlistId, listing, totalPrice, totalPriceUsd, marketPrice, discountPct, priceChange24hr, grading, condition }) {
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
    total_price_usd: totalPriceUsd ?? totalPrice,
    currency: listing.currency ?? "USD",
    item_location_country: listing.itemLocationCountry ?? null,
    // Genuinely local (not just an international seller who ships here) -
    // the country grids sort these first.
    is_local:
      Boolean(listing.itemLocationCountry) &&
      listing.itemLocationCountry === listing.marketplace.replace("EBAY_", ""),
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

// Phase-1 listing-trust signals, written as a SEPARATE best-effort update
// so the core deal upsert never fails if the columns aren't migrated yet
// (seller_feedback_score / image_count / returns_accepted - see
// scripts/sql/2026-08-31_deal_trust_signals.sql). seller_feedback_score
// is in every search result; image_count / returns_accepted come only
// from the getItem resolveRawCondition already makes, so they stay null
// on a row that never needed that call.
let _trustColsMissingLogged = false;
async function enrichDealTrustSignals(db, listing, { imageCount = null, returnsAccepted = null } = {}) {
  const patch = {};
  if (listing.sellerFeedbackScore != null) patch.seller_feedback_score = listing.sellerFeedbackScore;
  if (imageCount != null) patch.image_count = imageCount;
  if (returnsAccepted != null) patch.returns_accepted = returnsAccepted;
  if (Object.keys(patch).length === 0) return;
  try {
    const { error } = await db
      .from("deals")
      .update(patch)
      .match({ source: "ebay", marketplace: listing.marketplace, listing_id: listing.listingId });
    if (error && !_trustColsMissingLogged) {
      _trustColsMissingLogged = true;
      console.warn(`deal trust-signal columns not writable yet (${error.message}) - run the migration`);
    }
  } catch (e) {
    if (!_trustColsMissingLogged) {
      _trustColsMissingLogged = true;
      console.warn(`deal trust-signal enrichment skipped: ${e.message}`);
    }
  }
}

// Scans one watchlist card in one country. Raw listings are priced against
// PokemonPriceTracker's raw market price. At most the single cheapest
// graded listing gets the extra getGradingDetails() + graded-price lookup,
// to keep both eBay's per-item budget and PokemonPriceTracker's metered
// credits bounded per scan cycle.
async function scanCardInMarketplace(row, marketplaceId, marketData, db, discountThreshold, rates, searchType = "priority") {
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
  const { listings, total } = await searchListings(query, marketplaceId, {
    minPrice: lowestKnownPrice * SANITY_FLOOR_PCT,
  });

  const rawListings = listings.filter((l) => !l.isGraded);
  const cheapestGraded = listings.find((l) => l.isGraded) ?? null;

  let dealsFound = 0;

  // STAGE 5 (reference-price sanity). If this card has a healthy supply of
  // genuine, matched, trustworthy raw listings and EVERY ONE of them sits
  // far below our market reference, it is the REFERENCE that is wrong, not
  // the whole market - publishing any of them as an "N% below market" deal
  // would advertise a fiction. Verified on the Phase-1 ~141-listing audit:
  // Pikachu & Zekrom GX SM168 promo referenced at $225 with 16 independent
  // asks at $58-85; Clefairy (Shadowless) at $199 with every ask $50-73;
  // Mew (EX Legend Maker) at $209 with every ask $56-73. Costs no extra
  // API call - these listings are already in hand.
  const REF_SANITY_MIN_LISTINGS = 5;
  const REF_SANITY_MAX_RATIO = 0.55;
  const refCandidates = rawListings.filter(
    (l) =>
      qualifiesAsTradingCard(l) &&
      isTrustworthyListing(l) &&
      listingMatchesCard(l, row) &&
      Number.isFinite(l.price)
  );
  const referenceUnverified =
    marketData.fallbackPrice > 0 &&
    refCandidates.length >= REF_SANITY_MIN_LISTINGS &&
    refCandidates.every((l) => {
      const usd = toUsd((l.price ?? 0) + (l.shipping ?? 0), l.currency, rates);
      return usd > 0 && usd <= marketData.fallbackPrice * REF_SANITY_MAX_RATIO;
    });
  if (referenceUnverified) {
    console.warn(
      `reference:price_unverified - ${row.name} / ${row.set} (${marketplaceId}): ` +
        `${refCandidates.length} matched listings all <= ${REF_SANITY_MAX_RATIO * 100}% of $${marketData.fallbackPrice.toFixed(2)} - skipping deal publication this cycle`
    );
  }

  const tryUpsert = async (row_) => {
    const { error } = await db
      .from("deals")
      .upsert(row_, { onConflict: "source,marketplace,listing_id" });
    if (error) console.error(`Failed to upsert deal ${row_.listing_id}:`, error.message);
    else {
      dealsFound++;
      // Best-effort discovery-analytics event (Phase 2). Never awaited on
      // the critical path in a way that can fail the scan.
      logDiscoveryEvent(db, {
        marketplace: marketplaceId,
        listingId: row_.listing_id,
        source: "scan",
        searchType,
        cardTcgplayerId: row.justtcg_tcgplayer_id ?? null,
        becameDeal: true,
        discountPct: row_.discount_pct,
      });
    }
  };

  const rawCondBudget = { left: RAW_CONDITION_LOOKUP_PER_CARD };

  for (const listing of referenceUnverified ? [] : rawListings) {
    // STAGE 0: is it actually a trading card? (keychain / sticker / coin /
    // "Extended Art Case" display piece / fan-made proxy that names a card)
    if (!qualifiesAsTradingCard(listing)) continue;
    if (!isTrustworthyListing(listing)) continue;
    if (!listingMatchesCard(listing, row)) continue;

    // LANGUAGE gate: marketplace doesn't imply card language. A listing
    // that plainly states a language other than this catalogue row's is a
    // different, differently-priced print - never a deal on this one.
    // (listingMatchesCard already blocks the JP<->EN case; this covers
    // KR/CN/DE/FR/ES/IT/PT too, and Japanese rows matching a stated
    // non-Japanese language.)
    if (!languageCompatible(classifyListingLanguage({ title: listing.title }), row.language)) continue;

    // CONDITION: price THIS listing against its own real wear, not a flat
    // Near Mint assumption. classifyListingCondition folds the broadened
    // damage vocabulary (altered / pin holes / water damage / inked /
    // "(Poor)" / ...) and eBay's flat condition string on top of
    // dealMatching's existing title parser.
    // NEVER coerce Unknown -> Near Mint. A missing physical condition is
    // not proof of Near Mint; resolveRawCondition below tries to establish
    // it from eBay's structured data, and if it can't the listing is
    // "Unknown" and is not published as a verified deal.
    let condition = classifyListingCondition({
      title: listing.title,
      ebayCondition: listing.condition,
    });
    // A positively-detected worse-than-LP tier can't be a green deal;
    // "Unknown" / "Near Mint" fall through to structured verification.
    if (condition !== "Unknown" && !conditionAllowsPromotion(condition)) continue;
    const priceForTier = condition === "Unknown" ? "Near Mint" : condition;
    let marketPrice = selectConditionPrice(marketData.byCondition, priceForTier, marketData.fallbackPrice);
    if (marketPrice == null) continue;

    let priced = pricedListing(listing, marketPrice, rates);

    // Cheap disqualifiers FIRST, so the (metered) structured-condition
    // getItem call below only ever spends on a listing that would
    // otherwise be published as a deal.
    if (priced.discountPct < discountThreshold) continue;
    if (priced.totalUsd < marketPrice * SANITY_FLOOR_PCT) continue;

    const highValueVintage = isHighValueVintage({ set: row.set, marketPrice });

    // Would-be deal -> establish real physical condition from eBay's
    // structured "Card Condition" descriptor. resolved.hold = couldn't
    // verify this cycle, don't publish a maybe-fake.
    const resolved = await resolveRawCondition({
      listing,
      titleCondition: condition,
      provisionalDiscountPct: priced.discountPct,
      listingUsd: priced.totalUsd,
      lpPrice: marketData.byCondition?.["Lightly Played"] ?? null,
      budget: rawCondBudget,
      highValueVintage,
    });
    if (resolved.hold) continue;
    // eBay now reports the item sold / out of stock - not a live deal.
    if (resolved.soldOut) continue;
    // Unknown / played after verification -> discovered, NOT a verified
    // deal (conditionAllowsPromotion rejects Unknown and MP/HP/Damaged).
    if (!conditionAllowsPromotion(resolved.condition)) continue;

    // STAGE 3: multi-signal listing-trust. Now that the getItem gave us
    // photo count + returns policy, a steep discount whose listing also
    // has thin seller history and a title-echo description is held back
    // (discovered, not promoted) rather than published as a bargain.
    if (
      isHighRiskBelowMarket({
        sellerFeedbackScore: listing.sellerFeedbackScore ?? null,
        imageCount: resolved.imageCount,
        returnsAccepted: resolved.returnsAccepted,
        discountPct: priced.discountPct,
      })
    ) {
      continue;
    }

    if (resolved.condition !== condition) {
      condition = resolved.condition;
      marketPrice = selectConditionPrice(marketData.byCondition, condition, marketData.fallbackPrice);
      if (marketPrice == null) continue;
      priced = pricedListing(listing, marketPrice, rates);
      if (priced.discountPct < discountThreshold) continue;
      if (priced.totalUsd < marketPrice * SANITY_FLOOR_PCT) continue;
    }

    await tryUpsert(
      dealRow({
        watchlistId: row.id,
        listing,
        totalPrice: priced.totalLocal,
        totalPriceUsd: priced.totalUsd,
        marketPrice,
        discountPct: priced.discountPct,
        priceChange24hr: marketData.priceChange24hr,
        condition,
      })
    );
    await enrichDealTrustSignals(db, listing, {
      imageCount: resolved.imageCount ?? null,
      returnsAccepted: resolved.returnsAccepted ?? null,
    });
  }

  // (The graded branch is deliberately NOT gated on referenceUnverified -
  // it is priced against grade-specific sold comps, not the raw NM
  // reference this flag is about.)
  if (
    cheapestGraded &&
    qualifiesAsTradingCard(cheapestGraded) &&
    isTrustworthyListing(cheapestGraded) &&
    listingMatchesCard(cheapestGraded, row)
  ) {
    try {
      const grading = await getGradingDetails(cheapestGraded.listingId, marketplaceId);
      const gradedPrice = grading.grader
        ? await getGradedPrice(row.justtcg_tcgplayer_id, grading.grader, grading.grade, row.language)
        : null;

      if (gradedPrice) {
        const { totalLocal, totalUsd, discountPct } = pricedListing(cheapestGraded, gradedPrice.price, rates);

        if (discountPct >= discountThreshold && totalUsd >= gradedPrice.price * SANITY_FLOOR_PCT) {
          await tryUpsert(
            dealRow({
              watchlistId: row.id,
              listing: cheapestGraded,
              totalPrice: totalLocal,
              totalPriceUsd: totalUsd,
              marketPrice: gradedPrice.price,
              discountPct,
              grading,
            })
          );
          await enrichDealTrustSignals(db, cheapestGraded);
        }
      }
    } catch (err) {
      console.error(`Graded lookup failed for ${row.name} (${marketplaceId}):`, err.message);
    }
  }

  // Retire anything for this card+country that was active before but isn't
  // in this scan's results anymore (sold, ended, no longer underpriced).
  //
  // Only reconcile when this scan is a trustworthy view of the card's
  // current listings: we matched at least one listing, OR eBay returned a
  // real result set (a `total` count - even total:0 "nothing for sale").
  // An empty response with no `total` is a degraded/malformed eBay reply,
  // not a real "sold out" - expiring on it would wipe the cached deals the
  // site falls back to when eBay is unavailable. Leave them be.
  // A listing missing from one scan isn't retired on the spot - it could
  // be a transient eBay hiccup, and a per-card scan for the non-US
  // markets only comes round every few days, so an instant expire would
  // visibly drain those sections between runs. Retire only what no scan
  // has seen for the whole grace window; anything upserted this run (or a
  // recent one) carries a fresh last_seen_at and is safe. This replaces
  // the old "not in (listing ids seen this run)" filter, which expired
  // immediately.
  const graceDays = marketplaceId === "EBAY_US" ? 2 : 5;
  const graceCutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();

  const canReconcile = listings.length > 0 || total !== null;

  if (canReconcile) {
    await db
      .from("deals")
      .update({ is_active: false })
      .eq("watchlist_id", row.id)
      .eq("marketplace", marketplaceId)
      .eq("is_active", true)
      .lt("last_seen_at", graceCutoff);
  }

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
async function runSweep(marketplaceId, watchlistRows, db, discountThreshold, pages, rates) {
  const index = buildWatchlistIndex(watchlistRows);
  const listings = await searchNewlyListed(marketplaceId, { pages });

  const marketPriceCache = new Map();
  async function cachedConditionPrices(row) {
    const key = `${row.justtcg_tcgplayer_id}|${row.language}`;
    if (marketPriceCache.has(key)) return marketPriceCache.get(key);
    let marketData = null;
    try {
      const raw = await getConditionPrices(row.justtcg_tcgplayer_id, row.language);
      if (raw) {
        // Same aggregate-price distrust guard as scanOneCard: an
        // aggregate-only price that disagrees sharply with the daily
        // catalog-sync value is where graded / wrong-printing prices leak
        // in, so drop it rather than compute a fake discount.
        const hasConditionData = Object.keys(raw.byCondition).length > 0;
        const lastKnown = Number(row.last_known_price);
        const untrusted =
          !hasConditionData &&
          raw.fallbackPrice != null &&
          Number.isFinite(lastKnown) &&
          lastKnown > 0 &&
          Math.abs(raw.fallbackPrice - lastKnown) / lastKnown > 0.4;
        if (!untrusted) {
          marketData = { byCondition: raw.byCondition, fallbackPrice: raw.fallbackPrice, priceChange24hr: null };
        }
      }
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
  // unusually large number of graded matches show up in one sweep. This is
  // the single biggest swing in the daily Browse budget: ~128 sweeps/day
  // (US every 15 min + the four other countries every 3h) * this cap is
  // the exposure. A normal sweep finds 0-2 graded deals, so 6 covers the
  // real case while keeping the worst case (~768/day) well inside the
  // ~5,000/day budget alongside the pre-flight quota guard in GET().
  const GRADED_LOOKUP_CAP = 6;
  const rawCondBudget = { left: RAW_CONDITION_LOOKUP_CAP_SWEEP };
  const rawCondCache = new Map();
  const errors = [];

  const tryUpsert = async (row_, cardId) => {
    const { error } = await db.from("deals").upsert(row_, { onConflict: "source,marketplace,listing_id" });
    if (error) console.error(`Failed to upsert deal ${row_.listing_id}:`, error.message);
    else {
      dealsFound++;
      logDiscoveryEvent(db, {
        marketplace: marketplaceId,
        listingId: row_.listing_id,
        source: "scan",
        searchType: "sweep",
        cardTcgplayerId: cardId ?? null,
        becameDeal: true,
        discountPct: row_.discount_pct,
      });
    }
  };

  for (const listing of listings) {
    if (!qualifiesAsTradingCard(listing)) continue;
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

          const { totalLocal, totalUsd, discountPct } = pricedListing(listing, gradedPrice.price, rates);
          if (discountPct < discountThreshold) continue;
          if (totalUsd < gradedPrice.price * SANITY_FLOOR_PCT) continue;

          await tryUpsert(
            dealRow({
              watchlistId: row.id,
              listing,
              totalPrice: totalLocal,
              totalPriceUsd: totalUsd,
              marketPrice: gradedPrice.price,
              discountPct,
              grading,
            }),
            row.justtcg_tcgplayer_id
          );
        } catch (err) {
          errors.push(`Graded lookup failed for ${row.name} (${marketplaceId}): ${err.message}`);
        }
        continue;
      }

      if (!languageCompatible(classifyListingLanguage({ title: listing.title }), row.language)) continue;

      const marketData = await cachedConditionPrices(row);
      if (!marketData) continue;

      // Never coerce Unknown -> Near Mint (see the priority loop).
      let condition = classifyListingCondition({
        title: listing.title,
        ebayCondition: listing.condition,
      });
      if (condition !== "Unknown" && !conditionAllowsPromotion(condition)) continue;
      const priceForTier = condition === "Unknown" ? "Near Mint" : condition;
      let marketPrice = selectConditionPrice(marketData.byCondition, priceForTier, marketData.fallbackPrice);
      if (marketPrice == null) continue;

      let priced = pricedListing(listing, marketPrice, rates);

      // Cheap disqualifiers first - the getItem verification below only
      // spends on would-be-published deals.
      if (priced.discountPct < discountThreshold) continue;
      if (priced.totalUsd < marketPrice * SANITY_FLOOR_PCT) continue;

      const resolved = await resolveRawCondition({
        listing,
        titleCondition: condition,
        provisionalDiscountPct: priced.discountPct,
        listingUsd: priced.totalUsd,
        lpPrice: marketData.byCondition?.["Lightly Played"] ?? null,
        budget: rawCondBudget,
        cache: rawCondCache,
        highValueVintage: isHighValueVintage({ set: row.set, marketPrice }),
      });
      if (resolved.hold) continue;
      if (!conditionAllowsPromotion(resolved.condition)) continue;
      if (resolved.condition !== condition) {
        condition = resolved.condition;
        marketPrice = selectConditionPrice(marketData.byCondition, condition, marketData.fallbackPrice);
        if (marketPrice == null) continue;
        priced = pricedListing(listing, marketPrice, rates);
        if (priced.discountPct < discountThreshold) continue;
        if (priced.totalUsd < marketPrice * SANITY_FLOOR_PCT) continue;
      }

      await tryUpsert(
        dealRow({
          watchlistId: row.id,
          listing,
          totalPrice: priced.totalLocal,
          totalPriceUsd: priced.totalUsd,
          marketPrice,
          discountPct: priced.discountPct,
          priceChange24hr: marketData.priceChange24hr,
          condition,
        }),
        row.justtcg_tcgplayer_id
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
  const rates = await getUsdRates();

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

  // Pre-flight Browse API quota check (see lib/ebay.js's getBrowseRateLimit
  // and docs/ebay-rate-limits.md). Once the ~5,000/day budget is spent
  // every Browse request 429s until it resets at ~07:00 UTC, so bail
  // before firing a whole run of doomed calls. Tier-aware floors reserve
  // headroom for the cheap, user-facing sweep: the extended tier (just
  // confirm/expire duty) yields first, the sweep last. A failed meta-call
  // returns null -> proceed rather than block on it.
  const RATE_LIMIT_FLOORS = { sweep: 250, priority: 600, extended: 1500, default: 250 };
  const floorKey =
    mode === "sweep" ? "sweep" : tier === "extended" ? "extended" : tier === "priority" ? "priority" : "default";
  const rl = await getBrowseRateLimit();
  // Surfaced in every response below so the real daily Browse ceiling is
  // observable (the eBay dashboard doesn't expose the number) - lets the
  // cron cadence be tuned to headroom instead of guessed at.
  const rateLimitRemaining = rl?.remaining ?? null;
  if (rl && rl.remaining != null && rl.remaining < RATE_LIMIT_FLOORS[floorKey]) {
    return Response.json({
      skipped: "ebay_rate_limited",
      floorKey,
      floor: RATE_LIMIT_FLOORS[floorKey],
      remaining: rl.remaining,
      limit: rl.limit,
      reset: rl.reset,
    });
  }

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

    // A sweep never expires/deletes anything (see runSweep), so an eBay
    // failure mid-sweep can only mean "found nothing this run" - report it
    // as a 200 rather than letting the throw surface as a cron 500.
    try {
      const result = await runSweep(marketplaceId, allActiveRows ?? [], db, discountThreshold, pages, rates);
      return Response.json({ mode: "sweep", marketplace: marketplaceId, ...result, rateLimitRemaining, scannedAt: new Date().toISOString() });
    } catch (err) {
      return Response.json({
        mode: "sweep",
        marketplace: marketplaceId,
        skipped: "ebay_error",
        error: err.message,
        scannedAt: new Date().toISOString(),
      });
    }
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
  // - Priority (~21 hand-picked cards, all 6 countries, every 6h via
  //   vercel.json): confirms/expires their existing deals.
  // - Extended (~4,900 English auto-synced cards): one country at a time,
  //   split into EXTENDED_CHUNKS pieces per country, rotating through all
  //   6 countries over ~30 days - also just confirm/expiry duty now, since
  //   sweep already finds new ones fast. The GET() pre-flight guard skips
  //   this run entirely on days the daily budget is already tight.
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

      // When PokemonPriceTracker only has a single aggregate price for a
      // card (no per-condition breakdown), that number is where graded
      // comps and wrong-printing prices leak in. If it also disagrees
      // sharply with last_known_price (the daily catalog-sync value, a
      // steadier source), don't trust it - verified live: a Shadowless
      // Venusaur scanned with market $501 while last_known was $919.
      const hasConditionData = Object.keys(raw.byCondition).length > 0;
      const lastKnown = Number(row.last_known_price);
      if (
        !hasConditionData &&
        raw.fallbackPrice != null &&
        Number.isFinite(lastKnown) &&
        lastKnown > 0 &&
        Math.abs(raw.fallbackPrice - lastKnown) / lastKnown > 0.4
      ) {
        errors.push(
          `Untrusted market price for "${row.name}" (id ${row.id}): live ${raw.fallbackPrice} vs last_known ${lastKnown}`
        );
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
          dealsFound += await scanCardInMarketplace(
            row,
            marketplaceId,
            marketData,
            db,
            discountThreshold,
            rates,
            tier || "manual"
          );
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
    rateLimitRemaining,
    scannedAt: new Date().toISOString(),
  });
}
