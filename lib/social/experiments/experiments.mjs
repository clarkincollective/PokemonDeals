// Phase 13E.10A - EXPERIMENT IDENTITY + SLATE + ELIGIBILITY (§5, §8, §10).
//
// A small, bounded initial slate. Each experiment tests ONE primary
// variable (a hook OR a cta - never both at once, §10) between two
// variants A/B. `applies_to` is the creative families it is valid for.
// An experiment only APPLIES to a candidate when BOTH of its variants are
// eligible for that candidate (so deterministic assignment is never
// biased by one side being unrenderable, §7).

import { hookEligible } from "./hooks.mjs";
import { ctaFitsDestination } from "./ctas.mjs";

// §10 - the first four experiments. Keep it small.
export const EXPERIMENTS = Object.freeze([
  {
    experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap",
    dimension: "HOOK",
    hypothesis: "For a Deal Drop, a concrete '$X card, listed for $Y' contrast drives more website visits + eBay outbound than a '% below market' framing.",
    applies_to: ["deal_drop"],
    variants: {
      A: { hook_variant: "PRICE_CONTRAST", label: "Price contrast" },
      B: { hook_variant: "PERCENT_GAP", label: "Percent gap" },
    },
    platform_scope: "all",
  },
  {
    experiment_id: "e2_deal_cta_seelivedeal_vs_checkcurrentlisting",
    dimension: "CTA",
    hypothesis: "For a Deal Drop pointing at an exact listing, 'SEE THE LIVE DEAL' converts to eBay outbound better than 'CHECK THE CURRENT LISTING'.",
    applies_to: ["deal_drop"],
    variants: {
      A: { cta_variant: "SEE_LIVE_DEAL", label: "See the live deal" },
      B: { cta_variant: "CHECK_CURRENT_LISTING", label: "Check the current listing" },
    },
    platform_scope: "all",
  },
  {
    experiment_id: "e3_collection_hook_foundtoday_vs_belowmarket",
    dimension: "HOOK",
    hypothesis: "For a Hook Carousel, 'N deals we found today' (discovery framing) drives more site visits than 'N Pokemon cards below market' (value framing).",
    applies_to: ["hook_carousel"],
    variants: {
      A: { hook_variant: "COLLECTION", label: "Found today" },
      B: { hook_variant: "COLLECTION_BELOW_MARKET", label: "Below market" },
    },
    platform_scope: "all",
  },
  {
    experiment_id: "e4_mover_cta_pricehistory_vs_comparelistings",
    dimension: "CTA",
    hypothesis: "For a Market Mover, 'FULL PRICE HISTORY' drives more deal-page engagement than 'COMPARE LIVE LISTINGS'.",
    applies_to: ["market_mover"],
    variants: {
      A: { cta_variant: "FULL_PRICE_HISTORY", label: "Full price history" },
      B: { cta_variant: "COMPARE_LIVE_LISTINGS", label: "Compare live listings" },
    },
    platform_scope: "all",
  },
]);

export const EXPERIMENT_IDS = Object.freeze(EXPERIMENTS.map((e) => e.experiment_id));

// §10 - one primary experiment dimension per placement to start. For each
// family, THIS is the experiment the planner runs first (§22).
export const PRIMARY_EXPERIMENT_BY_FAMILY = Object.freeze({
  deal_drop: "e1_deal_hook_pricecontrast_vs_percentgap",
  hook_carousel: "e3_collection_hook_foundtoday_vs_belowmarket",
  market_mover: "e4_mover_cta_pricehistory_vs_comparelistings",
  brand_ad: null, // §8 - minimal experimentation on brand content initially
});

// §10 - at most this many experiments run on one placement at once.
export const MAX_EXPERIMENTS_PER_PLACEMENT = 1;

export function findExperiment(id) {
  return EXPERIMENTS.find((e) => e.experiment_id === id) ?? null;
}

export function experimentsForFamily(family) {
  return EXPERIMENTS.filter((e) => e.applies_to.includes(family));
}

// Is a single VARIANT ({hook_variant?, cta_variant?}) renderable for this
// candidate? A hook variant checks hook fact-safety; a cta variant checks
// the CTA fits the candidate's destination kind.
export function variantEligible(variant, { facts, destinationKind } = {}) {
  if (variant.hook_variant) {
    const r = hookEligible(variant.hook_variant, facts ?? {});
    return { ok: r.ok, reason: r.reason };
  }
  if (variant.cta_variant) {
    const r = ctaFitsDestination(variant.cta_variant, destinationKind);
    return { ok: r.ok, reason: r.reason };
  }
  return { ok: false, reason: "variant has neither a hook_variant nor a cta_variant" };
}

// An experiment APPLIES to a candidate only when BOTH variants are
// eligible (unbiased assignment, §7). Returns { ok, reason }.
export function experimentApplies(experiment, { family, facts, destinationKind } = {}) {
  if (!experiment) return { ok: false, reason: "no experiment" };
  if (!experiment.applies_to.includes(family)) return { ok: false, reason: `experiment does not apply to ${family}` };
  const a = variantEligible(experiment.variants.A, { facts, destinationKind });
  if (!a.ok) return { ok: false, reason: `variant A ineligible: ${a.reason}` };
  const b = variantEligible(experiment.variants.B, { facts, destinationKind });
  if (!b.ok) return { ok: false, reason: `variant B ineligible: ${b.reason}` };
  return { ok: true, reason: "" };
}
