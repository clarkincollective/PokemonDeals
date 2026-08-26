import { supabase } from "@/lib/supabaseClient";

const SITE_URL = "https://pokemondealfinder.com";

// Regenerated on each crawl request (Next.js caches per its own data
// rules) - deal pages churn constantly as listings sell/expire, so a
// static file would go stale fast. Capped well under the sitemap
// protocol's 50,000-URL limit; only currently-active deals are listed,
// since an expired one is noindex'd anyway (see deals/[id]/page.js).
export default async function sitemap() {
  const staticRoutes = [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/best-finds`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/search`, changeFrequency: "monthly", priority: 0.7 },
  ];

  const { data: deals } = await supabase
    .from("deals")
    .select("id, last_seen_at")
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  const dealRoutes = (deals ?? []).map((deal) => ({
    url: `${SITE_URL}/deals/${deal.id}`,
    lastModified: deal.last_seen_at,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...dealRoutes];
}
