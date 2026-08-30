"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// The full dex, grouped by generation, with a client-side filter over it.
// Not a fetch-on-type search - every species (and every real
// /pokemon/[slug] link) is already in the server-rendered HTML for
// crawlers (see app/pokemon/page.js). This is a progressive-enhancement
// filter for a visitor scanning ~1,000 names by hand.
//
// A species links to /pokemon/[slug] only when it has an active deal
// (slug set). The rest render as plain, dimmed text - their slug page
// 404s by design, so linking there would be a dead end.
export default function PokemonFilterList({ groups }) {
  const [query, setQuery] = useState("");

  const totalSpecies = useMemo(
    () => groups.reduce((n, g) => n + g.species.length, 0),
    [groups]
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, species: g.species.filter((s) => s.name.toLowerCase().includes(q)) }))
      .filter((g) => g.species.length > 0);
  }, [groups, query]);

  const matchCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.species.length, 0),
    [filteredGroups]
  );

  return (
    <div>
      <div className="relative mb-6 max-w-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter Pokemon, e.g. Charizard..."
          aria-label="Filter Pokemon"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        )}
      </div>

      {query && (
        <p className="mb-3 text-xs text-zinc-400">
          {matchCount} of {totalSpecies} Pokemon match &quot;{query}&quot;
        </p>
      )}

      {filteredGroups.length === 0 ? (
        <p className="text-zinc-500">No Pokemon match &quot;{query}&quot;.</p>
      ) : (
        <div className="flex flex-col gap-10">
          {filteredGroups.map((g) => {
            const withDeals = g.species.filter((s) => s.slug).length;
            return (
              <section key={g.generation}>
                <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-black dark:text-zinc-50">
                  Generation {g.generation}
                  {g.region && <span className="font-medium text-zinc-500 dark:text-zinc-400">· {g.region}</span>}
                  <span className="text-xs font-medium text-zinc-400">
                    {g.species.length} Pokemon{withDeals > 0 ? ` · ${withDeals} with deals` : ""}
                  </span>
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {g.species.map((s) =>
                    s.slug ? (
                      <Link
                        key={s.name}
                        href={`/pokemon/${s.slug}`}
                        className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-red-500/40 dark:hover:text-red-500"
                      >
                        <span className="truncate font-semibold text-black dark:text-zinc-50">{s.name}</span>
                        <span className="ml-2 shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          {s.count}
                        </span>
                      </Link>
                    ) : (
                      <span
                        key={s.name}
                        className="flex items-center rounded-lg border border-transparent px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600"
                        title="No active deals right now"
                      >
                        <span className="truncate">{s.name}</span>
                      </span>
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
