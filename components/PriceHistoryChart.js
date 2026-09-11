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

// Price-condition provenance (2026-09-11). Each point carries ITS OWN
// recorded provenance: `v` (1 = the row recorded both the condition and
// the printing the price was for) plus `c` / `pr` (what was recorded).
// The point's own record is the only thing that labels it - never the
// page's current live reference. Points are kept on the chart whatever
// their provenance, but only a segment whose two ends are verified AND
// the same reference is drawn as solid "comparable" history; any segment
// touching an unverified point, or crossing a change of reference, is
// drawn dashed and faded.
const keyOf = (p) => (p.v ? `${p.c}|${p.pr}` : null);

// A single-series line chart (price over time) for one card/grade.
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

  // Split the polyline into comparable (solid) and non-comparable (dashed)
  // sub-paths, segment by segment.
  let solidPath = "";
  let dashedPath = "";
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const comparable = keyOf(a) != null && keyOf(a) === keyOf(b);
    const seg = `M ${x(a.t)} ${y(a.p)} L ${x(b.t)} ${y(b.p)} `;
    if (comparable) solidPath += seg;
    else dashedPath += seg;
  }
  const linePath = sorted.map((pt, i) => `${i === 0 ? "M" : "L"} ${x(pt.t)} ${y(pt.p)}`).join(" ");
  const areaPath = `${linePath} L ${x(sorted[sorted.length - 1].t)} ${PADDING.top + plotHeight} L ${x(
    sorted[0].t
  )} ${PADDING.top + plotHeight} Z`;

  const yTicks = [minP, (minP + maxP) / 2, maxP];
  const last = sorted[sorted.length - 1];

  // Legend facts come from the points themselves.
  const unverifiedCount = sorted.filter((p) => !p.v).length;
  const lastKey = keyOf(last);
  let comparableFrom = null;
  if (lastKey) {
    let i = sorted.length - 1;
    while (i >= 0 && keyOf(sorted[i]) === lastKey) i--;
    comparableFrom = sorted[i + 1];
  }
  const hasSolid = solidPath.length > 0;

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
        <path d={areaPath} fill="currentColor" fillOpacity={0.06} stroke="none" />

        {/* Non-comparable history: unverified provenance or a different reference */}
        {dashedPath && (
          <path
            d={dashedPath}
            data-history="unverified"
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Verified, comparable history */}
        {solidPath && (
          <path
            d={solidPath}
            data-history="comparable"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* End marker + endpoint label */}
        <circle
          cx={x(last.t)}
          cy={y(last.p)}
          r={5}
          fill={last.v ? "currentColor" : "white"}
          stroke={last.v ? "white" : "currentColor"}
          strokeWidth={2}
          className={last.v ? "dark:stroke-zinc-950" : "dark:fill-zinc-950"}
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
          <div className="text-zinc-400" data-point-provenance={hovered.v ? "verified" : "unverified"}>
            {hovered.v ? `${hovered.c} · ${hovered.pr}` : "condition not recorded"}
          </div>
        </div>
      )}

      {/* Legend - from the points' own records only */}
      <p className="mt-2 text-[11px] text-zinc-400" data-history-legend>
        {hasSolid && comparableFrom ? (
          <>
            <span className="inline-block h-0.5 w-4 translate-y-[-2px] bg-current text-red-600 dark:text-red-500" /> Verified{" "}
            {last.c}, {last.pr} reference since {formatDate(comparableFrom.t)}.{" "}
          </>
        ) : (
          <>No verified comparable history yet. </>
        )}
        {unverifiedCount > 0 && (
          <>
            <span className="inline-block w-4 translate-y-[-2px] border-t-2 border-dashed border-current text-red-600/60 dark:text-red-500/60" />{" "}
            {unverifiedCount} earlier {unverifiedCount === 1 ? "reading" : "readings"} didn&apos;t record which condition
            and printing they were for (or were for a different reference) — shown dashed, not comparable.
          </>
        )}
      </p>
    </div>
  );
}
