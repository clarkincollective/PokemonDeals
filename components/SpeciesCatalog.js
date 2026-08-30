import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Breadcrumbs from "@/components/Breadcrumbs";
import AffiliateLink from "@/components/AffiliateLink";
import SpeciesCardList from "@/components/SpeciesCardList";
import { buildEbaySearchLink } from "@/lib/ebay";

const SITE_URL = "https://pokemondealfinder.com";

// The /pokemon/<slug> page a species gets when it has NO active
// below-market deal right now: every known card of it (from
// card_catalog), each with its PokemonPriceTracker reference price and a
// plain "View on eBay" affiliate link, plus a species-wide affiliate
// search. noindex,follow (set by the route) - a browse surface, not a
// page meant to rank.
export default function SpeciesCatalog({ speciesName, slug, cards }) {
  const ebayHref = buildEbaySearchLink(`${speciesName} Pokemon card`);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Deals", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Pokemon", item: `${SITE_URL}/pokemon` },
      { "@type": "ListItem", position: 3, name: speciesName, item: `${SITE_URL}/pokemon/${slug}` },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Breadcrumbs
          items={[
            { name: "Deals", href: "/" },
            { name: "Pokemon", href: "/pokemon" },
            { name: speciesName },
          ]}
        />

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          {speciesName} Pokemon Cards
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          No active below-market {speciesName} deal on eBay right now. Below is every {speciesName}{" "}
          card we know of, with its latest reference market price, plus a live eBay search.
        </p>

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
            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Every {speciesName} card ({cards.length})
            </h2>
            <SpeciesCardList speciesName={speciesName} cards={cards} />
            <p className="mt-3 text-xs text-zinc-400">
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
