import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabaseClient";
import { fetchSets, fetchCardHubs, fetchSpeciesHubs } from "@/lib/deals";
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
  for (let from = 0; from < MAX_DEAL_URLS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, MAX_DEAL_URLS) - 1;
    const { data } = await supabase
      .from(table)
      .select("id, last_seen_at")
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
      all.push(row);
    }
    if (data.length < to - from + 1) break;
  }
  return all;
}

const fetchActiveDealIds = unstable_cache(fetchActiveDealIdsUncached, ["sitemap-deal-ids"], {
  revalidate: 900,
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
      const { sets } = await fetchSets({ language: "english" });
      return sets.map((s) => ({ loc: `${SITE_URL}/sets/${s.slug}`, changefreq: "daily", priority: 0.7 }));
    }

    case "pokemon": {
      const { species } = await fetchSpeciesHubs({ language: "english" });
      return species.map((s) => ({ loc: `${SITE_URL}/pokemon/${s.slug}`, changefreq: "daily", priority: 0.75 }));
    }

    case "cards": {
      const { hubs } = await fetchCardHubs({ language: "english" });
      return hubs.map((h) => ({ loc: `${SITE_URL}/cards/${h.slug}`, changefreq: "hourly", priority: 0.75 }));
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
  const lastmod = new Date().toISOString();
  const rows = SITEMAP_SEGMENTS.map(
    (id) => `  <sitemap><loc>${SITE_URL}/sitemaps/${id}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</sitemapindex>\n`;
}

export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=900, stale-while-revalidate=86400";
