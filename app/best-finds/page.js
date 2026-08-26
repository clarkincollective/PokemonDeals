import Link from "next/link";
import { fetchBestFinds } from "@/lib/deals";
import { dealScore } from "@/lib/dealScore";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import DealCard from "@/components/DealCard";

export const revalidate = 60;

export const metadata = {
  title: "Today's Best Finds | Pokémon Deal Finder",
  description: "The biggest real discounts on higher-value Pokémon cards, found on eBay right now.",
};

export default async function BestFindsPage() {
  const { deals, error } = await fetchBestFinds({ limit: 10 });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/">
            <Logo size="small" />
          </Link>
          <NavMenu />
        </div>
      </div>

      <header className="border-b border-zinc-200 bg-gradient-to-b from-red-50 to-transparent dark:border-zinc-800 dark:from-red-950/20">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            ← All deals
          </Link>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
            🔥 Today&apos;s Best Finds
          </span>
          <h1 className="mt-3 text-2xl font-bold text-black dark:text-zinc-50">
            The best deals right now
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Higher-value cards with the biggest real discounts below market price, ranked highest
            discount first. Each stays on this list until a better deal replaces it.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {error.message}</p>
        )}

        {!error && deals.length === 0 && (
          <p className="text-zinc-500">
            No standout deals right now - check back after the next scheduled scan, or browse{" "}
            <Link href="/" className="underline">
              all deals
            </Link>
            .
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal, i) => (
            <DealCard
              key={deal.id}
              deal={deal}
              rank={i + 1}
              scoreBadge={dealScore(deal.discount_pct)}
              pageName="best_finds"
            />
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan. Card-to-listing matching is automated and not perfect - always
        double-check a listing&apos;s photos and description before buying.
      </footer>
    </div>
  );
}
