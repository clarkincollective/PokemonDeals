// Phase SOCIAL-CREATIVE-5 - IMAGE-MODE SELECTION (§1, §25, §26).
//
// After four iterations (deterministic templates, 4B hybrid background,
// 4B.1 freeform primitives, 4B.2 generative canvas + overlay) the owner's
// conclusion: those are OVERENGINEERED and still miss the quality of a
// directly-generated OpenAI post. Phase 5 keeps exactly TWO production
// modes:
//
//   FULL_GENERATIVE_SOCIAL - the new primary path: the image model designs
//                            the COMPLETE post from the real cards + real
//                            facts, verified afterward like an auditor.
//   SAFE_FALLBACK          - the single best deterministic path (the 4B.1
//                            freeform renderer) - emergency use only.
//
// The four earlier image paths are DEPRECATED_IMAGE_PATH: kept for
// history, regression comparison and emergency fallback, never the
// preferred production path.
//
// Pure. No I/O.

export const PRODUCTION_IMAGE_MODES = Object.freeze(["FULL_GENERATIVE_SOCIAL", "SAFE_FALLBACK"]);

// The earlier modes - no longer offered by the production selector.
export const DEPRECATED_IMAGE_PATHS = Object.freeze({
  DETERMINISTIC_TEMPLATE: {
    module: "lib/social/newsroom/cardEditorialTemplates.mjs",
    status: "DEPRECATED_IMAGE_PATH",
    kept_for: ["historical artifacts", "SAFE_FALLBACK primitives are reused by the 4B.1 renderer"],
  },
  HYBRID_BACKGROUND: {
    module: "lib/newsroom/hybrid/aiBackground.mjs",
    status: "DEPRECATED_IMAGE_PATH",
    kept_for: ["regression comparison"],
  },
  AI_DIRECTED_COMPOSITION: {
    module: "lib/newsroom/hybrid/artDirector.mjs + freeformRenderer.mjs",
    status: "DEPRECATED_IMAGE_PATH",
    kept_for: ["regression comparison", "its deterministic fallback IS the SAFE_FALLBACK renderer"],
  },
  GENERATIVE_DESIGN_CANVAS: {
    module: "lib/newsroom/hybrid/{designCanvas,canvasReview,canvasCompositor}.mjs",
    status: "DEPRECATED_IMAGE_PATH",
    kept_for: ["regression comparison"],
  },
});

// Resolve the production image mode. Default is SAFE_FALLBACK until the
// owner accepts FULL_GENERATIVE_SOCIAL (§22).
export function resolveImageMode(env = process.env) {
  const raw = String(env.SOCIAL_IMAGE_MODE ?? "").toLowerCase();
  if (raw === "full_generative" || raw === "full_generative_social") return "FULL_GENERATIVE_SOCIAL";
  return "SAFE_FALLBACK";
}

export function isDeprecatedImagePath(mode) {
  return ["DETERMINISTIC_ONLY", "HYBRID_BACKGROUND", "AI_DIRECTED_COMPOSITION", "GENERATIVE_DESIGN_CANVAS"].includes(String(mode || ""));
}

// §27 - the phase-5 failure/terminal states.
export const FULLGEN_STATES = Object.freeze([
  "EDITORIAL_WITHHOLD",
  "GENERATION_FAILED",
  "CARD_FIDELITY_FAIL",
  "FACT_VERIFY_FAIL",
  "TEXT_VERIFY_FAIL",
  "VISUAL_QUALITY_HOLD",
  "SAFE_REPAIR_REQUIRED",
  "BUFFER_READY",
]);

export const IMAGE_MODE_VERSION = "5.1";
