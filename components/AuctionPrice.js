import Price from "@/components/Price";
import { auctionDisplayParts, currencyForDeal, dealTotalUsd, hasPrice } from "@/lib/money";
import { offerShipping } from "@/lib/offerPresentation";

// P0 auction-price-integrity: an auction's headline "current listing
// price" is the CURRENT BID - never the bid + shipping landed total. This
// renders three distinct lines so the number a visitor reads as "the bid"
// is genuinely the bid:
//
//   CURRENT BID   <big>
//   + shipping X   (or "Shipping not confirmed" when the stored figure is
//                   0 - free OR "no shipping option stated", never called
//                   free - or "Shipping breakdown not recorded" when the
//                   row carries no shipping field at all)
//   Est. total Y · N% under market ref · bids can raise the final price
//
// The "% below market" and the market reference stay attached to the
// EST. TOTAL line (deal qualification is unchanged - it still compares the
// stored total against the reference). `variant` only tweaks type scale.
//
// Shipping state comes from the shared contract (lib/offerPresentation),
// NOT from the split maths: auctionDisplayParts collapses a missing
// shipping figure to 0 for arithmetic, and "missing" must never read as
// "before shipping" (the stored total may already include a charge).
// Deal-first review, round 2:
//   confirmed    "Est. total"                 comparison is delivered
//   unconfirmed  "Est. total before shipping" comparison "before shipping"
//   unknown      "Recorded total"             NO comparison stated
//
// Falls back to a single stored-total <Price> when the row lacks the
// stored bid needed to split it safely - labelled by the same contract,
// never as "the bid".
export default function AuctionPrice({
  deal,
  marketUsd,
  marketNative,
  discountPct,
  variant = "card",
  className = "",
}) {
  const parts = auctionDisplayParts(deal);
  const ship = offerShipping(deal);
  const claim = ship.savingClaim; // "delivered" | "before_shipping" | "none"
  const big = variant === "detail" ? "text-2xl font-bold" : "text-lg font-bold";
  const showRef = claim !== "none" && Number.isFinite(Number(marketUsd)) && marketNative != null;
  const showPct = claim !== "none" && discountPct > 0;
  const pctQualifier = claim === "before_shipping" ? " before shipping" : "";
  const shippingLineClass = ship.state === "confirmed" ? "text-zinc-500 dark:text-zinc-400" : "text-amber-700 dark:text-amber-500";

  if (!parts) {
    // Safe fallback: show the stored total (labelled by the shipping
    // contract, never as "the bid"). Currency for the shipping line comes
    // from the row; the amounts are the stored native figures.
    const total = Number(deal.total_price);
    if (!hasPrice(total)) return (
      <div className={className}>
        <p className="text-sm font-semibold">Price unavailable</p>
        <p className="text-xs text-zinc-500">Check the current bid and shipping on eBay.</p>
      </div>
    );
    const usdTotal = dealTotalUsd(deal);
    const currency = currencyForDeal(deal);
    const shipUsd = ship.state === "confirmed" && usdTotal > 0 && total > 0 ? ship.amount * (usdTotal / total) : null;
    return (
      <div className={className}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500">
          {ship.auctionTotalLabel}
        </p>
        <Price
          usd={usdTotal}
          native={{ amount: total, currency }}
          className={`tnum ${big} text-zinc-900 dark:text-zinc-50`}
        />
        <p className={`tnum mt-0.5 text-xs ${shippingLineClass}`}>
          {ship.state === "confirmed" ? (
            <>
              incl. <Price usd={shipUsd} native={{ amount: ship.amount, currency }} approxPrefix="" /> shipping
            </>
          ) : (
            ship.note
          )}
        </p>
        {showPct ? (
          <p className="tnum text-xs font-semibold text-amber-600 dark:text-amber-500">
            {discountPct}% under market ref{pctQualifier} · bids can raise the final price
          </p>
        ) : (
          <p className="text-[11px] text-zinc-400">bids can raise the final price</p>
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
      <p className={`tnum mt-0.5 text-xs ${shippingLineClass}`}>
        {ship.state === "confirmed" ? (
          <>
            {"+ "}
            <Price usd={shipping.usd} native={{ amount: shipping.native, currency }} approxPrefix="" /> shipping
          </>
        ) : (
          ship.note
        )}
      </p>
      <p className="tnum text-xs font-semibold text-amber-600 dark:text-amber-500">
        {ship.auctionTotalLabel}{" "}
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
      {showPct ? (
        <p className="text-[11px] text-zinc-400">
          {discountPct}% under the market reference{pctQualifier} — bids can raise the final price
        </p>
      ) : (
        <p className="text-[11px] text-zinc-400">
          {claim === "none" ? "No comparison stated: shipping breakdown not recorded — " : ""}bids can raise the final price
        </p>
      )}
    </div>
  );
}
