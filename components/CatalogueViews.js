"use client";

import { createContext, useContext, useId, useState } from "react";

// Lets a child (the gallery's "showing N of M" note) switch to the complete
// list without prop-drilling through the server wrapper. null outside.
const CatalogueViewContext = createContext(null);
export const useCatalogueView = () => useContext(CatalogueViewContext);

// Both server-rendered inventories stay mounted: permanent links remain in
// initial HTML and changing views never resets local checklist progress.
//
// `defaultView` (mobile UX refinement, 2026-09-14): pages whose list is the
// plain link index open on the visual gallery; pages with an interactive
// checklist keep the checklist first (ownership, reset and print live there).
export default function CatalogueViews({ children, gallery, listLabel = "Card list", defaultView = "list" }) {
  const id = useId();
  const [view, setView] = useState(defaultView === "gallery" ? "gallery" : "list");
  const tabs = defaultView === "gallery" ? [["gallery", "Gallery"], ["list", listLabel]] : [["list", listLabel], ["gallery", "Gallery"]];
  return (
    <CatalogueViewContext.Provider value={{ view, setView }}>
      <div className="mt-3">
        {/* Without JavaScript the toggle cannot switch views, so it is hidden
            and a server-hidden list pane is shown (its <details> index still
            opens natively). Same <noscript> CSS pattern as FilterBar's
            SearchWithinRow; scripted browsers are unaffected. The unhide rule
            sits in @layer base because Tailwind's preflight
            [hidden]{display:none!important} does, and a layered !important
            beats an unlayered one; inside the layer the more specific
            selector wins. */}
        <noscript>
          <style>{"[data-catalogue-toggle]{display:none!important}@layer base{[data-catalogue-primary][hidden]{display:block!important}}"}</style>
        </noscript>
        <div role="group" aria-label="Inventory view" data-catalogue-toggle className="inline-flex rounded-full border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900" data-print-hide>
          {tabs.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} aria-controls={`${id}-${key}`}
              onClick={() => setView(key)}
              className={`min-h-11 min-w-24 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 ${view === key ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <div id={`${id}-list`} hidden={view !== "list"} data-catalogue-primary>{children}</div>
        <div id={`${id}-gallery`} hidden={view !== "gallery"} data-print-hide>{gallery}</div>
      </div>
    </CatalogueViewContext.Provider>
  );
}
