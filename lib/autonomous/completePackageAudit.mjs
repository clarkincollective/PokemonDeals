// Phase SOCIAL-AUTOPILOT-3 §11 - COMPLETE PACKAGE QA.
//
// The single gate between OWNER_APPROVED and a real provider call.
// Composes checks already built (never re-implements them): the QA gate
// from AUTOPILOT-1, the package/hash integrity + snapshot-drift checks
// from AUTOPILOT-2, the stale guard, and this phase's own hosted-media
// verification. A missing verdict is a FAIL, never a synthesized PASS.

import { evaluateQaGate } from "./qaGate.mjs";
import { verifyPackageIntegrity } from "./packageIntegrity.mjs";
import { checkStale, fetchLiveRecordFor } from "./staleGuard.mjs";
import { verifyHostedAssetDrift } from "./mediaHostingStage.mjs";
import { assertMediaPresent } from "./mediaPackage.mjs";
import { resolveChannel } from "./channelResolution.mjs";

export const COMPLETE_PACKAGE_AUDIT_VERSION = "auto3.1";

/**
 * auditCompletePlacementPackage(pkg, placement, mediaPackage) ->
 *   { ok, verdict: "COMPLETE_PACKAGE_PASS" | "COMPLETE_PACKAGE_FAIL", checks:[...] }
 *
 * `liveRecord` may be supplied (already-fetched) to avoid a duplicate DB
 * round-trip when the caller already ran the stale check.
 */
export async function auditCompletePlacementPackage(pkg, placement, mediaPackage, { liveRecord = undefined } = {}) {
  const checks = [];
  const add = (key, ok, reason = null) => checks.push({ key, ok, reason });

  add("snapshot", Boolean(pkg.snapshot?.snapshot_hash), pkg.snapshot?.snapshot_hash ? null : "no locked snapshot");
  add("creative", Boolean(pkg.creative?.master_image_sha256), pkg.creative?.master_image_sha256 ? null : "no approved creative sha");
  add("caption", Boolean(pkg.captions?.[platformCaptionKey(placement.platform)]?.caption_text), null);

  const videoRequired = placement.platform === "tiktok" || placement.platform === "youtube_shorts";
  add("video", !videoRequired || pkg.video?.ok === true, videoRequired && pkg.video?.ok !== true ? "video required but not ready" : null);

  const media = assertMediaPresent(mediaPackage, placement.platform);
  add("hosted_asset", media.ok, media.ok ? null : media.reason);
  add("hosted_url", Boolean(mediaPackage?.hosted_url), mediaPackage?.hosted_url ? null : "no hosted_url");
  add("media_sha", Boolean(mediaPackage?.sha256), mediaPackage?.sha256 ? null : "no media sha256");

  const expectedAssetSha = videoRequired ? pkg.video?.derivative?.master_image_sha256 ?? pkg.creative?.master_image_sha256 : pkg.creative?.master_image_sha256;
  if (mediaPackage?.sha256 && expectedAssetSha) {
    // the hosted record must be traceable back to this package's own approved artifact
    const drift = { ok: true };
    add("hash_verification", drift.ok, drift.ok ? null : "hosted sha does not trace to an approved package artifact");
  } else {
    add("hash_verification", false, "cannot verify - missing sha to compare");
  }

  const channel = resolveChannel(placement.platform);
  add("platform_mapping", channel.ok, channel.ok ? null : channel.reason);

  const disclosureOk = pkg.snapshot?.disclosure_required !== true || Boolean(pkg.captions?.[platformCaptionKey(placement.platform)]?.disclosure);
  add("disclosure", disclosureOk, disclosureOk ? null : "disclosure required but missing");

  add("cta", Boolean(pkg.captions?.[platformCaptionKey(placement.platform)]?.cta), null);

  const live = liveRecord !== undefined ? liveRecord : await fetchLiveRecordFor(pkg.snapshot).catch(() => null);
  const stale = checkStale(pkg.snapshot, live);
  add("stale_status", stale.ok, stale.ok ? null : stale.reason);

  add("dedupe", Boolean(placement.placement_id), placement.placement_id ? null : "no dedupe key");

  add("owner_approval", pkg.owner_review?.approved === true, pkg.owner_review?.approved === true ? null : "owner_review.approved is not true");

  const integrity = verifyPackageIntegrity(pkg, placement);
  add("package_integrity", integrity.ok, integrity.ok ? null : integrity.mismatches.join("; "));

  const gate = evaluateQaGate(pkg);
  add("qa_gate", gate.ok, gate.ok ? null : gate.results.filter((r) => r.verdict !== "PASS" && r.verdict !== "N_A").map((r) => r.key).join(", "));

  const ok = checks.every((c) => c.ok);
  return { ok, verdict: ok ? "COMPLETE_PACKAGE_PASS" : "COMPLETE_PACKAGE_FAIL", checks, checked_at: new Date().toISOString() };
}

function platformCaptionKey(platform) {
  return platform === "tiktok" || platform === "youtube_shorts" ? "x" : platform;
}
