import { supabase } from "@/lib/supabaseClient";
import { fetchSets } from "@/lib/deals";

const SITE_URL = "https://pokemondealfinder.com";

// Real, individually-indexable deal pages are a big source of long-tail
// search traffic for an aggregator site like this one (a search for one
// specific card's name + "deal" landing directly on that card's page) -
// worth indexing well beyond a token handful. Capped well under the
// sitemap protocol's 50,000-URL limit, not because more wouldn't be
// useful, but because most of these churn (sold/expired) within days -
// there's no benefit to listing ones so old they've likely already
// rotated out, and an expired deal is noindex'd anyway (see
// deals/[id]/page.js) so it naturally drops out of the index shortly
// after Google notices, no sitemap change needed.
const MAX_DEAL_URLS = 5000;
// Supabase/PostgREST silently caps any single request at 1,000 rows
// regardless of the requested limit - paging with .range() is required
// to actually reach MAX_DEAL_URLS.
const PAGE_SIZE = 1000;

async function fetchActiveDealIds(max, table = "deals") {
  const all = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data } = await supabase
      .from(table)
      .select("id, last_seen_at")
      .eq("is_active", true)
      .order("last_seen_at", { ascending: false })
      .range(from, to);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < to - from + 1) break; // ran out early
  }
  return all;
}

// Regenerated on each crawl request (Next.js caches per its own data
// rules) - deal pages churn constantly as listings sell/expire, so a
// static file would go stale fast.
export default async function sitemap() {
  const staticRoutes = [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/best-finds`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/sets`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/japanese-cards`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/sealed-deals`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/search`, changeFrequency: "monthly", priority: 0.7 },
  ];

  const [deals, sealedDeals, { sets }] = await Promise.all([
    fetchActiveDealIds(MAX_DEAL_URLS),
    fetchActiveDealIds(MAX_DEAL_URLS, "sealed_deals"),
    fetchSets({ language: "english" }),
  ]);

  // Real /sets/[slug] category pages - one per set with an active deal
  // right now (see app/sets/[slug]/page.js). A set with zero current
  // deals simply doesn't get a sitemap entry rather than listing an
  // empty page - it'll reappear here as soon as a real deal exists.
  const setRoutes = sets.map((s) => ({
    url: `${SITE_URL}/sets/${s.slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const dealRoutes = deals.map((deal) => ({
    url: `${SITE_URL}/deals/${deal.id}`,
    lastModified: deal.last_seen_at,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  const sealedDealRoutes = sealedDeals.map((deal) => ({
    url: `${SITE_URL}/sealed-deals/${deal.id}`,
    lastModified: deal.last_seen_at,
    changeFrequency: "hourly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...setRoutes, ...dealRoutes, ...sealedDealRoutes];
}
