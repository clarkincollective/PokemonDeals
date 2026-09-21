import Link from "next/link";
import Image from "next/image";

// The visual species-discovery row.
//
// ORDERING IS REAL. `speciesHubs` (lib/catalogAggregates) is sorted by
// the number of ACTIVE LISTINGS for that species, so this row is
// genuinely "the Pokemon with the most listings right now", which is
// what the heading says. It is not a hand-picked list of famous names
// dressed up as popularity, and it changes as the inventory changes.
//
// ARTWORK. Each tile shows a representative CARD from that species -
// the same catalogue imagery already used across the site, from the same
// approved hosts. The reference design uses character illustrations; we
// do not hold a licence for those and none is introduced here. A species
// whose hub carries no image is skipped rather than shown with a
// placeholder box, because a tile whose whole job is visual recognition
// has no purpose without the picture.
export default function HomePopularPokemon({ species = [] }) {
  const tiles = species.filter((s) => s.image && s.slug).slice(0, 8);
  if (tiles.length < 4) return null; // a short row reads as broken, not curated

  return (
    <section aria-labelledby="popular-pokemon" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="popular-pokemon" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">
          Most listed Pokemon
        </h2>
        <Link
          href="/pokemon"
          data-analytics-click="popular_pokemon_view_all"
          data-analytics-props={JSON.stringify({ surface: "home" })}
          className="shrink-0 text-sm font-semibold text-red-600 underline-offset-2 hover:underline dark:text-red-500"
        >
          View all →
        </Link>
      </div>

      {/* Scrolls on a phone, grid from sm. snap-x makes the phone version
          feel like a carousel without any JavaScript or a library. The
          negative margin + padding lets the first and last tiles sit
          flush with the page gutter while still scrolling edge to edge. */}
      <ul className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
        {tiles.map((s, i) => (
          <li key={s.slug} className="w-[38%] shrink-0 snap-start sm:w-auto">
            <Link
              href={`/pokemon/${s.slug}`}
              data-analytics-click="popular_pokemon_clicked"
              data-analytics-props={JSON.stringify({
                surface: "home",
                section: "popular_pokemon",
                position: i + 1,
                content_id: s.slug,
                listing_count: s.count,
              })}
              className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="relative block aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
                <Image
                  src={s.image}
                  alt=""
                  fill
                  // Small tiles: never ask for a large file. Below the
                  // fold at every width, so no priority hint.
                  sizes="(max-width: 640px) 38vw, (max-width: 1024px) 24vw, 12vw"
                  className="object-contain p-2 transition-transform duration-200 group-hover:scale-105"
                />
              </span>
              <span className="block px-2 py-2 text-center">
                <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{s.name}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {s.count.toLocaleString()} {s.count === 1 ? "listing" : "listings"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
