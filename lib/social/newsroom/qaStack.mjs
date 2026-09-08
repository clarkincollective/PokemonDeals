// Phase SOCIAL-NEWSROOM-1 - MULTI-LAYER QA STACK (§22) + MINIMUM
// AUTONOMOUS QUALITY (§25).
//
// Autonomous Buffer scheduling requires ALL required layers to pass. A
// WATCH or FAIL at any layer means the story cannot autonomously reach
// BUFFER_READY (story.canReachBuffer).
//
//   Layer 1  FACT QA                 - deterministic (frozen facts present + internally consistent)
//   Layer 2  RIGHTS / IMAGE QA       - deterministic (own render only, rights cleared, no seller photo)
//   Layer 3  DETERMINISTIC CREATIVE  - reuses lib/social/creativeQa.creativeQa()
//   Layer 4  ORIGINALITY / SEQUENCE  - reuses originalityScore + sequenceGate + captionSimilarity
//   Layer 5  RENDERED VISUAL REVIEW  - visionReview.review() (env-gated; unavailable -> WATCH)
//
// Layers 1-4 are pure. Layer 5 is async and optional; runQaStack() takes
// its already-resolved result so this module stays test-simple.
//
// Pure. No I/O.

import { scoreCreative } from "../creativeQa.mjs";
import { editorialCreativeQa } from "./editorialQa.mjs";
import { collectibleAppeal, DATA_FAMILIES } from "./collectibleAppeal.mjs";
import { organicScore, ORGANIC_MIN_FOR_BACKLOG, ORGANIC_EXCEPTIONAL } from "./organicScore.mjs";
import { originalityScore, ORIGINALITY_MIN_FOR_BACKLOG } from "./originalityScore.mjs";

export const QA_LAYERS = Object.freeze(["FACT", "RIGHTS_IMAGE", "CREATIVE", "COLLECTIBLE_APPEAL", "ORIGINALITY_SEQUENCE", "VISUAL_REVIEW"]);
export const QA_RESULTS = Object.freeze(["PASS", "WATCH", "FAIL"]);

const worst = (results) => (results.includes("FAIL") ? "FAIL" : results.includes("WATCH") ? "WATCH" : "PASS");

// --- Layer 1: FACT QA -------------------------------------------------
export function factQa(story = {}) {
  const f = story.facts_json ?? {};
  const blockers = [];
  if (!story.captured_at) blockers.push("no captured_at (facts not frozen)");
  if (!story.latest_safe_publish_at) blockers.push("no latest_safe_publish_at (shelf-life unknown)");
  if (story.shelf_life_class === "LIVE" && !f.exact_verified_at) blockers.push("LIVE story with no exact_verified_at anchor");
  if (f.discount_pct != null && (Number(f.discount_pct) <= 0 || Number(f.discount_pct) >= 1)) blockers.push(`implausible discount_pct ${f.discount_pct}`);
  if (f.dollars_saved != null && Number(f.dollars_saved) < 0) blockers.push("negative dollars_saved");
  if (f.market_price != null && f.paid_usd != null && Number(f.paid_usd) > Number(f.market_price)) blockers.push("paid > market (not a saving)");
  if (Array.isArray(story.deal_ids) && story.shelf_life_class === "LIVE" && story.deal_ids.length === 0) blockers.push("LIVE deal story with no deal_ids");
  return { layer: "FACT", result: blockers.length ? "FAIL" : "PASS", blockers };
}

// --- Layer 2: RIGHTS / IMAGE QA ------------------------------------
export function rightsImageQa(story = {}, { rightsCleared = false, artifactIsOwnRender = true, usesSellerPhoto = false } = {}) {
  const blockers = [];
  if (usesSellerPhoto) blockers.push("creative uses an eBay seller photo - forbidden");
  if (!artifactIsOwnRender) blockers.push("artifact is not our deterministic render");
  const watch = [];
  if (!rightsCleared) watch.push("rights not marked cleared for this artifact");
  return { layer: "RIGHTS_IMAGE", result: blockers.length ? "FAIL" : watch.length ? "WATCH" : "PASS", blockers, watch };
}

// --- Layer 3: DETERMINISTIC CREATIVE QA --------------------------
export function creativeLayer(meta = {}) {
  // Editorial typographic layouts get the editorial density check;
  // everything else keeps lib/social/creativeQa (deal/mover/carousel).
  const qa = meta.editorial ? editorialCreativeQa(meta) : scoreCreative(meta);
  const result = ["PASS", "WATCH", "FAIL"].includes(qa.grade) ? qa.grade : "WATCH";
  return { layer: "CREATIVE", result, detail: qa };
}

// --- Layer 3b: COLLECTIBLE_APPEAL (SOCIAL-CREATIVE-3, SS17) ------
// Required only for a card-specific market / deal / education story
// (a data family). Editorial-only typographic layouts skip it.
export function collectibleAppealLayer(meta = null) {
  if (!meta || !DATA_FAMILIES.includes(meta.layout_family)) {
    return { layer: "COLLECTIBLE_APPEAL", result: "PASS", detail: "not a card-specific data layout - n/a" };
  }
  const ca = collectibleAppeal(meta);
  const result = ["PASS", "WATCH", "FAIL"].includes(ca.grade) ? ca.grade : "WATCH";
  return { layer: "COLLECTIBLE_APPEAL", result, detail: ca, blockers: ca.grade === "FAIL" ? ca.failed : [] };
}

// --- Layer 4: ORIGINALITY / SEQUENCE ----------------------------
export function originalitySequenceLayer(story, { context = [], sequenceOk = true, captionBlocked = false, now = Date.now() } = {}) {
  const orig = originalityScore(story, context, now);
  const blockers = [];
  const watch = [];
  if (captionBlocked) blockers.push("caption is a near-duplicate of a recent/queued caption");
  if (!sequenceOk) blockers.push("planned sequence violates anti-AI-spam diversity rules");
  if (orig < ORIGINALITY_MIN_FOR_BACKLOG) watch.push(`originality ${orig} < ${ORIGINALITY_MIN_FOR_BACKLOG}`);
  return { layer: "ORIGINALITY_SEQUENCE", result: blockers.length ? "FAIL" : watch.length ? "WATCH" : "PASS", originality: orig, blockers, watch };
}

// --- Layer 5: VISUAL REVIEW (result passed in) -----------------
export function visualReviewLayer(reviewResult = null) {
  if (!reviewResult) return { layer: "VISUAL_REVIEW", result: "WATCH", detail: "no review result - WATCH" };
  const v = ["PASS", "WATCH", "FAIL"].includes(reviewResult.verdict) ? reviewResult.verdict : "WATCH";
  return { layer: "VISUAL_REVIEW", result: v, detail: reviewResult };
}

// --- the stack -----------------------------------------------------
// opts: { creativeMeta, rights, originalityContext, sequenceOk, captionBlocked,
//         visualReviewResult, requireVisualReview (default true), now }
export function runQaStack(story, opts = {}) {
  const layers = [
    factQa(story),
    rightsImageQa(story, opts.rights ?? {}),
    creativeLayer(opts.creativeMeta ?? {}),
    collectibleAppealLayer(opts.collectibleMeta ?? null),
    originalitySequenceLayer(story, {
      context: opts.originalityContext ?? [],
      sequenceOk: opts.sequenceOk !== false,
      captionBlocked: Boolean(opts.captionBlocked),
      now: opts.now ?? Date.now(),
    }),
  ];
  const requireVisual = opts.requireVisualReview !== false;
  if (requireVisual) layers.push(visualReviewLayer(opts.visualReviewResult ?? null));

  const results = layers.map((l) => l.result);
  const professional = worst(results);
  const allBlockers = layers.flatMap((l) => l.blockers ?? []);
  return {
    professional_result: professional, // PASS | WATCH | FAIL
    layers,
    blockers: allBlockers,
    passed_all: professional === "PASS",
  };
}

// §25 - may this story be AUTONOMOUSLY added to the planned backlog?
// professional QA = PASS  AND
//   ( organic >= ORGANIC_MIN  OR  conversion >= exceptional )  AND
//   originality >= ORIGINALITY_MIN.
export const CONVERSION_EXCEPTIONAL = 0.8;

export function minimumAutonomousQuality(story, qa, { conversionScore = null, originalityContext = [], now = Date.now() } = {}) {
  const reasons = [];
  if (!qa || qa.professional_result !== "PASS") reasons.push(`professional QA = ${qa?.professional_result ?? "n/a"} (need PASS)`);
  const org = organicScore(story);
  const orig = originalityScore(story, originalityContext, now);
  const conv = Number(conversionScore);
  const qualityOk = org >= ORGANIC_MIN_FOR_BACKLOG || (Number.isFinite(conv) && conv >= CONVERSION_EXCEPTIONAL);
  if (!qualityOk) reasons.push(`organic ${org} < ${ORGANIC_MIN_FOR_BACKLOG} and conversion ${Number.isFinite(conv) ? conv : "n/a"} < ${CONVERSION_EXCEPTIONAL}`);
  if (orig < ORIGINALITY_MIN_FOR_BACKLOG) reasons.push(`originality ${orig} < ${ORIGINALITY_MIN_FOR_BACKLOG}`);
  return {
    ok: reasons.length === 0,
    reasons,
    organic_score: org,
    originality_score: orig,
    conversion_score: Number.isFinite(conv) ? conv : null,
    exceptional: org >= ORGANIC_EXCEPTIONAL || (Number.isFinite(conv) && conv >= CONVERSION_EXCEPTIONAL),
  };
}
