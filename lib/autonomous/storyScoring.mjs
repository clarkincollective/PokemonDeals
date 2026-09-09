// Phase SOCIAL-AUTOPILOT-1 §4 - DETERMINISTIC EDITORIAL SCORING.
//
// Every candidate gets a score built from named, inspectable dimensions -
// never just "biggest percentage discount wins" (a famous card at a
// modest discount can be more useful content than an obscure card at a
// huge one). Only signals actually present in the repo/candidate are
// used - popularity is never invented.
//
// Pure, no I/O, no randomness.

export const STORY_SCORING_VERSION = "auto1.1";

// Per-family weights (sum need not be 1 - the score is normalized at the
// end). A family with no live percentage (evergreen) simply scores 0 on
// deal_strength rather than being penalized elsewhere.
const DEFAULT_WEIGHTS = Object.freeze({
  collector_interest: 1.0,
  deal_strength: 1.0,
  data_confidence: 1.2,
  freshness: 0.8,
  novelty: 0.8,
  visual_potential: 0.8,
  educational_value: 0.9,
  click_potential: 0.7,
  share_potential: 0.6,
  save_potential: 0.6,
  feed_diversity: 1.0,
  commercial_value: 0.5,
});

const FAMILY_WEIGHT_OVERRIDES = Object.freeze({
  deal_drop: { commercial_value: 1.2, deal_strength: 1.3 },
  three_under_25: { commercial_value: 1.0, educational_value: 1.0 },
  market_snapshot: { educational_value: 1.3, share_potential: 1.0, commercial_value: 0.3 },
  price_band_insight: { educational_value: 1.2, novelty: 1.0, commercial_value: 0.2 },
  asking_vs_sold: { educational_value: 1.3, save_potential: 1.0, commercial_value: 0.6 },
  printing_compare: { educational_value: 1.4, collector_interest: 1.3, commercial_value: 0.2 },
  evergreen: { educational_value: 1.2, save_potential: 1.1, commercial_value: 0.1, freshness: 0.2 },
});

function clamp01(n) { return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0)); }

// Deterministic 0..1 "how well-known does this card family read" proxy.
// ONLY uses signals actually present: a real market_price is a legitimate
// popularity/scarcity proxy (nothing exotic is priced high with no
// interest); a printing pair or a named species also counts. Never a
// hard-coded list of "famous cards".
function collectorInterestOf(candidate) {
  const meta = candidate.facts.canonical_card_metadata ?? {};
  const names = Object.values(meta).map((m) => m?.name ?? m).filter(Boolean);
  let score = names.length ? 0.4 : 0.2;
  const prices = Object.values(candidate.facts.market_reference_values ?? candidate.facts.prices ?? {}).filter((v) => typeof v === "number");
  if (prices.length) {
    const maxP = Math.max(...prices);
    score += clamp01(maxP / 300) * 0.5; // a $300+ reference reads as more collector-notable
  }
  if (candidate.family === "printing_compare") score += 0.2; // a named printing lineage is inherently collector interest
  return clamp01(score);
}

function dealStrengthOf(candidate) {
  const pcts = Object.values(candidate.facts.derived_percentages ?? {}).filter((v) => typeof v === "number");
  if (!pcts.length) return 0;
  const best = Math.max(...pcts.map(Math.abs));
  return clamp01(best / 75); // 75%+ below market reads as a maximal deal
}

function dataConfidenceOf(candidate) {
  const trace = candidate.facts.fact_trace ?? [];
  if (candidate.family === "evergreen") return 0.7; // no live claim to be wrong about
  return trace.length ? clamp01(0.5 + trace.length * 0.1) : 0.3;
}

function freshnessOf(candidate) {
  const capturedAt = candidate.facts.data_freshness?.captured_at;
  if (!capturedAt) return 0.5;
  const ageMs = Date.now() - Date.parse(capturedAt);
  if (!Number.isFinite(ageMs)) return 0.5;
  return clamp01(1 - ageMs / (24 * 3600 * 1000)); // fresh within the last day scores near 1
}

function educationalValueOf(candidate) {
  return candidate.facts.classification === "EDITORIAL" ? 0.8 : 0.5;
}

function visualPotentialOf(candidate) {
  const n = (candidate.facts.canonical_card_ids ?? []).length;
  if (n === 0) return 0.3; // pure-stat story, e.g. price_band_insight
  if (n === 1) return 0.7;
  if (n === 2) return 0.85; // printing pair, hero_row two-card comparisons
  return 0.9; // three_under_25 / multi-card
}

function commercialValueOf(candidate) {
  return candidate.facts.classification === "COMMERCIAL" ? 0.9 : 0.2;
}

// novelty/click/share/save/feed_diversity are supplied by the caller
// (the content calendar knows recent history; scoring itself does not
// read the DB) - default to a neutral 0.5 when not supplied so a
// standalone score() call is still meaningful in tests.
export function scoreCandidate(candidate, { diversitySignals = {} } = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(FAMILY_WEIGHT_OVERRIDES[candidate.family] ?? {}) };
  const dims = {
    collector_interest: collectorInterestOf(candidate),
    deal_strength: dealStrengthOf(candidate),
    data_confidence: dataConfidenceOf(candidate),
    freshness: freshnessOf(candidate),
    novelty: clamp01(diversitySignals.novelty ?? 0.5),
    visual_potential: visualPotentialOf(candidate),
    educational_value: educationalValueOf(candidate),
    click_potential: clamp01(diversitySignals.click_potential ?? 0.5),
    share_potential: clamp01(diversitySignals.share_potential ?? 0.5),
    save_potential: clamp01(diversitySignals.save_potential ?? 0.5),
    feed_diversity: clamp01(diversitySignals.feed_diversity ?? 0.5),
    commercial_value: commercialValueOf(candidate),
  };
  let sum = 0, wsum = 0;
  for (const [k, v] of Object.entries(dims)) { sum += v * (weights[k] ?? 1); wsum += weights[k] ?? 1; }
  const overall = wsum ? Math.round((sum / wsum) * 1000) / 1000 : 0;
  const why_selected = Object.entries(dims)
    .sort((a, b) => (b[1] * (weights[b[0]] ?? 1)) - (a[1] * (weights[a[0]] ?? 1)))
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`);
  return { overall, dims, weights, why_selected };
}

// §5 - the quality floor. A candidate below this never gets selected just
// to fill a quota - "no good story = no post".
export const EDITORIAL_QUALITY_FLOOR = 0.42;

export function meetsQualityFloor(scored) {
  return scored.overall >= EDITORIAL_QUALITY_FLOOR;
}
