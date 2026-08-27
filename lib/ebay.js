const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1";

// eBay's "Pokémon Individual Cards" category - keeps results to single
// cards instead of booster boxes, sealed product, lots, etc. Confirmed the
// same ID applies across the country sites below.
const POKEMON_SINGLES_CATEGORY_ID = "183454";

// The countries this site scans. Keep this list in sync with the frontend
// filter dropdown in app/page.js. currency is required by eBay whenever a
// price filter is used - see searchListings().
const MARKETPLACES = {
  EBAY_US: { label: "United States", flag: "🇺🇸", currency: "USD" },
  EBAY_GB: { label: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
  EBAY_AU: { label: "Australia", flag: "🇦🇺", currency: "AUD" },
  EBAY_CA: { label: "Canada", flag: "🇨🇦", currency: "CAD" },
  EBAY_DE: { label: "Germany", flag: "🇩🇪", currency: "EUR" },
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
    bidCount: item.bidCount ?? null,
    auctionEndAt: item.itemEndDate ?? null,
    // A cheap, free-in-the-search-response signal for whether this is a
    // graded card - lets the caller decide which listings are worth the
    // extra getGradingDetails() call, without paying for all of them.
    isGraded: item.condition === "Graded",
    condition: item.condition ?? null,
    sellerUsername: item.seller?.username ?? null,
    sellerFeedbackPct: item.seller?.feedbackPercentage
      ? Number(item.seller.feedbackPercentage)
      : null,
    sellerFeedbackScore: item.seller?.feedbackScore ?? null,
  };
}

// Searches active listings (both Buy It Now and Auction) for a card in one
// marketplace. Condition-level grading detail (grader/grade) is NOT
// included here - see getGradingDetails() below, which is deliberately a
// separate, selectively-called request since it costs one extra API call
// per listing.
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
async function searchListings(query, marketplaceId, { limit = 60, minPrice, categoryId = POKEMON_SINGLES_CATEGORY_ID } = {}) {
  const token = await getAccessToken();

  const url = new URL(`${EBAY_BROWSE_URL}/item_summary/search`);
  url.searchParams.set("q", query);
  if (categoryId) url.searchParams.set("category_ids", categoryId);
  // Popular card names also loosely match tons of near-$0 junk (digital
  // codes, proxy "fan art", $0.01 penny auctions). Sorting by price
  // ascending with no floor means that junk fills up the whole result
  // page and real listings never get fetched at all. A price floor keeps
  // the fetched page actually full of viable candidates.
  // Browsing the Australian eBay site does not mean the item is actually
  // in Australia - most results are still US/international sellers who
  // simply ship there. Buyers picking a country want faster local
  // shipping, so restrict results to items actually located in that
  // country rather than just listed on that country's site.
  const itemCountry = marketplaceId.replace("EBAY_", "");
  const filters = ["buyingOptions:{FIXED_PRICE|AUCTION}", `itemLocationCountry:${itemCountry}`];
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

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`eBay search failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  return (body.itemSummaries ?? []).map((item) => mapItemSummary(item, marketplaceId));
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
    url.searchParams.set("filter", `buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:${itemCountry}`);
    url.searchParams.set("sort", "newlyListed");
    url.searchParams.set("limit", String(limitPerPage));
    url.searchParams.set("offset", String(page * limitPerPage));

    const res = await fetch(url, { headers });
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

  const res = await fetch(`${EBAY_BROWSE_URL}/item/${encodeURIComponent(listingId)}`, {
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

// A tracked eBay search link for "explore this specific variant" links
// (e.g. a graded-tier tile on the price-analysis grid) - these aren't
// pointing at one specific listing the way a deal card is, just inviting
// a visitor to go look, so a category-scoped search is what makes sense.
function buildEbaySearchLink(query) {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("_sacat", POKEMON_SINGLES_CATEGORY_ID);
  return wrapEbayAffiliateUrl(url.toString());
}

module.exports = {
  MARKETPLACES,
  searchListings,
  searchNewlyListed,
  getGradingDetails,
  wrapEbayAffiliateUrl,
  buildEbaySearchLink,
  upscaleEbayImage,
};
