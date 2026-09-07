// Phase SOCIAL-NEWSROOM-1 - EDITORIAL ORIGINALITY / DIVERSITY SCORE (§16).
//
// How DISTINCT is a candidate story from what has recently gone out AND
// what is already queued/planned? Looks across published history + the
// Buffer queue + the planned backlog - not just the current run.
//
// Deterministic. Range 0..1 (1 = maximally fresh vs recent context).
// Complements diversity.mjs (which penalises a candidate score) - this is
// a standalone gate value the backlog builder thresholds on (§25).
//
// Pure. No I/O.

import { skeleton } from "./captionSimilarity.mjs";

const HRS = 3_600_000;

// dimension -> { window_hours, weight }. weights sum to 1.00.
export const ORIGINALITY_DIMENSIONS = Object.freeze({
  series: { window: 7 * 24, weight: 0.16 },
  pillar: { window: 3 * 24, weight: 0.10 },
  pokemon: { window: 5 * 24, weight: 0.14 },
  printing: { window: 14 * 24, weight: 0.14 }, // canonical card printing (hard cooldown elsewhere)
  set: { window: 7 * 24, weight: 0.08 },
  hook_grammar: { window: 4 * 24, weight: 0.10 },
  cta_intensity: { window: 2 * 24, weight: 0.05 },
  layout_family: { window: 3 * 24, weight: 0.08 },
  background_family: { window: 3 * 24, weight: 0.05 },
  price_band: { window: 3 * 24, weight: 0.05 },
  numeric_structure: { window: 4 * 24, weight: 0.05 },
});

function priceBand(usd) {
  const v = Number(usd);
  if (!Number.isFinite(v)) return null;
  if (v < 25) return "u25";
  if (v < 50) return "u50";
  if (v < 100) return "u100";
  if (v < 300) return "u300";
  return "300+";
}

// the comparable "keys" a story exposes for each dimension.
export function originalityKeys(story = {}) {
  const f = story.facts_json ?? {};
  return {
    series: story.series ?? null,
    pillar: story.pillar ?? null,
    pokemon: story.pokemon ? String(story.pokemon).toLowerCase() : null,
    printing: f.card_tcgplayer_id ? `tcg:${String(f.card_tcgplayer_id).trim()}` : story.card_ids?.[0] ? `card:${story.card_ids[0]}` : null,
    set: story.set_id ?? f.card_set ?? null,
    hook_grammar: story.facts_json?.hook_text ? skeleton(story.facts_json.hook_text) : story.series ?? null,
    cta_intensity: story.cta_intensity ?? null,
    layout_family: f.layout_family ?? story.series ?? null,
    background_family: f.background_family ?? null,
    price_band: priceBand(f.total_price_usd ?? f.paid_usd),
    numeric_structure: f.numeric_structure ?? (f.discount_pct != null ? "pct+saving" : null),
  };
}

// history entries: { keys? | story, postedAt }.  Also accepts already-
// planned/queued items with a `plannedFor`/`time_utc` used as the recency
// anchor.
function keysOf(entry) {
  if (entry.keys) return entry.keys;
  if (entry.story) return originalityKeys(entry.story);
  return originalityKeys(entry);
}
function whenOf(entry) {
  return Date.parse(entry.postedAt ?? entry.plannedFor ?? entry.time_utc ?? entry.planned_for ?? "") || null;
}

export function originalityBreakdown(story, context = [], now = Date.now()) {
  const k = originalityKeys(story);
  const byDimension = {};
  let score = 0;
  for (const [dim, cfg] of Object.entries(ORIGINALITY_DIMENSIONS)) {
    const key = k[dim];
    let hits = 0;
    if (key != null) {
      const cutoff = now - cfg.window * HRS;
      for (const e of context) {
        const w = whenOf(e);
        if (w != null && w < cutoff) continue;
        if (keysOf(e)[dim] === key) hits++;
      }
    }
    // fresh (0 hits) -> full weight; each recent repeat halves the remaining credit.
    const credit = key == null ? cfg.weight : cfg.weight * Math.pow(0.5, hits);
    byDimension[dim] = { key, recent_hits: hits, credit: Number(credit.toFixed(4)) };
    score += credit;
  }
  return { keys: k, byDimension, score: Number(Math.max(0, Math.min(1, score)).toFixed(3)) };
}

export function originalityScore(story, context = [], now = Date.now()) {
  return originalityBreakdown(story, context, now).score;
}

// §25 - minimum originality for autonomous backlog. An exceptional live
// deal can override SOFT editorial diversity (diversity.mjs) but never
// this - a near-identical repeat is still a near-identical repeat.
export const ORIGINALITY_MIN_FOR_BACKLOG = 0.6;
