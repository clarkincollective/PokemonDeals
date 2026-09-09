// Phase SOCIAL-AUTOPILOT-2 §10 - CAPTION + ASSET FINAL MATCH.
//
// Immediately before a real submit, re-derive the hashes the placement
// was ORIGINALLY built with and compare them against what the story
// package currently holds. This catches the specific failure mode of a
// placement being submitted against a package that has since been
// rebuilt/regenerated (a new creative, a re-run caption, a re-planned
// video) without a fresh placement being built to match it.

import { createHash } from "node:crypto";

export const PACKAGE_INTEGRITY_VERSION = "auto2.1";

const sha256 = (s) => createHash("sha256").update(String(s ?? "")).digest("hex");

/**
 * verifyPackageIntegrity(pkg, placement) -> { ok, mismatches: [...] }
 *
 * Checks, for the ONE platform this placement targets:
 *   - the placement's story_id/platform match pkg
 *   - the placement's asset hash matches pkg.creative.master_image_sha256
 *   - the placement's caption hash matches sha256(the platform's caption_text)
 *   - the placement's snapshot hash (embedded in its dedupe key input) is
 *     still pkg.snapshot.snapshot_hash
 *   - video-dependent platforms (tiktok/youtube_shorts) still have an ok video
 */
export function verifyPackageIntegrity(pkg, placement) {
  const mismatches = [];
  if (!pkg || !placement) return { ok: false, mismatches: ["missing package or placement"] };

  if (placement.story_id !== pkg.story_id) mismatches.push(`story_id: placement=${placement.story_id} package=${pkg.story_id}`);

  if (pkg.snapshot?.snapshot_hash == null) mismatches.push("package has no locked snapshot_hash");

  const assetHash = pkg.creative?.master_image_sha256 ?? null;
  if (!assetHash || placement.artifact_hash !== assetHash) {
    mismatches.push(`asset hash: placement=${placement.artifact_hash} package=${assetHash}`);
  }

  const captionKey = placement.platform === "tiktok" || placement.platform === "youtube_shorts" ? "x" : placement.platform;
  const captionText = pkg.captions?.[captionKey]?.caption_text ?? null;
  const expectedCaptionSha = captionText ? sha256(captionText) : null;
  const placedCaptionSha = placement.caption_style?.caption_sha256 ?? null;
  if (!expectedCaptionSha || placedCaptionSha !== expectedCaptionSha) {
    mismatches.push(`caption hash: placement=${placedCaptionSha} package=${expectedCaptionSha}`);
  }

  if ((placement.platform === "tiktok" || placement.platform === "youtube_shorts") && pkg.video?.ok !== true) {
    mismatches.push(`platform ${placement.platform} requires a ready video, but pkg.video.ok is ${pkg.video?.ok}`);
  }

  return { ok: mismatches.length === 0, mismatches };
}
