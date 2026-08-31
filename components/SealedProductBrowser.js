"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import SpeciesCard from "@/components/SpeciesCard";

// The standalone /sealed-deals catalogue: every sealed product PPT
// tracks, grouped by set (newest first), each tile flagged as an active
// deal (emerald) or browse-only (plain "View on eBay"). Client-side
// filter over the already-server-rendered list - name search, product-
// type chips, "deals only" toggle - same progressive-enhancement shape
// as PokemonFilterList / SetsFilterList.
//
// `groups` = [{ set, slug, logo, products: [SpeciesCard cards], dealCount }],
// products pre-sorted deals-first by fetchSealedCatalog; `logo` from
// setImage() enriched in the page (null when pokemontcg.io has no logo).
const GRID = "mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export default function SealedProductBrowser({ groups, types }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [dealsOnly, setDealsOnly] = useState(false);
  const [openSets, setOpenSets] = useState(() => new Set(groups.slice(0, 6).map((g) => g.set)));

  const totalProducts = useMemo(
    () => groups.reduce((n, g) => n + g.products.length, 0),
    [groups]
  );
  const totalDeals = useMemo(
    () => groups.reduce((n, g) => n + g.dealCount, 0),
    [groups]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        products: g.products.filter((p) => {
          if (dealsOnly && !p.deal) return false;
          if (type !== "all" && p.productType !== type) return false;
          if (q && !p.name.toLowerCase().includes(q) && !g.set.toLowerCase().includes(q)) return false;
          return true;
        }),
      }))
      .filter((g) => g.products.length > 0);
  }, [groups, query, type, dealsOnly]);

  const shownCount = useMemo(
    () => filtered.reduce((n, g) => n + g.products.length, 0),
    [filtered]
  );
  const filtering = query.trim() !== "" || type !== "all" || dealsOnly;

  function toggleSet(set) {
    setOpenSets((prev) => {
      const next = new Set(prev);
      if (next.has(set)) next.delete(set);
      else next.add(set);
      return next;
    });
  }

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
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ✕
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
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
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              type === t
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {t === "all" ? "All types" : t}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        {filtering
          ? `${shownCount} of ${totalProducts} products match`
          : `${totalProducts} sealed products across ${groups.length} sets · ${totalDeals} with an active deal right now`}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-6 text-zinc-500">No sealed products match those filters.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtered.map((g) => {
            const open = filtering || openSets.has(g.set);
            return (
              <section key={g.set} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => toggleSet(g.set)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    {/* Real pokemontcg.io set logo (same assets as /sets).
                        Fixed 64x28 box so the collapsed list stays even and
                        there's no layout shift; lazy by default. No logo ->
                        empty box, the set name still identifies it. */}
                    <span className="relative block h-7 w-16 shrink-0">
                      {g.logo && (
                        <Image
                          src={g.logo}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-contain object-left"
                        />
                      )}
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-black dark:text-zinc-50">
                      {g.set}
                      <span className="text-xs font-medium text-zinc-400">
                        {g.products.length} product{g.products.length === 1 ? "" : "s"}
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
                    <div className={GRID}>
                      {g.products.map((p) => (
                        <SpeciesCard
                          key={p.tcgplayerId ?? p.name}
                          card={p}
                          label={g.set}
                          pageName="sealed_hub"
                        />
                      ))}
                    </div>
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
