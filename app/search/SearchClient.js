"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { track } from "@vercel/analytics";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import AffiliateLink from "@/components/AffiliateLink";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { MARKETPLACES, buildEbaySearchLink } from "@/lib/ebay";
import { upgradeCatalogImage } from "@/lib/cardImage";
import { formatMoney, toViewerCurrency } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";

// SEO Phase 3 - the Pokemon Card Price Checker front door.
//
// This is a DISCOVERY / SEARCH page, not a second card-page universe: a
// visitor searches, identifies the exact printing from a preview tile,
// and clicks through to the permanent /cards/[slug] page, which owns the
// exact-printing price / value / history / graded / deal detail. The
// results here are a PREVIEW only - no parallel price modal.

export default function SearchClient({ validSetSlugs = [] }) {
  const { viewer, rates } = useCurrency();
  const displayCcy = viewer || "USD";
  const ccyApprox = displayCcy !== "USD" ? "≈ " : "";
  const inDisplayCcy = (usd) => formatMoney(toViewerCurrency(usd, displayCcy, rates), displayCcy);

  // The homepage hero's plain GET form lands here as /search?q=...
  const initialQuery = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(null);
  const [deals, setDeals] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [searchCountry, setSearchCountry] = useState("");
  const [searchSort, setSearchSort] = useState("discount");

  const inputRef = useRef(null);

  useEffect(() => {
    const trimmed = initialQuery.trim();
    if (trimmed.length >= 2) loadSearch(trimmed, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search-as-you-type: debounced so it isn't a request per keystroke,
  // and never for a query under 2 chars.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    if (q === (lastQuery ?? "").trim()) return;
    const t = setTimeout(() => loadSearch(q, 1), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadSearch(q, page, overrides = {}) {
    setLastQuery(q);
    setSearching(true);
    setSearchError(null);
    const sc = overrides.country ?? searchCountry;
    const ss = overrides.sort ?? searchSort;
    // Analytics: the query LENGTH and page, never the raw text (matches
    // the site's existing no-PII convention).
    track("Price Checker Search", { queryLength: q.length, page, country: sc || "any", sort: ss });
    try {
      const params = new URLSearchParams({ q, page: String(page), sort: ss });
      if (sc) params.set("country", sc);
      const res = await fetch(`/api/card-search?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      setDeals(body.deals);
      setCatalog(body.catalog);
    } catch (err) {
      setSearchError(err.message);
      setDeals(null);
      setCatalog(null);
    } finally {
      setSearching(false);
    }
  }

  function runSearch(e) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length >= 2) loadSearch(q, 1);
  }
  function goToPage(page) {
    if (lastQuery) loadSearch(lastQuery, page);
  }
  function changeSearchCountry(v) {
    setSearchCountry(v);
    if (lastQuery) loadSearch(lastQuery, 1, { country: v });
  }
  function changeSearchSort(v) {
    setSearchSort(v);
    if (lastQuery) loadSearch(lastQuery, 1, { sort: v });
  }

  const totalPages = catalog?.total ? Math.ceil(catalog.total / catalog.pageSize) : null;
  const hasResults = Boolean(catalog);
  const noCatalogHits = catalog && catalog.results.length === 0;

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
            price history. This is a catalogue lookup — it doesn&apos;t identify a card from a photo.
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

        {/* Initial state */}
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

        {/* Loading skeleton */}
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

        {/* Filters (only once there are results) */}
        {hasResults && (
          <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <label htmlFor="pc-country" className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Deal location
              </label>
              <select
                id="pc-country"
                value={searchCountry}
                onChange={(e) => changeSearchCountry(e.target.value)}
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
                value={searchSort}
                onChange={(e) => changeSearchSort(e.target.value)}
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="discount">Best discount</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </div>
            {searching && <span className="pb-2 text-xs text-zinc-400">Updating…</span>}
          </div>
        )}

        {/* Below-market deals we've already found - a SECONDARY surface,
            visually distinct from the price-reference catalogue below. */}
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
              {deals.map((deal) => (
                <div key={deal.id} onClick={() => track("Price Checker Deal Click", { deal: deal.id })}>
                  <DealCard deal={deal} pageName="price_checker" validSetSlugs={validSetSlugs} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The catalogue: exact-printing previews that route into the
            permanent /cards/[slug] value pages. */}
        {catalog && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Card price reference
              {catalog.total != null && ` (${catalog.total.toLocaleString()} matching)`}
            </h2>

            {noCatalogHits ? (
              <p className="mt-3 max-w-lg text-sm text-zinc-500">
                No exact card found for &ldquo;{lastQuery}&rdquo;. Try the Pokemon name, the set name,
                or the collector number (for example <span className="font-medium">4/102</span>).
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {catalog.results.map((c) => (
                    <ResultTile
                      key={c.tcgplayerId}
                      c={c}
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

// One exact-printing preview. The WHOLE tile is a link to the permanent
// /cards/[slug] page when we own one; otherwise it's a non-link tile with
// a plain eBay-search fallback so it isn't a dead end.
function ResultTile({ c, ccyApprox, inDisplayCcy }) {
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
        {/* Deal indicator ONLY when a real displayable deal exists. */}
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
        onClick={() => track("Price Checker Result Click", { slug: c.cardHref, hasDeal: Boolean(c.deal) })}
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
