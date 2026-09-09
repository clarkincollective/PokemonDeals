// Phase SOCIAL-ANALYTICS-1 §0/§8/§23/§24/§26 - SHARED ANALYTICS PRIMITIVES.
//
// Every summary in this domain is built on these: robust (median/
// percentile, never mean-only) statistics, a single shared sample-size
// gate (so "how much evidence is enough" is answered in exactly one
// place, not re-invented per dimension), and the placement lifecycle
// states analytics itself tracks (separate from - and never able to
// mutate - the story package's own publishing state machine).

export const ANALYTICS_STATE = Object.freeze([
  "NOT_PUBLISHED", "AWAITING_METRICS", "EARLY_METRICS", "MATURE_METRICS",
  "FINALIZED", "METRICS_UNAVAILABLE", "METRICS_ERROR",
]);

// §23 - the phase's own exact small-sample thresholds.
export const CONFIDENCE_THRESHOLDS = Object.freeze({ ANECDOTE: 1, INSUFFICIENT: 4, EARLY: 9, MODERATE: 24 });
export function confidenceStateFor(n) {
  if (n <= 0) return "NO_DATA";
  if (n === 1) return "ANECDOTE";
  if (n <= CONFIDENCE_THRESHOLDS.INSUFFICIENT) return "INSUFFICIENT_DATA";
  if (n <= CONFIDENCE_THRESHOLDS.EARLY) return "EARLY_SIGNAL";
  if (n <= CONFIDENCE_THRESHOLDS.MODERATE) return "MODERATE_SIGNAL";
  return "STRONGER_SIGNAL";
}
// A summary is only "learning-eligible" (SS21) at EARLY_SIGNAL or above;
// ANECDOTE/INSUFFICIENT_DATA/NO_DATA never produce a recommendation.
export function isLearningEligible(n) {
  return n >= 5;
}

// §24 - robust summaries. A single viral outlier cannot dominate a
// median the way it would a mean; percentile bands expose it without
// deleting it.
export function median(nums) {
  const xs = nums.filter((v) => v != null && Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
export function percentile(nums, p) {
  const xs = nums.filter((v) => v != null && Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1));
  return xs[idx];
}
export function robustSummary(nums) {
  const xs = nums.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  if (!xs.length) return { n: 0, median: null, p25: null, p75: null, min: null, max: null, outliers: [] };
  const med = median(xs), p25 = percentile(xs, 25), p75 = percentile(xs, 75);
  const iqr = p75 != null && p25 != null ? p75 - p25 : null;
  // §24 - flag, never delete, anything far outside the interquartile band.
  const outliers = iqr != null && iqr > 0 ? xs.filter((v) => v > p75 + 3 * iqr || v < p25 - 3 * iqr) : [];
  return { n: xs.length, median: med, p25, p75, min: Math.min(...xs), max: Math.max(...xs), outliers };
}

// §8 - deterministic family -> default hook archetype, persisted at
// creation time (never guessed retroactively from performance). Extends
// (does not replace) discovery's own hookEngine.mjs archetypes with the
// phase's additionally-requested taxonomy entries.
export const HOOK_ARCHETYPES = Object.freeze([
  "SURPRISING_STAT", "PRICE_GAP", "QUESTION", "MYTH_BUST", "UTILITY",
  "DEAL_ALERT", "COMPARISON", "LIST", "MARKET_MOVEMENT", "COLLECTOR_EDUCATION",
]);
const FAMILY_HOOK_ARCHETYPE = Object.freeze({
  market_snapshot: "SURPRISING_STAT", price_band_insight: "SURPRISING_STAT",
  asking_vs_sold: "PRICE_GAP", deal_drop: "DEAL_ALERT",
  printing_compare: "COMPARISON", three_under_25: "LIST", evergreen: "COLLECTOR_EDUCATION",
});
export function hookArchetypeFor(family, hookText = null) {
  if (hookText && /\?\s*$/.test(hookText.trim())) return "QUESTION";
  return FAMILY_HOOK_ARCHETYPE[family] ?? "COLLECTOR_EDUCATION";
}

// §16 - Brisbane local time, the same discipline the live-pilot scripts
// already use for scheduling.
const BRISBANE_FMT_PARTS = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", hour: "2-digit", hour12: false });
export function brisbaneWeekdayHour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = BRISBANE_FMT_PARTS.formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? null;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  return { weekday, hour: Number.isFinite(hour) ? hour : null, utc: d.toISOString() };
}
