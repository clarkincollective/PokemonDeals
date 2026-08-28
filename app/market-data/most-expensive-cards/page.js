import Link from "next/link";
import { fetchMostExpensiveCards, slugifySet } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const revalidate = 900;

const TITLE = "Most Expensive Pokémon Cards";
const DESCRIPTION =
  "The highest real market-priced Pokémon cards currently tracked, ranked by real market pricing - not an estimate or a fabricated valuation.";

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

export default async function MostExpensiveCardsPage() {
  const { cards, error } = await fetchMostExpensiveCards({ language: "english", limit: 100 });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Link href="/market-data" className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Market Data
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Most Expensive Pokémon Cards
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Top {cards.length} highest real market-priced cards we currently track, based on real pricing
            data - not an estimate.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load data: {error}</p>}

        <ol className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {cards.map((card, i) => (
            <li key={card.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-zinc-400">{i + 1}</span>
                <div className="min-w-0">
                  <Link
                    href={`/deals/${card.dealId}`}
                    className="block truncate text-sm font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {card.name}
                  </Link>
                  <Link
                    href={`/sets/${slugifySet(card.set)}`}
                    className="block truncate text-xs text-zinc-500 hover:text-red-600 hover:underline dark:hover:text-red-500"
                  >
                    {card.set}
                  </Link>
                </div>
              </div>
              <span className="shrink-0 text-sm font-bold text-black dark:text-zinc-50">
                ${card.marketPrice.toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter note="Market prices shown are real reference data checked against real market pricing, not sale offers themselves - click through to see the real active listing." />
    </div>
  );
}
