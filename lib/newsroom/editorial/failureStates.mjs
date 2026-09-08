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
]);

// States that permit exactly ONE bounded revision (see §18) before they
// become HELD.
export const REVISABLE_STATES = Object.freeze(["QA_WATCH", "AI_BACKGROUND_REJECT", "CREATIVE_BRIEF_REJECT", "SAFE_REPAIR_REQUIRED", "VISUAL_QUALITY_HOLD"]);

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
