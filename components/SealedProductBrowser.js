"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import SpeciesCard from "@/components/SpeciesCard";
import { parseSealedFilters, buildSealedSearch } from "@/lib/sealedFilterUrl";

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

// finding 4: the reader's selection lives in the URL, so a guide can link
// to one exact product. Nothing here re-implements matching or eligibility:
// the selected product and its offer come from /api/sealed-catalog, which
// is the same catalogue read the page renders from and still runs every
// display, availability and savings gate.
function SelectedProduct({ id, state, product, onClear }) {
  const label = product ? product.displayName || product.name : null;
  return (
    <section
      data-selected-product={id}
      aria-live="polite"
      className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Selected product
          </p>
          <h3 className="mt-0.5 text-lg font-bold text-black dark:text-zinc-50">
            {state === "loading" ? "Finding that product…" : label ?? "Product not found"}
          </h3>
          {product && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{product.meta}</p>}
        </div>
        {/* Clearing the exact selection is a visible control, not a guess */}
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200"
        >
          Clear selection
        </button>
      </div>

      {state === "error" && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          That product could not be loaded just now. The full catalogue is below.
        </p>
      )}
      {state === "unknown" && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          We don&apos;t track a sealed product with that id. Nothing below is that product — browse
          the full catalogue instead.
        </p>
      )}
      {state === "invalid" && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          That link didn&apos;t name a product we can look up. Nothing below is that product — browse
          the full catalogue instead.
        </p>
      )}

      {product && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:max-w-md">
            <SpeciesCard card={product} />
          </div>
          {!product.deal && (
            // A known product with no eligible offer still shows its own
            // identity and reference. The catalogue below is explicitly
            // labelled as alternatives, never as this product's offers.
            <p className="mt-3 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              No eBay listing currently passes our checks for this exact product. Its reference price
              and an eBay search are on the tile above. Everything below is the rest of the
              catalogue — <span className="font-semibold">alternatives, not this product</span>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default function SealedProductBrowser({ groups, types, totals = null }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [dealsOnly, setDealsOnly] = useState(false);
  // finding 4 - the exact product selection, read from the URL
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedState, setSelectedState] = useState("idle"); // idle|loading|ready|unknown|invalid|error
  const selectSeq = useRef(0);
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

  // --- URL state (finding 4) ------------------------------------------
  // Read on mount and on Back/Forward; written on change. `replace` is used
  // for typing so a search does not leave one history entry per keystroke;
  // explicit choices (a type chip, the deals toggle, selecting or clearing
  // a product) push, so Back undoes the action the reader actually took.
  const applyFromUrl = () => {
    const f = parseSealedFilters(window.location.search);
    setQuery(f.q);
    setType(f.type);
    setDealsOnly(f.dealsOnly);
    setSelectedId(f.product);
    if (f.invalidProduct) {
      setSelected(null);
      setSelectedState("invalid");
    } else if (!f.product) {
      setSelected(null);
      setSelectedState("idle");
    }
  };
  useEffect(() => {
    applyFromUrl();
    const onPop = () => applyFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (patch, { replace = false } = {}) => {
    const search = buildSealedSearch(window.location.search, patch);
    const url = `${window.location.pathname}${search}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    applyFromUrl();
  };

  // Resolve the selected product by EXACT catalogue identity. A malformed
  // or unknown id is reported as such and never falls back to a text
  // search that could show an unrelated product as the requested one.
  useEffect(() => {
    if (!selectedId) return undefined;
    const seq = ++selectSeq.current;
    setSelectedState("loading");
    fetchJson(`/api/sealed-catalog?product=${encodeURIComponent(selectedId)}`)
      .then((j) => {
        if (seq !== selectSeq.current) return;
        setSelected(j.product ?? null);
        setSelectedState(j.product ? "ready" : "unknown");
      })
      .catch((err) => {
        if (seq !== selectSeq.current) return;
        setSelected(null);
        setSelectedState(String(err?.message ?? "").includes("404") ? "unknown" : "error");
      });
    return undefined;
  }, [selectedId]);

  // The URL asked for ONE product - whether or not we could resolve it.
  // The malformed case matters as much as the resolved one: the reader
  // followed a product link either way, so the page owes them the answer
  // about that product first, not a rotation of other ones.
  const productClaimed = Boolean(selectedId) || selectedState === "invalid";

  // The page's own "Live sealed deals right now" strip is a rotation of
  // unrelated products. While one exact product is selected it would sit
  // above that product's own offer and read as if it were part of it, so
  // it is hidden for the duration of the selection.
  useEffect(() => {
    const strip = document.querySelector("[data-featured-sealed-strip]");
    if (!strip) return undefined;
    strip.hidden = productClaimed;
    return () => {
      strip.hidden = false;
    };
  }, [productClaimed]);

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
      {productClaimed && (
        <SelectedProduct
          id={selectedId}
          state={selectedState}
          product={selected}
          onClear={() => navigate({ product: null })}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => navigate({ q: e.target.value }, { replace: true })}
            placeholder="Search products, e.g. Evolving Skies..."
            aria-label="Search sealed products"
            className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 pr-14 text-base outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => navigate({ q: "" })}
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
            onChange={(e) => navigate({ deals: e.target.checked })}
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
            onClick={() => navigate({ type: t })}
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
