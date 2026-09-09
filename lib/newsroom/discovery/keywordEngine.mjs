// Phase SOCIAL-DISCOVERY-1 SS3/SS4 - KEYWORD ENGINE + SCORING.
//
// Builds primary/secondary/long-tail/entity keyword layers from the
// FROZEN snapshot/manifest only - never invents an entity. The
// entity-mismatch guard reuses SOCIAL-CAPTION-5B.1's existing species/
// entity-lock machinery (extractMentionedSpecies / auditCaptionEntityLock)
// instead of building a second one.

import { entityArrays } from "./entities.mjs";
import { auditCaptionEntityLock } from "../captions/captionEntityLock.mjs";

const money = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);

// Family -> broad category term (the ONE generic, always-safe root term).
const CATEGORY_TERM = Object.freeze({
  market_snapshot: "pokemon card prices",
  price_band_insight: "pokemon card prices",
  asking_vs_sold: "pokemon card market value",
  deal_drop: "pokemon card deals",
  printing_compare: "pokemon card printings",
  three_under_25: "cheap pokemon cards",
  evergreen: "pokemon card collecting",
});

function snapshotFacts(pkg) {
  const snap = pkg?.snapshot ?? {};
  const sem = pkg?.semantic_manifest ?? {};
  return {
    pct: sem.claim_value ?? snap.derived_percentages?.under_25_pct ?? null,
    population: snap.tracked_population ?? null,
    asking: sem.comparison_left?.value ?? null,
    market: sem.comparison_right?.value ?? null,
    gapPct: sem.comparison_pct ?? null,
  };
}

/**
 * buildKeywordSet(pkg) -> {
 *   primary_search_query, secondary_search_queries, long_tail_queries,
 *   entity_keywords, caption_keywords, on_screen_keywords
 * }
 */
export function buildKeywordSet(pkg) {
  const family = pkg?.family;
  const { pokemon_entities, card_entities, set_entities } = entityArrays(pkg);
  const f = snapshotFacts(pkg);
  const primaryEntity = card_entities[0] ?? pokemon_entities[0] ?? null;
  const primarySet = set_entities[0] ?? null;
  const category = CATEGORY_TERM[family] ?? "pokemon cards";

  const secondary = new Set([category]);
  const longTail = new Set();
  const entityKeywords = new Set();

  if (primaryEntity) { entityKeywords.add(`${primaryEntity} pokemon card`); entityKeywords.add(`${primaryEntity} card price`); }
  if (primaryEntity && primarySet) entityKeywords.add(`${primarySet} ${primaryEntity}`);

  if (family === "market_snapshot" || family === "price_band_insight") {
    if (f.pct != null) { secondary.add(`pokemon cards under $25`); longTail.add(`how many pokemon cards cost under $25`); }
    secondary.add("pokemon tcg prices");
    secondary.add("affordable pokemon cards");
    if (f.population != null) longTail.add(`pokemon card market prices`);
    longTail.add("affordable pokemon cards to collect");
  } else if (family === "asking_vs_sold") {
    secondary.add("pokemon card market price");
    secondary.add("asking price vs market value");
    if (primaryEntity) longTail.add(`${primaryEntity} asking price vs market value`);
    longTail.add("is this pokemon card listing a good deal");
  } else if (family === "deal_drop") {
    secondary.add("pokemon card deals today");
    secondary.add("discounted pokemon cards");
    if (primaryEntity) longTail.add(`${primaryEntity} card deal`);
    longTail.add("best pokemon card deals right now");
  } else if (family === "printing_compare") {
    secondary.add("pokemon card printing differences");
    secondary.add("1st edition vs unlimited pokemon");
    if (primaryEntity) longTail.add(`${primaryEntity} printing differences explained`);
    longTail.add("why do pokemon card printings cost different amounts");
  } else if (family === "three_under_25") {
    secondary.add("pokemon cards under $25");
    secondary.add("budget pokemon cards");
    longTail.add("best cheap pokemon cards to collect");
  } else {
    secondary.add("pokemon card collecting tips");
    longTail.add("how to start collecting pokemon cards");
  }

  const captionKeywords = [category, ...[...secondary].slice(0, 2), ...(primaryEntity ? [primaryEntity] : [])];
  const onScreenKeywords = family === "market_snapshot" || family === "price_band_insight"
    ? ["POKEMON CARD MARKET", f.pct != null ? `${f.pct}% UNDER $25` : "PRICE DISTRIBUTION"]
    : family === "asking_vs_sold"
      ? ["POKEMON CARD PRICE", "ASKING VS MARKET"]
      : family === "deal_drop"
        ? ["POKEMON CARD DEAL", primaryEntity ? primaryEntity.toUpperCase() : "REAL LISTING"]
        : family === "printing_compare"
          ? ["PRINTING COMPARE", primaryEntity ? primaryEntity.toUpperCase() : "SAME CARD, DIFFERENT PRINTING"]
          : ["POKEMON CARDS", category.toUpperCase()];

  return {
    primary_search_query: category,
    secondary_search_queries: [...secondary].filter((s) => s !== category).slice(0, 5),
    long_tail_queries: [...longTail].slice(0, 3),
    entity_keywords: [...entityKeywords],
    caption_keywords: [...new Set(captionKeywords)].filter(Boolean),
    on_screen_keywords: onScreenKeywords,
  };
}

/**
 * scoreKeyword(keyword, { family, lockedEntityTerms, recentKeywords }) ->
 *   { story_relevance, entity_relevance, audience_fit, search_intent_fit,
 *     specificity, commercial_fit, collector_value, platform_fit,
 *     natural_language_fit, recent_repetition_penalty, spam_penalty, total }
 * Deterministic 0-10 per dimension, simple additive scoring - not a
 * machine-learned ranker, a transparent, auditable heuristic.
 */
export function scoreKeyword(keyword, { family = null, lockedEntityTerms = [], recentKeywords = [] } = {}) {
  const kw = String(keyword ?? "").toLowerCase();
  const mentionsLockedEntity = lockedEntityTerms.some((t) => kw.includes(String(t).toLowerCase()));
  const wordCount = kw.split(/\s+/).filter(Boolean).length;
  const isSpammy = /\b(fyp|foryou|viral|trending|explorepage)\b/i.test(kw);
  const recentCount = recentKeywords.filter((r) => String(r).toLowerCase() === kw).length;

  const dims = {
    story_relevance: family && kw.includes("pokemon") ? 8 : 5,
    entity_relevance: mentionsLockedEntity ? 9 : (kw.includes("pokemon") ? 5 : 2),
    audience_fit: 6,
    search_intent_fit: /price|deal|under|market|cheap|afford/.test(kw) ? 8 : 5,
    specificity: wordCount >= 3 ? 8 : wordCount === 2 ? 6 : 3,
    commercial_fit: /deal|price|market|value/.test(kw) ? 7 : 5,
    collector_value: /card|printing|set|rarity|edition/.test(kw) ? 7 : 5,
    platform_fit: 6,
    natural_language_fit: wordCount >= 2 && wordCount <= 8 ? 8 : 4,
    recent_repetition_penalty: -Math.min(6, recentCount * 3),
    spam_penalty: isSpammy ? -10 : 0,
  };
  const total = Object.values(dims).reduce((a, b) => a + b, 0);
  return { ...dims, total, keyword };
}

/**
 * auditKeywordEntityAlignment(keywordsOrHashtags, pkg) -> findings[]
 * Reuses the SAME entity-lock the caption pipeline already runs - a
 * Clefairy story's keywords/hashtags naming Charizard/Pikachu/etc. fail
 * exactly like a caption would, via the SAME deterministic mechanism.
 */
export function auditKeywordEntityAlignment(strings, pkg) {
  const text = (strings ?? []).join(". ");
  if (!text.trim()) return [];
  const findings = auditCaptionEntityLock(text, pkg?.semantic_manifest ?? {});
  return findings.map((f) => ({ code: "KEYWORD_ENTITY_MISMATCH_FAIL", detail: f.detail }));
}
