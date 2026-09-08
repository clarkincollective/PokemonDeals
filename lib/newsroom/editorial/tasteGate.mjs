// Phase SOCIAL-CREATIVE-4A - HUMAN TASTE GATE (§19) + 5-SECOND TEST (§20).
//
// Explicit quality dimensions a human art director would judge, scored
// DETERMINISTICALLY from structured signals (the brief, the fact lock, the
// contract). This is NOT the OpenAI Layer-5 reviewer - it is the cheap,
// repeatable gate that runs first. Its scores are persisted (§19).
//
// Pure. No I/O, no OpenAI.

import { ANTI_PATTERNS } from "./brandSystem.mjs";

// §19
export const TASTE_DIMENSIONS = Object.freeze([
  "EDITORIAL_RELEVANCE",
  "COLLECTOR_VALUE",
  "SCROLL_STOP",
  "THUMBNAIL_STORY",
  "HOBBY_NATIVE_FEEL",
  "PREMIUM_FEEL",
  "VISUAL_HIERARCHY",
  "DATA_CLARITY",
  "AI_SPAM_RISK", // higher = worse
  "SHARE_SAVE_VALUE",
]);

// dimensions where a HIGH score is bad
export const INVERTED_DIMENSIONS = Object.freeze(["AI_SPAM_RISK"]);

export const TASTE_VERDICTS = Object.freeze(["PASS", "WATCH", "HOLD"]);

// §20 - the four questions every post must answer in 5 seconds.
export const FIVE_SECOND_QUESTIONS = Object.freeze([
  "what is this about?",
  "why should I care?",
  "what is the key fact?",
  "what should I notice?",
]);

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * signals: {
 *   contract,               // storyContracts entry
 *   factLock,               // buildFactLock output
 *   brief,                  // buildCreativeBrief output
 *   relevance,              // { score } from relevanceGate (optional)
 *   printing,               // printingComparisonRelevance result (optional)
 *   dataPointCount,         // how many real numeric facts the story carries
 *   distinctVisualElements, // hero + secondary count
 *   heroDominant,           // bool - is there ONE clear focal element
 *   backgroundFamily,       // string | null
 *   captionWordCount,       // number | null
 * }
 */
export function scoreTaste(signals = {}) {
  const {
    contract = null,
    factLock = null,
    brief = null,
    relevance = null,
    printing = null,
    dataPointCount = null,
    distinctVisualElements = null,
    heroDominant = null,
    backgroundFamily = null,
  } = signals;

  const dp = Number.isFinite(dataPointCount) ? dataPointCount : (factLock?._present?.length ?? 0);
  const dve = Number.isFinite(distinctVisualElements) ? distinctVisualElements : (brief?.visual_hierarchy?.length ?? 0);
  const commercial = contract?.classification === "COMMERCIAL";

  const scores = {};

  scores.EDITORIAL_RELEVANCE = clamp(
    (relevance?.score != null ? relevance.score * 100 : 60) +
      (printing && printing.verdict === "MEANINGFUL" ? 15 : 0) +
      (printing && printing.verdict === "REJECT" ? -60 : 0)
  );

  scores.COLLECTOR_VALUE = clamp(
    (contract ? 55 : 30) +
      (dp >= 3 ? 20 : dp * 6) +
      (contract?.classification === "EDITORIAL" ? 10 : 5) +
      (factLock?.card_name ? 10 : 0)
  );

  scores.SCROLL_STOP = clamp(
    45 +
      (heroDominant ? 20 : heroDominant === false ? -15 : 0) +
      (factLock?.discount_pct != null ? Math.min(20, Number(factLock.discount_pct) / 3) : 0) +
      (dp >= 2 ? 10 : 0)
  );

  scores.THUMBNAIL_STORY = clamp(
    50 +
      (dve > 0 && dve <= 4 ? 20 : dve > 4 ? -15 : 0) +
      (heroDominant ? 15 : 0) +
      (brief?.hook_rule ? 5 : 0)
  );

  scores.HOBBY_NATIVE_FEEL = clamp(
    55 +
      (factLock?.card_name || factLock?.card_tcgplayer_id ? 20 : -20) +
      (contract ? 10 : 0) +
      (backgroundFamily && /market|generic|abstract/.test(backgroundFamily) ? -10 : 0)
  );

  scores.PREMIUM_FEEL = clamp(
    58 +
      (heroDominant ? 12 : 0) +
      (dve <= 4 ? 12 : -12) +
      (backgroundFamily && /neon|gradient|crypto|luxury/.test(backgroundFamily) ? -30 : 0)
  );

  scores.VISUAL_HIERARCHY = clamp(
    40 +
      (heroDominant ? 25 : heroDominant === false ? -20 : 0) +
      (Array.isArray(brief?.visual_hierarchy) && brief.visual_hierarchy.length >= 2 ? 20 : 0) +
      (dve <= 4 ? 10 : -10)
  );

  scores.DATA_CLARITY = clamp(
    35 +
      (dp >= 3 ? 30 : dp * 10) +
      (factLock?.market_price != null || factLock?.sold_price != null ? 15 : 0) +
      (contract?.required_facts?.length ? 10 : 0)
  );

  // AI_SPAM_RISK - higher is worse. Starts low, rises with red flags.
  let spam = 18;
  if (!factLock?.card_name && !factLock?.card_tcgplayer_id) spam += 25; // no real card identity
  if (dve > 5) spam += 15; // clutter
  if (heroDominant === false) spam += 15;
  if (backgroundFamily && ANTI_PATTERNS.some((p) => p.split(" ")[0] && backgroundFamily.includes(p.split(" ")[0]))) spam += 20;
  if (dp === 0) spam += 15;
  scores.AI_SPAM_RISK = clamp(spam);

  scores.SHARE_SAVE_VALUE = clamp(
    (contract?.classification === "EDITORIAL" ? 55 : 45) +
      (dp >= 3 ? 15 : 0) +
      (printing && printing.verdict === "MEANINGFUL" ? 15 : 0) +
      (factLock?.discount_pct != null && Number(factLock.discount_pct) >= 35 ? 15 : 0)
  );

  // overall: mean of the "good" dimensions minus a penalty for spam risk
  const goodKeys = TASTE_DIMENSIONS.filter((k) => !INVERTED_DIMENSIONS.includes(k));
  const goodMean = goodKeys.reduce((a, k) => a + scores[k], 0) / goodKeys.length;
  const overall = clamp(goodMean - Math.max(0, scores.AI_SPAM_RISK - 40) * 0.8);

  let verdict = "PASS";
  const floors = { PASS: 68, WATCH: 55 };
  if (overall < floors.WATCH || scores.AI_SPAM_RISK >= 62 || scores.VISUAL_HIERARCHY < 40 || scores.EDITORIAL_RELEVANCE < 45) {
    verdict = "HOLD";
  } else if (overall < floors.PASS || scores.AI_SPAM_RISK >= 48 || scores.DATA_CLARITY < 45) {
    verdict = "WATCH";
  }

  return { scores: Object.freeze(scores), overall, verdict, commercial };
}

// §20 - can the four questions be answered from the brief + lock alone?
export function fiveSecondTest({ brief, factLock, contract } = {}) {
  const answers = {};
  const unresolved = [];

  answers["what is this about?"] =
    brief?.story_type && (factLock?.card_name || contract?.meaningful)
      ? `${brief.story_type}${factLock?.card_name ? ` - ${factLock.card_name}` : ""}`
      : null;
  if (!answers["what is this about?"]) unresolved.push("what is this about?");

  answers["why should I care?"] = brief?.why_it_matters ?? contract?.meaningful ?? null;
  if (!answers["why should I care?"]) unresolved.push("why should I care?");

  const keyFact =
    factLock?.discount_pct != null
      ? `${factLock.discount_pct}% below reference`
      : factLock?.market_price != null && factLock?.listed_price != null
        ? `$${factLock.listed_price} vs $${factLock.market_price}`
        : Array.isArray(brief?.supporting_facts) && brief.supporting_facts.length
          ? brief.supporting_facts[0]
          : null;
  answers["what is the key fact?"] = keyFact;
  if (!keyFact) unresolved.push("what is the key fact?");

  answers["what should I notice?"] = brief?.hero_element ?? (brief?.visual_hierarchy ?? [])[0] ?? null;
  if (!answers["what should I notice?"]) unresolved.push("what should I notice?");

  const verdict = unresolved.length === 0 ? "PASS" : unresolved.length === 1 ? "WATCH" : "HOLD";
  return { answers, unresolved, verdict };
}

export const TASTE_GATE_VERSION = "4a.1";
