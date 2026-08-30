"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// The full National Pokedex, grouped into collapsible generation
// sections, with a client-side filter over it. Every species (and its
// /pokemon/[slug] link) is in the server-rendered HTML for crawlers -
// this is progressive enhancement for a visitor scanning ~1,000 names.
//
// Collapsed by default (only Gen 1 open) so 1,025 entries don't render as
// one wall. A species with an active deal (hasDeal) gets the green
// treatment + a listing-count badge and points at its live deal page;
// the rest point at the species' full card catalogue.
export default function PokemonFilterList({ groups }) {
  const [query, setQuery] = useState("");
  const [openGens, setOpenGens] = useState(() => new Set([groups[0]?.generation]));

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

  const filtering = query.trim() !== "";

  function toggleGen(gen) {
    setOpenGens((prev) => {
      const next = new Set(prev);
      if (next.has(gen)) next.delete(gen);
      else next.add(gen);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
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
        {!filtering && (
          <button
            type="button"
            onClick={() =>
              setOpenGens((prev) =>
                prev.size === groups.length ? new Set() : new Set(groups.map((g) => g.generation))
              )
            }
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
          >
            {openGens.size === groups.length ? "Collapse all" : "Expand all"}
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
        <div className="flex flex-col gap-3">
          {filteredGroups.map((g) => {
            const withDeals = g.species.filter((s) => s.hasDeal).length;
            const open = filtering || openGens.has(g.generation);
            return (
              <section key={g.generation} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => toggleGen(g.generation)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-black dark:text-zinc-50">
                    Generation {g.generation}
                    {g.region && (
                      <span className="font-medium text-zinc-500 dark:text-zinc-400">· {g.region}</span>
                    )}
                    <span className="text-xs font-medium text-zinc-400">
                      {g.species.length} Pokemon{withDeals > 0 ? ` · ${withDeals} with deals` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                </button>

                {/* Always in the DOM (so every /pokemon/[slug] link is in
                    the server HTML for crawlers); `hidden` only collapses
                    it visually. */}
                <div
                  className={`${open ? "grid" : "hidden"} grid-cols-2 gap-2 border-t border-zinc-100 px-4 py-3 sm:grid-cols-3 lg:grid-cols-4 dark:border-zinc-900`}
                >
                  {g.species.map((s) => (
                      <Link
                        key={s.name}
                        href={`/pokemon/${s.slug}`}
                        className={
                          s.hasDeal
                            ? "flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm transition-colors hover:border-emerald-500 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                            : "flex items-center justify-between gap-2 rounded-lg border border-transparent px-3 py-2 text-sm text-zinc-600 transition-colors hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-500"
                        }
                        title={s.hasDeal ? `${s.count} active deal${s.count === 1 ? "" : "s"}` : "Browse every card"}
                      >
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
                            {String(s.dex).padStart(4, "0")}
                          </span>
                          <span
                            className={`truncate ${s.hasDeal ? "font-semibold text-black dark:text-zinc-50" : ""}`}
                          >
                            {s.name}
                          </span>
                        </span>
                        {s.hasDeal && (
                        <span className="shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                          {s.count}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
