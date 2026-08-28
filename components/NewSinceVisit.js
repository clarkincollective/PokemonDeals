"use client";

import { useEffect, useSyncExternalStore } from "react";

const KEY = "pdf:lastVisit";
const noopSubscribe = () => () => {};

function readLastVisit() {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

// A small badge for the homepage "Just added" section: "N new since your
// last visit", where N counts the listed cards first seen after the
// viewer's previous visit. Records "now" as the new last-visit time on
// mount (a side-effect, so this render still compares against the
// PREVIOUS visit). Renders nothing on a first-ever visit or when nothing
// is new. `timestamps` is the freshFinds cards' first_seen_at (ISO).
export default function NewSinceVisit({ timestamps = [] }) {
  // useSyncExternalStore reads localStorage without a setState-in-effect
  // and gives a correct server snapshot (0) for hydration.
  const lastVisit = useSyncExternalStore(noopSubscribe, readLastVisit, () => 0);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  if (!lastVisit) return null;
  const count = timestamps.filter((t) => new Date(t).getTime() > lastVisit).length;
  if (count === 0) return null;

  return (
    <span className="rounded-full bg-live/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-live/20 dark:text-amber-300">
      {count} new since your last visit
    </span>
  );
}
