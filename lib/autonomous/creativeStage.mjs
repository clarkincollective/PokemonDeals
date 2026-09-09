// Phase SOCIAL-AUTOPILOT-1 §7/§8 - STATIC CREATIVE STAGE (GENERATE ONCE,
// REUSE EVERYWHERE).
//
// Wraps the APPROVED, FROZEN FULL_GENERATIVE_SOCIAL pipeline
// (lib/newsroom/hybrid/fullGenerativePipeline.runFullGenerativeSocial) -
// this module does not touch its prompt, its auditors, or its brand lock.
// Its only job is: before spending a single OpenAI call, check whether
// this EXACT story snapshot already has an approved master
// (masterCreativeCache, keyed story_id+semantic_hash - the same cache
// 4C.2-4C.7's video derivative already reads). Cache hit = $0. Cache miss
// = generate once, through the existing budget ledger, then store it so
// every platform/video derivative for this story reuses the same master.

import { getMasterCreative, putMasterCreative } from "../newsroom/video/masterCreativeCache.mjs";
import { buildSemanticManifest } from "../newsroom/hybrid/semanticManifest.mjs";
import { buildFactLock } from "../newsroom/editorial/factLock.mjs";
import { contractFor } from "../newsroom/editorial/storyContracts.mjs";
import { failure, isFailureState } from "../newsroom/editorial/failureStates.mjs";
import { videoSemanticHash } from "../newsroom/video/videoDirector.mjs";
import { totalCostUsd } from "../newsroom/hybrid/budget.mjs";

function totalCostUsdOf(budget) {
  try { return budget ? totalCostUsd(budget) : null; } catch { return null; }
}

export const CREATIVE_STAGE_VERSION = "auto1.1";

export const FAMILY_CONTRACT = Object.freeze({
  deal_drop: "DEAL_DROP",
  three_under_25: "THREE_UNDER_25",
  market_snapshot: "MARKET_SNAPSHOT",
  price_band_insight: "MARKET_SNAPSHOT",
  asking_vs_sold: "WHY_SOLD_PRICES_MATTER",
  printing_compare: "EXACT_PRINTING_MATTERS",
  evergreen: "BUYER_EDUCATION",
});

// §8 - simple daily/monthly USD ledger, additive to (not a replacement
// for) the existing per-call newBudget() ledger fullGenerativePipeline
// already enforces. Configurable via env; defaults are conservative.
export function readGenerationBudgetConfig(env = process.env) {
  const daily = Number(env.SOCIAL_DAILY_IMAGE_GEN_BUDGET ?? 2);
  const monthly = Number(env.SOCIAL_MONTHLY_IMAGE_GEN_BUDGET ?? 20);
  return { dailyUsd: Number.isFinite(daily) ? daily : 2, monthlyUsd: Number.isFinite(monthly) ? monthly : 20 };
}

export function withinGenerationBudget(spentTodayUsd, spentMonthUsd, config) {
  return spentTodayUsd < config.dailyUsd && spentMonthUsd < config.monthlyUsd;
}

/**
 * resolveCreative(pkg, { cardImagePaths, cardCatalogRow, env, budget,
 * spentTodayUsd, spentMonthUsd, allowGenerate })
 *
 *  -> { ok, creative, semanticManifest, factLock, source: "cache"|"generated", costUsd }
 *     or a failure() shape ({ ok:false, state, reason }).
 *
 * NEVER re-queries the story's factual fields - `pkg.snapshot` is the
 * single source of truth passed straight into buildSemanticManifest via
 * the caller-supplied `resolved` shape (the same shape the 5A.1 proof
 * scripts already build from a resolver's `.data`).
 */
// Exposed so a proof/pack script can pre-seed masterCreativeCache under
// EXACTLY the key resolveCreative will look up, without duplicating the
// semantic-manifest construction logic.
export function computeCreativeCacheKey(pkg, { resolved, cardCatalogRow = null } = {}) {
  const snap = pkg.snapshot;
  const contractId = FAMILY_CONTRACT[pkg.family];
  if (!snap || !contractId) return null;
  const contract = contractFor(contractId);
  const factLock = buildFactLock({ facts_json: { prices: snap.prices, market_reference_values: snap.market_reference_values, derived_percentages: snap.derived_percentages, tracked_population: snap.tracked_population } });
  const semanticManifest = buildSemanticManifest({ layout: layoutFor(pkg.family), factLock, resolved, contract, cardCatalogRow });
  return { semanticManifest, factLock, cacheKey: videoSemanticHash(semanticManifest) };
}

export async function resolveCreative(pkg, {
  resolved, cardImagePaths = [], cardCatalogRow = null, env = process.env,
  budget = null, spentTodayUsd = 0, spentMonthUsd = 0, allowGenerate = true,
} = {}) {
  const snap = pkg.snapshot;
  if (!snap) return { ok: false, ...failure("GENERATION_FAILED", "no locked snapshot - refusing to generate creative from unfrozen facts", { story_id: pkg.story_id }) };

  const contractId = FAMILY_CONTRACT[pkg.family];
  if (!contractId) return { ok: false, ...failure("CARD_FORWARD_RENDER_UNAVAILABLE", `no known creative contract for family "${pkg.family}"`, { story_id: pkg.story_id }) };

  // NOTE: the cache key MUST be videoSemanticHash(semanticManifest), the
  // exact same derivation lib/newsroom/video/professionalSocialLoop.mjs
  // uses internally to look up the master for the video stage - keying on
  // anything else (e.g. the snapshot hash) would make the two stages miss
  // each other's cache entry and silently double-generate.
  const { semanticManifest, factLock, cacheKey } = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow });

  const cached = getMasterCreative({ storyId: pkg.story_id, semanticHash: cacheKey });
  if (cached) {
    return { ok: true, creative: cached, semanticManifest, factLock, source: "cache", costUsd: 0 };
  }

  if (!allowGenerate) {
    return { ok: false, ...failure("MASTER_CREATIVE_UNAVAILABLE", `no approved static master cached for ${pkg.story_id} and fresh generation is disabled for this run`, { story_id: pkg.story_id }) };
  }
  const config = readGenerationBudgetConfig(env);
  if (!withinGenerationBudget(spentTodayUsd, spentMonthUsd, config)) {
    return { ok: false, ...failure("BUDGET_EXCEEDED_HOLD", `image-generation budget exhausted (today $${spentTodayUsd.toFixed(2)}/$${config.dailyUsd}, month $${spentMonthUsd.toFixed(2)}/$${config.monthlyUsd})`, { story_id: pkg.story_id }) };
  }

  const { runFullGenerativeSocial } = await import("../newsroom/hybrid/fullGenerativePipeline.mjs");
  const r = await runFullGenerativeSocial({
    story: { story_id: pkg.story_id, series: pkg.series, subject_id: pkg.story_id, facts_json: factLock.facts ?? {} },
    platform: "instagram", layout: layoutFor(pkg.family), resolved, cardImagePaths, cardCatalogRow, env, budget,
  });
  if (!r.ok) {
    return { ok: false, ...failure(isKnownFailureState(r.state) ? r.state : "GENERATION_FAILED", r.reason ?? "generation failed", { story_id: pkg.story_id, detail: r.state }) };
  }
  // NOTE (SAFEAREA-1): runFullGenerativeSocial returns the image bytes as
  // `imageB64` (camelCase) - this previously read `image_b64`/`b64`, which
  // don't exist on that return shape, so any REAL (non-cached) generation
  // through this path would have silently stored an empty image buffer.
  // Every prior AUTOPILOT phase only ever exercised the cache-hit branch
  // above (seeded from separately-generated masters), so this never
  // surfaced until this phase's real regeneration exercised it for the
  // first time.
  const stored = putMasterCreative({
    story_id: pkg.story_id, semantic_hash: cacheKey, family: pkg.family,
    card_assets: cardImagePaths, fact_manifest: factLock, visualization_manifest: snap.visualization_manifest,
    card_metadata_lock: r.card_metadata_lock ?? null, verification: r.verification ?? {}, source: "full_generative_social",
  }, { imageBufferOrPath: Buffer.from(r.imageB64 ?? "", "base64") });
  return { ok: true, creative: stored, semanticManifest, factLock, source: "generated", costUsd: totalCostUsdOf(r.budget) ?? 0.45 };
}

function layoutFor(family) {
  if (family === "deal_drop") return "deal_hero";
  if (family === "three_under_25") return "three_up";
  if (family === "market_snapshot" || family === "price_band_insight") return "market_shape";
  if (family === "asking_vs_sold") return "asking_vs_sold";
  if (family === "printing_compare") return "printing_compare";
  return "market_shape";
}

function isKnownFailureState(s) {
  return isFailureState(s);
}
