// Phase SOCIAL-AUTOPILOT-1 §1 - THE IMMUTABLE STORY FACT SNAPSHOT.
//
// The bug this exists to prevent: the 4C.7 proof caught the STATIC master
// showing "24,545 tracked singles" while the VIDEO derivative (rendered
// from a second, later resolver call) showed "24,585" - the database had
// simply moved between the two calls. Two real numbers, one story, wrong.
//
// The fix is structural, not a tighter tolerance: once a candidate is
// selected, EVERY fact any downstream artifact (creative / caption /
// video / chart / label / CTA / disclosure / source line) may show is
// frozen into ONE object, hashed, and never re-derived. The database is
// free to keep changing after this point - the story is not.
//
// Pure, no I/O, no randomness. `snapshotStoryFacts` takes an already
// RESOLVED candidate (the caller already queried the DB) and freezes it.

import { createHash } from "node:crypto";
import { failure } from "../newsroom/editorial/failureStates.mjs";

export const STORY_SNAPSHOT_VERSION = "auto1.1";

function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}

// A deterministic hash over every field a downstream artifact is allowed
// to read. Two snapshots with the same hash are, by construction,
// factually identical for rendering purposes.
export function snapshotHash(fields) {
  return createHash("sha256").update(stableStringify(fields)).digest("hex");
}

// §1 - the frozen field list. Every value here MUST already be a plain,
// already-resolved JS value (number/string/array/object) - never a
// function, a promise, or a live query handle.
const SNAPSHOT_FIELDS = Object.freeze([
  "source_records", "canonical_card_ids", "canonical_card_metadata",
  "prices", "market_reference_values", "derived_percentages",
  "tracked_population", "distribution_values", "comparison_direction",
  "timeframe", "source_statements", "semantic_scope", "fact_trace",
  "fact_lock_hash", "visualization_manifest", "classification",
  "cta_class", "disclosure_required", "data_freshness",
]);

/**
 * Build the immutable SocialStorySnapshot for a candidate.
 *
 *   candidate.facts = { ...all SNAPSHOT_FIELDS... }  (already resolved)
 *
 * Returns a FROZEN object (Object.freeze at every object/array depth it
 * owns) with a `snapshot_id` = `${story_id}::${short hash}` and a
 * `snapshot_hash` = the full sha256 over exactly the frozen fields (never
 * over created_at/story_id, so re-freezing identical facts at a later
 * moment yields the SAME hash - the drift check below relies on this).
 */
export function buildStorySnapshot({
  storyId, storyFamily, editorialAngle, facts = {}, now = Date.now(),
} = {}) {
  if (!storyId) throw new Error("buildStorySnapshot: storyId required");
  const frozenFacts = {};
  for (const k of SNAPSHOT_FIELDS) {
    frozenFacts[k] = facts[k] === undefined ? null : deepFreeze(structuredCloneSafe(facts[k]));
  }
  const hash = snapshotHash(frozenFacts);
  const snapshot = {
    story_id: storyId,
    snapshot_id: `${storyId}::${hash.slice(0, 12)}`,
    snapshot_hash: hash,
    snapshot_version: STORY_SNAPSHOT_VERSION,
    created_at: new Date(now).toISOString(),
    story_family: storyFamily ?? null,
    editorial_angle: editorialAngle ?? null,
    ...frozenFacts,
  };
  return deepFreeze(snapshot);
}

function structuredCloneSafe(v) {
  try { return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
  catch { return JSON.parse(JSON.stringify(v ?? null)); }
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
  Object.values(obj).forEach(deepFreeze);
  return Object.freeze(obj);
}

// §1 - re-derive the same hashable field set from a value an artifact
// (creative brief / caption brief / video derivative) actually USED, and
// compare it against the snapshot it claims to be built from. Any
// mismatch on any field the artifact touched is a hard, terminal drift -
// never a tolerance, never a "close enough".
//
//   usedFields: a partial object of {field: value} the artifact actually
//               rendered/consumed (only the fields it touches need to be
//               supplied - an artifact that never shows tracked_population
//               is not checked against it).
export function verifyNoSnapshotDrift(snapshot, usedFields = {}, { stage = "unknown" } = {}) {
  if (!snapshot || !snapshot.snapshot_hash) {
    return { ok: false, ...failure("STORY_SNAPSHOT_DRIFT_FAIL", "no snapshot supplied to verify against", { stage }) };
  }
  const mismatches = [];
  for (const [field, used] of Object.entries(usedFields)) {
    if (!SNAPSHOT_FIELDS.includes(field)) continue; // not a frozen field - nothing to compare
    const frozen = snapshot[field];
    if (stableStringify(frozen) !== stableStringify(used ?? null)) {
      mismatches.push({ field, frozen, used });
    }
  }
  if (mismatches.length) {
    return {
      ok: false,
      ...failure("STORY_SNAPSHOT_DRIFT_FAIL", `${stage} used a value that does not match the frozen snapshot: ${mismatches.map((m) => m.field).join(", ")}`, { stage, mismatches }),
    };
  }
  return { ok: true, stage, checked: Object.keys(usedFields).filter((f) => SNAPSHOT_FIELDS.includes(f)) };
}

// Convenience: verify a numeric/string fact rendered somewhere on an
// artifact (a chart bar, a headline number, a caption sentence) equals the
// snapshot's own value for that field/sub-path EXACTLY - no rounding
// drift, no re-derivation. Use for spot-checks inside a QA audit.
export function factMatchesSnapshot(snapshot, field, shownValue) {
  if (!snapshot) return false;
  const frozen = snapshot[field];
  return stableStringify(frozen) === stableStringify(shownValue ?? null);
}

export { SNAPSHOT_FIELDS };
