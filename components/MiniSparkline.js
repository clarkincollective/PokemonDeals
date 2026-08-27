const WIDTH = 100;
const HEIGHT = 32;

// A small, non-interactive line for a grid of many variant tiles at once -
// deliberately simpler than PriceHistoryChart (no axes/hover/crosshair),
// which would be too heavy repeated a dozen times on one page.
export default function MiniSparkline({ points, className = "" }) {
  const sorted = [...(points ?? [])].filter((p) => p.p != null).sort((a, b) => a.t - b.t);

  if (sorted.length < 2) {
    return <div className={`flex h-8 items-center text-[10px] text-zinc-400 ${className}`}>Not enough data</div>;
  }

  const minT = sorted[0].t;
  const maxT = sorted[sorted.length - 1].t;
  const minP = Math.min(...sorted.map((p) => p.p));
  const maxP = Math.max(...sorted.map((p) => p.p));
  const priceRange = maxP - minP || 1;

  const x = (t) => ((t - minT) / (maxT - minT || 1)) * WIDTH;
  const y = (p) => HEIGHT - ((p - minP) / priceRange) * HEIGHT;

  const linePath = sorted.map((pt, i) => `${i === 0 ? "M" : "L"} ${x(pt.t).toFixed(1)} ${y(pt.p).toFixed(1)}`).join(" ");
  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const trendingUp = last.p >= first.p;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`h-8 w-full ${trendingUp ? "text-emerald-600 dark:text-emerald-500" : "text-red-500"} ${className}`}
    >
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.t)} cy={y(last.p)} r={2.5} fill="currentColor" />
    </svg>
  );
}
