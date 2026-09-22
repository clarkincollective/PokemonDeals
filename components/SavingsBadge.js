import { savingsBadgeText, savingsTier } from "@/lib/dealQuality";

// UI audit 2026-09-20 - the savings badge, tiered by how good the deal
// really is and loud in proportion.
//
// The badge is rendered ONLY when the caller has already established a
// trusted, supported saving (lib/dealQuality listingPresentation +
// offerShipping) - this component never decides that. It only decides how
// hard a real number should hit:
//
//   blowout >= 60 % - the loudest thing on the page: deep green gradient,
//           white ring, a slow halo pulse. Measured against live data
//           this is 28 of 896 claim-bearing cards (3 %), so it stays
//           rare enough to mean something; if it ever became common the
//           threshold is the thing to raise, not the styling to calm.
//   hot     40-59 % - solid green, larger, a green halo
//   strong  20-39 % - solid green
//   modest  < 20 % - quiet outline; a 12 % saving must not shout
//
// THE TIERING IS THE HONESTY. Making every badge scream would say a 12 %
// saving and a 68 % saving are the same find, which is the same overclaim
// this codebase gates everywhere else - only in CSS. So the top two tiers
// got louder and `modest` deliberately did not move.
//
// No scarcity or urgency wording is invented - no stock counts, no
// timers, no pace claims, no "going fast". The number is the real
// discount_pct and nothing else. Auctions never use this component - a
// bid is not a saving (see DealCard's amber badge).
//
// The LADDER itself lives in lib/dealQuality, beside the other savings
// wording helpers: it is a domain decision, not a rendering one, and the
// "You save" line on the card grades itself with the same function so the
// chip there and the badge here can never disagree about how good a deal
// is. Re-exported for callers that import it from the badge.
export { savingsTier };

// 2026-09-22 re-brand: the accent slot is brand RED, so a savings badge
// cannot sit in it - red is the colour of every CTA. Savings live in the
// emerald slot, reserved for an evidenced below-market figure and nothing
// else.
//
// rev 2 (light theme): the fill was neon lime #B7FF36 with near-black
// ink, which only works on a near-black ground. On white the slot holds
// #047857 and the ink is WHITE (5.6:1). The explicit text-black here was
// the single thing that would have survived the token flip and printed
// 2.2:1, so it is replaced rather than left to the cascade.
//
// rev 3: `blowout` added and the upper tiers amplified. Every fill is
// still an emerald token and every ink is white, so the extra weight
// comes from size, ring, shadow and (top tier only) motion - never from
// a lighter fill, which is the one change that would cost contrast.
// Measured: white on emerald-600 is 5.48:1, and the blowout gradient
// runs emerald-600 -> emerald-900, i.e. 5.48:1 at its lightest point and
// 9.72:1 at its darkest, so the number clears AA everywhere along it.
// It started at emerald-500 and was darkened a step because that put the
// gradient's light end at 3.77:1 - passing only on the large-bold
// exemption, which is too close to the line for the loudest badge here.
// The gradient names no .bg-emerald-* class, so the unlayered white-ink
// rule in globals.css does not apply to it and text-white is set
// explicitly. The halo animation is defined in globals.css and is
// covered by the global prefers-reduced-motion block there.
const TIER_CLASS = {
  blowout:
    "animate-savings-halo bg-gradient-to-br from-emerald-600 to-emerald-900 px-3 py-1.5 text-lg font-black tracking-tighter text-white ring-2 ring-white/80 shadow-[0_8px_24px_rgb(4_120_87/0.45)] dark:ring-white/40",
  hot: "bg-emerald-600 px-2.5 py-1.5 text-base font-black tracking-tighter text-white ring-1 ring-white/60 shadow-[0_0_0_3px_rgb(4_120_87/0.16),0_8px_22px_rgb(4_120_87/0.34)] dark:ring-white/25",
  strong: "bg-emerald-600 px-2.5 py-1 text-sm font-extrabold tracking-tight text-white shadow-[0_3px_10px_rgb(4_120_87/0.28)]",
  modest: "border border-emerald-600/35 bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700",
};

export default function SavingsBadge({ discountPct, className = "" }) {
  const tier = savingsTier(discountPct);
  return (
    <span
      data-savings-badge={tier}
      className={`inline-flex items-center rounded-lg leading-none ${TIER_CLASS[tier]} ${className}`}
    >
      {savingsBadgeText(discountPct)}
    </span>
  );
}
