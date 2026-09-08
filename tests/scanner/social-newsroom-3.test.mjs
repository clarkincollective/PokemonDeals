// Phase SOCIAL-NEWSROOM-3 - planned-backlog refill engine. Pure-logic +
// source-scan. No DB, no Buffer, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  REFILL_SCHEDULE, EDITORIAL_REFILL_PLATFORMS, INITIAL_HORIZON_DAYS,
  refillConsiderable, refillNeedsConsensus, planRefill,
} from "../../lib/social/newsroom/refill.mjs";
import { classifyQaRows, qaRetentionReport, QA_ROW_WARN_THRESHOLD, QA_ROW_ALERT_THRESHOLD } from "../../lib/social/newsroom/qaRetention.mjs";
import { VISUAL_REVIEW_POLICY_VERSION } from "../../lib/newsroom/visualConsensus.mjs";
import { familyStatusFor } from "../../lib/social/newsroom/cardLayoutStatus.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");

// ---- family policy ------------------------------------------------
test("N3-1. AUTONOMOUS_SAFE + CONDITIONAL are refill-considerable; MANUAL_ONLY is not", () => {
  assert.equal(refillConsiderable("MARKET_SNAPSHOT"), true);   // AUTONOMOUS_SAFE
  assert.equal(refillConsiderable("EXACT_PRINTING_MATTERS"), true);
  assert.equal(refillConsiderable("DEAL_DROP"), true);         // CONDITIONAL - considerable, needs consensus
  assert.equal(refillConsiderable("THREE_UNDER_25"), true);
  assert.equal(refillConsiderable("WHY_SOLD_PRICES_MATTER"), true);
  assert.equal(refillConsiderable("AUCTION_BID_VS_TOTAL"), false); // MANUAL_ONLY
  assert.equal(refillConsiderable("BIGGEST_MOVERS"), false);
});

test("N3-2. CONDITIONAL families require per-artifact consensus; AUTONOMOUS_SAFE do not", () => {
  assert.equal(refillNeedsConsensus("DEAL_DROP"), true);
  assert.equal(refillNeedsConsensus("THREE_UNDER_25"), true);
  assert.equal(refillNeedsConsensus("WHY_SOLD_PRICES_MATTER"), true);
  assert.equal(refillNeedsConsensus("MARKET_SNAPSHOT"), false);
  assert.equal(refillNeedsConsensus("EXACT_PRINTING_MATTERS"), false);
});

test("N3-3. planRefill: IG + X only; initial horizon caps; NOT_PLATFORM_FIT/YouTube out of scope; no filler when nothing qualifies", () => {
  // nothing qualifies -> BACKLOG_LOW_BUT_NO_QUALITY_CONTENT, refill 0, no filler
  const empty = planRefill({ candidateSeries: [], placements: [], initial: true });
  const igEmpty = empty.needs.find((n) => n.platform === "instagram");
  assert.ok(!igEmpty || igEmpty.state === "BACKLOG_LOW_BUT_NO_QUALITY_CONTENT" || igEmpty.refill === 0);
  assert.equal(empty.total_refill_slots, 0);
  // platforms other than IG/X are OUT_OF_INITIAL_SCOPE, never EMPTY-driving-a-loop
  const withCands = planRefill({ candidateSeries: ["MARKET_SNAPSHOT", "EXACT_PRINTING_MATTERS"], placements: [], initial: true });
  for (const n of withCands.needs) {
    if (n.platform !== "instagram" && n.platform !== "x") assert.equal(n.state, "OUT_OF_INITIAL_SCOPE");
  }
  assert.deepEqual([...EDITORIAL_REFILL_PLATFORMS], ["instagram", "x"]);
  assert.deepEqual(INITIAL_HORIZON_DAYS.instagram, [3, 5]);
  assert.deepEqual(INITIAL_HORIZON_DAYS.x, [2, 3]);
});

// ---- schedule / timezone ---------------------------------------
test("N3-4. refill schedule is prepared (NOT activated) and documents Brisbane semantics", () => {
  assert.equal(REFILL_SCHEDULE.activated, false);
  assert.equal(REFILL_SCHEDULE.cron_hint, "0 20 * * 0,3");
  assert.match(REFILL_SCHEDULE.brisbane_local, /06:00 Australia\/Brisbane/);
  assert.match(REFILL_SCHEDULE.cron_utc, /20:00 UTC/);
  // NOT yet added to vercel.json
  const v = JSON.parse(read("vercel.json"));
  assert.ok(!v.crons.some((c) => /social-backlog-refill|backlog-refill/.test(c.path)), "refill cron must NOT be in vercel.json until proof");
});

// ---- shared queue+reconcile guardrails (source contract) --------
test("N3-5. backlogRefill enforces every SS-guardrail and calls the exact-artifact eligibility with familyStatus + policy version", () => {
  const s = read("lib/newsroom/backlogRefill.mjs");
  assert.match(s, /familyStatus === "MANUAL_ONLY" \|\| famStatus === "WITHHELD"|famStatus === "MANUAL_ONLY"/);
  assert.match(s, /artifactQueueEligible\(\{[\s\S]*?familyStatus: famStatus,[\s\S]*?policyVersion: VISUAL_REVIEW_POLICY_VERSION/);
  assert.match(s, /mode: "scheduled"/);
  assert.match(s, /BUFFER_QUEUED|status: "BUFFER_QUEUED"|scheduleOne/);
  assert.match(s, /queuedContentStale/);
  assert.match(s, /reconcileOne/);
  assert.match(s, /UNEXPECTED_IMMEDIATE_PUBLISH/);
  assert.match(s, /FEED_FAIL/);
  assert.match(s, /commercial_share > 0\.4|<= 40%/);
  assert.match(s, /NEAR_TERM_HOURS/);
  assert.match(s, /BACKLOG_LOW_BUT_NO_QUALITY_CONTENT/);
  assert.match(s, /noteBacklogFailure|backlogCircuitStatus/);
  assert.match(s, /idempotent|buffer_provider_ref/);
  // it does NOT import a renderer (Vercel-safe stage only)
  assert.doesNotMatch(s, /createRenderer|social\/render/);
});

test("N3-6. a dry run never needs the enable flag; a real queue requires SOCIAL_BUFFER_BACKLOG_ENABLED + scheduled mode", () => {
  const s = read("lib/newsroom/backlogRefill.mjs");
  assert.match(s, /resolveBacklogPosture\(env, \{ requestQueue: !dryRun \}\)/);
  assert.match(s, /!dryRun && !posture\.canQueueProvider/);
  assert.match(s, /mode !== "scheduled"/);
});

// ---- protected route -----------------------------------------
test("N3-7. /api/social-backlog-refill is CRON_SECRET-protected, advisory-locked, circuit-gated, bounded, and separate from social-auto", () => {
  const r = read("app/api/social-backlog-refill/route.js");
  const c = code("app/api/social-backlog-refill/route.js");
  assert.match(r, /authorization.*!==.*Bearer \$\{process\.env\.CRON_SECRET\}/);
  assert.match(r, /status: 401/);
  assert.match(r, /acquireRefillLock/);
  assert.match(r, /ALREADY_RUNNING|lock\.reason/);
  assert.match(r, /backlogCircuitStatus/);
  assert.match(r, /BACKLOG_SUSPENDED/);
  assert.match(r, /maxDuration = \d+/);
  assert.match(r, /refillQueueReconcile/);           // the ONE shared impl
  assert.doesNotMatch(c, /createRenderer|reviewRenderedCreative|social\/render/); // no render on Vercel
  assert.doesNotMatch(c, /resolveSocialPosture|socialPublish/);                   // separate from the live path
});

test("N3-8. an unauthorized request to the refill route is rejected", () => {
  const r = read("app/api/social-backlog-refill/route.js");
  // both verbs share one guarded handler
  assert.match(r, /export async function GET\(request\) \{ return handle\(request\); \}/);
  assert.match(r, /export async function POST\(request\) \{ return handle\(request\); \}/);
});

// ---- operator command = same logic as cron (SS40) --------------
test("N3-9. `social:backlog -- --refill` runs the SAME refillQueueReconcile as the cron (no second impl)", () => {
  const s = read("scripts/socialBacklog.mjs");
  assert.match(s, /MODE = has\("--refill"\)/);
  assert.match(s, /import\("\.\.\/lib\/newsroom\/backlogRefill\.mjs"\)/);
  assert.match(s, /refillQueueReconcile\(\{ dryRun: !enabled, initial: true \}\)/);
  assert.match(s, /acquireRefillLock/);
});

// ---- advisory lock -----------------------------------------
test("N3-10. db.acquireRefillLock is a TTL'd append-only marker (no new table)", () => {
  const s = read("lib/social/newsroom/db.mjs");
  assert.match(s, /export async function acquireRefillLock/);
  assert.match(s, /qa_type", "REFILL_LOCK"/);
  assert.match(s, /ttlMs/);
  assert.match(s, /ALREADY_RUNNING/);
  assert.doesNotMatch(s, /create table.*lock/i);
});

// ---- QA-run retention monitor (SS35) --------------------------
test("N3-11. qaRetention classifies rows non-destructively: provider-decision & consensus rows RETAIN_FOREVER", () => {
  const rows = [
    { qa_id: "a", placement_id: "p1", qa_type: "STACK", result: "PASS", checked_at: "2026-09-01T00:00:00Z", detail: {} },
    { qa_id: "b", placement_id: "p2", qa_type: "VISUAL_REVIEW", result: "WATCH", checked_at: "2026-09-02T00:00:00Z", detail: { consensus_result: "HELD", policy_version: "3c.1" } },
    { qa_id: "c", placement_id: "p3", qa_type: "STACK", result: "WATCH", checked_at: "2026-09-03T00:00:00Z", detail: {} },
  ];
  const c = classifyQaRows(rows, { p1: "BUFFER_QUEUED", p3: "DB_PLANNED" });
  assert.equal(c.retain_forever, 2);            // p1 (queued) + p2 (consensus row)
  assert.equal(c.dev_retry_archivable_later, 1); // p3 dev retry
  const rep = qaRetentionReport(rows, { p1: "BUFFER_QUEUED" });
  assert.equal(rep.severity, "OK");
  assert.equal(rep.destructive_action_taken, false);
  assert.ok(rep.est_weeks_to_alert > 0);
  assert.equal(QA_ROW_WARN_THRESHOLD < QA_ROW_ALERT_THRESHOLD, true);
});

// ---- SAFETY ---------------------------------------------------
test("N3-12. Stage 1 / live social / email / eBay Browse / verify are untouched by this phase", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  for (const p of ["lib/newsroom/backlogRefill.mjs", "app/api/social-backlog-refill/route.js", "lib/social/newsroom/refill.mjs", "lib/social/newsroom/qaRetention.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /SOCIAL_AUTONOMOUS_ENABLED\s*=|SOCIAL_PUBLISH_ENABLED\s*=|RIGHTS_STATE\.publishing\s*=|Stage 1/, `${p} touches live autonomy`);
    assert.doesNotMatch(c, /EMAIL_AUTONOMOUS|DIGEST_SEND_ENABLED|sendDigest|newsletter_subscribers/i, `${p} touches email`);
    assert.doesNotMatch(c, /ebayBrowse|\/buy\/browse|browseSearch/i, `${p} eBay Browse`);
    assert.doesNotMatch(c, /verifyAllocator|allocateVerifyBatch|api\/verify-deals/, `${p} verify`);
  }
});

test("N3-13. the refill cron route is NOT in vercel.json and REFILL_SCHEDULE.activated is false (activate only after proof)", () => {
  const v = JSON.parse(read("vercel.json"));
  assert.ok(!v.crons.some((c) => c.path.includes("social-backlog-refill")));
  assert.equal(REFILL_SCHEDULE.activated, false);
});

test("N3-14. UTM attribution scheme is unchanged (no new scheme introduced)", () => {
  for (const p of ["lib/newsroom/backlogRefill.mjs", "app/api/social-backlog-refill/route.js"]) {
    const c = code(p);
    assert.doesNotMatch(c, /utm_source|utm_medium|utm_campaign|utm_content/i, `${p} must not redefine UTM`);
  }
});

test("N3-15. scheduled mode only - no draft mode and no immediate-publish path in the recurring refill", () => {
  const raw = read("lib/newsroom/backlogRefill.mjs");
  assert.doesNotMatch(raw, /mode:\s*["']draft["']|saveToDraft:\s*true/);
  assert.match(raw, /mode:\s*["']scheduled["']/);
  assert.match(raw, /UNEXPECTED_IMMEDIATE_PUBLISH/);
  assert.match(raw, /VISUAL_REVIEW_POLICY_VERSION/);
});

test("N3-16. TikTok is NOT_PLATFORM_FIT for editorial refill and YouTube is not forced", () => {
  const s = read("lib/social/newsroom/refill.mjs");
  assert.match(s, /tiktok:\s*["']NOT_PLATFORM_FIT["']/);
  assert.ok(!EDITORIAL_REFILL_PLATFORMS.includes("tiktok"));
  assert.ok(!EDITORIAL_REFILL_PLATFORMS.includes("youtube"));
  assert.match(s, /BLOCKED,[\s\S]{0,8}not EMPTY/);
});
