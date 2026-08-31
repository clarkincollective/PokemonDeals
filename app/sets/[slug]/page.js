import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  resolveSetSlug,
  fetchDealsPage,
  fetchHubCounts,
  fetchSetCatalog,
  fetchSetSealedCatalog,
  SET_CATALOG_MIN_CARDS,
  SET_SEALED_MIN_PRODUCTS,
} from "@/lib/deals";
import { setImage } from "@/lib/setImages";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import DealGrid from "@/components/DealGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import SpeciesCardList from "@/components/SpeciesCardList";
import CatalogueBrowser from "@/components/CatalogueBrowser";
import FeaturedValueCards from "@/components/FeaturedValueCards";
import { buildCatalogueItems } from "@/components/SpeciesCardsBySet";
import { hasPrice } from "@/lib/money";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// No request-time APIs on this route (page 1 is what renders server-side;
// pagination + filters are client-side via <DealGrid> / /api/deals-page),
// so this + an empty generateStaticParams makes it ISR-cacheable at the
// edge instead of a full render per crawler hit.
export async function generateStaticParams() {
  return [];
}

// Real category page targeting "<set name> deals / card values" search
// intent. See lib/deals.js's fetchSets/resolveSetSlug for how the slug
// maps back to a real set value - no fabricated content, just the real
// active deals for that set plus the real card_catalog listing for it.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resolved = await resolveSetSlug(slug);
  if (!resolved) return { title: "Set not found", robots: { index: false, follow: true } };

  const title = `${resolved.set} Card Deals`;
  const description = `Real below-market ${resolved.set} Pokemon card deals on eBay, checked against real market pricing - ${resolved.count} active right now.`;
  const canonical = `/sets/${slug}`;

  // One cheap extra row for a representative OG image - a real listing
  // from this set, not a fabricated one.
  const { deals: sample } = await fetchDealsPage({
    table: "deals",
    language: "english",
    set: resolved.set,
    page: 1,
    pageSize: 1,
  });
  const image = sample[0]?.image_url;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${canonical}`,
      images: image ? [image] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function SetDetailPage({ params }) {
  const { slug } = await params;

  const resolved = await resolveSetSlug(slug);
  if (!resolved) notFound();

  const [
    { deals, totalPages, error },
    hubCounts,
    { cards: catalogCards, totalCards: catalogTotal, truncated: catalogTruncated },
    { products: sealedProducts, totalProducts: sealedTotal, truncated: sealedTruncated },
  ] = await Promise.all([
    fetchDealsPage({
      table: "deals",
      language: "english",
      set: resolved.set,
      sort: "newest",
      page: 1,
      pageSize: 20,
    }),
    fetchHubCounts({ language: "english" }),
    fetchSetCatalog(resolved.set, "english"),
    fetchSetSealedCatalog(resolved.set, "english"),
  ]);

  const basePath = `/sets/${slug}`;
  const logo = setImage(resolved.set)?.logo ?? null;

  // Only show the full browse grid once card_catalog actually has a
  // meaningful slice of this set - see SET_CATALOG_MIN_CARDS. A thin
  // grid right now is almost always the known card_catalog backfill gap
  // (IMPLEMENTATION_STATUS "A4 - three-way coverage spot-check"), not a
  // bug here.
  const showCatalog = catalogCards.length >= SET_CATALOG_MIN_CARDS;

  // Client catalogue browser data (search / rarity / sort / disclosure) -
  // same shared component + tiles + ranking as the species page. Every
  // card stays in the SSR HTML; the browser only shows / hides / reorders.
  const catalogueItems = buildCatalogueItems(catalogCards, [slug]);
  // "Highest-value cards in this set" - up to 12, ranked ONLY by the
  // trustworthy market reference (never affiliate payout / random order).
  const featuredItems = [...catalogueItems]
    .filter((c) => hasPrice(c.refPrice))
    .sort((a, b) => Number(b.refPrice) - Number(a.refPrice))
    .slice(0, 12);

  const showSealed = sealedProducts.length >= SET_SEALED_MIN_PRODUCTS;
  const sealedDealCount = sealedProducts.filter((p) => p.deal).length;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Sets", item: `${SITE_URL}/sets` },
      { "@type": "ListItem", position: 3, name: resolved.set, item: `${SITE_URL}${basePath}` },
    ],
  };

  // ItemList of the real cards in this set (not Product - a set is a
  // collection of many differently-priced cards). Points each card at its
  // /cards/[slug] hub when one exists, else this set page. Bounded so a
  // 250-card set doesn't emit a giant blob.
  const itemListJsonLd = showCatalog
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `${resolved.set} Pokemon cards`,
        numberOfItems: catalogCards.length,
        itemListElement: catalogCards.slice(0, 100).map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.cardNumber ? `${c.name} (${c.cardNumber})` : c.name,
          url: c.hubSlug ? `${SITE_URL}/cards/${c.hubSlug}` : `${SITE_URL}${basePath}`,
        })),
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
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
              { name: "Sets", href: "/sets" },
              { name: resolved.set },
            ]}
          />
          <Link
            href="/sets"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Sets
          </Link>
          {logo && (
            <span className="relative mt-5 block h-12 w-40">
              {/* Real pokemontcg.io set logo (see the /sets logo work).
                  Fixed box so there's no layout shift; lazy by default. */}
              <Image src={logo} alt="" fill sizes="160px" className="object-contain object-left" />
            </span>
          )}
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {resolved.set} Deals
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Real below-market {resolved.set} listings on eBay, checked against real market pricing and
            real sold-listing data.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        <h2
          id="deals"
          className="mb-5 scroll-mt-24 text-sm font-semibold uppercase tracking-wide text-zinc-400"
        >
          {resolved.set} Deals
        </h2>

        <DealGrid
          kind="set"
          slug={slug}
          basePath={basePath}
          initial={{ deals, totalPages }}
          hubCounts={hubCounts}
          emptyLabel={`No ${resolved.set} deals match these filters right now. Try clearing a filter, or check back after the next scheduled scan.`}
          validSetSlugs={[slug]}
        />

        {showCatalog && featuredItems.length >= 4 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">
              Highest-value cards in {resolved.set}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Ranked by recent-sold market reference price. Open a card for full pricing, graded
              values and any live deal.
            </p>
            <FeaturedValueCards
              speciesName={resolved.set}
              items={featuredItems}
              placement="set_featured_value"
            />
          </section>
        )}

        {showCatalog && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">
              {catalogTruncated
                ? `Cards in ${resolved.set} (${catalogCards.length} of ${catalogTotal})`
                : `Every card in ${resolved.set} (${catalogTotal})`}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Search by name, number or rarity; filter by rarity; sort by value or card number.
              Reference prices are recent-sold data, not guaranteed values.
            </p>
            <CatalogueBrowser variant="set" label={resolved.set} items={catalogueItems} />
          </section>
        )}

        {showSealed && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {sealedTruncated
                ? `Sealed products for ${resolved.set} (${sealedProducts.length} of ${sealedTotal})`
                : `Sealed products for ${resolved.set} (${sealedTotal})`}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Booster boxes, elite trainer boxes, bundles, blisters and more, priciest first.{" "}
              {sealedDealCount > 0
                ? "Products with an active deal are shown in green; the rest carry their "
                : "Each carries its "}
              PokemonPriceTracker sealed reference price (not a guaranteed value) and a live eBay
              search.
            </p>
            <SpeciesCardList
              label={resolved.set}
              cards={sealedProducts}
              pageName="set_detail_sealed"
              itemNoun="sealed product"
            />
          </section>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/sets"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← Back to Sets
          </Link>
        </div>
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
