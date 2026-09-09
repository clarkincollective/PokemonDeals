// Phase SOCIAL-CREATIVE-4A - EXPLICIT FAILURE STATES (§35).
//
// Every stage of the editorial -> creative-director -> render pipeline
// resolves to exactly ONE of these strings, or BUFFER_READY. There is NO
// silent downgrade: a story that cannot be produced at the quality bar
// stops with a named state and a reason, and that pair is persisted.
//
// Pure data. No I/O.

export const FAILURE_STATES = Object.freeze([
  // editorial gate - the premise is not worth publishing
  "EDITORIAL_WITHHOLD",
  // creative director rejected the planned brief / layout
  "CREATIVE_BRIEF_REJECT",
  // an AI step changed a value that FACT_LOCK froze
  "AI_FACT_MUTATION",
  // an AI-generated background failed the safety / artifact scan
  "AI_BACKGROUND_REJECT",
  // no card-forward layout can render this series/platform
  "CARD_FORWARD_RENDER_UNAVAILABLE",
  // real data is present but too thin to carry a premium visual
  "VISUALLY_UNDERPOWERED_DATA",
  // the caption layer could not produce a factual, on-contract caption
  "CAPTION_WITHHELD",
  // deterministic / Layer-5 QA held the artifact (soft)
  "QA_WATCH",
  // deterministic / Layer-5 QA failed the artifact (hard)
  "QA_FAIL",
  // --- SOCIAL-CREATIVE-5: FULL_GENERATIVE_SOCIAL (§27) ---
  // the image model could not produce a design at all
  "GENERATION_FAILED",
  // the generated post distorts / changes the real card
  "CARD_FIDELITY_FAIL",
  // the generated post shows a wrong / invented price, %, count or claim
  "FACT_VERIFY_FAIL",
  // the generated readable text is wrong / garbled beyond safe repair
  "TEXT_VERIFY_FAIL",
  // the generated post is factually clean but not at the quality bar (soft)
  "VISUAL_QUALITY_HOLD",
  // a small text/CTA/branding slip a deterministic footer patch could fix
  "SAFE_REPAIR_REQUIRED",
  // --- SOCIAL-CREATIVE-5A: SEMANTIC FACT AUDITOR (§1, §9, §10, §11, §13) ---
  // a claim is directionally / logically wrong (e.g. "premium" when ask < market)
  "SEMANTIC_FACT_FAIL",
  // a stat's subject / population scope is wrong (example card != population)
  "CLAIM_SCOPE_FAIL",
  // two statements in the post contradict each other or the data
  "SEMANTIC_CONTRADICTION_FAIL",
  // a printing comparison cannot prove two genuinely distinct printings
  "PRINTING_IDENTITY_FAIL",
  // the generated post duplicated one card of a pair (both sides A or both B)
  "CARD_PAIR_FIDELITY_FAIL",
  // the generated post drew a Poke Ball-like / official-looking brand mark
  "GENERATED_BRAND_RISK",
  // --- SOCIAL-CREATIVE-5A.1 - FACT-SOURCE + BRAND-SAFE-ZONE HARDENING ---
  // the reserved top brand strip has meaningful generated content in it
  "BRAND_SAFE_ZONE_OCCUPIED",
  // a card attribute is shown that is not in the canonical record
  "UNSUPPORTED_CARD_METADATA_FAIL",
  // a shown card attribute conflicts with the canonical value
  "CARD_METADATA_CONTRADICTION_FAIL",
  // a chart value / bucket is shown that was not deterministically supplied
  "UNSUPPORTED_CHART_VALUE_FAIL",
  // a shown chart value disagrees with the supplied value
  "CHART_VALUE_MISMATCH",
  // a chart's scope / population / labels are wrong
  "CHART_SCOPE_FAIL",
  // an invented source / methodology statement ("eBay Sold Listings", ...)
  "UNSUPPORTED_SOURCE_CLAIM_FAIL",
  // an invented timeframe ("last 60 days", "this week", a date range)
  "UNSUPPORTED_TIMEFRAME_FAIL",
  // --- SOCIAL-CREATIVE-5B - FACT-LOCKED PLATFORM CAPTION DIRECTOR ---
  // the caption is (or resembles) a raw series / enum label ("EXACT PRINTING MATTERS")
  "RAW_SERIES_CAPTION_FAIL",
  // the caption states a price / % / count / claim not in the source of truth
  "CAPTION_FACT_FAIL",
  // the caption scopes a population stat to the example card / species
  "CAPTION_SCOPE_FAIL",
  // the caption contradicts the semantic manifest (direction word, lesson, ...)
  "CAPTION_SEMANTIC_FAIL",
  // the caption asserts a value that contradicts the approved image / story
  "IMAGE_CAPTION_CONTRADICTION_FAIL",
  // the caption uses financial / investment framing
  "INVESTMENT_LANGUAGE_FAIL",
  // the caption manufactures urgency the story does not support
  "FAKE_URGENCY_FAIL",
  // the caption asserts scarcity with no deterministic evidence
  "UNSUPPORTED_SCARCITY_FAIL",
  // the caption's call to action sends social traffic straight to eBay
  "EBAY_FIRST_CAPTION_FAIL",
  // caption generation produced nothing usable - NO raw-name fallback (§23)
  "CAPTION_GENERATION_HOLD",
  // caption is factual + on-contract but weak / generic (soft hold, §22)
  "CAPTION_QUALITY_HOLD",
  // --- SOCIAL-CREATIVE-4C - MOTION-NATIVE SHORT-FORM VIDEO ENGINE ---
  // a video frame states a wrong direction / scope / stat / metadata / lesson
  "VIDEO_SEMANTIC_FAIL",
  // a fact on screen cannot be traced to deterministic data
  "VIDEO_FACT_FAIL",
  // the video depicts a distorted / AI-redrawn / duplicated card
  "VIDEO_CARD_FIDELITY_FAIL",
  // a critical element sits outside the TikTok / Shorts safe rectangle
  "VIDEO_SAFE_ZONE_FAIL",
  // the cut feels like a slideshow / static poster / long dead hold (soft)
  "VIDEO_PACING_HOLD",
  // factually clean + well paced but below the motion-quality bar (soft)
  "VIDEO_MOTION_QUALITY_HOLD",
  // the render pipeline produced no playable MP4
  "VIDEO_RENDER_FAILED",
  // no verified caption_handoff to attach the video to
  "VIDEO_CAPTION_LINK_MISSING",
  // --- SOCIAL-CREATIVE-4C.1 - GENERATIVE VIDEO ART DIRECTION (§17) ---
  // a generated scene board is a sparse animated-template layout
  "SPARSE_TEMPLATE_FAIL",
  // a generated scene board is just a centred card on an empty ground
  "CENTERED_CARD_ONLY_FAIL",
  // a generated scene board wastes most of the frame on empty space
  "EXCESS_EMPTY_SPACE_FAIL",
  // a generated scene board reads as generic motion-graphics / SaaS / HUD
  "GENERIC_MOTION_GRAPHICS_FAIL",
  // a generated scene board does not match the FULL_GENERATIVE_SOCIAL style
  "VISUAL_STYLE_MISMATCH_FAIL",
  // the image model produced no usable scene board set
  "SCENE_BOARD_GENERATION_FAILED",
  // --- SOCIAL-CREATIVE-4C.2 - ONE-MASTER LAYERED MOTION SYSTEM ---
  // a displayed derived integer % does not EXACTLY match the declared value (§19)
  "VIDEO_DERIVED_VALUE_EXACT_FAIL",
  // the cut reads as a cheap edit / animated infographic, not premium brand content
  "CHEAP_EDIT_FAIL",
  // the master is only crossfaded / held - no localized reveal or build
  "POSTER_DRIFT_FAIL",
  // the first ~350ms is empty / logo-only / a dead black frame
  "DEAD_OPENING_FAIL",
  // the hook does not carry a memorable fact / figure fast enough
  "WEAK_HOOK_FAIL",
  // every beat is a whole-image zoom / pan
  "WHOLE_POSTER_MOTION_FAIL",
  // a non-final beat holds static far too long
  "EXCESSIVE_STATIC_HOLD_FAIL",
  // the CTA is a giant banner-ad treatment dominating the frame
  "CTA_BANNER_AD_FAIL",
  // motion has no hierarchy - nothing is emphasised in order
  "LOW_MOTION_HIERARCHY_FAIL",
  // no approved master creative and none could be produced
  "MASTER_CREATIVE_UNAVAILABLE",
  // --- SOCIAL-CREATIVE-4C.3 - 5-SECOND PREMIUM LOOP ENGINE ---
  // the loop pans / frames different regions instead of keeping the whole
  // creative visible (§16)
  "CAMERA_TOUR_FAIL",
  // the visual state at 0.0s and 5.0s differ enough that replay jumps (§27)
  "LOOP_SEAM_FAIL",
  // the motion would not look right coming from a serious collectibles
  // brand - amateur / app-template / over-animated / less trustworthy
  // than the static master (§17)
  "BRAND_TRUST_HOLD",
  // the loop redraws / duplicates text the master already renders (§15)
  "DUPLICATE_TEXT_FAIL",
  // the master is not owner-approved / fact-clean - it may not enter the
  // loop engine (§18)
  "MASTER_NOT_APPROVED",
  // --- SOCIAL-CREATIVE-4C.4 - PROFESSIONAL 8-10s SOCIAL VIDEO + UNIVERSAL CTA ---
  // a viewer cannot tell what the post is about in the first ~1.5s without
  // reading the caption (§4)
  "CONTENT_PURPOSE_UNCLEAR_FAIL",
  // an essential word / number sits partially outside the visible frame (§10)
  "TEXT_CUTOFF_FAIL",
  // a real card's important edges are cropped by the vertical frame (§10)
  "CARD_CROP_FAIL",
  // the CTA / domain is clipped at an edge (§10)
  "CTA_CUTOFF_FAIL",
  // half of a section is shown with the remainder cut off (§11)
  "PARTIAL_PANEL_FAIL",
  // a footer / why-this-matters panel is truncated (§10, §11)
  "FOOTER_TRUNCATION_FAIL",
  // important content sits under the TikTok / Shorts / Reels chrome (§12)
  "SAFE_ZONE_VIOLATION_FAIL",
  // a viewer would have to pause / zoom to read on-screen text (§13)
  "MOBILE_TEXT_TOO_SMALL_FAIL",
  // the motion reads as a static JPEG exported to MP4 - nothing perceivable (§17)
  "MOTION_TOO_SUBTLE_FAIL",
  // the motion is louder than the content - gimmicky / distracting (§17)
  "MOTION_TOO_AGGRESSIVE_FAIL",
  // a Pokemon card shown is AI-generated / redrawn, not a canonical asset (§19)
  "AI_GENERATED_CARD_FAIL",
  // the video's call to action sends social traffic straight to eBay (§38)
  "VIDEO_EBAY_FIRST_CTA_FAIL",
  // the end screen alone does not convey what PokemonDealFinder does + where
  // to go (§39)
  "CTA_PURPOSE_UNCLEAR_FAIL",
  // the video is cheap / clipped / AI-looking / confusing / makes the
  // premium static master look worse (§40, §41)
  "PROFESSIONAL_BRAND_FAIL",
  // --- SOCIAL-CREATIVE-4C.5 - PREMIUM TRUST-FIRST POLISH + 2.5-3.0s CTA ---
  // the CTA end screen is held for less than 2.4s - it flashes and is not a
  // conversion moment (§4, §28)
  "CTA_TOO_SHORT_FAIL",
  // the CTA / URL / brand would need a pause to read (§5)
  "CTA_READABILITY_FAIL",
  // a large zone reads as unfinished empty black, not intentional negative
  // space with atmosphere (§6)
  "DEAD_BLACK_SPACE_FAIL",
  // meaningful content occupies too little of the central safe region - the
  // frame looks low-effort (§29, §30)
  "FRAME_DENSITY_TOO_LOW_FAIL",
  // the frame is over-crowded - hierarchy is lost (§30)
  "FRAME_DENSITY_TOO_HIGH_FAIL",
  // at ~360x640 the headline / key number / card / URL cannot be read (§32)
  "MOBILE_PREVIEW_FAIL",
  // CTA -> hook replay produces a blackout / flash (§34)
  "REPLAY_TRANSITION_FAIL",
  // --- SOCIAL-CREATIVE-4C.6 - STATIC-MASTER PARITY + STRONGER COMPOSITION ---
  // the video adaptation materially reduces the approved static master's
  // perceived quality / authority / hierarchy / collector appeal (§1, §27)
  "STATIC_MASTER_PARITY_FAIL",
  // the subject feels too small / too much inactive space / no visual
  // weight (§4, §5, §28)
  "UNDERCOMPOSED_FRAME_FAIL",
  // at ~360x640 a viewer cannot instantly read the family's key elements
  // (§29)
  "MOBILE_HIERARCHY_FAIL",
  // --- SOCIAL-CREATIVE-4C.7 - FINAL VISUAL PARITY PASS ---
  // meaningful composition fills less than ~75% of the practical safe
  // vertical region - the frame reads as an infographic slide (§3, §13A)
  "CONTENT_OCCUPANCY_FAIL",
  // the real Pokemon card collapses to a thumbnail / icon instead of a
  // hero (§4, §5, §13B)
  "CARD_PROMINENCE_FAIL",
  // the lower third before the CTA is mostly empty black (§3, §13C)
  "LOWER_DEAD_SPACE_FAIL",
  // the CTA visually resembles a fade-to-black state - dim cards / grey
  // headline / low-contrast URL (§9, §13D)
  "CTA_LUMINANCE_FAIL",
  // --- SOCIAL-AUTOPILOT-1 - daily story engine / snapshot / buffer ---
  // a downstream artifact (creative / caption / video) used a fact value
  // that does not match the frozen SocialStorySnapshot for this story (§1)
  "STORY_SNAPSHOT_DRIFT_FAIL",
  // a live-deal story's underlying listing/price has moved enough since
  // the snapshot was frozen that publishing it would be untruthful (§14)
  "STALE_STORY_FAIL",
  // the live listing this story was built on no longer exists (§14)
  "LISTING_GONE_FAIL",
  // the live price moved by more than the tolerance since the snapshot (§14)
  "PRICE_CHANGED_MATERIALLY_FAIL",
  // a Buffer placement with this exact dedupe key already exists - a rerun
  // must never duplicate a queued/published post (§12)
  "DUPLICATE_PLACEMENT_FAIL",
  // this story does not meet the platform's own eligibility rule (§11)
  "PLATFORM_NOT_ELIGIBLE_FAIL",
  // the configured daily/monthly image-generation budget is exhausted -
  // WITHHOLD rather than generate a cheaper/fake asset (§8)
  "BUDGET_EXCEEDED_HOLD",
  // the strongest available candidate still falls below the editorial
  // quality floor - "no good story = no post", never filler (§5)
  "WEAK_CANDIDATE_FAIL",
  // the candidate repeats a recent card/Pokemon/family/hook/CTA pattern
  // closely enough that the content calendar rejects it for diversity (§3)
  "DIVERSITY_REPETITION_FAIL",
  // --- SOCIAL-AUTOPILOT-2 - controlled Buffer activation ---
  // a caption/creative/video artifact's own hash no longer matches the
  // hash recorded on the placement being submitted - the package this
  // placement was built from and the one about to be submitted have
  // drifted apart; never submit, always rebuild (§10)
  "PLACEMENT_PACKAGE_DRIFT_FAIL",
]);

// The one success terminal.
export const READY_STATE = "BUFFER_READY";

// States that permanently end this story-opportunity for this run (an
// operator / a later data change can revisit; the pipeline will not retry
// on its own).
export const TERMINAL_WITHHOLD_STATES = Object.freeze([
  "EDITORIAL_WITHHOLD",
  "CREATIVE_BRIEF_REJECT",
  "AI_FACT_MUTATION",
  "CARD_FORWARD_RENDER_UNAVAILABLE",
  "VISUALLY_UNDERPOWERED_DATA",
  "CAPTION_WITHHELD",
  "QA_FAIL",
  "GENERATION_FAILED",
  "CARD_FIDELITY_FAIL",
  "FACT_VERIFY_FAIL",
  "TEXT_VERIFY_FAIL",
  "SEMANTIC_FACT_FAIL",
  "CLAIM_SCOPE_FAIL",
  "SEMANTIC_CONTRADICTION_FAIL",
  "PRINTING_IDENTITY_FAIL",
  "CARD_PAIR_FIDELITY_FAIL",
  "UNSUPPORTED_CARD_METADATA_FAIL",
  "CARD_METADATA_CONTRADICTION_FAIL",
  "UNSUPPORTED_CHART_VALUE_FAIL",
  "CHART_VALUE_MISMATCH",
  "CHART_SCOPE_FAIL",
  "UNSUPPORTED_SOURCE_CLAIM_FAIL",
  "UNSUPPORTED_TIMEFRAME_FAIL",
  // 5B - a caption that cannot be produced factually / on-contract
  "RAW_SERIES_CAPTION_FAIL",
  "CAPTION_FACT_FAIL",
  "CAPTION_SCOPE_FAIL",
  "CAPTION_SEMANTIC_FAIL",
  "IMAGE_CAPTION_CONTRADICTION_FAIL",
  "INVESTMENT_LANGUAGE_FAIL",
  "FAKE_URGENCY_FAIL",
  "UNSUPPORTED_SCARCITY_FAIL",
  "EBAY_FIRST_CAPTION_FAIL",
  "CAPTION_GENERATION_HOLD",
  // 4C - a video that cannot be produced factually / on-contract / on-format
  "VIDEO_SEMANTIC_FAIL",
  "VIDEO_FACT_FAIL",
  "VIDEO_CARD_FIDELITY_FAIL",
  "VIDEO_SAFE_ZONE_FAIL",
  "VIDEO_RENDER_FAILED",
  "VIDEO_CAPTION_LINK_MISSING",
  // 4C.1 - a generated scene board that fails the visual-quality bar
  "SPARSE_TEMPLATE_FAIL",
  "CENTERED_CARD_ONLY_FAIL",
  "EXCESS_EMPTY_SPACE_FAIL",
  "GENERIC_MOTION_GRAPHICS_FAIL",
  "VISUAL_STYLE_MISMATCH_FAIL",
  "SCENE_BOARD_GENERATION_FAILED",
  // 4C.2 - master-layered-motion faults
  "VIDEO_DERIVED_VALUE_EXACT_FAIL",
  "CHEAP_EDIT_FAIL",
  "POSTER_DRIFT_FAIL",
  "DEAD_OPENING_FAIL",
  "WEAK_HOOK_FAIL",
  "WHOLE_POSTER_MOTION_FAIL",
  "EXCESSIVE_STATIC_HOLD_FAIL",
  "CTA_BANNER_AD_FAIL",
  "LOW_MOTION_HIERARCHY_FAIL",
  "MASTER_CREATIVE_UNAVAILABLE",
  // 4C.3 - 5-second premium loop faults
  "CAMERA_TOUR_FAIL",
  "LOOP_SEAM_FAIL",
  "DUPLICATE_TEXT_FAIL",
  "MASTER_NOT_APPROVED",
  // 4C.4 - professional social video: a cutoff / crop / safe-zone / real-card
  // / eBay-first fault cannot be produced around
  "TEXT_CUTOFF_FAIL",
  "CARD_CROP_FAIL",
  "CTA_CUTOFF_FAIL",
  "PARTIAL_PANEL_FAIL",
  "FOOTER_TRUNCATION_FAIL",
  "SAFE_ZONE_VIOLATION_FAIL",
  "MOBILE_TEXT_TOO_SMALL_FAIL",
  "AI_GENERATED_CARD_FAIL",
  "VIDEO_EBAY_FIRST_CTA_FAIL",
  // 4C.5 - a CTA that flashes or is unreadable cannot ship
  "CTA_TOO_SHORT_FAIL",
  "CTA_READABILITY_FAIL",
  "MOBILE_PREVIEW_FAIL",
  // 4C.6 - a video that does not reach static-master parity / is
  // under-composed / loses its hierarchy on a phone cannot ship
  "STATIC_MASTER_PARITY_FAIL",
  "UNDERCOMPOSED_FRAME_FAIL",
  "MOBILE_HIERARCHY_FAIL",
  // 4C.7 - an under-filled frame / a thumbnail card / a dead lower third /
  // a fade-out CTA cannot ship
  "CONTENT_OCCUPANCY_FAIL",
  "CARD_PROMINENCE_FAIL",
  "LOWER_DEAD_SPACE_FAIL",
  "CTA_LUMINANCE_FAIL",
  // SOCIAL-AUTOPILOT-1 - all terminal for this run; a fresh story package
  // must be built from a new snapshot, the frozen one is never patched
  "STORY_SNAPSHOT_DRIFT_FAIL",
  "STALE_STORY_FAIL",
  "LISTING_GONE_FAIL",
  "PRICE_CHANGED_MATERIALLY_FAIL",
  "DUPLICATE_PLACEMENT_FAIL",
  "PLATFORM_NOT_ELIGIBLE_FAIL",
  "BUDGET_EXCEEDED_HOLD",
  "WEAK_CANDIDATE_FAIL",
  "DIVERSITY_REPETITION_FAIL",
  "PLACEMENT_PACKAGE_DRIFT_FAIL",
]);

// States that permit exactly ONE bounded revision (see §18) before they
// become HELD.
export const REVISABLE_STATES = Object.freeze([
  "QA_WATCH", "AI_BACKGROUND_REJECT", "CREATIVE_BRIEF_REJECT", "SAFE_REPAIR_REQUIRED", "VISUAL_QUALITY_HOLD",
  // 5B - one bounded caption regeneration (candidate 2)
  "RAW_SERIES_CAPTION_FAIL", "CAPTION_FACT_FAIL", "CAPTION_SCOPE_FAIL", "CAPTION_SEMANTIC_FAIL",
  "IMAGE_CAPTION_CONTRADICTION_FAIL", "INVESTMENT_LANGUAGE_FAIL", "FAKE_URGENCY_FAIL",
  "UNSUPPORTED_SCARCITY_FAIL", "EBAY_FIRST_CAPTION_FAIL", "CAPTION_QUALITY_HOLD",
  // 4C - soft video holds get one bounded re-plan
  "VIDEO_PACING_HOLD", "VIDEO_MOTION_QUALITY_HOLD",
  // 4C.1 - one bounded regeneration of a failing scene board
  "SPARSE_TEMPLATE_FAIL", "CENTERED_CARD_ONLY_FAIL", "EXCESS_EMPTY_SPACE_FAIL",
  "GENERIC_MOTION_GRAPHICS_FAIL", "VISUAL_STYLE_MISMATCH_FAIL",
  // 4C.2 - one bounded re-choreography for a soft motion fault
  "CHEAP_EDIT_FAIL", "POSTER_DRIFT_FAIL", "DEAD_OPENING_FAIL", "WEAK_HOOK_FAIL",
  "WHOLE_POSTER_MOTION_FAIL", "EXCESSIVE_STATIC_HOLD_FAIL", "CTA_BANNER_AD_FAIL",
  "LOW_MOTION_HIERARCHY_FAIL",
  // 4C.3 - one bounded re-plan for a soft loop fault
  "CAMERA_TOUR_FAIL", "LOOP_SEAM_FAIL", "BRAND_TRUST_HOLD", "DUPLICATE_TEXT_FAIL",
  // 4C.4 - one bounded re-plan / re-simplify for a soft professional-video fault
  "CONTENT_PURPOSE_UNCLEAR_FAIL", "MOTION_TOO_SUBTLE_FAIL", "MOTION_TOO_AGGRESSIVE_FAIL",
  "CTA_PURPOSE_UNCLEAR_FAIL", "PROFESSIONAL_BRAND_FAIL",
  // 4C.5 - one bounded re-plan for a premium-polish fault
  "CTA_TOO_SHORT_FAIL", "CTA_READABILITY_FAIL", "DEAD_BLACK_SPACE_FAIL",
  "FRAME_DENSITY_TOO_LOW_FAIL", "FRAME_DENSITY_TOO_HIGH_FAIL", "MOBILE_PREVIEW_FAIL",
  "REPLAY_TRANSITION_FAIL",
  // 4C.6 - one bounded re-plan for a composition-parity fault
  "STATIC_MASTER_PARITY_FAIL", "UNDERCOMPOSED_FRAME_FAIL", "MOBILE_HIERARCHY_FAIL",
  // 4C.7 - one bounded re-plan for a final-parity fault
  "CONTENT_OCCUPANCY_FAIL", "CARD_PROMINENCE_FAIL", "LOWER_DEAD_SPACE_FAIL", "CTA_LUMINANCE_FAIL",
  // 5A - one bounded regeneration is allowed for a semantic slip / brand risk
  "SEMANTIC_FACT_FAIL", "CLAIM_SCOPE_FAIL", "SEMANTIC_CONTRADICTION_FAIL", "GENERATED_BRAND_RISK", "CARD_PAIR_FIDELITY_FAIL",
  // 5A.1 - one bounded regeneration for a brand-zone / invented-data slip
  "BRAND_SAFE_ZONE_OCCUPIED", "UNSUPPORTED_CARD_METADATA_FAIL", "CARD_METADATA_CONTRADICTION_FAIL",
  "UNSUPPORTED_CHART_VALUE_FAIL", "CHART_VALUE_MISMATCH", "CHART_SCOPE_FAIL",
  "UNSUPPORTED_SOURCE_CLAIM_FAIL", "UNSUPPORTED_TIMEFRAME_FAIL",
]);

export function isFailureState(s) {
  return FAILURE_STATES.includes(String(s || ""));
}

export function isTerminalWithhold(s) {
  return TERMINAL_WITHHOLD_STATES.includes(String(s || ""));
}

// Build the { state, reason, at, stage } record the pipeline persists.
// `reason` is required - a bare state is never enough to explain a hold.
export function failure(state, reason, { stage = null, detail = null, now = Date.now() } = {}) {
  if (!isFailureState(state)) throw new Error(`failureStates: "${state}" is not a declared failure state`);
  if (!reason || typeof reason !== "string") throw new Error(`failureStates: ${state} needs a human reason string`);
  return Object.freeze({ ok: false, state, reason, stage, detail, at: new Date(now).toISOString() });
}

export function ready({ stage = null, now = Date.now() } = {}) {
  return Object.freeze({ ok: true, state: READY_STATE, stage, at: new Date(now).toISOString() });
}

// SILENT DOWNGRADE is forbidden: a helper that turns "I could not do the
// premium thing" into a lesser thing MUST route through failure().
export const SILENT_DOWNGRADE_FORBIDDEN = true;
