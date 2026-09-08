// Phase SOCIAL-CREATIVE-4A - CREATIVE MEMORY / ANTI-REPETITION (§26) +
// VISUAL DIVERSITY (§27).
//
// Persist a compact visual fingerprint per asset and check a CANDIDATE
// against recent history so the feed stays cohesive but never cloned.
// Complements lib/social/newsroom/feedReview (which reviews a whole
// planned window) - this is the single candidate-vs-history gate.
//
// Pure. No I/O.

import { createHash } from "node:crypto";

// §26 - the facets we remember.
export const FINGERPRINT_FACETS = Object.freeze([
  "layout", // layout / template family
  "hero_location", // where the hero element sits (left/right/center/top)
  "card_count", // 0 / 1 / 2 / 3+
  "cta_zone",
  "background_family",
  "hook_grammar", // skeletonised hook shape / story_type
  "stat_type", // pct | multiple | from_to | distribution | equation | none
  "visual_density", // low | medium | high
]);

function densityBucket(n) {
  if (n == null) return "medium";
  if (n <= 3) return "low";
  if (n <= 6) return "medium";
  return "high";
}
function cardBucket(n) {
  const v = Number(n) || 0;
  return v >= 3 ? "3+" : String(v);
}

export function visualFingerprint(input = {}) {
  const fp = {
    layout: input.layout ?? input.layout_family ?? null,
    hero_location: input.hero_location ?? input.heroLocation ?? null,
    card_count: cardBucket(input.card_count ?? input.cardCount),
    cta_zone: input.cta_zone ?? input.ctaZone ?? null,
    background_family: input.background_family ?? input.backgroundFamily ?? "none",
    hook_grammar: input.hook_grammar ?? input.hookGrammar ?? input.story_type ?? null,
    stat_type: input.stat_type ?? input.statType ?? "none",
    visual_density: input.visual_density ?? densityBucket(input.distinctVisualElements ?? input.visualDensity),
  };
  const key = createHash("sha256").update(FINGERPRINT_FACETS.map((f) => `${f}=${fp[f] ?? ""}`).join("|")).digest("hex").slice(0, 16);
  return { ...fp, key };
}

// Per-facet share ceilings over the recent window. Above the ceiling the
// facet is "over-repeated".
export const FACET_CEILINGS = Object.freeze({
  layout: 0.4,
  hero_location: 0.5,
  card_count: 0.6,
  cta_zone: 0.6,
  background_family: 0.4,
  hook_grammar: 0.4,
  stat_type: 0.5,
  visual_density: 0.7,
});

// candidate: a visualFingerprint() output (or its raw input).
// recent: array of prior fingerprints (or their raw inputs), newest last.
export function repetitionCheck(candidate, recent = [], { window = 12 } = {}) {
  const cand = candidate?.key ? candidate : visualFingerprint(candidate);
  const hist = recent.slice(-window).map((r) => (r?.key ? r : visualFingerprint(r)));
  const n = hist.length + 1; // include the candidate itself in the share

  const facets = {};
  const offenders = [];
  for (const facet of FINGERPRINT_FACETS) {
    const val = cand[facet];
    if (val == null || val === "" || val === "none") {
      facets[facet] = { value: val, share: 0, ceiling: FACET_CEILINGS[facet], over: false };
      continue;
    }
    const matches = hist.filter((h) => h[facet] === val).length + 1;
    const share = matches / n;
    const over = share > FACET_CEILINGS[facet] + 1e-9;
    facets[facet] = { value: val, share: Number(share.toFixed(3)), ceiling: FACET_CEILINGS[facet], over };
    if (over) offenders.push(`${facet}="${val}" ${(share * 100).toFixed(0)}% > ${(FACET_CEILINGS[facet] * 100).toFixed(0)}%`);
  }

  const exactClone = hist.some((h) => h.key === cand.key);
  let verdict = "OK";
  if (exactClone || offenders.length >= 3) verdict = "BLOCK";
  else if (offenders.length >= 1) verdict = "WATCH";

  return { verdict, exact_clone: exactClone, offenders, facets, window: hist.length, fingerprint: cand };
}

export const FINGERPRINT_VERSION = "4a.1";
