"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// Client-side filter over the full, already-server-rendered set list -
// not a fetch-on-type search. All real set links stay in the initial
// HTML either way (good for crawlers - see app/sets/page.js), this is
// just a progressive-enhancement filter for a visitor scanning ~175
// items by hand. Plain substring match is enough at this list size; no
// need for real backend search.
export default function SetsFilterList({ sets }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter((s) => s.set.toLowerCase().includes(q));
  }, [sets, query]);

  return (
    <div>
      <div className="relative mb-6 max-w-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter sets, e.g. Paldean Fates..."
          aria-label="Filter sets"
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
          {filtered.length} of {sets.length} sets match &quot;{query}&quot;
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-zinc-500">No sets match &quot;{query}&quot;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
            >
              <span className="font-medium text-black dark:text-zinc-50">{s.set}</span>
              <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {s.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
