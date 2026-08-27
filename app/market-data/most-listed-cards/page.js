import Link from "next/link";
import { fetchCardHubs } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";

export const revalidate = 900;

const TITLE = "Most-Listed Pokémon Cards";
const DESCRIPTION =
  "Real Pokémon cards with the most sellers competing on price at once - ranked by currently active eBay listing count, not an estimate.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market-data/most-listed-cards" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/market-data/most-listed-cards" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function MostListedCardsPage() {
  const { hubs } = await fetchCardHubs({ language: "english" });
  const top = hubs.slice(0, 100);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Link href="/market-data" className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← Market Data
          </Link>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Most-Listed Pokémon Cards
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Top {top.length} cards by real, currently active eBay listing count - the more sellers
            competing, the more likely you are to find a genuine below-market price. Click any card to
            compare every active listing side by side.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <ol className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {top.map((hub, i) => (
            <li key={hub.id}>
              <Link
                href={`/cards/${hub.slug}`}
                className="flex items-center justify-between gap-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-sm font-semibold text-zinc-400">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{hub.name}</p>
                    <p className="truncate text-xs text-zinc-500">{hub.set}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {hub.count} sellers
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change.
      </footer>
    </div>
  );
}
