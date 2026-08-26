// Simple bucketing of discount_pct into a human label, purely a display
// convenience - DISCOUNT_THRESHOLD in refresh-deals/route.js (10%) is what
// actually decides whether something counts as a deal at all.
function dealScore(discountPct) {
  if (discountPct >= 0.4) return { label: "Amazing Deal", className: "bg-red-600 text-white" };
  if (discountPct >= 0.25) return { label: "Strong Deal", className: "bg-orange-500 text-white" };
  return { label: "Good Deal", className: "bg-amber-500 text-black" };
}

module.exports = { dealScore };
