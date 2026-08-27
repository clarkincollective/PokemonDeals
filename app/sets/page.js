import Link from "next/link";
import { fetchSets } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";

export const revalidate = 900;

export const metadata = {
  title: "Browse by Set",
  description: "Every Pokémon TCG set with an active below-market deal on eBay right now, browsable one set at a time.",
  alternates: { canonical: "/sets" },
};

export default async function SetsIndexPage() {
  const { sets, error } = await fetchSets({ language: "english" });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Browse Deals by Set
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Every set with a real, active below-market deal right now - pick one to see just that
            set&apos;s deals.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load sets: {error}</p>}

        {!error && sets.length === 0 && <p className="text-zinc-500">No active deals right now.</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <span className="font-medium text-black dark:text-zinc-50">{s.set}</span>
              <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {s.count}
              </span>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan.
      </footer>
    </div>
  );
}
