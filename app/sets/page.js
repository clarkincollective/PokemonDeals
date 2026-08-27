import { fetchSets } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SetsFilterList from "@/components/SetsFilterList";

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

        {!error && sets.length > 0 && <SetsFilterList sets={sets} />}
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change and were accurate as of the
        listing&apos;s last scan.
      </footer>
    </div>
  );
}
