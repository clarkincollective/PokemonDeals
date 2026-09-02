import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  resolveSetSlug,
  fetchDealsPage,
  fetchHubCounts,
  fetchSetCatalog,
  fetchSetSealedCatalog,
  fetchSetSlugs,
  SET_CATALOG_MIN_CARDS,
  SET_SEALED_MIN_PRODUCTS,
} from "@/lib/deals";
import { setImage } from "@/lib/setImages";
import { VINTAGE_SETS, isModernSet } from "@/lib/dealCategories";
import { setEra } from "@/lib/setSummary";
import SiteHeader from "@/components/SiteHeader";
import RegionRedirect from "@/components/RegionRedirect";
import DealGrid from "@/components/DealGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import SpeciesCardList from "@/components/SpeciesCardList";
import CatalogueBrowser from "@/components/CatalogueBrowser";
import CatalogueLinkIndex from "@/components/CatalogueLinkIndex";
import FeaturedValueCards from "@/components/FeaturedValueCards";
import SetFactStrip from "@/components/SetFactStrip";
import SetPriceSummary from "@/components/SetPriceSummary";
import SetPokemonList from "@/components/SetPokemonList";
import SetQuickAnswers from "@/components/SetQuickAnswers";
import { buildCatalogueItems, RICH_BROWSER_CAP } from "@/components/SpeciesCardsBySet";
import { sortCards, DEFAULT_SORT } from "@/lib/catalogueView";
import SiteFooter from "@/components/SiteFooter";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

export async function generateStaticParams() {
  return [];
}

// A set page targets "<set> Pokemon cards / card list / checklist /
// prices / values / deals" intent. Two indexable paths, one template:
//   - DEAL-BACKED:     >= SET_MIN_LISTINGS (3) live below-market deals
//   - CATALOGUE-BACKED: >= SET_CATALOG_MIN_CARDS priced imaged cards,
//                       even with no live deal (SEO Phase 4A)
// See lib/deals.js resolveSetSlug / fetchCatalogSets. Nothing fabricated:
// real active deals plus the real card_catalog listing for the set.
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resolved = await resolveSetSlug(slug);
  if (!resolved) return { title: "Set not found", robots: { index: false, follow: true } };

  const canonical = `/sets/${slug}`;
  const catalogueOnly = Boolean(resolved.catalogue);

  // Stable, capability-not-inventory metadata: no live deal count, no
  // volatile price range. The visible page carries the real counts.
  const title = catalogueOnly
    ? `${resolved.set} Card List & Prices`
    : `${resolved.set} Card Prices & Deals`;
  const description = catalogueOnly
    ? `Every ${resolved.set} Pokemon card we track, with real recent-sold market references, plus the Pokemon in the set. Compare ${resolved.set} card prices and values.`
    : `Every ${resolved.set} Pokemon card we track, with real recent-sold market references, plus current eBay listings we've identified below market. Compare ${resolved.set} card prices and deals.`;

  let image = setImage(resolved.set)?.logo ?? null;
  if (!catalogueOnly) {
    const { deals: sample } = await fetchDealsPage({
      table: "deals",
      language: "english",
      set: resolved.set,
      page: 1,
      pageSize: 1,
    });
    image = sample[0]?.image_url ?? image;
  }

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

  const catalogueOnly = Boolean(resolved.catalogue);
  const basePath = `/sets/${slug}`;

  const [
    { deals, totalPages, error },
    hubCounts,
    {
      cards: catalogCards,
      totalCards: catalogTotal,
      truncated: catalogTruncated,
      stats,
      priceSnapshot,
      speciesList,
      topValueCards,
    },
    { products: sealedProducts, totalProducts: sealedTotal, truncated: sealedTruncated },
    validSetSlugs,
  ] = await Promise.all([
    catalogueOnly
      ? Promise.resolve({ deals: [], totalPages: 1, error: null })
      : fetchDealsPage({
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
    fetchSetSlugs("english"),
  ]);

  const logo = setImage(resolved.set)?.logo ?? null;
  const era = setEra(resolved.set, { vintageSets: VINTAGE_SETS, isModernSet });

  // A catalogue-backed set always shows the checklist + SEO sections;
  // a deal-backed set shows them once card_catalog has a meaningful slice.
  const showCatalog = catalogueOnly || catalogCards.length >= SET_CATALOG_MIN_CARDS;

  // BROWSE data - the interactive checklist grid + the bounded ItemList
  // schema only. Capped at SET_CATALOG_MAX_BROWSE non-deal cards upstream.
  const catalogueItems = buildCatalogueItems(catalogCards, validSetSlugs);

  // FULL-SET aggregates (SEO Phase 4A closeout) - price range/median,
  // species list and the most-valuable ranking are computed server-side
  // in fetchSetCatalog from the COMPLETE tracked set, before the browse
  // cap, so a large set like World Championship Decks reports set-level
  // numbers for the whole set, not just the 600 tiles we render.
  const snapshot = priceSnapshot;
  const speciesInSet = speciesList;
  const featuredItems = buildCatalogueItems(topValueCards, validSetSlugs).slice(0, 12);

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

  // CollectionPage for the set hub (real, no fabricated data). No
  // Product/Offer - a set is not one purchasable item; individual
  // /cards/[slug] pages carry Product/Offer where a live offer exists.
  const collectionJsonLd = showCatalog
    ? {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${resolved.set} Pokemon cards`,
        description: `${resolved.set} Pokemon card checklist with real recent-sold market references and the Pokemon in the set.`,
        url: `${SITE_URL}${basePath}`,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      }
    : null;

  const itemListJsonLd = showCatalog
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `${resolved.set} Pokemon cards`,
        numberOfItems: catalogCards.length,
        // Bounded to the most meaningful visible slice - the complete
        // crawlable checklist is the CatalogueLinkIndex in the page body.
        itemListElement: catalogCards.slice(0, 30).map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.cardNumber ? `${c.name} (${c.cardNumber})` : c.name,
          url: c.hubSlug
            ? `${SITE_URL}/cards/${c.hubSlug}`
            : c.catalogSlug
              ? `${SITE_URL}/cards/${c.catalogSlug}`
              : `${SITE_URL}${basePath}`,
        })),
      }
    : null;

  const h1 = catalogueOnly
    ? `${resolved.set} Card List & Prices`
    : `${resolved.set} Card Prices & Deals`;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {collectionJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      )}
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
              <Image src={logo} alt="" fill sizes="160px" className="object-contain object-left" />
            </span>
          )}
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {h1}
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            {catalogueOnly ? (
              <>
                Browse every {resolved.set} card we track with its real recent-sold market reference,
                and see which Pokemon are in the set. There is no qualifying below-market{" "}
                {resolved.set} deal to feature right now — the checklist and prices stay available.
              </>
            ) : (
              <>
                Real below-market {resolved.set} listings on eBay checked against real market pricing,
                plus every {resolved.set} card we track and the Pokemon in the set.
              </>
            )}
          </p>
          <SetFactStrip setName={resolved.set} snapshot={snapshot} era={era} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error}</p>}

        {!catalogueOnly && (
          <>
            <h2
              id="deals"
              className="mb-5 scroll-mt-24 text-sm font-semibold uppercase tracking-wide text-zinc-400"
            >
              {resolved.set} deals
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
          </>
        )}

        {snapshot && snapshot.cardCount > 0 && (
          <div className={catalogueOnly ? "" : "mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800"}>
            <SetPriceSummary setName={resolved.set} snapshot={snapshot} />
          </div>
        )}

        {showCatalog && featuredItems.length >= 4 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">
              Most valuable {resolved.set} cards we track
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The highest market references currently in our catalogue — not an all-time ranking.
              Standard cards rank ahead of Jumbo / World Championship printings. Open a card for full
              pricing, graded values and any live deal.
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
                ? `${resolved.set} card checklist (${catalogCards.length} of ${catalogTotal})`
                : `${resolved.set} card checklist (${catalogTotal})`}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Every {resolved.set} card we track. Search by name, number or rarity; filter by rarity;
              sort by value or card number. Open a card for full pricing. Reference prices are
              recent-sold data, not guaranteed values.
            </p>
            <CatalogueBrowser
              variant="set"
              label={resolved.set}
              items={
                catalogueItems.length > RICH_BROWSER_CAP
                  ? sortCards(catalogueItems, DEFAULT_SORT, { relevanceTier: true }).slice(0, RICH_BROWSER_CAP)
                  : catalogueItems
              }
              totalCount={catalogueItems.length}
            />
            <CatalogueLinkIndex label={resolved.set} cards={catalogueItems} headingId="full-set-index" />
          </section>
        )}

        <SetPokemonList setName={resolved.set} species={speciesInSet} />

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

        <SetQuickAnswers
          setName={resolved.set}
          snapshot={snapshot}
          species={speciesInSet}
          hasDeals={!catalogueOnly && deals.length > 0}
        />

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
