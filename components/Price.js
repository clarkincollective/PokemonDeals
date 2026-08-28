"use client";

import { useCurrency } from "@/components/CurrencyProvider";
import { formatMoney, toViewerCurrency } from "@/lib/money";

// One money amount that localises itself after hydration.
//
//   usd     - the amount's value in USD (e.g. deal.total_price_usd, or
//             market_price which is already USD). Null -> can't convert.
//   native  - { amount, currency }: what to show on the server render and
//             first paint, and whenever it already matches the viewer's
//             currency. For a listing price this is the real eBay price;
//             for a USD reference figure it's { amount, currency: "USD" }.
//   approxPrefix - prepended once a conversion actually happened ("≈ ").
//
// SSR and first paint => native. After /api/rates resolves, if the
// viewer's currency differs => the converted amount with the prefix. A
// text-only change, so no layout shift.
export default function Price({ usd, native, className, approxPrefix = "≈ " }) {
  const { viewer, rates } = useCurrency();

  const convert =
    viewer &&
    rates &&
    viewer !== native.currency &&
    usd != null &&
    Number.isFinite(Number(usd)) &&
    rates[viewer] > 0;

  if (!convert) {
    return <span className={className}>{formatMoney(native.amount, native.currency)}</span>;
  }

  return (
    <span className={className}>
      {approxPrefix}
      {formatMoney(toViewerCurrency(usd, viewer, rates), viewer)}
    </span>
  );
}
