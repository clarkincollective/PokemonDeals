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
