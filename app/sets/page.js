import { fetchSets } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SetsFilterList from "@/components/SetsFilterList";

export const revalidate = 900;

const TITLE = "Browse by Set";
const DESCRIPTION =
  "Every Pokémon TCG set with an active below-market deal on eBay right now, browsable one set at a time.";

// Real gap found live: without an explicit openGraph/twitter block, this
// page (and japanese-cards/sealed-deals/best-finds - same fix applied to
// each) fell back to the root layout's generic site-wide preview when
// shared, even though its own <title>/description were already correct -
// only the social-share layer hadn't been updated to match.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/sets" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/sets" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function SetsIndexPage() {
  const { sets, error } = await fetchSets({ language: "english" });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Deals by set
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

      <SiteFooter />
    </div>
  );
}
