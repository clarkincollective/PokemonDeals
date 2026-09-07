// Phase SOCIAL-NEWSROOM-1 - editorial newsroom barrel.
//
// Deterministic editorial layer on TOP of the existing lib/social system.
// It introduces NO second planner / ledger / Buffer client / QA engine /
// renderer / source-of-truth: every module here composes the existing
// primitives (planner cadence ceilings, creativeQa, experiments score,
// diversity/cooldown, distribution ledger, hosted assets, Buffer adapter).
//
// Nothing in this tree writes to Supabase, calls eBay, renders pixels, or
// contacts Buffer.

export * from "./pillars.mjs";
export * from "./clocks.mjs";
export * from "./series.mjs";
export * from "./story.mjs";
export * from "./placements.mjs";
export * from "./organicScore.mjs";
export * from "./conversionProxy.mjs";
export * from "./originalityScore.mjs";
export * from "./ctaIntensity.mjs";
export * from "./captionSimilarity.mjs";
export * from "./sequenceGate.mjs";
export * from "./backlogHealth.mjs";
export * from "./supportMatrix.mjs";
export * from "./fatigue.mjs";
export * from "./qaStack.mjs";
export * from "./calendar.mjs";
export * as visionReview from "./visionReview.mjs";
export * as newsroomDb from "./db.mjs";
