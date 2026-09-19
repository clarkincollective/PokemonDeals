"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isSearchSaved, toggleSavedSearch, subscribeSearches, searchId } from "@/lib/savedSearches";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";

// "Save this search" beside the applied-filter chips of a filtered grid.
// Device-local (lib/savedSearches); the list lives on /saved. `href` is
// the current grid URL (path + query); `label` the chip summary; `scope`
// the grid's subject. `facetCount` is the only thing analytics sees.
export default function SaveSearchButton({ href, label, scope, facetCount = 0, className = "" }) {
  const id = searchId(href);
  const getSnapshot = useCallback(() => isSearchSaved(href), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = useSyncExternalStore(subscribeSearches, getSnapshot, () => false);
  if (!id) return null;

  function onClick() {
    const { saved: now } = toggleSavedSearch({ href, label, scope });
    if (now) capture(EVENTS.SAVED_SEARCH_SAVED, { facet_count: facetCount });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${
        saved
          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      } ${className}`}
    >
      <span aria-hidden>{saved ? "★" : "☆"}</span>
      {saved ? "Search saved" : "Save this search"}
    </button>
  );
}
