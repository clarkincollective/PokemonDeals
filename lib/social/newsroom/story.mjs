// Phase SOCIAL-NEWSROOM-1 - THE STORY MODEL (§2) + LIFECYCLE (§4).
//
// A STORY is the platform-independent editorial idea. One story fans out
// into PLACEMENTS (placements.mjs) - an Instagram carousel, a TikTok
// video, an X post, a YouTube Short are the SAME story presented
// natively, not four unrelated ideas.
//
// This module is the single source of the story id, the lifecycle state
// machine, and the "may this reach Buffer?" rule. Pure - no I/O.

import { createHash } from "node:crypto";
import { getSeries } from "./series.mjs";
import { laneFor, shelfWindow } from "./clocks.mjs";
import { bucketFor } from "./pillars.mjs";

// §4 - the lifecycle. Progressive path + terminal/failure states.
export const STORY_STATES = Object.freeze([
  "OPPORTUNITY",
  "PLANNED",
  "RENDERED",
  "QA_PASS",
  "HOSTED",
  "BUFFER_READY",
  "BUFFER_QUEUED",
  "PUBLISHED",
  // failure / terminal
  "QA_WATCH",
  "BLOCKED",
  "EXPIRED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
]);

export const TERMINAL_STATES = Object.freeze(["EXPIRED", "REJECTED", "FAILED", "CANCELLED", "PUBLISHED"]);
export const BLOCKED_STATES = Object.freeze(["QA_WATCH", "BLOCKED"]);

// allowed transitions. QA_WATCH and BLOCKED are explicitly NOT allowed to
// move to BUFFER_READY/BUFFER_QUEUED - a human must re-QA or fix first.
const TRANSITIONS = Object.freeze({
  OPPORTUNITY: ["PLANNED", "BLOCKED", "EXPIRED", "REJECTED", "CANCELLED"],
  PLANNED: ["RENDERED", "BLOCKED", "EXPIRED", "REJECTED", "CANCELLED"],
  RENDERED: ["QA_PASS", "QA_WATCH", "BLOCKED", "FAILED", "EXPIRED", "CANCELLED"],
  QA_PASS: ["HOSTED", "QA_WATCH", "BLOCKED", "EXPIRED", "CANCELLED"],
  HOSTED: ["BUFFER_READY", "QA_WATCH", "BLOCKED", "FAILED", "EXPIRED", "CANCELLED"],
  BUFFER_READY: ["BUFFER_QUEUED", "QA_WATCH", "BLOCKED", "EXPIRED", "CANCELLED"],
  BUFFER_QUEUED: ["PUBLISHED", "FAILED", "CANCELLED"],
  // failure states: only human-driven recovery paths
  QA_WATCH: ["RENDERED", "REJECTED", "CANCELLED", "EXPIRED"],
  BLOCKED: ["OPPORTUNITY", "PLANNED", "REJECTED", "CANCELLED", "EXPIRED"],
  PUBLISHED: [],
  EXPIRED: [],
  REJECTED: [],
  FAILED: ["CANCELLED"],
  CANCELLED: [],
});

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

// §4 - a WATCH/BLOCKED/failed creative must never autonomously reach
// Buffer. This is the one gate the backlog builder consults before
// BUFFER_READY.
export function canReachBuffer(state) {
  return state === "HOSTED" || state === "BUFFER_READY";
}

// Deterministic story id: series + subject + a short hash of the frozen
// facts, so re-deriving the same story from the same data yields the same
// id (idempotent planning).
export function storyId({ series, subjectType, subjectId, capturedAt, factsJson = {} } = {}) {
  const canon = JSON.stringify(factsJson, Object.keys(factsJson).sort());
  const h = createHash("sha256")
    .update(`${series}::${subjectType}::${subjectId}::${capturedAt}::${canon}`)
    .digest("hex")
    .slice(0, 10);
  const slug = String(subjectId ?? subjectType ?? "subject")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${String(series).toLowerCase()}-${slug}-${h}`;
}

// Build a STORY record. `facts` are the FROZEN factual fields (already
// validated by the caller - this module never fetches or invents them).
export function makeStory({
  series,
  subjectType, // 'card' | 'set' | 'species' | 'catalog' | 'concept'
  subjectId,
  pokemon = null,
  setId = null,
  cardIds = [],
  dealIds = [],
  capturedAt,
  facts = {},
  experimentId = null,
  sourceCommit = null,
  now = Date.now(),
} = {}) {
  const def = getSeries(series);
  if (!def) throw new Error(`unknown series: ${series}`);
  const captured = capturedAt ?? new Date(now).toISOString();
  const anchorAt = facts.exact_verified_at ?? null;
  const win = shelfWindow(def.clock, { capturedAt: captured, anchorAt, now });
  const id = storyId({ series: def.id, subjectType, subjectId, capturedAt: captured, factsJson: facts });

  return {
    story_id: id,
    series: def.id,
    pillar: def.pillar,
    bucket: bucketFor(def.pillar),
    content_goal: def.goal,
    cta_intensity: def.cta,
    shelf_life_class: def.clock,
    lane: laneFor(def.clock),
    subject_type: subjectType,
    subject_id: subjectId ?? null,
    pokemon,
    set_id: setId,
    card_ids: [...cardIds],
    deal_ids: [...dealIds],
    created_at: new Date(now).toISOString(),
    captured_at: captured,
    valid_from: win.valid_from,
    valid_until: win.valid_until,
    latest_safe_publish_at: win.latest_safe_publish_at,
    shelf_basis: win.basis,
    facts_json: { ...facts },
    experiment_id: experimentId,
    source_commit: sourceCommit,
    // scores are attached later by the ranking layer
    organic_score: null,
    conversion_score: null,
    originality_score: null,
    professional_score: null,
    status: "OPPORTUNITY",
    narrative: def.narrative,
  };
}

// Is the story still truthful to publish at `whenIso`?
export function storyPublishableAt(story, whenIso) {
  const when = Date.parse(whenIso);
  const latest = Date.parse(story?.latest_safe_publish_at ?? "");
  return Number.isFinite(when) && Number.isFinite(latest) && when <= latest;
}
