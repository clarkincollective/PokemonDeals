import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import {
  fetchDealsPage,
  fetchSets,
  fetchHubCounts,
  fetchSetSlugs,
} from "@/lib/deals";
import { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS, isModernSet } from "@/lib/dealCategories";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import DealGrid from "@/components/DealGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

// Metadata for one /deals/<category>/ route. Called from
// app/deals/[id]/page.js's generateMetadata when the [id] segment is a
// known category slug.
export function dealCategoryMetadata(slug) {
  const cat = DEAL_CATEGORIES[slug];
  if (!cat || cat.redirect) return { title: "Not found", robots: { index: false, follow: true } };
  const canonical = `/deals/${slug}`;
  return {
    title: cat.title,
    description: cat.description,
    alternates: { canonical },
    openGraph: { title: cat.title, description: cat.description, url: `${SITE_URL}${canonical}` },
    twitter: { card: "summary", title: cat.title, description: cat.description },
  };
}

async function resolveCategorySets(cat) {
  if (Array.isArray(cat.filter?.sets)) return cat.filter.sets;
  if (cat.filter?.modernEra) {
    const { sets } = await fetchSets({ language: "english" });
    return (sets ?? []).map((s) => s.set).filter(isModernSet);
  }
  return null;
}

// One clean deal landing page. Renders page 1 server-side (crawler HTML +
// first paint), then <DealGrid kind="category"> takes over for filters /
// pagination via /api/deals-page - identical pattern to /sets/[slug] and
// /pokemon/[slug], so the route stays statically cacheable.
export default async function DealCategoryPage({ slug }) {
  const cat = DEAL_CATEGORIES[slug];
  if (!cat) return null; // caller already guarded, belt-and-braces
  if (cat.redirect) permanentRedirect(cat.redirect);

  const sets = await resolveCategorySets(cat);
  const preset = { ...cat.filter };
  delete preset.sets;
  delete preset.modernEra;

  const [{ deals, totalPages, error }, hubCounts, validSetSlugs] = await Promise.all([
    fetchDealsPage({
      table: "deals",
      language: "english",
      ...preset,
      sets: sets ?? undefined,
      sort: cat.defaultSort ?? "newest",
      page: 1,
      pageSize: 24,
    }),
    fetchHubCounts({ language: "english" }),
    fetchSetSlugs("english"),
  ]);

  const basePath = `/deals/${slug}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Deal categories", item: `${SITE_URL}/deals` },
      { "@type": "ListItem", position: 3, name: cat.h1, item: `${SITE_URL}${basePath}` },
    ],
  };
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cat.h1,
    description: cat.description,
    url: `${SITE_URL}${basePath}`,
  };
  const itemListJsonLd =
    deals.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: cat.h1,
          numberOfItems: deals.length,
          itemListElement: deals.slice(0, 24).map((d, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/deals/${d.id}`,
            name: d.watchlist?.name ? `${d.watchlist.name} (${d.watchlist.set})` : d.title,
          })),
        }
      : null;

  const otherCategories = DEAL_CATEGORY_SLUGS.filter((s) => s !== slug);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}
      <SiteHeader />
      <RegionRedirect />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Breadcrumbs
            items={[
              { name: "Deals", href: "/" },
              { name: "Deal categories", href: "/deals" },
              { name: cat.h1 },
            ]}
          />
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {cat.h1}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">{cat.intro}</p>
          <p className="mt-2 text-xs text-zinc-400">
            Prices and availability on eBay change constantly — every listing is checked against real
            market data, but always confirm the current price and condition before buying.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        <DealGrid
          kind="category"
          slug={slug}
          basePath={basePath}
          initial={{ deals, totalPages }}
          hubCounts={hubCounts}
          emptyLabel={`No ${cat.h1.toLowerCase()} match these filters right now. Try clearing a filter, or check back after the next scan.`}
          validSetSlugs={validSetSlugs}
        />

        <nav className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">More deal categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {otherCategories.map((s) => (
              <Link
                key={s}
                href={`/deals/${s}`}
                className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
              >
                {DEAL_CATEGORIES[s].h1}
              </Link>
            ))}
            <Link
              href="/sets"
              className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
            >
              Browse by set
            </Link>
            <Link
              href="/pokemon"
              className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50"
            >
              Browse by Pokemon
            </Link>
          </div>
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}
