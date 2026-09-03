"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { classifyQueryIntent } from "@/lib/analytics/intent";
import { resultCountBand, latencyBand } from "@/lib/analytics/props";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import AffiliateLink from "@/components/AffiliateLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import FilterToggle from "@/components/FilterToggle";
import { MARKETPLACES, buildEbaySearchLink } from "@/lib/ebay";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { formatMoney, toViewerCurrency } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  appliedFilterChips,
  relaxationSteps,
  normalizeDealFilters,
  GRADER_CHOICES,
  GRADE_CHOICES,
} from "@/lib/dealFilters";

// SEO Phase 3 - the Pokemon Card Price Checker front door.
//
// This is a DISCOVERY / SEARCH page, not a second card-page universe: a
// visitor searches, identifies the exact printing from a preview tile,
// and clicks through to the permanent /cards/[slug] page.
//
// 13B.4.1 - the search STATE (query text + structured facets) lives
// entirely in the URL. The query box identifies the subject;
// type/grader/grade/min-maxPrice/listing/country/sort refine it. State is
// driven through window.history + a location subscription (the same
// pattern as components/DealGrid) so a filter change is instant, has no
// RSC round-trip, is shareable, and Back/Forward restore it. No
// localStorage / sessionStorage.

// deal-refinement facets on the /search URL (country + sort predate this)
const FACET_KEYS = ["type", "grader", "grade", "minPrice", "maxPrice", "listing"];
const ALL_URL_KEYS = [...FACET_KEYS, "country", "sort", "q", "page"];

function subscribe(cb) {
  window.addEventListener("popstate", cb);
  window.addEventListener("pdf:search-nav", cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("pdf:search-nav", cb);
  };
}

// filter_dimension for the structural FILTER_APPLIED event (§17 - never
// the card / Pokemon subject, only which knob moved).
const DIMENSION = {
  type: "format",
  grader: "grader",
  grade: "grade",
  minPrice: "price",
  maxPrice: "price",
  listing: "listing_type",
  country: "country",
  sort: "sort",
};

export default function SearchClient({ validSetSlugs = [] }) {
  const { viewer, rates } = useCurrency();
  const displayCcy = viewer || "USD";
  const ccyApprox = displayCcy !== "USD" ? "≈ " : "";
  const inDisplayCcy = (usd) => formatMoney(toViewerCurrency(usd, displayCcy, rates), displayCcy);

  // The URL as it was on the server render - the stable snapshot for
  // useSyncExternalStore's SSR path. After mount, window.location is the
  // source of truth.
  const serverParams = useSearchParams();
  const serverSearch = useMemo(() => {
    const s = serverParams.toString();
    return s ? `?${s}` : "";
  }, [serverParams]);

  const rawSearch = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => serverSearch
  );
  const sp = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);

  const urlQ = (sp.get("q") ?? "").trim();
  const country = sp.get("country") ?? "";
  const sort = sp.get("sort") || "discount";
  const urlFilterState = useMemo(
    () => ({
      type: sp.get("type"),
      grader: sp.get("grader"),
      grade: sp.get("grade"),
      minPrice: sp.get("minPrice"),
      maxPrice: sp.get("maxPrice"),
      listing: sp.get("listing"),
    }),
    [rawSearch] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [query, setQuery] = useState(urlQ);
  const [deals, setDeals] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [interpreted, setInterpreted] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [exactMatch, setExactMatch] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const inputRef = useRef(null);
  const focusedRef = useRef(false);
  const startedRef = useRef(false);
  // 13B.2 request control: abort superseded searches; only the newest
  // request may touch results/loading/error state.
  const abortRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Back/Forward: resync the visible input to whatever q the URL now has
  // (filter navigations set `query` themselves, so this is a no-op then).
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get("q") ?? "";
      setQuery(q);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ---- URL navigation (no Next router - instant, shareable) ----------
  function navigate(nextParams, { replace = false } = {}) {
    nextParams.delete("page"); // any state change resets pagination
    // stable key order for clean, comparable URLs
    const ordered = new URLSearchParams();
    for (const k of ALL_URL_KEYS) {
      const v = nextParams.get(k);
      if (v != null && v !== "") ordered.set(k, v);
    }
    const qs = ordered.toString();
    const url = qs ? `/search?${qs}` : "/search";
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    window.dispatchEvent(new Event("pdf:search-nav"));
  }

  // Apply a sparse patch of facet changes and push a new URL. null / ""
  // / "all" removes a key. Enforces the grader/grade <-> graded
  // dependency client-side so the URL is coherent immediately (the API
  // re-normalises anyway).
  function applyFacets(patch, { action = "apply", replace = false } = {}) {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, String(v));
    }
    if (patch.type === "raw") {
      next.delete("grader");
      next.delete("grade");
    }
    const settingGraderOrGrade =
      ("grader" in patch && patch.grader && patch.grader !== "all") ||
      ("grade" in patch && patch.grade && patch.grade !== "all");
    if (settingGraderOrGrade && next.get("type") !== "graded") next.set("type", "graded");

    // structural analytics only - the moved dimension, never the subject
    const dims = [...new Set(Object.keys(patch).map((k) => DIMENSION[k]).filter(Boolean))];
    if (dims.length === 1) {
      const evt =
        dims[0] === "sort"
          ? EVENTS.SORT_CHANGED
          : dims[0] === "country"
            ? EVENTS.COUNTRY_CHANGED
            : action === "remove"
              ? EVENTS.FILTER_CLEARED
              : EVENTS.FILTER_APPLIED;
      capture(evt, { surface: "search", filter_dimension: dims[0], filter_action: action });
    }
    navigate(next, { replace });
  }

  function clearFacets() {
    const next = new URLSearchParams(window.location.search);
    for (const k of FACET_KEYS) next.delete(k);
    capture(EVENTS.FILTER_CLEARED, { surface: "search", filter_dimension: "all", filter_action: "clear" });
    navigate(next);
  }

  // ---- the search request (reads everything off the live URL) --------
  async function loadSearch() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const myId = ++reqIdRef.current;
    const isCurrent = () => myId === reqIdRef.current;

    const cur = new URLSearchParams(window.location.search);
    const q = (cur.get("q") ?? "").trim();
    if (q.length < 2) return;
    const page = Math.max(1, Number(cur.get("page")) || 1);
    const sc = cur.get("country") || "";
    const ss = cur.get("sort") || "discount";

    setSearching(true);
    setSearchError(null);

    // Analytics: query LENGTH + structural intent only, never the text.
    track("Price Checker Search", { queryLength: q.length, page, country: sc || "any", sort: ss });
    const intent = classifyQueryIntent(q);
    capture(EVENTS.SEARCH_REQUEST, { source: "search_page", page, country: sc || "any", sort: ss, ...intent });

    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const api = new URLSearchParams({ q, page: String(page), sort: ss });
      if (sc) api.set("country", sc);
      for (const k of FACET_KEYS) {
        const v = cur.get(k);
        if (v != null && v !== "") api.set(k, v);
      }
      const res = await fetch(`/api/card-search?${api.toString()}`, { signal: ac.signal });
      const body = await res.json();
      if (!isCurrent()) return; // a newer search superseded this one
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      setDeals(body.deals);
      setCatalog(body.catalog);
      setInterpreted(body.interpreted ?? null);
      setResolution(body.resolution ?? null);
      setExactMatch(body.exact ?? null);

      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
      const catalogCount = Number(body?.catalog?.total ?? body?.catalog?.results?.length ?? 0);
      const dealCount = Array.isArray(body?.deals) ? body.deals.length : 0;
      const common = {
        source: "search_page",
        page,
        latency_band: latencyBand(elapsed),
        result_count_band: resultCountBand(catalogCount),
        has_deal_results: dealCount > 0,
        deal_count_band: resultCountBand(dealCount),
        resolved_subject_kind:
          body?.resolution?.mode === "provider_fallback" ? "none" : body?.interpreted?.subject_kind ?? "none",
        search_resolution_mode: body?.resolution?.mode ?? "unknown",
        has_active_filters: (body?.resolution?.filters_from_url ?? []).length > 0,
        ...intent,
      };
      if (catalogCount === 0 && dealCount === 0) capture(EVENTS.SEARCH_NO_RESULT, common);
      else capture(EVENTS.SEARCH_RESULTS_SHOWN, common);
    } catch (err) {
      if (err?.name === "AbortError" || !isCurrent()) return; // superseded
      setSearchError(err.message);
      setDeals(null);
      setCatalog(null);
      setInterpreted(null);
      setResolution(null);
      setExactMatch(null);
    } finally {
      if (isCurrent()) setSearching(false);
    }
  }

  // run a search whenever ANY part of the URL state changes
  useEffect(() => {
    if (urlQ.length >= 2) {
      loadSearch();
    } else {
      abortRef.current?.abort();
      setDeals(null);
      setCatalog(null);
      setInterpreted(null);
      setResolution(null);
      setExactMatch(null);
      setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSearch]);

  // search_started: first meaningful input in an interaction
  useEffect(() => {
    const v = query.trim();
    if (v.length >= 2 && !startedRef.current) {
      startedRef.current = true;
      capture(EVENTS.SEARCH_STARTED, { source: "search_page" });
    } else if (v.length === 0) {
      startedRef.current = false;
    }
  }, [query]);

  // Search-as-you-type: debounced, and it REPLACES history (no entry per
  // keystroke). Filter changes push; a submit pushes.
  useEffect(() => {
    const q = query.trim();
    const curQ = (new URLSearchParams(window.location.search).get("q") ?? "").trim();
    if (q === curQ) return;
    if (q.length === 0) {
      const next = new URLSearchParams(window.location.search);
      next.delete("q");
      navigate(next, { replace: true });
      return;
    }
    if (q.length < 2) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      next.set("q", q);
      navigate(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function runSearch(e) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    capture(EVENTS.SEARCH_SUBMITTED, { source: "search_page", via: "form", ...classifyQueryIntent(q) });
    const next = new URLSearchParams(window.location.search);
    next.set("q", q);
    navigate(next); // explicit submit = one history entry
  }
  function goToPage(page) {
    if (urlQ.length < 2) return;
    const next = new URLSearchParams(window.location.search);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    const qs = next.toString();
    window.history.pushState(null, "", qs ? `/search?${qs}` : "/search");
    window.dispatchEvent(new Event("pdf:search-nav"));
  }

  const totalPages = catalog?.total ? Math.ceil(catalog.total / catalog.pageSize) : null;
  const hasResults = Boolean(catalog);
  const noCatalogHits = catalog && catalog.results.length === 0;

  // effective (normalised) facet state - drives control "active" state +
  // chips; falls back to a local normalise before the first response.
  const effective =
    resolution?.effective_filters ?? normalizeDealFilters(urlFilterState);
  const filterNotes = resolution?.filter_notes ?? normalizeDealFilters(urlFilterState).notes;
  const filtersScoped = resolution ? resolution.deals_scoped !== false : true;
  const chips = appliedFilterChips(urlFilterState);
  const activeCount =
    chips.length + (country ? 1 : 0) + (sort && sort !== "discount" ? 1 : 0);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50 sm:text-3xl">
            Pokemon Card Price Checker
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Search by Pokemon, card name, set or collector number to find the exact printing, then
            open its card page for the market-reference price, per-condition values, graded prices and
            price history. Refine live deals with the filters below.
          </p>

          <form onSubmit={runSearch} className="mt-5 flex max-w-lg gap-2">
            <label htmlFor="pc-q" className="sr-only">
              Search Pokemon cards by name, set or collector number
            </label>
            <input
              id="pc-q"
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (!focusedRef.current) {
                  focusedRef.current = true;
                  capture(EVENTS.HERO_SEARCH_FOCUS, { source: "search_page" });
                }
              }}
              placeholder="e.g. Charizard 4/102"
              autoComplete="off"
              enterKeyHint="search"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={searching}
              className="whitespace-nowrap rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {searching ? "Searching…" : "Check price"}
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-400">
            Try: Charizard 4/102 · Umbreon VMAX 215/203 · Pikachu Promo · Gengar Fossil
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {searchError && (
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">
            Couldn&apos;t run that search right now. Please try again in a moment.
          </p>
        )}

        {!hasResults && !searching && !searchError && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            Start typing a card name above — for example{" "}
            <button
              type="button"
              onClick={() => setQuery("Charizard Base Set")}
              className="font-semibold text-red-600 hover:underline dark:text-red-500"
            >
              Charizard Base Set
            </button>{" "}
            — to look up its market-reference price.
          </div>
        )}

        {searching && !hasResults && (
          <div
            aria-busy="true"
            aria-label="Searching"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-900" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-4/5 rounded bg-zinc-100 dark:bg-zinc-900" />
                  <div className="h-3 w-2/5 rounded bg-zinc-100 dark:bg-zinc-900" />
                  <div className="h-6 w-full rounded bg-zinc-100 dark:bg-zinc-900" />
                </div>
              </div>
            ))}
          </div>
        )}

        {hasResults && (
          <SearchFilters
            urlFilterState={urlFilterState}
            effective={effective}
            country={country}
            sort={sort}
            activeCount={activeCount}
            scoped={filtersScoped}
            searching={searching}
            notes={filterNotes}
            chips={chips}
            onFacet={applyFacets}
            onClear={clearFacets}
          />
        )}

        {hasResults && (interpreted || exactMatch) && (
          <SearchInterpretation
            interpreted={interpreted}
            resolution={resolution}
            exact={exactMatch}
            dealCount={deals?.length ?? 0}
            onRelax={(drop) => applyFacets(Object.fromEntries(drop.map((k) => [k, null])), { action: "remove" })}
          />
        )}

        {deals && deals.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-500">
              Below-market deals we&apos;ve found ({deals.length})
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Live eBay listings priced under their market reference — checked for condition, language
              and printing.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {deals.map((deal, i) => (
                <div
                  key={deal.id}
                  onClick={() => {
                    track("Price Checker Deal Click", { deal: deal.id });
                    capture(EVENTS.SEARCH_RESULT_CLICKED, {
                      surface: "deal",
                      rank: i + 1,
                      content_id: String(deal.id),
                      deal_id: deal.id,
                    });
                  }}
                >
                  <DealCard deal={deal} pageName="price_checker" validSetSlugs={validSetSlugs} />
                </div>
              ))}
            </div>
          </div>
        )}

        {catalog && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Card price reference
              {catalog.total != null && ` (${catalog.total.toLocaleString()} matching)`}
            </h2>
            <p className="mt-1 text-xs text-zinc-400" aria-live="polite">
              Every printing that matches the subject — filters above refine the <strong>live deals</strong>,
              not this reference list.
            </p>

            {noCatalogHits ? (
              <p className="mt-3 max-w-lg text-sm text-zinc-500">
                No exact card found for &ldquo;{urlQ}&rdquo;. Try the Pokemon name, the set name,
                or the collector number (for example <span className="font-medium">4/102</span>).
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {catalog.results.map((c, i) => (
                    <ResultTile
                      key={c.tcgplayerId}
                      c={c}
                      rank={i + 1}
                      ccyApprox={ccyApprox}
                      inDisplayCcy={inDisplayCcy}
                    />
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    onClick={() => goToPage(catalog.page - 1)}
                    disabled={catalog.page <= 1 || searching}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    ← Previous
                  </button>
                  <span className="text-sm text-zinc-500">
                    Page {catalog.page}
                    {totalPages ? ` of ${totalPages.toLocaleString()}` : ""}
                  </span>
                  <button
                    onClick={() => goToPage(catalog.page + 1)}
                    disabled={!catalog.hasMore || searching}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {hasResults && (
          <p className="mt-10 max-w-2xl border-t border-zinc-200 pt-6 text-xs leading-relaxed text-zinc-400 dark:border-zinc-800">
            Market-reference prices are a guide based on recent sold data, not a guaranteed sale value.
            What a card actually fetches depends on its exact printing, condition and grade, and
            marketplace prices move. Pokemon Deal Finder doesn&apos;t buy cards or guarantee any sale
            value.{" "}
            <Link href="/methodology" className="text-red-600 hover:underline dark:text-red-500">
              How we work prices out
            </Link>
            .
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

// ---------------------------------------------------------- 13B.4.1 filters

const PRICE_CEILINGS = [25, 50, 100, 200, 500];

function Pill({ active, onClick, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-red-300 hover:text-red-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:text-red-500"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

// The structured refine controls + the applied-filter chips. Native
// <select> for country / sort / grader / grade (keyboard + label), <button
// role=pressed> pills for the rest. Progressive disclosure: grader + grade
// only render when Graded is the effective card type.
function SearchFilters({
  urlFilterState,
  effective,
  country,
  sort,
  activeCount,
  scoped,
  searching,
  notes,
  chips,
  onFacet,
  onClear,
}) {
  const effType = effective.type; // "all" | "raw" | "graded"
  const showGrading = effType === "graded";

  return (
    <div className="mb-6 lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:shadow-card dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
      {/* applied-filter chips - always visible, removable */}
      {(chips.length > 0 || country || (sort && sort !== "discount")) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Filtered by</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onFacet(Object.fromEntries(c.clears.map((k) => [k, null])), { action: "remove" })}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-red-500"
              aria-label={`Remove filter: ${c.label}`}
            >
              {c.label}
              <span aria-hidden="true" className="text-zinc-400">
                ✕
              </span>
            </button>
          ))}
          {chips.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-red-600 dark:hover:text-red-500"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {notes?.length > 0 && (
        <ul className="mb-3 space-y-1">
          {notes.map((n) => (
            <li key={n.code} className="text-xs font-medium text-amber-700 dark:text-amber-500">
              {n.message}
            </li>
          ))}
        </ul>
      )}

      <FilterToggle defaultOpen={activeCount > 0} activeCount={activeCount}>
        <div className="flex flex-col gap-4">
          {!scoped && (
            <p className="text-xs text-zinc-500">
              Refine your search to a recognised card or Pokemon to filter live deals.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="pc-country" className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Deal location
              </label>
              <select
                id="pc-country"
                value={country}
                onChange={(e) => onFacet({ country: e.target.value || null }, { action: e.target.value ? "apply" : "remove" })}
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">Any</option>
                {Object.entries(MARKETPLACES).map(([id, info]) => (
                  <option key={id} value={id}>
                    {info.flag} {info.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pc-sort" className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Sort deals
              </label>
              <select
                id="pc-sort"
                value={sort}
                onChange={(e) => onFacet({ sort: e.target.value === "discount" ? null : e.target.value }, { action: "apply" })}
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="discount">Best discount</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </div>
            {searching && <span className="pb-2 text-xs text-zinc-400" aria-live="polite">Updating…</span>}
          </div>

          <Row label="Card">
            <Pill active={effType !== "raw" && effType !== "graded"} onClick={() => onFacet({ type: null, grader: null, grade: null }, { action: "remove" })}>
              All
            </Pill>
            <Pill active={effType === "raw"} onClick={() => onFacet({ type: "raw" })}>
              Raw
            </Pill>
            <Pill active={effType === "graded"} onClick={() => onFacet({ type: "graded" })}>
              Graded
            </Pill>
          </Row>

          {showGrading && (
            <Row label="Grading">
              <select
                aria-label="Grader"
                value={effective.grader ?? ""}
                onChange={(e) => onFacet({ grader: e.target.value || null }, { action: e.target.value ? "apply" : "remove" })}
                className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="">Any grader</option>
                {GRADER_CHOICES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                aria-label="Grade"
                value={effective.grade ?? ""}
                onChange={(e) => onFacet({ grade: e.target.value || null }, { action: e.target.value ? "apply" : "remove" })}
                className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="">Any grade</option>
                {GRADE_CHOICES.map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </Row>
          )}

          <Row label="Listing">
            <Pill active={effective.listing === "BIN"} onClick={() => onFacet({ listing: effective.listing === "BIN" ? null : "BIN" }, { action: effective.listing === "BIN" ? "remove" : "apply" })}>
              Buy It Now
            </Pill>
            <Pill active={effective.listing === "AUCTION"} onClick={() => onFacet({ listing: effective.listing === "AUCTION" ? null : "AUCTION" }, { action: effective.listing === "AUCTION" ? "remove" : "apply" })}>
              Auction
            </Pill>
          </Row>

          <Row label="Max price (USD)">
            {PRICE_CEILINGS.map((p) => (
              <Pill
                key={p}
                active={effective.maxPrice === p}
                onClick={() => onFacet({ maxPrice: effective.maxPrice === p ? null : p, minPrice: null }, { action: effective.maxPrice === p ? "remove" : "apply" })}
              >
                Under ${p}
              </Pill>
            ))}
          </Row>
        </div>
      </FilterToggle>
    </div>
  );
}

// One exact-printing preview. The WHOLE tile is a link to the permanent
// /cards/[slug] page when we own one; otherwise it's a non-link tile with
// a plain eBay-search fallback so it isn't a dead end.
function ResultTile({ c, rank, ccyApprox, inDisplayCcy }) {
  const meta = [c.set, c.cardNumber && `#${c.cardNumber}`, c.rarity].filter(Boolean).join(" · ");
  const price =
    c.marketPrice != null ? (
      <p className="mt-1 text-sm font-bold text-black dark:text-zinc-50">
        {ccyApprox}
        {inDisplayCcy(c.marketPrice)}
        <span className="ml-1 text-[11px] font-normal text-zinc-400">market ref</span>
      </p>
    ) : (
      <p className="mt-1 text-xs text-zinc-400">Market price unavailable</p>
    );

  const inner = (
    <>
      <div className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-900">
        {c.imageUrl ? (
          <Image
            src={upgradeCatalogImage(c.imageUrl)}
            alt={c.displayName ?? c.name}
            fill
            sizes="200px"
            quality={85}
            className="object-contain p-3"
          />
        ) : (
          <CardImagePlaceholder />
        )}
        {c.deal && (
          <span className="absolute right-2 top-2 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            {Math.round(c.deal.discountPct * 100)}% below market
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-black dark:text-zinc-50">
          {c.displayName ?? c.name}
        </p>
        {meta && <p className="line-clamp-1 text-xs text-zinc-500">{meta}</p>}
        {price}
      </div>
    </>
  );

  if (c.cardHref) {
    return (
      <Link
        href={c.cardHref}
        onClick={() => {
          track("Price Checker Result Click", { slug: c.cardHref, hasDeal: Boolean(c.deal) });
          capture(EVENTS.SEARCH_RESULT_CLICKED, {
            surface: "catalog",
            rank,
            has_deal: Boolean(c.deal),
            card_slug: typeof c.cardHref === "string" ? c.cardHref.replace(/^\/cards\//, "") : undefined,
          });
        }}
        className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-950"
      >
        {inner}
        <span className="px-3 pb-3 text-xs font-semibold text-red-600 dark:text-red-500">
          {c.deal ? "See price & this deal →" : "See full price & value →"}
        </span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      {inner}
      <div className="px-3 pb-3">
        <AffiliateLink
          href={buildEbaySearchLink(`${c.name} ${c.set ?? ""}`.trim())}
          eventName="eBay Click"
          eventData={{ card: c.name, page: "price_checker_no_page" }}
          className="block rounded-lg border border-zinc-200 px-3 py-1.5 text-center text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
        >
          Find on eBay →
        </AffiliateLink>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- 13B.2 / 13B.3 UI

// Build the /pokemon/[slug] link that carries the CURRENT normalized
// structured intent (never the raw query text). Prefers the API's
// authoritative `pokemon_link_query`; falls back to the interpreted
// modifiers for older responses.
function speciesDealsHref(interpreted, resolution) {
  const slug = interpreted?.species_slug;
  if (!slug) return null;
  const src = resolution?.pokemon_link_query ?? null;
  const p = new URLSearchParams();
  if (src) {
    for (const [k, v] of Object.entries(src)) if (v != null && v !== "") p.set(k, String(v));
  } else {
    const i = interpreted;
    if (i.format === "graded") p.set("type", "graded");
    else if (i.format === "raw") p.set("type", "raw");
    if (i.grader) p.set("grader", i.grader);
    if (i.grade != null) p.set("grade", String(i.grade));
    if (i.listing_type === "AUCTION") p.set("listing", "AUCTION");
    else if (i.listing_type === "BIN") p.set("listing", "BIN");
    if (i.price_max != null) p.set("maxPrice", String(i.price_max));
    if (i.price_min != null) p.set("minPrice", String(i.price_min));
  }
  const qs = p.toString();
  return qs ? `/pokemon/${slug}?${qs}` : `/pokemon/${slug}`;
}

// A compact, truthful summary of how the query was parsed and resolved,
// plus exact-card destination + zero-result relaxation.
function SearchInterpretation({ interpreted, resolution, exact, dealCount, onRelax }) {
  const i = interpreted ?? {};
  const speciesHref = !exact ? speciesDealsHref(i, resolution) : null;
  const chips = [];
  if (i.species) chips.push(i.species);
  else if (i.card_name) chips.push(i.card_name);
  if (i.set) chips.push(i.set);
  if (i.collector_number) chips.push(`#${i.collector_number}`);
  if (i.format === "graded") chips.push("graded");
  if (i.format === "raw") chips.push("raw");
  if (i.grader) chips.push(i.grader);
  if (i.grade != null) chips.push(`grade ${i.grade}`);
  if (i.listing_type === "AUCTION") chips.push("auction");
  if (i.listing_type === "BIN") chips.push("Buy It Now");
  if (i.language === "japanese") chips.push("Japanese");
  if (i.price_max != null) chips.push(`under $${i.price_max}`);
  if (i.price_min != null) chips.push(`over $${i.price_min}`);

  const notApplied = resolution?.recognized_not_applied ?? [];
  const dealFilters = resolution?.deals_filters_applied ?? [];
  const refOnly = resolution?.catalogue_is_reference_only;
  const mismatch = resolution?.subject_collector_mismatch ?? null;
  const scopedButEmpty =
    resolution?.deals_scoped && dealFilters.length > 0 && (resolution?.deals_match_count ?? dealCount) === 0;
  const relax = scopedButEmpty ? relaxationSteps({
    type: resolution?.effective_filters?.type,
    grader: resolution?.effective_filters?.grader,
    grade: resolution?.effective_filters?.grade,
    listing: resolution?.effective_filters?.listing,
    minPrice: resolution?.effective_filters?.minPrice,
    maxPrice: resolution?.effective_filters?.maxPrice,
  }) : [];

  return (
    <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      {chips.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Understood</span>
          {chips.map((c, k) => (
            <span
              key={k}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {c}
            </span>
          ))}
        </p>
      )}

      {mismatch && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50/70 p-3 dark:bg-amber-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Number doesn&apos;t match that card
          </p>
          <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-200">
            {mismatch.belongs_to ? (
              <>
                No {mismatch.subject} card is <span className="font-mono">#{mismatch.collector_number}</span>.
                That number is{" "}
                <Link
                  href={`/cards/${mismatch.belongs_to.card_slug}`}
                  className="font-semibold text-amber-800 underline hover:text-amber-900 dark:text-amber-300"
                >
                  {mismatch.belongs_to.name} · {mismatch.belongs_to.set}
                </Link>{" "}
                <span className="text-zinc-500">(suggestion)</span>.
              </>
            ) : (
              <>
                No card matches <span className="font-mono">#{mismatch.collector_number}</span>. Showing{" "}
                {mismatch.subject} results below.
              </>
            )}
          </p>
        </div>
      )}

      {exact && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-600/30 bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Exact match
            </p>
            <p className="mt-0.5 font-semibold text-zinc-900 dark:text-zinc-50">
              {exact.name} <span className="font-normal text-zinc-500">· {exact.set}</span>
            </p>
          </div>
          <Link
            href={`/cards/${exact.card_slug}`}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Price &amp; value →
          </Link>
        </div>
      )}

      {speciesHref && i.species && (
        <div className="mt-3">
          <Link
            href={speciesHref}
            rel="nofollow"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            View all matching {i.species} deals →
          </Link>
        </div>
      )}

      {refOnly && dealFilters.length > 0 && !scopedButEmpty && (
        <p className="mt-2 text-xs text-zinc-500">
          The filters above ({dealFilters.join(" · ")}) apply to the <strong>live deals</strong>. The
          card reference list shows every printing.
        </p>
      )}

      {scopedButEmpty && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
            No live deals match {chips.join(" · ")} right now.
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Nothing has been broadened. The card reference below still shows every printing. Try:
          </p>
          {onRelax && relax.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {relax.map((s, k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onRelax(s.drop)}
                  className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {notApplied.some((n) => n.surface === "catalogue" && n.modifier === "language") && (
        <p className="mt-2 text-xs text-zinc-500">
          Japanese card lookups aren&apos;t in this catalogue yet —{" "}
          <Link href="/japanese-cards" className="text-red-600 hover:underline dark:text-red-500">
            browse Japanese deals
          </Link>
          .
        </p>
      )}
    </div>
  );
}
