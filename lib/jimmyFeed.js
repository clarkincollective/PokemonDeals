// Second external board (2026-09-27, owner's decision "B"): the public
// listing tables at jimmysdealfinder.com - singles, graded slabs and sealed
// product, five eBay markets, Buy It Now and auctions, a 24-hour window.
//
// What is taken from a row (measured 27 Sep 2026): the eBay item link
// (identity: numeric id + TLD -> marketplace; the board's own affiliate
// params are dropped), the listing title, the eBay image, seller + feedback,
// the card / set text, the assumed condition ("LP (assumed)"), price /
// postage / total, the board's valuation ("Adjusted LP (assumed) value" and
// "Reference NM value"), grade cell ("Ungraded" / "PSA 10"), format ("Buy it
// now" / "Auction"), end date, "added N hours ago", and the board's "price
// difference %".
//
// ABOUT THE FIGURE. The board's percentage is (valuation - price) / price
// ("675.25%" on a $30.59 total against a $237.15 valuation). The surface
// shows a discount-style figure, so this module derives
//   discountPct = 1 - total / valuation           (0.871 for that row)
// from the board's own two published numbers - arithmetic on its figures,
// not a reference of ours. Both raw figures are kept in the record. The
// board states its valuations "are taken from Pricecharting"; that
// derivation, and PriceCharting's own terms on public re-use, were named
// to the owner before this was built and are recorded in the handover
// (§3G). No name, branding or link of the board is rendered.
//
// FRESHNESS. The board gives "added N hours ago" only, so foundAt is
// derived as now - N (coarse, to the hour) and the record says so.
//
// EVERY LIST (owner, 27 Sep: "all deals from every page from all
// categories"). The site has no pagination: every list is a 25-row slice
// (the all-countries lists 125), and different SORT orders expose different
// slices - measured on one list, six sorts gave 123 distinct listings. So:
//   markets  us, uk, de, au, ca, all   (all = all countries; identity still
//            comes from each row's own eBay host)
//   formats  buy_it_now, auction
//   windows  24hrs ("Today"), alltime ("All" and "Ending Soonest")
//   sorts    default, price_desc, price_asc, end_asc,
//            price_diff_percent_desc, price_diff_raw_desc
// Half-hourly pass: the 24hrs lists with the default and the
// price-difference sorts (24 requests). Daily FULL pass (`full: true`):
// every market x format x window x sort (144 requests), which is how the
// site's whole findings are re-read once a day. Duplicates across slices
// collapse on the eBay item id.
//
// COURTESY. One request at a time, PACE_MS apart, an identifying User-Agent.

const JIMMY_BASE = "https://www.jimmysdealfinder.com";
const JIMMY_SOURCE = "jimmys";
const JIMMY_MARKETS = Object.freeze({ us: "EBAY_US", uk: "EBAY_GB", au: "EBAY_AU", ca: "EBAY_CA", de: "EBAY_DE", all: null });
const JIMMY_FORMATS = ["buy_it_now", "auction"];
const JIMMY_WINDOWS = ["24hrs", "alltime"];
const JIMMY_WINDOW = "24hrs";
const JIMMY_SORTS = ["", "price_desc", "price_asc", "end_asc", "price_diff_percent_desc", "price_diff_raw_desc"];
const JIMMY_QUICK_SORTS = ["", "price_diff_percent_desc"];
const FETCH_TIMEOUT_MS = 15000;
// 27 Sep 05:1xZ: a 144-list pass at 500 ms spacing tripped the host's rate
// limit (Cloudflare 1015 / HTTP 429). 2.5 s keeps a full pass near 24
// requests a minute; a refused list is simply reported and read next time.
const PACE_MS = 2500;
const USER_AGENT = "PokemonDealFinder/1.0 (+https://pokemondealfinder.com; discovery integration)";

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
const textOf = (s) => decodeEntities(String(s ?? "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const money = (s) => {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(String(s ?? "").replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// "10 hours ago" / "35 minutes ago" / "2 days ago" / "just now" -> ISO, else null
function foundAtFromAgo(text, now = Date.now()) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^just now$/.test(t) || /^\d+ seconds? ago$/.test(t)) return new Date(now).toISOString();
  const m = /^(\d+)\s*(minute|hour|day)s?\s+ago$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { minute: 60_000, hour: 3_600_000, day: 86_400_000 }[m[2]];
  return new Date(now - n * unit).toISOString();
}

// "PSA 10" -> graded; "Ungraded" -> null. A grade cell may also hold the
// grader alone; anything that is not "Ungraded" is kept as the variant.
function variantFromGrade(gradeText) {
  const g = textOf(gradeText);
  if (!g || /^ungraded$/i.test(g)) return null;
  return g;
}

const CARD_NUMBER_RE = /(^|\s)#\d+\b|\b\d{1,3}\/\d{2,3}\b/;
const SEALED_TITLE_RE = /\b(booster(?:\s+pack)?s?\s+box|booster box|elite trainer box|\betb\b|booster bundle|blister|display box|collection box|premium collection|build\s*&\s*battle|battle deck|theme deck|tin\b|sealed case|\bcase\b|booster pack|sleeved booster|upc\b|ultra[- ]premium)/i;

// Parse one page (one market, one format). Pure.
function parseJimmyHtml(html, { marketplace = null, format = null, now = Date.now(), listUrl = null } = {}) {
  const src = String(html ?? "");
  const out = [];
  const seen = new Set();
  // A listing is a title row followed by its detail row.
  const re = /<tr class="listing-title-row"[^>]*>([\s\S]*?)<\/tr>\s*<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const titleRow = m[1];
    const detail = m[2];
    const link = /href="([^"]*ebay\.[a-z.]+\/itm\/(\d{6,})[^"]*)"/i.exec(titleRow);
    if (!link) continue;
    let ebayUrl;
    try {
      ebayUrl = new URL(decodeEntities(link[1]));
    } catch {
      continue;
    }
    const host = ebayUrl.hostname.replace(/^www\./, "");
    const mkt = EBAY_HOST_TO_MARKETPLACE[host] ?? marketplace;
    if (!mkt) continue;
    const ebayItemId = link[2];
    const key = `${mkt}:${ebayItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const title = textOf(/class="underline-link">([\s\S]*?)<\/a>/.exec(titleRow)?.[1] ?? "").replace(/\s*\(eBay\)\s*$/i, "");
    const cells = [...detail.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    // measured column order: flag | image | title+seller | card | set | condition |
    // price | valuation | grade | auction type | end date | added | diff % | diff raw
    const cell = (i) => (i < cells.length ? cells[i] : "");
    const image = /<img[^>]*?\ssrc="(https:\/\/i\.ebayimg\.com[^"]+)"/.exec(cell(1))?.[1] ?? null;
    const sellerText = textOf(cell(2)).replace(title, "").replace(/\(eBay\)/g, "");
    const seller = /([A-Za-z0-9_.*-]+)\s*\((\d[\d,]*)\)\s*([\d.]+)%/.exec(sellerText);
    const cardName = textOf(/<a href="https:\/\/pricecharting\.com[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(cell(3))?.[1] ?? "") || null;
    const setName = textOf(cell(4)).split(/🎯|🔍|🔗/)[0].trim() || null;
    const condition = textOf(cell(5)) || null;
    const priceText = textOf(cell(6));
    const priceMatch = /^([^\s(]+)/.exec(priceText);
    const price = money(priceMatch?.[1]);
    const postage = /\(([^)]*?)postage\)/i.exec(priceText) ? money(/\(([^)]*?)postage\)/i.exec(priceText)[1]) : 0;
    const total = /Total:\s*([^\s]+)/i.exec(priceText) ? money(/Total:\s*([^\s]+)/i.exec(priceText)[1]) : price;
    const valuationText = textOf(cell(7));
    const valuationParts = [...valuationText.matchAll(/([$£€A$C]*\s?[\d,]+(?:\.\d+)?)/g)].map((x) => money(x[1])).filter((v) => v != null);
    const valuation = valuationParts[0] ?? null; // "Adjusted <condition> value" (the board's comparison figure)
    const referenceNm = valuationParts[1] ?? null; // "Reference NM value"
    const grade = textOf(cell(8));
    const auctionType = textOf(cell(9));
    const endDate = textOf(cell(10));
    const added = textOf(cell(11));
    const diffPctText = textOf(cell(12));
    const priceDifferencePct = money(diffPctText.replace(/%/, ""));
    const currencySymbol = /^([^\d\s]+)/.exec(priceText)?.[1] ?? null;
    const isAuction = /auction/i.test(auctionType) || format === "auction";
    const variant = variantFromGrade(grade);
    // 28 Sep 2026: a listing whose title carries a card number ("#27",
    // "27/99") is a single even when the rest of the title says "collection"
    // or "tin" (seen on /sealed-deals: "Articuno #27" filed as sealed).
    const kind = variant ? "graded" : SEALED_TITLE_RE.test(title) && !CARD_NUMBER_RE.test(title) ? "sealed" : "single";
    const discountPct = total != null && valuation != null && valuation > total ? Math.round((1 - total / valuation) * 1000) / 1000 : null;

    out.push({
      source: JIMMY_SOURCE,
      ebayItemId,
      marketplace: mkt,
      feedMarket: mkt.replace("EBAY_", ""),
      feedPrice: total, // the listed total (price + postage) is what a buyer pays; the board's % uses it
      feedItemPrice: price,
      feedPostage: postage,
      feedCondition: condition,
      feedFormat: isAuction ? "auction" : "bin",
      feedTitle: title || null,
      boardId: null,
      boardFoundAt: foundAtFromAgo(added, now),
      boardFoundAgo: added || null,
      capturedDiscountPct: discountPct,
      capturedDiscountText: discountPct == null ? null : `${Math.round(discountPct * 100)}% off`,
      boardPriceDifferencePct: priceDifferencePct == null ? null : priceDifferencePct / 100,
      boardValuation: valuation,
      boardReferenceNm: referenceNm,
      boardValuationBasis: /Adjusted ([^v]+?) value/i.exec(valuationText)?.[1]?.trim() ?? null,
      boardListingPriceText: total == null ? null : `${currencySymbol ?? ""}${total.toFixed(2)}`,
      boardMarketPriceText: valuation == null ? null : `${currencySymbol ?? ""}${valuation.toFixed(2)}`,
      boardName: cardName,
      boardSet: setName,
      boardVariant: variant ?? (kind === "sealed" ? "Sealed" : "Raw"),
      boardFormat: isAuction ? "Auction" : "BIN",
      boardKind: kind,
      boardImage: image,
      boardSeller: seller ? { name: seller[1], feedbackScore: Number(String(seller[2]).replace(/,/g, "")), feedbackPct: Number(seller[3]) } : null,
      boardEndDate: endDate && !/^n\/a$/i.test(endDate) ? endDate : null,
      plainEbayUrl: `${ebayUrl.origin}/itm/${ebayItemId}`,
      // INTERNAL audit metadata only: the list this row was read from. Never rendered.
      sourceUrl: listUrl ?? `${JIMMY_BASE}/pokemon/${Object.entries(JIMMY_MARKETS).find(([, v]) => v === mkt)?.[0] ?? "us"}/${format ?? (isAuction ? "auction" : "buy_it_now")}/${JIMMY_WINDOW}`,
    });
  }
  return out;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// The lists a pass reads. `full`: every market x format x window x sort;
// otherwise the 24hrs lists with the quick sorts.
function jimmyListPlan({ full = false, markets = JIMMY_MARKETS, formats = JIMMY_FORMATS } = {}) {
  const windows = full ? JIMMY_WINDOWS : [JIMMY_WINDOW];
  const sorts = full ? JIMMY_SORTS : JIMMY_QUICK_SORTS;
  const plan = [];
  for (const [slug, marketplace] of Object.entries(markets)) {
    for (const format of formats) {
      for (const window of windows) {
        for (const sort of sorts) {
          const url = `${JIMMY_BASE}/pokemon/${slug}/${format}/${window}${sort ? `?sort=${sort}` : ""}`;
          plan.push({ slug, marketplace, format, window, sort, url });
        }
      }
    }
  }
  return plan;
}

// One pass over the planned lists. Failures per list are reported, never
// thrown; an empty result with every list failed carries `error`.
async function fetchJimmyFeed({ full = false, markets = JIMMY_MARKETS, formats = JIMMY_FORMATS, pace = PACE_MS, fetchImpl = null, now = Date.now() } = {}) {
  const listings = [];
  const seen = new Set();
  const pageErrors = [];
  const plan = jimmyListPlan({ full, markets, formats });
  let pages = 0;
  // VERCEL-COST-2 (27 Sep): FAIL FAST on an address block. The host answers
  // HTTP 403 to every request from Vercel's range (measured 144/144), and the
  // production route kept walking the whole plan anyway - 24 (or 144) refused
  // requests with 2.5 s of billed pacing between each: ~60 s of sleep per
  // half-hourly run, and a full pass that could not finish inside its
  // maxDuration. Two consecutive refusals with nothing read means this
  // address is blocked for the run: stop, report, and let the next run probe
  // again (so the route resumes on its own if the block is ever lifted). The
  // owner's machine reads this board through scripts/boards/captureJimmy.mjs.
  let refusedInARow = 0;
  let stoppedBecause = null;
  for (const list of plan) {
    if (pages > 0 && pace > 0) await new Promise((r) => setTimeout(r, pace));
    pages++;
    try {
      const res = fetchImpl ? await fetchImpl(list.url) : await fetchWithTimeout(list.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refusedInARow = 0;
      const html = await res.text();
      for (const it of parseJimmyHtml(html, { marketplace: list.marketplace, format: list.format, now, listUrl: list.url })) {
        const key = `${it.marketplace}:${it.ebayItemId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        listings.push(it);
      }
    } catch (err) {
      pageErrors.push(`${list.slug}/${list.format}/${list.window}${list.sort ? "?" + list.sort : ""}: ${err.name === "AbortError" ? "timeout" : err.message}`);
      if (/^HTTP (403|429|1015)$/.test(err.message ?? "")) refusedInARow++;
      if (refusedInARow >= 2 && listings.length === 0) {
        stoppedBecause = `address_blocked_after_${pages}_lists`;
        break;
      }
    }
  }
  return {
    listings,
    error: listings.length === 0 && pageErrors.length === pages ? pageErrors.join("; ") : null,
    pageErrors,
    pages,
    planned: plan.length,
    stoppedBecause,
    full,
    fetchedAt: new Date(now).toISOString(),
  };
}

// ---------------------------------------------------------------- pages (27 Sep, later)
// The site DOES paginate, on `page_num` (measured: the US Buy-It-Now all-time
// list links to page 50 = ~1,250 listings; its graded view to 17-24 pages;
// a "booster" search to 3). So a list is walked page by page until its last
// linked page, an empty page, or a page that adds nothing new.
const PAGE_LINK_RE = /page_num=(\d+)/g;
const SEALED_SEARCH_TERMS = ["booster", "box", "etb", "elite trainer", "tin", "bundle", "blister", "collection", "case"];

function maxPageFromHtml(html) {
  let max = 1;
  for (const m of String(html ?? "").matchAll(PAGE_LINK_RE)) max = Math.max(max, Number(m[1]) || 1);
  return max;
}

// The lists a mode reads. Each spec: { slug, marketplace, format, window,
// query (object), maxPages, label }.
//   quick     the Today lists, first 3 pages each                    (12 lists)
//   full      Today + all-time, every page up to 50                   (24 lists)
//   backfill  the graded view + the sealed searches of every list     (24 x 10)
function jimmyListSpecs({ mode = "quick", markets = JIMMY_MARKETS, formats = JIMMY_FORMATS } = {}) {
  const specs = [];
  const lists = [];
  // sealed (28 Sep 2026, owner: "Sealed doesn't have many"): the board's own
  // sealed rows only surfaced from the general lists' titles (310 fresh rows
  // against 373 of ours) because the sealed searches ran in the one-off
  // backfill only. This mode is the sealed searches alone, all-time window,
  // 5 pages each: 12 lists x 9 terms x <= 5 pages x 2.5 s ~= 20 min, daily.
  const windows = mode === "quick" ? [JIMMY_WINDOW] : mode === "sealed" ? ["alltime"] : JIMMY_WINDOWS;
  for (const [slug, marketplace] of Object.entries(markets)) for (const format of formats) for (const window of windows) lists.push({ slug, marketplace, format, window });
  for (const l of lists) {
    if (mode === "sealed") {
      for (const term of SEALED_SEARCH_TERMS) specs.push({ ...l, query: { search_query: term }, maxPages: 5, label: `sealed:${term}` });
      continue;
    }
    if (mode === "backfill") {
      specs.push({ ...l, query: { grade: "Graded" }, maxPages: 30, label: "graded" });
      for (const term of SEALED_SEARCH_TERMS) specs.push({ ...l, query: { search_query: term }, maxPages: 5, label: `sealed:${term}` });
    } else {
      // full: 24 lists x up to 50 pages x 2.5 s = up to ~50 min; the daily
      // task's limit was raised to 90 minutes on 27 Sep for this (measured
      // depth: US Buy-It-Now all-time links to page 50)
      specs.push({ ...l, query: {}, maxPages: mode === "quick" ? 3 : 50, label: mode });
    }
  }
  return specs;
}

function specUrl(spec, pageNum = 1) {
  const u = new URL(`${JIMMY_BASE}/pokemon/${spec.slug}/${spec.format}/${spec.window}`);
  for (const [k, v] of Object.entries(spec.query ?? {})) u.searchParams.set(k, v);
  if (pageNum > 1) u.searchParams.set("page_num", String(pageNum));
  return u.toString();
}

// Walk one spec's pages. Returns { listings, pages, maxPage, errors, stoppedBecause }.
async function fetchJimmyListPages(spec, { pace = PACE_MS, fetchImpl = null, now = Date.now(), seen = new Set() } = {}) {
  const listings = [];
  const errors = [];
  let pages = 0;
  let maxPage = 1;
  let stoppedBecause = "last_page";
  for (let pageNum = 1; pageNum <= Math.max(1, spec.maxPages ?? 1); pageNum++) {
    if (pageNum > maxPage) {
      stoppedBecause = "last_page";
      break;
    }
    if (pages > 0 && pace > 0) await new Promise((r) => setTimeout(r, pace));
    const url = specUrl(spec, pageNum);
    pages++;
    let html;
    try {
      const res = fetchImpl ? await fetchImpl(url) : await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (err) {
      errors.push(`${spec.slug}/${spec.format}/${spec.window} ${spec.label} p${pageNum}: ${err.name === "AbortError" ? "timeout" : err.message}`);
      stoppedBecause = "error";
      break;
    }
    if (pageNum === 1) maxPage = maxPageFromHtml(html);
    const rows = parseJimmyHtml(html, { marketplace: spec.marketplace, format: spec.format, now, listUrl: specUrl(spec, 1) });
    let added = 0;
    for (const it of rows) {
      const key = `${it.marketplace}:${it.ebayItemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      listings.push(it);
      added++;
    }
    if (rows.length === 0) {
      stoppedBecause = "empty_page";
      break;
    }
    if (added === 0 && pageNum > 1) {
      stoppedBecause = "nothing_new";
      break;
    }
  }
  return { listings, pages, maxPage, errors, stoppedBecause };
}

module.exports = { fetchJimmyFeed, jimmyListPlan, jimmyListSpecs, specUrl, fetchJimmyListPages, maxPageFromHtml, parseJimmyHtml, foundAtFromAgo, JIMMY_SOURCE, JIMMY_BASE, JIMMY_MARKETS, JIMMY_FORMATS, JIMMY_WINDOWS, JIMMY_SORTS, JIMMY_QUICK_SORTS, SEALED_SEARCH_TERMS, SEALED_TITLE_RE };
