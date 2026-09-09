// Phase SOCIAL-DISCOVERY-2 SS12/SS13 - DISCOVERY QA GATE.
//
// Composes the 9 named checks the phase requires into one per-platform
// readiness verdict, auditing the EXACT final provider-bound string (not
// the bare caption). Never silently drops a bad tag and proceeds unless
// an existing bounded deterministic repair (buildFinalPlatformText's own
// greedy-fit, which only ever drops a HASHTAG, never a fact) already
// handled it safely.

import { buildFinalPlatformText, auditFinalPlatformText } from "./finalCaptionBuilder.mjs";
import { auditKeywordEntityAlignment } from "./keywordEngine.mjs";

const HASHTAG_CAP = Object.freeze({ instagram: 5, x: 2, tiktok: 5, youtube_shorts: 4 });

/**
 * auditDiscoveryReadiness(pkg, platform) ->
 *   { ok, checks: {9 named PASS/FAIL}, final_text, findings }
 */
export function auditDiscoveryReadiness(pkg, platform) {
  const platformOut = pkg?.discovery?.platform?.[platform] ?? null;
  const findings = [];

  const checks = {
    DISCOVERY_MANIFEST_PASS: Boolean(pkg?.discovery && platformOut),
    KEYWORD_ENTITY_PASS: true,
    HASHTAG_RELEVANCE_PASS: true,
    HASHTAG_COUNT_PASS: true,
    EMOJI_PASS: true,
    PLATFORM_LENGTH_PASS: true,
    SEARCH_INTENT_PASS: Array.isArray(pkg?.discovery?.search_intent) && pkg.discovery.search_intent.length > 0,
    RELATED_ROUTE_PASS: typeof pkg?.discovery?.related_site_route === "string" && pkg.discovery.related_site_route.startsWith("/"),
    FACT_ALIGNMENT_PASS: true,
  };

  if (!checks.DISCOVERY_MANIFEST_PASS) {
    findings.push({ code: "DISCOVERY_MANIFEST_FAIL", detail: `no discovery manifest / platform package present for ${platform}` });
    return { ok: false, checks, final_text: null, findings };
  }

  const caption = platformOut.caption ?? "";
  const hashtags = platformOut.hashtags ?? [];

  const entityFindings = auditKeywordEntityAlignment([caption, ...hashtags, ...(platformOut.caption_keywords ?? [])], pkg);
  if (entityFindings.length) { checks.KEYWORD_ENTITY_PASS = false; findings.push(...entityFindings); }

  const cap = HASHTAG_CAP[platform] ?? 5;
  if (hashtags.length > cap) { checks.HASHTAG_COUNT_PASS = false; findings.push({ code: "HASHTAG_COUNT_FAIL", detail: `${hashtags.length} hashtags exceeds the ${platform} cap of ${cap}` }); }
  if (platformOut.audit?.hashtag_result?.findings?.length) { checks.HASHTAG_RELEVANCE_PASS = false; findings.push(...platformOut.audit.hashtag_result.findings); }

  if (platformOut.audit?.emoji_result?.ok === false) { checks.EMOJI_PASS = false; findings.push(...platformOut.audit.emoji_result.findings); }

  // §13/§18 - build + audit the EXACT final combined string, not the bare caption.
  const built = buildFinalPlatformText(platform, caption, hashtags);
  const lengthAudit = auditFinalPlatformText(platform, built.text);
  if (!lengthAudit.ok) { checks.PLATFORM_LENGTH_PASS = false; findings.push(...lengthAudit.findings); }

  // FACT_ALIGNMENT_PASS - the manifest's own baked facts (population/pct)
  // must match the frozen snapshot it was built from (never independently
  // re-derived - this only catches drift, never re-queries).
  const snap = pkg?.snapshot ?? {};
  if (pkg.discovery?.snapshot_hash && pkg.discovery.snapshot_hash !== snap.snapshot_hash) {
    checks.FACT_ALIGNMENT_PASS = false;
    findings.push({ code: "FACT_ALIGNMENT_FAIL", detail: "discovery manifest snapshot_hash does not match the current frozen snapshot" });
  }

  const ok = Object.values(checks).every(Boolean);
  return { ok, checks, final_text: built.text, final_text_meta: built, findings };
}

/** auditDiscoveryReadinessAll(pkg) -> per-eligible-platform results, independent (SS10-style) */
export function auditDiscoveryReadinessAll(pkg, platforms = ["instagram", "x", "tiktok", "youtube_shorts"]) {
  const out = {};
  for (const p of platforms) out[p] = auditDiscoveryReadiness(pkg, p);
  return out;
}
