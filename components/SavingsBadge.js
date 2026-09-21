import { savingsBadgeText } from "@/lib/dealQuality";

// UI audit 2026-09-20 - the savings badge, tiered by how good the deal
// really is and loud in proportion.
//
// The badge is rendered ONLY when the caller has already established a
// trusted, supported saving (lib/dealQuality listingPresentation +
// offerShipping) - this component never decides that. It only decides how
// hard a real number should hit:
//
//   hot     >= 40 % below the reference - solid lime, larger, a soft lime
//           glow; the one thing on the card allowed to glow besides the
//           primary action
//   strong  20-39 % - solid lime, no glow
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

// 2026-09-22 re-brand: the accent slot is brand RED now, so a savings
// badge can no longer sit in it - red is the colour of every CTA. Savings
// move to the emerald slot, which holds neon lime #B7FF36 and is reserved
// for an evidenced below-market figure and nothing else. The glow is kept
// deliberately minimal: one tight ring plus a soft drop, not a halo.
const TIER_CLASS = {
  hot: "bg-emerald-600 px-2.5 py-1 text-base font-black tracking-tight text-black shadow-[0_0_0_3px_rgb(183_255_54/0.20),0_6px_18px_rgb(183_255_54/0.28)] dark:text-black",
  strong: "bg-emerald-600 px-2 py-1 text-sm font-extrabold tracking-tight text-black dark:text-black",
  modest: "border border-zinc-200 bg-white/95 px-1.5 py-0.5 text-xs font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/90 dark:text-zinc-300",
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
