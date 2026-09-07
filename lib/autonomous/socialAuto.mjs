// Phase AUTO-1 - AUTONOMOUS SOCIAL ORCHESTRATION (pure decision logic).
//
// Composes the EXISTING systems - it re-implements nothing:
//   planner tiers         lib/social/planner/tiers.qualityTier
//   cadence ceilings       lib/social/planner/platformRoles
//   batch freeze + drift   lib/social/distribution/batch
//   duplicate index        lib/social/distribution/ledger.duplicateOf
//
// This module makes NO network call, renders nothing, and mutates
// nothing. It takes the current live state and returns a PLAN describing
// what an autonomous run WOULD do, plus `wouldMutate` - true only when
// every gate is green AND the resolved posture allows a live mutation.
//
// AUTONOMY REPLACES ROUTINE HUMAN APPROVAL ONLY (§2). The plan still
// carries every blocker from tier / freshness / drift / duplicate /
// cadence / stage-cap checks; a real run refuses on any of them.

import { qualityTier, TIER_RANK } from "../social/planner/tiers.mjs";
import { CADENCE_CEILING_PER_DAY, CAROUSEL_CEILING_PER_WEEK, BRAND_AD_CEILING_PER_WEEK, serviceOf } from "../social/planner/platformRoles.mjs";
import { factDrift, approvalChecksum } from "../social/distribution/batch.mjs";
import { duplicateOf, IN_FLIGHT_OR_DONE } from "../social/distribution/ledger.mjs";

// --- AUTONOMOUS QUALITY FLOOR (§6) - stricter than planner eligibility.
export const AUTONOMOUS_QUALITY_FLOOR = Object.freeze({
  deal_drop: { minTier: "A_TIER" }, // S or A only; B_TIER never
  market_mover: { minConfidence: 0.9 }, // high-confidence movements only
  hook_carousel: { minDistinctCards: 3, requireCanonicalArt: true },
  brand_ad: { weeklyCeiling: BRAND_AD_CEILING_PER_WEEK }, // rare; existing ceiling
  market_snapshot: { minTier: "A_TIER" },
});

// B_TIER and NOT_SOCIAL are never autonomously published initially (§6).
export function tierAllowedForAutonomy(family, tier) {
  if (tier === "NOT_SOCIAL") return false;
  if (tier === "B_TIER") return false;
  const floor = AUTONOMOUS_QUALITY_FLOOR[family];
  if (!floor?.minTier) return TIER_RANK[tier] >= TIER_RANK.A_TIER;
  return TIER_RANK[tier] >= TIER_RANK[floor.minTier];
}

// --- FIRST-LIVE DEAL SAFETY (§7) - fail closed. -------------------
// `snap` = the frozen content snapshot on the candidate (from
// social:source). Everything below must be genuinely present and live.
export function firstLiveDealSafe(snap = {}, { maxAgeHours } = {}) {
  const fail = [];
  if (snap.source_is_live !== true) fail.push("source_is_live != true");
  if (String(snap.source ?? "").toLowerCase().startsWith("fixture")) fail.push("fixture source");
  if (String(snap.source ?? "").toLowerCase().includes("history")) fail.push("historical fallback source");
  if (!snap.exact_verified_at) fail.push("no exact_verified_at");
  if (snap.image_ok === false || snap.image_verdict === "NO_TRUSTED_IMAGE") fail.push("image integrity failed");
  if (snap.listing_active === false) fail.push("listing not active");
  if (snap.listed_usd == null) fail.push("no current listed price");
  if (snap.market_price == null) fail.push("no current market reference");
  if (snap.discount_pct == null) fail.push("no current discount");
  const capMs = Date.parse(snap.source_captured_at ?? "");
  if (maxAgeHours != null) {
    const ageH = Number.isFinite(capMs) ? (Date.now() - capMs) / 3.6e6 : Infinity;
    if (ageH > maxAgeHours) fail.push(`snapshot ${Number.isFinite(ageH) ? ageH.toFixed(1) + "h" : "unknown age"} old > ${maxAgeHours}h ceiling`);
  }
  return { ok: fail.length === 0, blockers: fail };
}

// --- AUTONOMOUS APPROVAL (§5) - honest provenance. ----------------
// Never stamps owner_approved_by = "owner". A SYSTEM approval is its own
// provenance and freezes the same checksum as a manual approval.
export const APPROVAL_POLICY_VERSION = "auto1-2026-09";

export function decideAutonomousApproval(batch, { readinessOk, blockers = [], now = Date.now() } = {}) {
  if (!readinessOk) {
    return { approved: false, approval_type: null, reason: `readiness gates failed: ${blockers.join("; ") || "unknown"}` };
  }
  const approved_at = new Date(now).toISOString();
  const frozen = {
    ...batch,
    approval_type: "AUTONOMOUS",
    approved_by: "SYSTEM_AUTONOMOUS",
    approval_policy_version: APPROVAL_POLICY_VERSION,
    owner_approved_at: approved_at, // the field the existing stack reads
    owner_approved_by: "SYSTEM_AUTONOMOUS",
    status: "APPROVED",
  };
  frozen.approval_checksum = approvalChecksum(frozen);
  frozen.history = [...(batch.history ?? []), { at: approved_at, note: `AUTONOMOUS approval (${APPROVAL_POLICY_VERSION}); checksum ${frozen.approval_checksum.slice(0, 20)}…` }];
  return { approved: true, approval_type: "AUTONOMOUS", batch: frozen, checksum: frozen.approval_checksum };
}

// --- CANDIDATE SELECTION (§4 step 2-4) ---------------------------
// `candidates` come from the live source snapshot (already
// freshness-verified upstream by social:source). We add the stricter
// autonomous floor + cooldown + tier.
export function selectAutonomousCandidate(candidates = [], { ledger = [], cooldownKeys = new Set(), now = Date.now() } = {}) {
  const scored = [];
  for (const c of candidates) {
    const family = c.family ?? c.creative_family;
    const tier = c.tier ?? qualityTier(c);
    const reasons = [];
    if (!tierAllowedForAutonomy(family, tier)) reasons.push(`tier ${tier} below autonomous floor for ${family}`);
    if (family === "market_mover") {
      const conf = c.movement?.confidence ?? c.confidence;
      const n = typeof conf === "number" ? conf : conf === "high" ? 0.95 : conf === "medium" ? 0.6 : 0.3;
      if (n < AUTONOMOUS_QUALITY_FLOOR.market_mover.minConfidence) reasons.push(`mover confidence ${conf} below high`);
    }
    if (family === "hook_carousel") {
      const n = c.item_count ?? c.distinct_cards ?? 0;
      if (n < AUTONOMOUS_QUALITY_FLOOR.hook_carousel.minDistinctCards) reasons.push(`carousel has ${n} distinct cards (< 3)`);
    }
    if (cooldownKeys.has(c.cooldown_key) || cooldownKeys.has(c.content_id)) reasons.push("within card/content cooldown");
    // already published / in flight for this content_id
    if (ledger.some((r) => r.content_id === c.content_id && IN_FLIGHT_OR_DONE.includes(r.status))) reasons.push("content_id already in flight / published");
    scored.push({ candidate: c, family, tier, eligible: reasons.length === 0, reasons });
  }
  const eligible = scored.filter((s) => s.eligible).sort((a, b) => (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0));
  return { picked: eligible[0] ?? null, considered: scored, eligibleCount: eligible.length };
}

// --- ROLLOUT STAGE CAP (§10) - counts CONTENT ITEMS, not placements.
export function stageCapCheck({ maxContentPerDay, publishedTodayContentIds = [], selectedContentId }) {
  const distinctToday = new Set(publishedTodayContentIds);
  if (maxContentPerDay === 0) return { ok: false, reason: "STAGE_0: dry-run only (0 content items/day)" };
  if (selectedContentId) distinctToday.add(selectedContentId);
  if (distinctToday.size > maxContentPerDay) {
    return { ok: false, reason: `rollout stage cap: ${distinctToday.size} content items today > ${maxContentPerDay}` };
  }
  return { ok: true, wouldBeCount: distinctToday.size, cap: maxContentPerDay };
}

// --- CADENCE CEILING (§9) - per service, per day. ----------------
export function cadenceCheck({ platform, placedTodayByService = {}, family, carouselThisWeek = 0, brandAdThisWeek = 0 }) {
  const svc = serviceOf(platform);
  const used = placedTodayByService[svc] ?? 0;
  const ceil = CADENCE_CEILING_PER_DAY[svc] ?? 1;
  if (used >= ceil) return { ok: false, reason: `${svc} at cadence ceiling ${ceil}/day` };
  if (family === "hook_carousel" && carouselThisWeek >= CAROUSEL_CEILING_PER_WEEK) return { ok: false, reason: `carousel weekly ceiling ${CAROUSEL_CEILING_PER_WEEK}` };
  if (family === "brand_ad" && brandAdThisWeek >= BRAND_AD_CEILING_PER_WEEK) return { ok: false, reason: `brand_ad weekly ceiling ${BRAND_AD_CEILING_PER_WEEK}` };
  return { ok: true, service: svc, used, ceiling: ceil };
}

// --- PRE-SEND REVALIDATION (§8) - the last gate before any mutation.
// Wraps the existing factDrift + a freshness re-check. Returns per the
// existing contract: SKIP (fixable on a later fresh render) / CANCEL
// (listing ended - permanent) / OK.
export function preSendRevalidate(batch, liveFacts = {}, { maxAgeHours } = {}) {
  const drift = factDrift(batch, liveFacts);
  const blockers = [];
  let verdict = "OK";
  for (const f of drift.findings) {
    blockers.push(`${f.field}: frozen ${f.frozen} -> now ${f.now} (${f.action})`);
    if (f.action === "CANCEL") verdict = "CANCEL";
    else if (verdict !== "CANCEL") verdict = "SKIP";
  }
  if (liveFacts.listing_ended === true && verdict !== "CANCEL") {
    verdict = "CANCEL";
    blockers.push("listing ended (CANCEL)");
  }
  if (liveFacts.source_is_live === false) {
    verdict = verdict === "CANCEL" ? "CANCEL" : "SKIP";
    blockers.push("source snapshot is no longer live (SKIP)");
  }
  const capMs = Date.parse(liveFacts.source_captured_at ?? batch.source_captured_at ?? "");
  if (maxAgeHours != null && Number.isFinite(capMs)) {
    const ageH = (Date.now() - capMs) / 3.6e6;
    if (ageH > maxAgeHours) {
      verdict = verdict === "CANCEL" ? "CANCEL" : "SKIP";
      blockers.push(`frozen snapshot ${ageH.toFixed(1)}h old > ${maxAgeHours}h ceiling (SKIP - needs a fresh render)`);
    }
  }
  if (liveFacts.artifact_sha_current && batch.placements?.some((p) => p.approved_artifact_sha256 && p.approved_artifact_sha256 !== liveFacts.artifact_sha_current)) {
    verdict = verdict === "CANCEL" ? "CANCEL" : "SKIP";
    blockers.push("artifact hash differs from the approved one (SKIP - re-host + re-approve)");
  }
  return { verdict, ok: verdict === "OK", blockers, drift };
}
