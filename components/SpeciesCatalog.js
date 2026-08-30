import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import AffiliateLink from "@/components/AffiliateLink";
import SpeciesCardList from "@/components/SpeciesCardList";
import SpeciesCardsBySet from "@/components/SpeciesCardsBySet";
import { buildEbaySearchLink } from "@/lib/ebay";

const SITE_URL = "https://pokemondealfinder.com";

function usd(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The /pokemon/<slug> page a species gets when it has NO active
// below-market deal right now.
//
//   indexable = true  (Phase 4 P1): >= SPECIES_CATALOG_MIN_CARDS real,
//     priced, imaged catalog cards -> a durable "prices & values" hub. Set
//     grouping, a real price range, CollectionPage + ItemList JSON-LD,
//     robots index (the route leaves robots at its default).
//   indexable = false: the lean fallback - every card + a reference price
//     + an eBay search. robots noindex,follow (set by the route).
//
// Either way: nothing fabricated. No Product/Offer/AggregateRating - a
// species is not one purchasable item; individual /cards/[slug] pages
// carry Product/Offer where a live offer actually exists (P0).
export default function SpeciesCatalog({ speciesName, slug, cards, stats = null, indexable = false, validSetSlugs = [] }) {
  const ebayHref = buildEbaySearchLink(`${speciesName} Pokemon card`);
  const canonical = `${SITE_URL}/pokemon/${slug}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Pokemon", item: `${SITE_URL}/pokemon` },
      { "@type": "ListItem", position: 3, name: speciesName, item: canonical },
    ],
  };

  // Real range from card_catalog - only rendered when we actually have it.
  const range =
    stats && stats.minPrice != null && stats.maxPrice != null && stats.maxPrice !== stats.minPrice
      ? `${usd(stats.minPrice)} – ${usd(stats.maxPrice)}`
      : stats && stats.minPrice != null
        ? usd(stats.minPrice)
        : null;

  const collectionJsonLd =
    indexable && stats
      ? {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${speciesName} Pokemon Cards — Prices & Values`,
          description: `${stats.cardCount} ${speciesName} Pokemon cards across ${stats.setCount} ${
            stats.setCount === 1 ? "set" : "sets"
          }, with real recent-sold market reference prices${range ? ` from ${range}` : ""}.`,
          url: canonical,
          isPartOf: { "@id": `${SITE_URL}/#website` },
        }
      : null;

  // ItemList of the real prints that have a permanent /cards/[slug] page.
  const linkable = (cards ?? []).filter((c) => c.hubSlug || c.catalogSlug);
  const itemListJsonLd =
    indexable && linkable.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${speciesName} Pokemon card prints`,
          numberOfItems: linkable.length,
          itemListElement: linkable.slice(0, 100).map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${c.name} (${c.set})`,
            url: `${SITE_URL}/cards/${c.hubSlug ?? c.catalogSlug}`,
          })),
        }
      : null;

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Pokemon", href: "/pokemon" },
            { name: speciesName },
          ]}
        />

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          {indexable ? `${speciesName} Pokemon Cards — Prices & Values` : `${speciesName} Pokemon Cards`}
        </h1>

        {indexable && stats ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Every {speciesName} Pokemon card we have catalogued — {stats.cardCount} across{" "}
              {stats.setCount} {stats.setCount === 1 ? "set" : "sets"} — with its real recent-sold
              market reference price. There is no below-market {speciesName} listing to feature right
              now; this page updates automatically if the scan finds one.
            </p>
            <p className="mt-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              {stats.cardCount} cards · {stats.setCount} {stats.setCount === 1 ? "set" : "sets"}
              {range ? ` · market range ${range}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            No active below-market {speciesName} deal on eBay right now. Below is every {speciesName}{" "}
            card we know of, with its latest reference market price, plus a live eBay search.
          </p>
        )}

        <AffiliateLink
          href={ebayHref}
          eventName="eBay Click"
          eventData={{ species: speciesName, page: "species_catalog" }}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
        >
          Search {speciesName} on eBay →
        </AffiliateLink>

        {cards.length > 0 ? (
          <>
            {indexable ? (
              <section className="mt-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Every {speciesName} card, by set ({cards.length})
                </h2>
                <SpeciesCardsBySet speciesName={speciesName} cards={cards} validSetSlugs={validSetSlugs} />
              </section>
            ) : (
              <>
                <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Every {speciesName} card ({cards.length})
                </h2>
                <SpeciesCardList label={speciesName} cards={cards} pageName="species_catalog" />
              </>
            )}
            <p className="mt-6 text-xs text-zinc-400">
              Reference prices from PokemonPriceTracker, based on recent sold data - not a guaranteed
              value.{" "}
              <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                How we price this
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
            We don&apos;t have any {speciesName} cards catalogued yet - use the eBay search above to
            browse current listings directly.
          </p>
        )}

        <div className="mt-10">
          <Link
            href="/pokemon"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            ← All Pokemon
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
