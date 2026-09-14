"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

// Client-side filter over the full, already-server-rendered set list -
// not a fetch-on-type search. All real set links stay in the initial
// HTML either way (good for crawlers - see app/sets/page.js), this is
// just a progressive-enhancement filter for a visitor scanning ~175
// items by hand. Plain substring match is enough at this list size; no
// need for real backend search.
//
// `checklistSlugs`: sets whose page renders the interactive ownership
// checklist (decided server-side in app/sets/page.js). Only those tiles get
// the "Open checklist" action, which jumps to the set page's #inventory
// section. `filter={false}` drops the filter box for the short checklist view.
export default function SetsFilterList({ sets, checklistSlugs = [], filter = true }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter((s) => s.set.toLowerCase().includes(q));
  }, [sets, query]);

  return (
    <div>
      {filter && <div className="relative mb-6 max-w-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter sets, e.g. Paldean Fates..."
          aria-label="Filter sets"
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
      </div>}

      {query && (
        <p role="status" className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {filtered.length} of {sets.length} sets match &quot;{query}&quot;
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-zinc-500">No sets match &quot;{query}&quot;.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const tile = (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              {/* Real pokemontcg.io set logo; fixed box so there's no
                  layout shift, lazy by default. No logo -> nothing (the
                  set name below still identifies it). */}
              <span className="relative block h-8 w-20 shrink-0">
                {s.logo && (
                  <Image
                    src={s.logo}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-contain object-left"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 text-black dark:text-zinc-50">
                <span className="block font-semibold">{s.set}</span>
                <span className="mt-1 block text-xs text-zinc-600 dark:text-zinc-400">{s.count > 0 ? "Explore deals & cards" : "Explore card list"}</span>
              </span>
              {s.count > 0 && (
                <span className="shrink-0 rounded-md bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">
                  {s.count} {s.count === 1 ? "deal" : "deals"}
                </span>
              )}
            </Link>
            );
            if (!checklistSlugs.includes(s.slug)) return tile;
            // The tile keeps its set-page link; the checklist action is a
            // sibling link (never nested inside it).
            return (
              <div key={s.slug} className="flex flex-col gap-2">
                {tile}
                <Link
                  href={`/sets/${s.slug}#inventory`}
                  aria-label={`Open ${s.set} checklist`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                >
                  Open checklist
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
