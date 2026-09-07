// Phase SOCIAL-NEWSROOM-2 - PERSISTENCE ROW BUILDERS + IDEMPOTENT IDENTITY
// (§3, §4, §5, §6).
//
// Pure. Turns a scored newsroom story + its native placements into the
// row shapes for social_stories / social_story_placements / social_qa_runs,
// with a STABLE identity so repeated backlog builds never create
// duplicates:
//
//   EVERGREEN  -> one canonical story per (series, subject). No time part.
//   EDITORIAL  -> one story per (series, subject, ISO week).
//   SHORT      -> one story per (series, subject, UTC day).
//   LIVE       -> one story per (series, subject, exact_verified_at) -
//                 same listing verification = same live story.
//
// This module writes NOTHING - lib/social/newsroom/db.mjs owns the
// upserts; it only builds rows.

import { storyId } from "./story.mjs";
import { getSeries } from "./series.mjs";

const DAY = 86_400_000;

// ISO-8601 week key (UTC), e.g. "2026-W37".
export function isoWeekKey(ms) {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday - firstThursday) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// The quantised "captured_at" that anchors a story's stable identity.
// Returns an ISO string. `anchorAt` is the LIVE listing's
// exact_verified_at; `now` the run time.
export function stableCapturedAt(series, { now = Date.now(), anchorAt = null } = {}) {
  const def = getSeries(series);
  const cls = def?.clock ?? "SHORT";
  if (cls === "EVERGREEN") return "evergreen"; // no time component at all
  if (cls === "EDITORIAL") return isoWeekKey(now);
  if (cls === "SHORT") return new Date(now).toISOString().slice(0, 10); // UTC day
  // LIVE: the exact verification instant (falls back to the day if absent)
  const t = Date.parse(anchorAt ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date(now).toISOString().slice(0, 10);
}

// Deterministic, collision-safe story id for persistence. Uses ONLY the
// stable identity inputs - NOT the full frozen facts (which can wobble
// between reads without the story really being "new").
export function stableStoryId({ series, subjectType, subjectId, now = Date.now(), anchorAt = null, deal_ids = [], card_ids = [], set_id = null } = {}) {
  const cap = stableCapturedAt(series, { now, anchorAt });
  const idBag = {
    d: [...(deal_ids ?? [])].sort(),
    c: [...(card_ids ?? [])].map(String).sort(),
    s: set_id ?? null,
  };
  return storyId({ series, subjectType, subjectId, capturedAt: cap, factsJson: idBag });
}

// ---- social_stories row -------------------------------------------
export function storyRow(story, { now = Date.now(), sourceCommit = null } = {}) {
  return {
    story_id: story.story_id,
    series: story.series,
    pillar: story.pillar,
    bucket: story.bucket ?? null,
    content_goal: story.content_goal ?? null,
    cta_intensity: story.cta_intensity ?? null,
    shelf_life_class: story.shelf_life_class ?? null,
    lane: story.lane ?? null,
    subject_type: story.subject_type ?? null,
    subject_id: story.subject_id ?? null,
    pokemon: story.pokemon ?? null,
    set_id: story.set_id ?? null,
    card_ids: Array.isArray(story.card_ids) ? story.card_ids : [],
    deal_ids: Array.isArray(story.deal_ids) ? story.deal_ids : [],
    captured_at: story.captured_at ?? new Date(now).toISOString(),
    valid_from: story.valid_from ?? null,
    valid_until: story.valid_until ?? null,
    latest_safe_publish_at: story.latest_safe_publish_at ?? null,
    shelf_basis: story.shelf_basis ?? null,
    organic_score: story.organic_score ?? null,
    conversion_score: story.conversion_score ?? null,
    originality_score: story.originality_score ?? null,
    professional_score: story.professional_score ?? null,
    status: story.status ?? "PLANNED",
    facts_json: freezeFacts(story.facts_json ?? {}),
    experiment_id: story.experiment_id ?? null,
    source_commit: story.source_commit ?? sourceCommit,
    narrative: Boolean(story.narrative),
    updated_at: new Date(now).toISOString(),
  };
}

// §6 - persist ONLY source-supported factual fields. Generated copy is
// NEVER stored here as source truth.
const ALLOWED_FACT_KEYS = new Set([
  "exact_verified_at", "captured_at", "valid_until", "currency",
  "market_price", "market_reference_source", "total_price_usd", "paid_usd",
  "price", "shipping", "discount_pct", "dollars_saved", "grade", "grader",
  "is_graded", "card_set", "card_number", "species", "card_tcgplayer_id",
  "listing_id", "marketplace", "first_seen_at", "last_seen_at",
  "freshness_state", "has_exact_destination", "recognisable",
  // aggregate/editorial factual context
  "headline_fact", "observation_count", "window_days", "set_id",
  "distribution_stat", "movement_pct", "movement_confidence",
  "layout_family", "background_family", "numeric_structure",
]);

export function freezeFacts(facts = {}) {
  const out = {};
  for (const [k, v] of Object.entries(facts)) {
    if (ALLOWED_FACT_KEYS.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

// ---- social_story_placements rows --------------------------------
export function placementRows(story, placements, { now = Date.now() } = {}) {
  return placements.map((p) => ({
    placement_id: p.placement_id,
    story_id: story.story_id,
    platform: p.platform,
    placement_type: p.placement_type ?? null,
    planned_for: p.planned_for ?? null,
    status: p.status ?? "PLANNED",
    content_id: p.content_id ?? null,
    artifact_hash: p.artifact_hash ?? null,
    hosted_url: p.hosted_url ?? null,
    buffer_provider_ref: p.buffer_provider_ref ?? null,
    scheduled_for: p.scheduled_for ?? null,
    provider_state: p.provider_state ?? null,
    published_at: p.published_at ?? null,
    platform_post_url: p.platform_post_url ?? null,
    caption_style: p.caption_style ?? {},
    updated_at: new Date(now).toISOString(),
  }));
}

// ---- social_qa_runs row -----------------------------------------
export function qaRunRow({ storyId: sid, placementId = null, qaType, result, score = null, blockers = [], detail = {} }) {
  return {
    story_id: sid,
    placement_id: placementId,
    qa_type: qaType,
    result,
    score,
    blockers: Array.isArray(blockers) ? blockers : [],
    detail: detail ?? {},
    checked_at: new Date().toISOString(),
  };
}
