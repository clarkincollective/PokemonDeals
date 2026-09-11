const WIDTH = 100;
const HEIGHT = 32;

// Price-condition provenance: a point with `v` recorded the condition and
// printing its price was for (`c` / `pr`). Only a segment between two
// verified points of the same reference is drawn solid; the rest is
// dashed and faded. Nothing here uses the page's live reference.
const keyOf = (p) => (p.v ? `${p.c}|${p.pr}` : null);

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

  let solidPath = "";
  let dashedPath = "";
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const seg = `M ${x(a.t).toFixed(1)} ${y(a.p).toFixed(1)} L ${x(b.t).toFixed(1)} ${y(b.p).toFixed(1)} `;
    if (keyOf(a) != null && keyOf(a) === keyOf(b)) solidPath += seg;
    else dashedPath += seg;
  }
  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const trendingUp = last.p >= first.p;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`h-8 w-full ${trendingUp ? "text-emerald-600 dark:text-emerald-500" : "text-red-500"} ${className}`}
    >
      {dashedPath && (
        <path d={dashedPath} data-history="unverified" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {solidPath && (
        <path d={solidPath} data-history="comparable" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <circle cx={x(last.t)} cy={y(last.p)} r={2.5} fill="currentColor" fillOpacity={last.v ? 1 : 0.45} />
    </svg>
  );
}
