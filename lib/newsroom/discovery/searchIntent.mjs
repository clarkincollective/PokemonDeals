// Phase SOCIAL-DISCOVERY-1 SS20 - SEARCH INTENT CLASSIFICATION.

export const SEARCH_INTENTS = Object.freeze([
  "INFORMATIONAL", "COMMERCIAL_RESEARCH", "DEAL_DISCOVERY", "PRICE_DISCOVERY",
  "COLLECTOR_EDUCATION", "CARD_IDENTIFICATION", "SET_RESEARCH", "MARKET_ANALYSIS",
]);

const FAMILY_INTENT = Object.freeze({
  market_snapshot: ["MARKET_ANALYSIS", "INFORMATIONAL"],
  price_band_insight: ["MARKET_ANALYSIS", "PRICE_DISCOVERY"],
  asking_vs_sold: ["COMMERCIAL_RESEARCH", "PRICE_DISCOVERY"],
  deal_drop: ["COMMERCIAL_RESEARCH", "DEAL_DISCOVERY"],
  printing_compare: ["COLLECTOR_EDUCATION", "CARD_IDENTIFICATION"],
  three_under_25: ["DEAL_DISCOVERY", "PRICE_DISCOVERY"],
  evergreen: ["COLLECTOR_EDUCATION", "INFORMATIONAL"],
});

/**
 * classifySearchIntent(family) -> { search_intent: [...], collector_intent, commercial_intent }
 */
export function classifySearchIntent(family) {
  const intents = FAMILY_INTENT[family] ?? ["INFORMATIONAL"];
  const collector_intent = intents.some((i) => ["COLLECTOR_EDUCATION", "CARD_IDENTIFICATION", "SET_RESEARCH"].includes(i));
  const commercial_intent = intents.some((i) => ["COMMERCIAL_RESEARCH", "DEAL_DISCOVERY", "PRICE_DISCOVERY"].includes(i));
  return { search_intent: intents, collector_intent, commercial_intent };
}
