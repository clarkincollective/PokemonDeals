"use client";

import { useState } from "react";

// Shared collapse/expand wrapper for the filter rows (Country, Card &
// listing, Price, ...) - three stacked rows of pills reads as clutter on
// every grid page, especially the /sets/[slug] pages where it sits above
// a page someone's actively browsing through. Collapsed by default to
// keep that first screen clean, but starts open whenever a filter from
// this row group is already active (defaultOpen) - an applied filter
// should never be hidden without explanation.
export default function FilterToggle({ defaultOpen, activeCount = 0, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        Filters
        {!open && activeCount > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
