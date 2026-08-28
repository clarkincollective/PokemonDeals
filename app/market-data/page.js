import Link from "next/link";
import { fetchMarketDataSummary } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const revalidate = 900;

const TITLE = "Pokémon Card Market Data";
const DESCRIPTION =
  "Real aggregate market data from our own live-tracked catalog - most-listed cards, highest-value cards, and more, all from real active eBay listings.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market-data" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/market-data" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function MarketDataPage() {
  const summary = await fetchMarketDataSummary();

  const pages = [
    {
      href: "/market-data/most-listed-cards",
      title: "Most-Listed Cards",
      description: "Cards with the most sellers competing on price right now.",
    },
    {
      href: "/market-data/most-expensive-cards",
      title: "Most Expensive Cards",
      description: "The highest real market-priced cards currently tracked.",
    },
    {
      href: "/best-finds",
      title: "Today's Best Finds",
      description: "The biggest real discounts below market price right now.",
    },
    {
      href: "/sets",
      title: "Browse by Set",
      description: "Every set with an active deal, browsable one at a time.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Pokémon Card Market Data
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Real aggregate numbers from our own live-tracked catalog - not estimates, every figure below
            comes directly from currently active listings.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Active card deals" value={summary.activeDeals} />
            <Stat label="Active sealed deals" value={summary.activeSealed} />
            <Stat label="Cards with 2+ sellers" value={summary.cardsWithMultipleSellers} />
            <Stat label="Sets with a deal" value={summary.activeSets} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pages.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-card transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="font-semibold text-black dark:text-zinc-50">{p.title} →</h2>
              <p className="mt-1 text-sm text-zinc-500">{p.description}</p>
            </Link>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-2xl font-bold text-black dark:text-zinc-50">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}
