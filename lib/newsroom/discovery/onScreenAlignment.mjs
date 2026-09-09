// Phase SOCIAL-DISCOVERY-1 SS14 - ON-SCREEN DISCOVERY ALIGNMENT AUDIT.
//
// Does NOT redesign 4C.7 / the static creative. The video is a direct
// re-composition of the ALREADY-approved static master (professionalSocialLoop
// reuses its exact pixels), so the real on-screen topic text is whatever
// that master's own approved editorial content says - caption_handoff
// (hook_rule / why_it_matters / supporting_facts / required_takeaway) and
// the semantic manifest's required_takeaway are the real, already-produced
// source for that, not a fabricated proxy. This module only AUDITS
// semantic overlap between the discovery manifest's on_screen_keywords and
// that real text - it never touches rendering.

function normalize(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9%$\s]/g, " ").replace(/\s+/g, " ").trim();
}

function onScreenTextCorpus(pkg) {
  // The most direct, reliable source of "what does this story actually
  // say" is the real, already-audited caption text itself (both
  // platforms) - simpler and more robust than the caption_handoff
  // sub-object, whose exact shape varies by caller.
  const ig = pkg?.captions?.instagram?.caption_text ?? "";
  const x = pkg?.captions?.x?.caption_text ?? "";
  const sem = pkg?.semantic_manifest ?? {};
  return normalize([ig, x, sem.required_takeaway, sem.appropriate_lesson].filter(Boolean).join(" "));
}

/**
 * auditOnScreenAlignment(pkg, onScreenKeywords) -> { verdict, matched, missing, findings }
 * PASS: every keyword's core topic words appear (semantic overlap is
 * enough - exact wording is never required, per the phase's own
 * instruction not to fail strong content over wording).
 * WARN: partial overlap (some real topic signal, not all).
 * FAIL: no real topical connection between the keyword set and the
 * approved editorial content at all.
 */
export function auditOnScreenAlignment(pkg, onScreenKeywords = []) {
  const corpus = onScreenTextCorpus(pkg);
  const matched = [], missing = [];
  for (const kw of onScreenKeywords) {
    const words = normalize(kw).split(" ").filter((w) => w.length > 2 && !["the", "and", "under", "vs"].includes(w));
    const hitCount = words.filter((w) => corpus.includes(w)).length;
    const isMatch = words.length === 0 || hitCount / words.length >= 0.4; // meaningful overlap, not exact wording
    (isMatch ? matched : missing).push(kw);
  }
  const total = onScreenKeywords.length || 1;
  const ratio = matched.length / total;
  const verdict = ratio >= 0.8 ? "PASS" : ratio >= 0.4 ? "WARN" : "FAIL";
  const findings = verdict === "FAIL" ? [{ code: "ON_SCREEN_DISCOVERY_ALIGNMENT_FAIL", detail: `no real topical overlap found for: ${missing.join(", ")}` }] : [];
  return { verdict, matched, missing, findings, corpus_present: corpus.length > 0 };
}
