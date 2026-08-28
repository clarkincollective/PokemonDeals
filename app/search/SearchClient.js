"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DealCard from "@/components/DealCard";
import AffiliateLink from "@/components/AffiliateLink";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { MARKETPLACES, buildEbaySearchLink } from "@/lib/ebay";
import { buildTcgplayerLink } from "@/lib/tcgplayer";

const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

export default function SearchClient() {
  // The homepage hero's search box submits a plain GET form to
  // /search?q=... (no JS needed there) - picking that up here and
  // auto-running the search is what makes it feel like one continuous
  // action instead of landing on an empty search page.
  const initialQuery = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(null);
  const [deals, setDeals] = useState(null); // deals matching the query, shown first
  const [catalog, setCatalog] = useState(null); // {page, pageSize, total, hasMore, results}
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selected, setSelected] = useState(null); // {tcgplayerId, name, set, imageUrl}
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Top-level search filters (deals section + catalog inline deals).
  const [searchCountry, setSearchCountry] = useState("");
  const [searchSort, setSearchSort] = useState("discount"); // "discount" | "price_asc" | "price_desc"

  // Per-card detail-view filters (unchanged, separate from the above).
  const [country, setCountry] = useState("");
  const [condition, setCondition] = useState("Near Mint");
  const [graded, setGraded] = useState(""); // "" | "true" | "false"
  const [listingType, setListingType] = useState(""); // "" | "FIXED_PRICE" | "AUCTION"
  const [maxPrice, setMaxPrice] = useState("");
  const [minDiscount, setMinDiscount] = useState("");

  // Auto-run the search once on mount if the hero search box sent us
  // here with a real query - intentionally empty deps, this should only
  // ever fire for the initial URL, not every time `query` changes as the
  // visitor types.
  useEffect(() => {
    const trimmed = initialQuery.trim();
    if (trimmed.length >= 2) {
      loadSearch(trimmed, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSearch(q, page, overrides = {}) {
    setLastQuery(q);
    setSearching(true);
    setSearchError(null);
    const sc = overrides.country ?? searchCountry;
    const ss = overrides.sort ?? searchSort;
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
    if (q.length < 2) return;
    setSelected(null);
    setDetail(null);
    loadSearch(q, 1);
  }

  function goToPage(page) {
    if (!lastQuery) return;
    loadSearch(lastQuery, page);
  }

  function applyTopFilters(e) {
    e.preventDefault();
    if (lastQuery) loadSearch(lastQuery, 1);
  }

  async function pickCard(card, overrides = {}) {
    setSelected(card);
    setLoadingDetail(true);
    setDetailError(null);
    setDetail(null);

    const params = new URLSearchParams({ tcgplayerId: card.tcgplayerId });
    const c = overrides.condition ?? condition;
    const co = overrides.country ?? country;
    const g = overrides.graded ?? graded;
    const lt = overrides.listingType ?? listingType;
    const mp = overrides.maxPrice ?? maxPrice;
    const md = overrides.minDiscount ?? minDiscount;
    params.set("condition", c);
    if (co) params.set("country", co);
    if (g) params.set("graded", g);
    if (lt) params.set("listingType", lt);
    if (mp) params.set("maxPrice", mp);
    if (md) params.set("minDiscount", md);

    try {
      const res = await fetch(`/api/card-search?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Lookup failed");
      setDetail(body);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }

  function applyFilters(e) {
    e.preventDefault();
    if (selected) pickCard(selected);
  }

  const totalPages = catalog?.total ? Math.ceil(catalog.total / catalog.pageSize) : null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">Search any card</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            See any deals we&apos;ve already found first, then browse the full catalog for instant
            pricing and sales history.
          </p>

          <form onSubmit={runSearch} className="mt-5 flex max-w-lg gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Pikachu"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={searching}
              className="whitespace-nowrap rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        {searchError && <p className="rounded-lg bg-red-50 p-4 text-red-700">{searchError}</p>}

        {!selected && (deals || catalog) && (
          <form onSubmit={applyTopFilters} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Card location
              </label>
              <select
                value={searchCountry}
                onChange={(e) => setSearchCountry(e.target.value)}
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
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">Sort by</label>
              <select
                value={searchSort}
                onChange={(e) => setSearchSort(e.target.value)}
                className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="discount">Best discount</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Apply
            </button>
          </form>
        )}

        {!selected && deals && (
          <div className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Deals found for &quot;{lastQuery}&quot; ({deals.length})
            </h2>
            {deals.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                Nothing below market matching that name right now - browse the catalog below to check
                pricing, or search again later.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} pageName="search" />
                ))}
              </div>
            )}
          </div>
        )}

        {!selected && catalog && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Browse the catalog {catalog.total != null && `(${catalog.total.toLocaleString()} cards)`}
            </h2>
            {catalog.results.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No cards found for that search.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {catalog.results.map((c) => (
                    <div
                      key={c.tcgplayerId}
                      className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <button onClick={() => pickCard(c)} className="relative aspect-square w-full bg-zinc-50 text-left dark:bg-zinc-900">
                        {c.imageUrl ? (
                          <Image src={c.imageUrl} alt={c.name} fill sizes="200px" className="object-contain p-3" />
                        ) : (
                          <CardImagePlaceholder />
                        )}
                        {c.deal && (
                          <span className="absolute right-2 top-2 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                            {Math.round(c.deal.discountPct * 100)}% below market
                          </span>
                        )}
                      </button>
                      <button onClick={() => pickCard(c)} className="p-3 text-left">
                        <p className="line-clamp-2 text-sm font-semibold text-black dark:text-zinc-50">{c.name}</p>
                        {c.set && <p className="line-clamp-1 text-xs text-zinc-500">{c.set}</p>}
                        {c.marketPrice != null && (
                          <p className="mt-1 text-sm font-bold text-black dark:text-zinc-50">
                            ${Number(c.marketPrice).toFixed(2)}
                          </p>
                        )}
                      </button>
                      <div className="flex flex-col gap-1.5 px-3 pb-3">
                        {c.deal ? (
                          <AffiliateLink
                            href={c.deal.affiliateUrl}
                            eventName="eBay Click"
                            eventData={{ card: c.name, page: "search_catalog" }}
                            className="block rounded-lg bg-black px-3 py-1.5 text-center text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                          >
                            {c.deal.listingType === "AUCTION"
                              ? "Bid Now →"
                              : `Buy It Now $${Number(c.deal.totalPrice).toFixed(2)} →`}
                          </AffiliateLink>
                        ) : (
                          // No active below-market deal for this print -
                          // still a real card someone might just want to
                          // buy, so give them somewhere to go instead of a
                          // dead end (and still earn a referral either way).
                          <AffiliateLink
                            href={buildEbaySearchLink(`${c.name} ${c.set ?? ""}`.trim())}
                            eventName="eBay Click"
                            eventData={{ card: c.name, page: "search_catalog_no_deal" }}
                            className="block rounded-lg border border-zinc-200 px-3 py-1.5 text-center text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
                          >
                            Find on eBay →
                          </AffiliateLink>
                        )}
                      </div>
                    </div>
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

        {selected && (
          <div>
            <button
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← Back to results
            </button>

            <div className="mt-4 flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
              <div className="relative h-40 w-40 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-100 sm:self-auto dark:bg-zinc-900">
                {selected.imageUrl ? (
                  <Image src={selected.imageUrl} alt={selected.name} fill sizes="160px" className="object-contain p-3" />
                ) : (
                  <CardImagePlaceholder />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-black dark:text-zinc-50">{selected.name}</h2>
                {selected.set && <p className="text-zinc-500">{selected.set}</p>}
                {detail?.marketPrice != null && (
                  <p className="mt-2 text-2xl font-bold text-black dark:text-zinc-50">
                    ${Number(detail.marketPrice).toFixed(2)}
                    <span className="ml-2 text-sm font-normal text-zinc-400">market price ({condition})</span>
                  </p>
                )}
                {detail && !detail.tracked && (
                  <p className="mt-2 text-sm text-zinc-500">
                    We don&apos;t actively scan this exact print yet, so no deal history below - pricing and sales
                    history above are still real and current.
                  </p>
                )}
              </div>
            </div>

            {/* Filters */}
            <form onSubmit={applyFilters} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">Condition</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
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
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">Card type</label>
                <select
                  value={graded}
                  onChange={(e) => setGraded(e.target.value)}
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="">Any</option>
                  <option value="false">Raw</option>
                  <option value="true">Graded</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">Listing</label>
                <select
                  value={listingType}
                  onChange={(e) => setListingType(e.target.value)}
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="">Any</option>
                  <option value="FIXED_PRICE">Buy It Now</option>
                  <option value="AUCTION">Auction</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Max price ($)
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Any"
                  className="mt-1 w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Min discount (%)
                </label>
                <input
                  type="number"
                  value={minDiscount}
                  onChange={(e) => setMinDiscount(e.target.value)}
                  placeholder="Any"
                  className="mt-1 w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Apply
              </button>
            </form>

            {loadingDetail && <p className="mt-6 text-sm text-zinc-500">Loading…</p>}
            {detailError && <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{detailError}</p>}

            {detail && (
              <>
                <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Price history</h3>
                  <div className="mt-4">
                    <PriceHistoryChart points={detail.history} />
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    Deals we&apos;ve found ({detail.deals.length})
                  </h3>
                  {detail.deals.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <p className="text-sm text-zinc-500">
                        Nothing below market for this card matching your filters right now - check back after the
                        next scan, or try loosening a filter above. Still looking to buy it anyway?
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <AffiliateLink
                          href={buildEbaySearchLink(`${selected.name} ${selected.set ?? ""}`.trim())}
                          eventName="eBay Click"
                          eventData={{ card: selected.name, page: "search_detail_no_deal" }}
                          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                        >
                          Find on eBay →
                        </AffiliateLink>
                        <AffiliateLink
                          href={buildTcgplayerLink(selected.name, selected.tcgplayerId)}
                          eventName="TCGPlayer Click"
                          eventData={{ card: selected.name, page: "search_detail_no_deal" }}
                          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
                        >
                          Check on TCGPlayer
                        </AffiliateLink>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {detail.deals.map((deal) => (
                        <DealCard key={deal.id} deal={deal} pageName="search" />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {!deals && !catalog && !selected && (
          <p className="text-zinc-500">Search for a card above to get started.</p>
        )}
      </main>

      <SiteFooter note="Card-to-listing matching is automated and not perfect - always double-check a listing's photos and description before buying." />
    </div>
  );
}
