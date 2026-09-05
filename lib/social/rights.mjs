// Phase 13D.4 / 13E.1 - the single source of truth for the social system's
// rights state. Every generated payload carries an identical copy of this
// object (frozen, never mutated per-candidate) so there is zero ambiguity
// about what is and isn't cleared - matching
// docs/social-compliance-readiness.md (13D.1),
// docs/ppt-social-rights-readiness.md (13D.3), and
// docs/social-daily-workflow.md (13E.1) exactly.
//
// This is a STATIC snapshot of the current approval state, not a live
// lookup - when a status changes, a human updates this file (a one-line,
// reviewable diff), not a runtime call. Only mark a capability cleared
// when the evidence actually supports it; capabilities are tracked
// SEPARATELY and are never toggled as a group.

export const RIGHTS_STATE = Object.freeze({
  // PokemonPriceTracker social/data-rights: the licensing/social-use
  // concern was CLEARED by the owner (Phase 13E.1, 2026-09-06). This
  // permits DERIVED, EDITORIAL market content built from PPT-referenced
  // figures (the same market_price reference already shown on-site) -
  // NOT raw bulk provider data, proprietary dataset dumps, undocumented
  // fields, or excessive reconstruction of the PPT dataset. See
  // docs/social-daily-workflow.md SS7.
  ppt_social_data: "CLEARED",
  // No card-image rights are cleared for social use. This is a DISTINCT
  // question from the PPT DATA clearance above and from the eBay
  // affiliate quality review - neither of those grants image rights.
  // Every creative this system produces is Mode B (no card image).
  card_image: "NOT_CLEARED",
  // eBay seller listing photos specifically: not cleared for compositing
  // into a branded social graphic - the "visually isolated from non-eBay
  // content" clause (docs/social-compliance-readiness.md SS1 #10) is
  // unresolved with EPN. Tracked separately from card_image so a future
  // partial clearance can't accidentally imply the other.
  ebay_seller_images: "NOT_CLEARED",
  // Sending eBay-derived data to a GenAI provider requires EPN's prior
  // written approval (EPN "AI Tools" special-business-model form). Per
  // docs/social-compliance-readiness.md SS2 and
  // docs/ppt-social-rights-readiness.md's closing note, NO form has been
  // filed and NO approval has been granted. This whole system is
  // deterministic (fixed template fragments + numbers off verified
  // rows), so this gate never blocks daily production - it only blocks
  // hypothetical workflows that would pass eBay data to an LLM/image
  // model, which this system has no code path for.
  ebay_genai: "NOT_ALLOWED",
  // There is no code path in this package that can publish anywhere -
  // see lib/social/render.mjs's own comment and
  // tests/scanner/social-*.test.mjs. Daily production builds a local
  // review queue only; a human publishes selected content manually.
  publishing: "DISABLED",
});

// A frozen, human-readable one-line reason per state, reused by the CLI's
// review summary output so a reviewer never has to go read this source
// file to understand what a status code means.
export const RIGHTS_STATE_REASON = Object.freeze({
  ppt_social_data: "PokemonPriceTracker social/data use cleared by owner (Phase 13E.1, 2026-09-06) - derived editorial content only",
  card_image: "Card-image rights not confirmed - Mode B (no card image) only; distinct from the PPT data clearance",
  ebay_seller_images: "eBay listing photos not cleared for branded compositing - unresolved EPN 'visually isolated' clause",
  ebay_genai: "No EPN AI Tools approval filed or granted - blocks GenAI-eBay workflows only, not deterministic production",
  publishing: "This is a local review-queue tool - no social API/publish path exists; a human publishes manually",
});
