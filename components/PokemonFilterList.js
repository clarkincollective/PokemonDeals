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
  const [dealsOnly, setDealsOnly] = useState(false);
  const [openGens, setOpenGens] = useState(() => new Set([groups[0]?.generation]));

  const totalSpecies = useMemo(
    () => groups.reduce((n, g) => n + g.species.length, 0),
    [groups]
  );

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !dealsOnly) return groups;
    return groups
      .map((g) => ({ ...g, species: g.species.filter((s) => s.name.toLowerCase().includes(q) && (!dealsOnly || s.hasDeal)) }))
      .filter((g) => g.species.length > 0);
  }, [groups, query, dealsOnly]);

  const matchCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.species.length, 0),
    [filteredGroups]
  );

  const filtering = query.trim() !== "" || dealsOnly;

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
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Pokemon selection">
        {[false, true].map((only) => (
          <button key={String(only)} type="button" aria-pressed={dealsOnly === only} onClick={() => setDealsOnly(only)} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ${dealsOnly === only ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"}`}>
            {only ? "With deals" : "All Pokemon"}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter Pokemon, e.g. Charizard..."
            aria-label="Filter Pokemon"
            className="w-full rounded-lg border border-zinc-300 bg-white min-h-11 px-4 py-2.5 pr-14 text-base outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
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
            className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
          >
            {openGens.size === groups.length ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      {filtering && (
        <p role="status" className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {matchCount} of {totalSpecies} Pokemon{query.trim() ? <> match &quot;{query}&quot;</> : " shown"}{dealsOnly ? " with qualifying deals" : ""}
        </p>
      )}

      {filteredGroups.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No Pokemon match these filters. Clear the name or choose All Pokemon to browse the catalogue.</p>
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
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
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
                  className={`${open ? "grid" : "hidden"} grid-cols-1 min-[480px]:grid-cols-2 gap-2 border-t border-zinc-100 px-4 py-3 sm:grid-cols-3 lg:grid-cols-4 dark:border-zinc-900`}
                >
                  {g.species.map((s) => (
                      <Link
                        key={s.name}
                        href={`/pokemon/${s.slug}`}
                        className={s.hasDeal ? "species-tile species-tile-deal" : "species-tile species-tile-plain"}
                        title={s.hasDeal ? `${s.count} active listing${s.count === 1 ? "" : "s"}` : "Browse every card"}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {/* PokéAPI game sprite - small identification-
                              scale icon, deterministic URL from the dex
                              number, lazy, fixed 28px box (no CLS). Hidden
                              if it fails to load. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${s.dex}.png`}
                            alt=""
                            width={28}
                            height={28}
                            loading="lazy"
                            decoding="async"
                            className="species-sprite"
                            onError={(e) => {
                              e.currentTarget.style.visibility = "hidden";
                            }}
                          />
                          <span className="species-dex">
                            {String(s.dex).padStart(4, "0")}
                          </span>
                          <span
                            className={s.hasDeal ? "species-name species-name-deal" : "species-name"}
                          >
                            {s.name}
                          </span>
                        </span>
                        {s.hasDeal && (
                        <span className="shrink-0 rounded-md bg-emerald-700 px-1.5 py-0.5 text-xs font-semibold text-white">
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
