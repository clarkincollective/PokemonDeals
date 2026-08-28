"use client";

import { useSyncExternalStore } from "react";

// Viewer's currency + region + FX rates. Fetched once from /api/rates
// AFTER hydration, so the price-bearing pages (card / deal / set / etc.)
// never read the geo header during render and stay statically cacheable
// (X-Vercel-Cache: HIT). Until it resolves, every <Price> renders the
// listing's own (native) currency - a real price, and what a crawler
// indexes.
//
// Flash fix: the previous version resolved this only via the /api/rates
// round-trip, so for ~0.5s a returning viewer saw mixed currencies (a
// native listing price next to USD "typical" / "Save" figures) before
// the swap. Now the last successful /api/rates response is cached in
// localStorage and used to PRIME the store synchronously. SSR and the
// hydration render still use the null baseline (crawler still sees the
// native listing currency, unchanged); the cached value is applied in
// the same commit as hydration - before paint - via useSyncExternalStore,
// not after a network wait. A first-ever visitor gets the old behaviour
// (native, then convert once /api/rates lands) - no regression.

const CACHE_KEY = "pdf_rates_v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Stable references: useSyncExternalStore requires getSnapshot /
// getServerSnapshot to return the same value until something actually
// changes, or it re-renders forever.
const SERVER_SNAPSHOT = { viewer: null, marketplace: null, rates: null };
let clientSnapshot = SERVER_SNAPSHOT;

let primed = false;
let refreshStarted = false;
const listeners = new Set();

function readCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.ts !== "number" ||
      Date.now() - parsed.ts > MAX_AGE_MS ||
      !parsed.rates ||
      typeof parsed.rates !== "object"
    ) {
      return null;
    }
    return {
      viewer: parsed.viewer ?? null,
      marketplace: parsed.marketplace ?? null,
      rates: parsed.rates,
    };
  } catch {
    return null;
  }
}

function getSnapshot() {
  if (!primed) {
    primed = true;
    const cached = readCache();
    if (cached) clientSnapshot = cached;
  }
  return clientSnapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function emit() {
  for (const listener of listeners) listener();
}

function refresh() {
  if (refreshStarted) return;
  refreshStarted = true;
  fetch("/api/rates")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d?.rates) return;
      clientSnapshot = {
        viewer: d.viewer ?? null,
        marketplace: d.marketplace ?? null,
        rates: d.rates,
      };
      try {
        window.localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ...clientSnapshot, ts: Date.now() })
        );
      } catch {
        // private mode / quota - the in-memory snapshot is still fine
      }
      emit();
    })
    .catch(() => {});
}

function subscribe(listener) {
  listeners.add(listener);
  refresh();
  return () => listeners.delete(listener);
}

export function useCurrency() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Kept so the existing <CurrencyProvider> mount in app/layout.js keeps
// working; the store itself is module-level now, so this is just a
// pass-through.
export default function CurrencyProvider({ children }) {
  return children;
}
