const zlib = require("zlib");
const { parse: parseCsv } = require("csv-parse/sync");

const BASE_URL = "https://www.pokemonpricetracker.com/api/v2";

function apiKey() {
  const key = process.env.POKEMONPRICETRACKER_API_KEY;
  if (!key) throw new Error("Missing POKEMONPRICETRACKER_API_KEY");
  return key;
}

async function fetchPPT(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!res.ok)
    throw new Error(`PokemonPriceTracker request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Used once per card, when adding it to the watchlist: turns a plain name
// into the stable tcgplayerId every other lookup here uses.
async function searchCard(name) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("search", name);
  // Without this, search= defaults to limit=50 (billed as 50 credits) even
  // though we only ever use the top match.
  url.searchParams.set("limit", "1");
  const body = await fetchPPT(url);
  const card = body.data?.[0];
  if (!card) throw new Error(`No PokemonPriceTracker results for "${name}"`);
  return card;
}

// User-facing search: returns a page of candidate cards (unlike
// searchCard, which is limit=1 and only ever used to resolve one specific
// card while seeding the watchlist). A name like "Charizard" matches
// dozens of different prints/sets across the whole catalog - offset lets
// the caller page through all of them, not just the first 20. Costs
// `limit` credits per page (PPT bills search= by the limit requested).
async function searchCards(query, { limit = 20, offset = 0 } = {}) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  if (offset) url.searchParams.set("offset", String(offset));
  const body = await fetchPPT(url);
  return {
    results: body.data ?? [],
    total: body.metadata?.total ?? null,
    hasMore: body.metadata?.hasMore ?? false,
  };
}

// Current raw (ungraded) market price for a specific condition. Cards with
// only one printing get a flat prices.conditions[condition] entry; cards
// with multiple printings (e.g. "1st Edition Holofoil" vs "Unlimited
// Holofoil") don't - fall back to the overall market price for those,
// same as the catalog-sync job does when first classifying the card.
async function getRawPrice(tcgplayerId, condition = "Near Mint") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  const body = await fetchPPT(url);
  const price = body.data?.prices?.conditions?.[condition]?.price ?? body.data?.prices?.market;
  if (price == null) return null;
  return { price, lastUpdated: body.data?.prices?.lastUpdated };
}

// On-demand only (a deal detail page a visitor actually opened) - never
// called from the bulk scheduled scan.
async function getRawPriceHistory(tcgplayerId, condition = "Near Mint", days = 90) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("includeHistory", "true");
  url.searchParams.set("days", String(days));
  const body = await fetchPPT(url);
  const points = body.data?.priceHistory?.conditions?.[condition]?.history ?? [];
  return points.map((p) => ({ t: new Date(p.date).getTime(), p: p.market }));
}

// Every Pokemon set tracked - fits in one call (218 sets total, well under
// any reasonable page size).
async function listSets() {
  const url = new URL(`${BASE_URL}/sets`);
  url.searchParams.set("limit", "500");
  const body = await fetchPPT(url);
  return body.data ?? [];
}

// Every card in one set, in a single request - no pagination needed
// (unlike JustTCG, which required paging through 100-card pages).
async function listSetCards(setId) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("setId", setId);
  url.searchParams.set("fetchAllInSet", "true");
  const body = await fetchPPT(url);
  return body.data ?? [];
}

// A daily-refreshed CSV snapshot of every card's pricing across every
// printing - costs ZERO API credits (vs. ~29,000 credits and 218 requests
// to crawl the catalog set-by-set via listSetCards). Limited to 2
// downloads/day though, so this should only be called from the daily
// catalog-sync job, never anything more frequent.
//
// NOTE: written against the documented CSV schema but not yet verified
// against a real downloaded file (ran out of daily download quota while
// building this) - re-check column names/types against a real file
// before trusting this in production.
async function downloadPrintingsExport() {
  const url = new URL(`${BASE_URL}/export`);
  url.searchParams.set("type", "printings");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } });
  if (!res.ok)
    throw new Error(`PokemonPriceTracker export failed: ${res.status} ${await res.text()}`);

  const gzipped = Buffer.from(await res.arrayBuffer());
  const csv = zlib.gunzipSync(gzipped).toString("utf-8");
  return parseCsv(csv, { columns: true, skip_empty_lines: true });
}

// e.g. ("PSA", "10") -> "psa10", ("CGC", "9.5") -> "cgc9_5" - matches the
// key format PokemonPriceTracker uses in its salesByGrade response.
function gradeKey(grader, grade) {
  if (!grader || !grade) return null;
  return `${grader.toLowerCase()}${String(grade).replace(".", "_")}`;
}

// Real individual eBay sold listings (Business tier only), not just
// aggregated stats - {title, price, soldDate, url, listingType, ...}.
function normalizeSoldListings(rawListings) {
  return (rawListings ?? []).map((l) => ({
    listingId: l.listingId,
    title: l.title,
    price: l.price,
    soldDate: l.soldDate,
    url: l.url,
    listingType: l.listingType,
    shippingCost: l.shippingCost ?? 0,
  }));
}

// Looks up real sold-comp pricing for a specific grader+grade of a card.
async function getGradedPrice(tcgplayerId, grader, grade) {
  const key = gradeKey(grader, grade);
  if (!key) return null;

  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("includeEbay", "true");

  const body = await fetchPPT(url);
  const gradeData = body.data?.ebay?.salesByGrade?.[key];
  if (!gradeData) return null;

  const price = gradeData.smartMarketPrice?.price ?? gradeData.medianPrice ?? null;
  if (price == null) return null;

  const historyByDate = body.data?.ebay?.priceHistory?.[key] ?? {};
  const history = Object.entries(historyByDate)
    .map(([date, day]) => ({ t: new Date(date).getTime(), p: day.average }))
    .sort((a, b) => a.t - b.t);

  return {
    price,
    saleCount: gradeData.count ?? null,
    lastSaleDate: gradeData.lastSaleDate ?? null,
    history,
    recentSales: normalizeSoldListings(body.data?.ebay?.soldListings?.[key]),
  };
}

// Real recent eBay sold listings for a RAW (ungraded) card - "ungraded" is
// a normal key in salesByGrade/soldListings alongside psa10, cgc9_5, etc.
// On-demand only (deal detail page), same as getRawPriceHistory.
async function getRawSoldComps(tcgplayerId) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("includeEbay", "true");

  const body = await fetchPPT(url);
  const ungraded = body.data?.ebay?.salesByGrade?.ungraded;
  if (!ungraded) return { recentSales: [] };

  return {
    saleCount: ungraded.count ?? null,
    lastSaleDate: ungraded.lastSaleDate ?? null,
    recentSales: normalizeSoldListings(body.data?.ebay?.soldListings?.ungraded),
  };
}

const GRADE_LABELS = {
  psa1: "PSA 1",
  psa2: "PSA 2",
  psa3: "PSA 3",
  psa4: "PSA 4",
  psa5: "PSA 5",
  psa6: "PSA 6",
  psa7: "PSA 7",
  psa8: "PSA 8",
  psa9: "PSA 9",
  psa10: "PSA 10",
  cgc7: "CGC 7",
  cgc7_5: "CGC 7.5",
  cgc8: "CGC 8",
  cgc8_5: "CGC 8.5",
  cgc9: "CGC 9",
  cgc9_5: "CGC 9.5",
  cgc10: "CGC 10",
  bgs8: "BGS 8",
  bgs8_5: "BGS 8.5",
  bgs9: "BGS 9",
  bgs9_5: "BGS 9.5",
  bgs10: "BGS 10",
  sgc9: "SGC 9",
  sgc9_5: "SGC 9.5",
  sgc10: "SGC 10",
};

function gradeLabel(key) {
  return GRADE_LABELS[key] ?? key.toUpperCase();
}

// The API returns conditions in an arbitrary (roughly alphabetical) order -
// best-to-worst reads far more naturally for a "condition breakdown" list.
const CONDITION_ORDER = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

function parseEbayHistory(historyByDate) {
  return Object.entries(historyByDate ?? {})
    .map(([date, day]) => ({ t: new Date(date).getTime(), p: day.average }))
    .sort((a, b) => a.t - b.t);
}

// The full "price analysis" view for a card: raw price + history, every
// graded tier that has real sales, condition-by-condition raw pricing, and
// overall sales velocity - everything in ONE request (includeEbay +
// includeHistory together return both raw and graded data at once, for a
// flat 3 credits total regardless of how many grades come back). Built for
// an on-demand "click a deal to see its full price picture" page, not the
// bulk scheduled scan.
//
// primaryGrader/primaryGrade (optional) mark which specific variant the
// calling deal actually is, so the page can pull its individual sold
// listings (soldListings are per-variant and would otherwise bloat the
// response if fetched for every grade).
async function getFullPriceAnalysis(tcgplayerId, { primaryGrader, primaryGrade } = {}) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("includeEbay", "true");
  url.searchParams.set("includeHistory", "true");

  const body = await fetchPPT(url);
  const d = body.data;
  if (!d) return null;

  const rawHistory = (d.priceHistory?.conditions?.["Near Mint"]?.history ?? [])
    .map((p) => ({ t: new Date(p.date).getTime(), p: p.market }))
    .sort((a, b) => a.t - b.t);

  const salesByGrade = d.ebay?.salesByGrade ?? {};
  const priceHistoryByGrade = d.ebay?.priceHistory ?? {};
  const outlierByGrade = d.ebay?.smartPriceOutlierByGrade ?? {};

  // Only grades with at least one real recorded sale - an empty tile with
  // a flat/absent chart would just be clutter, not useful information.
  const graded = Object.entries(salesByGrade)
    .filter(([key, stats]) => key !== "ungraded" && stats?.count > 0)
    .map(([key, stats]) => ({
      key,
      label: gradeLabel(key),
      currentPrice: stats.smartMarketPrice?.price ?? stats.medianPrice ?? null,
      minPrice: stats.minPrice ?? null,
      maxPrice: stats.maxPrice ?? null,
      saleCount: stats.count ?? 0,
      lastSaleDate: stats.lastSaleDate ?? null,
      trend: stats.marketTrend ?? null,
      isLowConfidence: Boolean(outlierByGrade[key]) || stats.smartMarketPrice?.confidence === "low",
      history: parseEbayHistory(priceHistoryByGrade[key]),
    }))
    // Highest-value grades first - matches how collectors actually think
    // about grade tiers, and puts the most interesting data up top.
    .sort((a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0));

  const primaryKey = gradeKey(primaryGrader, primaryGrade);
  const primarySoldListings = normalizeSoldListings(
    d.ebay?.soldListings?.[primaryKey ?? "ungraded"]
  );

  const rawPrices = rawHistory.map((p) => p.p);

  return {
    raw: {
      currentPrice: d.prices?.conditions?.["Near Mint"]?.price ?? d.prices?.market ?? null,
      minPrice: rawPrices.length ? Math.min(...rawPrices) : null,
      maxPrice: rawPrices.length ? Math.max(...rawPrices) : null,
      history: rawHistory,
    },
    graded,
    salesVelocity: d.ebay?.salesVelocity ?? null,
    conditionBreakdown: Object.entries(d.prices?.conditions ?? {})
      .map(([condition, info]) => ({ condition, price: info.price }))
      .filter((c) => c.price != null)
      .sort((a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition)),
    // "raw" if no grader/grade was passed, else the PokemonPriceTracker-
    // style key (e.g. "psa10") - lets the caller highlight/pull the exact
    // variant a specific deal is without re-deriving the grade-key mapping
    // itself.
    primaryKey: primaryKey ?? "raw",
    primaryRecentSales: primarySoldListings,
  };
}

module.exports = {
  searchCard,
  searchCards,
  getRawPrice,
  getRawPriceHistory,
  getRawSoldComps,
  listSets,
  listSetCards,
  downloadPrintingsExport,
  getGradedPrice,
  getFullPriceAnalysis,
};
