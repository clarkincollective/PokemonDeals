"use client";

import { useState } from "react";
import Link from "next/link";
import Price from "@/components/Price";

// Compact "{Pokemon} cards by set" coverage table, shown ABOVE the full
// catalogue grid. One row per set: cards tracked, priced cards, market
// range. Set name links to /sets/[slug] ONLY when `row.slug` is set
// (the caller already checked the page exists) - otherwise plain text.
//
// Every row is in the server-rendered HTML (this component SSRs before
// hydration), so all /sets/[slug] links are crawlable. For a
// many-set species (Pikachu spans 100+) only the first INITIAL rows are
// visible; "Show all" reveals the rest via a `hidden` toggle - never
// pagination, never a new URL.
//
// `rows` comes from lib/speciesSummary.speciesBySet(cards, validSetSlugs).
const INITIAL = 12;

export default function SpeciesBySet({ speciesName, rows }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows || rows.length === 0) return null;

  const overflow = rows.length > INITIAL + 2; // no "show all" to reveal 1-2
  const money = (n) =>
    n == null ? <span className="text-zinc-400">—</span> : (
      <Price usd={n} native={{ amount: Number(n), currency: "USD" }} />
    );

  return (
    <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="text-lg font-bold text-black dark:text-zinc-50">{speciesName} cards by set</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Every set we track a {speciesName} card in, with how many we price and their market-reference
        range. Ranges exclude Jumbo / World Championship printings.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
              <th className="py-2 pr-4 font-semibold">Set</th>
              <th className="py-2 pr-4 text-right font-semibold">Cards</th>
              <th className="py-2 pr-4 text-right font-semibold">Priced</th>
              <th className="py-2 text-right font-semibold">Market range</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.set}
                className={`border-b border-zinc-100 dark:border-zinc-900 ${
                  !expanded && overflow && i >= INITIAL ? "hidden" : ""
                }`}
              >
                <td className="py-2 pr-4">
                  {r.slug ? (
                    <Link
                      href={`/sets/${r.slug}`}
                      className="text-zinc-700 hover:text-red-600 hover:underline dark:text-zinc-300 dark:hover:text-red-500"
                    >
                      {r.set}
                    </Link>
                  ) : (
                    <span className="text-zinc-700 dark:text-zinc-300">{r.set}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {r.cardCount}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {r.pricedCount}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {r.pricedCount === 0 ? (
                    <span className="text-zinc-400">—</span>
                  ) : r.minPrice != null && r.maxPrice != null && r.maxPrice !== r.minPrice ? (
                    <span>
                      {money(r.minPrice)} – {money(r.maxPrice)}
                    </span>
                  ) : (
                    money(r.minPrice ?? r.maxPrice)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
        >
          {expanded ? "Show fewer sets" : `Show all ${rows.length} sets`}
        </button>
      )}
    </section>
  );
}
