"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

// Homepage hero search with live card suggestions. Suggestions come from
// the same /api/card-search the /search page uses (catalog browse); each
// one navigates to /search?q=<name> so the visitor lands on the full
// result for that card. Plain <form> submit still works with JS off.
export default function HeroSearch({ popular = [] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const abortRef = useRef(null);

  const queryLongEnough = q.trim().length >= 2;

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return; // dropdown is gated on queryLongEnough at render
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(`/api/card-search?q=${encodeURIComponent(query)}`, { signal: ac.signal });
        const body = await res.json();
        const list = (body?.catalog?.results ?? []).slice(0, 6).map((c) => ({
          name: c.name,
          set: c.set,
          image: c.imageUrl,
          hasDeal: Boolean(c.deal),
        }));
        setResults(list);
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or failed - leave the last results */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function go(query) {
    const v = query.trim();
    if (v.length < 2) return;
    setOpen(false);
    // Funnel step "homepage -> search". Length only, never the raw query
    // text - matches the no-PII convention SearchClient's own event uses.
    track("Hero Search Submit", { queryLength: v.length });
    router.push(`/search?q=${encodeURIComponent(v)}`);
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === "Enter") go(q);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active >= 0 ? results[active].name : q);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative max-w-2xl">
      <form
        action="/search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <line x1="16" y1="16" x2="12.5" y2="12.5" />
          </svg>
          <input
            type="text"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => queryLongEnough && results.length > 0 && setOpen(true)}
            autoComplete="off"
            placeholder="Search a card, a set, or &quot;booster box&quot;…"
            className="w-full rounded-xl border border-zinc-300 bg-white py-3.5 pl-11 pr-4 text-base text-zinc-900 shadow-card outline-none transition-colors focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 whitespace-nowrap rounded-xl bg-red-600 px-6 py-3.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-red-700"
        >
          Search
        </button>
      </form>

      {open && queryLongEnough && results.length > 0 && (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <ul>
            {results.map((r, i) => (
              <li key={`${r.name}-${r.set}-${i}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.name)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === active ? "bg-zinc-100 dark:bg-zinc-900" : ""
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-50 dark:bg-zinc-900">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" className="h-full w-full object-contain p-0.5" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {r.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">{r.set}</span>
                  </span>
                  {r.hasDeal && (
                    <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      deal
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => go(q)}
            className="block w-full border-t border-zinc-100 px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-zinc-50 dark:border-zinc-900 dark:text-red-500 dark:hover:bg-zinc-900"
          >
            Search “{q.trim()}” →
          </button>
        </div>
      )}

      {popular.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-400">Popular now:</span>
          {popular.map((p, i) => (
            <span key={p.slug}>
              <a href={`/cards/${p.slug}`} className="hover:text-red-600 hover:underline dark:hover:text-red-500">
                {p.name}
              </a>
              {i < popular.length - 1 && <span className="ml-2 text-zinc-300 dark:text-zinc-700">·</span>}
            </span>
          ))}
        </p>
      )}

      {loading && <span className="sr-only">Searching…</span>}
    </div>
  );
}
