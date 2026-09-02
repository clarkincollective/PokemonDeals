const zlib = require("zlib");
const { parse: parseCsv } = require("csv-parse/sync");
const { wrapEbayAffiliateUrl } = require("./ebay");
const { rawSaleMatchesPrinting, rawSalePriceIsPlausible } = require("./dealMatching");

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

// Bulk-sync variant: on a per-minute 429 (PPT bills a limit=N request as
// ~N/10 "minute calls" against a small window, so even a modest crawl
// trips it), wait out the window and retry rather than fail the row.
// NEVER use this on a user-facing request path - it can block for ~30s.
async function fetchPPTPaced(url, { maxRetries = 6, retryAny429 = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey()}` } });
    if (res.ok) return res.json();
    const text = await res.text();
    const isMinute429 = res.status === 429 && /per.?minute|minute (?:rate )?limit|500 calls\/min/i.test(text);
    const retriable = res.status === 429 && (isMinute429 || retryAny429);
    if (!retriable || attempt >= maxRetries) {
      throw new Error(`PokemonPriceTracker request failed: ${res.status} ${text}`);
    }
    let waitMs = 8000;
    const m = text.match(/"retryAfter":\s*(\d+)/);
    if (m) waitMs = (Number(m[1]) + 2) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 65000)));
  }
}

// Used once per card, when adding it to the watchlist: turns a plain name
// into the stable tcgplayerId every other lookup here uses.
async function searchCard(name, language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("search", name);
  url.searchParams.set("language", language);
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
async function searchCards(query, { limit = 20, offset = 0, language = "english" } = {}) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("language", language);
  if (offset) url.searchParams.set("offset", String(offset));
  const body = await fetchPPT(url);
  return {
    results: body.data ?? [],
    total: body.metadata?.total ?? null,
    hasMore: body.metadata?.hasMore ?? false,
  };
}

// PokemonPriceTracker emits a repdigit placeholder (999, 9999, 99999,
// and the .99 variants) as prices.market for a card it has no real
// pricing for - verified live: "Rayquaza ex" (EX Deoxys) came back
// market = 999, and a A$497 listing was stored as "64% below" that fake
// number. Treat those exact values as "no data" so the scanner skips the
// card rather than inventing a discount against them.
const SENTINEL_PRICES = new Set([999, 999.99, 9999, 9999.99, 99999, 99999.99]);
function isSentinelPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && SENTINEL_PRICES.has(n);
}

// prices.market is whichever printing PokemonPriceTracker treats as
// "primary" - for any WOTC-era card with a real 1st Edition print (Base
// Set through the four Neo sets, 1999-2002), that's usually the 1st
// Edition variant, worth many times an Unlimited print of the same card.
// Verified against a real live deal: "Entei (6)" (Neo Revelation)
// reported prices.market = $500 (1st Edition Holofoil's price), while the
// actual Unlimited Holofoil print - what the eBay listing actually was,
// no "1st Edition" stamp - was $190.12. Nothing upstream of this (the
// watchlist row, the eBay search query, listingMatchesCard) tracks or
// requires "1st Edition" specifically, so a listing matching a card by
// name+set could be either printing - trusting prices.market as-is
// mispriced the card as if every listing were the rare, far more
// valuable 1st Edition, inflating the discount shown (65% "off" a price
// that wasn't the real card's price at all). The only safe default is
// the non-1st-Edition printing, since that's what an unlabeled listing
// overwhelmingly is; a genuinely 1st Edition listing isn't specially
// detected by this codebase and will still be undervalued by this
// (edge case, not a false-positive risk - it just means the discount for
// that specific listing would look smaller than it really is, never
// bigger).
function pickMarketPrice(prices, condition = "Near Mint") {
  if (!prices) return null;
  if (isSentinelPrice(prices.market)) return null;
  if (!/1st edition/i.test(prices.primaryPrinting ?? "")) return prices.market ?? null;

  const nonFirstEditionVariants = Object.keys(prices.variants ?? {}).filter(
    (name) => !/1st edition/i.test(name)
  );
  // A genuinely 1st-Edition-only card (no Unlimited print ever existed) -
  // there's no better number to use than the real 1st Edition price.
  if (nonFirstEditionVariants.length === 0) return prices.market ?? null;

  let best = null;
  for (const variantName of nonFirstEditionVariants) {
    const entries = Object.entries(prices.variants[variantName] ?? {});
    const [, match] = entries.find(([key]) => key.toLowerCase().includes(condition.toLowerCase())) ?? entries[0] ?? [];
    const price = match?.price;
    if (price != null && (best == null || price < best)) best = price;
  }

  return best ?? prices.market ?? null;
}

// Sets where TCGplayer splits EVERY product into a "1st Edition" and an
// "Unlimited" printing (holo AND non-holo - "Blaine's Charmeleon" is
// "1st Edition" / "Unlimited", "Blaine's Charizard" is "1st Edition
// Holofoil" / "Unlimited Holofoil"). The printings /export CSV that the
// daily sync builds card_catalog from does NOT reliably carry the
// per-printing split, so its aggregate is the 1st-Edition figure. Our
// unqualified /cards/<slug> identity represents Unlimited by convention,
// so market_price for these products is re-derived from /cards
// (prices.variants -> pickMarketPrice, the SAME helper the card page
// uses) in a targeted second pass. Base Set 2 (Unlimited only) and
// Legendary Collection (no 1st Edition) are single-printing - not here.
const WOTC_DUAL_PRINTING_SETS = new Set([
  "Base Set",
  "Base Set (Shadowless)",
  "Jungle",
  "Fossil",
  "Team Rocket",
  "Gym Heroes",
  "Gym Challenge",
  "Neo Genesis",
  "Neo Discovery",
  "Neo Revelation",
  "Neo Destiny",
]);

// The Unlimited (or sole) Near Mint market price for one product, from a
// single plain /cards call - pickMarketPrice reads prices.variants and,
// when primaryPrinting is 1st Edition, returns the cheapest non-1st-Ed
// variant's Near Mint. null when there's no usable, non-sentinel figure.
async function getCatalogNmPrice(tcgplayerId, language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
  // Paced + retry any 429: a ~1,000-row second pass hits PPT's 500/min
  // window and its burst limit. Bulk/backfill only, never a request path.
  const body = await fetchPPTPaced(url, { retryAny429: true, maxRetries: 8 });
  const prices = body.data?.prices;
  if (!prices) return null;
  const p = Number(pickMarketPrice(prices, "Near Mint"));
  return Number.isFinite(p) && p > 0 && !isSentinelPrice(p) ? p : null;
}

// An impossible condition ladder is the tell that a market figure is
// stale/garbage: a Lightly/Moderately/Heavily-Played price should never be
// materially ABOVE Near Mint. Verified live on Skyridge Charizard 146/144
// - PPT had prices.market = null and a lone "Near Mint Holofoil $249.95"
// (real value ~$2-5k) contradicted by a "$2400" Lightly Played entry. A
// >20% inversion => don't trust the NM number. `ladder` = { "Near Mint":
// n, "Lightly Played": n, ... } (any subset).
function ladderInverted(ladder, nm) {
  if (nm == null) return false;
  for (const key of ["Lightly Played", "Moderately Played", "Heavily Played", "Damaged"]) {
    const v = Number(ladder?.[key]);
    if (Number.isFinite(v) && v > nm * 1.2) return true;
  }
  return false;
}

// The printings export CSV gives a card several rows when it has multiple
// printings (e.g. "1st Edition Holofoil" + "Unlimited Holofoil"), all
// under ONE tcgPlayerId, ONE product page and ONE image. For a browse-page
// catalogue entry whose name/URL carry NO edition qualifier (because
// TCGplayer's product name doesn't either), the price a viewer expects is
// the UNLIMITED (or the sole) printing - an unlabeled card/listing is
// overwhelmingly that, and it's the same choice pickMarketPrice makes for
// the scanner. `entries` = [{ printing, nm, lp, mp, hp, dmg }] in CSV
// order. Returns null (-> "Market price unavailable") rather than a
// figure contradicted by its own condition ladder - a missing price beats
// a false one.
function pickCatalogMarketPrice(entries) {
  const priced = (entries ?? []).filter((e) => {
    const n = Number(e?.nm ?? e?.price);
    return Number.isFinite(n) && n > 0 && !isSentinelPrice(n);
  });
  if (priced.length === 0) return null;
  const chosen = priced.find((e) => !/1st\s*edition/i.test(e.printing ?? "")) ?? priced[0];
  const nm = Number(chosen.nm ?? chosen.price);
  if (
    ladderInverted(
      { "Lightly Played": chosen.lp, "Moderately Played": chosen.mp, "Heavily Played": chosen.hp, Damaged: chosen.dmg },
      nm
    )
  ) {
    return null;
  }
  return nm;
}

// The Near Mint raw price to headline on a card page, from PPT's full
// `prices` object (the includeEbay/includeHistory shape, where
// prices.conditions IS populated - with the PRIMARY printing's per-
// condition figures). Three corrections over "just read
// prices.conditions['Near Mint'].price":
//   - 1st-Edition primary printing -> defer to pickMarketPrice (Unlimited).
//   - Near Mint figure contradicted by its own ladder (a played price
//     materially above it) -> null, "Market price unavailable". A missing
//     price beats a false one. (Skyridge Charizard 146/144: NM $249.95 vs
//     LP $2400 -> unavailable.)
//   - sentinel repdigits -> null.
function catalogRawMarketPrice(prices) {
  if (!prices) return null;
  if (/1st\s*edition/i.test(prices.primaryPrinting ?? "")) return pickMarketPrice(prices, "Near Mint");

  const c = prices.conditions ?? {};
  const nm = Number(c["Near Mint"]?.price);
  if (Number.isFinite(nm) && nm > 0 && !isSentinelPrice(nm)) {
    const inverted = ladderInverted(
      {
        "Lightly Played": c["Lightly Played"]?.price,
        "Moderately Played": c["Moderately Played"]?.price,
        "Heavily Played": c["Heavily Played"]?.price,
        Damaged: c["Damaged"]?.price,
      },
      nm
    );
    return inverted ? null : nm;
  }

  const m = Number(prices.market);
  return Number.isFinite(m) && m > 0 && !isSentinelPrice(m) ? m : null;
}

// Current raw (ungraded) market price for a specific condition. Cards with
// only one printing get a flat prices.conditions[condition] entry; cards
// with multiple printings don't - pickMarketPrice (above) is what
// actually resolves the right one for those.
// language MUST match the catalog the tcgplayerId actually belongs to -
// PokemonPriceTracker scopes every lookup to one catalog (english by
// default) and returns an empty result, not an error, for an id from the
// other one (verified: a Japanese card's real id returned nothing until
// language=japanese was added).
async function getRawPrice(tcgplayerId, condition = "Near Mint", language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
  const body = await fetchPPT(url);
  const direct = body.data?.prices?.conditions?.[condition]?.price;
  const price = (direct != null && !isSentinelPrice(direct) ? direct : null) ?? pickMarketPrice(body.data?.prices, condition);
  if (price == null || isSentinelPrice(price)) return null;
  return { price, lastUpdated: body.data?.prices?.lastUpdated };
}

const CONDITION_TIERS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

// Pulls every real condition->price pair out of prices.variants for the
// correct (non-1st-Edition) printing - real PokemonPriceTracker data is
// often sparse (a card may only have 1-2 conditions actually priced, not
// all 5), so callers must treat a missing tier as "no data for that
// condition," not as $0 or an error.
function conditionPricesFromVariants(prices) {
  if (!prices) return {};
  const isFirstEdition = /1st edition/i.test(prices.primaryPrinting ?? "");
  const byCondition = {};

  for (const [variantName, entries] of Object.entries(prices.variants ?? {})) {
    if (isFirstEdition && /1st edition/i.test(variantName)) continue;
    for (const [key, entry] of Object.entries(entries ?? {})) {
      if (entry?.price == null || isSentinelPrice(entry.price)) continue;
      const tier = CONDITION_TIERS.find((c) => key.toLowerCase().includes(c.toLowerCase()));
      if (!tier) continue;
      if (byCondition[tier] == null || entry.price < byCondition[tier]) byCondition[tier] = entry.price;
    }
  }

  return byCondition;
}

// One fetch, every real condition tier's price for a card (verified data:
// Dark Gengar had a single priced condition per printing, not a full
// Near Mint through Damaged grid - this is normal, not a data gap to work
// around). fallbackPrice (via pickMarketPrice) is what a caller should use
// when the specific condition it needs isn't in byCondition at all - the
// same "assume Near Mint-ish" behavior every scan already used before
// per-listing condition detection existed, just now only a fallback
// instead of the only option.
async function getConditionPrices(tcgplayerId, language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
  const body = await fetchPPT(url);
  const prices = body.data?.prices;
  if (!prices) return null;

  return {
    byCondition: conditionPricesFromVariants(prices),
    fallbackPrice: pickMarketPrice(prices, "Near Mint"),
    lastUpdated: prices.lastUpdated,
  };
}

// On-demand only (a deal detail page a visitor actually opened) - never
// called from the bulk scheduled scan.
async function getRawPriceHistory(tcgplayerId, condition = "Near Mint", days = 90, language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
  url.searchParams.set("includeHistory", "true");
  url.searchParams.set("days", String(days));
  const body = await fetchPPT(url);
  const points = body.data?.priceHistory?.conditions?.[condition]?.history ?? [];
  return points.map((p) => ({ t: new Date(p.date).getTime(), p: p.market }));
}

// Every Pokemon set tracked in one catalog - fits in one call (218 English
// sets / 442 Japanese sets, both well under any reasonable page size).
async function listSets(language = "english") {
  const url = new URL(`${BASE_URL}/sets`);
  url.searchParams.set("limit", "500");
  url.searchParams.set("language", language);
  const body = await fetchPPT(url);
  return body.data ?? [];
}

// Every card in one set, in a single request - no pagination needed
// (unlike JustTCG, which required paging through 100-card pages).
async function listSetCards(setId, language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("setId", setId);
  url.searchParams.set("fetchAllInSet", "true");
  url.searchParams.set("language", language);
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
// url is affiliate-wrapped here (not from eBay's own Browse API this
// time - see wrapEbayAffiliateUrl) so every caller gets a tracked link
// for free, rather than each page needing to remember to wrap it.
function normalizeSoldListings(rawListings) {
  return (rawListings ?? []).map((l) => ({
    listingId: l.listingId,
    title: l.title,
    price: l.price,
    soldDate: l.soldDate,
    url: wrapEbayAffiliateUrl(l.url),
    listingType: l.listingType,
    shippingCost: l.shippingCost ?? 0,
  }));
}

// Looks up real sold-comp pricing for a specific grader+grade of a card.
async function getGradedPrice(tcgplayerId, grader, grade, language = "english") {
  const key = gradeKey(grader, grade);
  if (!key) return null;

  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
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
async function getRawSoldComps(tcgplayerId, language = "english") {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
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
  if (GRADE_LABELS[key]) return GRADE_LABELS[key];
  // Half grades and the smaller graders (ACE/TAG/SGC + their .5 tiers)
  // aren't all in GRADE_LABELS - turn "psa8_5" -> "PSA 8.5", "tag9" ->
  // "TAG 9" rather than fall through to a raw "PSA8_5".
  const m = String(key).match(/^([a-z]+)(\d+)(?:_(\d+))?$/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
  return String(key).toUpperCase();
}

// The API returns conditions in an arbitrary (roughly alphabetical) order -
// best-to-worst reads far more naturally for a "condition breakdown" list.
const CONDITION_ORDER = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

function parseEbayHistory(historyByDate) {
  return Object.entries(historyByDate ?? {})
    .map(([date, day]) => ({ t: new Date(date).getTime(), p: day.average }))
    .sort((a, b) => a.t - b.t);
}

// A graded tier is only surfaced when its OWN sample is coherent. The
// provider's per-grade eBay sold buckets are keyed on card name +
// collector number, which the reprint families (WOTC 1st Edition /
// Unlimited, Celebrations Classic Collection, XY Evolutions / EX-era SR
// reprints) all SHARE - so a bucket routinely blends printings worth
// wildly different amounts. Live: "Here Comes Team Rocket! (15)" (raw
// $27) returned BGS 9 $181 / BGS 9.5 $150 / TAG 8.5 $107 / CGC 9 $89
// (28 sales) / PSA 9 $85 (157 sales, min $0.99 max $226) while its
// PSA 10 sat at $59.50 - impossible in a clean market (nothing outsells
// a PSA 10 of the same card; a single grade can't span 200x low-to-high).
//
// Only tiers the provider ALREADY flags low-confidence are judged - a
// confident tier with a steep ladder on a genuinely scarce card (the
// real EX Team Rocket Returns SR, a 1st-Edition Dark Charizard) is left
// entirely alone. A LOW-CONFIDENCE tier is dropped when:
//   - its own low->high spread exceeds GRADED_SPREAD_CEILING (one grade
//     of one card cannot span that much), OR
//   - it is priced above the PSA 10 / PSA 9 / PSA 8 anchor by more than
//     GRADED_ANCHOR_CEILING (nothing outsells the top standard grade of
//     the same card), OR
//   - with no such anchor, it exceeds GRADED_VS_RAW_CEILING x the
//     trustworthy raw NM reference.
// If every tier is dropped the graded block simply doesn't render; the
// raw reference + condition ladder still stand.
const GRADED_SPREAD_CEILING = 6;
const GRADED_ANCHOR_CEILING = 1.6;
const GRADED_VS_RAW_CEILING = 8;

function coherentGradedTiers(gradedRaw, rawNmRef) {
  const anchorPrice =
    ["psa10", "psa9", "psa8"]
      .map((k) => Number(gradedRaw.find((t) => t.key === k)?.currentPrice))
      .find((v) => Number.isFinite(v) && v > 0) ?? null;

  const isCoherent = (t) => {
    if (!(Number(t.currentPrice) > 0)) return false;
    if (!t.isLowConfidence) return true;
    const lo = Number(t.minPrice);
    const hi = Number(t.maxPrice);
    if (lo > 0 && hi > 0 && hi / lo > GRADED_SPREAD_CEILING) return false;
    if (anchorPrice != null && Number(t.currentPrice) > anchorPrice * GRADED_ANCHOR_CEILING) return false;
    if (anchorPrice == null && rawNmRef != null && Number(t.currentPrice) > rawNmRef * GRADED_VS_RAW_CEILING) {
      return false;
    }
    return true;
  };

  return gradedRaw
    .filter(isCoherent)
    // Highest-value grades first - matches how collectors think about
    // grade tiers, and puts the most interesting data up top.
    .sort((a, b) => (b.currentPrice ?? 0) - (a.currentPrice ?? 0));
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
async function getFullPriceAnalysis(
  tcgplayerId,
  { primaryGrader, primaryGrade, language = "english", includeHistory = true } = {}
) {
  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("tcgPlayerId", tcgplayerId);
  url.searchParams.set("language", language);
  url.searchParams.set("includeEbay", "true");
  // The raw Near Mint history series (includeHistory) is only needed by
  // callers that still render it directly. /cards/[slug] now draws its
  // chart + trends from the canonical price_history spine (Phase 11C), so
  // it passes includeHistory:false - dropping ~1 provider credit per
  // uncached render and keeping page traffic off the history endpoint.
  if (includeHistory) url.searchParams.set("includeHistory", "true");

  const body = await fetchPPT(url);
  const d = body.data;
  if (!d) return null;

  const rawHistory = includeHistory
    ? (d.priceHistory?.conditions?.["Near Mint"]?.history ?? [])
        .map((p) => ({ t: new Date(p.date).getTime(), p: p.market }))
        .sort((a, b) => a.t - b.t)
    : [];

  const salesByGrade = d.ebay?.salesByGrade ?? {};
  const priceHistoryByGrade = d.ebay?.priceHistory ?? {};
  const outlierByGrade = d.ebay?.smartPriceOutlierByGrade ?? {};

  // A trustworthy RAW Near Mint reference (from d.prices), used below to
  // sanity-check the graded tiers' scale.
  const rawNmRef = (() => {
    const v = catalogRawMarketPrice(d.prices);
    return isSentinelPrice(v) || !(Number(v) > 0) ? null : Number(v);
  })();

  // Every grade tier, before the coherence filter.
  const gradedRaw = Object.entries(salesByGrade)
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
    }));

  const graded = coherentGradedTiers(gradedRaw, rawNmRef);

  const primaryKey = gradeKey(primaryGrader, primaryGrade);
  let primarySoldListings = normalizeSoldListings(
    d.ebay?.soldListings?.[primaryKey ?? "ungraded"]
  );
  // RAW recent-sales integrity. When no grader was requested we pull the
  // "ungraded" bucket to show as RAW sales - but that bucket is only
  // advisory: it routinely contains graded slabs AND sales of other
  // printings that share this card's name + collector number (Celebrations
  // Classic Collection, WOTC 1st Edition, XY Evolutions, EX-era reprints,
  // Japanese prints), plus fat-finger / lot / slab-money prices on
  // otherwise-clean raw titles. Keep only sales whose title reads as this
  // exact raw printing (rawSaleMatchesPrinting) AND whose price is
  // plausible for one such copy against the independently-computed
  // canonical raw reference (rawSalePriceIsPlausible - DISPLAY ONLY, it
  // never feeds any price/deal/index logic). When a real grader WAS
  // requested (a graded deal-detail page) the list IS that grade's bucket
  // and is left exactly as-is.
  if (!primaryKey) {
    const variantKeys = Object.keys(d.variants ?? {});
    const firstEditionOnly =
      variantKeys.some((k) => /1st\s*ed/i.test(k)) && !variantKeys.some((k) => /unlimited/i.test(k));
    const identity = {
      name: d.name,
      set: d.setName,
      cardNumber: d.cardNumber,
      language,
      firstEditionOnly,
    };
    primarySoldListings = primarySoldListings
      .filter((s) => rawSaleMatchesPrinting(s.title, identity))
      .filter((s) => rawSalePriceIsPlausible({ salePrice: s.price, rawReference: rawNmRef }));
  }

  // priceHistory.conditions is NOT split by printing, so for a dual-
  // printing WOTC card it's a 1st-Ed/Unlimited blend - a range and chart
  // that describe neither printing. Better to show the (clean, variant-
  // derived) current price alone than a misleading history for it. Single-
  // printing cards keep their real Near Mint history.
  const dualPrinting = /1st\s*edition/i.test(d.prices?.primaryPrinting ?? "");
  const rawPrices = dualPrinting ? [] : rawHistory.map((p) => p.p);

  return {
    // Real card identity from the provider record (no extra request - `d`
    // is already in hand). Lets a live-deal /cards/[slug] hub show the
    // collector number / rarity in visible HTML even though its own hub
    // object only carries name + set (SEO Phase 8A / identity keywords).
    cardNumber: d.cardNumber ?? null,
    rarity: d.rarity ?? null,
    raw: {
      currentPrice: catalogRawMarketPrice(d.prices),
      minPrice: rawPrices.length ? Math.min(...rawPrices) : null,
      maxPrice: rawPrices.length ? Math.max(...rawPrices) : null,
      history: dualPrinting ? [] : rawHistory,
    },
    graded,
    salesVelocity: d.ebay?.salesVelocity ?? null,
    // For a dual-printing WOTC card, prices.conditions is a blended,
    // contaminated ladder (a 1st-Edition listing sold as "Moderately
    // Played" lands in the MP bucket at a 1st-Ed price - hence Shadowless
    // Charizard's MP $3,526 / Damaged $4,200, or Blaine's LP $747 > NM
    // $699). When primaryPrinting is 1st Edition, take the ladder from the
    // clean non-1st-Edition variant instead, so the breakdown matches the
    // headline (raw.currentPrice) rather than contradicting it.
    conditionBreakdown: (/1st\s*edition/i.test(d.prices?.primaryPrinting ?? "")
      ? Object.entries(conditionPricesFromVariants(d.prices)).map(([condition, price]) => ({ condition, price }))
      : Object.entries(d.prices?.conditions ?? {}).map(([condition, info]) => ({ condition, price: info?.price })))
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

// Sealed product (booster boxes, ETBs, bundles, ...) - a completely
// separate PokemonPriceTracker endpoint from /cards, with its own shape:
// no condition/grading, a single real "unopenedPrice" market figure. No
// eBay sold-comp support here (includeEbay is /cards-only, confirmed by
// the API's own 400 error listing allowed params) - unlike singles,
// "is this a deal" for sealed product only ever comes from our own eBay
// scan compared against unopenedPrice, same as raw cards already do.
const SEALED_BASE = `${BASE_URL}/sealed-products`;

// Used once per product, when adding it to the sealed watchlist - turns a
// plain name into the stable tcgPlayerId every other lookup here uses.
async function searchSealedProduct(name, language = "english") {
  const url = new URL(SEALED_BASE);
  url.searchParams.set("search", name);
  url.searchParams.set("language", language);
  url.searchParams.set("limit", "1");
  const body = await fetchPPT(url);
  const product = body.data?.[0];
  if (!product) throw new Error(`No PokemonPriceTracker sealed-product results for "${name}"`);
  return product;
}

// User-facing search: a page of candidate sealed products (unlike
// searchSealedProduct, which is limit=1).
async function searchSealedProducts(query, { limit = 20, offset = 0, language = "english" } = {}) {
  const url = new URL(SEALED_BASE);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("language", language);
  if (offset) url.searchParams.set("offset", String(offset));
  const body = await fetchPPT(url);
  return {
    results: body.data ?? [],
    total: body.metadata?.total ?? null,
    hasMore: body.metadata?.hasMore ?? false,
  };
}

// Every sealed product PPT catalogues for one set, by set name (the
// display name, e.g. "SWSH07: Evolving Skies" - verified: ?setName=
// accepts it directly). Pages through in case a set ever exceeds the
// limit. Costs 1 credit per product returned. Used by the sealed-catalog
// sync, never a per-request page render.
async function listSealedProductsForSet(setName, { language = "english" } = {}) {
  const out = [];
  // Small page size on purpose: PPT bills a limit=N sealed request as
  // ~N/10 "minute calls" against a tiny window, so limit=200 alone trips
  // the per-minute 429. limit=40 (~4 minute calls) + fetchPPTPaced's
  // backoff keeps a full 219-set crawl moving.
  const LIMIT = 40;
  for (let offset = 0; ; offset += LIMIT) {
    const url = new URL(SEALED_BASE);
    url.searchParams.set("setName", setName);
    url.searchParams.set("language", language);
    url.searchParams.set("limit", String(LIMIT));
    if (offset) url.searchParams.set("offset", String(offset));
    const body = await fetchPPTPaced(url);
    const batch = body.data ?? [];
    out.push(...batch);
    if (batch.length < LIMIT || !body.metadata?.hasMore) break;
  }
  return out;
}

// Current real market price for one sealed product. /sealed-products
// always returns data as an array (even for a single tcgPlayerId lookup) -
// confirmed against a real product, unlike /cards which returns a single
// object.
async function getSealedPrice(tcgPlayerId, language = "english") {
  const url = new URL(SEALED_BASE);
  url.searchParams.set("tcgPlayerId", tcgPlayerId);
  url.searchParams.set("language", language);
  const body = await fetchPPT(url);
  const product = body.data?.[0];
  // Same no-data handling as the /cards price lookups: a null price OR a
  // repdigit sentinel (999 / 9999 / ...) means "no real comps" - never
  // price a sealed deal against it.
  if (product?.unopenedPrice == null || isSentinelPrice(product.unopenedPrice)) return null;
  return { price: product.unopenedPrice, lastUpdated: product.updatedAt };
}

// On-demand only (a sealed deal detail page a visitor actually opened).
async function getSealedPriceHistory(tcgPlayerId, days = 90, language = "english") {
  const url = new URL(SEALED_BASE);
  url.searchParams.set("tcgPlayerId", tcgPlayerId);
  url.searchParams.set("includeHistory", "true");
  url.searchParams.set("days", String(days));
  url.searchParams.set("language", language);
  const body = await fetchPPT(url);
  const product = body.data?.[0];
  const points = product?.priceHistory ?? [];
  return points.map((p) => ({ t: new Date(p.date).getTime(), p: p.unopenedPrice }));
}

module.exports = {
  searchCard,
  searchCards,
  isSentinelPrice,
  pickMarketPrice,
  pickCatalogMarketPrice,
  catalogRawMarketPrice,
  WOTC_DUAL_PRINTING_SETS,
  getCatalogNmPrice,
  getRawPrice,
  getConditionPrices,
  getRawPriceHistory,
  getRawSoldComps,
  listSets,
  listSetCards,
  downloadPrintingsExport,
  getGradedPrice,
  getFullPriceAnalysis,
  coherentGradedTiers,
  GRADED_SPREAD_CEILING,
  GRADED_ANCHOR_CEILING,
  GRADED_VS_RAW_CEILING,
  searchSealedProduct,
  searchSealedProducts,
  listSealedProductsForSet,
  getSealedPrice,
  getSealedPriceHistory,
};
