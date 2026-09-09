// Phase SOCIAL-AUTOPILOT-1 §17 - AGGREGATE QA BEFORE BUFFER_READY.
//
// A placement can only become BUFFER_READY if every relevant check
// passes. This module does not re-implement any auditor - it reads the
// verdicts already produced by the EXISTING 5A.1/5B/4C.7 stacks (passed
// in by the orchestrator) plus this phase's own new checks
// (snapshot drift / staleness / duplicate / platform eligibility), and
// refuses to synthesize a PASS for a check it was not given a real
// verdict for.

export const QA_GATE_VERSION = "auto1.1";

// Each entry: { key, required, sourceField } - `sourceField` is the path
// into the story package where the orchestrator stashes that stage's
// verdict. A missing sourceField is treated as a hard FAIL (never
// silently skipped), UNLESS `required:false` (video/tiktok-only checks
// for a family that never produces one).
const CHECKS = Object.freeze([
  { key: "FACT_LOCK", get: (pkg) => pkg.qa?._sources?.factLock },
  { key: "STORY_SNAPSHOT_DRIFT", get: (pkg) => pkg.qa?._sources?.snapshotDrift },
  { key: "CARD_FIDELITY", get: (pkg) => pkg.qa?._sources?.cardFidelity },
  { key: "CARD_METADATA", get: (pkg) => pkg.qa?._sources?.cardMetadata },
  { key: "SEMANTIC", get: (pkg) => pkg.qa?._sources?.semantic },
  { key: "SCOPE", get: (pkg) => pkg.qa?._sources?.scope },
  { key: "DIRECTION", get: (pkg) => pkg.qa?._sources?.direction },
  { key: "VISUAL_QA", get: (pkg) => pkg.qa?._sources?.visualQa },
  { key: "BRAND_SAFE_ZONE", get: (pkg) => pkg.qa?._sources?.brandSafeZone },
  { key: "CTA", get: (pkg) => pkg.qa?._sources?.cta },
  { key: "CAPTION", get: (pkg) => pkg.qa?._sources?.caption },
  { key: "DISCLOSURE", get: (pkg) => pkg.qa?._sources?.disclosure },
  // A video HOLD only removes the video-only platforms (platformEligibility
  // already reflects that independently) - it must never sink the whole
  // package when static platforms (instagram/x) don't need a video at
  // all. Only require these once video actually succeeded and a
  // video-only platform is depending on it.
  { key: "VIDEO_FACT", get: (pkg) => pkg.qa?._sources?.videoFact, required: (pkg) => Boolean(pkg.video?.ok) },
  { key: "VIDEO_VISUAL", get: (pkg) => pkg.qa?._sources?.videoVisual, required: (pkg) => Boolean(pkg.video?.ok) },
  { key: "PLATFORM_FIT", get: (pkg) => pkg.qa?._sources?.platformFit },
  { key: "STALE_CHECK", get: (pkg) => pkg.qa?._sources?.staleCheck },
  { key: "DUPLICATE_CHECK", get: (pkg) => pkg.qa?._sources?.duplicateCheck },
  // SOCIAL-DISCOVERY-2 §12 - aggregate discovery readiness (composes
  // DISCOVERY_MANIFEST/KEYWORD_ENTITY/HASHTAG_RELEVANCE/HASHTAG_COUNT/
  // EMOJI/PLATFORM_LENGTH/SEARCH_INTENT/RELATED_ROUTE/FACT_ALIGNMENT -
  // see discoveryQaGate.mjs's auditDiscoveryReadinessAll(), which the
  // orchestrator runs and stamps here). N/A (not required) when no
  // discovery manifest was built for this package at all - keeps every
  // pre-DISCOVERY-2 caller/test backward compatible.
  { key: "DISCOVERY", get: (pkg) => pkg.qa?._sources?.discovery, required: (pkg) => Boolean(pkg.discovery) },
]);

// A verdict a source function returns is one of PASS | WATCH | FAIL |
// undefined/null (not run). Only PASS clears a required check.
export function evaluateQaGate(pkg) {
  const results = [];
  let allPass = true;
  for (const c of CHECKS) {
    const required = typeof c.required === "function" ? c.required(pkg) : true;
    const verdict = c.get(pkg);
    // Not required for this package (e.g. no video-dependent platform is
    // eligible) - N/A regardless of whether a verdict happens to exist,
    // so a held-but-unneeded video/caption stage never sinks the whole gate.
    if (!required) { results.push({ key: c.key, verdict: "N_A", required }); continue; }
    if (verdict == null) { results.push({ key: c.key, verdict: "MISSING", required }); allPass = false; continue; }
    results.push({ key: c.key, verdict, required });
    if (verdict !== "PASS") allPass = false;
  }
  return { ok: allPass, results, checked_at: new Date().toISOString() };
}

export function qaGateSummary(evaluation) {
  const failing = evaluation.results.filter((r) => r.verdict !== "PASS" && r.verdict !== "N_A");
  return failing.length
    ? `WITHHOLD: ${failing.map((f) => `${f.key}=${f.verdict}`).join(", ")}`
    : "all required checks PASS";
}
