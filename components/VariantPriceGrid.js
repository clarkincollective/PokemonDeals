import MiniSparkline from "@/components/MiniSparkline";

function formatDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Tile({ label, badge, isActive, currentPrice, minPrice, maxPrice, saleCount, lastSaleDate, isLowConfidence, history }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        isActive
          ? "border-red-400 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-black dark:text-zinc-50">{label}</span>
        {badge}
      </div>

      <MiniSparkline points={history} className="mt-1" />

      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-sm font-bold text-black dark:text-zinc-50">
          {currentPrice != null ? `$${Number(currentPrice).toFixed(2)}` : "—"}
        </span>
        {isLowConfidence && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400" title="Based on very few real sales - treat as a rough estimate.">
            low confidence
          </span>
        )}
      </div>

      {minPrice != null && maxPrice != null && (
        <p className="text-[10px] text-zinc-400">
          ${Number(minPrice).toFixed(2)} – ${Number(maxPrice).toFixed(2)} range
        </p>
      )}
      {saleCount != null && (
        <p className="text-[10px] text-zinc-400">
          {saleCount} sale{saleCount === 1 ? "" : "s"}
          {lastSaleDate && ` · last ${formatDate(lastSaleDate)}`}
        </p>
      )}
    </div>
  );
}

// Every variant of a card (raw + every graded tier with real recorded
// sales) side by side, each with its own real price history sparkline -
// activeKey (either "raw" or a grade key like "psa10") highlights whichever
// variant the deal being viewed actually is.
export default function VariantPriceGrid({ raw, graded, activeKey }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <Tile
        label="Raw"
        badge={<span className="text-[10px] text-zinc-400">Near Mint</span>}
        isActive={activeKey === "raw"}
        currentPrice={raw.currentPrice}
        minPrice={raw.minPrice}
        maxPrice={raw.maxPrice}
        saleCount={null}
        history={raw.history}
      />
      {graded.map((g) => (
        <Tile
          key={g.key}
          label={g.label}
          badge={
            g.trend && (
              <span className={`text-[10px] font-medium ${g.trend === "up" ? "text-emerald-600" : "text-red-500"}`}>
                {g.trend === "up" ? "▲" : "▼"}
              </span>
            )
          }
          isActive={activeKey === g.key}
          currentPrice={g.currentPrice}
          minPrice={g.minPrice}
          maxPrice={g.maxPrice}
          saleCount={g.saleCount}
          lastSaleDate={g.lastSaleDate}
          isLowConfidence={g.isLowConfidence}
          history={g.history}
        />
      ))}
    </div>
  );
}
