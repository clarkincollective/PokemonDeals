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

  // CRO 2026-09-22 (§13). The prefix is a REQUIRED qualification - this
  // figure was converted to the viewer's currency and is therefore
  // approximate, and the seller charges in `native.currency`. It is kept
  // for exactly that reason. What changed is its presentation: a
  // full-size "≈ " led every price on the site, so the first thing read
  // in the card's largest figure was a symbol rather than the number.
  // It is now a smaller, muted mark that still sits before the amount
  // (where it qualifies what follows) without competing with it, and it
  // carries a title naming the seller's real currency.
  //
  // Screen readers get BETTER information than before, not less: "≈" is
  // announced inconsistently across readers, so the glyph is hidden and
  // the word "approximately" is exposed instead.
  //
  // approxPrefix="" still suppresses the mark entirely, unchanged, for
  // the callers that render a figure inside a sentence that already says
  // it is approximate.
  const amount = formatMoney(toViewerCurrency(usd, viewer, rates), viewer);
  if (!approxPrefix) return <span className={className}>{amount}</span>;
  return (
    <span className={className} title={`Approximate: converted from ${native.currency} at today's rate`}>
      <span aria-hidden="true" className="mr-[0.15em] align-baseline text-[0.62em] font-semibold opacity-55">
        ≈
      </span>
      <span className="sr-only">approximately </span>
      {amount}
    </span>
  );
}
