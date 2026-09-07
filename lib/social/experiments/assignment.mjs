// Phase 13E.10A - DETERMINISTIC VARIANT ASSIGNMENT (§7).
//
// Assignment is a PURE function of (experiment_id, content_id, platform).
//   * same (experiment, content, platform) -> always the same variant
//   * no Date.now(), no Math.random()
//   * ~50/50 balanced over a larger sample (SHA-256 first 32 bits, mod 2)
//   * fully auditable: explainAssignment() returns the exact hash + bucket
//
// The distribution platform ids ("instagram_reel", "x_post", …) are used
// as-is so a per-platform experiment (§9) is naturally supported: the
// same content on Instagram vs X can land on different variants.

import { createHash } from "node:crypto";

const KEY_SEP = "::";

function assignmentHashHex(experimentId, contentId, platform) {
  return createHash("sha256")
    .update(`${experimentId}${KEY_SEP}${contentId}${KEY_SEP}${platform}`)
    .digest("hex");
}

// -> "A" | "B"
export function assignVariant(experimentId, { contentId, platform } = {}) {
  if (!experimentId || contentId == null || !platform) {
    throw new Error("assignVariant: experimentId, contentId and platform are all required");
  }
  const hex = assignmentHashHex(experimentId, String(contentId), String(platform));
  const bucket = parseInt(hex.slice(0, 8), 16) % 2; // first 32 bits
  return bucket === 0 ? "A" : "B";
}

// The auditable record the owner can inspect.
export function explainAssignment(experimentId, { contentId, platform } = {}) {
  const hex = assignmentHashHex(experimentId, String(contentId), String(platform));
  const first32 = parseInt(hex.slice(0, 8), 16);
  return {
    experiment_id: experimentId,
    content_id: String(contentId),
    platform: String(platform),
    key: `${experimentId}${KEY_SEP}${contentId}${KEY_SEP}${platform}`,
    sha256: hex,
    first32_bits: first32,
    bucket: first32 % 2,
    variant: first32 % 2 === 0 ? "A" : "B",
  };
}

// Test/inspection helper: the A/B split over a set of (contentId, platform)
// pairs for one experiment. Returns { A, B, total, ratioA }.
export function assignmentBalance(experimentId, pairs = []) {
  let A = 0;
  let B = 0;
  for (const { contentId, platform } of pairs) {
    (assignVariant(experimentId, { contentId, platform }) === "A" ? (A += 1) : (B += 1));
  }
  const total = A + B;
  return { A, B, total, ratioA: total ? A / total : null };
}
