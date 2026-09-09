// Phase SOCIAL-DISCOVERY-1 SS2 - TARGET AUDIENCE ENGINE.
//
// Deterministic family -> audience mapping, per the phase's own explicit
// table. Audience classification comes from STORY INTENT (the family),
// never from invented demographics.

export const AUDIENCE_SEGMENTS = Object.freeze([
  "deal hunters",
  "budget collectors",
  "market/value-focused collectors",
  "vintage collectors",
  "set collectors",
  "Pokemon-specific collectors",
  "new collectors",
  "people returning to the hobby",
  "buyers comparing listings",
  "collectors researching card values",
  "collectors seeking affordable cards",
  "collectors learning exact printing differences",
]);

// family -> { primary:[], secondary:[] }
const FAMILY_AUDIENCE = Object.freeze({
  market_snapshot: { primary: ["market/value-focused collectors", "budget collectors"], secondary: ["new collectors", "collectors researching card values"] },
  price_band_insight: { primary: ["market/value-focused collectors", "budget collectors"], secondary: ["collectors researching card values"] },
  asking_vs_sold: { primary: ["buyers comparing listings", "collectors researching card values"], secondary: ["deal hunters"] },
  deal_drop: { primary: ["deal hunters"], secondary: ["budget collectors", "buyers comparing listings"] },
  printing_compare: { primary: ["vintage collectors", "collectors learning exact printing differences"], secondary: ["set collectors"] },
  three_under_25: { primary: ["budget collectors", "new collectors"], secondary: ["collectors seeking affordable cards"] },
  evergreen: { primary: ["new collectors", "people returning to the hobby"], secondary: ["collectors learning exact printing differences"] },
});

/**
 * classifyAudience(family) -> { primary_audience, secondary_audience, audience_segments }
 * Falls back to a conservative generic pair for an unknown family rather
 * than throwing - discovery metadata should degrade, not crash, a real
 * pipeline run.
 */
export function classifyAudience(family) {
  const map = FAMILY_AUDIENCE[family] ?? { primary: ["Pokemon-specific collectors"], secondary: ["new collectors"] };
  return {
    primary_audience: map.primary[0] ?? null,
    secondary_audience: map.secondary[0] ?? null,
    audience_segments: [...new Set([...map.primary, ...map.secondary])],
  };
}
