import Link from "next/link";
import {
  fetchTopCatalogCards,
  fetchCatalogComposition,
  fetchSetSlugs,
  fetchCatalogSpecies,
  fetchSpeciesHubs,
  slugifySet,
} from "@/lib/deals";
import { speciesSlug } from "@/lib/pokemonSpecies";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";
import { formatDate } from "@/lib/time";
import Price from "@/components/Price";

export const revalidate = 900;

// Top 75: a substantial, cite-able cross-catalogue ranking that keeps the
// text-only page comfortably light (SEO Phase 9A performance rule - 100
// rows with per-row set/Pokemon/rarity links pushed the HTML past the
// rest of the /market-data section).
const RANKING_SIZE = 75;

// Stable, number-free title/description (SEO Phase 9A stability rule): the
// ranking is the highest RAW (ungraded) market references across our
// tracked English card catalogue - a "which card is worth the most"
// cross-catalogue answer, distinct from an individual card page's exact
// price intent. NOT confirmed sale prices, auction records or PSA 10
// values.
const TITLE = "Most Valuable Pokemon Cards by Raw Market Value";
const DESCRIPTION =
  "The highest raw, ungraded market references in our tracked English Pokemon card catalogue, ranked cross-catalogue - each links to its full price and live listings. Not graded values or auction records.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market-data/most-expensive-cards" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://pokemondealfinder.com/market-data/most-expensive-cards",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function MostValuableCardsPage() {
  const [{ cards, error }, composition, validSetSlugs, { species: catSpecies }, { species: dealSpecies }] =
    await Promise.all([
      fetchTopCatalogCards({ limit: RANKING_SIZE }),
      fetchCatalogComposition(),
      fetchSetSlugs("english"),
      fetchCatalogSpecies(),
      fetchSpeciesHubs({ language: "english" }),
    ]);

  const setSlugSet = new Set(validSetSlugs);
  // A /pokemon/[slug] link is only rendered where the species genuinely
  // has an indexable page - catalogue-backed OR deal-backed.
  const speciesSlugSet = new Set([
    ...(catSpecies ?? []).map((s) => s.slug),
    ...(dealSpecies ?? []).map((s) => s.slug),
  ]);
  const snapshot = formatDate(composition?.snapshotAt);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([
            { name: "Deals", href: "/" },
            { name: "Market data", href: "/market-data" },
            { name: "Most valuable cards" },
          ]),
          collectionPage({
            name: TITLE,
            description: DESCRIPTION,
            url: "/market-data/most-expensive-cards",
            dateModified: composition?.snapshotAt,
          }),
          itemList(
            cards.map((c) => ({ name: `${c.name} (${c.set})`, url: `/cards/${c.catalogSlug}` }))
          ),
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Link href="/market-data" className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Market Data
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {TITLE}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            The {cards.length} highest raw-card market references in the English catalogue we track,
            ranked across every set. These are <strong>ungraded</strong> reference values, not
            confirmed sales, auction records or graded (PSA/BGS/CGC) prices.
          </p>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <p className="font-semibold text-black dark:text-zinc-50">How this list is built</p>
            <p className="mt-1">
              Ranked by raw market reference from our card catalogue (provider:{" "}
              <span className="font-medium">PokemonPriceTracker</span>). One row per distinct card;
              sealed products, oversized &ldquo;Jumbo&rdquo; cards and World Championship deck
              reprints are excluded. A market reference is an estimate of recent ungraded sold value,
              not a guaranteed price. Values are held in USD and converted to your currency for
              display.{" "}
              <Link href="/methodology" className="font-medium text-red-600 hover:underline dark:text-red-500">
                Full methodology
              </Link>
              .
            </p>
            {snapshot && (
              <p className="mt-2 text-xs text-zinc-500">
                Catalogue snapshot: <time dateTime={new Date(composition.snapshotAt).toISOString()}>{snapshot}</time>
                {composition?.pricedCards
                  ? ` · ${composition.pricedCards.toLocaleString()} priced English cards tracked`
                  : ""}
                .
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load data: {error}</p>}

        <ol className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {cards.map((card, i) => {
            const setSlug = slugifySet(card.set);
            const spSlug = card.species ? speciesSlug(card.species) : null;
            return (
              <li key={card.catalogSlug} className="flex items-start justify-between gap-4 py-3">
                <div className="flex min-w-0 gap-3">
                  <span className="w-6 shrink-0 pt-0.5 text-right text-sm font-semibold text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/cards/${card.catalogSlug}`}
                      className="block truncate text-sm font-medium text-black hover:underline dark:text-zinc-50"
                    >
                      {card.name}
                      {card.cardNumber ? (
                        <span className="ml-1 font-normal text-zinc-400">#{card.cardNumber}</span>
                      ) : null}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                      {setSlugSet.has(setSlug) ? (
                        <Link
                          href={`/sets/${setSlug}`}
                          className="hover:text-red-600 hover:underline dark:hover:text-red-500"
                        >
                          {card.set}
                        </Link>
                      ) : (
                        <span>{card.set}</span>
                      )}
                      {spSlug && speciesSlugSet.has(spSlug) && (
                        <>
                          <span aria-hidden>·</span>
                          <Link
                            href={`/pokemon/${spSlug}`}
                            className="hover:text-red-600 hover:underline dark:hover:text-red-500"
                          >
                            {card.species} cards
                          </Link>
                        </>
                      )}
                      {card.rarity && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{card.rarity}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 pt-0.5 text-sm font-bold text-black dark:text-zinc-50">
                  <Price
                    usd={card.refPrice}
                    native={{ amount: card.refPrice, currency: "USD" }}
                    approxPrefix=""
                  />
                </span>
              </li>
            );
          })}
        </ol>
      </main>

      <SiteFooter note="Raw market references are estimates of recent ungraded sold value checked against real market pricing - not sale offers, auction results or graded-card prices. Click any card for its full price history and current listings." />
    </div>
  );
}
