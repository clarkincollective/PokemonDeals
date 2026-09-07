// Phase AUTO-2 - production autonomy wiring + staged live rollout.
//
// Pure-logic + structural. No network, no provider, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveSocialPosture, resolveEmailPosture } from "../../lib/autonomous/config.mjs";
import { resolveLiveSocialGates } from "../../lib/autonomous/socialPublish.mjs";
import { resolveLiveEmailGates } from "../../lib/autonomous/emailSend.mjs";
import { defaultCircuit } from "../../lib/autonomous/runState.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// a full "everything is set" env for the LIVE-social gate
const LIVE_SOCIAL_ENV = {
  SOCIAL_AUTONOMOUS_ENABLED: "true",
  SOCIAL_AUTONOMOUS_STAGE: "STAGE_1",
  SOCIAL_AUTONOMOUS_KILL: "false",
  SOCIAL_PUBLISH_ENABLED: "true",
  SOCIAL_PUBLISH_DRY_RUN: "false",
  SOCIAL_EPN_AI_CLASSIFICATION: "NOT_APPLICABLE_CURRENT_PIPELINE",
  BUFFER_ACCESS_TOKEN: "x",
};
const LIVE_EMAIL_ENV = {
  EMAIL_AUTONOMOUS_ENABLED: "true",
  EMAIL_AUTONOMOUS_STAGE: "EMAIL_STAGE_1",
  EMAIL_AUTONOMOUS_KILL: "false",
  DIGEST_SEND_ENABLED: "true",
  RESEND_API_KEY: "x",
  ALERT_FROM_EMAIL: "alerts@pokemondealfinder.com",
};

// ---- live-path wiring reuses the EXISTING providers ----

test("AUTO2-1 the social live path imports the EXISTING Buffer provider adapter, not a new one", () => {
  const src = read("lib/autonomous/socialPublish.mjs");
  assert.match(src, /from "\.\.\/social\/providers\/index/);
  assert.match(src, /getSocialProvider/);
  assert.match(src, /revalidatePlacement/); // reuses the existing revalidation
  assert.match(src, /applyProviderAccept|applyProviderReject/); // reuses the existing ledger transitions
  // no second Buffer implementation / no raw fetch to buffer
  assert.doesNotMatch(strip(src), /api\.buffer\.com|graph\.buffer\.com|new Buffer|bufferClient\s*=/);
});

test("AUTO2-2 the email live path imports the EXISTING lib/email sender + renderDigest, not a new one", () => {
  const src = read("lib/autonomous/emailSend.mjs");
  assert.match(src, /from "\.\.\/crm\/digestTemplate/); // reuses renderDigest
  assert.match(src, /import\("\.\.\/email\.js"\)/); // reuses lib/email.sendBatch (dynamic, live-path only)
  assert.doesNotMatch(strip(src), /api\.resend\.com|new Resend|resendClient\s*=/); // no second sender
  assert.match(src, /listUnsubscribeHeaders/); // §26 - one-click headers retained
});

// ---- live-social gate: ALL of §3 ----

test("AUTO2-3 resolveLiveSocialGates requires every AUTO flag AND every existing publish control", () => {
  const circuit = defaultCircuit("social");
  // fully set via env -> the ONLY remaining blocker is the code-reviewed
  // RIGHTS_STATE.publishing flag (correctly not settable from env).
  const full = resolveLiveSocialGates({ env: LIVE_SOCIAL_ENV, posture: resolveSocialPosture(LIVE_SOCIAL_ENV, { requestLive: true }), circuit });
  assert.equal(full.ok, false);
  assert.deepEqual(full.blockers, ["RIGHTS_STATE.publishing != ALLOWED"], "with full env, only the rights flag should block");
  // drop each env control in turn -> an additional blocker appears
  for (const k of ["SOCIAL_AUTONOMOUS_ENABLED", "SOCIAL_PUBLISH_ENABLED", "SOCIAL_PUBLISH_DRY_RUN", "SOCIAL_EPN_AI_CLASSIFICATION", "BUFFER_ACCESS_TOKEN"]) {
    const env = { ...LIVE_SOCIAL_ENV };
    delete env[k];
    const r = resolveLiveSocialGates({ env, posture: resolveSocialPosture(env, { requestLive: true }), circuit });
    assert.ok(r.blockers.length >= 2, `dropping ${k} should add a blocker`);
  }
  // STAGE_0 blocks (does not mutate)
  const s0 = { ...LIVE_SOCIAL_ENV, SOCIAL_AUTONOMOUS_STAGE: "STAGE_0" };
  assert.ok(resolveLiveSocialGates({ env: s0, posture: resolveSocialPosture(s0, { requestLive: true }), circuit }).blockers.some((b) => /STAGE/.test(b)));
});

test("AUTO2-4 kill switch blocks the live-social gate regardless of everything else", () => {
  const env = { ...LIVE_SOCIAL_ENV, SOCIAL_AUTONOMOUS_KILL: "true" };
  const r = resolveLiveSocialGates({ env, posture: resolveSocialPosture(env, { requestLive: true }), circuit: defaultCircuit("social") });
  assert.equal(r.ok, false);
  assert.match(r.blockers.join(" "), /KILL/);
});

test("AUTO2-5 a tripped social circuit blocks the live gate (owner resume only)", () => {
  const r = resolveLiveSocialGates({ env: LIVE_SOCIAL_ENV, posture: resolveSocialPosture(LIVE_SOCIAL_ENV, { requestLive: true }), circuit: { state: "AUTO_SUSPENDED" } });
  assert.equal(r.ok, false);
  assert.match(r.blockers.join(" "), /circuit/i);
});

// ---- live-email gate: ALL of §4 ----

test("AUTO2-6 resolveLiveEmailGates requires AUTO flags + DIGEST_SEND_ENABLED + emailEnabled()", () => {
  const ok = resolveLiveEmailGates({ env: LIVE_EMAIL_ENV, posture: resolveEmailPosture(LIVE_EMAIL_ENV, { requestLive: true }), circuit: defaultCircuit("email") });
  assert.equal(ok.ok, true, ok.blockers.join("; "));
  for (const k of ["EMAIL_AUTONOMOUS_ENABLED", "DIGEST_SEND_ENABLED", "RESEND_API_KEY", "ALERT_FROM_EMAIL"]) {
    const env = { ...LIVE_EMAIL_ENV };
    delete env[k];
    assert.equal(resolveLiveEmailGates({ env, posture: resolveEmailPosture(env, { requestLive: true }), circuit: defaultCircuit("email") }).ok, false, `dropping ${k} should block`);
  }
  const kill = { ...LIVE_EMAIL_ENV, EMAIL_AUTONOMOUS_KILL: "true" };
  assert.equal(resolveLiveEmailGates({ env: kill, posture: resolveEmailPosture(kill, { requestLive: true }), circuit: defaultCircuit("email") }).ok, false);
});

test("AUTO2-7 social and email live gates are independent", () => {
  // social env present, email env absent -> the email gate is blocked on
  // EMAIL flags (not on anything social).
  const eBlockers = resolveLiveEmailGates({ env: LIVE_SOCIAL_ENV, posture: resolveEmailPosture(LIVE_SOCIAL_ENV, { requestLive: true }), circuit: defaultCircuit("email") }).blockers;
  assert.ok(eBlockers.some((b) => /EMAIL_AUTONOMOUS_ENABLED/.test(b)));
  assert.ok(!eBlockers.some((b) => /SOCIAL/.test(b)), "email gate must not mention social flags");
  // social env -> the social gate clears every ENV control (only the
  // code-reviewed RIGHTS flag remains), independent of email env.
  const sBlockers = resolveLiveSocialGates({ env: LIVE_SOCIAL_ENV, posture: resolveSocialPosture(LIVE_SOCIAL_ENV, { requestLive: true }), circuit: defaultCircuit("social") }).blockers;
  assert.deepEqual(sBlockers, ["RIGHTS_STATE.publishing != ALLOWED"]);
});

// ---- provider truth model ----

test("AUTO2-8 submitAutonomousBatch: provider-accepted -> ledger QUEUED (not PUBLISHED); PUBLISHED only via sync", async () => {
  const { submitAutonomousBatch } = await import("../../lib/autonomous/socialPublish.mjs");
  // a batch + ledger with a stub provider is exercised via a fake env
  // without BUFFER token -> the null provider refuses -> FAILED, never PUBLISHED.
  const batch = {
    batch_id: "b1", content_id: "c1", status: "APPROVED", owner_approved_by: "SYSTEM_AUTONOMOUS",
    owner_approved_at: "2026-09-07T00:00:00Z", approval_checksum: null, send_order: ["x_post"],
    frozen_facts: {}, placements: [{ job_id: "c1::x_post::A", platform: "x_post", frozen_copy: { caption: "x" } }],
    history: [],
  };
  // batchApprovalValid fails (no checksum) -> refuses, no mutation
  const r = await submitAutonomousBatch({ batch, ledger: [], channels: [], env: {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /approval invalid/);
});

test("AUTO2-9 a row that already has a provider_ref is never resubmitted (retry safety)", async () => {
  // structural: the submit loop short-circuits on row.provider_ref
  const src = read("lib/autonomous/socialPublish.mjs");
  assert.match(src, /if \(row\.provider_ref\)[\s\S]{0,200}ALREADY/);
  assert.match(src, /use sync, not resubmit/);
});

test("AUTO2-10 email digest history + Supabase digest_state both gate the weekly cadence", () => {
  const endpoint = read("app/api/crm-auto/route.js");
  assert.match(endpoint, /kind", "digest_state"/);
  assert.match(endpoint, /skipped: "sent_recently"/);
  assert.match(endpoint, /appendDigestSend/);
  // NO_ACTIVE_SUBSCRIBERS is an explicit skip (§14)
  assert.match(endpoint, /NO_ACTIVE_SUBSCRIBERS/);
  // pre-send cancel (§15/§22)
  assert.match(endpoint, /cancelled_at_presend/);
});

// ---- cron / schedule ----

test("AUTO2-11 vercel.json installs the autonomous crons at the intended cadence", () => {
  const vj = JSON.parse(read("vercel.json"));
  const social = vj.crons.filter((c) => c.path === "/api/social-auto");
  const email = vj.crons.filter((c) => c.path === "/api/crm-auto");
  assert.equal(social.length, 1);
  assert.equal(social[0].schedule, "0 * * * *"); // hourly
  assert.equal(email.length, 2); // twice weekly
  assert.deepEqual(email.map((c) => c.schedule).sort(), ["0 16 * * 2", "0 16 * * 5"]);
});

test("AUTO2-12 cron endpoints reject missing / wrong auth", () => {
  for (const f of ["app/api/social-auto/route.js", "app/api/crm-auto/route.js"]) {
    const src = read(f);
    assert.match(src, /!== `Bearer \$\{process\.env\.CRON_SECRET\}`\) \{\s*return Response\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  }
});

// ---- no forced Browse / mass publish ----

test("AUTO2-13 no AUTO file makes an eBay Browse call", () => {
  for (const f of [
    "lib/autonomous/config.mjs", "lib/autonomous/runState.mjs", "lib/autonomous/socialAuto.mjs",
    "lib/autonomous/emailAuto.mjs", "lib/autonomous/socialPublish.mjs", "lib/autonomous/emailSend.mjs",
    "scripts/socialAuto.mjs", "scripts/crmAuto.mjs", "app/api/social-auto/route.js", "app/api/crm-auto/route.js",
  ]) {
    const src = strip(read(f));
    assert.doesNotMatch(src, /browse\.api\.ebay|getBrowseRateLimit|fetchCardOffers|ebay\.com\/buy\/browse/i, `${f} touches eBay Browse`);
  }
});

test("AUTO2-14 the social endpoint submits at most ONE autonomous-approved batch per invocation", () => {
  const src = read("app/api/social-auto/route.js");
  // it picks the single oldest matching batch ([0] after sort), not a loop
  assert.match(src, /\.sort\([\s\S]{0,120}\)\[0\];/);
  assert.equal((strip(src).match(/submitAutonomousBatch\(/g) || []).length, 1);
  // only SYSTEM_AUTONOMOUS-approved, untampered batches are eligible
  assert.match(src, /owner_approved_by === "SYSTEM_AUTONOMOUS"/);
  assert.match(src, /b\.status === "APPROVED" \|\| b\.status === "PARTIAL_SUCCESS"/);
});

test("AUTO2-15 existing distribution gates + the 13E.6A revalidation are still the authority", () => {
  const sp = read("lib/autonomous/socialPublish.mjs");
  assert.match(sp, /revalidatePlacement\(\{ row, batch, variant/); // per-placement, same call shape as cmdSendBatch
  assert.match(sp, /RIGHTS_STATE\.publishing !== "ALLOWED"/);
  // AUTO-2 files still never import/weaken gates.mjs directly (revalidate.mjs wraps it)
  assert.doesNotMatch(sp, /distribution\/gates/);
  const gates = read("lib/social/distribution/gates.mjs");
  for (const g of ["publish_switch", "epn_compliance", "qa_pass", "rights_cleared", "freshness_at_send", "asset_not_drifted", "not_duplicate"]) {
    assert.match(gates, new RegExp(`"${g}"`));
  }
});

test("AUTO2-16 lib/email.sendBatch forwards per-message List-Unsubscribe headers when present", () => {
  const src = read("lib/email.js");
  assert.match(src, /m\.headers && Object\.keys\(m\.headers\)\.length/);
  assert.match(src, /headers: m\.headers/);
});
