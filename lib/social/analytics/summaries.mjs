// Phase SOCIAL-ANALYTICS-1 §9-§16 - PERFORMANCE SUMMARIES BY DIMENSION.
//
// ONE generic grouping/robust-summary engine, reused for every dimension
// the phase asks for (family, entity, hashtag, keyword, audience, hook,
// caption/emoji style, creative attributes, time-of-day) - never eight
// separate implementations of the same "group, then robustly summarize,
// then gate on sample size" logic.

import { robustSummary, confidenceStateFor, isLearningEligible } from "./core.mjs";

function ratio(numer, denom) {
  if (numer == null || denom == null) return null;
  const n = Number(numer), d = Number(denom);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

// A joined record's reach-or-views figure, denominator-labeled (SS6 -
// never pretend IG reach and X impressions are the same base).
function primaryVolume(rec) {
  const m = rec.metrics ?? {};
  if (m.reach != null) return { value: m.reach, basis: "reach" };
  if (m.views != null) return { value: m.views, basis: "views" };
  if (m.impressions != null) return { value: m.impressions, basis: "impressions" };
  return { value: null, basis: null };
}

/**
 * summarizeGroup(records) -> the per-group block SS9/SS10 both want:
 * sample_size, confidence_state, and robust (median/p25/p75) summaries
 * of every KPI whose denominator genuinely existed for that record.
 */
export function summarizeGroup(records) {
  const n = records.length;
  const volumes = records.map((r) => primaryVolume(r).value);
  const volumeBasis = [...new Set(records.map((r) => primaryVolume(r).basis).filter(Boolean))];
  const engagementRates = records.map((r) => r.kpis?.engagement_rate?.value ?? null);
  const shareRates = records.map((r) => ratio(r.metrics?.shares, r.metrics?.reach ?? r.metrics?.impressions ?? null));
  const saveRates = records.map((r) => ratio(r.metrics?.saves, r.metrics?.reach ?? r.metrics?.impressions ?? null));
  const clickRates = records.map((r) => ratio(r.metrics?.clicks, r.metrics?.impressions ?? null));
  const completionRates = records.map((r) => ratio(r.metrics?.average_time_watched_s, null)); // no duration source yet - stays null everywhere (honest, not invented)

  return {
    sample_size: n,
    confidence_state: confidenceStateFor(n),
    learning_eligible: isLearningEligible(n),
    volume_basis: volumeBasis.length === 1 ? volumeBasis[0] : (volumeBasis.length > 1 ? "mixed" : null),
    reach_or_views: robustSummary(volumes),
    engagement_rate: robustSummary(engagementRates),
    share_rate: robustSummary(shareRates),
    save_rate: robustSummary(saveRates),
    click_rate: robustSummary(clickRates),
    completion_rate: robustSummary(completionRates),
  };
}

/**
 * groupBy(records, keyFn) -> Map<key, records[]>, dropping records with
 * a null/undefined key (never bucketed under a fabricated "unknown").
 */
export function groupBy(records, keyFn) {
  const map = new Map();
  for (const r of records) {
    const key = keyFn(r);
    if (key == null) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

function summarizeAllGroups(records, keyFn) {
  const grouped = groupBy(records, keyFn);
  const out = {};
  for (const [key, recs] of grouped) out[key] = summarizeGroup(recs);
  return out;
}

// §9 - platform x story_family.
export function familyPerformance(records) {
  return summarizeAllGroups(records, (r) => (r.platform && r.story_family ? `${r.story_family}::${r.platform}` : null));
}

// §10 - Pokemon / set / card / printing, each with an explicit minimum-
// sample discipline (confidence_state IS that discipline, exposed not hidden).
export function entityPerformance(records) {
  return {
    pokemon: summarizeAllGroups(records, (r) => r.pokemon),
    set: summarizeAllGroups(records, (r) => r.set),
    card: summarizeAllGroups(records, (r) => r.card),
  };
}

// §11 - hashtag usage: observational only, never causal (documented on
// the returned shape itself so a consumer can't misrepresent it).
export function hashtagPerformance(records) {
  const byTag = new Map();
  for (const r of records) {
    for (const tag of r.hashtags ?? []) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(r);
    }
  }
  const out = {};
  for (const [tag, recs] of byTag) out[tag] = { usage_count: recs.length, platforms: [...new Set(recs.map((r) => r.platform))], ...summarizeGroup(recs) };
  return { note: "OBSERVATIONAL ONLY - a hashtag appearing in high-performing posts does not prove it caused that performance. Use for relevance/rotation/historical context, not optimization.", tags: out };
}

// §12 - keyword / search-intent / audience.
export function keywordPerformance(records) {
  return {
    primary_keyword: summarizeAllGroups(records, (r) => r.primary_keyword),
    search_intent: summarizeAllGroups(records, (r) => (r.search_intent?.length ? r.search_intent.join("+") : null)),
  };
}
export function audiencePerformance(records) {
  return summarizeAllGroups(records, (r) => r.primary_audience);
}

// §13 - emoji/caption style. Buckets, not raw counts, so sample sizes
// stay meaningful per bucket.
function emojiBucket(n) { if (n == null) return null; if (n === 0) return "0"; if (n <= 2) return "1-2"; if (n <= 4) return "3-4"; return "5+"; }
export function captionStylePerformance(records) {
  return { by_emoji_count: summarizeAllGroups(records, (r) => emojiBucket(r.emoji_count)) };
}

// §8 - hook archetype.
export function hookPerformance(records) {
  return summarizeAllGroups(records, (r) => r.hook_archetype);
}

// §16 - time-of-day, Brisbane local. Report-only per the phase's own
// explicit instruction - no scheduling changes derive from this.
export function timeOfDayPerformance(records) {
  return {
    by_weekday: summarizeAllGroups(records, (r) => r.local_weekday),
    by_hour: summarizeAllGroups(records, (r) => (r.local_hour != null ? String(r.local_hour).padStart(2, "0") : null)),
    note: "report only - no automatic schedule changes are made from this",
  };
}
