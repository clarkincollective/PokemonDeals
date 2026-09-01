import AffiliateLink from "@/components/AffiliateLink";
import { normalizePublicText } from "@/lib/publicText";

// Real individual eBay sold listings for the card's primary variant, from
// PokemonPriceTracker's `primaryRecentSales` (via getFullPriceAnalysis).
// NEVER a market-reference snapshot dressed up as a transaction: every row
// is one real sale with its own date, price, listing type and URL. Shown
// on /deals/[id] and /cards/[slug].
function formatSaleDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function RecentSales({ sales, cardName, page = "recent_sales", limit = 8, className = "" }) {
  const rows = (sales ?? []).filter((s) => s && s.price != null);
  if (rows.length === 0) return null;

  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Recent eBay sales</h2>
      <p className="text-xs text-zinc-400">
        Real individual sold listings for this printing — not a market-reference estimate.
      </p>
      <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
        {rows.slice(0, limit).map((sale) => (
          <li key={sale.listingId ?? `${sale.soldDate}-${sale.price}`} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              {sale.url ? (
                <AffiliateLink
                  href={sale.url}
                  eventName="eBay Click"
                  eventData={{ card: cardName, page }}
                  className="line-clamp-1 block text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                >
                  {normalizePublicText(sale.title ?? "eBay sale")}
                </AffiliateLink>
              ) : (
                <span className="line-clamp-1 block text-sm text-zinc-700 dark:text-zinc-300">
                  {normalizePublicText(sale.title ?? "eBay sale")}
                </span>
              )}
              <p className="text-xs text-zinc-400">
                {formatSaleDate(sale.soldDate) ?? "Date unavailable"} &middot;{" "}
                {sale.listingType === "auction" ? "Auction" : "Buy It Now"}
              </p>
            </div>
            <span className="shrink-0 font-semibold text-black dark:text-zinc-50">
              ${Number(sale.price).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
