import Link from "next/link";

// SEO Phase 8B - internal link equity. The homepage is the site's
// strongest URL but historically passed almost no authority into the
// ~915-page /pokemon/[slug] and ~207-page /sets/[slug] universes (only
// the three directory tiles above this). These two bounded rows give a
// small, DEFENSIBLE set of entity hubs a direct homepage inbound and
// signal those universes' importance to crawlers.
//
// Selection is a STATIC curated list (no query, no deal-state input) so
// the anchors never churn. Every entry is chosen for deep catalogue
// coverage + durable search importance + stable indexability, and every
// slug is verified present in the pokemon / sets sitemaps. Anchors are
// natural and descriptive ("Charizard cards", "Base Set card list") -
// no keyword stuffing, no dynamic counts.

const POPULAR_POKEMON = [
  ["charizard", "Charizard"],
  ["pikachu", "Pikachu"],
  ["eevee", "Eevee"],
  ["mewtwo", "Mewtwo"],
  ["umbreon", "Umbreon"],
  ["rayquaza", "Rayquaza"],
  ["gengar", "Gengar"],
  ["lugia", "Lugia"],
  ["snorlax", "Snorlax"],
  ["gyarados", "Gyarados"],
  ["dragonite", "Dragonite"],
  ["blastoise", "Blastoise"],
];

const KEY_SETS = [
  ["base-set", "Base Set"],
  ["jungle", "Jungle"],
  ["fossil", "Fossil"],
  ["team-rocket", "Team Rocket"],
  ["neo-genesis", "Neo Genesis"],
  ["gym-heroes", "Gym Heroes"],
  ["celebrations-classic-collection", "Celebrations: Classic Collection"],
  ["swsh07-evolving-skies", "Evolving Skies"],
  ["sv-scarlet-violet-151", "Scarlet & Violet 151"],
  ["swsh-crown-zenith", "Crown Zenith"],
];

export default function HomeBrowseLinks() {
  return (
    <div className="mt-6 grid gap-x-8 gap-y-5 border-t border-zinc-200 pt-6 sm:grid-cols-2 dark:border-zinc-800">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Popular Pokemon</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {POPULAR_POKEMON.map(([slug, name]) => (
            <li key={slug}>
              <Link
                href={`/pokemon/${slug}`}
                className="text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
              >
                {`${name} cards`}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/pokemon" className="font-semibold text-red-600 hover:underline dark:text-red-500">
              All Pokemon →
            </Link>
          </li>
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Key sets</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {KEY_SETS.map(([slug, name]) => (
            <li key={slug}>
              <Link
                href={`/sets/${slug}`}
                className="text-zinc-600 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
              >
                {`${name} card list`}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/sets" className="font-semibold text-red-600 hover:underline dark:text-red-500">
              All sets →
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
