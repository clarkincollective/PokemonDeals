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

export default function BestFindsBanner({ bestFinds }) {
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

  if (bestFinds.length === 0) return null;

  return (
    <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 to-transparent dark:border-zinc-800 dark:from-red-950/20">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              🔥 Today&apos;s Best Finds
            </span>
            {!collapsed && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                The biggest discounts on higher-value cards right now.
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/best-finds"
              className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
            >
              See full list →
            </Link>
            <button
              onClick={toggle}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              aria-expanded={!collapsed}
            >
              {collapsed ? "Show ▾" : "Minimize ▴"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {bestFinds.map((deal, i) => (
              <DealCard
                key={deal.id}
                deal={deal}
                rank={i + 1}
                scoreBadge={dealScore(deal.discount_pct)}
                pageName="home_best_finds"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
