import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";
import { fetchSets, fetchCatalogSets, fetchCardHubs, fetchSpeciesHubs, fetchCatalogCardSlugs, fetchCatalogSpecies } from "@/lib/deals";
import { isDisplayableDeal, isExactEbayDealDestination, auctionEnded } from "@/lib/dealQuality";
import { DEAL_CATEGORY_SLUGS } from "@/lib/dealCategories";
import { GUIDES } from "@/lib/guides";

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
export const SITEMAP_SEGMENTS = ["pages", "sets", "pokemon", "cards", "deals", "sealed-deals"];

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
  const pageIndexable = sealed
    ? (r) => isExactEbayDealDestination(r) && !auctionEnded(r)
    : isDisplayableDeal;
  const cols = sealed
    ? "id, last_seen_at, listing_id, listing_url, affiliate_url, listing_type, auction_end_at"
    : "id, last_seen_at, is_active, is_graded, condition, title, card_name, card_set, card_language, listing_id, listing_url, affiliate_url, listing_type, auction_end_at, disqualified_reason";
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

const STATIC_ROUTES = [
  { loc: `${SITE_URL}/`, changefreq: "always", priority: 1 },
  { loc: `${SITE_URL}/best-finds`, changefreq: "hourly", priority: 0.9 },
  { loc: `${SITE_URL}/deals`, changefreq: "hourly", priority: 0.8 },
  ...DEAL_CATEGORY_SLUGS.map((s) => ({
    loc: `${SITE_URL}/deals/${s}`,
    changefreq: "hourly",
    priority: 0.8,
  })),
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
  { loc: `${SITE_URL}/contact`, changefreq: "yearly", priority: 0.3 },
  { loc: `${SITE_URL}/market-data`, changefreq: "daily", priority: 0.6 },
  { loc: `${SITE_URL}/market-data/most-listed-cards`, changefreq: "daily", priority: 0.6 },
  { loc: `${SITE_URL}/market-data/most-expensive-cards`, changefreq: "daily", priority: 0.6 },
];

export async function segmentEntries(segment) {
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

    case "cards": {
      // Live-deal hubs: change often, higher priority. Catalog-backed
      // pages (Phase 4 P0): stable reference pages for cards with no
      // current deal - always present, so weekly / lower priority. A card
      // with a live hub is served by the hub template at the same URL, so
      // its slug is excluded from the catalog set to avoid a duplicate
      // <loc>.
      const [{ hubs }, { slugs: catalogSlugs }] = await Promise.all([
        fetchCardHubs({ language: "english" }),
        fetchCatalogCardSlugs(),
      ]);
      const hubSlugs = new Set(hubs.map((h) => h.slug));
      const entries = hubs.map((h) => ({
        loc: `${SITE_URL}/cards/${h.slug}`,
        changefreq: "hourly",
        priority: 0.75,
      }));
      for (const slug of catalogSlugs) {
        if (hubSlugs.has(slug)) continue;
        entries.push({ loc: `${SITE_URL}/cards/${slug}`, changefreq: "weekly", priority: 0.6 });
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

export function urlsetXml(entries) {
  const rows = entries
    .map((e) => {
      const parts = [`<loc>${xmlEscape(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`<lastmod>${xmlEscape(new Date(e.lastmod).toISOString())}</lastmod>`);
      if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
      if (e.priority != null) parts.push(`<priority>${e.priority}</priority>`);
      return `  <url>${parts.join("")}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
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

export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=900, stale-while-revalidate=86400";
