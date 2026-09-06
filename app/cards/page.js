import Link from "next/link";
import {
  fetchCardDirectorySummary,
  fetchTopCatalogCards,
  fetchCatalogSpecies,
  fetchSets,
  fetchCatalogSets,
} from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import FeaturedValueCards from "@/components/FeaturedValueCards";
import SetLinkIndex from "@/components/SetLinkIndex";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";

const SITE_URL = "https://pokemondealfinder.com";

export const revalidate = 900;

// Stable, broad, database/browse-oriented - no live deal count, market
// range or catalogue total (those move; visible body counts are fine).
const TITLE = "Pokemon Card Database & Prices";
const DESCRIPTION =
  "Browse the Pokemon card catalogue Pokemon Deal Finder tracks - search for an exact printing to check its market-reference price, or browse every card by set and by Pokemon. Each card has a permanent price page.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/cards" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/cards`,
    type: "website",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const BROWSE_POKEMON = 60;
const BROWSE_SETS = 24;
const FEATURED_CARDS = 24;

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

export default async function CardsDirectoryPage() {
  const [summary, { cards: featured }, { species: catSpecies }, { sets: dealSets }, { sets: catSets }] =
    await Promise.all([
      fetchCardDirectorySummary(),
      fetchTopCatalogCards({ limit: FEATURED_CARDS }),
      fetchCatalogSpecies(),
      fetchSets({ language: "english" }),
      fetchCatalogSets(),
    ]);

  // Browse-by-Pokemon: real catalogue depth only (species with the most
  // priced, imaged prints), no external popularity data, no allowlist.
  const topSpecies = [...(catSpecies ?? [])]
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species))
    .slice(0, BROWSE_POKEMON);

  // Browse-by-set: every qualifying set hub (deal-backed + catalogue),
  // de-duped, deepest first - same model as the /sets index.
  const setBySlug = new Map();
  for (const s of dealSets ?? []) setBySlug.set(s.slug, { set: s.set, slug: s.slug, count: s.count });
  for (const s of catSets ?? []) if (!setBySlug.has(s.slug)) setBySlug.set(s.slug, { set: s.set, slug: s.slug, count: 0 });
  const allSets = [...setBySlug.values()].sort(
    (a, b) => b.count - a.count || a.set.localeCompare(b.set)
  );
  const topSets = allSets.slice(0, BROWSE_SETS);

  const featuredItems = (featured ?? []).map((c) => ({
    name: `${c.displayName} (${c.set})`,
    url: `/cards/${c.slug}`,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Card Database" }]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: "/cards" }),
          featuredItems.length > 0 ? itemList(featuredItems) : null,
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Pokemon Card Database &amp; Prices
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            Browse the Pokemon card catalogue we track, search for an exact printing, and compare
            real market-reference prices. Every card has a permanent page with raw and graded values.
            Browse by Pokemon or by set below, or open the full price checker for an exact lookup.
          </p>

          {/* Strong search interaction - submits to the existing price
              checker at /search?q=, no second search backend. */}
          <form action="/search" method="get" role="search" className="mt-6 flex max-w-xl gap-2">
            <input
              type="search"
              name="q"
              placeholder="Search any Pokemon card - name, set or collector number..."
              aria-label="Search Pokemon cards"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Search
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Looking up one card?{" "}
            <Link href="/search" className="font-medium text-red-600 hover:underline dark:text-red-500">
              Open the full price checker
            </Link>
            .
          </p>

          {!summary.error && summary.totalCards > 0 && (
            <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
              Pokemon Deal Finder currently tracks{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmt(summary.totalCards)}</span>{" "}
              Pokemon cards across{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmt(summary.setCount)}</span>{" "}
              sets,{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmt(summary.pricedCards)}</span>{" "}
              of them with a market-reference price from real recent-sold data. This is the catalogue
              we monitor for deals, not a claim to list every Pokemon card ever printed.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {/* Browse by Pokemon */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">Browse cards by Pokemon</h2>
            <Link href="/pokemon" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
              Browse all Pokemon &rarr;
            </Link>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            The Pokemon we track the most cards for. Open one for every print across all sets, with
            prices.
          </p>
          {topSpecies.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {topSpecies.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/pokemon/${s.slug}`}
                    className="inline-block rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-sm text-zinc-700 transition-colors hover:border-red-400 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-red-500"
                  >
                    {s.species}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Browse by set */}
        <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">Browse cards by set</h2>
            <Link href="/sets" className="text-sm font-semibold text-red-600 hover:underline dark:text-red-500">
              Browse all sets &rarr;
            </Link>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            The sets with the most cards in our catalogue. Open one for its checklist and
            market-reference prices.
          </p>
          {topSets.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {topSets.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/sets/${s.slug}`}
                    className="inline-block rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-sm text-zinc-700 transition-colors hover:border-red-400 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-red-500"
                  >
                    {s.set}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* SEO-GSC-2: the complete, crawlable A-Z set index. This is what
            makes /cards a real second entry point into the set -> card
            tree - every /sets/[slug] page in one plain-link block, and
            each of those already links its own cards. */}
        <SetLinkIndex sets={allSets} />

        {/* Highest market references */}
        {featured && featured.length >= 4 && (
          <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-black dark:text-zinc-50">
              Highest market references we track
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              The highest market-reference prices currently in our catalogue - not an all-time
              ranking or an investment call. Standard printings rank ahead of Jumbo / World
              Championship prints. Open a card for its full pricing and any live deal.
            </p>
            <FeaturedValueCards
              speciesName="Pokemon"
              items={featured}
              placement="cards_directory_featured"
            />
          </section>
        )}

        <p className="mt-12 border-t border-zinc-200 pt-8 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Market-reference prices are a guide based on recent sold data, not a guaranteed sale value.
          Condition, printing and grade all move a card&apos;s price. Pokemon Deal Finder doesn&apos;t
          buy cards or guarantee any sale value.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
