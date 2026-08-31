const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1";
const EBAY_RATE_LIMIT_URL =
  "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=Browse";

// One retry, only for genuinely transient upstream failures (5xx / network
// blip). A 429 is NEVER retried - the daily Browse quota is spent and the
// right response is to stop, not to hammer it (see getBrowseRateLimit and
// the pre-flight guard in app/api/refresh-deals).
async function fetchWithRetry(url, options, { retries = 1, delayMs = 800 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (res.status >= 500 && res.status < 600 && attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    return res;
  }
}

// eBay's "Pokemon Individual Cards" category - keeps results to single
// cards instead of booster boxes, sealed product, lots, etc. Confirmed the
// same ID applies across the country sites below.
const POKEMON_SINGLES_CATEGORY_ID = "183454";

// The countries this site scans. Keep this list in sync with: the region
// picker (components/RegionControl.js REGIONS), the geo-IP default map
// (lib/geo.js COUNTRY_TO_MARKETPLACE), the currency map (lib/money.js
// MARKETPLACE_CURRENCY), and the marketplace-list copy on the homepage /
// how-it-works / methodology / about pages. FilterBar and SearchClient
// iterate this object directly, so they pick up a new entry automatically.
// currency is required by eBay whenever a price filter is used - see
// searchListings().
//
// EBAY_IT added 2026-08-31 (6th marketplace): real domestic seller depth
// (~19,400 domestic Charizard listings, > EBAY_CA, ~4x EBAY_DE), EUR
// already wired, and it fits the ~5,000/day Browse budget the same way
// the sealed-scan expansion did (~575 calls/day added). See
// docs/scanning-architecture.md and IMPLEMENTATION_STATUS.md. FR/ES/NL
// were held for the pending rate-limit increase; IE/AT/CH ruled out as
// too thin - see the marketplace research write-up.
const MARKETPLACES = {
  EBAY_US: { label: "United States", flag: "🇺🇸", currency: "USD" },
  EBAY_GB: { label: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  EBAY_AU: { label: "Australia", flag: "🇦🇺", currency: "AUD" },
  EBAY_CA: { label: "Canada", flag: "🇨🇦", currency: "CAD" },
  EBAY_DE: { label: "Germany", flag: "🇩🇪", currency: "EUR" },
  EBAY_IT: { label: "Italy", flag: "🇮🇹", currency: "EUR" },
};

let cachedToken = null;
let cachedTokenExpiresAt = 0;

// eBay uses OAuth client-credentials: exchange your app's client id/secret
// for a short-lived access token. We cache it in memory and only fetch a
// new one once the old one is close to expiring.
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  if (!res.ok) throw new Error(`eBay OAuth failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  cachedToken = body.access_token;
  // Refresh a couple minutes early rather than cutting it exactly at expiry.
  cachedTokenExpiresAt = Date.now() + (body.expires_in - 120) * 1000;
  return cachedToken;
}

function authHeaders(marketplaceId) {
  const headers = {
    "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
  };
  const campaignId = process.env.EBAY_CAMPAIGN_ID;
  if (campaignId) {
    headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${campaignId}`;
  }
  return headers;
}

// eBay's Browse API returns a small 225x225 thumbnail (the "s-l225.jpg"
// suffix) by default, which looks soft/blurry once displayed at real card-
// grid sizes. eBay's image CDN serves the exact same already-uploaded
// photo at several larger sizes from the identical URL (just swap the
// size suffix) - verified directly (200 OK, genuinely larger files) at
// s-l400/500/960/1600. Free - no extra API call, since this is a CDN URL
// rewrite, not a request to eBay's rate-limited API.
function upscaleEbayImage(url) {
  if (!url) return url;
  return url.replace(/\/s-l\d+\.jpg$/, "/s-l1600.jpg");
}

function mapItemSummary(item, marketplaceId) {
  const buyingOptions = item.buyingOptions ?? [];
  const isAuction = buyingOptions.includes("AUCTION") && !buyingOptions.includes("FIXED_PRICE");

  return {
    listingId: item.itemId,
    marketplace: marketplaceId,
    title: item.title,
    imageUrl: upscaleEbayImage(item.image?.imageUrl) ?? null,
    listingUrl: item.itemWebUrl,
    affiliateUrl: item.itemAffiliateWebUrl ?? item.itemWebUrl,
    listingType: isAuction ? "AUCTION" : "FIXED_PRICE",
    // For an auction, "price" from the summary is the current bid.
    price: Number((isAuction ? item.currentBidPrice?.value : item.price?.value) ?? 0),
    shipping: Number(item.shippingOptions?.[0]?.shippingCost?.value ?? 0),
    // Where the item physically is. Results are now filtered by
    // deliveryCountry (can it be shipped to the buyer's country) rather
    // than itemLocationCountry (is it already there), so this is what
    // tells a genuinely-local listing from an international one that
    // merely ships there - the site sorts local ones first.
    itemLocationCountry: item.itemLocation?.country ?? null,
    // eBay prices a listing in its marketplace's currency - captured so
    // the scanner can convert to USD before comparing to market price.
    currency:
      (isAuction ? item.currentBidPrice?.currency : item.price?.currency) ??
      MARKETPLACES[marketplaceId]?.currency ??
      "USD",
    bidCount: item.bidCount ?? null,
    auctionEndAt: item.itemEndDate ?? null,
    // A cheap, free-in-the-search-response signal for whether this is a
    // graded card - lets the caller decide which listings are worth the
    // extra getGradingDetails() call, without paying for all of them.
    isGraded: item.condition === "Graded",
    condition: item.condition ?? null,
    // Present only from a single-item / legacy-id fetch (never from
    // item_summary/search): the structured "Card Condition" descriptor is
    // the authoritative raw-wear signal, and localizedAspects carries the
    // "Language" item-specific. Passed straight through so the feed
    // ingestion can gate on the same signals the scanner's getItem check
    // uses, at no extra API cost.
    conditionDescriptors: item.conditionDescriptors ?? null,
    localizedAspects: item.localizedAspects ?? null,
    sellerUsername: item.seller?.username ?? null,
    sellerFeedbackPct: item.seller?.feedbackPercentage
      ? Number(item.seller.feedbackPercentage)
      : null,
    sellerFeedbackScore: item.seller?.feedbackScore ?? null,
  };
}

// Searches active listings (both Buy It Now and Auction) for a card in one
// marketplace. Returns { listings, total } - `total` is eBay's matching-
// item count (or null if the response didn't include it). Condition-level
// grading detail (grader/grade) is NOT included here - see
// getGradingDetails() below, which is deliberately a separate,
// selectively-called request since it costs one extra API call per
// listing.
// eBay's sort=price only orders by the FIXED_PRICE value - AUCTION items
// (sorted by currentBidPrice) are appended after every fixed-price result
// regardless of how low the current bid actually is. A low limit meant a
// genuinely underpriced auction could get cut off entirely by ordinary
// fixed-price listings ahead of it. Fetching more results per request
// costs nothing extra (eBay bills per request, not per result) and fixes
// this without doubling the number of searches.
// categoryId lets a caller search outside the singles category - used for
// sealed product (booster boxes, ETBs, ...), which lives in a different
// eBay category than individual cards. Rather than guess at that
// category's numeric id (unverified, and getting it wrong would silently
// return zero/irrelevant results), pass categoryId: null to search
// unscoped - a query like "Twilight Masquerade Booster Box" is specific
// enough on its own, and listingMatchesSealedProduct/
// isTrustworthySealedListing (lib/dealMatching.js) still do the real
// correctness filtering afterward either way.
async function searchListings(query, marketplaceId, { limit = 200, minPrice, categoryId = POKEMON_SINGLES_CATEGORY_ID } = {}) {
  const token = await getAccessToken();

  const url = new URL(`${EBAY_BROWSE_URL}/item_summary/search`);
  url.searchParams.set("q", query);
  if (categoryId) url.searchParams.set("category_ids", categoryId);
  // Popular card names also loosely match tons of near-$0 junk (digital
  // codes, proxy "fan art", $0.01 penny auctions). Sorting by price
  // ascending with no floor means that junk fills up the whole result
  // page and real listings never get fetched at all. A price floor keeps
  // the fetched page actually full of viable candidates.
  // A buyer picking "Australia" wants cards they can actually get, so
  // filter by deliveryCountry (eBay can ship it there) rather than
  // itemLocationCountry (it's physically there). itemLocationCountry
  // alone left the smaller markets (AU/CA/DE) nearly empty - their
  // domestic single-card supply is tiny. The scanner keeps each
  // listing's real location (mapItemSummary.itemLocationCountry) and the
  // site sorts genuinely-local listings first, so the "no shipping wait"
  // preference is still honoured - just no longer as a hard cutoff.
  const itemCountry = marketplaceId.replace("EBAY_", "");
  const filters = ["buyingOptions:{FIXED_PRICE|AUCTION}", `deliveryCountry:${itemCountry}`];
  // eBay silently ignores the price filter unless priceCurrency is also
  // present in the same filter list.
  if (minPrice > 0) {
    const currency = MARKETPLACES[marketplaceId]?.currency ?? "USD";
    filters.push(`price:[${minPrice.toFixed(2)}..]`, `priceCurrency:${currency}`);
  }
  url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("sort", "price");
  url.searchParams.set("limit", String(limit));

  const headers = { Authorization: `Bearer ${token}`, ...authHeaders(marketplaceId) };

  const res = await fetchWithRetry(url, { headers });
  if (!res.ok) throw new Error(`eBay search failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  const listings = (body.itemSummaries ?? []).map((item) => mapItemSummary(item, marketplaceId));
  // `total` is eBay's count of items matching the query. The scanners use
  // it to tell a genuine "nothing for sale" (total === 0) apart from a
  // degraded/malformed 200 response (field absent) - only the former is a
  // safe basis for expiring a card's existing deals. null when absent.
  return { listings, total: typeof body.total === "number" ? body.total : null };
}

// Sweeps the newest listings across the ENTIRE category (not one card at a
// time) - eBay's Browse API supports sort=newlyListed, which returns
// whatever was just posted regardless of name. Empirically, 200 results
// (one page) covers only ~4 minutes of real listing volume in this
// category (it's shared with other trading card games, not Pokemon-only -
// callers filter that out). Fetching several pages covers a wider window
// with overlap, so nothing posted between scans gets missed. Matching
// against the watchlist happens entirely client-side (see
// buildWatchlistIndex/matchListingToCards in refresh-deals) - this costs
// far fewer requests than searching per watchlist card, which is what
// makes frequent, all-country scanning affordable.
async function searchNewlyListed(marketplaceId, { pages = 5, limitPerPage = 200 } = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, ...authHeaders(marketplaceId) };

  const results = [];
  for (let page = 0; page < pages; page++) {
    const url = new URL(`${EBAY_BROWSE_URL}/item_summary/search`);
    url.searchParams.set("category_ids", POKEMON_SINGLES_CATEGORY_ID);
    const itemCountry = marketplaceId.replace("EBAY_", "");
    url.searchParams.set("filter", `buyingOptions:{FIXED_PRICE|AUCTION},deliveryCountry:${itemCountry}`);
    url.searchParams.set("sort", "newlyListed");
    url.searchParams.set("limit", String(limitPerPage));
    url.searchParams.set("offset", String(page * limitPerPage));

    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) throw new Error(`eBay newlyListed search failed: ${res.status} ${await res.text()}`);

    const body = await res.json();
    const items = body.itemSummaries ?? [];
    results.push(...items.map((item) => mapItemSummary(item, marketplaceId)));
    if (items.length < limitPerPage) break; // ran out of results early
  }
  return results;
}

// eBay returns the grading company's full name ("Professional Sports
// Authenticator (PSA)") rather than the short code PokemonPriceTracker
// expects ("PSA"). Matches the graders it documents supporting.
const GRADER_NAME_PATTERNS = [
  [/PSA/i, "PSA"],
  [/CGC/i, "CGC"],
  [/BGS|Beckett/i, "BGS"],
  [/SGC/i, "SGC"],
  [/TAG\b/i, "TAG"],
  [/ACE/i, "ACE"],
];

function normalizeGrader(rawName) {
  if (!rawName) return null;
  const match = GRADER_NAME_PATTERNS.find(([pattern]) => pattern.test(rawName));
  return match ? match[1] : rawName;
}

// Grader + grade (e.g. "PSA" + "10") aren't in search results - only the
// single-item endpoint returns them. Call this only for the handful of
// listings you actually plan to show as graded deals, not every result.
async function getGradingDetails(listingId, marketplaceId) {
  const token = await getAccessToken();

  const res = await fetchWithRetry(`${EBAY_BROWSE_URL}/item/${encodeURIComponent(listingId)}`, {
    headers: { Authorization: `Bearer ${token}`, ...authHeaders(marketplaceId) },
  });
  if (!res.ok) throw new Error(`eBay getItem failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  const descriptors = body.conditionDescriptors ?? [];

  const rawGrader = descriptors.find(
    (d) => d.name === "Professional Grader" || d.name === "Grader"
  )?.values?.[0]?.content;
  const grade = descriptors.find((d) => d.name === "Grade")?.values?.[0]?.content;

  return { grader: normalizeGrader(rawGrader), grade: grade ?? null };
}

// eBay's structured "Card Condition" descriptor -> the 5 TCG tiers the
// rest of the app uses (CONDITION_TIERS in lib/dealMatching.js). eBay's
// real content strings look like "Near mint or better", "Lightly played
// (Excellent)", "Moderately played (Very good)", "Heavily played (Poor)",
// "Damaged (Poor)". Order matters: "damaged" and "heavily" are checked
// before the bare grade words so "(Poor)" doesn't collapse both onto one
// tier. Anything unrecognised -> null (caller keeps its own assumption).
function cardConditionToTier(content) {
  const s = String(content || "").toLowerCase();
  if (!s) return null;
  if (/damaged/.test(s)) return "Damaged";
  if (/heav(?:y|ily)\s*play/.test(s)) return "Heavily Played";
  if (/moderate(?:ly)?\s*play|very\s*good/.test(s)) return "Moderately Played";
  if (/light(?:ly)?\s*play|excellent/.test(s)) return "Lightly Played";
  if (/near\s*mint|\bmint\b/.test(s)) return "Near Mint";
  return null;
}

// The raw "Card Condition" descriptor content string ("Heavily played
// (Poor)", ...) from a conditionDescriptors array (getItem / legacy-id
// shape), or null. Feed the result to classifyListingCondition.
function cardConditionDescriptorContent(conditionDescriptors) {
  const d = (conditionDescriptors ?? []).find((x) => /card condition/i.test(x?.name || ""));
  return d?.values?.[0]?.content ?? null;
}

// The "Language" item-specific value from a localizedAspects array, or null.
function languageAspect(localizedAspects) {
  const a = (localizedAspects ?? []).find((x) => /^language$/i.test(x?.name || ""));
  return a?.value ?? null;
}

// The real physical wear of a RAW card is only in the single-item
// endpoint's conditionDescriptors ("Card Condition"), never in search
// results (every raw single comes back as a flat "Ungraded" there). Like
// getGradingDetails, this costs one getItem call - only spend it on a
// listing whose apparent discount is big enough to be worth verifying.
// Returns a CONDITION_TIERS string, or null when eBay states no card
// condition (older listings often don't) - the caller then keeps its
// title-based guess.
async function getRawCardCondition(listingId, marketplaceId) {
  const token = await getAccessToken();

  const res = await fetchWithRetry(`${EBAY_BROWSE_URL}/item/${encodeURIComponent(listingId)}`, {
    headers: { Authorization: `Bearer ${token}`, ...authHeaders(marketplaceId) },
  });
  if (!res.ok) throw new Error(`eBay getItem failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  const descriptor = (body.conditionDescriptors ?? []).find((d) => /card condition/i.test(d.name || ""));
  return cardConditionToTier(descriptor?.values?.[0]?.content);
}

// Look up already-known eBay listings by their legacy (numeric) item id.
// Used by the external-discovery ingestion (app/api/ingest-feed), which
// gets a set of item ids from an upstream source and needs the real
// listing behind each one - the same { listings } shape searchListings
// returns, so it can go through the identical trust/match/score pipeline.
//
// One Browse call PER id: `getItems` (the 20-per-call multi-item endpoint)
// is a restricted Buy API and 403s "Access denied" on this keyset, so
// there is no batching. get_item_by_legacy_id it is. The affiliate campaign
// id is on the request (authHeaders), so each returned item already carries
// a correct per-marketplace itemAffiliateWebUrl - no separate wrap step.
// `concurrency` bounds how many of those calls are in flight at once.
async function getItemsByLegacyIds(legacyIds, marketplaceId, { concurrency = 4 } = {}) {
  if (!legacyIds || legacyIds.length === 0) return { listings: [], calls: 0 };
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, ...authHeaders(marketplaceId) };

  const queue = legacyIds.map(String);
  const listings = [];
  let calls = 0;

  async function worker() {
    let n;
    while ((n = queue.shift()) !== undefined) {
      calls++;
      try {
        const res = await fetchWithRetry(
          `${EBAY_BROWSE_URL}/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(n)}`,
          { headers }
        );
        if (!res.ok) continue; // ended / removed / not found - just drop it
        listings.push(mapItemSummary(await res.json(), marketplaceId));
      } catch {
        /* a single un-fetchable id is not a run failure */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return { listings, calls };
}

// eBay Partner Network's standard tracking query params - the same suffix
// eBay's own Browse API appends automatically to itemAffiliateWebUrl when
// affiliateCampaignId is set on a request (see authHeaders above). Not
// every outbound eBay link on the site comes from a fresh Browse API call
// though - "recent sold listings" come from PokemonPriceTracker's own
// data instead, and a plain eBay URL from there earns nothing on a click.
// This appends the identical tracking suffix manually so those links are
// covered too. PokemonPriceTracker's sold-comp URLs are consistently
// plain ebay.com (US) links regardless of which marketplace the matched
// deal itself is on, so the US rotation ID used here is correct even for
// a GB/AU/CA/DE deal's sold comps.
function wrapEbayAffiliateUrl(url) {
  const campaignId = process.env.EBAY_CAMPAIGN_ID;
  if (!campaignId || !url) return url;

  try {
    const wrapped = new URL(url);
    wrapped.searchParams.set("mkevt", "1");
    wrapped.searchParams.set("mkcid", "1");
    wrapped.searchParams.set("mkrid", "711-53200-19255-0");
    wrapped.searchParams.set("campid", campaignId);
    wrapped.searchParams.set("customid", "");
    wrapped.searchParams.set("toolid", "10049");
    return wrapped.toString();
  } catch {
    return url;
  }
}

// The consumer-facing eBay domain per scanned marketplace. The singles
// category id (POKEMON_SINGLES_CATEGORY_ID) is the same across all of
// them (verified). "" / unknown -> ebay.com.
const EBAY_SEARCH_DOMAIN = {
  EBAY_US: "www.ebay.com",
  EBAY_GB: "www.ebay.co.uk",
  EBAY_AU: "www.ebay.com.au",
  EBAY_CA: "www.ebay.ca",
  EBAY_DE: "www.ebay.de",
  EBAY_IT: "www.ebay.it",
};

// A tracked eBay search link for "explore this specific card/variant"
// links (the catalogue "Find on eBay" CTA, a graded-tier tile, ...) -
// these invite a visitor to go look rather than point at one listing, so
// a category-scoped search is what makes sense. `marketplace` (e.g.
// "EBAY_AU") sends the visitor to the right eBay site - an AU-mode
// shopper should land on ebay.com.au, not a generic US search. Omitted /
// "" / unknown -> ebay.com (the safe default and the crawler-visible SSR
// value before the client knows the region).
function buildEbaySearchLink(query, marketplace) {
  const domain = EBAY_SEARCH_DOMAIN[marketplace] ?? "www.ebay.com";
  const url = new URL(`https://${domain}/sch/i.html`);
  url.searchParams.set("_nkw", query);
  url.searchParams.set("_sacat", POKEMON_SINGLES_CATEGORY_ID);
  return wrapEbayAffiliateUrl(url.toString());
}

// Reads the app's current Browse API daily quota from eBay's Developer
// Analytics API (a different resource, with its own generous limit - one
// call here is cheap). Returns { limit, remaining, reset } for the
// `buy.browse` bucket, or null if the check itself fails (in which case
// the caller should proceed rather than block on a failed meta-call).
// The scan crons call this once up front and skip the run when remaining
// is below a tier-specific floor, instead of firing hundreds of requests
// that all 429 once the ~5,000/day budget is spent.
async function getBrowseRateLimit() {
  try {
    const token = await getAccessToken();
    const res = await fetch(EBAY_RATE_LIMIT_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    for (const group of body.rateLimits ?? []) {
      for (const resource of group.resources ?? []) {
        if (resource.name !== "buy.browse") continue;
        const rate = resource.rates?.[0];
        if (!rate) return null;
        return {
          limit: rate.limit ?? null,
          remaining: rate.remaining ?? null,
          reset: rate.reset ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  MARKETPLACES,
  searchListings,
  searchNewlyListed,
  getItemsByLegacyIds,
  getGradingDetails,
  getRawCardCondition,
  cardConditionToTier,
  cardConditionDescriptorContent,
  languageAspect,
  EBAY_SEARCH_DOMAIN,
  getBrowseRateLimit,
  wrapEbayAffiliateUrl,
  buildEbaySearchLink,
  upscaleEbayImage,
};
