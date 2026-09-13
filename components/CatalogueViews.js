"use client";

import { useId, useState } from "react";

// Both server-rendered inventories stay mounted: permanent links remain in
// initial HTML and changing views never resets local checklist progress.
export default function CatalogueViews({ children, gallery, listLabel = "Card list" }) {
  const id = useId();
  const [view, setView] = useState("list");
  return (
    <div className="mt-5">
      <div role="group" aria-label="Inventory view" className="flex flex-wrap gap-2" data-print-hide>
        {[["list", listLabel], ["gallery", "Search & gallery"]].map(([key, label]) => (
          <button key={key} type="button" aria-pressed={view === key} aria-controls={`${id}-${key}`}
            onClick={() => setView(key)}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${view === key ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"}`}>
            {label}
          </button>
        ))}
      </div>
      <div id={`${id}-list`} hidden={view !== "list"} data-catalogue-primary>{children}</div>
      <div id={`${id}-gallery`} hidden={view !== "gallery"} data-print-hide>{gallery}</div>
    </div>
  );
}
