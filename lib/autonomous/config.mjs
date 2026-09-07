// Phase AUTO-1 - AUTONOMOUS ORCHESTRATION CONFIG + SAFETY FLAGS.
//
// The autonomous layer is NON-MUTATING by default. It reads flags from
// the environment; it never writes config, never flips a flag, holds no
// credential, and imports no provider.
//
// AUTONOMY REPLACES ROUTINE HUMAN APPROVAL ONLY. Every factual /
// compliance / freshness / QA / drift / duplicate gate in the existing
// distribution + digest stacks still runs and still blocks. These flags
// cannot bypass any of them - see lib/social/distribution/gates.mjs,
// lib/social/distribution/revalidate.mjs, and app/api/send-digest.
//
// FIVE independent, additive controls per surface. NONE overloads an
// existing publish flag (SOCIAL_PUBLISH_ENABLED / SOCIAL_PUBLISH_DRY_RUN
// / RIGHTS_STATE.publishing / DIGEST_SEND_ENABLED all still apply on top).
//
//   SOCIAL_AUTONOMOUS_ENABLED   "true" -> autonomous social MAY run live
//   SOCIAL_AUTONOMOUS_KILL      "true" -> HARD STOP: no social mutation, ever
//   SOCIAL_AUTONOMOUS_STAGE     STAGE_0 (default) | STAGE_1 | STAGE_2 | STAGE_3
//   EMAIL_AUTONOMOUS_ENABLED    "true" -> autonomous digest MAY run live
//   EMAIL_AUTONOMOUS_KILL       "true" -> HARD STOP: no digest send, ever
//   EMAIL_AUTONOMOUS_STAGE      EMAIL_STAGE_0 (default) | EMAIL_STAGE_1 | EMAIL_STAGE_2
//
// KILL BEATS EVERYTHING. If a kill switch is true, the surface is
// SUSPENDED regardless of ENABLED, STAGE, or the CLI's --live flag.
//
// Social and email are fully independent: SOCIAL_AUTONOMOUS_ENABLED never
// enables email and EMAIL_AUTONOMOUS_ENABLED never enables social.

const truthy = (v) => String(v ?? "").trim().toLowerCase() === "true";

// --- social rollout stages (§10) ------------------------------------
// A "content item" = one content_id. Its per-platform placements (IG /
// TikTok / X / YouTube cuts of the SAME content_id) do NOT count
// separately toward this cap.
export const SOCIAL_STAGES = Object.freeze({
  STAGE_0: { id: "STAGE_0", maxContentPerDay: 0, mutatesProviders: false, label: "dry-run only" },
  STAGE_1: { id: "STAGE_1", maxContentPerDay: 1, mutatesProviders: true, label: "max 1 content item/day" },
  STAGE_2: { id: "STAGE_2", maxContentPerDay: 2, mutatesProviders: true, label: "max 2 content items/day" },
  STAGE_3: { id: "STAGE_3", maxContentPerDay: Infinity, mutatesProviders: true, label: "normal planner ceilings" },
});
export const DEFAULT_SOCIAL_STAGE = "STAGE_0";

// --- email rollout stages (§24) -----------------------------------
export const EMAIL_STAGES = Object.freeze({
  EMAIL_STAGE_0: { id: "EMAIL_STAGE_0", maxDigestsPerWeek: 0, mutatesProviders: false, label: "dry-run only" },
  EMAIL_STAGE_1: { id: "EMAIL_STAGE_1", maxDigestsPerWeek: 1, mutatesProviders: true, label: "max 1 digest/week" },
  EMAIL_STAGE_2: { id: "EMAIL_STAGE_2", maxDigestsPerWeek: 2, mutatesProviders: true, label: "max 2 digests/week" },
});
export const DEFAULT_EMAIL_STAGE = "EMAIL_STAGE_0";

function normStage(raw, table, dflt) {
  const s = String(raw ?? "").trim().toUpperCase();
  return table[s] ? s : dflt;
}

// --- resolved posture -------------------------------------------------
//
//   mode:  "SUSPENDED" (kill) | "OFF" (not enabled) | "DRY_RUN" (enabled,
//          stage 0, or the CLI stayed in dry-run) | "LIVE" (enabled +
//          mutating stage + the caller asked to go live)
//
// `canMutateProviders` is the single boolean the CLIs and the cron
// endpoints check before ANY external write. It is true ONLY when:
//   kill == false  AND  enabled == true  AND  stage.mutatesProviders
//   AND the caller explicitly requested live (requestLive == true).

export function resolveSocialPosture(env = process.env, { requestLive = false } = {}) {
  const kill = truthy(env.SOCIAL_AUTONOMOUS_KILL);
  const enabled = truthy(env.SOCIAL_AUTONOMOUS_ENABLED);
  const stageId = normStage(env.SOCIAL_AUTONOMOUS_STAGE, SOCIAL_STAGES, DEFAULT_SOCIAL_STAGE);
  const stage = SOCIAL_STAGES[stageId];
  const canMutateProviders = !kill && enabled && stage.mutatesProviders && requestLive === true;
  const mode = kill ? "SUSPENDED" : !enabled ? "OFF" : canMutateProviders ? "LIVE" : "DRY_RUN";
  return {
    surface: "social",
    kill,
    enabled,
    stageId,
    stage,
    maxContentPerDay: stage.maxContentPerDay,
    requestLive: Boolean(requestLive),
    canMutateProviders,
    mode,
  };
}

export function resolveEmailPosture(env = process.env, { requestLive = false } = {}) {
  const kill = truthy(env.EMAIL_AUTONOMOUS_KILL);
  const enabled = truthy(env.EMAIL_AUTONOMOUS_ENABLED);
  const stageId = normStage(env.EMAIL_AUTONOMOUS_STAGE, EMAIL_STAGES, DEFAULT_EMAIL_STAGE);
  const stage = EMAIL_STAGES[stageId];
  const canMutateProviders = !kill && enabled && stage.mutatesProviders && requestLive === true;
  const mode = kill ? "SUSPENDED" : !enabled ? "OFF" : canMutateProviders ? "LIVE" : "DRY_RUN";
  return {
    surface: "email",
    kill,
    enabled,
    stageId,
    stage,
    maxDigestsPerWeek: stage.maxDigestsPerWeek,
    requestLive: Boolean(requestLive),
    canMutateProviders,
    mode,
  };
}

// One-line human summary for the dashboard / CLI header.
export function describePosture(p) {
  const bits = [
    `${p.surface.toUpperCase()} AUTONOMOUS: ${p.mode}`,
    `stage ${p.stageId}`,
    `enabled=${p.enabled}`,
    `kill=${p.kill}`,
  ];
  if (p.surface === "social") bits.push(`max ${p.maxContentPerDay === Infinity ? "∞" : p.maxContentPerDay} content/day`);
  else bits.push(`max ${p.maxDigestsPerWeek}/week`);
  return bits.join("  |  ");
}
