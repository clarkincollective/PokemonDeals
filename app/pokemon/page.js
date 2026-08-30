import { fetchSpeciesHubs } from "@/lib/deals";
import { SPECIES_WITH_GENERATION } from "@/lib/pokemonSpecies";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PokemonFilterList from "@/components/PokemonFilterList";
import JsonLd from "@/components/JsonLd";
import { breadcrumbList, collectionPage, itemList } from "@/lib/jsonLd";

export const revalidate = 900;

const TITLE = "Browse Pokemon Cards by Generation";
const DESCRIPTION =
  "Every Pokemon, grouped by generation. The ones with active below-market card deals on eBay right now link straight to their current listings across all sets and prints.";

const GENERATION_REGIONS = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

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
  const { species: hubs, error } = await fetchSpeciesHubs({ language: "english" });

  // name -> { slug, count } for the species that actually have an active
  // deal (SPECIES_MIN_LISTINGS+). These are the only ones that link to a
  // real /pokemon/[slug] page - the rest are shown for orientation but
  // aren't links (their slug page would 404 by design).
  const dealBySpecies = new Map();
  for (const h of hubs) dealBySpecies.set(h.name, { slug: h.slug, count: h.count });

  // The full canonical dex, in order, tagged with generation and (where
  // it exists) its live deal count. extractSpecies collapses forms and
  // owner prefixes onto the base species, so a deal for "Alolan Vulpix"
  // or "Rocket's Meowth" attaches to "Vulpix" / "Meowth" here.
  const groups = [];
  let current = null;
  for (const s of SPECIES_WITH_GENERATION) {
    if (!current || current.generation !== s.generation) {
      current = {
        generation: s.generation,
        region: GENERATION_REGIONS[s.generation] ?? null,
        species: [],
      };
      groups.push(current);
    }
    const deal = dealBySpecies.get(s.name) ?? null;
    current.species.push({
      name: s.name,
      slug: deal?.slug ?? null,
      count: deal?.count ?? 0,
    });
  }

  const withDeals = [...dealBySpecies.values()];
  const totalWithDeals = withDeals.length;

  // ItemList of only the species that resolve to a real page - real
  // names, real URLs, no fabricated entries for the deal-less ones.
  const linkedItems = groups
    .flatMap((g) => g.species)
    .filter((s) => s.slug)
    .map((s) => ({ name: s.name, url: `/pokemon/${s.slug}` }));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <JsonLd
        data={[
          breadcrumbList([{ name: "Deals", href: "/" }, { name: "Pokemon" }]),
          collectionPage({ name: TITLE, description: DESCRIPTION, url: "/pokemon" }),
          linkedItems.length > 0 ? itemList(linkedItems) : null,
        ]}
      />
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Browse</p>
          <h1 className="mt-1 max-w-2xl text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Browse Pokemon Cards by Generation
          </h1>
          <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
            All {SPECIES_WITH_GENERATION.length} Pokemon, in National Pokedex order and grouped by
            generation. {totalWithDeals > 0 ? `${totalWithDeals} currently have` : "None currently have"}{" "}
            an active below-market deal - those names link straight to every current listing of that
            Pokemon across all its sets and prints. Use the filter to jump to any name.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deal data: {error}</p>
        )}

        <PokemonFilterList groups={groups} />
      </main>

      <SiteFooter />
    </div>
  );
}
