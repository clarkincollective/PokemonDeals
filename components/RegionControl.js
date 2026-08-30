"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The countries the site scans - display data only. Source of truth for
// the codes/labels is MARKETPLACES in lib/ebay.js; kept in sync by hand
// (this list changes about once a year).
export const REGIONS = [
  { code: "", label: "All countries", flag: "🌐" },
  { code: "EBAY_US", label: "United States", flag: "🇺🇸" },
  { code: "EBAY_GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "EBAY_AU", label: "Australia", flag: "🇦🇺" },
  { code: "EBAY_CA", label: "Canada", flag: "🇨🇦" },
  { code: "EBAY_DE", label: "Germany", flag: "🇩🇪" },
  { code: "EBAY_IT", label: "Italy", flag: "🇮🇹" },
];

// localStorage value:
//   absent  -> no choice yet (don't force a country anywhere)
//   ""      -> explicitly chose "All countries" (also don't force)
//   EBAY_XX -> force this country as the default filter site-wide
export const REGION_KEY = "pdf:region";

const KNOWN_CODES = new Set(REGIONS.map((r) => r.code).filter(Boolean));

function readStoredRegion() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REGION_KEY);
  } catch {
    return null;
  }
}

// The region the header should reflect: the stored choice if there is one
// (including "" for an explicit "All countries"), otherwise the country
// currently applied via ?country= (set by a filter click or the geo-IP
// default in RegionRedirect), otherwise null ("Shipping to…").
function readEffectiveRegion() {
  const stored = readStoredRegion();
  if (stored !== null) return stored;
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("country");
  return fromUrl && KNOWN_CODES.has(fromUrl) ? fromUrl : null;
}

function subscribeRegion(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("pdf:region", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("pdf:region", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

// Header control: "Shipping to 🇦🇺". Picking a country stores it and
// reloads the current page with ?country=; <RegionRedirect> then keeps
// every other page in sync. Deliberately uses window.location rather than
// the router hooks so it's safe inside the shared header on statically
// rendered pages too.
export default function RegionControl() {
  const region = useSyncExternalStore(subscribeRegion, readEffectiveRegion, () => null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = REGIONS.find((r) => r.code === (region || "")) ?? REGIONS[0];

  function pick(code) {
    setOpen(false);
    try {
      window.localStorage.setItem(REGION_KEY, code);
    } catch {
      /* ignore - still navigate for this session */
    }
    window.dispatchEvent(new Event("pdf:region"));

    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    if (code) url.searchParams.set("country", code);
    else url.searchParams.delete("country");
    window.location.assign(url.toString());
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-red-500"
      >
        <span aria-hidden>{current.flag}</span>
        <span className="hidden sm:inline">
          {region === null ? "Shipping to…" : current.code ? current.label : "All countries"}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-52 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Show deals shipping from
          </p>
          {REGIONS.map((r) => (
            <button
              key={r.code || "all"}
              type="button"
              role="menuitemradio"
              aria-checked={(region || "") === r.code}
              onClick={() => pick(r.code)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                (region || "") === r.code
                  ? "font-semibold text-red-600 dark:text-red-500"
                  : "text-zinc-600 dark:text-zinc-300"
              }`}
            >
              <span aria-hidden>{r.flag}</span>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
