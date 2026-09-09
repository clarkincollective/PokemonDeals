// Phase SOCIAL-ANALYTICS-1 §17/§18 - WEBSITE CLICK / CONVERSION HANDOFF
// (FUTURE-READY DESIGN ONLY - NOT DEPLOYED).
//
// SOCIAL -> PokemonDealFinder -> eBay -> affiliate action/revenue. This
// module produces the deterministic campaign identifiers a FUTURE phase
// could attach to a NEW story's outbound link - it changes nothing about
// the two current live pilot posts' URLs, and does not deploy any URL
// change this phase. Aggregate/campaign-level only - never user-level
// tracking.

/**
 * conversionHandoff(placement, discoveryFields) -> the future-ready
 * campaign identifier set + a join key for eBay affiliate aggregate data,
 * where such aggregate data already exists in this codebase.
 */
export function conversionHandoff(placement, discoveryFields = {}) {
  return {
    story_id: placement?.story_id ?? null,
    platform: placement?.platform ?? null,
    placement_id: placement?.placement_id ?? null,
    proposed_utm: {
      utm_source: placement?.platform ?? null,
      utm_medium: "social",
      utm_campaign: discoveryFields?.family ?? null,
      utm_content: placement?.story_id ?? null,
    },
    deployed: false,
    note: "Design only - no live pilot URL has been changed. A future story's outbound CTA link could carry these params if/when an owner activates it; existing PokemonDealFinder EPN affiliate URLs stay byte-unchanged per the existing EPN account review (see memory: 13E.5 distribution).",
    affiliate_join_key: placement?.story_id ?? null, // the field a future join against aggregate eBay/EPN reporting would use
  };
}

/** conversionHandoffForMany(placements) -> one handoff record per placement. */
export function conversionHandoffForMany(placements) {
  return placements.map((p) => conversionHandoff(p, p?.caption_style?.discovery ?? {}));
}
