// Phase SOCIAL-NEWSROOM-1 - RENDERED-CREATIVE VISION REVIEW (§22 Layer 5).
//
// STATUS: DOCUMENTED GAP - no in-`lib/social` GenAI call is permitted
// (tests/scanner/social-preview-system.test.mjs guards this), and this
// repo has NO OpenAI vision/chat client at all (OpenAI is wired for image
// GENERATION only - lib/social/imageModelConfig.gpt-image-2, sole caller
// scripts/socialAssets.mjs). So a native "OpenAI visual-review adapter"
// is NOT cleanly supported and is deliberately NOT invented here (§22).
//
// This module is therefore a NO-NETWORK placeholder. Layer 5 always
// resolves to WATCH unless a review verdict is supplied out-of-band (by
// the dev-time `npm run social:quality-audit` review pack + a human /
// Impeccable pass, or by a future sanctioned reviewer that would live in
// `scripts/` next to socialAssets.mjs, not in lib/social). A WATCH can
// never autonomously schedule (story.canReachBuffer / qaStack).
//
// Pure. No I/O, no fetch, no network.

export const RUBRIC_KEYS = Object.freeze([
  "HOOK_CLARITY",
  "CARD_DOMINANCE",
  "FACT_HIERARCHY",
  "TYPOGRAPHY",
  "SPACING",
  "SAFE_ZONES",
  "CTA_CLARITY",
  "BRAND_CONSISTENCY",
  "THUMBNAIL_READABILITY",
  "PREMIUM_FEEL",
  "AI_SPAM_RISK",
]);

// There is no sanctioned automated reviewer inside lib/social, so this is
// always false. A dev-time / scripts/-hosted reviewer would report its
// own availability.
export function reviewAvailable() {
  return false;
}

// Accepts an already-resolved verdict from an out-of-band reviewer, or
// returns the fail-closed default. NEVER makes a network call.
//   supplied: { verdict:'PASS'|'WATCH'|'FAIL', scores?, notes?, source? } | null
export function review(_artifact = {}, { supplied = null } = {}) {
  if (supplied && ["PASS", "WATCH", "FAIL"].includes(String(supplied.verdict))) {
    return {
      available: true,
      verdict: String(supplied.verdict),
      scores: supplied.scores ?? null,
      notes: String(supplied.notes ?? "").slice(0, 200),
      source: supplied.source ?? "out-of-band",
    };
  }
  return {
    available: false,
    verdict: "WATCH",
    scores: null,
    notes: "Layer 5 (rendered visual review) is a documented gap - no sanctioned in-lib/social reviewer. Defaulting to WATCH: cannot autonomously schedule.",
    source: null,
  };
}
