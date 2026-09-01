"use client";

import { useState } from "react";
import Link from "next/link";

// "Pokemon in {set}" - the Set -> Pokemon internal-link edge Phase 0
// found missing. Derived from real species-bearing cards in the set
// (lib/setSummary.setSpeciesList: Trainer / Energy / Stadium excluded,
// deduped, alphabetical). Each chip links the canonical /pokemon/[slug].
// Every link is in the SSR HTML (this component server-renders before
// hydration); for a many-species set only the first INITIAL are visible
// and "Show all" toggles a `hidden` class - never a Pokemon x Set URL.
const INITIAL = 40;

export default function SetPokemonList({ setName, species }) {
  const [expanded, setExpanded] = useState(false);
  if (!species || species.length === 0) return null;
  const overflow = species.length > INITIAL + 6;

  return (
    <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="text-lg font-bold text-black dark:text-zinc-50">Pokemon in {setName}</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Every Pokemon with a card in this set that we track — open one for its cards and prices across
        all sets.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {species.map((s, i) => (
          <li
            key={s.slug}
            className={!expanded && overflow && i >= INITIAL ? "hidden" : ""}
          >
            <Link
              href={`/pokemon/${s.slug}`}
              className="inline-block rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-sm text-zinc-700 transition-colors hover:border-red-400 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-red-500"
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
        >
          {expanded ? "Show fewer" : `Show all ${species.length} Pokemon`}
        </button>
      )}
    </section>
  );
}
