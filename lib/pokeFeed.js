// External discovery source: the public PokeDealFinder deal board.
//
// TWO USES (2026-09-27), both recorded in IMPLEMENTATION_STATUS.md:
//   1. Discovery hint (since 2026-08-31): which public eBay listings to look
//      at. Every item is independently re-fetched through our own eBay
//      Browse API (lib/ebay.js getItemsByLegacyIds), re-validated through
//      our own trust + matching + scoring pipeline, and wrapped with our own
//      affiliate links before it can become a `deals` row.
//   2. Board deals (lib/boardDeals.js): the board's own published listing
//      details and discount figure, captured here per row, shown on a
//      SEPARATE surface only after the SAME eBay lookup confirms the listing
//      is live and its price still matches the captured one. The captured
//      figure is never merged with the site's own evidenced savings, and
//      the board's name, branding and links are never rendered - the
//      source URL, captured percentage and capture time are kept in the
//      record for auditing only.
//
// The board is one server-rendered HTML page: per market a
// `<div class="market-panel ..." id="panel-<uk|us|au|ca|de>">` holding
// `<div class="deal-card">` blocks. Each block carries (measured 26 Sep 2026):
//   <span class="discount-badge">45% off</span>
//   <span class="format-badge"><i ...></i> BIN</span>          (or Auction)
//   <span class="variant-badge raw"><i ...></i> Raw</span>     (or "PSA 10" ...)
//   <div class="deal-card-name">Budew</div>
//   <div class="deal-card-set">Ascended Heroes</div>
//   <span class="listing-price">£3.31</span>
//   <span class="market-price-label">£5.98</span>
//   <span class="found-time">29m ago</span>
//   <a href="https://pokedealfinder.uk/public/cards/<a>/<b>/?market=UK&dp=..&dv=..&df=..&du=<eBay URL>&dti=..&di=.." class="history-btn">
// The `du` param is the plain eBay listing URL: its numeric item id and TLD
// give the listing identity; everything else on the row is the board's own
// text and is captured verbatim as such.

const FEED_URL = "https://pokedealfinder.uk/";
const FETCH_TIMEOUT_MS = 15000;

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

// "45% off" -> 0.45; anything else -> null. The board's own figure, kept
// as a fraction so it sits beside (never inside) discount_pct's vocabulary.
function parseDiscountText(text) {
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(String(text ?? ""));
  if (!m) return null;
  const pct = Number(m[1]);
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
    if (base) push({ ...base, capturedDiscountText: null, capturedDiscountPct: null });
  }
  return out;
}

function numOrNull(s) {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Fetch the board. One retry on a transient failure; a timeout or non-200
// is returned as { error } rather than thrown, so a bad cycle is a no-op
// and the eBay-scan pipeline is entirely unaffected.
async function fetchFeed({ url = FEED_URL, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "PokemonDealFinder/1.0 (+https://pokemondealfinder.com; authorized discovery integration)",
          Accept: "text/html",
        },
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return { listings: [], error: `feed HTTP ${res.status}` };
      }
      const html = await res.text();
      return { listings: parseFeedHtml(html), error: null, fetchedAt: new Date().toISOString() };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return { listings: [], error: err.name === "AbortError" ? "feed timeout" : err.message };
    }
  }
}

module.exports = { fetchFeed, parseFeedHtml, parseDiscountText, EBAY_HOST_TO_MARKETPLACE, FEED_URL };
