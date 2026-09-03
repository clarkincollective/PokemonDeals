"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { AppliedFilters, FilterNotes, FilteredEmptyState } from "@/components/DealFilterChips";
import { hasActiveDealFilters, normalizeDealFilters } from "@/lib/dealFilters";

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
    // 13B.3 graded scoping (Pokemon page)
    grader: get("grader"),
    grade: get("grade"),
    listingType: get("listing"),
    maxPrice: num("maxPrice"),
    minPrice: num("minPrice"),
    sort: get("sort"),
    page: Math.max(1, Number(sp.get("page")) || 1),
    raw: sp.toString(),
    obj: Object.fromEntries(sp.entries()),
  };
  // A non-default state (must fetch a filtered slice) is: page > 1, a
  // country or sort override, or any recognised deal filter. Malformed
  // filter values (grade=999, maxPrice=-5, grader=INVALID) normalise away
  // to nothing, so they correctly leave the page on its server-rendered
  // default.
  const dealFilterActive = hasActiveDealFilters({
    type: sp.get("type"),
    grader: sp.get("grader"),
    grade: sp.get("grade"),
    listing: sp.get("listing"),
    minPrice: sp.get("minPrice"),
    maxPrice: sp.get("maxPrice"),
  });
  p.isDefault = p.page === 1 && !p.country && !p.sort && !dealFilterActive;
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

export default function DealGrid({ kind, slug, basePath, initial, hubCounts = {}, emptyLabel, validSetSlugs = [], defaultSort = "newest", subjectLabel }) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const params = useMemo(() => parseSearch(search), [search]);
  const reqKey = params.raw;

  // Graded scoping (grader / grade + the dependent UI) is a Pokemon-page
  // concern only - set / category grids are unchanged.
  const showGrading = kind === "species";

  // The EFFECTIVE (normalised) filter state drives which pills read as
  // active - so a contradictory URL like ?type=raw&grader=PSA lights the
  // Graded pill (matching the note + chips), not Raw. hrefs still build
  // off the raw params.obj so toggles operate on the real URL.
  const norm = showGrading
    ? normalizeDealFilters({
        type: params.cardType,
        grader: params.grader,
        grade: params.grade,
        listing: params.listingType,
        minPrice: params.obj.minPrice,
        maxPrice: params.obj.maxPrice,
      })
    : null;
  const effType = norm ? (norm.type === "all" ? null : norm.type) : params.cardType;
  const effGrader = norm ? norm.grader : params.grader;
  const effGrade = norm ? norm.grade : params.grade;

  const [fetched, setFetched] = useState(null); // { key, deals, totalPages, error }

  useEffect(() => {
    if (params.isDefault) return;
    let cancelled = false;
    const q = new URLSearchParams({ kind, slug });
    q.set("page", String(params.page));
    q.set("sort", params.sort ?? defaultSort);
    if (params.country) q.set("country", params.country);
    if (params.cardType) q.set("type", params.cardType);
    if (showGrading && params.grader) q.set("grader", params.grader);
    if (showGrading && params.grade) q.set("grade", params.grade);
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
  }, [kind, slug, reqKey, params, defaultSort, showGrading]);

  const loading = !params.isDefault && fetched?.key !== reqKey;
  const view = params.isDefault
    ? { deals: initial.deals, totalPages: initial.totalPages, error: null }
    : loading
      ? { deals: [], totalPages: 1, error: null }
      : { deals: fetched.deals, totalPages: fetched.totalPages, error: fetched.error };

  // "This is a filtered query" - drives the empty state (relaxation
  // actions vs. the plain default label) and whether to show chips.
  const filtered = hasActiveDealFilters({
    type: params.cardType,
    grader: params.grader,
    grade: params.grade,
    listing: params.listingType,
    minPrice: params.obj.minPrice,
    maxPrice: params.obj.maxPrice,
  });

  return (
    <>
      {/* Structural filter analytics (existing FILTER_APPLIED / SORT_CHANGED
          / COUNTRY_CHANGED events, via the global delegation in
          AnalyticsBootstrap) - scoped to the Pokemon page added in 13B.3;
          set / category grids are left exactly as they were. */}
      <div className="mb-8" {...(showGrading ? { "data-analytics-filter-bar": "" } : {})}>
        <FilterBar
          params={params.obj}
          country={params.country}
          cardType={showGrading ? effType : params.cardType}
          grader={showGrading ? effGrader : undefined}
          grade={showGrading ? effGrade : undefined}
          showGrading={showGrading}
          listingType={params.listingType}
          maxPrice={params.maxPrice}
          minPrice={params.minPrice}
          sort={params.sort}
          basePath={basePath}
        />
      </div>

      {showGrading && <FilterNotes params={params.obj} />}
      {showGrading && filtered && (
        <AppliedFilters
          params={params.obj}
          basePath={basePath}
          resultCount={loading ? undefined : view.deals.length}
        />
      )}

      {view.error && (
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {view.error}</p>
      )}

      {loading ? (
        <GridSkeleton />
      ) : !view.error && view.deals.length === 0 ? (
        showGrading && filtered ? (
          <FilteredEmptyState
            params={params.obj}
            basePath={basePath}
            subjectLabel={subjectLabel ?? "matching"}
          />
        ) : (
          <p className="text-zinc-500">{emptyLabel}</p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {view.deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              hub={hubCounts[deal.watchlist_id]}
              pageName={`${kind}_detail`}
              validSetSlugs={validSetSlugs}
              from={basePath}
              fromCountry={params.country}
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
