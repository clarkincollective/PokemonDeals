// Phase SOCIAL-DISCOVERY-2 SS4/SS5/SS13/SS18 - FINAL PROVIDER TEXT BUILDER.
//
// Buffer's CreatePostInput has no separate "hashtags" field (verified
// against providers/buffer.mjs's own documented schema) - hashtags only
// ever reach the platform if they are part of `text`. Before this phase,
// discovery-selected hashtags were computed but NEVER appended to what
// actually got sent (bufferHandoff.mjs sent the raw 5B caption only).
// This module is the ONE place that combines caption + hashtags into the
// exact string a provider call would use, and is BUDGET-AWARE for X so
// appending hashtags can never recreate the AUTOPILOT-5.1
// buffer_InvalidInputError class of bug: hashtags are added greedily,
// one at a time, only while the running total still fits the platform's
// real limit - never appended blindly and never silently truncating the
// CAPTION itself (facts must stay intact; a hashtag is dropped first).

import { checkXLength, X_CAPTION_HARD_LIMIT } from "../captions/captionAudit.mjs";

const PLATFORM_TEXT_CEILING = Object.freeze({
  instagram: 2200, // Buffer/Instagram's real practical caption ceiling
  x: X_CAPTION_HARD_LIMIT,
  tiktok: 2200,
  youtube_shorts: 5000, // description field, not the title
});

/**
 * buildFinalPlatformText(platform, caption, hashtags) ->
 *   { text, hashtags_included, hashtags_dropped, length }
 *
 * X: greedy-fit, hard-capped at 280 - if even the bare caption already
 * exceeds 280 this returns 0 included hashtags (caller's length audit
 * will still correctly FAIL on the caption itself, exactly as before).
 * Other platforms: append the full discovery-selected set (already
 * capped by hashtagPools.mjs's per-platform hard max) unless the
 * combined string would exceed that platform's own real ceiling, in
 * which case hashtags are dropped from the end one at a time until it
 * fits - the caption text itself is NEVER truncated.
 */
export function buildFinalPlatformText(platform, caption, hashtags = []) {
  const ceiling = PLATFORM_TEXT_CEILING[platform] ?? PLATFORM_TEXT_CEILING.instagram;
  const base = String(caption ?? "");
  const included = [];
  const dropped = [];
  for (const tag of hashtags) {
    const candidateLine = [...included, tag].join(" ");
    const candidateText = candidateLine ? `${base}\n\n${candidateLine}` : base;
    if ([...candidateText].length <= ceiling) included.push(tag);
    else dropped.push(tag);
  }
  const text = included.length ? `${base}\n\n${included.join(" ")}` : base;
  return { text, hashtags_included: included, hashtags_dropped: dropped, length: [...text].length, ceiling };
}

/**
 * auditFinalPlatformText(platform, text) -> { ok, findings }
 * The hard length gate on the EXACT combined string (§13/§18) - never
 * the bare caption alone. X reuses the SAME checkXLength() the real
 * Buffer InvalidInputError incident (SOCIAL-AUTOPILOT-5.2) added.
 */
export function auditFinalPlatformText(platform, text) {
  const findings = [];
  if (platform === "x") findings.push(...checkXLength(text, "x"));
  const ceiling = PLATFORM_TEXT_CEILING[platform] ?? PLATFORM_TEXT_CEILING.instagram;
  if ([...String(text ?? "")].length > ceiling) findings.push({ code: "PLATFORM_LENGTH_FAIL", detail: `final ${platform} text is ${[...text].length} chars, exceeding the ${ceiling}-char ceiling` });
  return { ok: findings.length === 0, findings };
}
