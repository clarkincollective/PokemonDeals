// Phase 13D.4 - the single source of truth for the social system's rights
// state. Every generated payload carries an identical copy of this object
// (frozen, never mutated per-candidate) so there is zero ambiguity about
// what is and isn't cleared - matching docs/social-compliance-readiness.md
// (13D.1) and docs/ppt-social-rights-readiness.md (13D.3) exactly.
//
// This is a STATIC snapshot of the current approval state, not a live
// lookup - when PPT replies or EPN status changes, a human updates this
// file (a one-line, reviewable diff), not a runtime call.

export const RIGHTS_STATE = Object.freeze({
  // No card-image rights (eBay listing photos, PPT imagery, or otherwise)
  // are cleared for social use - see docs/social-compliance-readiness.md
  // SS7/SS9 and docs/social-creative-system.md SS9. Every preview this
  // system produces is Mode B (no card image) until this changes.
  card_image: "NOT_CLEARED",
  // PokemonPriceTracker social/data-rights request sent (13D.3), reply
  // not yet received. Until APPROVED, no PPT-derived history/movement/
  // grade-comparison content may be produced - see lib/social/eligibility.mjs.
  ppt_social_data: "WAITING",
  // Sending eBay-derived data to a GenAI provider requires EPN's prior
  // written approval (docs/social-compliance-readiness.md SS1); not
  // requested, not applicable to this deterministic-template system
  // regardless.
  ebay_genai: "NOT_ALLOWED",
  // This entire system is a local preview tool. There is no code path in
  // this package that can publish anywhere - see lib/social/render.mjs's
  // own comment and tests/scanner/social-no-publishing.test.mjs.
  publishing: "DISABLED",
});

// A frozen, human-readable one-line reason per state, reused by the CLI's
// review summary output so a reviewer never has to go read this source
// file to understand what a status code means.
export const RIGHTS_STATE_REASON = Object.freeze({
  card_image: "eBay/PPT image rights not yet confirmed - Mode B (no card image) only",
  ppt_social_data: "PokemonPriceTracker social-use request sent 2026-09; awaiting written reply",
  ebay_genai: "Requires eBay Partner Network AI Tools approval - not requested",
  publishing: "This is a local preview tool - no social API/publish path exists",
});
