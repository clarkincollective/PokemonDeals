// Phase SOCIAL-DISCOVERY-1 SS5/SS9/SS13/SS18/SS22 - HASHTAG POOLS + ROTATION.
//
// Intent-specific pools (never one fixed combination reused every day),
// hard per-platform caps, and a deterministic explicit rejection of lazy
// growth-bait tags unless a future rule proves genuine contextual
// relevance (SS0 - none exists yet, so they are always rejected here).

export const SPAM_HASHTAGS = Object.freeze(["viral", "fyp", "foryou", "trending", "explorepage", "xyzbca", "fypage", "foryoupage"]);

// Category/community/intent pools by family - entity tags are appended
// separately (locked-entity-only, never from these pools).
const POOLS = Object.freeze({
  market_snapshot: ["PokemonCardPrices", "PokemonMarket", "PokemonTCG", "PokemonCollectors", "CardCollecting"],
  price_band_insight: ["PokemonCardPrices", "PokemonMarket", "PokemonTCG", "CardCollecting"],
  asking_vs_sold: ["PokemonCardPrices", "PokemonTCG", "PokemonCardDeals", "PokemonCollectors"],
  deal_drop: ["PokemonCardDeals", "PokemonDeals", "PokemonCards", "PokemonTCG", "CardDeals"],
  printing_compare: ["PokemonCards", "VintagePokemon", "PokemonTCG", "CardCollecting"],
  three_under_25: ["PokemonCards", "PokemonTCG", "BudgetCollecting", "CardCollecting"],
  evergreen: ["PokemonCards", "PokemonTCG", "CardCollecting", "PokemonCollectors"],
});

const PLATFORM_CAPS = Object.freeze({ instagram: { target: [3, 5], hardMax: 5 }, x: { target: [0, 2], hardMax: 2 }, tiktok: { target: [3, 5], hardMax: 5 }, youtube_shorts: { target: [2, 4], hardMax: 4 } });

function isSpamTag(tag) {
  const t = String(tag ?? "").replace(/^#/, "").toLowerCase();
  return SPAM_HASHTAGS.includes(t);
}

/**
 * candidateHashtags(family, entityTerm) -> ordered candidate list
 * (category/community/intent pool, entity tag last so callers can slice).
 */
export function candidateHashtags(family, entityTerm = null) {
  const pool = POOLS[family] ?? POOLS.evergreen;
  const list = [...pool];
  if (entityTerm) list.push(String(entityTerm).replace(/\s+/g, ""));
  return list.filter((t) => !isSpamTag(t));
}

/**
 * scoreHashtagCombo(tags, { family, recentTags, lockedEntityTerms }) ->
 *   { relevance, specificity, recent_repetition, platform_fit, total, spam_findings }
 */
export function scoreHashtagCombo(tags, { family = null, recentTags = [], lockedEntityTerms = [] } = {}) {
  const spamFindings = [];
  let relevance = 0, specificity = 0, repetitionPenalty = 0;
  const pool = new Set((POOLS[family] ?? POOLS.evergreen).map((t) => t.toLowerCase()));
  const recentSet = recentTags.map((t) => String(t).replace(/^#/, "").toLowerCase());
  for (const raw of tags) {
    const t = String(raw).replace(/^#/, "");
    if (isSpamTag(t)) { spamFindings.push({ code: "HASHTAG_SPAM_FAIL", detail: `#${t} is a generic growth-bait tag, not contextually justified` }); continue; }
    relevance += pool.has(t.toLowerCase()) || lockedEntityTerms.some((e) => t.toLowerCase() === String(e).replace(/\s+/g, "").toLowerCase()) ? 3 : 1;
    specificity += t.length > 12 ? 2 : 1;
    if (recentSet.includes(t.toLowerCase())) repetitionPenalty += 2;
  }
  const total = relevance + specificity - repetitionPenalty - spamFindings.length * 10;
  return { relevance, specificity, recent_repetition: -repetitionPenalty, platform_fit: tags.length ? 5 : 0, total, spam_findings: spamFindings };
}

/**
 * selectHashtags(platform, family, { entityTerm, recentTags, lockedEntityTerms }) ->
 *   { tags:[], count, target:[min,max], hardMax, ok, findings }
 * Prefers: 1 category + 1 community/intent + entity + optional niche,
 * de-prioritizing anything used heavily in `recentTags` (rotation).
 */
export function selectHashtags(platform, family, { entityTerm = null, recentTags = [], lockedEntityTerms = [] } = {}) {
  const cap = PLATFORM_CAPS[platform] ?? PLATFORM_CAPS.instagram;
  const candidates = candidateHashtags(family, entityTerm);
  const recentSet = new Set(recentTags.map((t) => String(t).replace(/^#/, "").toLowerCase()));
  // sort candidates: entity term first (most specific/relevant), then
  // least-recently-used pool members, preserving pool order as tiebreak.
  const entityTag = entityTerm ? String(entityTerm).replace(/\s+/g, "") : null;
  const sorted = [...candidates].sort((a, b) => {
    if (a === entityTag) return -1;
    if (b === entityTag) return 1;
    const aUsed = recentSet.has(a.toLowerCase()) ? 1 : 0;
    const bUsed = recentSet.has(b.toLowerCase()) ? 1 : 0;
    return aUsed - bUsed;
  });
  const targetCount = platform === "x" ? (sorted.length ? Math.min(1, cap.hardMax) : 0) : Math.min(cap.target[1], sorted.length, cap.hardMax);
  const tags = sorted.slice(0, targetCount).map((t) => `#${t}`);
  const score = scoreHashtagCombo(tags, { family, recentTags, lockedEntityTerms });
  return {
    tags, count: tags.length, target: cap.target, hardMax: cap.hardMax,
    ok: tags.length <= cap.hardMax && score.spam_findings.length === 0,
    findings: score.spam_findings, score,
  };
}
