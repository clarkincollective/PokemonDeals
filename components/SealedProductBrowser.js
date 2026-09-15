"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SpeciesCard from "@/components/SpeciesCard";

// The standalone /sealed-deals catalogue: every sealed product PPT
// tracks, grouped by set (newest first), each tile flagged as an active
// deal (emerald) or browse-only (plain "View on eBay"). Name search,
// product-type chips and a "deals only" toggle - same progressive-
// enhancement shape as PokemonFilterList / SetsFilterList.
//
// audit-r1 (page-weight): the page ships products only for the sets that
// open by default (`products` is null for the rest, which carry
// `productCount`). Opening another set, or applying any filter, fetches
// from /api/sealed-catalog (same 15-minute cache the page renders from).
// Until 15 Sep 2026 every product (2,344) travelled as client props: 1.8 MB
// of the page's 2.35 MB.

const GRID = "mt-3 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`sealed catalogue ${r.status}`);
  return r.json();
}

export default function SealedProductBrowser({ groups, types, totals = null }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [dealsOnly, setDealsOnly] = useState(false);
  const [openSets, setOpenSets] = useState(() => new Set(groups.filter((g) => g.products).map((g) => g.set)));
  // set -> products, seeded from the page; filled per set on demand
  const [loaded, setLoaded] = useState(() => new Map(groups.filter((g) => g.products).map((g) => [g.set, g.products])));
  const [pending, setPending] = useState(() => new Set());
  // the server-filtered result while any filter is active (null = none)
  const [filteredGroups, setFilteredGroups] = useState(null);
  const [filterState, setFilterState] = useState("idle"); // idle | loading | error
  const filterSeq = useRef(0);

  const totalProducts = totals?.products ?? groups.reduce((n, g) => n + (g.productCount ?? g.products?.length ?? 0), 0);
  const totalDeals = totals?.deals ?? groups.reduce((n, g) => n + g.dealCount, 0);
  const logoBySet = useMemo(() => new Map(groups.map((g) => [g.set, g.logo ?? null])), [groups]);
  const filtering = query.trim() !== "" || type !== "all" || dealsOnly;

  // filters: one debounced request, latest wins
  useEffect(() => {
    if (!filtering) {
      setFilteredGroups(null);
      setFilterState("idle");
      return undefined;
    }
    const seq = ++filterSeq.current;
    setFilterState("loading");
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set("q", query.trim());
      if (type !== "all") sp.set("type", type);
      if (dealsOnly) sp.set("deals", "1");
      fetchJson(`/api/sealed-catalog?${sp.toString()}`)
        .then((j) => {
          if (seq !== filterSeq.current) return;
          setFilteredGroups(j.groups ?? []);
          setFilterState("idle");
        })
        .catch(() => {
          if (seq !== filterSeq.current) return;
          setFilteredGroups([]);
          setFilterState("error");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [query, type, dealsOnly, filtering]);

  function loadSet(g) {
    if (loaded.has(g.set) || pending.has(g.set)) return;
    setPending((prev) => new Set(prev).add(g.set));
    fetchJson(`/api/sealed-catalog?set=${encodeURIComponent(g.slug)}`)
      .then((j) => setLoaded((prev) => new Map(prev).set(g.set, j.products ?? [])))
      .catch(() => setLoaded((prev) => new Map(prev).set(g.set, null)))
      .finally(() => setPending((prev) => { const next = new Set(prev); next.delete(g.set); return next; }));
  }

  function toggleSet(g) {
    setOpenSets((prev) => {
      const next = new Set(prev);
      if (next.has(g.set)) next.delete(g.set);
      else next.add(g.set);
      return next;
    });
    if (!openSets.has(g.set)) loadSet(g);
  }

  const shown = filtering ? (filteredGroups ?? []) : groups;
  const shownCount = filtering ? shown.reduce((n, g) => n + g.products.length, 0) : totalProducts;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, e.g. Evolving Skies..."
            aria-label="Search sealed products"
            className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 pr-14 text-base outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              ✕
            </button>
          )}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={dealsOnly}
            onChange={(e) => setDealsOnly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          Deals only{totalDeals > 0 ? ` (${totalDeals})` : ""}
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {["all", ...types].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={`min-h-11 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              type === t
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {t === "all" ? "All types" : t}
          </button>
        ))}
      </div>

      <p role="status" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        {filtering
          ? filterState === "loading"
            ? "Searching…"
            : filterState === "error"
              ? "The catalogue could not be searched right now. Clear the filters to browse by set."
              : `${shownCount} of ${totalProducts} products match`
          : `${totalProducts} sealed products across ${groups.length} sets · ${totalDeals} with an active deal right now`}
      </p>

      {shown.length === 0 && filterState !== "loading" ? (
        <p className="mt-6 text-zinc-500">No sealed products match those filters.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {shown.map((g) => {
            const open = filtering || openSets.has(g.set);
            const products = filtering ? g.products : loaded.get(g.set);
            const count = filtering ? g.products.length : g.productCount ?? g.products?.length ?? products?.length ?? 0;
            const logo = filtering ? logoBySet.get(g.set) ?? null : g.logo;
            return (
              <section key={g.set} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => toggleSet(g)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    {/* Real pokemontcg.io set logo (same assets as /sets).
                        Fixed 64x28 box so the collapsed list stays even and
                        there's no layout shift; lazy by default. No logo ->
                        empty box, the set name still identifies it. */}
                    <span className="relative block h-7 w-16 shrink-0">
                      {logo && (
                        <Image
                          src={logo}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-contain object-left"
                        />
                      )}
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-black dark:text-zinc-50">
                      {g.set}
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {count} product{count === 1 ? "" : "s"}
                        {g.dealCount > 0 ? ` · ${g.dealCount} deal${g.dealCount === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                </button>
                {open && (
                  <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-900">
                    {products === undefined || pending.has(g.set) ? (
                      <p className="text-sm text-zinc-500" aria-live="polite">Loading products…</p>
                    ) : products === null ? (
                      <p className="text-sm text-zinc-500">These products could not be loaded right now.</p>
                    ) : (
                      <div className={GRID}>
                        {products.map((p) => (
                          <SpeciesCard
                            key={p.tcgplayerId ?? p.name}
                            card={p}
                            label={g.set}
                            pageName="sealed_hub"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
