import MiniSparkline from "@/components/MiniSparkline";
import AffiliateLink from "@/components/AffiliateLink";
import { buildEbaySearchLink } from "@/lib/ebay";
import { hasPrice } from "@/lib/money";

function formatDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TileContents({ label, badge, currentPrice, minPrice, maxPrice, saleCount, lastSaleDate, isLowConfidence, history, showBuyHint }) {
  return (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-black dark:text-zinc-50">{label}</span>
        {badge}
      </div>

      <MiniSparkline points={history} className="mt-1" />

      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-sm font-bold text-black dark:text-zinc-50">
          {hasPrice(currentPrice) ? `$${Number(currentPrice).toFixed(2)}` : "—"}
        </span>
        {isLowConfidence && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400" title="Based on very few real sales - treat as a rough estimate.">
            low confidence
          </span>
        )}
      </div>

      {hasPrice(minPrice) && hasPrice(maxPrice) && (
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
      {showBuyHint && (
        <p className="mt-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400">Find on eBay →</p>
      )}
    </>
  );
}

// isActive (this listing's own variant) renders as a plain, non-clickable
// tile - it's already the thing the page's main "View Deal" button
// points at, right above. Every OTHER tile is a real link out to a
// tracked eBay search for that specific grade - a visitor comparing
// variants who decides they'd rather have a different one should still
// leave through an affiliate-tracked link, not a dead end.
function Tile({ label, isActive, searchQuery, eventData, ...contentProps }) {
  const className = `block rounded-lg border p-3 text-left transition-colors ${
    isActive
      ? "border-red-400 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
  }`;

  if (isActive) {
    return (
      <div className={className}>
        <TileContents label={label} {...contentProps} />
      </div>
    );
  }

  return (
    <AffiliateLink
      href={buildEbaySearchLink(searchQuery)}
      eventName="eBay Click"
      eventData={eventData}
      className={className}
    >
      <TileContents label={label} {...contentProps} showBuyHint />
    </AffiliateLink>
  );
}

// Every variant of a card (raw + every graded tier with real recorded
// sales) side by side, each with its own real price history sparkline -
// activeKey (either "raw" or a grade key like "psa10") highlights whichever
// variant the deal being viewed actually is.
export default function VariantPriceGrid({ raw, graded, activeKey, cardName }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <Tile
        label="Raw"
        badge={<span className="text-[10px] text-zinc-400">Near Mint</span>}
        isActive={activeKey === "raw"}
        searchQuery={cardName}
        eventData={{ card: cardName, page: "variant_grid", variant: "raw" }}
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
          searchQuery={`${cardName} ${g.label}`}
          eventData={{ card: cardName, page: "variant_grid", variant: g.key }}
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
