"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isSaved, toggleSaved, subscribeCards, cardKey } from "@/lib/recentCards";

// A local "save this card" toggle. Purely client-side (localStorage) -
// no account, no server. The saved list surfaces again in
// <CardMemoryStrip> on the homepage. `card` is a plain descriptor:
//   { slug?, dealId?, name, set, image, price }
// (slug when the card has a hub page, otherwise dealId for a one-off
// listing).
//
// `compact` renders an icon-only heart for use in the corner of a grid
// card; the default is a labelled button for page headers.
export default function SaveCardButton({ card, compact = false, className = "" }) {
  const key = cardKey(card);
  const getSnapshot = useCallback(() => isSaved(card), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = useSyncExternalStore(subscribeCards, getSnapshot, () => false);

  function onClick(e) {
    // In a grid the button sits inside/over a link - don't navigate.
    e.preventDefault();
    e.stopPropagation();
    toggleSaved(card);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved cards" : "Save this card"}
        title={saved ? "Saved" : "Save this card"}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-base shadow-sm backdrop-blur transition-colors ${
          saved
            ? "border-red-300 bg-red-50/95 text-red-600 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300"
            : "border-zinc-200 bg-white/90 text-zinc-400 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-950/90 dark:hover:text-red-400"
        } ${className}`}
      >
        <span aria-hidden>{saved ? "♥" : "♡"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved cards" : "Save this card"}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        saved
          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      } ${className}`}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
