"use client";

import { useState } from "react";
import Link from "next/link";
import DealCard from "@/components/DealCard";
import { dealScore } from "@/lib/dealScore";

const STORAGE_KEY = "bestFindsBannerCollapsed";

function readStoredCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function FindsRow({ title, seeAllHref, deals }) {
  if (deals.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h3>
        <Link href={seeAllHref} className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400">
          See top 10 →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {deals.map((deal, i) => (
          <DealCard key={deal.id} deal={deal} rank={i + 1} scoreBadge={dealScore(deal.discount_pct)} pageName="home_best_finds" />
        ))}
      </div>
    </div>
  );
}

export default function BestFindsBanner({ rawFinds, gradedFinds }) {
  // Remember the viewer's choice across visits - falls back to always
  // expanded if storage is unavailable (private browsing, etc.). Lazy
  // initializer rather than an effect, so there's no flash of the
  // (wrong) default state before storage is checked.
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore - state still updates for this session
      }
      return next;
    });
  }

  if (rawFinds.length === 0 && gradedFinds.length === 0) return null;

  return (
    <section className="border-y border-zinc-200 bg-gradient-to-b from-red-50 to-transparent dark:border-zinc-800 dark:from-red-950/20">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              🔥 Today&apos;s Best Finds
            </span>
            {!collapsed && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                The biggest discounts on higher-value cards right now - raw and graded, ranked
                separately.
              </p>
            )}
          </div>
          <button
            onClick={toggle}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            aria-expanded={!collapsed}
          >
            {collapsed ? "Show ▾" : "Minimize ▴"}
          </button>
        </div>

        {!collapsed && (
          <div className="mt-6 flex flex-col gap-8">
            <FindsRow title="Top Raw" seeAllHref="/best-finds?type=raw" deals={rawFinds} />
            <FindsRow title="Top Graded" seeAllHref="/best-finds?type=graded" deals={gradedFinds} />
          </div>
        )}
      </div>
    </section>
  );
}
