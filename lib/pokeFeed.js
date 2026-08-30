// External discovery source: the public PokeDealFinder deal board.
//
// We use it as a *discovery hint only* - it tells us which public eBay
// listings to look at. Nothing from here is trusted or displayed: every
// item is independently re-fetched through our own eBay Browse API
// (lib/ebay.js getItemsByLegacyIds), re-validated through our own trust +
// matching + scoring pipeline, and wrapped with our own affiliate links
// before it can become a deal. See app/api/ingest-feed/route.js and
// IMPLEMENTATION_STATUS.md "External discovery ingestion".
//
// The board is one server-rendered HTML page. Every deal row carries a
// "price history" link of the form
//   https://pokedealfinder.uk/public/cards/<a>/<b>/?market=UK&dp=..&dv=..&df=..&du=<url-encoded eBay URL>&dti=..&di=..
// The `du` param is the plain eBay listing URL - that's all we take from
// it: the numeric item id and which eBay marketplace it's on.

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

// Parse the board HTML into discovery candidates. Pure + synchronous so it's
// unit-testable against a saved copy of the page.
function parseFeedHtml(html) {
  const out = [];
  const seen = new Set();
  const re = /href="(https:\/\/pokedealfinder\.uk\/public\/cards\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
    let u;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    const du = u.searchParams.get("du");
    if (!du) continue;

    let ebayUrl;
    try {
      ebayUrl = new URL(du);
    } catch {
      continue;
    }
    const host = ebayUrl.hostname.replace(/^www\./, "");
    const marketplace = EBAY_HOST_TO_MARKETPLACE[host];
    const idMatch = ebayUrl.pathname.match(/\/itm\/(\d{6,})/);
    if (!marketplace || !idMatch) continue;

    const ebayItemId = idMatch[1];
    const key = `${marketplace}:${ebayItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ebayItemId,
      marketplace,
      // Everything below is a hint for debugging/telemetry only - never
      // trusted or displayed. Our own eBay lookup provides the real values.
      feedMarket: u.searchParams.get("market") || null,
      feedPrice: numOrNull(u.searchParams.get("dp")),
      feedCondition: u.searchParams.get("dv") || null,
      feedFormat: u.searchParams.get("df") || null,
      feedTitle: u.searchParams.get("dti") || null,
      // The board row href - INTERNAL discovery-analytics/debug metadata
      // only (discovery_events.external_source_url). Never rendered.
      sourceUrl: href.split("&du=")[0] || href,
    });
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
      return { listings: parseFeedHtml(html), error: null };
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

module.exports = { fetchFeed, parseFeedHtml, EBAY_HOST_TO_MARKETPLACE, FEED_URL };
