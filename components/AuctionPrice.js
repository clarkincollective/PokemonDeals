import Price from "@/components/Price";
import { auctionDisplayParts, currencyForDeal } from "@/lib/money";

// P0 auction-price-integrity: an auction's headline "current listing
// price" is the CURRENT BID - never the bid + shipping landed total. This
// renders three distinct lines so the number a visitor reads as "the bid"
// is genuinely the bid:
//
//   CURRENT BID   <big>
//   + shipping X   (or "Free shipping")
//   Est. total Y · N% under market ref · bids can raise the final price
//
// The "% below market" and the market reference stay attached to the
// EST. TOTAL line (deal qualification is unchanged - it still compares the
// landed total against the reference). `variant` only tweaks type scale.
//
// Falls back to a single landed-total <Price> (the pre-fix rendering) when
// the row lacks the stored bid/total needed to split it safely.
export default function AuctionPrice({
  deal,
  marketUsd,
  marketNative,
  discountPct,
  variant = "card",
  className = "",
}) {
  const parts = auctionDisplayParts(deal);
  const big = variant === "detail" ? "text-2xl font-bold" : "text-lg font-bold";
  const showRef = Number.isFinite(Number(marketUsd)) && marketNative != null;

  if (!parts) {
    // Safe fallback: show the landed total (still labelled as an estimate,
    // never as "the bid").
    const total = Number(deal.total_price);
    const usdTotal = Number(deal.total_price_usd ?? deal.total_price);
    return (
      <div className={className}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
          Est. total
        </p>
        <Price
          usd={usdTotal}
          native={{ amount: total, currency: currencyForDeal(deal) }}
          className={`tnum ${big} text-zinc-900 dark:text-zinc-50`}
        />
        {discountPct > 0 && (
          <p className="tnum text-xs font-semibold text-amber-600 dark:text-amber-500">
            {discountPct}% under market ref · bids can raise the final price
          </p>
        )}
      </div>
    );
  }

  const { currency, bid, shipping, total } = parts;

  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
        Current bid
        {deal.bid_count != null ? ` · ${deal.bid_count} ${deal.bid_count === 1 ? "bid" : "bids"}` : ""}
      </p>
      <Price
        usd={bid.usd}
        native={{ amount: bid.native, currency }}
        className={`tnum ${big} text-zinc-900 dark:text-zinc-50`}
      />
      <p className="tnum mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {shipping.native > 0 ? (
          <>
            {"+ "}
            <Price usd={shipping.usd} native={{ amount: shipping.native, currency }} approxPrefix="" /> shipping
          </>
        ) : (
          "Free shipping"
        )}
      </p>
      <p className="tnum text-xs font-semibold text-amber-600 dark:text-amber-500">
        Est. total{" "}
        <Price usd={total.usd} native={{ amount: total.native, currency }} approxPrefix="" />
        {showRef && (
          <>
            {" "}
            <span className="font-normal text-zinc-400">
              vs market ref{" "}
              <Price usd={Number(marketUsd)} native={{ amount: marketNative, currency }} approxPrefix="" />
            </span>
          </>
        )}
      </p>
      {discountPct > 0 && (
        <p className="text-[11px] text-zinc-400">
          {discountPct}% under the market reference — bids can raise the final price
        </p>
      )}
    </div>
  );
}
