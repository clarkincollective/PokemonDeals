import Link from "next/link";
import { fetchDealsPage, fetchHubCounts, fetchSetSlugs } from "@/lib/deals";
import { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } from "@/lib/dealCategories";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import Breadcrumbs from "@/components/Breadcrumbs";

const SITE_URL = "https://pokemondealfinder.com";
// Framed as "browse by category" so the homepage stays the primary
// candidate for the head term "Pokemon card deals" and this page owns
// the long-tail ("pokemon cards under $50", "graded pokemon card deals",
// "vintage pokemon card deals") without competing head-on.
const TITLE = "Browse Pokemon Card Deals by Price, Grade & Era";
const DESCRIPTION =
  "Pokemon card deals grouped by price band, condition and era — cards under $25/$50/$100, graded (PSA/CGC/BGS), auctions, vintage WOTC and modern. All live eBay listings checked against real market data.";

export const revalidate = 300;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/deals" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/deals` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function DealsIndexPage() {
  const [{ deals }, hubCounts, validSetSlugs] = await Promise.all([
    fetchDealsPage({ table: "deals", language: "english", sort: "newest", page: 1, pageSize: 12 }),
    fetchHubCounts({ language: "english" }),
    fetchSetSlugs("english"),
  ]);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Deal categories", item: `${SITE_URL}/deals` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Pokemon card deal categories",
    numberOfItems: DEAL_CATEGORY_SLUGS.length,
    itemListElement: DEAL_CATEGORY_SLUGS.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/deals/${s}`,
      name: DEAL_CATEGORIES[s].h1,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <SiteHeader />
      <RegionRedirect />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <Breadcrumbs items={[{ name: "Deals", href: "/" }, { name: "Deal categories" }]} />
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Browse Pokemon Card Deals by Price, Grade &amp; Era
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            Every deal below is a live eBay listing our scan found priced under its real market value.
            Pick a price band, condition or era — or see the newest finds across everything below.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Deal categories</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEAL_CATEGORY_SLUGS.map((s) => (
              <Link
                key={s}
                href={`/deals/${s}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <p className="font-semibold text-black dark:text-zinc-50">{DEAL_CATEGORIES[s].h1}</p>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {DEAL_CATEGORIES[s].intro}
                </p>
              </Link>
            ))}
            <Link
              href="/japanese-cards"
              className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <p className="font-semibold text-black dark:text-zinc-50">Japanese Pokemon Card Deals</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Below-market deals from the Japanese catalogue.
              </p>
            </Link>
            <Link
              href="/sealed-deals"
              className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <p className="font-semibold text-black dark:text-zinc-50">Sealed Pokemon Product Deals</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Booster boxes, ETBs and bundles below market.
              </p>
            </Link>
          </div>
        </section>

        {deals.length > 0 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Newest finds</h2>
              <Link href="/" className="text-sm font-medium text-red-600 hover:underline dark:text-red-500">
                All deals →
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  hub={hubCounts[deal.watchlist_id]}
                  pageName="deals_index"
                  validSetSlugs={validSetSlugs}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
