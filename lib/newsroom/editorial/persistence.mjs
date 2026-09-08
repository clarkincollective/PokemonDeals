// Phase SOCIAL-CREATIVE-4A - EDITORIAL / CREATIVE-BRIEF PERSISTENCE (§5, §19, §34).
//
// The creative brief, the relevance-gate decision, the taste scores, the
// printing-relevance decision and the visual fingerprint are all
// persisted so an asset is explainable later. We REUSE the append-only
// social_qa_runs table (like the visual-consensus rows already do) - NO
// new table, NO migration. Every row carries the version stamp (§34).
//
// Gated: no-ops (returns { ready:false }) until the newsroom migration is
// applied, exactly like lib/social/newsroom/db.mjs.

import { recordQaRun, loadQaRuns, tablesReady } from "../../social/newsroom/db.mjs";
import { buildVersionStamp, CREATIVE_BRIEF_VERSION } from "./creativeBrief.mjs";
import { factLockHash } from "./factLock.mjs";

export const EDITORIAL_QA_TYPES = Object.freeze([
  "CREATIVE_BRIEF",
  "RELEVANCE_GATE",
  "TASTE_GATE",
  "PRINTING_RELEVANCE",
  "VISUAL_FINGERPRINT",
]);

function stamp({ factLock = null, artifactSha256 = null, visualReviewPolicyVersion = null } = {}) {
  return buildVersionStamp({ factLock, artifactSha256, visualReviewPolicyVersion });
}

// Persist the creative brief for a story/placement.
export async function persistCreativeBrief({ storyId = null, placementId = null, brief, factLock, artifactSha256 = null, result = "PASS", visualReviewPolicyVersion = null }) {
  if (!(await tablesReady())) return { ready: false };
  return recordQaRun({
    ...(storyId ? { story_id: storyId } : {}),
    ...(placementId ? { placement_id: placementId } : {}),
    qa_type: "CREATIVE_BRIEF",
    result,
    detail: {
      creative_brief_version: CREATIVE_BRIEF_VERSION,
      brief,
      fact_lock_hash: factLock ? factLockHash(factLock).short : null,
      artifact_sha256: artifactSha256,
      version_stamp: stamp({ factLock, artifactSha256, visualReviewPolicyVersion }),
    },
  });
}

// Persist the relevance-gate decision (PUBLISHABLE or EDITORIAL_WITHHOLD).
export async function persistRelevanceDecision({ storyId = null, placementId = null, decision, factLock = null }) {
  if (!(await tablesReady())) return { ready: false };
  const pass = decision?.verdict === "PUBLISHABLE";
  return recordQaRun({
    ...(storyId ? { story_id: storyId } : {}),
    ...(placementId ? { placement_id: placementId } : {}),
    qa_type: "RELEVANCE_GATE",
    result: pass ? "PASS" : "FAIL",
    detail: {
      verdict: decision?.verdict ?? null,
      state: decision?.state ?? null,
      reason: decision?.reason ?? null,
      score: decision?.score ?? null,
      dimensions: decision?.dimensions ?? null,
      contract_id: decision?.contract_id ?? null,
      printing: decision?.printing ? { verdict: decision.printing.verdict, axis: decision.printing.axis, reason: decision.printing.reason } : null,
      fact_lock_hash: (decision?.fact_lock_hash) ?? (factLock ? factLockHash(factLock).short : null),
      version_stamp: stamp({ factLock }),
    },
  });
}

// Persist the taste scores (§19).
export async function persistTasteScores({ storyId = null, placementId = null, taste, factLock = null, artifactSha256 = null }) {
  if (!(await tablesReady())) return { ready: false };
  return recordQaRun({
    ...(storyId ? { story_id: storyId } : {}),
    ...(placementId ? { placement_id: placementId } : {}),
    qa_type: "TASTE_GATE",
    result: taste?.verdict === "HOLD" ? "FAIL" : taste?.verdict === "WATCH" ? "WATCH" : "PASS",
    detail: { scores: taste?.scores ?? null, overall: taste?.overall ?? null, verdict: taste?.verdict ?? null, artifact_sha256: artifactSha256, version_stamp: stamp({ factLock, artifactSha256 }) },
  });
}

// Persist the printing-relevance decision (§4).
export async function persistPrintingRelevance({ storyId = null, placementId = null, relevance }) {
  if (!(await tablesReady())) return { ready: false };
  return recordQaRun({
    ...(storyId ? { story_id: storyId } : {}),
    ...(placementId ? { placement_id: placementId } : {}),
    qa_type: "PRINTING_RELEVANCE",
    result: relevance?.verdict === "MEANINGFUL" ? "PASS" : "FAIL",
    detail: { verdict: relevance?.verdict ?? null, axis: relevance?.axis ?? null, lesson: relevance?.lesson ?? null, reason: relevance?.reason ?? null, signals: relevance?.signals ?? null },
  });
}

// Persist the visual fingerprint + repetition check (§26).
export async function persistVisualFingerprint({ storyId = null, placementId = null, fingerprint, repetition = null, artifactSha256 = null }) {
  if (!(await tablesReady())) return { ready: false };
  return recordQaRun({
    ...(storyId ? { story_id: storyId } : {}),
    ...(placementId ? { placement_id: placementId } : {}),
    qa_type: "VISUAL_FINGERPRINT",
    result: repetition?.verdict === "BLOCK" ? "FAIL" : repetition?.verdict === "WATCH" ? "WATCH" : "PASS",
    detail: { fingerprint, repetition, artifact_sha256: artifactSha256 },
  });
}

// Read the most recent fingerprints (newest first) for anti-repetition
// context.
export async function recentFingerprints({ limit = 24 } = {}) {
  if (!(await tablesReady())) return { ready: false, rows: [] };
  const { rows } = await loadQaRuns({ limit: 400 });
  const fps = (rows ?? [])
    .filter((r) => r.qa_type === "VISUAL_FINGERPRINT" && r.detail?.fingerprint)
    .slice(0, limit)
    .map((r) => r.detail.fingerprint);
  return { ready: true, rows: fps };
}

// Read the most recent creative brief for a story (for a bounded revision).
export async function latestBriefForStory(storyId) {
  if (!(await tablesReady())) return null;
  const { rows } = await loadQaRuns({ storyId, limit: 50 });
  const row = (rows ?? []).find((r) => r.qa_type === "CREATIVE_BRIEF" && r.detail?.brief);
  return row ? row.detail : null;
}
