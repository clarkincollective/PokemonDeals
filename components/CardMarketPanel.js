"use client";

import { useEffect, useState } from "react";
import CardPriceSummary from "@/components/CardPriceSummary";
import VariantPriceGrid from "@/components/VariantPriceGrid";
import RecentSales from "@/components/RecentSales";

// audit-r1 (card-page-cold-render) - the card hub's reference market data
// (condition ladder, graded tiers, every-variant grid, recent sales), loaded
// AFTER the page has rendered from /api/card-analysis. The page itself is
// served from the catalogue reference, so a cold render makes no provider
// call and a crawler (robots.txt disallows /api/) never triggers one.
// One fetch per card per page load, shared by the summary and the panel.

const inflight = new Map(); // tcgplayerId -> Promise<analysis | null>

function loadAnalysis(id) {
  if (!inflight.has(id)) {
    inflight.set(
      id,
      fetch(`/api/card-analysis?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.analysis ?? null)
        .catch(() => null)
    );
  }
  return inflight.get(id);
}

export function useCardAnalysis(tcgplayerId) {
  const id = tcgplayerId ? String(tcgplayerId) : null;
  const [state, setState] = useState({ status: id ? "loading" : "empty", analysis: null });
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    const start = () => {
      loadAnalysis(id).then((analysis) => {
        if (live) setState({ status: analysis ? "ready" : "empty", analysis });
      });
    };
    // after the first paint; never blocks the page
    const handle = typeof requestIdleCallback === "function" ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 50);
    return () => {
      live = false;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, [id]);
  return state;
}

// The condition ladder / graded tiers block (CardPriceSummary, detailsOnly).
export function CardMarketSummary({ tcgplayerId }) {
  const { analysis } = useCardAnalysis(tcgplayerId);
  if (!analysis) return null;
  return <CardPriceSummary analysis={analysis} detailsOnly />;
}

// The every-variant grid + recent sales. `chartPoints` / `comparableRange`
// come from the first-party price_history spine (server-rendered), exactly
// as the page merged them before.
export default function CardMarketPanel({ tcgplayerId, cardName, gridName = null, chartPoints = [], comparableRange = null, surface = "card", recentSalesPage = "card_recent_sales" }) {
  const { status, analysis } = useCardAnalysis(tcgplayerId);
  if (status === "loading") {
    return (
      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
        Loading condition-by-condition and graded market data…
      </p>
    );
  }
  if (!analysis) return null;
  const canonRaw = analysis.raw
    ? { ...analysis.raw, history: chartPoints, minPrice: comparableRange?.min ?? null, maxPrice: comparableRange?.max ?? null }
    : analysis.raw;
  const graded = analysis.graded ?? [];
  const showGrid = graded.length > 0 || chartPoints.length >= 2;
  return (
    <>
      {showGrid && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Every variant, side by side</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Raw and every graded tier with real recorded sales. Reference figures are USD market prices (shown ≈ in your
            currency); the raw tile names the condition its reference is really for, and a tier on a small recent sample is
            flagged. Live offers, where any exist, are listed above.
          </p>
          <div className="mt-4">
            <VariantPriceGrid raw={canonRaw} graded={graded} cardName={gridName ?? cardName} surface={surface} />
          </div>
        </div>
      )}
      <RecentSales
        sales={analysis.primaryRecentSales}
        cardName={cardName}
        page={recentSalesPage}
        surface={surface}
        variant={analysis.primaryKey === "raw" ? "raw" : null}
        className="mt-6"
      />
    </>
  );
}
