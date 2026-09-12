// Deal-first review fix P1 (round 1) + round 2: ONE shipping / saving
// contract for every renderer that shows a listing figure (DealCard,
// AuctionPrice). The scan stores `shipping` in the listing currency and
// `total_price` = item price + that shipping figure (lib/ebay.js), where
// a shipping of 0 means EITHER free OR "no shipping option stated". The
// card therefore never says "free", and it never presents a figure as
// delivered unless a charge was actually recorded.
//
//   confirmed    shipping > 0 was recorded. The stored total is a landed
//                total: "Listing total · incl. X shipping"; a saving derived
//                from it is a delivered saving and needs no qualifier.
//   unconfirmed  shipping = 0 was recorded (free OR unstated). The stored
//                total equals the item price: "Listing price" + "Shipping
//                not confirmed"; a saving derived from it is stated "before
//                shipping".
//   unknown      the field is absent / null / not numeric (a row written by
//                an older cache projection, or a driver that recorded no
//                breakdown). The stored total MAY already include a charge,
//                so neither "before shipping" nor "delivered" is supported:
//                neutral "Recorded price" wording, "Shipping breakdown not
//                recorded", and NO saving claim (savingClaim = "none").
//
// Pure, dependency-free, CommonJS (tests import it directly).

function shippingState(row) {
  const raw = row == null ? undefined : row.shipping;
  if (raw === null || raw === undefined || raw === "") return "unknown";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "unknown";
  return n > 0 ? "confirmed" : "unconfirmed";
}

// `savingClaim`: what a saving derived from the stored total may claim.
//   "delivered"        the total includes the recorded charge
//   "before_shipping"  the total is the item price only
//   "none"             breakdown unknown - state no saving at all
function offerShipping(row) {
  const state = shippingState(row);
  const amount = state === "confirmed" ? Number(row.shipping) : null;
  if (state === "confirmed") {
    return { state, amount, headline: "Listing total", note: null, savingQualifier: "", savingClaim: "delivered", deliveredKnown: true, auctionTotalLabel: "Est. total" };
  }
  if (state === "unconfirmed") {
    return { state, amount, headline: "Listing price", note: "Shipping not confirmed", savingQualifier: " before shipping", savingClaim: "before_shipping", deliveredKnown: false, auctionTotalLabel: "Est. total before shipping" };
  }
  return { state, amount, headline: "Recorded price", note: "Shipping breakdown not recorded", savingQualifier: "", savingClaim: "none", deliveredKnown: false, auctionTotalLabel: "Recorded total" };
}

module.exports = { shippingState, offerShipping };
