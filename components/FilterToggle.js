"use client";

import { useRef, useState } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";

// Collapse/expand wrapper for the filter rows. Below `lg` the rows are
// clutter on a page someone's actively scrolling, so they stay behind a
// "Filters" button (open automatically when a filter is already active).
// On `lg` and up there's room - the rows are always shown, no toggle, so
// filtering (especially region) is one click, not two.
export default function FilterToggle({ defaultOpen, activeCount = 0, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const openedOnce = useRef(false);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setOpen((o) => {
            if (!o && !openedOnce.current) {
              openedOnce.current = true;
              capture(EVENTS.FILTER_OPENED, { context: "all_deals" });
            }
            return !o;
          })
        }
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 lg:hidden dark:text-zinc-400 dark:hover:text-zinc-200"
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

      <div className={`${open ? "mt-4 block" : "hidden"} lg:mt-0 lg:block`}>{children}</div>
    </div>
  );
}
