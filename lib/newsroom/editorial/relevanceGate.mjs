// Phase SOCIAL-CREATIVE-4A - STORY RELEVANCE GATE (§2).
//
// BEFORE any creative work: is this story actually worth publishing? A
// story can be technically valid (real card, real prices) and still be
// editorially pointless - two unrelated Umbreons is the canonical case.
// Such a story returns EDITORIAL_WITHHOLD.
//
// Deterministic. No I/O, no OpenAI. Composes: story contract (§3), fact
// lock (§7), printing relevance (§4), taste gate (§19) and the 5-second
// test (§20).

import { contractFor } from "./storyContracts.mjs";
import { buildFactLock, factLockHash } from "./factLock.mjs";
import { printingComparisonRelevance } from "./printingRelevance.mjs";
import { scoreTaste, fiveSecondTest } from "./tasteGate.mjs";
import { failure } from "./failureStates.mjs";

// §2 - the scored dimensions and their weights (sum = 1).
export const RELEVANCE_DIMENSIONS = Object.freeze({
  collector_relevance: 0.2,
  novelty: 0.14,
  usefulness: 0.16,
  scroll_stop: 0.12,
  data_strength: 0.14,
  visual_potential: 0.1,
  share_save: 0.08,
  brand_fit: 0.06,
});

export const RELEVANCE_MIN = 0.62;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * opts:
 *   story           - resolved story opportunity ({ series/story_type, facts_json, ... })
 *   sourceRows      - the real DB rows behind it (optional, improves scoring)
 *   platform        - target platform
 *   printingPair    - { high, low } catalogue rows for EXACT_PRINTING_MATTERS (optional)
 *   originality     - 0..1 originality score from originalityScore.mjs (optional)
 *   context         - recent/planned story context (unused directly here; pass-through)
 */
export function assessStoryRelevance(opts = {}) {
  const { story = {}, platform = "instagram", printingPair = null, originality = null } = opts;
  const series = String(story.series ?? story.story_type ?? "").toUpperCase();
  const contract = contractFor(series);

  const reasons = [];
  const factLock = buildFactLock(story.facts_json ? story : { facts_json: story.facts_json ?? story });

  // ---- hard gates ------------------------------------------------
  if (!contract) {
    return withhold(`no story contract for "${series || "(unknown)"}"`, { series, factLock });
  }

  // printing-comparison relevance is a HARD gate for the printing families
  let printing = null;
  if (contract.id === "EXACT_PRINTING_MATTERS" || (contract.id === "ASKING_VS_SOLD" && printingPair)) {
    if (!printingPair?.high || !printingPair?.low) {
      return withhold("EXACT_PRINTING_MATTERS needs a resolved printing pair to assess relevance", { series, contract, factLock });
    }
    printing = printingComparisonRelevance(printingPair.high, printingPair.low);
    if (printing.verdict !== "MEANINGFUL") {
      return withhold(`PRINTING_COMPARISON_RELEVANCE_CHECK: ${printing.reason}`, { series, contract, factLock, printing });
    }
  }

  // required facts present?
  const missingFacts = requiredFactGaps(contract, factLock, story);
  if (missingFacts.length > 2 || (missingFacts.length && contract.classification === "COMMERCIAL")) {
    return withhold(`story cannot satisfy its contract - missing: ${missingFacts.join(", ")}`, { series, contract, factLock, printing });
  }
  if (missingFacts.length) reasons.push(`thin on: ${missingFacts.join(", ")}`);

  // ---- dimension scores ---------------------------------------
  const dp = factLock._present.length;
  const dpNumeric = ["listed_price", "market_price", "sold_price", "discount_pct", "current_bid", "shipping", "sample_size", "tracked_count", "percentages"].filter((k) => factLock[k] != null).length;

  const d = {
    collector_relevance: clamp01(0.45 + (factLock.card_name ? 0.25 : 0) + (contract.classification === "EDITORIAL" ? 0.15 : 0.1) + (printing?.verdict === "MEANINGFUL" ? 0.15 : 0)),
    novelty: clamp01(originality != null ? originality : 0.6),
    usefulness: clamp01(0.4 + Math.min(0.4, dpNumeric * 0.12) + (contract.acceptable_hook ? 0.1 : 0)),
    scroll_stop: clamp01(0.4 + (factLock.discount_pct != null ? Math.min(0.3, Number(factLock.discount_pct) / 120) : 0.05) + (dpNumeric >= 2 ? 0.15 : 0)),
    data_strength: clamp01(0.2 + Math.min(0.6, dpNumeric * 0.15) + (factLock.market_price != null || factLock.sold_price != null ? 0.15 : 0)),
    visual_potential: clamp01(0.35 + (contract.layout_family ? 0.3 : 0.1) + (factLock.card_tcgplayer_id ? 0.2 : 0)),
    share_save: clamp01(0.4 + (contract.classification === "EDITORIAL" ? 0.2 : 0.1) + (printing?.verdict === "MEANINGFUL" ? 0.2 : 0) + (Number(factLock.discount_pct) >= 35 ? 0.15 : 0)),
    brand_fit: clamp01(0.55 + (factLock.card_name || factLock.card_tcgplayer_id ? 0.25 : -0.25) + (contract ? 0.1 : 0)),
  };

  let score = 0;
  for (const [dim, w] of Object.entries(RELEVANCE_DIMENSIONS)) score += (d[dim] ?? 0) * w;
  score = Number(score.toFixed(3));

  // ---- taste + 5-second test ---------------------------------
  const brief = { story_type: contract.id, why_it_matters: contract.meaningful, hook_rule: contract.acceptable_hook, hero_element: contract.required_visual_evidence[0], visual_hierarchy: [...contract.required_visual_evidence], supporting_facts: [] };
  const taste = scoreTaste({
    contract, factLock, brief, relevance: { score }, printing,
    dataPointCount: dpNumeric, distinctVisualElements: contract.required_visual_evidence.length, heroDominant: true,
  });
  const fiveSec = fiveSecondTest({ brief, factLock, contract });

  if (taste.verdict === "HOLD") return withhold(`taste gate HOLD (overall ${taste.overall}; AI_SPAM_RISK ${taste.scores.AI_SPAM_RISK})`, { series, contract, factLock, printing, score, dimensions: d, taste, fiveSec });
  if (fiveSec.unresolved.length >= 2) return withhold(`fails the 5-second test - unanswerable: ${fiveSec.unresolved.join("; ")}`, { series, contract, factLock, printing, score, dimensions: d, taste, fiveSec });

  if (score < RELEVANCE_MIN) {
    return withhold(`aggregate relevance ${score} < ${RELEVANCE_MIN}${reasons.length ? ` (${reasons.join("; ")})` : ""}`, { series, contract, factLock, printing, score, dimensions: d, taste, fiveSec });
  }
  if (taste.verdict === "WATCH") reasons.push(`taste WATCH (overall ${taste.overall})`);
  if (fiveSec.verdict === "WATCH") reasons.push(`5-second test WATCH (${fiveSec.unresolved[0]})`);

  return {
    ok: true,
    verdict: "PUBLISHABLE",
    score,
    dimensions: d,
    reasons,
    contract_id: contract.id,
    classification: contract.classification,
    fact_lock_hash: factLockHash(factLock).short,
    printing,
    taste,
    five_second: fiveSec,
  };
}

function withhold(reason, extra = {}) {
  return {
    ...failure("EDITORIAL_WITHHOLD", reason, { stage: "relevance_gate", detail: extra }),
    verdict: "EDITORIAL_WITHHOLD",
    score: extra.score ?? null,
    dimensions: extra.dimensions ?? null,
    contract_id: extra.contract?.id ?? null,
    printing: extra.printing ?? null,
    taste: extra.taste ?? null,
    five_second: extra.fiveSec ?? null,
  };
}

// A coarse check that the contract's headline facts are available. Not a
// full schema - the render resolvers own the exact shape - but enough to
// stop an empty story reaching the creative director.
function requiredFactGaps(contract, factLock, story) {
  const have = new Set(factLock._present);
  const gaps = [];
  const need = contract.id;
  const card = have.has("card_name") || have.has("card_tcgplayer_id");
  const price = have.has("listed_price") || have.has("market_price") || have.has("sold_price");
  const pct = have.has("discount_pct") || have.has("percentages");

  if (["DEAL_DROP", "BIGGEST_FIND", "ASKING_VS_SOLD", "PRICE_DROP"].includes(need)) {
    if (!card) gaps.push("card identity");
    if (!price) gaps.push("a real price + reference");
    if (need !== "PRICE_DROP" && !pct && !(have.has("listed_price") && have.has("market_price"))) gaps.push("the saving");
  } else if (need === "THREE_UNDER_25") {
    const items = story?.facts_json?.items ?? story?.items ?? [];
    if (!Array.isArray(items) || items.length < 3) gaps.push("three distinct real cards");
  } else if (need === "MARKET_SNAPSHOT") {
    const f = story?.facts_json ?? {};
    if (f.priced_cards == null && f.under_25_pct == null && !have.has("percentages")) gaps.push("a real distribution stat");
  } else if (need === "EXACT_PRINTING_MATTERS") {
    // relevance already gated on the pair; nothing extra
  } else if (contract.classification === "EDITORIAL") {
    // evergreen explainers can be concept-only
  }
  return gaps;
}

export const RELEVANCE_GATE_VERSION = "4a.1";
