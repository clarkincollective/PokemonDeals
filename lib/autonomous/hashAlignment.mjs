// Phase SOCIAL-AUTOPILOT-4 §6 - THE COMPLETE LIVE PACKAGE CONTRACT.
//
// Every hash a real submit depends on must trace back to the SAME frozen
// snapshot: placement.placement_id (whose input includes the snapshot
// hash) == mediaPackage.snapshot_hash == pkg.snapshot.snapshot_hash.
// Reuses placementDedupeKey (unchanged) rather than re-deriving the
// dedupe formula a second time.

import { placementDedupeKey } from "./bufferHandoff.mjs";
import { failure } from "../newsroom/editorial/failureStates.mjs";

export const HASH_ALIGNMENT_VERSION = "auto4.1";

/**
 * verifyHashAlignment(pkg, placement, mediaPackage) -> { ok, checks:[...] }
 */
export function verifyHashAlignment(pkg, placement, mediaPackage) {
  const checks = [];
  const add = (key, ok, detail = null) => checks.push({ key, ok, detail });

  const snapshotHash = pkg?.snapshot?.snapshot_hash ?? null;
  add("snapshot_present", Boolean(snapshotHash));

  add("media_snapshot_hash_matches", mediaPackage?.snapshot_hash === snapshotHash, { placement: mediaPackage?.snapshot_hash, expected: snapshotHash });

  const expectedDedupe = snapshotHash
    ? placementDedupeKey({ storyId: pkg.story_id, snapshotHash, platform: placement.platform, placementType: placement.placement_type })
    : null;
  add("placement_dedupe_traces_to_snapshot", Boolean(expectedDedupe) && placement.placement_id === expectedDedupe, { placement_id: placement.placement_id, expected: expectedDedupe });

  add("story_id_matches", placement.story_id === pkg.story_id, { placement: placement.story_id, expected: pkg.story_id });

  const ok = checks.every((c) => c.ok);
  if (!ok) {
    return {
      ok: false,
      ...failure("PLACEMENT_PACKAGE_DRIFT_FAIL", `hash alignment failed: ${checks.filter((c) => !c.ok).map((c) => c.key).join(", ")}`, { stage: "hash_alignment", detail: checks }),
      checks,
    };
  }
  return { ok: true, checks };
}
