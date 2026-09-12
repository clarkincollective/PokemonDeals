// Deal-first - the offer-card display contract for shipping, derived from
// what a deal row actually carries. Pure, dependency-free, CommonJS so
// DealCard (client), AuctionPrice and the node:test suite share ONE rule.
//
// `deals.shipping` semantics (lib/ebay.js mapItemSummary): the first
// shipping option's cost, or 0 when eBay stated none. So:
//   > 0            a charge was recorded  -> "confirmed"
//   === 0          free OR unstated       -> "unconfirmed" (never "free")
//   null/undefined the row does not carry the field (a caller that did
//                  not project it, or a cache entry written before the
//                  field joined the slim shape) -> "unknown"
//
// `total_price` is ALWAYS price + recorded shipping. That is why the
// headline is "Listing total" whenever a charge is known to be in it,
// "Listing price" when the recorded charge is 0 (the figure equals the
// item price and shipping is simply not confirmed), and "Listing total"
// again for "unknown" (the stored total may include a charge we cannot
// see - it is never labelled as item-only, and never called landed).
//
// The saving is qualified "before shipping" whenever the delivered cost
// is not established, so a card never implies a verified delivered saving.
function shippingState(row) {
  const raw = row == null ? undefined : row.shipping;
  if (raw === null || raw === undefined || raw === "") return "unknown";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "unknown";
  return n > 0 ? "confirmed" : "unconfirmed";
}

function offerShipping(row) {
  const state = shippingState(row);
  const amount = state === "confirmed" ? Number(row.shipping) : null;
  return {
    state,
    amount, //                       native currency, only when confirmed
    headline: state === "unconfirmed" ? "Listing price" : "Listing total",
    note: state === "confirmed" ? null : "Shipping not confirmed",
    // appended to the derived saving - "" only when shipping is confirmed
    savingQualifier: state === "confirmed" ? "" : " before shipping",
    deliveredKnown: state === "confirmed",
  };
}

module.exports = { shippingState, offerShipping };
