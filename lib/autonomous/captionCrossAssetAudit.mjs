// Phase SOCIAL-CAPTION-5B.1 SS9 - CROSS-ASSET CAPTION CONSISTENCY.
//
// auditCaptionAgainstStoryPackage() composes the checks 5B's own
// captionAudit.mjs already runs (entity lock, placeholder, fact/scope/
// direction/image-consistency) against the SAME frozen story package
// AUTOPILOT-1..4 already carry - it does not re-implement any of them,
// it just gives the AUTOPILOT layer one named entrypoint that reads a
// SocialStoryPackage directly instead of a bare semanticManifest.

import { auditCaption } from "../newsroom/captions/captionAudit.mjs";
import { auditCaptionEntityLock } from "../newsroom/captions/captionEntityLock.mjs";
import { auditPlaceholders } from "../newsroom/captions/captionPlaceholderAudit.mjs";
import { failure } from "../newsroom/editorial/failureStates.mjs";

export const CAPTION_CROSS_ASSET_AUDIT_VERSION = "5b1.1";

/**
 * auditCaptionAgainstStoryPackage(pkg, platform) -> { ok, state?, reason?, findings }
 *
 * Re-runs the full deterministic caption audit (entity lock + placeholder
 * + fact/scope/direction/image-consistency, exactly as captionAudit.mjs
 * itself composes them) against pkg.captions[platform], pkg.semantic_manifest,
 * and pkg.snapshot - the same frozen sources every other stage in this
 * story's pipeline reads. A caption that was READY when it was first
 * generated must still be consistent with the package it now travels
 * with; this is the same "final match" discipline AUTOPILOT-2's
 * verifyPackageIntegrity already applies to hashes, applied here to content.
 */
export function auditCaptionAgainstStoryPackage(pkg, platform = "instagram") {
  const captionText = pkg?.captions?.[platform]?.caption_text ?? "";
  if (!captionText) return { ok: false, ...failure("CAPTION_GENERATION_HOLD", `no ${platform} caption text to audit`, { stage: "cross_asset" }) };

  const parts = {
    hook: pkg.captions[platform]?.hook ?? "", body: "", why_it_matters: "",
    cta: pkg.captions[platform]?.cta ?? "", hashtags: pkg.captions[platform]?.hashtags ?? [],
  };
  const audit = auditCaption({
    parts, captionText, family: pkg.family, platform,
    semanticManifest: pkg.semantic_manifest ?? {}, factTrace: pkg.snapshot?.fact_trace ?? [],
    cardMetadataLock: pkg.snapshot?.canonical_card_metadata ? Object.values(pkg.snapshot.canonical_card_metadata)[0] ?? null : null,
  });

  return { ok: audit.ok, state: audit.state ?? null, reason: audit.reason ?? null, findings: audit.findings ?? [], verification: audit.verification };
}

/**
 * Both-platforms convenience wrapper - Instagram and X are audited
 * INDEPENDENTLY (a failure on one never holds the other), matching §10.
 */
export function auditCaptionsAgainstStoryPackage(pkg, platforms = ["instagram", "x"]) {
  const out = {};
  for (const p of platforms) out[p] = auditCaptionAgainstStoryPackage(pkg, p);
  return out;
}

// Directly-callable entity/placeholder checks for a raw caption string,
// re-exported here so a caller with only a semanticManifest (not a full
// package) can still run the same checks without importing two modules.
export { auditCaptionEntityLock, auditPlaceholders };
