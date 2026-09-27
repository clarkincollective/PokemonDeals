// External discovery source: the public PokeDealFinder deal board.
//
// TWO USES (2026-09-27), both recorded in IMPLEMENTATION_STATUS.md:
//   1. Discovery hint (since 2026-08-31): which public eBay listings to look
//      at. Every item is independently re-fetched through our own eBay
//      Browse API (lib/ebay.js getItemsByLegacyIds), re-validated through
//      our own trust + matching + scoring pipeline, and wrapped with our own
//      affiliate links before it can become a `deals` row.
//   2. Board deals (lib/boardDeals.js): the board's own published listing
//      details and discount figure, captured here per row and shown on a
//      SEPARATE surface - while fresh by the board's own found-at time, and
//      verified through the same eBay lookup as soon as quota allows. The
//      captured figure is never merged with the site's own evidenced
//      savings, and the board's name, branding and links are never
//      rendered - the source URL, captured percentage and capture time are
//      kept in the record for auditing only.
//
// SOURCES. The board's page polls its own JSON feed,
//   GET /api/deals/feed/?market=<uk|us|au|ca|de>  ->  { deals: [ { id,
//   card_name, card_set, image_url, discount_percentage (44.6), is_auction,
//   is_graded, grade_display, listing_price, market_price, currency ("£"),
//   time_ago, found_at (ISO), view_url, sales_url } ] }
// (measured 27 Sep 2026: 24 rows per market, the board's newest). `sales_url`
// is the same history link the HTML rows carry, whose `du` param is the
// plain eBay listing URL - its numeric item id and TLD give the identity.
// The feed is read first (exact figures, the board's own timestamps); the
// server-rendered HTML (`.deal-card` blocks, parseFeedHtml) is the fallback.

const FEED_URL = "https://pokedealfinder.uk/";
const FEED_JSON_URL = "https://pokedealfinder.uk/api/deals/feed/";
const FEED_MARKETS = ["uk", "us", "au", "ca", "de"];
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = "PokemonDealFinder/1.0 (+https://pokemondealfinder.com; authorized discovery integration)";

// eBay TLD -> our marketplace id (must be one of lib/ebay.js MARKETPLACES).
const EBAY_HOST_TO_MARKETPLACE = {
  "ebay.com": "EBAY_US",
  "ebay.co.uk": "EBAY_GB",
  "ebay.com.au": "EBAY_AU",
  "ebay.ca": "EBAY_CA",
  "ebay.de": "EBAY_DE",
  "ebay.it": "EBAY_IT",
};

const decodeEntities = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
const textOf = (s) => decodeEntities(String(s ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const firstMatch = (block, re) => {
  const m = re.exec(block);
  return m ? textOf(m[1]) : null;
};
const isoOrNull = (v) => {
  const t = Date.parse(v ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// "45% off" -> 0.45; anything else -> null. The board's own figure, kept
// as a fraction so it sits beside (never inside) discount_pct's vocabulary.
function parseDiscountText(text) {
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(String(text ?? ""));
  if (!m) return null;
  const pct = Number(m[1]);
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? Math.round(pct * 10) / 1000 : null;
}
// 44.6 -> 0.446 (three decimals of a fraction); out of range -> null
function fractionFromPercentage(n) {
  const pct = Number(n);
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? Math.round(pct * 10) / 1000 : null;
}

// Resolve ONE history-link href into the listing identity + captured hints.
// Returns null when the row cannot be resolved with confidence.
function resolveHistoryHref(rawHref) {
  const href = decodeEntities(rawHref);
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const du = u.searchParams.get("du");
  if (!du) return null;
  let ebayUrl;
  try {
    ebayUrl = new URL(du);
  } catch {
    return null;
  }
  const host = ebayUrl.hostname.replace(/^www\./, "");
  const marketplace = EBAY_HOST_TO_MARKETPLACE[host];
  const idMatch = ebayUrl.pathname.match(/\/itm\/(\d{6,})/);
  if (!marketplace || !idMatch) return null;
  const ebayItemId = idMatch[1];
  return {
    ebayItemId,
    marketplace,
    // Everything below is the board's own text - a hint for the discovery
    // path, the captured record for the board-deal path. Never a substitute
    // for our own eBay lookup.
    feedMarket: u.searchParams.get("market") || null,
    feedPrice: numOrNull(u.searchParams.get("dp")),
    feedCondition: u.searchParams.get("dv") || null,
    feedFormat: u.searchParams.get("df") || null,
    feedTitle: u.searchParams.get("dti") || null,
    boardImage: u.searchParams.get("di") || null,
    // the plain listing URL, stripped of the board's own search/hash params
    plainEbayUrl: `${ebayUrl.origin}/itm/${ebayItemId}`,
    // The board row href - INTERNAL audit / discovery-analytics metadata
    // only (discovery_events.external_source_url, board_deal.captured.sourceUrl).
    // Never rendered.
    sourceUrl: href.split("&du=")[0] || href,
  };
}

// The JSON feed's rows -> candidates. Pure. `deals` is the feed's array.
function parseFeedJson(deals) {
  const out = [];
  const seen = new Set();
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d || typeof d !== "object") continue;
    const base = resolveHistoryHref(d.sales_url ?? "");
    if (!base) continue;
    const key = `${base.marketplace}:${base.ebayItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pct = fractionFromPercentage(d.discount_percentage);
    const listing = numOrNull(d.listing_price);
    const market = numOrNull(d.market_price);
    const sym = d.currency ? String(d.currency) : "";
    out.push({
      ...base,
      feedPrice: base.feedPrice ?? listing,
      feedTitle: base.feedTitle ?? null,
      boardId: d.id ?? null,
      boardFoundAt: isoOrNull(d.found_at),
      capturedDiscountPct: pct,
      capturedDiscountText: pct == null ? null : `${Math.round(pct * 100)}% off`,
      boardListingPriceText: listing == null ? null : `${sym}${listing.toFixed(2)}`,
      boardMarketPriceText: market == null ? null : `${sym}${market.toFixed(2)}`,
      boardName: d.card_name ?? null,
      boardSet: d.card_set ?? null,
      boardVariant: d.is_graded ? String(d.grade_display ?? "").trim() || "Graded" : "Raw",
      boardFormat: d.is_auction ? "Auction" : "BIN",
      boardFoundAgo: d.time_ago ?? null,
      boardImage: d.image_url ?? base.boardImage ?? null,
    });
  }
  return out;
}

// Parse the board HTML into candidates. Pure + synchronous so it's
// unit-testable against a saved copy of the page. One entry per unique
// (marketplace, item id); the first occurrence wins.
function parseFeedHtml(html) {
  const out = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.marketplace}:${item.ebayItemId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  const src = String(html ?? "");

  // Preferred: the measured `.deal-card` blocks, each carrying the board's
  // published details around its history link.
  const blocks = src.split(/<div class="deal-card">/);
  if (blocks.length > 1) {
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const hrefMatch = /href="(https:\/\/pokedealfinder\.uk\/public\/cards\/[^"]+)"/.exec(block);
      if (!hrefMatch) continue;
      const base = resolveHistoryHref(hrefMatch[1]);
      if (!base) continue;
      const discountText = firstMatch(block, /class="discount-badge">([\s\S]*?)<\/span>/);
      const imgSrc = /<img src="([^"]+)"/.exec(block)?.[1] ?? null;
      push({
        ...base,
        boardFoundAt: null, // the HTML shows "29m ago" only; the JSON feed carries the timestamp
        capturedDiscountText: discountText,
        capturedDiscountPct: parseDiscountText(discountText),
        boardListingPriceText: firstMatch(block, /class="listing-price">([\s\S]*?)<\/span>/),
        boardMarketPriceText: firstMatch(block, /class="market-price-label">([\s\S]*?)<\/span>/),
        boardName: firstMatch(block, /class="deal-card-name">([\s\S]*?)<\/div>/),
        boardSet: firstMatch(block, /class="deal-card-set">([\s\S]*?)<\/div>/),
        boardVariant: firstMatch(block, /class="variant-badge[^"]*">([\s\S]*?)<\/span>/),
        boardFormat: firstMatch(block, /class="format-badge[^"]*">([\s\S]*?)<\/span>/),
        boardFoundAgo: firstMatch(block, /class="found-time">([\s\S]*?)<\/span>/),
        boardImage: base.boardImage ?? (imgSrc ? decodeEntities(imgSrc) : null),
      });
    }
    return out;
  }

  // Legacy / unknown markup: every history link on the page, identity only.
  const re = /href="(https:\/\/pokedealfinder\.uk\/public\/cards\/[^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const base = resolveHistoryHref(m[1]);
    if (base) push({ ...base, boardFoundAt: null, capturedDiscountText: null, capturedDiscountPct: null });
  }
  return out;
}

function numOrNull(s) {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchWithTimeout(url, { accept }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: accept }, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// Fetch the board. The JSON feed per market first; when every market fails
// the HTML page is read instead. A total failure is returned as { error }
// rather than thrown, so a bad cycle is a no-op and the eBay-scan pipeline
// is entirely unaffected.
async function fetchFeed({ url = FEED_URL, jsonUrl = FEED_JSON_URL, markets = FEED_MARKETS, retries = 1 } = {}) {
  const listings = [];
  const seen = new Set();
  const marketErrors = [];
  for (const market of markets) {
    let ok = false;
    for (let attempt = 0; attempt <= retries && !ok; attempt++) {
      try {
        const res = await fetchWithTimeout(`${jsonUrl}?market=${encodeURIComponent(market)}`, { accept: "application/json" });
        if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
        const body = await res.json();
        for (const it of parseFeedJson(body?.deals)) {
          const key = `${it.marketplace}:${it.ebayItemId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          listings.push(it);
        }
        ok = true;
      } catch (err) {
        if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        else marketErrors.push(`${market}: ${err.name === "AbortError" ? "timeout" : err.message}`);
      }
    }
  }
  if (listings.length > 0 || marketErrors.length < markets.length) {
    return { listings, error: null, source: "json", marketErrors, fetchedAt: new Date().toISOString() };
  }

  // every market failed: the page
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { accept: "text/html" });
      if (!res.ok) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return { listings: [], error: `feed HTTP ${res.status}`, source: "html", marketErrors };
      }
      const html = await res.text();
      return { listings: parseFeedHtml(html), error: null, source: "html", marketErrors, fetchedAt: new Date().toISOString() };
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return { listings: [], error: err.name === "AbortError" ? "feed timeout" : err.message, source: "html", marketErrors };
    }
  }
}

module.exports = { fetchFeed, parseFeedHtml, parseFeedJson, parseDiscountText, EBAY_HOST_TO_MARKETPLACE, FEED_URL, FEED_JSON_URL, FEED_MARKETS };
