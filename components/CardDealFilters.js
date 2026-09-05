"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import FilterToggle from "@/components/FilterToggle";
import Price from "@/components/Price";
import AffiliateLink from "@/components/AffiliateLink";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { MARKETPLACES, wrapEbayAffiliateUrl } from "@/lib/ebay";
import { currencyForDeal } from "@/lib/money";
import {
  appliedFilterChips,
  relaxationSteps,
  normalizeDealFilters,
  hasActiveDealFilters,
  GRADER_CHOICES,
  GRADE_CHOICES,
} from "@/lib/dealFilters";

// Phase 13B.4.2 - structured deal filtering for /cards/[slug].
//
// The permanent card page stays ISR (no server searchParams). This client
// component owns the LIVE-LISTINGS area only: it reads the filter state
// from window.location, and when a facet is active it fetches the
// filtered listings from /api/deals-page?kind=card (Supabase only, no
// PPT / eBay). State lives entirely in the URL via history.pushState -
// shareable, Back/Forward safe, no storage. Same primitives as
// components/DealGrid and app/search/SearchClient.
//
// The card IDENTITY (name / set / number / reference price / image /
// Product JSON-LD) is rendered by the server page and is NEVER touched
// here - filters only refine which marketplace listings show.

const FACET_KEYS = ["type", "grader", "grade", "minPrice", "maxPrice", "listing"];
const URL_KEYS = [...FACET_KEYS, "country", "sort"];
const PRICE_CEILINGS = [50, 100, 250, 500, 1000];
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

function subscribe(cb) {
  window.addEventListener("popstate", cb);
  window.addEventListener("pdf:card-nav", cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("pdf:card-nav", cb);
  };
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
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
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

export default function CardDealFilters({
  slug,
  initial = [],
  validSetSlugs = [],
  featuredCount = 4,
  totalActive = null,
}) {
  const rawSearch = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );
  const sp = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);
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
  const country = sp.get("country") ?? "";
  const sort = sp.get("sort") || "price_asc";

  const dealFiltersActive = hasActiveDealFilters(urlFilterState);
  const shouldFetch =
    FACET_KEYS.some((k) => sp.get(k)) || Boolean(country) || (sort && sort !== "price_asc");

  const [fetched, setFetched] = useState(null); // { key, deals, error }
  const abortRef = useRef(null);
  const reqIdRef = useRef(0);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!shouldFetch) {
      setFetched(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const myId = ++reqIdRef.current;
    const key = rawSearch;
    const api = new URLSearchParams({ kind: "card", slug });
    for (const k of URL_KEYS) {
      const v = sp.get(k);
      if (v != null && v !== "") api.set(k, v);
    }
    fetch(`/api/deals-page?${api.toString()}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        if (myId === reqIdRef.current) setFetched({ key, deals: d.deals ?? [], error: d.error ?? null });
      })
      .catch((e) => {
        if (e?.name === "AbortError" || myId !== reqIdRef.current) return;
        setFetched({ key, deals: [], error: e.message });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSearch, shouldFetch, slug]);

  const loading = shouldFetch && fetched?.key !== rawSearch;
  const view = shouldFetch ? fetched?.deals ?? [] : initial;
  const viewError = shouldFetch ? fetched?.error ?? null : null;

  // ---- URL navigation (no Next router - instant, shareable) ----------
  function navigate(next) {
    const ordered = new URLSearchParams();
    for (const k of URL_KEYS) {
      const v = next.get(k);
      if (v != null && v !== "") ordered.set(k, v);
    }
    const qs = ordered.toString();
    window.history.pushState(null, "", qs ? `/cards/${slug}?${qs}` : `/cards/${slug}`);
    window.dispatchEvent(new Event("pdf:card-nav"));
  }

  function applyFacets(patch, { action = "apply" } = {}) {
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
      capture(evt, { surface: "card", filter_dimension: dims[0], filter_action: action });
    }
    navigate(next);
  }

  function clearFacets() {
    const next = new URLSearchParams(window.location.search);
    for (const k of FACET_KEYS) next.delete(k);
    capture(EVENTS.FILTER_CLEARED, { surface: "card", filter_dimension: "all", filter_action: "clear" });
    navigate(next);
  }

  const effective = normalizeDealFilters(urlFilterState);
  const notes = effective.notes;
  const showGrading = effective.type === "graded";
  const chips = appliedFilterChips(urlFilterState);
  const activeCount = chips.length + (country ? 1 : 0) + (sort !== "price_asc" ? 1 : 0);

  const featured = view.slice(0, featuredCount);
  const rest = view.slice(featuredCount);

  // Nothing to filter and nothing to show - keep the card page clean.
  if (initial.length === 0 && !shouldFetch) {
    return (
      <p id="listings" className="mt-6 scroll-mt-24 text-zinc-500">
        No active listings right now — check back after the next scheduled scan.
      </p>
    );
  }

  return (
    <div id="listings" className="mt-6 scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {dealFiltersActive ? "Matching live listings" : "Active listings"}
          {!loading && ` (${view.length})`}
        </h2>
        {loading && <span className="text-xs text-zinc-400" aria-live="polite">Updating…</span>}
      </div>

      {/* filter controls */}
      <div className="mb-5 lg:rounded-xl lg:border lg:border-zinc-200 lg:bg-white lg:p-4 lg:shadow-card dark:lg:border-zinc-800 dark:lg:bg-zinc-950">
        {(chips.length > 0 || country || sort !== "price_asc") && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Filtered by</span>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => applyFacets(Object.fromEntries(c.clears.map((k) => [k, null])), { action: "remove" })}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-red-500"
                aria-label={`Remove filter: ${c.label}`}
              >
                {c.label}
                <span aria-hidden="true" className="text-zinc-400">✕</span>
              </button>
            ))}
            {chips.length > 0 && (
              <button
                type="button"
                onClick={clearFacets}
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
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="cd-country" className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Deal location
                </label>
                <select
                  id="cd-country"
                  value={country}
                  onChange={(e) => applyFacets({ country: e.target.value || null }, { action: e.target.value ? "apply" : "remove" })}
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
                <label htmlFor="cd-sort" className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Sort
                </label>
                <select
                  id="cd-sort"
                  value={sort}
                  onChange={(e) => applyFacets({ sort: e.target.value === "price_asc" ? null : e.target.value }, { action: "apply" })}
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="discount">Biggest discount</option>
                </select>
              </div>
            </div>

            <Row label="Card">
              <Pill
                active={effective.type !== "raw" && effective.type !== "graded"}
                onClick={() => applyFacets({ type: null, grader: null, grade: null }, { action: "remove" })}
              >
                All
              </Pill>
              <Pill active={effective.type === "raw"} onClick={() => applyFacets({ type: "raw" })}>
                Raw
              </Pill>
              <Pill active={effective.type === "graded"} onClick={() => applyFacets({ type: "graded" })}>
                Graded
              </Pill>
            </Row>

            {showGrading && (
              <Row label="Grading">
                <select
                  aria-label="Grader"
                  value={effective.grader ?? ""}
                  onChange={(e) => applyFacets({ grader: e.target.value || null }, { action: e.target.value ? "apply" : "remove" })}
                  className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-base font-medium sm:text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
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
                  onChange={(e) => applyFacets({ grade: e.target.value || null }, { action: e.target.value ? "apply" : "remove" })}
                  className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-base font-medium sm:text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
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
              <Pill
                active={effective.listing === "BIN"}
                onClick={() => applyFacets({ listing: effective.listing === "BIN" ? null : "BIN" }, { action: effective.listing === "BIN" ? "remove" : "apply" })}
              >
                Buy It Now
              </Pill>
              <Pill
                active={effective.listing === "AUCTION"}
                onClick={() => applyFacets({ listing: effective.listing === "AUCTION" ? null : "AUCTION" }, { action: effective.listing === "AUCTION" ? "remove" : "apply" })}
              >
                Auction
              </Pill>
            </Row>

            <Row label="Max price (USD)">
              {PRICE_CEILINGS.map((p) => (
                <Pill
                  key={p}
                  active={effective.maxPrice === p}
                  onClick={() => applyFacets({ maxPrice: effective.maxPrice === p ? null : p, minPrice: null }, { action: effective.maxPrice === p ? "remove" : "apply" })}
                >
                  Under ${p.toLocaleString()}
                </Pill>
              ))}
            </Row>
          </div>
        </FilterToggle>
      </div>

      {viewError && (
        <p className="rounded-lg bg-red-50 p-4 text-red-700">Couldn&apos;t load listings: {viewError}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
          ))}
        </div>
      ) : !viewError && view.length === 0 ? (
        <ZeroState
          dealFiltersActive={dealFiltersActive}
          effective={effective}
          totalActive={totalActive}
          onRelax={(drop) => applyFacets(Object.fromEntries(drop.map((k) => [k, null])), { action: "remove" })}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((deal, i) => (
              <DealCard
                key={deal.id}
                deal={deal}
                rank={i + 1}
                pageName="card_hub"
                validSetSlugs={validSetSlugs}
                from={`/cards/${slug}`}
              />
            ))}
          </div>

          {rest.length > 0 && (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                {dealFiltersActive ? `All ${view.length} matching listings` : `All ${view.length} active listings`}
              </h3>
              <p className="text-xs text-zinc-400">
                Every real, currently active eBay listing for this exact card — cheapest first.
              </p>
              <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
                {rest.map((deal) => {
                  const marketInfo = MARKETPLACES[deal.marketplace];
                  return (
                    <li key={deal.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/deals/${deal.id}`} className="line-clamp-1 block text-sm text-zinc-700 hover:underline dark:text-zinc-300">
                          {deal.title}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                          {marketInfo && <span title={marketInfo.label}>{marketInfo.flag}</span>}
                          {deal.is_graded ? (
                            <span>
                              {deal.grader} {deal.grade}
                            </span>
                          ) : (
                            deal.condition && <span>{deal.condition}</span>
                          )}
                          <span>{deal.listing_type === "AUCTION" ? "Auction" : "Buy It Now"}</span>
                          {deal.seller_feedback_pct != null && <span>{Number(deal.seller_feedback_pct).toFixed(1)}% feedback</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Price
                          usd={deal.total_price_usd ?? deal.total_price}
                          native={{ amount: Number(deal.total_price), currency: currencyForDeal(deal) }}
                          className="font-semibold text-black dark:text-zinc-50"
                        />
                        <AffiliateLink
                          href={wrapEbayAffiliateUrl(deal.affiliate_url, { surface: "card" })}
                          eventName="eBay Click"
                          eventData={{ page: "card_hub" }}
                          className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                        >
                          View →
                        </AffiliateLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ZeroState({ dealFiltersActive, effective, totalActive, onRelax }) {
  if (!dealFiltersActive) {
    return (
      <p className="text-zinc-500">
        No active listings right now — check back after the next scheduled scan.
      </p>
    );
  }
  const steps = relaxationSteps({
    type: effective.type,
    grader: effective.grader,
    grade: effective.grade,
    listing: effective.listing,
    minPrice: effective.minPrice,
    maxPrice: effective.maxPrice,
  });
  const chips = appliedFilterChips(effective).map((c) => c.label).join(" · ");
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        No live listings for this card match {chips || "these filters"} right now.
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {typeof totalActive === "number" && totalActive > 0
          ? `There ${totalActive === 1 ? "is" : "are"} ${totalActive} active ${totalActive === 1 ? "listing" : "listings"} for this exact card — none match every filter. `
          : ""}
        The card reference above still applies. Try:
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onRelax(s.drop)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            {s.label === "Clear all filters" ? "All live listings for this card" : s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
