"use client";

import { useSyncExternalStore } from "react";
import { readSaved, subscribeCards, getServerSnapshot } from "@/lib/recentCards";
import { readSavedSearches, subscribeSearches, getServerSnapshot as noSearches } from "@/lib/savedSearches";

// "Saved (N)" - the entry to /saved from the header (desktop utility) and
// the mobile menu. N = saved cards + saved searches on THIS device; the
// server renders plain "Saved" and the count appears after hydration (no
// mismatch: both stores hand the server an empty snapshot).
export default function SavedNavLink({ variant = "desktop", onClick }) {
  const cards = useSyncExternalStore(subscribeCards, readSaved, getServerSnapshot);
  const searches = useSyncExternalStore(subscribeSearches, readSavedSearches, noSearches);
  const n = cards.length + searches.length;
  const label = n > 0 ? `Saved (${n})` : "Saved";

  if (variant === "tile") {
    return (
      <a
        href="/saved"
        onClick={onClick}
        className="flex min-h-12 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-[15px] font-semibold leading-tight text-zinc-900 hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-600"
      >
        <span aria-hidden className="text-red-600">♥</span>
        {label}
      </a>
    );
  }

  return (
    <a
      href="/saved"
      aria-label={n > 0 ? `Saved cards and searches, ${n}` : "Saved cards and searches"}
      className="hidden min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold tracking-tight text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 lg:inline-flex dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-red-500"
    >
      <span aria-hidden className={n > 0 ? "text-red-600" : "text-zinc-400"}>{n > 0 ? "♥" : "♡"}</span>
      {label}
    </a>
  );
}
