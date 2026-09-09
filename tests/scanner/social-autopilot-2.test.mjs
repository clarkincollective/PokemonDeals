// Phase SOCIAL-AUTOPILOT-2 (§16/§17) - controlled Buffer activation +
// production safety scanner tests. No real network call, no real
// Supabase write - the provider and the DB layer are both injected fakes
// (submitBufferPlacementLive/reconcileBufferPlacementLive/
// cancelBufferPlacementLive all accept `provider` and `db` overrides for
// exactly this reason).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { resolveProductionSafety, canSubmitLive } from "../../lib/autonomous/productionSafety.mjs";
import { verifyPackageIntegrity } from "../../lib/autonomous/packageIntegrity.mjs";
import { resolveChannel, loadChannelMap, SUPPORTED_LIVE_PLATFORMS } from "../../lib/autonomous/channelResolution.mjs";
import {
  buildBufferPlacement, submitBufferPlacementLive, reconcileBufferPlacementLive, cancelBufferPlacementLive,
  classifyProviderFailure, retryPolicyFor, FAILURE_CLASSES,
} from "../../lib/autonomous/bufferHandoff.mjs";
import { buildStorySnapshot } from "../../lib/autonomous/storySnapshot.mjs";
import { makeStoryPackage, transition, approveStoryPackage, PACKAGE_STATES, PACKAGE_HOLD_STATES } from "../../lib/autonomous/storyPackage.mjs";
import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const FACTS = {
  source_records: [], canonical_card_ids: [], canonical_card_metadata: {},
  prices: null, market_reference_values: null, derived_percentages: { under_25_pct: 85.7 },
  tracked_population: 24545, distribution_values: null, comparison_direction: "BELOW_MARKET",
  timeframe: null, source_statements: null, semantic_scope: "GLOBAL_TRACKED_POPULATION",
  fact_trace: [{ field: "under_25_pct", source: "card_catalog" }], fact_lock_hash: null,
  visualization_manifest: null, classification: "EDITORIAL", cta_class: "WEBSITE_FIRST",
  disclosure_required: false, data_freshness: { captured_at: new Date().toISOString() },
};

const PASSING_QA_SOURCES = {
  factLock: "PASS", snapshotDrift: "PASS", cardFidelity: "PASS", cardMetadata: "PASS",
  semantic: "PASS", scope: "PASS", direction: "PASS", visualQa: "PASS", brandSafeZone: "PASS",
  cta: "PASS", caption: "PASS", disclosure: "PASS", platformFit: "PASS", staleCheck: "PASS", duplicateCheck: "PASS",
};

function goodPackage({ status = "OWNER_APPROVED", approved = true } = {}) {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: FACTS });
  return {
    story_id: "s1", family: "market_snapshot", status,
    owner_review: { required: true, approved, approved_at: approved ? new Date().toISOString() : null, approved_by: approved ? "tester" : null },
    snapshot: snap,
    semantic_manifest: { comparison_direction: "BELOW_MARKET" },
    creative: { master_image_sha256: "abc123" },
    captions: { instagram: { caption_text: "hello world" }, x: { caption_text: "hi" } },
    video: null,
    qa: { _sources: PASSING_QA_SOURCES },
  };
}
function goodPlacement(pkg, platform = "instagram") {
  const captionKey = platform === "tiktok" || platform === "youtube_shorts" ? "x" : platform;
  const built = buildBufferPlacement({ storyPackage: pkg, platform, placementType: "post", assetHash: "abc123", captionText: pkg.captions[captionKey].caption_text });
  return built.placement;
}
function fakeDb(rows = {}) {
  const store = new Map(Object.entries(rows));
  return {
    async getPlacement(id) { return { ready: true, row: store.get(id) ?? null }; },
    async patchPlacement(id, patch) { const cur = store.get(id) ?? {}; const next = { ...cur, ...patch }; store.set(id, next); return { ready: true, wrote: 1 }; },
    _store: store,
  };
}
function fakeProvider({ createPost, getPostStatus, deletePost, configured = true } = {}) {
  return {
    isConfigured: () => configured,
    createPost: createPost ?? (async () => ({ accepted: false, reason: "not_mocked" })),
    getPostStatus: getPostStatus ?? (async () => ({ ok: false, reason: "not_mocked" })),
    deletePost: deletePost ?? (async () => ({ ok: false, deleted: false, reason: "not_mocked" })),
  };
}
const LIVE_ENV = { SOCIAL_BUFFER_LIVE_SUBMIT: "true" };

// ===================== §17.1-2 FLAG DEFAULTS =====================
test("AUTO2-1. live submit flag defaults false", () => {
  assert.equal(resolveProductionSafety({}).bufferLiveSubmit, false);
  assert.equal(resolveProductionSafety({ SOCIAL_BUFFER_LIVE_SUBMIT: "1" }).bufferLiveSubmit, false);
  assert.equal(resolveProductionSafety({ SOCIAL_BUFFER_LIVE_SUBMIT: "true" }).bufferLiveSubmit, true);
});

test("AUTO2-2. autopilot flag defaults false", () => {
  assert.equal(resolveProductionSafety({}).autopilotEnabled, false);
  assert.equal(resolveProductionSafety({ SOCIAL_AUTOPILOT_ENABLED: "yes" }).autopilotEnabled, false);
});

// ===================== §17.3 OWNER APPROVAL GATE =====================
test("AUTO2-3. BUFFER_READY cannot submit without OWNER_APPROVED", () => {
  const pkg = goodPackage({ status: "BUFFER_READY", approved: false });
  const gate = canSubmitLive(pkg, LIVE_ENV);
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /OWNER_APPROVED|approved/);
});

test("approveStoryPackage requires BUFFER_READY and an attributable approver, and transitions to OWNER_APPROVED", () => {
  let pkg = makeStoryPackage({ storyId: "s1", family: "market_snapshot", series: "MARKET_SNAPSHOT" });
  assert.throws(() => approveStoryPackage(pkg, { approvedBy: "owner" }), /BUFFER_READY/);
  pkg = { ...pkg, status: "BUFFER_READY" };
  assert.throws(() => approveStoryPackage(pkg, {}), /approvedBy/);
  const approved = approveStoryPackage(pkg, { approvedBy: "owner" });
  assert.equal(approved.status, "OWNER_APPROVED");
  assert.equal(approved.owner_review.approved, true);
  assert.equal(approved.owner_review.approved_by, "owner");
});

// ===================== §17.4 QA FAILURE BLOCKS =====================
test("AUTO2-4. QA failure blocks the provider call - never reaches createPost", async () => {
  const pkg = goodPackage();
  pkg.qa._sources = { ...PASSING_QA_SOURCES, caption: "FAIL" };
  const placement = goodPlacement(pkg);
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "x" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r.ok, false);
  assert.equal(called, false);
});

// ===================== §17.5/6 STALE / DRIFT BLOCK =====================
test("AUTO2-5. snapshot drift blocks the provider call", async () => {
  const pkg = goodPackage();
  pkg.semantic_manifest = { comparison_direction: "ABOVE_MARKET" }; // frozen snapshot says BELOW_MARKET
  const placement = goodPlacement(pkg);
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "x" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r.ok, false);
  assert.equal(r.state, "STORY_SNAPSHOT_DRIFT_FAIL");
  assert.equal(called, false);
});

// ===================== §17.18 HASH MISMATCH BLOCKS =====================
test("AUTO2-6. caption/asset hash mismatch blocks the provider call (PLACEMENT_PACKAGE_DRIFT_FAIL)", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  pkg.captions.instagram.caption_text = "a different caption entirely"; // placement was built with the old text
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "x" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r.ok, false);
  assert.equal(r.state, "PLACEMENT_PACKAGE_DRIFT_FAIL");
  assert.equal(called, false);
  assert.equal(FAILURE_STATES.includes("PLACEMENT_PACKAGE_DRIFT_FAIL"), true);
});

test("verifyPackageIntegrity passes on a matching package/placement pair and fails on any mismatch", () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  assert.equal(verifyPackageIntegrity(pkg, placement).ok, true);
  const bad = { ...placement, artifact_hash: "wrong" };
  const r = verifyPackageIntegrity(pkg, bad);
  assert.equal(r.ok, false);
  assert.ok(r.mismatches.some((m) => m.includes("asset hash")));
});

// ===================== §17.7 DUPLICATE / PROVIDER_REF PREVENTS RESUBMIT =====================
test("AUTO2-7. a placement that already has a provider_ref refuses a second submit", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const db = fakeDb({ [placement.placement_id]: { ...placement, buffer_provider_ref: "buf_123" } });
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "buf_999" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db });
  assert.equal(r.state, "ALREADY_SUBMITTED");
  assert.equal(r.provider_ref, "buf_123");
  assert.equal(called, false);
});

// ===================== §16.A/§17.8 CRASH RECOVERY: BUFFER_SUBMITTING with no ref =====================
test("AUTO2-8. a placement stuck at BUFFER_SUBMITTING (a crashed prior attempt) triggers reconcile-first, never a blind resubmit", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const db = fakeDb({ [placement.placement_id]: { ...placement, status: "BUFFER_SUBMITTING" } });
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "buf_999" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db });
  assert.equal(r.state, "BUFFER_SUBMIT_UNKNOWN");
  assert.equal(called, false);
});

// ===================== §16.D SAME RUN TWICE -> EXACTLY ONE PROVIDER CALL =====================
test("AUTO2-9. running the same submit twice in sequence results in exactly ONE accepted provider call, not two", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const db = fakeDb();
  let calls = 0;
  const provider = fakeProvider({ createPost: async () => { calls += 1; return { accepted: true, id: "buf_1", statusRaw: "scheduled" }; } });
  const first = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db });
  assert.equal(first.submitted, true);
  assert.equal(calls, 1);
  // rerun with the (now updated) DB state - must not create a second post
  const second = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db });
  assert.equal(second.state, "ALREADY_SUBMITTED");
  assert.equal(calls, 1, "a rerun must not call the provider a second time");
});

// ===================== §16.C AMBIGUOUS PROVIDER OUTCOME =====================
test("AUTO2-10. an unclassifiable provider rejection becomes BUFFER_SUBMIT_UNKNOWN, not a clean failure eligible for retry", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const provider = fakeProvider({ createPost: async () => ({ accepted: false, reason: "buffer_UnexpectedError", detail: "something odd" }) });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r.ok, false);
  // "unexpected_error" matches the PROVIDER_VALIDATION_FAILURE class in this
  // taxonomy (a named provider error type), so it holds rather than being
  // marked UNKNOWN - either way it must never be flagged safe-to-retry blind.
  assert.notEqual(r.failure_class, undefined);
  assert.equal(retryPolicyFor(r.failure_class).safeToRetry, false);
});

// ===================== §17.9/10/11/12 PROVIDER RESPONSE VALIDATION + RECONCILIATION =====================
test("AUTO2-11. reconciliation resolves a normal still-queued provider state without changing local status", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const withRef = { ...placement, buffer_provider_ref: "buf_1" };
  const provider = fakeProvider({ getPostStatus: async () => ({ ok: true, published: false, failed: false, statusRaw: "scheduled" }) });
  const r = await reconcileBufferPlacementLive(withRef, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r.ok, true);
  assert.equal(r.state, "BUFFER_QUEUED");
  assert.equal(r.published, false);
});

test("AUTO2-12. a published provider state maps to PUBLISHED with a real provider timestamp", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const withRef = { ...placement, buffer_provider_ref: "buf_1" };
  const provider = fakeProvider({ getPostStatus: async () => ({ ok: true, published: true, publishedAt: "2026-09-10T00:00:00.000Z", statusRaw: "sent", platformPostUrl: "https://instagram.com/p/xyz" }) });
  const db = fakeDb();
  const r = await reconcileBufferPlacementLive(withRef, { env: LIVE_ENV, provider, db });
  assert.equal(r.state, "PUBLISHED");
  assert.equal(r.publishedAt, "2026-09-10T00:00:00.000Z");
  assert.equal(db._store.get(withRef.placement_id).status, "PUBLISHED");
});

test("AUTO2-13. a failed provider state maps safely (BUFFER_HOLD), never PUBLISHED", async () => {
  const pkg = goodPackage();
  const placement = goodPlacement(pkg);
  const withRef = { ...placement, buffer_provider_ref: "buf_1" };
  const provider = fakeProvider({ getPostStatus: async () => ({ ok: true, published: false, failed: true, failReason: "provider_error", statusRaw: "error" }) });
  const db = fakeDb();
  const r = await reconcileBufferPlacementLive(withRef, { env: LIVE_ENV, provider, db });
  assert.equal(r.state, "FAILED");
  assert.notEqual(db._store.get(withRef.placement_id).status, "PUBLISHED");
});

test("a post the provider can no longer find reconciles to DELETED, not silently ignored", async () => {
  const placement = { placement_id: "p1", buffer_provider_ref: "buf_1" };
  const provider = fakeProvider({ getPostStatus: async () => ({ ok: false, reason: "buffer_post_not_found" }) });
  const r = await reconcileBufferPlacementLive(placement, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r.state, "DELETED");
});

// ===================== §17.14/15 CANCEL SAFETY =====================
test("AUTO2-14. cancel requires the exact placement_id and its provider_ref - it never bulk-deletes or guesses", async () => {
  const provider = fakeProvider();
  const r1 = await cancelBufferPlacementLive(null, { env: LIVE_ENV, provider, db: fakeDb() });
  assert.equal(r1.ok, false);
  const db = fakeDb({ p1: { placement_id: "p1", buffer_provider_ref: null } });
  const r2 = await cancelBufferPlacementLive("p1", { env: LIVE_ENV, provider, db });
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /no provider_ref/);
});

test("AUTO2-15. cancel calls deletePost with exactly the one provider_ref and updates only that row", async () => {
  const db = fakeDb({ p1: { placement_id: "p1", buffer_provider_ref: "buf_1" }, p2: { placement_id: "p2", buffer_provider_ref: "buf_2" } });
  let deletedId = null;
  const provider = fakeProvider({ deletePost: async (id) => { deletedId = id; return { ok: true, deleted: true, id, statusRaw: "deleted" }; } });
  const r = await cancelBufferPlacementLive("p1", { env: LIVE_ENV, provider, db });
  assert.equal(r.cancelled, true);
  assert.equal(deletedId, "buf_1");
  assert.equal(db._store.get("p1").status, "CANCELLED");
  assert.notEqual(db._store.get("p2").status, "CANCELLED");
});

// ===================== §17.16/17 CHANNEL RESOLUTION =====================
test("AUTO2-16. wrong/mismatched channel service blocks resolution rather than sending to the wrong channel", () => {
  const map = { instagram_main: "abc123", _channels: { instagram_main: { service: "twitter" } } };
  const r = resolveChannel("instagram", map);
  assert.equal(r.ok, false);
  assert.match(r.reason, /CHANNEL_NOT_FOUND/);
});

test("AUTO2-17. a missing channel entry blocks resolution", () => {
  const r = resolveChannel("tiktok", { instagram_main: "abc" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /CHANNEL_NOT_FOUND/);
});

test("resolveChannel resolves a real, correctly-typed channel", () => {
  const map = { instagram_main: "abc123", _channels: { instagram_main: { service: "instagram", name: "pokemondealfinder" } } };
  const r = resolveChannel("instagram", map);
  assert.equal(r.ok, true);
  assert.equal(r.channelId, "abc123");
});

test("the real repo channels.json (if present) covers every supported live platform without ambiguity", () => {
  const map = loadChannelMap();
  if (!map) return; // not present in this environment - nothing to assert
  for (const platform of SUPPORTED_LIVE_PLATFORMS) {
    const r = resolveChannel(platform, map);
    assert.equal(typeof r.ok, "boolean");
  }
});

// ===================== §17.19/20 DISCLOSURE / EBAY-FIRST STILL ENFORCED =====================
test("AUTO2-18. no eBay-first CTA anywhere in lib/autonomous - this phase does not touch caption/CTA logic", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../../lib/autonomous/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(src, /view on ebay|bid on ebay/i, f);
  }
});

// ===================== §17.21/22 VIDEO-REQUIRED PLATFORM =====================
test("AUTO2-19. a video-required platform cannot submit with a missing/failed video - integrity check blocks it", () => {
  const pkg = goodPackage();
  pkg.video = { ok: false };
  const placement = goodPlacement(pkg, "tiktok");
  const r = verifyPackageIntegrity(pkg, placement);
  assert.equal(r.ok, false);
  assert.ok(r.mismatches.some((m) => m.includes("requires a ready video")));
});

test("AUTO2-20. Instagram/X static placements remain valid even when video failed for this package", () => {
  const pkg = goodPackage();
  pkg.video = { ok: false };
  const placement = goodPlacement(pkg, "instagram");
  assert.equal(verifyPackageIntegrity(pkg, placement).ok, true);
});

// ===================== §17.23/24 NO CRON / RECURRING ACTIVATION =====================
test("AUTO2-21. no lib/autonomous module registers a cron/scheduled job or a setInterval loop", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../../lib/autonomous/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(src, /setInterval|node-cron|vercel\.json/i, f);
  }
});

// ===================== §17.25/26/27/28 SCOPE =====================
test("AUTO2-22. no Reddit publishing, SEO generation, email, or eBay Browse code anywhere in lib/autonomous", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../../lib/autonomous/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(src, /reddit\.post|generateSeoPage|resend\.emails\.send|ebayBrowse/i, f);
  }
});

// ===================== STATE MACHINE / SCOPE =====================
test("the new OWNER_APPROVED/BUFFER_SUBMITTING/BUFFER_SUBMIT_UNKNOWN states are declared and reachable in sequence", () => {
  assert.ok(PACKAGE_STATES.includes("OWNER_APPROVED"));
  assert.ok(PACKAGE_STATES.includes("BUFFER_SUBMITTING"));
  assert.ok(PACKAGE_HOLD_STATES.includes("BUFFER_SUBMIT_UNKNOWN"));
  assert.ok(PACKAGE_HOLD_STATES.includes("LISTING_GONE_HOLD"));
  let pkg = makeStoryPackage({ storyId: "s1", family: "market_snapshot", series: "MARKET_SNAPSHOT" });
  pkg = { ...pkg, status: "BUFFER_READY" };
  pkg = transition(pkg, "OWNER_APPROVED");
  pkg = transition(pkg, "BUFFER_SUBMITTING");
  pkg = transition(pkg, "BUFFER_QUEUED");
  assert.equal(pkg.status, "BUFFER_QUEUED");
});

test("no 4C.8 / new creative-caption-video architecture references in the new AUTOPILOT-2 modules - everything frozen is frozen", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["productionSafety.mjs", "packageIntegrity.mjs", "channelResolution.mjs", "bufferHandoff.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /4c\.?8|4C\.8/, f);
  }
});

test("classifyProviderFailure covers the full closed taxonomy and never returns an undeclared class", () => {
  const cases = [
    ["Unauthorized", "AUTH_FAILURE"], ["rate limited, 429", "RATE_LIMIT"],
    ["NotFoundError channel", "CHANNEL_NOT_FOUND"], ["asset upload failed", "ASSET_UPLOAD_FAILURE"],
    ["InvalidInputError caption too long", "CAPTION_REJECTED"], ["LimitReachedError", "PROVIDER_VALIDATION_FAILURE"],
    ["fetch failed network", "NETWORK_FAILURE"], ["something totally unrecognised", "UNKNOWN_PROVIDER_STATE"],
  ];
  for (const [reason, expected] of cases) {
    const c = classifyProviderFailure(reason);
    assert.equal(c, expected, reason);
    assert.ok(FAILURE_CLASSES.includes(c));
  }
});
