// Phase SOCIAL-NEWSROOM-1 - ORGANIC REACH SCORE (§14, §24).
//
// Independent of the conversion score (§15) - the two are NEVER merged
// into one opaque number. This asks: "if the logo and CTA were stripped,
// would this still be useful or interesting Pokemon-card content?"
//
// Every input is a deterministic function of the frozen story facts +
// the series definition. No engagement counts (there are none yet), no
// AI. Range 0..1, with a full breakdown.

import { getSeries } from "./series.mjs";
import { RECOGNIZABLE_SPECIES } from "../planner/scoring.mjs";

const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

// weights sum to 1.00
export const ORGANIC_WEIGHTS = Object.freeze({
  hook_strength: 0.16, // is there a concrete, specific hook fact
  recognisability: 0.14, // a Pokemon / set people know
  novelty: 0.12, // series not a bare "cheap card" repeat
  curiosity: 0.10, // an open loop / question / comparison
  utility: 0.14, // does it teach or help a buyer decide
  save_value: 0.10, // worth bookmarking (data / list / explainer)
  share_value: 0.09, // worth sending to a friend
  comment_potential: 0.06, // invites an opinion
  visual_potential: 0.06, // canonical art / strong first frame
  audience_breadth: 0.03, // niche vs broad appeal
});

// pillars whose value is inherently informational -> high utility/save.
const AUTHORITY_PILLARS = new Set(["MARKET", "EDUCATION", "BEHIND_THE_FINDER"]);
const STORY_PILLARS = new Set(["STORY", "COMPARISON"]);

export function organicBreakdown(story = {}) {
  const def = getSeries(story.series) || {};
  const f = story.facts_json ?? {};
  const pillar = story.pillar ?? def.pillar ?? "DEALS";
  const species = String(story.pokemon ?? f.species ?? "").toLowerCase();
  const recognisable = RECOGNIZABLE_SPECIES.has(species);
  const disc = Number(f.discount_pct ?? 0);
  const savedUsd = Number(f.dollars_saved ?? 0);
  const hasArt = /^\d+$/.test(String(f.card_tcgplayer_id ?? "").trim());

  const c = {
    // a real, specific number (discount / saving / movement / distribution stat)
    hook_strength: clamp01(
      (disc >= 0.3 ? 0.5 : disc >= 0.15 ? 0.3 : 0) +
        (savedUsd >= 100 ? 0.3 : savedUsd >= 40 ? 0.18 : 0) +
        (f.headline_fact ? 0.4 : 0)
    ),
    recognisability: recognisable ? 0.95 : story.pokemon ? 0.55 : pillar === "MARKET" ? 0.6 : 0.4,
    novelty: story.series === "DEAL_DROP" ? 0.45 : STORY_PILLARS.has(pillar) ? 0.9 : AUTHORITY_PILLARS.has(pillar) ? 0.8 : 0.6,
    curiosity: STORY_PILLARS.has(pillar) || story.narrative ? 0.9 : pillar === "MARKET" ? 0.65 : pillar === "DEALS" ? 0.5 : 0.55,
    utility: AUTHORITY_PILLARS.has(pillar) ? 0.9 : pillar === "BUDGET" ? 0.8 : pillar === "COMPARISON" ? 0.75 : pillar === "DEALS" ? 0.55 : 0.5,
    save_value: pillar === "MARKET" || pillar === "EDUCATION" ? 0.9 : pillar === "BUDGET" ? 0.75 : STORY_PILLARS.has(pillar) ? 0.6 : 0.4,
    share_value: STORY_PILLARS.has(pillar) ? 0.8 : pillar === "DEALS" && disc >= 0.5 ? 0.7 : pillar === "MARKET" ? 0.55 : 0.45,
    comment_potential: STORY_PILLARS.has(pillar) || story.narrative ? 0.8 : pillar === "COMPARISON" ? 0.75 : 0.4,
    visual_potential: hasArt ? (story.card_ids?.length > 1 ? 0.8 : 0.9) : pillar === "MARKET" ? 0.6 : 0.4,
    audience_breadth: recognisable ? 0.9 : AUTHORITY_PILLARS.has(pillar) ? 0.7 : 0.5,
  };

  let raw = 0;
  const weighted = {};
  for (const k of Object.keys(ORGANIC_WEIGHTS)) {
    weighted[k] = Number((clamp01(c[k]) * ORGANIC_WEIGHTS[k]).toFixed(4));
    raw += weighted[k];
  }
  return { components: c, weighted, score: Number(clamp01(raw).toFixed(3)) };
}

export function organicScore(story) {
  return organicBreakdown(story).score;
}

// §24 human-feel test, operationalised: strip logo + CTA, is the standalone
// content still worth it? Anything below this should NOT be autonomously
// backlogged (§25).
export const ORGANIC_MIN_FOR_BACKLOG = 0.55;
export const ORGANIC_EXCEPTIONAL = 0.78;

export function passesHumanFeel(story) {
  return organicScore(story) >= ORGANIC_MIN_FOR_BACKLOG;
}
