import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchSets, fetchCatalogSets, fetchCardHubs, fetchSpeciesHubs, fetchCatalogCardSitemapRows, fetchCatalogSpecies } from "@/lib/deals";
import { isDisplayableDeal, isDisplayableSealedDeal, savingsClaimTrusted } from "@/lib/dealQuality";
import { DEAL_CATEGORY_SLUGS } from "@/lib/dealCategories";
import { GUIDES } from "@/lib/guides";
import { CARD_SITEMAP_SEGMENTS, isCardSitemapSegment, assignCardShards, cardSitemapSnapshotId, sanitizeLastmodMap } from "@/lib/cardSitemap";

// Segmented sitemaps (brief Phase 12). Next's built-in `sitemap.js` +
// `generateSitemaps` produces child files but no index, and a hand-rolled
// index route conflicts with that convention - so the whole thing is
// route handlers instead:
//
//   /sitemap.xml            -> app/sitemap.xml/route.js   (the index)
//   /sitemaps/<segment>.xml -> app/sitemaps/[segment]/route.js
//
// robots.txt points crawlers at /sitemap.xml.

export const SITE_URL = "https://pokemondealfinder.com";
// SEO-3: the single flat cards child became four value-band shards
// (lib/cardSitemap.js CARD_VALUE_BANDS) so Google gets a crawl-priority
// signal across the ~23.7k card pages and GSC reports coverage per cohort.
export const SITEMAP_SEGMENTS = ["pages", "sets", "pokemon", ...CARD_SITEMAP_SEGMENTS, "deals", "sealed-deals"];

// Individually-indexable deal pages are real long-tail traffic, worth
// listing well past a token handful - but capped under the 50k-per-file
// protocol limit because they churn (sold/expired) within days and an
// expired deal is noindex'd anyway (see app/deals/[id]/page.js).
const MAX_DEAL_URLS = 5000;
const PAGE_SIZE = 1000; // PostgREST caps a single request at 1,000 rows

async function fetchActiveDealIdsUncached(table) {
  const seen = new Set();
  const all = [];
  // The /deals/[id] and /sealed-deals/[id] pages render noindex (no
  // canonical) not just for is_active=false rows but for anything the
  // display gate hides - unverifiable condition, wrong language, ended
  // auction, non-exact CTA, listing<->catalogue identity mismatch. The
  // sitemap must list ONLY what actually renders as an indexable page, so
  // it applies the same gate (isDisplayableDeal for cards; the exact-CTA
  // + live-auction subset for sealed, which has no raw-card condition).
  const sealed = table === "sealed_deals";
  // 17C.7: a plain listing (shown, but with no evidenced savings claim)
  // renders noindex on its page, so it must not enter the sitemap either.
  const pageIndexable = sealed
    ? (r) => isDisplayableSealedDeal(r) && savingsClaimTrusted(r)
    : (r) => isDisplayableDeal(r) && savingsClaimTrusted(r);
  // For the deals table `pageIndexable` is isDisplayableDeal, which the
  // /deals/[id] page evaluates against the FULL row (select "*"). The
  // sitemap must select every column that gate reads, or a row hidden on
  // its page (noindex) can still enter the sitemap - the visual-
  // authenticity + trust-signal columns were missing, so a
  // COUNTERFEIT_MISMATCH / IDENTITY_MISMATCH active deal was listed while
  // its page rendered noindex. Kept in sync with the columns
  // lib/dealQuality's isDisplayableDeal reads (see
  // tests/scanner/sitemap-parity.test.mjs).
  const cols = sealed
    ? "id, last_seen_at, first_seen_at, title, listing_id, listing_url, affiliate_url, listing_type, auction_end_at, " +
      "sealed_watchlist:sealed_watchlist_id (set)"
    : "id, last_seen_at, first_seen_at, exact_verified_at, is_active, is_graded, condition, title, card_name, card_set, card_language, " +
      "listing_id, listing_url, affiliate_url, listing_type, auction_end_at, disqualified_reason, " +
      "visual_authenticity_status, visual_authenticity_reason, discount_pct, market_price, " +
      "grade, grader, image_count, returns_accepted, seller_feedback_score";
  for (let from = 0; from < MAX_DEAL_URLS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, MAX_DEAL_URLS) - 1;
    const { data } = await supabase
      .from(table)
      .select(cols)
      .eq("is_active", true)
      // A whole scan batch shares one last_seen_at, so ordering by it
      // alone isn't a stable sort across .range() pages - a tied row can
      // land on two consecutive pages and get emitted twice. `id` is the
      // unique tiebreaker; the Set is belt-and-braces.
      .order("last_seen_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (!pageIndexable(row)) continue; // page would be noindex -> not in the sitemap
      all.push({ id: row.id, last_seen_at: row.last_seen_at });
    }
    if (data.length < to - from + 1) break;
  }
  return all;
}

// 300s (not 900): deals are ephemeral, and a just-expired listing is
// noindex on its page the moment is_active flips / the freshness TTL
// lapses. A shorter window keeps the sitemap from advertising a URL
// Google will fetch and find noindex - see the sealed equivalent and the
// route-level revalidate, both 300 for the same reason.
const fetchActiveDealIds = unstable_cache(fetchActiveDealIdsUncached, ["sitemap-deal-ids"], {
  revalidate: 300,
});

// SEO-3 lastmod source: one read-only SQL function
// (supabase/card_reference_lastmod_migration.sql) returning, per KEYSET
// PAGE of English catalogue cards, {cards, last_key, lastmod:
// {tcgplayer_id: "YYYY-MM-DD"}} - the date each card's Near Mint market
// reference last CHANGED, the exact semantic of lib/cardSitemap.js
// cardReferenceLastmod(). Pages partition the tcgplayer_id key space
// (p_after, last_key], so every card is computed exactly once, inside one
// statement. Phase 17B: a single whole-table call exceeded the API's 8 s
// statement timeout; a 2,500-card page reads <= ~200k history rows.
//
// Service-role client, deliberately: price_history is deny-all to anon
// (RLS on, no policy) and the function is SECURITY INVOKER, so through
// the public client it would return an EMPTY object - no error, no
// <lastmod>, nothing to notice. The card pages already read price_history
// the same way (lib/deals.js fetchCardPriceHistoryUncached). EXECUTE is
// granted to service_role only.
//
// If the function is absent or errors, the card sitemaps still render -
// just without <lastmod>; nothing is ever substituted for it. Any value
// that is not a real calendar day no later than tomorrow (UTC) is
// dropped, not repaired.
export const LASTMOD_PAGE_CARDS = 2500;
const LASTMOD_MAX_PAGES = 40; // 100k cards - ~3x today's catalogue

async function fetchCardLastmodMapUncached() {
  const db = supabaseAdmin();
  const map = {};
  let after = "";
  for (let page = 0; page < LASTMOD_MAX_PAGES; page++) {
    const { data, error } = await db.rpc("card_reference_lastmod", { p_after: after, p_limit: LASTMOD_PAGE_CARDS });
    // thrown, not returned: unstable_cache never stores a thrown result,
    // so an absent / failing function is retried on the next request
    // instead of being remembered as "unavailable" (or half-complete) for
    // the cache window - a partial map is never returned
    if (error) throw new Error(error.message);
    if (data == null || typeof data !== "object" || Array.isArray(data) || typeof data.cards !== "number") {
      throw new Error("card_reference_lastmod returned an unexpected shape");
    }
    for (const [id, day] of Object.entries(sanitizeLastmodMap(data.lastmod))) {
      if (id in map) throw new Error(`card_reference_lastmod pages overlap at ${id}`);
      map[id] = day;
    }
    if (data.cards < LASTMOD_PAGE_CARDS || data.last_key == null) return map;
    if (typeof data.last_key !== "string" || data.last_key === after) throw new Error("card_reference_lastmod keyset did not advance");
    after = data.last_key;
  }
  throw new Error("card_reference_lastmod exceeded its page budget");
}

// Cached on its own (~0.5 MB for ~25k cards, well under the data cache's
// 2 MB entry limit), the same 6h window as the catalogue rows.
const fetchCardLastmodMapCached = unstable_cache(fetchCardLastmodMapUncached, ["card-sitemap-lastmod"], {
  revalidate: 21600,
});

export async function fetchCardLastmodMap() {
  try {
    return { map: await fetchCardLastmodMapCached(), source: "rpc", error: null };
  } catch (e) {
    console.warn(`card sitemap lastmod unavailable (${e?.message ?? e}) - emitting card shards without <lastmod>`);
    return { map: {}, source: "unavailable", error: String(e?.message ?? e) };
  }
}

// ONE shared card-sitemap snapshot for all four shards: the live-deal hubs
// + the indexable catalogue rows (the same membership the old single
// cards child had - hub slugs first, catalogue slugs de-duplicated
// against them) classified into value bands, with the lastmod map joined
// on tcgplayer_id.
//
// SEO-3.1: the composed dataset (~2.3 MB) is NOT itself cached - Next's
// data cache refuses entries over 2 MB, so caching it silently did
// nothing. Instead its three INPUTS are cached (hubs 900s; catalogue
// tuples and the lastmod map 6h, populated by the same first request and
// so expiring together) and the shards are recomputed from them per
// request in milliseconds. All four shard requests therefore read the
// same cached input generations; the snapshot id below is derived from
// the result, so any divergence is visible rather than silent.
export async function fetchCardSitemapDataset() {
  const [{ hubs }, { rows: catalogRows }, lastmod] = await Promise.all([
    fetchCardHubs({ language: "english" }),
    fetchCatalogCardSitemapRows(),
    fetchCardLastmodMap(),
  ]);
  const bySlug = new Map();
  const byTcg = new Map();
  for (const t of catalogRows) {
    bySlug.set(t[0], t);
    if (t[1] != null && !byTcg.has(t[1])) byTcg.set(t[1], t);
  }
  const cards = [];
  const seen = new Set();
  for (const h of hubs) {
    // a hub's value band comes from the SAME canonical catalogue reference
    // as every other card (by slug, else by the hub's tcgplayer id) - a
    // hub is a card with live listings, not a differently-priced entity;
    // a hub whose reference is null stays null (assignCardShards places it
    // by the no-reference rule, nothing is guessed)
    const cat = bySlug.get(h.slug) ?? (h.tcgplayerId != null ? byTcg.get(String(h.tcgplayerId)) : null) ?? null;
    cards.push({ slug: h.slug, tcgplayerId: h.tcgplayerId != null ? String(h.tcgplayerId) : cat?.[1] ?? null, marketPrice: cat?.[2] ?? null, hub: true });
    seen.add(h.slug);
  }
  for (const t of catalogRows) {
    if (seen.has(t[0])) continue;
    seen.add(t[0]);
    cards.push({ slug: t[0], tcgplayerId: t[1], marketPrice: t[2], hub: false });
  }
  const hubSlugs = new Set(hubs.map((h) => h.slug));
  const lastmodByTcg = new Map(Object.entries(lastmod.map));
  const { shards, noReference } = assignCardShards(cards, lastmodByTcg);
  const out = {};
  for (const [key, entries] of shards) out[key] = entries.map((e) => ({ ...e, hub: hubSlugs.has(e.slug) }));
  // one identity for this generation, stamped into every card shard so the
  // four responses can be recognised as one snapshot (or not)
  const snapshotId = cardSitemapSnapshotId(shards);
  return { shards: out, noReference, lastmodSource: lastmod.source, cardCount: cards.length, snapshotId };
}

const STATIC_ROUTES = [
  { loc: `${SITE_URL}/`, changefreq: "always", priority: 1 },
  { loc: `${SITE_URL}/best-finds`, changefreq: "hourly", priority: 0.9 },
  { loc: `${SITE_URL}/deals`, changefreq: "hourly", priority: 0.8 },
  ...DEAL_CATEGORY_SLUGS.map((s) => ({
    loc: `${SITE_URL}/deals/${s}`,
    changefreq: "hourly",
    priority: 0.8,
  })),
  // 17C.8 - indexable hub (canonical, no noindex); its listings churn, but
  // the page itself is a stable browse entry point.
  { loc: `${SITE_URL}/latest-releases`, changefreq: "daily", priority: 0.8 },
  { loc: `${SITE_URL}/cards`, changefreq: "daily", priority: 0.8 },
  { loc: `${SITE_URL}/sets`, changefreq: "daily", priority: 0.8 },
  { loc: `${SITE_URL}/pokemon`, changefreq: "daily", priority: 0.8 },
  { loc: `${SITE_URL}/japanese-cards`, changefreq: "hourly", priority: 0.8 },
  { loc: `${SITE_URL}/sealed-deals`, changefreq: "hourly", priority: 0.8 },
  { loc: `${SITE_URL}/search`, changefreq: "monthly", priority: 0.7 },
  { loc: `${SITE_URL}/guides`, changefreq: "monthly", priority: 0.6 },
  ...GUIDES.map((g) => ({ loc: `${SITE_URL}/guides/${g.slug}`, changefreq: "yearly", priority: 0.5 })),
  { loc: `${SITE_URL}/how-it-works`, changefreq: "monthly", priority: 0.5 },
  { loc: `${SITE_URL}/methodology`, changefreq: "monthly", priority: 0.5 },
  { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: 0.4 },
  { loc: `${SITE_URL}/affiliate-disclosure`, changefreq: "yearly", priority: 0.3 },
  { loc: `${SITE_URL}/privacy`, changefreq: "yearly", priority: 0.3 },
  { loc: `${SITE_URL}/contact`, changefreq: "yearly", priority: 0.3 },
  { loc: `${SITE_URL}/market-data`, changefreq: "daily", priority: 0.6 },
  { loc: `${SITE_URL}/market-data/most-listed-cards`, changefreq: "daily", priority: 0.6 },
  { loc: `${SITE_URL}/market-data/most-expensive-cards`, changefreq: "daily", priority: 0.6 },
  {
    loc: `${SITE_URL}/market-data/pokemon-card-value-distribution`,
    changefreq: "weekly",
    priority: 0.6,
  },
  // A FIXED, DATED study: its figures describe 2026-08-12 to 2026-09-11 and
  // are never refreshed, so it changes only if we revise the page itself.
  // No <lastmod>: no STATIC_ROUTE carries one, and the study's observation
  // dates are NOT a modification date - stamping them here would assert
  // something untrue about when the page last changed.
  {
    loc: `${SITE_URL}/market-data/pokemon-reference-price-changes`,
    changefreq: "yearly",
    priority: 0.6,
  },
];

export async function segmentEntries(segment) {
  // SEO-3 card shards - all four derive from one cached snapshot. Live-deal
  // hubs keep the higher priority / hourly hint the old flat child gave
  // them; catalogue-only cards keep weekly / 0.6. <lastmod> is the truthful
  // per-card reference-change date, omitted when no history exists.
  if (isCardSitemapSegment(segment)) {
    const dataset = await fetchCardSitemapDataset();
    return (dataset.shards[segment] ?? []).map((e) => ({
      loc: `${SITE_URL}/cards/${e.slug}`,
      ...(e.lastmod ? { lastmod: e.lastmod } : {}),
      changefreq: e.hub ? "hourly" : "weekly",
      priority: e.hub ? 0.75 : 0.6,
    }));
  }

  switch (segment) {
    case "pages":
      return STATIC_ROUTES;

    case "sets": {
      // Deal-backed set hubs (>= SET_MIN_LISTINGS live deals): daily,
      // higher priority. Catalogue-backed set hubs (SEO Phase 4A, >=
      // SET_CATALOG_MIN_CARDS priced imaged cards, no live deal): weekly,
      // lower priority, de-duplicated against the deal-backed slugs.
      // fetchCatalogSets uses the exact predicate resolveSetSlug does, so
      // a below-threshold set is never listed.
      const [{ sets }, { sets: catalogSets }] = await Promise.all([
        fetchSets({ language: "english" }),
        fetchCatalogSets(),
      ]);
      const dealSlugs = new Set(sets.map((s) => s.slug));
      const entries = sets.map((s) => ({
        loc: `${SITE_URL}/sets/${s.slug}`,
        changefreq: "daily",
        priority: 0.7,
      }));
      for (const s of catalogSets) {
        if (dealSlugs.has(s.slug)) continue;
        entries.push({ loc: `${SITE_URL}/sets/${s.slug}`, changefreq: "weekly", priority: 0.6 });
      }
      return entries;
    }

    case "pokemon": {
      // Deal-backed species hubs (>= SPECIES_MIN_LISTINGS live listings):
      // daily, higher priority. Catalog-backed species hubs (Phase 4 P1,
      // >= SPECIES_CATALOG_MIN_CARDS real priced imaged cards, no live
      // deal): the route indexes these too - weekly, lower priority,
      // de-duplicated against the deal-backed slugs. fetchCatalogSpecies
      // uses the exact predicate the route's `indexable` check does, so a
      // noindex species is never listed.
      const [{ species }, { species: catalogSpecies }] = await Promise.all([
        fetchSpeciesHubs({ language: "english" }),
        fetchCatalogSpecies(),
      ]);
      const dealSlugs = new Set(species.map((s) => s.slug));
      const entries = species.map((s) => ({
        loc: `${SITE_URL}/pokemon/${s.slug}`,
        changefreq: "daily",
        priority: 0.75,
      }));
      for (const s of catalogSpecies) {
        if (dealSlugs.has(s.slug)) continue;
        entries.push({ loc: `${SITE_URL}/pokemon/${s.slug}`, changefreq: "weekly", priority: 0.6 });
      }
      return entries;
    }

    case "deals": {
      const rows = await fetchActiveDealIds("deals");
      return rows.map((d) => ({
        loc: `${SITE_URL}/deals/${d.id}`,
        lastmod: d.last_seen_at,
        changefreq: "hourly",
        priority: 0.6,
      }));
    }

    case "sealed-deals": {
      const rows = await fetchActiveDealIds("sealed_deals");
      return rows.map((d) => ({
        loc: `${SITE_URL}/sealed-deals/${d.id}`,
        lastmod: d.last_seen_at,
        changefreq: "hourly",
        priority: 0.5,
      }));
    }

    default:
      return null;
  }
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The route renders a segment through this so a card shard can carry its
// snapshot identity as a leading XML comment (not a <lastmod>, not a
// clock - the deterministic hash of the membership it was cut from).
export async function segmentXml(segment) {
  const entries = await segmentEntries(segment);
  if (entries == null) return null;
  if (isCardSitemapSegment(segment)) {
    const dataset = await fetchCardSitemapDataset();
    return urlsetXml(entries, { comment: `card-sitemap snapshot ${dataset.snapshotId} lastmod-source ${dataset.lastmodSource}` });
  }
  return urlsetXml(entries);
}

export function urlsetXml(entries, { comment = null } = {}) {
  const rows = entries
    .map((e) => {
      const parts = [`<loc>${xmlEscape(e.loc)}</loc>`];
      // A date-only lastmod (card shards: the observation granularity is a
      // day) is emitted as the W3C date form; a full timestamp (deals:
      // last_seen_at) keeps the ISO datetime form.
      if (e.lastmod) {
        const v = /^\d{4}-\d{2}-\d{2}$/.test(String(e.lastmod)) ? String(e.lastmod) : new Date(e.lastmod).toISOString();
        parts.push(`<lastmod>${xmlEscape(v)}</lastmod>`);
      }
      if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
      if (e.priority != null) parts.push(`<priority>${e.priority}</priority>`);
      return `  <url>${parts.join("")}</url>`;
    })
    .join("\n");
  const head = comment ? `<!-- ${String(comment).replace(/--/g, "-")} -->\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n${head}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

export function indexXml() {
  // The sitemap index deliberately carries no last-modified timestamp on
  // its child entries. It used to stamp the current wall-clock time on
  // every one of the six children on every regeneration - a meaningless
  // "everything changed right now" signal. That element is optional in a
  // sitemap index, and Google wants it to reflect a real content change;
  // the child sitemaps are short-revalidate aggregates with no single
  // trustworthy "last meaningfully changed" moment, so the honest choice
  // is to omit it rather than fabricate one. The per-URL timestamps
  // inside the deal / sealed child sitemaps are still emitted - those are
  // real (the listing's own last_seen_at from the scanner).
  const rows = SITEMAP_SEGMENTS.map(
    (id) => `  <sitemap><loc>${SITE_URL}/sitemaps/${id}.xml</loc></sitemap>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</sitemapindex>\n`;
}

// Stable segments (pages/sets/pokemon/cards) + the index: content is
// long-lived and never goes noindex, so a 15-minute edge cache with a
// 24h stale-while-revalidate is fine - a crawler never waits and the
// worst case is a slightly old catalogue URL, which still 200s + indexes.
export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=900, stale-while-revalidate=86400";

// Ephemeral segments (deals/sealed-deals): every entry can flip to
// is_active=false -> noindex within days. The 24h SWR above let a
// just-expired listing linger in the served XML for ~48h on this
// low-traffic endpoint (SEO-GSC re-audit: 3/826 deal URLs were 48h
// stale). A short edge cache with a short SWR bounds that to minutes:
// after s-maxage the next fetch revalidates and, within one more SWR
// window, everyone gets the fresh list. The underlying id query is still
// unstable_cache'd at 300s, so origin load stays low.
export const SITEMAP_CACHE_CONTROL_EPHEMERAL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=300";

// Segments whose membership churns (a URL can become noindex) and so must
// not be edge-cached with a long stale-while-revalidate.
export const EPHEMERAL_SEGMENTS = new Set(["deals", "sealed-deals"]);

// SEO-3 card shards: all four are cut from ONE cached dataset (the
// application invariant: within a snapshot every card is in exactly one
// shard, and every shard carries that snapshot's id). The route renders
// per request from that shared data cache (no per-child ISR copy), so the
// ONLY way two shards can show different snapshots is the edge serving a
// stale copy of one child while another was re-fetched after the 6h
// dataset regenerated. This short edge window (5 min fresh + 5 min
// stale-while-revalidate, the same policy the ephemeral deal segments
// use) bounds that overlap to ~10 minutes worst case; it re-serialises
// from the cached dataset, it never re-queries.
export const SITEMAP_CACHE_CONTROL_CARDS = "public, max-age=0, s-maxage=300, stale-while-revalidate=300";

export function cacheControlForSegment(segment) {
  if (EPHEMERAL_SEGMENTS.has(segment)) return SITEMAP_CACHE_CONTROL_EPHEMERAL;
  if (isCardSitemapSegment(segment)) return SITEMAP_CACHE_CONTROL_CARDS;
  return SITEMAP_CACHE_CONTROL;
}
