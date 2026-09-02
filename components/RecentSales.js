import AffiliateLink from "@/components/AffiliateLink";
import Price from "@/components/Price";
import { normalizePublicText } from "@/lib/publicText";

// PokemonPriceTracker's recent-sales feed carries a USD price per sale
// (no per-sale currency in the data contract); <Price> localises it to
// the viewer's currency after hydration so the list matches the rest of
// the page (Phase 6A currency closeout).

// Real individual eBay sold listings for the card's primary variant, from
// PokemonPriceTracker's `primaryRecentSales` (via getFullPriceAnalysis).
// NEVER a market-reference snapshot dressed up as a transaction: every row
// is one real sale with its own date, price, listing type and URL. Shown
// on /deals/[id] and /cards/[slug].
function formatSaleDate(dateString) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function RecentSales({
  sales,
  cardName,
  page = "recent_sales",
  limit = 8,
  variant = null, // "raw" -> label the list as raw (ungraded) sales
  className = "",
}) {
  const rows = (sales ?? []).filter((s) => s && s.price != null);
  const heading = variant === "raw" ? "Recent raw eBay sales" : "Recent eBay sales";
  const caption =
    variant === "raw"
      ? "Real individual sold listings that appear to match this raw printing — not a market-reference estimate. Graded slabs, other printings (reprints, 1st Edition, Japanese) and obvious price-feed outliers are filtered out, so few or none may remain."
      : "Real individual sold listings for this printing — not a market-reference estimate.";

  // Honest empty state for the raw list: after filtering out graded slabs
  // and foreign printings there may be nothing left, and that is better
  // than backfilling with unrelated sales. Non-raw callers (or a failed
  // analysis load, sales == null) still render nothing.
  if (rows.length === 0) {
    if (variant !== "raw" || !Array.isArray(sales)) return null;
    return (
      <section
        className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
      >
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{heading}</h2>
        <p className="text-xs text-zinc-400">{caption}</p>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          No recent raw eBay sales clearly match this printing.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">{heading}</h2>
      <p className="text-xs text-zinc-400">{caption}</p>
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
              <Price usd={sale.price} native={{ amount: Number(sale.price), currency: "USD" }} approxPrefix="" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
