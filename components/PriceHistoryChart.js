"use client";

import { useMemo, useRef, useState } from "react";
import { useCurrency } from "@/components/CurrencyProvider";
import { formatMoney, toViewerCurrency } from "@/lib/money";

const WIDTH = 600;
const HEIGHT = 220;
// Slightly wider left gutter so a converted label (e.g. "A$1,851.84")
// still fits against the axis.
const PADDING = { top: 16, right: 16, bottom: 28, left: 58 };

function formatDate(t) {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A single-series line chart (price over time) for one card/grade. No
// legend needed - there's only one series, and the card title above it
// already says what's plotted.
export default function PriceHistoryChart({ points }) {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  // The points are USD-canonical PokemonPriceTracker values. Keep the
  // plot geometry in USD (linear scale - conversion wouldn't change the
  // shape); only the visible axis / endpoint / hover LABELS localise, so
  // the chart matches the rest of the localised card page (Phase 6A).
  const { viewer, rates } = useCurrency();
  const canConvert = viewer && viewer !== "USD" && rates && rates[viewer] > 0;
  const formatPrice = (p) =>
    canConvert ? formatMoney(toViewerCurrency(p, viewer, rates), viewer) : formatMoney(p, "USD");

  const sorted = useMemo(
    () => [...(points ?? [])].filter((p) => p.p != null).sort((a, b) => a.t - b.t),
    [points]
  );

  if (sorted.length < 2) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400 dark:border-zinc-800">
        Not enough sale history yet to chart a trend.
      </div>
    );
  }

  const minT = sorted[0].t;
  const maxT = sorted[sorted.length - 1].t;
  const minP = Math.min(...sorted.map((p) => p.p));
  const maxP = Math.max(...sorted.map((p) => p.p));
  const priceRange = maxP - minP || 1;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = (t) => PADDING.left + ((t - minT) / (maxT - minT || 1)) * plotWidth;
  const y = (p) => PADDING.top + plotHeight - ((p - minP) / priceRange) * plotHeight;

  const linePath = sorted.map((pt, i) => `${i === 0 ? "M" : "L"} ${x(pt.t)} ${y(pt.p)}`).join(" ");
  const areaPath = `${linePath} L ${x(sorted[sorted.length - 1].t)} ${PADDING.top + plotHeight} L ${x(
    sorted[0].t
  )} ${PADDING.top + plotHeight} Z`;

  const yTicks = [minP, (minP + maxP) / 2, maxP];
  const last = sorted[sorted.length - 1];

  function handlePointerMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    // Snap the crosshair to the nearest data point - readers aim at a
    // date, not a 2px line.
    let nearest = 0;
    let nearestDist = Infinity;
    sorted.forEach((pt, i) => {
      const dist = Math.abs(x(pt.t) - px);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex != null ? sorted[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full text-red-600 dark:text-red-500"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* Gridlines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-zinc-400 text-[10px]"
            >
              {formatPrice(tick)}
            </text>
          </g>
        ))}

        {/* Area wash */}
        <path d={areaPath} fill="currentColor" fillOpacity={0.1} stroke="none" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End marker + endpoint label */}
        <circle
          cx={x(last.t)}
          cy={y(last.p)}
          r={5}
          fill="currentColor"
          stroke="white"
          strokeWidth={2}
          className="dark:stroke-zinc-950"
        />
        <text
          x={x(last.t)}
          y={y(last.p) - 12}
          textAnchor="end"
          className="fill-zinc-700 text-[11px] font-semibold dark:fill-zinc-200"
        >
          {formatPrice(last.p)}
        </text>

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line
              x1={x(hovered.t)}
              x2={x(hovered.t)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              className="stroke-zinc-300 dark:stroke-zinc-700"
              strokeWidth={1}
            />
            <circle
              cx={x(hovered.t)}
              cy={y(hovered.p)}
              r={5}
              fill="currentColor"
              stroke="white"
              strokeWidth={2}
              className="dark:stroke-zinc-950"
            />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          style={{ left: `${(x(hovered.t) / WIDTH) * 100}%` }}
        >
          <div className="font-semibold text-black dark:text-zinc-50">{formatPrice(hovered.p)}</div>
          <div className="text-zinc-400">{formatDate(hovered.t)}</div>
        </div>
      )}
    </div>
  );
}
