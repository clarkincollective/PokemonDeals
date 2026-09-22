import SkipToContent from "@/components/SkipToContent";
import Link from "next/link";
import { fetchAllDealsPage, fetchHubCounts, fetchSetSlugs } from "@/lib/deals";
import { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS, categoryShortLabel } from "@/lib/dealCategories";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DealGrid from "@/components/DealGrid";
import DealsBrowseGuide from "@/components/DealsBrowseGuide";
import Breadcrumbs from "@/components/Breadcrumbs";
import { normalizePublicText } from "@/lib/publicText";
import { serializeJsonLd } from "@/lib/jsonLd";

const SITE_URL = "https://pokemondealfinder.com";
// "All deals": every eligible stored listing across the six eBay
// marketplaces, with exact counts (lib/allDealsInventory). Still framed as
// browsing rather than the head term, so the curated homepage stays the
// primary candidate for "Pokemon card deals" (docs/seo-headterm-strategy).
// The deal categories stay linked from here and link back.
//
// Indexability: the clean /deals is the one indexable, self-canonical page.
// Filters, search and ?page= are read client-side (DealGrid) from the same
// static HTML, which canonicalises to /deals; those variants are also sent
// X-Robots-Tag noindex,follow by next.config.mjs, and filter pills are
// nofollow.
//
// No <RegionRedirect />: that component writes the visitor's stored or
// geo-detected region into ?country=, which would turn "all marketplaces"
// into one marketplace. The listing marketplace is a filter here, never
// inferred from where the visitor is.
const TITLE = "All Pokemon Card Deals by Price, Grade & Market";
const DESCRIPTION =
  "Every Pokemon card listing we track across six eBay marketplaces, in one list. Filter raw or graded, Buy It Now or auction, price and marketplace.";

export const revalidate = 600;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/deals" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/deals` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const CATEGORY_LINK =
  "shrink-0 whitespace-nowrap rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-zinc-50";

export default async function AllDealsPage() {
  const [initial, hubCounts, validSetSlugs] = await Promise.all([
    fetchAllDealsPage({ sort: "newest", page: 1 }),
    fetchHubCounts({ language: "english" }),
    fetchSetSlugs("english"),
  ]);
  const { deals } = initial;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "All deals", item: `${SITE_URL}/deals` },
    ],
  };
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "All deals",
    description: DESCRIPTION,
    url: `${SITE_URL}/deals`,
  };
  const itemListJsonLd =
    deals.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "All deals",
          numberOfItems: deals.length,
          itemListElement: deals.map((d, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/deals/${d.id}`,
            name: normalizePublicText(d.watchlist?.name ? `${d.watchlist.name} (${d.watchlist.set})` : d.title),
          })),
        }
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }} />
      )}
      <SkipToContent />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
          <Breadcrumbs items={[{ name: "Deals", href: "/" }, { name: "All deals" }]} />
          <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            All deals
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            Every eligible Pokemon card listing we track, English and Japanese, across six eBay marketplaces, newest
            first. Sealed products have their own page.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-zinc-600 dark:text-zinc-400">
            A marketplace is the eBay site a listing is on, not where it ships; each listing states its own shipping.
            Savings appear only where a matching market comparison exists. Price filters use US dollars.
          </p>
          <nav aria-label="Deal categories" className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Or browse a category</p>
            <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
              {DEAL_CATEGORY_SLUGS.map((s) => (
                <Link key={s} href={`/deals/${s}`} className={CATEGORY_LINK} title={DEAL_CATEGORIES[s].h1}>
                  {categoryShortLabel(s)}
                </Link>
              ))}
              <Link href="/japanese-cards" className={CATEGORY_LINK} title="Japanese Pokemon Card Deals">
                Japanese
              </Link>
              <Link href="/sealed-deals" className={CATEGORY_LINK} title="Sealed Pokemon Product Deals">
                Sealed
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="scroll-mt-6 mx-auto w-full max-w-[92rem] flex-1 px-6 py-6 sm:py-8">
        <DealGrid
          kind="all"
          basePath="/deals"
          initial={initial}
          hubCounts={hubCounts}
          emptyLabel="No listings are available to browse right now. Check back after the next scan."
          validSetSlugs={validSetSlugs}
          subjectLabel="matching"
        />

        {/* 2026-09-21: the browse guide sits BELOW the grid - listings are
            what a visitor came for, and the homepage fold rule applies
            here too. Static content; no data, no figures. */}
        <DealsBrowseGuide />
      </main>

      <SiteFooter />
    </div>
  );
}
