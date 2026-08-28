"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isSaved, toggleSaved, subscribeCards } from "@/lib/recentCards";

// A local "save this card" toggle. Purely client-side (localStorage) -
// no account, no server. The saved list surfaces again in
// <CardMemoryStrip> on the homepage. `card` is a plain descriptor built
// on the server: { slug, name, set, image, price }.
export default function SaveCardButton({ card, className = "" }) {
  const slug = card?.slug;
  const getSnapshot = useCallback(() => isSaved(slug), [slug]);
  const saved = useSyncExternalStore(subscribeCards, getSnapshot, () => false);

  return (
    <button
      type="button"
      onClick={() => toggleSaved(card)}
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
