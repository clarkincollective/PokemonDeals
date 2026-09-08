// Phase SOCIAL-CREATIVE-4A - editorial layer barrel + the one convenience
// entry point the render pipeline calls.
//
// PIPELINE POSITION (§1):
//   REAL STORY DATA
//   -> STORY RELEVANCE GATE          (assessStoryRelevance)
//   -> CREATIVE BRIEF                 (buildCreativeBrief)
//   -> [4B] AI CREATIVE DIRECTOR      (refine brief; FACT_LOCK enforced)
//   -> [4B] HYBRID VISUAL GENERATION
//   -> DETERMINISTIC FACT OVERLAY
//   -> QA -> LAYER-5 -> BUFFER_READY
//
// 4A ships everything up to and including the CREATIVE BRIEF, plus the
// FACT_LOCK the AI step in 4B must not violate. No OpenAI call here.

export { FAILURE_STATES, READY_STATE, failure, ready, isFailureState, isTerminalWithhold } from "./failureStates.mjs";
export { FACT_LOCK_FIELDS, buildFactLock, factLockHash, detectFactMutation } from "./factLock.mjs";
export { STORY_CONTRACTS, STORY_CONTRACT_IDS, contractFor, contractIdForSeries, isCommercial } from "./storyContracts.mjs";
export { printingComparisonRelevance, printingPairRelevanceFromRows, baseCardName, PRINTING_RELEVANCE_VERSION } from "./printingRelevance.mjs";
export {
  CREATIVE_BRIEF_VERSION, LAYOUT_VERSION, BRIEF_SCHEMA, BRIEF_FIELDS, FACTUAL_BRIEF_FIELDS,
  buildCreativeBrief, validateCreativeBrief, briefStructureKey, CREATIVE_VERSION_FIELDS, buildVersionStamp,
} from "./creativeBrief.mjs";
export { TASTE_DIMENSIONS, TASTE_VERDICTS, FIVE_SECOND_QUESTIONS, scoreTaste, fiveSecondTest } from "./tasteGate.mjs";
export {
  RELEVANCE_DIMENSIONS, RELEVANCE_MIN, assessStoryRelevance, RELEVANCE_GATE_VERSION,
} from "./relevanceGate.mjs";
export {
  FINGERPRINT_FACETS, FACET_CEILINGS, visualFingerprint, repetitionCheck,
} from "./visualFingerprint.mjs";
export {
  BRAND_PALETTE, BRAND_VOICE, ANTI_PATTERNS, TYPE_ROLES, TYPE_ROLE_NAMES, MIN_DATA_LABEL_PX,
  COMPOSITION_CONTRACTS, COMPOSITION_FAMILIES, validateComposition, BRAND_SYSTEM_VERSION,
} from "./brandSystem.mjs";
export * as editorialPersist from "./persistence.mjs";

import { assessStoryRelevance } from "./relevanceGate.mjs";
import { buildFactLock, factLockHash } from "./factLock.mjs";
import { contractFor } from "./storyContracts.mjs";
import { buildCreativeBrief, validateCreativeBrief, buildVersionStamp } from "./creativeBrief.mjs";
import { failure } from "./failureStates.mjs";

// Run the whole deterministic editorial gate for one (story, platform).
// Returns either:
//   { ok:false, state:"EDITORIAL_WITHHOLD"|..., reason, relevance }
// or:
//   { ok:true, brief, factLock, factLockHash, versionStamp, relevance, contract }
//
// It performs NO I/O. Persistence is the caller's choice (editorialPersist.*).
export function runEditorialGate({ story, platform = "instagram", printingPair = null, originality = null } = {}) {
  const series = String(story?.series ?? story?.story_type ?? "").toUpperCase();
  const contract = contractFor(series);
  if (!contract) {
    return { ...failure("EDITORIAL_WITHHOLD", `no story contract for "${series || "(unknown)"}"`, { stage: "editorial_gate" }), relevance: null };
  }

  const factLock = buildFactLock(story?.facts_json ? story : { facts_json: story?.facts_json ?? story });

  const relevance = assessStoryRelevance({ story, platform, printingPair, originality });
  if (relevance.verdict !== "PUBLISHABLE") {
    return {
      ok: false,
      state: relevance.state ?? "EDITORIAL_WITHHOLD",
      reason: relevance.reason,
      relevance,
      contract,
    };
  }

  const brief = buildCreativeBrief({ story, platform, factLock, contract });
  const v = validateCreativeBrief(brief, { factLock });
  if (!v.ok) {
    return { ...failure("CREATIVE_BRIEF_REJECT", `brief invalid: ${v.errors.join("; ")}`, { stage: "creative_brief", detail: v }), relevance, contract };
  }

  return {
    ok: true,
    state: null,
    brief,
    brief_warnings: v.warnings,
    factLock,
    factLockHash: factLockHash(factLock),
    versionStamp: buildVersionStamp({ factLock }),
    relevance,
    contract,
  };
}
