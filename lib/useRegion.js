"use client";

import { useSyncExternalStore } from "react";
import { REGION_KEY, REGIONS } from "@/components/RegionControl";

// The effective marketplace the visitor is shopping in, read the same way
// the header RegionControl reads it: the stored choice if any (incl. "" =
// "All countries"), else the ?country= currently on the URL (set by a
// filter click or RegionRedirect's geo default), else "". Client-only -
// the server snapshot is "" so SSR renders the safe US default and the
// real region takes over on hydration. Re-reads on storage / popstate /
// the custom `pdf:region` event RegionControl and RegionRedirect fire.

const KNOWN = new Set(REGIONS.map((r) => r.code).filter(Boolean));

function subscribe(onChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("pdf:region", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("pdf:region", onChange);
  };
}

// marketplace-broaden-r1: an explicit ?country= on the URL (a marketplace, or
// "all") wins over the stored choice - it is what the page is showing.
function snapshot() {
  const fromUrl = new URLSearchParams(window.location.search).get("country");
  if (fromUrl && KNOWN.has(fromUrl)) return fromUrl;
  if (fromUrl && fromUrl.toLowerCase() === "all") return "";
  try {
    const stored = window.localStorage.getItem(REGION_KEY);
    if (stored !== null) return stored; // incl. "" = All marketplaces
  } catch {
    /* private mode / blocked */
  }
  return "";
}

const serverSnapshot = () => "";

// Returns "EBAY_XX" or "" (All / unknown / SSR).
export function useRegion() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

// Metadata for a SELECTED marketplace. "" / null / "All countries" -> null:
// with no explicit country chosen there's no region to name, so callers
// (ShoppingContext, RegionSuffix) render nothing rather than an awkward
// "in All countries" / "Shopping in: 🌐 All countries".
export function regionMeta(code) {
  if (!code) return null;
  return REGIONS.find((r) => r.code === code && r.code) ?? null;
}

export { localizeEbaySearchUrl } from "@/lib/ebaySearch";
