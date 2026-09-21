import { savingsBadgeText } from "@/lib/dealQuality";

// UI audit 2026-09-20 - the savings badge, tiered by how good the deal
// really is and loud in proportion.
//
// The badge is rendered ONLY when the caller has already established a
// trusted, supported saving (lib/dealQuality listingPresentation +
// offerShipping) - this component never decides that. It only decides how
// hard a real number should hit:
//
//   hot     >= 40 % below the reference - solid green, larger, a soft
//           green halo; the one thing on the card allowed to glow besides
//           the primary action
//   strong  20-39 % - solid green, no glow
//   modest  < 20 % - quiet outline; a 12 % saving must not shout
//
// No scarcity or urgency wording is invented - no stock counts, no timers,
// no pace claims. The number is the real discount_pct and nothing else.
// Auctions never use this component - a bid is not a saving (see
// DealCard's amber badge).
export function savingsTier(discountPct) {
  const pct = Math.round(Number(discountPct) * 100);
  if (pct >= 40) return "hot";
  if (pct >= 20) return "strong";
  return "modest";
}

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
const TIER_CLASS = {
  hot: "bg-emerald-600 px-2.5 py-1 text-base font-black tracking-tight text-white shadow-[0_0_0_3px_rgb(4_120_87/0.14),0_6px_18px_rgb(4_120_87/0.22)]",
  strong: "bg-emerald-600 px-2 py-1 text-sm font-extrabold tracking-tight text-white",
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
