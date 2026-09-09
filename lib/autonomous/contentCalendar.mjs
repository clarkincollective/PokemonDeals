// Phase SOCIAL-AUTOPILOT-1 §3 - CONTENT-MIX / REPETITION CONTROL.
//
// Looks back over recently selected/queued autopilot stories (persisted
// in the EXISTING social_stories table, tagged source_commit =
// AUTOPILOT_SOURCE_TAG so this never reads or mutates rows written by the
// older NEWSROOM-1/2 planner) and computes hard-rule + soft-diversity
// signals a candidate must clear before it can be selected.
//
// Pure decision logic; DB access is isolated to loadRecentAutopilotStories
// so the rest of this module is trivially unit-testable with a plain
// array of prior-story summaries.

export const CONTENT_CALENDAR_VERSION = "auto1.1";
export const AUTOPILOT_SOURCE_TAG = "social-autopilot-1";

// A "recent story" summary is the minimal shape this module needs:
//   { family, card_ids: [...], pokemon, created_at, hook_pattern, cta_pattern }

function within(hours, iso, now) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return false;
  return (now - t) <= hours * 3600 * 1000;
}

// §3 - hard repetition rules. A violation is a terminal DIVERSITY_REPETITION_FAIL
// for TODAY's selection of this exact candidate (it may still run tomorrow).
export function hardDiversityCheck(candidate, recent = [], { now = Date.now(), lookbackHours = 72 } = {}) {
  const reasons = [];
  const window = recent.filter((r) => within(lookbackHours, r.created_at, now));
  const cardIds = new Set(candidate.facts?.canonical_card_ids ?? []);

  // same exact card repeated without materially new information
  for (const r of window) {
    const overlap = (r.card_ids ?? []).filter((id) => cardIds.has(id));
    if (overlap.length && overlap.length === cardIds.size && cardIds.size > 0) {
      reasons.push(`same card set (${[...cardIds].join(",")}) posted within ${lookbackHours}h`);
      break;
    }
  }
  // same family on the immediately preceding selection
  const last = window[0];
  if (last && last.family === candidate.family && candidate.family !== "evergreen") {
    reasons.push(`same family (${candidate.family}) as the immediately preceding story`);
  }
  // avoid excessive DEAL_DROP frequency - at most 1 per lookback window
  if (candidate.family === "deal_drop") {
    const dealDropCount = window.filter((r) => r.family === "deal_drop").length;
    if (dealDropCount >= 1) reasons.push(`deal_drop already posted within ${lookbackHours}h`);
  }
  // avoid posting multiple cheap-card stories in a row
  const cheapFamilies = new Set(["deal_drop", "three_under_25"]);
  if (cheapFamilies.has(candidate.family) && last && cheapFamilies.has(last.family)) {
    reasons.push("two cheap-card stories back to back");
  }
  // avoid repeating the identical educational takeaway (evergreen angle id)
  if (candidate.family === "evergreen") {
    const angleId = candidate.editorialAngle ?? candidate.angle;
    if (window.some((r) => r.family === "evergreen" && r.hook_pattern === angleId)) {
      reasons.push(`evergreen angle "${angleId}" repeated within ${lookbackHours}h`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// §3 - soft diversity SIGNALS (0..1, higher = more novel/diverse) fed into
// storyScoring.scoreCandidate. These never hard-reject; they just push a
// repetitive-but-not-forbidden candidate down the ranking.
export function diversitySignals(candidate, recent = [], { now = Date.now(), lookbackHours = 7 * 24 } = {}) {
  const window = recent.filter((r) => within(lookbackHours, r.created_at, now));
  if (!window.length) return { novelty: 1, feed_diversity: 1, click_potential: 0.5, share_potential: 0.5, save_potential: 0.5 };

  const familyCount = window.filter((r) => r.family === candidate.family).length;
  const novelty = Math.max(0, 1 - familyCount / Math.max(1, window.length));

  const cardIds = new Set(candidate.facts?.canonical_card_ids ?? []);
  const cardRepeatCount = window.filter((r) => (r.card_ids ?? []).some((id) => cardIds.has(id))).length;
  const feed_diversity = Math.max(0, 1 - cardRepeatCount / Math.max(1, window.length));

  // families that historically diversify the feed lean toward share/save;
  // pure commercial deal posts lean toward click. Deterministic, not ML.
  const bucketSignal = {
    LIVE_DEALS: { click_potential: 0.7, share_potential: 0.4, save_potential: 0.4 },
    MARKET_INTELLIGENCE: { click_potential: 0.4, share_potential: 0.7, save_potential: 0.6 },
    PRICE_EDUCATION: { click_potential: 0.5, share_potential: 0.6, save_potential: 0.7 },
    PRINTING_EDUCATION: { click_potential: 0.4, share_potential: 0.6, save_potential: 0.8 },
    EVERGREEN_EDUCATION: { click_potential: 0.3, share_potential: 0.5, save_potential: 0.7 },
  }[candidate.bucket] ?? { click_potential: 0.5, share_potential: 0.5, save_potential: 0.5 };

  return { novelty: Math.round(novelty * 100) / 100, feed_diversity: Math.round(feed_diversity * 100) / 100, ...bucketSignal };
}

// Optional real-DB lookback, isolated so the pure functions above can be
// tested without a database. Reuses the EXISTING social_stories table
// (SOCIAL-NEWSROOM-1/2 schema) rather than creating a parallel table (§23);
// only rows this engine itself wrote (source_commit = AUTOPILOT_SOURCE_TAG)
// are read back, so the two editorial systems never see each other's rows.
export async function loadRecentAutopilotStories({ limit = 50 } = {}) {
  const { loadStories } = await import("../social/newsroom/db.mjs");
  const { rows, ready } = await loadStories({ limit });
  if (!ready) return { rows: [], ready: false };
  const mine = rows.filter((r) => r.source_commit === AUTOPILOT_SOURCE_TAG);
  return {
    ready: true,
    rows: mine.map((r) => ({
      family: r.facts_json?.family ?? null,
      card_ids: r.card_ids ?? [],
      pokemon: r.pokemon ?? null,
      created_at: r.created_at,
      hook_pattern: r.facts_json?.editorial_angle ?? null,
      cta_pattern: r.facts_json?.cta_class ?? null,
    })),
  };
}
