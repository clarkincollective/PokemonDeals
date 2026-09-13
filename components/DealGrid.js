"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import DealCard from "@/components/DealCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import GridSkeleton from "@/components/GridSkeleton";
import { AppliedFilters, FilterNotes, FilteredEmptyState, EmptyGridState } from "@/components/DealFilterChips";
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
    q: get("q"),
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
  p.isDefault = p.page === 1 && !p.country && !p.sort && !p.q && !dealFilterActive;
  return p;
}

export default function DealGrid({ kind, slug, basePath, initial, hubCounts = {}, emptyLabel, validSetSlugs = [], defaultSort = "newest", subjectLabel, compactFilters = false, lockedCardType = null }) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const params = useMemo(() => parseSearch(search), [search]);
  const reqKey = params.raw;

  // The shared structured deal-filter contract (grader / grade + the
  // dependent UI, chips, notes, relaxation empty state, filter analytics).
  // Species (13B.3) + set (13B.4.3). Graded browsing pilot: the one
  // category (slug "graded") whose own preset already fixes cardType, so
  // narrowing further by grader/grade is meaningful the same way it is on
  // a species/set page. Other categories stay on the plain FilterBar for
  // now - this is a bounded pilot, not a category-wide rollout.
  const showGrading = kind === "species" || kind === "set" || (kind === "category" && slug === "graded");
  // Same pilot scope for search-within-inventory.
  const searchable = kind === "category" && slug === "graded";
  // Review closure (2026-09-14): a direct navigation to a FILTERED URL on
  // this page renders the server's page-1 default (by design, for static
  // cacheability - see the file header) until hydration corrects it. That
  // correction is normally fast, but under a slow first JS-bundle load a
  // visitor can be shown unfiltered default results, unlabelled as such,
  // for as long as that download takes - a real, demonstrated defect
  // (measured: the full default set persisted for the entire length of a
  // 3.5-second throttled test), not just a theoretical edge case. Fixing
  // it with server-side filtering would cost this whole route its static
  // cacheability for every filter, not just this one path - disproportionate
  // to the actual gap. Fixed instead with a tiny, dependency-free inline
  // script (below) that runs the instant the HTML parses - well before the
  // framework bundle needs to arrive - and swaps the default grid for a
  // neutral loading placeholder whenever the URL it can already see
  // carries a filter/sort/search/page param. Scoped to this pilot page
  // only, the same way as showGrading/searchable above.
  const guardColdNav = kind === "category" && slug === "graded";

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

  const [fetched, setFetched] = useState(null); // { key, deals, totalPages, totalCount, error }

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
    if (searchable && params.q) q.set("q", params.q);
    fetch(`/api/deals-page?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled)
          setFetched({
            key: reqKey,
            deals: d.deals ?? [],
            totalPages: d.totalPages ?? 1,
            totalCount: d.totalCount ?? d.deals?.length ?? 0,
            error: d.error ?? null,
          });
      })
      .catch((e) => {
        if (!cancelled) setFetched({ key: reqKey, deals: [], totalPages: 1, totalCount: 0, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slug, reqKey, params, defaultSort, showGrading]);

  const loading = !params.isDefault && fetched?.key !== reqKey;
  const view = params.isDefault
    ? { deals: initial.deals, totalPages: initial.totalPages, totalCount: initial.totalCount ?? initial.deals.length, error: null }
    : loading
      ? { deals: [], totalPages: 1, totalCount: 0, error: null }
      : { deals: fetched.deals, totalPages: fetched.totalPages, totalCount: fetched.totalCount, error: fetched.error };

  // On offer-first catalogue pages, a regional refresh can replace the
  // loading grid above an already-selected inventory anchor. Keep that
  // explicit destination aligned, unless the visitor has scrolled or moved
  // focus since choosing it. Ordinary filter/browse scrolling is untouched.
  const pendingInventoryAnchor = useRef(false);
  useEffect(() => {
    if (!compactFilters) return;
    const isInventoryTarget = () => window.location.hash === "#inventory" && document.activeElement?.id === "inventory";
    if (!loading) {
      if (pendingInventoryAnchor.current && isInventoryTarget()) {
        document.getElementById("inventory")?.scrollIntoView({ block: "start", behavior: "auto" });
      }
      pendingInventoryAnchor.current = false;
      return;
    }
    const arm = () => { pendingInventoryAnchor.current = isInventoryTarget(); };
    const cancel = () => { pendingInventoryAnchor.current = false; };
    arm();
    window.addEventListener("hashchange", arm);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchmove", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("hashchange", arm);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchmove", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [compactFilters, loading, reqKey]);

  // Hands off from the inline guard script's static placeholder (below)
  // to this component's own, already-correct rendering the instant this
  // component actually mounts - by then the very first render above has
  // already computed the real params from the true URL (useSyncExternalStore
  // corrects off the empty server snapshot before this effect can fire),
  // so whatever DealGrid is showing at this point - its own skeleton, or
  // the real default - is already right. Runs once; nothing to clean up.
  useEffect(() => {
    if (!guardColdNav) return;
    const wrap = document.getElementById("pdf-grid-wrap");
    const placeholder = document.getElementById("pdf-grid-loading");
    if (wrap) wrap.hidden = false;
    if (placeholder) placeholder.hidden = true;
  }, [guardColdNav]);

  // "This is a filtered query" - drives the empty state (relaxation
  // actions vs. the plain default label) and whether to show chips. A
  // search-within term counts too (pilot scope only) - a search with
  // nothing back should offer the same "broaden your selection" empty
  // state as an over-narrow filter, not the generic "nothing here yet"
  // one meant for a genuinely empty category.
  const filtered =
    hasActiveDealFilters({
      type: params.cardType,
      grader: params.grader,
      grade: params.grade,
      listing: params.listingType,
      minPrice: params.obj.minPrice,
      maxPrice: params.obj.maxPrice,
    }) || Boolean(searchable && params.q);

  // The part of the page a cold, pre-hydration load can get wrong for a
  // filtered URL (see guardColdNav above) - everything else (FilterBar,
  // FilterNotes, AppliedFilters) already correctly stays absent/neutral
  // pre-hydration, since it too derives from the same corrected params.
  const resultsBlock = (
    <>
      {view.error && (
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load deals: {view.error}</p>
      )}

      {loading ? (
        <GridSkeleton />
      ) : !view.error && view.deals.length === 0 ? (
        filtered ? (
          <FilteredEmptyState
            params={params.obj}
            basePath={basePath}
            subjectLabel={subjectLabel ?? "matching"}
            searchQuery={searchable ? params.q : null}
          />
        ) : (
          <EmptyGridState label={emptyLabel} />
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
          <Pagination page={params.page} totalPages={view.totalPages} params={params.obj} basePath={basePath} />
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Structural filter analytics (existing FILTER_APPLIED / SORT_CHANGED
          / COUNTRY_CHANGED events, via the global delegation in
          AnalyticsBootstrap) - scoped to the Pokemon page added in 13B.3;
          set / category grids are left exactly as they were. */}
      <div className={compactFilters ? "mb-4" : "mb-8"} {...(showGrading ? { "data-analytics-filter-bar": "" } : {})}>
        <FilterBar
          collapsible={compactFilters}
          params={params.obj}
          country={params.country}
          cardType={lockedCardType ?? (showGrading ? effType : params.cardType)}
          grader={showGrading ? effGrader : undefined}
          grade={showGrading ? effGrade : undefined}
          showGrading={showGrading}
          listingType={params.listingType}
          maxPrice={params.maxPrice}
          minPrice={params.minPrice}
          sort={params.sort}
          lockedCardType={lockedCardType}
          searchable={searchable}
          q={params.q}
          basePath={basePath}
        />
      </div>

      {/* UX-CVR-2 §8 - active-filter visibility on every grid (was 13B.3-
          scoped to the Pokemon page only). Plain nofollow <a> nav, no JS. */}
      <FilterNotes params={params.obj} />
      {filtered && (
        <AppliedFilters
          params={params.obj}
          basePath={basePath}
          resultCount={loading ? undefined : view.deals.length}
          totalCount={loading ? undefined : view.totalCount}
          searchQuery={searchable ? params.q : null}
        />
      )}

      {guardColdNav ? (
        <div id="pdf-grid-wrap">{resultsBlock}</div>
      ) : (
        resultsBlock
      )}

      {guardColdNav && (
        <>
          {/* Static fallback for the pre-hydration window only - never
              shown once React has mounted (the effect above hides it
              immediately on mount, whether the subsequent fetch succeeds,
              fails, or is still pending). */}
          <div id="pdf-grid-loading" hidden>
            <GridSkeleton />
          </div>
          {/* If JS is unavailable at all, this script never runs, so
              pdf-grid-wrap simply stays at its server-rendered default
              (visible) - correct, and consistent with the search-within
              no-JS fallback in FilterBar.js. This noscript is belt-and-
              braces insurance, not load-bearing. */}
          <noscript>
            <style>{"#pdf-grid-loading{display:none!important}"}</style>
          </noscript>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{
                var sp=new URLSearchParams(location.search);
                var keys=['country','type','grader','grade','listing','minPrice','maxPrice','q','sort'];
                var hasFilter=keys.some(function(k){return sp.get(k);})||(sp.get('page')&&sp.get('page')!=='1');
                if(!hasFilter)return;
                var wrap=document.getElementById('pdf-grid-wrap');
                var ph=document.getElementById('pdf-grid-loading');
                if(wrap)wrap.hidden=true;
                if(ph)ph.hidden=false;
                setTimeout(function(){
                  if(wrap&&wrap.hidden)wrap.hidden=false;
                  if(ph&&!ph.hidden)ph.hidden=true;
                },8000);
              }catch(e){}})();`,
            }}
          />
        </>
      )}
    </>
  );
}
