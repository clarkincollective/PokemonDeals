import { fetchSpeciesHubs } from "@/lib/deals";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PokemonFilterList from "@/components/PokemonFilterList";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage } from "@/lib/jsonLd";

export const revalidate = 900;

const TITLE = "Browse by Pokemon";
const DESCRIPTION =
  "Every Pokemon with active below-market card deals on eBay right now, one Pokemon at a time — cards across sets, price ranges, and current listings.";

// Explicit openGraph/twitter blocks - same site-wide fix as /sets: without
// them a shared link falls back to the root layout's generic homepage
// preview.
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pokemon" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://pokemondealfinder.com/pokemon" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default async function PokemonIndexPage() {
  const { species, error } = await fetchSpeciesHubs({ language: "english" });

  // Project away watchlistIds (server-only) before handing the list to a
  // client component.
  const list = species.map(({ name, slug, count, setCount }) => ({ name, slug, count, setCount }));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Pokemon" }]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: "/pokemon" }),
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Deals by Pokemon
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-600 dark:text-zinc-400">
            Every Pokemon with real, active below-market deals right now - pick one to see every
            current listing of it across all its prints and sets.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load Pokemon: {error}</p>
        )}

        {!error && list.length === 0 && <p className="text-zinc-500">No active deals right now.</p>}

        {!error && list.length > 0 && <PokemonFilterList species={list} />}
      </main>

      <SiteFooter />
    </div>
  );
}
