"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/components/Logo";
import NavMenu from "@/components/NavMenu";
import DealCard from "@/components/DealCard";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import { dealScore } from "@/lib/dealScore";
import { MARKETPLACES } from "@/lib/ebay";

const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selected, setSelected] = useState(null); // {tcgplayerId, name, set, imageUrl}
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [country, setCountry] = useState("");
  const [condition, setCondition] = useState("Near Mint");
  const [graded, setGraded] = useState(""); // "" | "true" | "false"
  const [maxPrice, setMaxPrice] = useState("");
  const [minDiscount, setMinDiscount] = useState("");

  async function runSearch(e) {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSelected(null);
    setDetail(null);
    try {
      const res = await fetch(`/api/card-search?q=${encodeURIComponent(query.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      setCandidates(body.results);
    } catch (err) {
      setSearchError(err.message);
      setCandidates(null);
    } finally {
      setSearching(false);
    }
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
    const mp = overrides.maxPrice ?? maxPrice;
    const md = overrides.minDiscount ?? minDiscount;
    params.set("condition", c);
    if (co) params.set("country", co);
    if (g) params.set("graded", g);
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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/">
            <Logo size="small" />
          </Link>
          <NavMenu />
        </div>
      </div>

      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">Search any card</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Instant pricing and sales history for any Pokémon card, plus any below-market deals
            we&apos;ve already found for it.
          </p>

          <form onSubmit={runSearch} className="mt-5 flex max-w-lg gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Charizard ex 151"
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

        {candidates && !selected && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {candidates.length > 0 ? "Pick the exact print" : "No results"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {candidates.map((c) => (
                <button
                  key={c.tcgplayerId}
                  onClick={() => pickCard(c)}
                  className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-900">
                    {c.imageUrl ? (
                      <Image src={c.imageUrl} alt={c.name} fill sizes="200px" className="object-contain p-3" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-zinc-400">No image</div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-black dark:text-zinc-50">{c.name}</p>
                    {c.set && <p className="line-clamp-1 text-xs text-zinc-500">{c.set}</p>}
                    {c.marketPrice != null && (
                      <p className="mt-1 text-sm font-bold text-black dark:text-zinc-50">
                        ${Number(c.marketPrice).toFixed(2)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
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

            <div className="mt-4 flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row dark:border-zinc-800 dark:bg-zinc-950">
              <div className="relative h-40 w-40 shrink-0 self-center overflow-hidden rounded-lg bg-zinc-100 sm:self-auto dark:bg-zinc-900">
                {selected.imageUrl ? (
                  <Image src={selected.imageUrl} alt={selected.name} fill sizes="160px" className="object-contain p-3" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400">No image</div>
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
            <form onSubmit={applyFilters} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
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
                <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
                    <p className="mt-3 text-sm text-zinc-500">
                      Nothing below market for this card matching your filters right now - check back after the next
                      scan, or try loosening a filter above.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {detail.deals.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          scoreBadge={dealScore(deal.discount_pct)}
                          pageName="search"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {!candidates && !selected && (
          <p className="text-zinc-500">Search for a card above to get started.</p>
        )}
      </main>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800">
        As an eBay and TCGPlayer affiliate, we earn a commission on qualifying purchases made through
        links on this site. Prices and availability are subject to change. Card-to-listing matching is
        automated and not perfect - always double-check a listing&apos;s photos and description before
        buying.
      </footer>
    </div>
  );
}
