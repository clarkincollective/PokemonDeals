"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";

// The filterable, paginated deal grid for /sets/[slug] and
// /pokemon/[slug]. Those pages render page 1 (no filters) server-side and
// hand it here as `initial` - that IS the crawler-visible HTML and the
// first paint. Any filter / page > 1 is fetched from /api/deals-page on
// the client, so the host page reads no request-time APIs and stays
// statically cacheable at the edge.
//
// Deliberately NOT next/navigation's useSearchParams(): on a statically
// prerendered page that hook drops the whole route to client-only
// rendering (the grid would vanish from the crawler HTML). We read
// window.location.search via useSyncExternalStore instead - server
// snapshot is "" so SSR always renders `initial` - and re-read on
// popstate (back/forward) and pdf:region (the geo default RegionRedirect
// applies with a client-side router.replace, which fires no popstate).
//
// FilterBar / Pagination emit plain <a href> links, so a filter/page
// click is a full navigation back to the cached static shell; this then
// re-mounts and reads the new URL.
function subscribe(onChange) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("pdf:region", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("pdf:region", onChange);
  };
}
const getSnapshot = () => window.location.search;
const getServerSnapshot = () => "";

function parseSearch(search) {
  const sp = new URLSearchParams(search);
  const get = (k) => sp.get(k) || null;
  const num = (k) => (sp.get(k) ? Number(sp.get(k)) : null);
  const p = {
    country: get("country"),
    cardType: get("type"),
    listingType: get("listing"),
    maxPrice: num("maxPrice"),
    minPrice: num("minPrice"),
    sort: get("sort"),
    page: Math.max(1, Number(sp.get("page")) || 1),
    raw: sp.toString(),
    obj: Object.fromEntries(sp.entries()),
  };
  p.isDefault =
    p.page === 1 && !p.country && !p.cardType && !p.listingType && !p.maxPrice && !p.minPrice && !p.sort;
  return p;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-72 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      ))}
    </div>
  );
}

export default function DealGrid({ kind, slug, basePath, initial, hubCounts = {}, emptyLabel }) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const params = useMemo(() => parseSearch(search), [search]);
  const reqKey = params.raw;

  const [fetched, setFetched] = useState(null); // { key, deals, totalPages, error }

  useEffect(() => {
    if (params.isDefault) return;
    let cancelled = false;
    const q = new URLSearchParams({ kind, slug });
    q.set("page", String(params.page));
    q.set("sort", params.sort ?? "newest");
    if (params.country) q.set("country", params.country);
    if (params.cardType) q.set("type", params.cardType);
    if (params.listingType) q.set("listing", params.listingType);
    if (params.maxPrice) q.set("maxPrice", String(params.maxPrice));
    if (params.minPrice) q.set("minPrice", String(params.minPrice));
    fetch(`/api/deals-page?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled)
          setFetched({ key: reqKey, deals: d.deals ?? [], totalPages: d.totalPages ?? 1, error: d.error ?? null });
      })
      .catch((e) => {
        if (!cancelled) setFetched({ key: reqKey, deals: [], totalPages: 1, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slug, reqKey, params]);

  const loading = !params.isDefault && fetched?.key !== reqKey;
  const view = params.isDefault
    ? { deals: initial.deals, totalPages: initial.totalPages, error: null }
    : loading
      ? { deals: [], totalPages: 1, error: null }
      : { deals: fetched.deals, totalPages: fetched.totalPages, error: fetched.error };

  return (
    <>
      <div className="mb-8">
        <FilterBar
          params={params.obj}
          country={params.country}
          cardType={params.cardType}
          listingType={params.listingType}
          maxPrice={params.maxPrice}
          minPrice={params.minPrice}
          sort={params.sort}
          basePath={basePath}
        />
      </div>

      {view.error && (
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {view.error}</p>
      )}

      {loading ? (
        <GridSkeleton />
      ) : !view.error && view.deals.length === 0 ? (
        <p className="text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {view.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              hub={hubCounts[deal.watchlist_id]}
              pageName={`${kind}_detail`}
            />
          ))}
        </div>
      )}

      {view.totalPages > 1 && (
        <div className="mt-10">
          <Pagination
            page={params.page}
            totalPages={view.totalPages}
            params={params.obj}
            basePath={basePath}
          />
        </div>
      )}
    </>
  );
}
