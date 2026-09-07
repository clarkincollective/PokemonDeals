// Phase 13E.10A - EXPERIMENT ASSIGNMENT ENTRY POINT.
//
// The one function the planner calls: pick this placement's
// { experiment_id, variant_id, hook_variant, cta_variant } DETERMINISTICALLY.
//
// It runs AFTER every quality / freshness / rights / QA / platform-
// eligibility gate and CANNOT affect any of them (§19). It only chooses
// among CREATIVE variants that are all already eligible.

import {
  EXPERIMENTS,
  EXPERIMENT_IDS,
  PRIMARY_EXPERIMENT_BY_FAMILY,
  MAX_EXPERIMENTS_PER_PLACEMENT,
  findExperiment,
  experimentsForFamily,
  experimentApplies,
} from "./experiments.mjs";
import { assignVariant, explainAssignment } from "./assignment.mjs";
import { HOOK_VARIANTS, hookEligible } from "./hooks.mjs";
import { CTA_VARIANTS, ctasForDestination, ctaFitsDestination } from "./ctas.mjs";

export {
  EXPERIMENTS,
  EXPERIMENT_IDS,
  PRIMARY_EXPERIMENT_BY_FAMILY,
  MAX_EXPERIMENTS_PER_PLACEMENT,
  findExperiment,
  experimentsForFamily,
  experimentApplies,
  assignVariant,
  explainAssignment,
};

// candidate -> the frozen fact object the hook library consumes.
export function factsFromCandidate(c = {}) {
  return {
    family: c.family ?? null,
    cardName: c.card_name ?? null,
    listedUsd: c.total_price_usd ?? c.row?.total_price_usd ?? null,
    marketRefUsd: c.market_price ?? c.row?.market_price ?? null,
    discountPct: c.discount_pct ?? c.row?.discount_pct ?? null,
    movementPct: c.movement?.pct ?? c.movementPct ?? null,
    movementDirection: c.movement?.direction ?? c.movementDirection ?? null,
    movementWindow: c.movement?.windowLabel ?? c.movementWindow ?? null,
    movementConfidence: c.movement?.confidence ?? c.confidence ?? null,
    freshnessState: c.freshness_state ?? null,
    itemCount: c.item_count ?? null,
    allUnderThreshold: c.all_under_threshold ?? null,
    underPriceThresholdUsd: c.under_price_threshold_usd ?? null,
  };
}

// coarse destination kind per family (the exact route is resolved later in
// the render/distribution layer; the experiment layer only needs the kind).
export function destinationKindForFamily(family) {
  if (family === "deal_drop") return "deal_exact";
  if (family === "market_mover") return "card_hub";
  return "deals_index"; // hook_carousel, brand_ad
}

// The deterministic DEFAULT hook when no experiment applies. Mirrors
// lib/social/creativeSpec.selectDealHook's priority order.
export function defaultHookFor(family, facts = {}) {
  if (family === "deal_drop") {
    for (const id of ["DISCOVERY", "PRICE_CONTRAST", "DOLLAR_SAVING", "PERCENT_GAP"]) {
      if (hookEligible(id, facts).ok) return id;
    }
    return null;
  }
  if (family === "hook_carousel") return hookEligible("COLLECTION", facts).ok ? "COLLECTION" : null;
  if (family === "market_mover") return hookEligible("MARKET_MOVEMENT", facts).ok ? "MARKET_MOVEMENT" : null;
  return null; // brand_ad has no data hook
}

// The deterministic DEFAULT CTA for a destination kind.
export function defaultCtaFor(destinationKind) {
  const order = { deal_exact: ["SEE_LIVE_DEAL", "CHECK_CURRENT_LISTING"], card_hub: ["FULL_PRICE_HISTORY", "COMPARE_LIVE_LISTINGS"], deals_index: ["SEE_TODAYS_DEALS", "SEE_ALL_LIVE_FINDS", "COMPARE_LIVE_LISTINGS"] };
  const wish = order[destinationKind] ?? [];
  const valid = ctasForDestination(destinationKind);
  return wish.find((id) => valid.includes(id)) ?? valid[0] ?? null;
}

// THE entry point. `candidate` is a planner candidate; `platform` is a
// distribution platform id (e.g. "instagram_reel", "x_post").
// Returns:
//   { experiment_id, variant_id, hook_variant, cta_variant, hypothesis,
//     dimension, experiment_ineligible_reason }
// experiment_id / variant_id are null when no experiment applies - the
// hook + cta then fall back to the deterministic defaults.
export function assignExperimentForPlacement(candidate = {}, platform) {
  const family = candidate.family ?? null;
  const facts = factsFromCandidate(candidate);
  const destinationKind = destinationKindForFamily(family);
  const contentId = candidate.content_id ?? candidate.contentId ?? null;

  const defHook = defaultHookFor(family, facts);
  const defCta = defaultCtaFor(destinationKind);

  const primaryId = PRIMARY_EXPERIMENT_BY_FAMILY[family] ?? null;
  const exp = primaryId ? findExperiment(primaryId) : null;

  if (!exp || contentId == null || !platform) {
    return {
      experiment_id: null,
      variant_id: null,
      hook_variant: defHook,
      cta_variant: defCta,
      hypothesis: null,
      dimension: null,
      experiment_ineligible_reason: !exp ? `no primary experiment for family ${family}` : "no content_id/platform",
    };
  }

  const applies = experimentApplies(exp, { family, facts, destinationKind });
  if (!applies.ok) {
    return {
      experiment_id: null,
      variant_id: null,
      hook_variant: defHook,
      cta_variant: defCta,
      hypothesis: null,
      dimension: exp.dimension,
      experiment_ineligible_reason: applies.reason,
    };
  }

  const variant_id = assignVariant(exp.experiment_id, { contentId, platform });
  const chosen = exp.variants[variant_id];

  // A HOOK experiment varies the hook and keeps the default CTA; a CTA
  // experiment varies the CTA and keeps the default hook. Only ONE
  // dimension changes per placement (§10, §22).
  return {
    experiment_id: exp.experiment_id,
    variant_id,
    hook_variant: chosen.hook_variant ?? defHook,
    cta_variant: chosen.cta_variant ?? defCta,
    hypothesis: exp.hypothesis,
    dimension: exp.dimension,
    experiment_ineligible_reason: null,
  };
}
