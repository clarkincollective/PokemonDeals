// Phase AUTO-1 - autonomous social + email orchestration.
//
// Pure-logic tests + structural assertions on the CLIs and cron
// endpoints. No network, no DB, no provider. Mirrors the repo convention
// (unit-test pure logic, grep-prove wiring).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  resolveSocialPosture,
  resolveEmailPosture,
  SOCIAL_STAGES,
  EMAIL_STAGES,
  DEFAULT_SOCIAL_STAGE,
  DEFAULT_EMAIL_STAGE,
} from "../../lib/autonomous/config.mjs";
import {
  newRun,
  defaultCircuit,
  recordFailure,
  recordSuccess,
  resumeCircuit,
  isTripped,
  effectiveMode,
  CIRCUIT_THRESHOLD,
} from "../../lib/autonomous/runState.mjs";
import {
  tierAllowedForAutonomy,
  firstLiveDealSafe,
  decideAutonomousApproval,
  selectAutonomousCandidate,
  stageCapCheck,
  cadenceCheck,
  preSendRevalidate,
  APPROVAL_POLICY_VERSION,
} from "../../lib/autonomous/socialAuto.mjs";
import {
  digestDealSafe,
  selectDigestDeals,
  preSendRevalidateDigest,
  selectDigestAudience,
  digestFingerprint,
  digestFrequencyCheck,
  decideDigest,
  DIGEST_MIN_DEALS,
} from "../../lib/autonomous/emailAuto.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ============================ flags & posture ============================

test("AUTO1-1 autonomous defaults are OFF for both surfaces", () => {
  const s = resolveSocialPosture({}, {});
  const e = resolveEmailPosture({}, {});
  assert.equal(s.mode, "OFF");
  assert.equal(e.mode, "OFF");
  assert.equal(s.enabled, false);
  assert.equal(e.enabled, false);
  assert.equal(s.stageId, DEFAULT_SOCIAL_STAGE);
  assert.equal(e.stageId, DEFAULT_EMAIL_STAGE);
  assert.equal(SOCIAL_STAGES[DEFAULT_SOCIAL_STAGE].maxContentPerDay, 0);
  assert.equal(EMAIL_STAGES[DEFAULT_EMAIL_STAGE].maxDigestsPerWeek, 0);
  assert.equal(s.canMutateProviders, false);
  assert.equal(e.canMutateProviders, false);
});

test("AUTO1-2 kill switch beats the enable flag (and stage, and --live)", () => {
  const env = { SOCIAL_AUTONOMOUS_ENABLED: "true", SOCIAL_AUTONOMOUS_STAGE: "STAGE_3", SOCIAL_AUTONOMOUS_KILL: "true" };
  const s = resolveSocialPosture(env, { requestLive: true });
  assert.equal(s.mode, "SUSPENDED");
  assert.equal(s.canMutateProviders, false);
  const env2 = { EMAIL_AUTONOMOUS_ENABLED: "true", EMAIL_AUTONOMOUS_STAGE: "EMAIL_STAGE_2", EMAIL_AUTONOMOUS_KILL: "true" };
  const e = resolveEmailPosture(env2, { requestLive: true });
  assert.equal(e.mode, "SUSPENDED");
  assert.equal(e.canMutateProviders, false);
});

test("AUTO1-3 LIVE requires enabled + mutating stage + explicit requestLive", () => {
  // enabled + STAGE_1 but no requestLive -> DRY_RUN
  assert.equal(resolveSocialPosture({ SOCIAL_AUTONOMOUS_ENABLED: "true", SOCIAL_AUTONOMOUS_STAGE: "STAGE_1" }, { requestLive: false }).mode, "DRY_RUN");
  // enabled + STAGE_0 + requestLive -> still DRY_RUN (stage 0 never mutates)
  assert.equal(resolveSocialPosture({ SOCIAL_AUTONOMOUS_ENABLED: "true", SOCIAL_AUTONOMOUS_STAGE: "STAGE_0" }, { requestLive: true }).mode, "DRY_RUN");
  // enabled + STAGE_1 + requestLive -> LIVE
  const live = resolveSocialPosture({ SOCIAL_AUTONOMOUS_ENABLED: "true", SOCIAL_AUTONOMOUS_STAGE: "STAGE_1" }, { requestLive: true });
  assert.equal(live.mode, "LIVE");
  assert.equal(live.canMutateProviders, true);
  // email equivalent
  const eLive = resolveEmailPosture({ EMAIL_AUTONOMOUS_ENABLED: "true", EMAIL_AUTONOMOUS_STAGE: "EMAIL_STAGE_1" }, { requestLive: true });
  assert.equal(eLive.mode, "LIVE");
});

test("AUTO1-4 social and email flags are independent", () => {
  const s = resolveSocialPosture({ EMAIL_AUTONOMOUS_ENABLED: "true", EMAIL_AUTONOMOUS_STAGE: "EMAIL_STAGE_2" }, { requestLive: true });
  assert.equal(s.mode, "OFF", "email enable must not enable social");
  const e = resolveEmailPosture({ SOCIAL_AUTONOMOUS_ENABLED: "true", SOCIAL_AUTONOMOUS_STAGE: "STAGE_3" }, { requestLive: true });
  assert.equal(e.mode, "OFF", "social enable must not enable email");
});

test("AUTO1-5 unknown/garbage stage falls back to the safe default", () => {
  assert.equal(resolveSocialPosture({ SOCIAL_AUTONOMOUS_STAGE: "STAGE_99" }, {}).stageId, "STAGE_0");
  assert.equal(resolveEmailPosture({ EMAIL_AUTONOMOUS_STAGE: "whatever" }, {}).stageId, "EMAIL_STAGE_0");
});

// ============================ circuit breaker ============================

test("AUTO1-6 circuit trips after N mutation failures in the window; owner-resume only", () => {
  let c = defaultCircuit("social");
  const t0 = Date.parse("2026-09-07T00:00:00Z");
  for (let i = 0; i < CIRCUIT_THRESHOLD - 1; i++) c = recordFailure(c, { at: t0 + i * 1000, reason: "buffer_500" });
  assert.equal(c.state, "CLOSED");
  c = recordFailure(c, { at: t0 + 9999, reason: "buffer_500" });
  assert.equal(c.state, "AUTO_SUSPENDED");
  assert.ok(c.tripped_at);
  // a later success does NOT un-trip
  c = recordSuccess(c, { at: t0 + 20000 });
  assert.equal(c.state, "AUTO_SUSPENDED");
  // only an explicit resume clears it
  c = resumeCircuit(c, { by: "owner" });
  assert.equal(c.state, "CLOSED");
  assert.equal(c.resumed_by, "owner");
});

test("AUTO1-7 failures outside the 24h window don't accumulate toward a trip", () => {
  let c = defaultCircuit("email");
  const now = Date.parse("2026-09-07T12:00:00Z");
  c = recordFailure(c, { at: now - 40 * 3.6e6, reason: "old" });
  c = recordFailure(c, { at: now - 30 * 3.6e6, reason: "old" });
  c = recordFailure(c, { at: now, reason: "fresh" });
  assert.equal(c.state, "CLOSED", "only 1 failure is inside the window");
});

test("AUTO1-8 a tripped circuit forces SUSPENDED regardless of posture", () => {
  const tripped = { state: "AUTO_SUSPENDED" };
  assert.equal(effectiveMode("LIVE", tripped), "SUSPENDED");
  assert.equal(effectiveMode("DRY_RUN", tripped), "SUSPENDED");
  assert.equal(isTripped(tripped), true);
  assert.equal(effectiveMode("LIVE", { state: "CLOSED" }), "LIVE");
});

// ============================ social quality floor ============================

test("AUTO1-9 B_TIER and NOT_SOCIAL are never allowed for autonomous social", () => {
  assert.equal(tierAllowedForAutonomy("deal_drop", "S_TIER"), true);
  assert.equal(tierAllowedForAutonomy("deal_drop", "A_TIER"), true);
  assert.equal(tierAllowedForAutonomy("deal_drop", "B_TIER"), false);
  assert.equal(tierAllowedForAutonomy("deal_drop", "NOT_SOCIAL"), false);
  assert.equal(tierAllowedForAutonomy("market_mover", "B_TIER"), false);
});

test("AUTO1-10 selectAutonomousCandidate rejects B tier, cooldown, and already-in-flight content", () => {
  const cands = [
    { content_id: "c_b", family: "deal_drop", tier: "B_TIER" },
    { content_id: "c_s", family: "deal_drop", tier: "S_TIER" },
    { content_id: "c_cool", family: "deal_drop", tier: "A_TIER", cooldown_key: "k1" },
    { content_id: "c_dupe", family: "deal_drop", tier: "A_TIER" },
  ];
  const res = selectAutonomousCandidate(cands, {
    ledger: [{ content_id: "c_dupe", status: "QUEUED" }],
    cooldownKeys: new Set(["k1"]),
  });
  assert.equal(res.picked.candidate.content_id, "c_s");
  assert.equal(res.eligibleCount, 1);
  const byId = Object.fromEntries(res.considered.map((c) => [c.candidate.content_id, c]));
  assert.match(byId.c_b.reasons.join(" "), /below autonomous floor/);
  assert.match(byId.c_cool.reasons.join(" "), /cooldown/);
  assert.match(byId.c_dupe.reasons.join(" "), /already in flight/);
});

test("AUTO1-11 no eligible candidate is a successful NO-CONTENT outcome", () => {
  const res = selectAutonomousCandidate([{ content_id: "x", family: "deal_drop", tier: "B_TIER" }], {});
  assert.equal(res.picked, null);
  assert.equal(res.eligibleCount, 0);
});

// ============================ first-live deal safety ============================

test("AUTO1-12 firstLiveDealSafe fails closed on fixture / stale / missing facts", () => {
  assert.equal(firstLiveDealSafe({}).ok, false);
  const good = {
    source_is_live: true, source: "live:supabase", exact_verified_at: "2026-09-07T08:00:00Z",
    image_ok: true, listing_active: true, listed_usd: 40, market_price: 120, discount_pct: 0.66,
    source_captured_at: new Date().toISOString(),
  };
  assert.equal(firstLiveDealSafe(good, { maxAgeHours: 6 }).ok, true);
  assert.match(firstLiveDealSafe({ ...good, source: "fixture:x" }).blockers.join(" "), /fixture source/);
  assert.match(firstLiveDealSafe({ ...good, source: "history-fallback" }).blockers.join(" "), /historical fallback/);
  assert.match(firstLiveDealSafe({ ...good, source_captured_at: new Date(Date.now() - 20 * 3.6e6).toISOString() }, { maxAgeHours: 6 }).blockers.join(" "), /ceiling/);
});

// ============================ autonomous approval provenance ============================

test("AUTO1-13 autonomous approval never claims owner and freezes a checksum", () => {
  const batch = { content_id: "c1", frozen_facts: {}, placements: [{ job_id: "j1", platform: "x_post", frozen_copy: {} }], history: [] };
  const r = decideAutonomousApproval(batch, { readinessOk: true });
  assert.equal(r.approved, true);
  assert.equal(r.approval_type, "AUTONOMOUS");
  assert.equal(r.batch.approved_by, "SYSTEM_AUTONOMOUS");
  assert.equal(r.batch.owner_approved_by, "SYSTEM_AUTONOMOUS");
  assert.notEqual(r.batch.owner_approved_by, "owner");
  assert.equal(r.batch.approval_policy_version, APPROVAL_POLICY_VERSION);
  assert.match(r.checksum, /^sha256:/);
  // a failed readiness never approves
  assert.equal(decideAutonomousApproval(batch, { readinessOk: false, blockers: ["qa"] }).approved, false);
});

test("AUTO1-14 approval checksum changes if the batch is mutated after approval", async () => {
  const { approvalChecksum } = await import("../../lib/social/distribution/batch.mjs");
  const batch = { content_id: "c1", frozen_facts: { listed_usd: 40 }, placements: [{ job_id: "j1", platform: "x_post", frozen_copy: { caption: "a" } }], history: [] };
  const r = decideAutonomousApproval(batch, { readinessOk: true });
  const after = { ...r.batch, placements: [{ ...r.batch.placements[0], frozen_copy: { caption: "EDITED" } }] };
  assert.notEqual(approvalChecksum(after), r.checksum, "editing frozen copy must break the checksum");
});

// ============================ rollout stage cap & cadence ============================

test("AUTO1-15 rollout stage cap counts CONTENT ITEMS, not per-platform placements", () => {
  assert.equal(stageCapCheck({ maxContentPerDay: 0, selectedContentId: "c1" }).ok, false); // STAGE_0
  // one content_id fanned out to 4 platforms is still 1 item
  const r = stageCapCheck({ maxContentPerDay: 1, publishedTodayContentIds: [], selectedContentId: "c1" });
  assert.equal(r.ok, true);
  assert.equal(r.wouldBeCount, 1);
  // a second DISTINCT content_id on a stage-1 day is over the cap
  assert.equal(stageCapCheck({ maxContentPerDay: 1, publishedTodayContentIds: ["c0"], selectedContentId: "c1" }).ok, false);
  // same content_id again does not increment
  assert.equal(stageCapCheck({ maxContentPerDay: 1, publishedTodayContentIds: ["c1"], selectedContentId: "c1" }).ok, true);
});

test("AUTO1-16 cadence ceiling uses the existing planner per-service limits", () => {
  assert.equal(cadenceCheck({ platform: "x_post", placedTodayByService: { x: 4 } }).ok, false);
  assert.equal(cadenceCheck({ platform: "x_post", placedTodayByService: { x: 3 } }).ok, true);
  assert.equal(cadenceCheck({ platform: "instagram_reel", placedTodayByService: { instagram: 2 } }).ok, false);
  assert.equal(cadenceCheck({ platform: "youtube_short", placedTodayByService: { youtube: 1 } }).ok, false);
  assert.equal(cadenceCheck({ platform: "instagram_carousel", placedTodayByService: {}, family: "hook_carousel", carouselThisWeek: 3 }).ok, false);
  assert.equal(cadenceCheck({ platform: "x_post", placedTodayByService: {}, family: "brand_ad", brandAdThisWeek: 2 }).ok, false);
});

// ============================ pre-send drift / revalidation ============================

test("AUTO1-17 preSendRevalidate: price drift -> SKIP, listing ended -> CANCEL", () => {
  const batch = { frozen_facts: { listed_usd: 40, market_price: 120, discount_pct: 0.66 }, placements: [] };
  assert.equal(preSendRevalidate(batch, { listedUsd: 40, marketRefUsd: 120, discountPct: 0.66 }).verdict, "OK");
  assert.equal(preSendRevalidate(batch, { listedUsd: 55, marketRefUsd: 120, discountPct: 0.66 }).verdict, "SKIP");
  assert.equal(preSendRevalidate(batch, { listing_ended: true }).verdict, "CANCEL");
  assert.equal(preSendRevalidate(batch, { source_is_live: false }).verdict, "SKIP");
  // artifact hash mismatch
  const b2 = { frozen_facts: {}, placements: [{ approved_artifact_sha256: "aaa" }] };
  assert.equal(preSendRevalidate(b2, { artifact_sha_current: "bbb" }).verdict, "SKIP");
});

// ============================ email: content & audience ============================

const digDeal = (over = {}) => ({
  id: 1, is_active: true, listing_type: "FIXED_PRICE", total_price: 40, market_price: 120,
  discount_pct: 0.66, last_seen_at: new Date().toISOString(), ...over,
});

test("AUTO1-18 a digest deal is rejected if any factual field is missing/invalid", () => {
  assert.equal(digestDealSafe(digDeal()).ok, true);
  assert.equal(digestDealSafe(digDeal({ is_active: false })).ok, false);
  assert.equal(digestDealSafe(digDeal({ total_price: 0 })).ok, false);
  assert.equal(digestDealSafe(digDeal({ market_price: null })).ok, false);
  assert.equal(digestDealSafe(digDeal({ discount_pct: 0 })).ok, false);
  assert.equal(digestDealSafe(digDeal({ image_verdict: "NO_TRUSTED_IMAGE" })).ok, false);
  assert.equal(digestDealSafe(digDeal({ listing_type: "AUCTION" })).ok, false);
  assert.equal(digestDealSafe(digDeal({ id: null })).ok, false);
});

test("AUTO1-19 below-minimum digest is a SKIP, not a weak send", () => {
  const two = [digDeal({ id: 1 }), digDeal({ id: 2 })];
  const sel = selectDigestDeals(two);
  assert.equal(sel.meetsMinimum, false);
  assert.equal(sel.count, 2);
  const d = decideDigest({ candidates: two, audienceRows: [{ status: "ACTIVE", confirmed: true, unsubscribed_at: null }], maxDigestsPerWeek: 1 });
  assert.equal(d.decision, "SKIP");
  assert.match(d.blockers.join(" "), new RegExp(`need >= ${DIGEST_MIN_DEALS}`));
});

test("AUTO1-20 pre-send revalidation removes expired/drifted items and cancels below minimum", () => {
  const frozen = [digDeal({ id: 1 }), digDeal({ id: 2, total_price: 30 }), digDeal({ id: 3 }), digDeal({ id: 4 })];
  const fresh = new Map([
    [1, digDeal({ id: 1 })],
    // id 2 price moved from 30 -> 45 (>5%)
    [2, digDeal({ id: 2, total_price: 45 })],
    // id 3 gone / expired
    [4, digDeal({ id: 4 })],
  ]);
  const r = preSendRevalidateDigest(frozen, fresh);
  assert.equal(r.count, 2); // ids 1 and 4 survive
  assert.equal(r.verdict, "CANCEL"); // 2 < DIGEST_MIN_DEALS
  assert.match(r.removed.map((x) => x.reason).join(" "), /expired|moved/);
});

test("AUTO1-21 audience is strictly ACTIVE + confirmed + not unsubscribed", () => {
  const rows = [
    { status: "ACTIVE", confirmed: true, unsubscribed_at: null }, // in
    { status: "ACTIVE", confirmed: false, unsubscribed_at: null }, // out (not confirmed)
    { confirmed: true, unsubscribed_at: null }, // derives ACTIVE - in
    { confirmed: true, unsubscribed_at: "2026-01-01" }, // out (unsubscribed)
    { status: "PENDING", confirmed: false, unsubscribed_at: null }, // out
    { status: "BOUNCED", confirmed: true, unsubscribed_at: null }, // out
    { status: "COMPLAINED", confirmed: true, unsubscribed_at: null }, // out
  ];
  const a = selectDigestAudience(rows);
  assert.equal(a.count, 2);
  assert.equal(a.excluded.PENDING, 1);
  assert.equal(a.excluded.BOUNCED, 1);
  assert.equal(a.excluded.COMPLAINED, 1);
  assert.equal(a.excluded.UNSUBSCRIBED, 1);
});

test("AUTO1-22 weekly digest cap + duplicate-fingerprint block", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const fp = digestFingerprint({ dealIds: [1, 2, 3], subject: "s", preset: "weekly" });
  // cap of 1, already 1 sent this week -> blocked
  const capped = digestFrequencyCheck({ maxDigestsPerWeek: 1, sentHistory: [{ status: "SENT", sent_at: new Date(now - 2 * 24 * 3.6e6).toISOString(), fingerprint: "other" }], now });
  assert.equal(capped.ok, false);
  assert.match(capped.reason, /weekly digest cap/);
  // identical fingerprint already sent -> blocked even if under cap
  const dupe = digestFrequencyCheck({ maxDigestsPerWeek: 2, sentHistory: [{ status: "SENT", sent_at: new Date(now - 5 * 24 * 3.6e6).toISOString(), fingerprint: fp }], now, candidateFingerprint: fp });
  assert.equal(dupe.ok, false);
  assert.match(dupe.reason, /identical digest/);
  // stage 0 -> always blocked
  assert.equal(digestFrequencyCheck({ maxDigestsPerWeek: 0, sentHistory: [], now }).ok, false);
});

test("AUTO1-23 digest fingerprint is deterministic + order-independent over deal ids", () => {
  assert.equal(
    digestFingerprint({ dealIds: [3, 1, 2], subject: "s", preset: "weekly" }),
    digestFingerprint({ dealIds: [1, 2, 3], subject: "s", preset: "weekly" })
  );
  assert.notEqual(
    digestFingerprint({ dealIds: [1, 2, 3], subject: "s", preset: "weekly" }),
    digestFingerprint({ dealIds: [1, 2, 4], subject: "s", preset: "weekly" })
  );
});

test("AUTO1-24 decideDigest wouldSend is false unless every gate is open", () => {
  const strong = [digDeal({ id: 1 }), digDeal({ id: 2 }), digDeal({ id: 3 }), digDeal({ id: 4 })];
  const aud = [{ status: "ACTIVE", confirmed: true, unsubscribed_at: null }];
  // content + audience OK but send gates closed -> READY_BUT_HELD, wouldSend false
  const held = decideDigest({ candidates: strong, audienceRows: aud, maxDigestsPerWeek: 1, emailEnabled: false, digestSendEnabled: false, canMutateProviders: false });
  assert.equal(held.decision, "READY_BUT_HELD");
  assert.equal(held.wouldSend, false);
  // everything open -> SEND
  const go = decideDigest({ candidates: strong, audienceRows: aud, maxDigestsPerWeek: 1, emailEnabled: true, digestSendEnabled: true, canMutateProviders: true });
  assert.equal(go.decision, "SEND");
  assert.equal(go.wouldSend, true);
});

// ============================ CLI + endpoint wiring ============================

test("AUTO1-25 social:auto CLI defaults to dry-run; the live submit is gated", () => {
  const src = read("scripts/socialAuto.mjs");
  assert.match(src, /DEFAULT IS DRY RUN/);
  // AUTO-3: derives a FRESH live source via the shared resolver, no on-disk fallback
  assert.match(src, /resolveLiveSource/);
  assert.doesNotMatch(strip(src), /loadSourceSnapshot\(/);
  assert.match(src, /never posts from a fixture/i);
  // submitAutonomousBatch is called exactly once, inside the LIVE+gate guard
  assert.equal((strip(src).match(/submitAutonomousBatch\(/g) || []).length, 1);
  assert.match(src, /const liveGate = resolveLiveSocialGates\(/);
  assert.match(src, /if \(mode === "LIVE" && once && allGreen && liveGate\.ok\)/);
});

test("AUTO1-26 crm:auto CLI defaults to dry-run; the live send is gated", () => {
  const src = read("scripts/crmAuto.mjs");
  assert.match(src, /DEFAULT IS DRY RUN/);
  assert.match(src, /never imports lib\/email/);
  assert.equal((strip(src).match(/sendAutonomousDigest\(/g) || []).length, 1);
  assert.match(src, /const liveGate = resolveLiveEmailGates\(/);
  assert.match(src, /} else if \(mode === "LIVE" && once && decision\.decision !== "SKIP" && liveGate\.ok/);
  // the "READY BUT HELD" / dry-run branch never calls the sender
  const dryBranch = src.slice(src.indexOf("} else if (!decision.wouldSend"));
  assert.doesNotMatch(dryBranch, /sendAutonomousDigest\(/);
});

test("AUTO1-27 cron endpoints verify CRON_SECRET, resolve posture + circuit, and bail on anything but LIVE", () => {
  for (const f of ["app/api/social-auto/route.js", "app/api/crm-auto/route.js"]) {
    const src = read(f);
    assert.match(src, /authorization"\) !== `Bearer \$\{process\.env\.CRON_SECRET\}`/);
    assert.match(src, /resolve(Social|Email)Posture/);
    assert.match(src, /effectiveMode/);
    assert.match(src, /if \(mode !== "LIVE"\)/);
    assert.match(src, /resolveLive(Social|Email)Gates/);
    assert.match(src, /skipped: "live_gates_blocked"/);
  }
  const crm = read("app/api/crm-auto/route.js");
  assert.match(crm, /DIGEST_SEND_ENABLED/); // still honours CRM-1B kill switch (via resolveLiveEmailGates)
  assert.match(crm, /kind", "digest_state"/); // Supabase-persisted weekly guard
  // the emailEnabled() (RESEND_API_KEY + ALERT_FROM_EMAIL) check lives in the shared gate
  assert.match(read("lib/autonomous/emailSend.mjs"), /RESEND_API_KEY && env\.ALERT_FROM_EMAIL/);
});

test("AUTO1-28 the autonomous cron entries exist in vercel.json (AUTO-2) and the endpoints still re-verify every flag", () => {
  const vj = JSON.parse(read("vercel.json"));
  const paths = vj.crons.map((c) => c.path);
  assert.ok(paths.includes("/api/social-auto"), "social-auto cron missing");
  assert.ok(paths.includes("/api/crm-auto"), "crm-auto cron missing");
  // cron presence alone cannot enable autonomy - both endpoints resolve
  // the posture + circuit and bail on anything but LIVE.
  for (const f of ["app/api/social-auto/route.js", "app/api/crm-auto/route.js"]) {
    const src = read(f);
    assert.match(src, /if \(mode !== "LIVE"\)/);
    assert.match(src, /resolveLive(Social|Email)Gates/);
  }
});

test("AUTO1-29 the existing distribution safety gates are untouched by AUTO-1", () => {
  const gates = read("lib/social/distribution/gates.mjs");
  // every named gate still present - AUTO-1 adds a layer, removes none
  for (const g of ["publish_switch", "live_mode", "epn_compliance", "qa_pass", "rights_cleared", "owner_approval", "provider_auth", "channel_resolved", "not_duplicate", "freshness_at_send", "asset_not_drifted", "deterministic_facts"]) {
    assert.match(gates, new RegExp(`"${g}"`), `gate ${g} missing`);
  }
  // AUTO-1 files never import or weaken gates.mjs
  assert.doesNotMatch(read("lib/autonomous/socialAuto.mjs"), /distribution\/gates/);
});

test("AUTO1-30 run record shape carries the §3 fields and no secret-shaped keys", () => {
  const r = newRun({ surface: "social", mode: "DRY_RUN", requestLive: false });
  for (const k of ["run_id", "started_at", "finished_at", "mode", "eligible_candidates", "selected_content_ids", "planned_placements", "rendered", "hosted", "submitted", "queued", "published", "failed", "skipped", "skip_reasons", "provider_errors", "circuit_state"]) {
    assert.ok(k in r, `run record missing ${k}`);
  }
  const j = JSON.stringify(r);
  assert.doesNotMatch(j, /API_KEY|SECRET|TOKEN|password/i);
});

test("AUTO1-31 experiment fields are preserved through autonomous approval (not visually chosen)", async () => {
  const { approvalChecksum } = await import("../../lib/social/distribution/batch.mjs");
  const batch = {
    content_id: "c1", frozen_facts: {}, history: [],
    placements: [{
      job_id: "j1", platform: "instagram_reel", frozen_copy: { caption: "x" },
      experiment: { experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap", variant_id: "A", hook_variant: "PRICE_CONTRAST", cta_variant: null },
    }],
  };
  const r = decideAutonomousApproval(batch, { readinessOk: true });
  assert.equal(r.batch.placements[0].experiment.experiment_id, "e1_deal_hook_pricecontrast_vs_percentgap");
  assert.equal(r.batch.placements[0].experiment.hook_variant, "PRICE_CONTRAST");
  // the checksum covers the experiment fields (13E.10A)
  const tampered = JSON.parse(JSON.stringify(r.batch));
  tampered.placements[0].experiment.hook_variant = "PERCENT_GAP";
  assert.notEqual(approvalChecksum(tampered), r.checksum);
});
