"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

// The countries the site scans - display data only. Source of truth for
// the codes/labels is MARKETPLACES in lib/ebay.js; kept in sync by hand
// (this list changes about once a year).
export const REGIONS = [
  { code: "", label: "All marketplaces", flag: "🌐" },
  { code: "EBAY_US", label: "United States", flag: "🇺🇸" },
  { code: "EBAY_GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "EBAY_AU", label: "Australia", flag: "🇦🇺" },
  { code: "EBAY_CA", label: "Canada", flag: "🇨🇦" },
  { code: "EBAY_DE", label: "Germany", flag: "🇩🇪" },
  { code: "EBAY_IT", label: "Italy", flag: "🇮🇹" },
];

// localStorage value:
//   absent  -> no choice yet (don't force a marketplace anywhere)
//   ""      -> explicitly chose "All marketplaces" (also don't force)
//   EBAY_XX -> force this marketplace as the default filter site-wide
// The URL form of "All marketplaces" is ?country=all (lib/marketplaceScope).
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

// The marketplace the header should reflect. An explicit ?country= on the
// URL wins (a known marketplace, or "all" -> ""), because that is what the
// page is actually showing; otherwise the stored choice (including "" for
// All marketplaces); otherwise null (no choice yet).
function readEffectiveRegion() {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("country");
  if (fromUrl && KNOWN_CODES.has(fromUrl)) return fromUrl;
  if (fromUrl && fromUrl.toLowerCase() === "all") return "";
  return readStoredRegion();
}

// An explicit "All marketplaces" link anywhere on the page
// (data-marketplace-choice="all": the filter pill, the broadening action)
// saves the choice in the same stored preference the menu uses, so the
// visitor's later pages keep showing every marketplace until they pick one.
function rememberMarketplaceChoice(event) {
  const link = event.target?.closest?.("[data-marketplace-choice]");
  if (!link) return;
  const choice = link.getAttribute("data-marketplace-choice");
  const code = choice === "all" ? "" : KNOWN_CODES.has(choice) ? choice : null;
  if (code === null) return;
  try {
    window.localStorage.setItem(REGION_KEY, code);
  } catch {
    /* ignore - the URL still carries the choice */
  }
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
  const buttonRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    document.addEventListener("click", rememberMarketplaceChoice, true);
    return () => document.removeEventListener("click", rememberMarketplaceChoice, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const current = REGIONS.find((r) => r.code === (region || "")) ?? REGIONS[0];

  function onKeyDown(event) {
    if (!open) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    const items = [...rootRef.current.querySelectorAll('[role="menuitemradio"]')];
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

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
    // "" is the explicit All marketplaces choice: carried on the URL too, so
    // it survives even where the stored preference is unavailable.
    url.searchParams.set("country", code || "all");
    window.location.assign(url.toString());
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        type="button"
        ref={buttonRef}
        aria-label={`eBay marketplace: ${current.label}`}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-red-500"
      >
        <span aria-hidden>{current.flag}</span>
        <span className="hidden sm:inline">
          {region === null ? "eBay marketplace" : current.code ? `eBay ${current.label}` : "All marketplaces"}
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
          id={menuId}
          role="menu"
          aria-label="eBay marketplace"
          className="absolute right-0 top-full z-40 mt-2 w-52 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Show listings on
          </p>
          {REGIONS.map((r) => (
            <button
              key={r.code || "all"}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={(region || "") === r.code}
              onClick={() => pick(r.code)}
              className={`flex min-h-[44px] w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
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
