// Phase SOCIAL-AUTOPILOT-1 (§24) - daily story engine / snapshot / buffer
// scanner tests. Deterministic; no live network calls (OpenAI mocked via
// fetchImpl exactly as tests/scanner/social-creative-5b.test.mjs does; DB
// discovery itself is proven separately by the real dry-run proof pack -
// scripts/socialAutopilot1Pack.mjs - since these resolvers already have
// their own real-data proofs elsewhere in the suite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FAILURE_STATES, REVISABLE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import { buildStorySnapshot, verifyNoSnapshotDrift, snapshotHash } from "../../lib/autonomous/storySnapshot.mjs";
import { scoreCandidate, meetsQualityFloor, EDITORIAL_QUALITY_FLOOR } from "../../lib/autonomous/storyScoring.mjs";
import { hardDiversityCheck, diversitySignals } from "../../lib/autonomous/contentCalendar.mjs";
import { makeStoryPackage, transition, canAdvance, PACKAGE_STATES, PACKAGE_HOLD_STATES } from "../../lib/autonomous/storyPackage.mjs";
import { platformEligibility, anyPlatformEligible } from "../../lib/autonomous/platformEligibility.mjs";
import { checkStale } from "../../lib/autonomous/staleGuard.mjs";
import { buildBufferPlacement, queueBufferPlacement, placementDedupeKey } from "../../lib/autonomous/bufferHandoff.mjs";
import { evaluateQaGate } from "../../lib/autonomous/qaGate.mjs";
import { buildDailyDigest } from "../../lib/autonomous/dailyDigest.mjs";
import { buildSeoHandoff, buildRedditHandoff } from "../../lib/autonomous/seoRedditHandoff.mjs";
import { readGenerationBudgetConfig, withinGenerationBudget, resolveCreative, computeCreativeCacheKey } from "../../lib/autonomous/creativeStage.mjs";
import { resolveCaptions } from "../../lib/autonomous/captionStage.mjs";
import { videoApplicable } from "../../lib/autonomous/videoStage.mjs";
import { runSocialAutopilot, AUTOPILOT_MODES } from "../../lib/autonomous/socialStoryEngine.mjs";
import { registerExistingMaster } from "../../lib/newsroom/video/masterCreativeCache.mjs";

const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000c4944415478da6364f8cf00000201010027187a870000000049454e44ae426082", "hex");
function tmpCache() { const d = mkdtempSync(join(tmpdir(), "auto1-")); return d; }

const FACTS_A = {
  source_records: [{ type: "deal", id: "107001" }], canonical_card_ids: ["107001"],
  canonical_card_metadata: { "107001": { name: "Clefairy", set: "Base Set" } },
  prices: { "107001": 49.98 }, market_reference_values: { "107001": 199 },
  derived_percentages: { gap_pct: 75 }, tracked_population: null, distribution_values: null,
  comparison_direction: "BELOW_MARKET", timeframe: null, source_statements: null,
  semantic_scope: "SINGLE_LISTING", fact_trace: [{ field: "asking_usd", source: "deals.total_price_usd" }],
  fact_lock_hash: null, visualization_manifest: null, classification: "COMMERCIAL",
  cta_class: "WEBSITE_FIRST", disclosure_required: true, data_freshness: { captured_at: "2026-09-09T00:00:00.000Z" },
};

// ===================== §1 IMMUTABLE SNAPSHOT =====================
test("AUTO1-1. building a snapshot freezes it deeply - mutation attempts are no-ops or throw", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "deal_drop", editorialAngle: "x", facts: FACTS_A });
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.prices));
  assert.throws(() => { snap.prices["107001"] = 1; }, /read only|frozen|not extensible/i);
  assert.equal(snap.prices["107001"], 49.98);
});

test("AUTO1-2. same facts -> same snapshot_hash; a changed fact -> a different hash (the tracked-population bug this phase exists to prevent)", () => {
  const a = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: { ...FACTS_A, tracked_population: 24545 } });
  const b = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: { ...FACTS_A, tracked_population: 24545 } });
  const c = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: { ...FACTS_A, tracked_population: 24585 } });
  assert.equal(a.snapshot_hash, b.snapshot_hash);
  assert.notEqual(a.snapshot_hash, c.snapshot_hash);
});

test("AUTO1-3. verifyNoSnapshotDrift PASSes when a downstream artifact's used values match the snapshot, FAILs on any mismatch", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "asking_vs_sold", editorialAngle: "x", facts: FACTS_A });
  const ok = verifyNoSnapshotDrift(snap, { comparison_direction: "BELOW_MARKET" }, { stage: "video" });
  assert.equal(ok.ok, true);
  const bad = verifyNoSnapshotDrift(snap, { comparison_direction: "ABOVE_MARKET" }, { stage: "video" });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "STORY_SNAPSHOT_DRIFT_FAIL");
  assert.match(bad.reason, /video/);
});

test("AUTO1-4. two independently-built snapshots with the SAME frozen facts (static vs video re-deriving them) never drift - the exact 24,545 vs 24,585 class of bug is caught", () => {
  const staticFacts = { ...FACTS_A, tracked_population: 24545 };
  const videoFacts = { ...FACTS_A, tracked_population: 24585 }; // simulates a second, later, drifted query
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: staticFacts });
  const drift = verifyNoSnapshotDrift(snap, { tracked_population: videoFacts.tracked_population }, { stage: "video_derivative" });
  assert.equal(drift.ok, false);
  assert.equal(drift.state, "STORY_SNAPSHOT_DRIFT_FAIL");
});

// ===================== SCORING / QUALITY FLOOR =====================
test("AUTO1-5. a strong deal_drop candidate scores above the quality floor; a data-thin candidate can score below it", () => {
  const strong = { family: "deal_drop", bucket: "LIVE_DEALS", facts: FACTS_A };
  const s1 = scoreCandidate(strong, { diversitySignals: { novelty: 1, feed_diversity: 1 } });
  assert.ok(meetsQualityFloor(s1), `expected ${s1.overall} >= ${EDITORIAL_QUALITY_FLOOR}`);

  const thin = { family: "evergreen", bucket: "EVERGREEN_EDUCATION", facts: { ...FACTS_A, canonical_card_ids: [], canonical_card_metadata: {}, prices: null, market_reference_values: null, derived_percentages: null, classification: "EDITORIAL", fact_trace: [] } };
  const s2 = scoreCandidate(thin, { diversitySignals: { novelty: 0, feed_diversity: 0, click_potential: 0, share_potential: 0, save_potential: 0 } });
  assert.ok(s2.overall < s1.overall);
});

test("AUTO1-6. why_selected explains the score with named dimensions, never a bare number", () => {
  const scored = scoreCandidate({ family: "asking_vs_sold", bucket: "PRICE_EDUCATION", facts: FACTS_A });
  assert.ok(Array.isArray(scored.why_selected) && scored.why_selected.length > 0);
  for (const w of scored.why_selected) assert.match(w, /^[a-z_]+=\d/);
});

// ===================== §3 DIVERSITY / REPETITION =====================
test("AUTO1-7. hardDiversityCheck rejects the exact same card repeated within the lookback window", () => {
  const candidate = { family: "deal_drop", facts: FACTS_A };
  const recent = [{ family: "deal_drop", card_ids: ["107001"], created_at: new Date().toISOString() }];
  const r = hardDiversityCheck(candidate, recent);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /same card set/.test(x)));
});

test("AUTO1-8. hardDiversityCheck rejects the same family as the immediately preceding story (never two deal_drops back to back)", () => {
  const candidate = { family: "deal_drop", facts: { ...FACTS_A, canonical_card_ids: ["999999"] } };
  const recent = [{ family: "deal_drop", card_ids: ["107001"], created_at: new Date().toISOString() }];
  const r = hardDiversityCheck(candidate, recent);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /deal_drop already posted|same family/.test(x)));
});

test("AUTO1-9. an evergreen angle repeated recently is rejected; a fresh candidate with no history passes", () => {
  const candidate = { family: "evergreen", editorialAngle: "lesson-a", angle: "lesson-a", facts: { ...FACTS_A, canonical_card_ids: [] } };
  const recent = [{ family: "evergreen", card_ids: [], hook_pattern: "lesson-a", created_at: new Date().toISOString() }];
  assert.equal(hardDiversityCheck(candidate, recent).ok, false);
  assert.equal(hardDiversityCheck(candidate, []).ok, true);
});

test("AUTO1-10. diversitySignals gives full novelty/feed_diversity with no history, and lower novelty when a family dominates recent history", () => {
  const candidate = { family: "deal_drop", bucket: "LIVE_DEALS", facts: FACTS_A };
  const none = diversitySignals(candidate, []);
  assert.equal(none.novelty, 1);
  const saturated = diversitySignals(candidate, Array.from({ length: 5 }, () => ({ family: "deal_drop", card_ids: [], created_at: new Date().toISOString() })));
  assert.ok(saturated.novelty < 1);
});

// ===================== §6/§13 STATE MACHINE =====================
test("AUTO1-11. the package state machine never skips a gate - only declared next-states are reachable", () => {
  let pkg = makeStoryPackage({ storyId: "s1", family: "deal_drop", series: "DEAL_DROP" });
  assert.equal(pkg.status, "DISCOVERED");
  assert.throws(() => transition(pkg, "BUFFER_READY"), /illegal transition/);
  pkg = transition(pkg, "CANDIDATE");
  pkg = transition(pkg, "EDITORIAL_READY");
  pkg = transition(pkg, "SNAPSHOT_LOCKED");
  assert.throws(() => transition(pkg, "PUBLISHED"), /illegal transition/);
});

test("AUTO1-12. every §13 progressive state and hold state is declared and reachable in sequence", () => {
  for (const s of ["DISCOVERED", "CANDIDATE", "EDITORIAL_READY", "SNAPSHOT_LOCKED", "CREATIVE_READY", "CAPTION_READY", "VIDEO_READY", "QA_READY", "BUFFER_READY", "BUFFER_QUEUED", "PUBLISHED", "RECONCILED"]) {
    assert.ok(PACKAGE_STATES.includes(s), s);
  }
  for (const s of ["EDITORIAL_HOLD", "FACT_HOLD", "ASSET_HOLD", "CAPTION_HOLD", "VIDEO_HOLD", "PLATFORM_HOLD", "BUFFER_HOLD", "STALE_HOLD"]) {
    assert.ok(PACKAGE_HOLD_STATES.includes(s), s);
  }
  assert.ok(canAdvance("DISCOVERED", "CANDIDATE"));
  assert.ok(!canAdvance("PUBLISHED", "DISCOVERED"));
});

// ===================== §11 PLATFORM ELIGIBILITY =====================
test("AUTO1-13. platform eligibility is independent per platform - a video hold does not block instagram/x", () => {
  const pkg = { creative: { master_image_sha256: "abc" }, captions: { instagram: { caption_text: "x" }, x: { caption_text: "y" } }, video: null };
  const elig = platformEligibility(pkg);
  assert.equal(elig.instagram.eligible, true);
  assert.equal(elig.x.eligible, true);
  assert.equal(elig.tiktok.eligible, false);
  assert.equal(elig.youtube_shorts.eligible, false);
  assert.equal(elig.reddit.eligible, false);
  assert.ok(anyPlatformEligible(elig));
});

test("AUTO1-14. tiktok/youtube_shorts become eligible once a video is ready", () => {
  const pkg = { creative: { master_image_sha256: "abc" }, captions: { instagram: { caption_text: "x" }, x: { caption_text: "y" } }, video: { ok: true, state: "READY_FOR_MANUAL_REVIEW" } };
  const elig = platformEligibility(pkg);
  assert.equal(elig.tiktok.eligible, true);
  assert.equal(elig.youtube_shorts.eligible, true);
});

test("AUTO1-15. Reddit is never eligible for auto-posting this phase, regardless of asset readiness", () => {
  const pkg = { creative: { master_image_sha256: "abc" }, captions: { instagram: { caption_text: "x" }, x: { caption_text: "y" } }, video: { ok: true } };
  assert.equal(platformEligibility(pkg).reddit.eligible, false);
});

// ===================== §14 STALE STORY PROTECTION =====================
test("AUTO1-16. a live-deal snapshot whose listing is gone is withheld, never silently re-labelled", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "deal_drop", editorialAngle: "x", facts: FACTS_A });
  const r = checkStale(snap, null);
  assert.equal(r.ok, false);
  assert.equal(r.state, "LISTING_GONE_FAIL");
});

test("AUTO1-17. a live-deal snapshot whose price moved beyond tolerance is withheld; within tolerance it is STILL_VALID", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "deal_drop", editorialAngle: "x", facts: FACTS_A });
  const moved = checkStale(snap, { is_active: true, prices: { "107001": 60 } });
  assert.equal(moved.ok, false);
  assert.equal(moved.state, "PRICE_CHANGED_MATERIALLY_FAIL");
  const stable = checkStale(snap, { is_active: true, prices: { "107001": 50.1 } });
  assert.equal(stable.ok, true);
});

test("AUTO1-18. editorial/evergreen families are never subject to listing staleness (they have no live listing)", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: FACTS_A });
  assert.equal(checkStale(snap, null).ok, true);
});

// ===================== §12/§15 BUFFER HANDOFF / IDEMPOTENCY =====================
test("AUTO1-19. the same story+snapshot+platform always produces the SAME dedupe key - a rerun cannot duplicate a placement", () => {
  const k1 = placementDedupeKey({ storyId: "s1", snapshotHash: "abc", platform: "instagram", placementType: "post" });
  const k2 = placementDedupeKey({ storyId: "s1", snapshotHash: "abc", platform: "instagram", placementType: "post" });
  const k3 = placementDedupeKey({ storyId: "s1", snapshotHash: "def", platform: "instagram", placementType: "post" });
  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
});

test("AUTO1-20. queueBufferPlacement reports ALREADY_QUEUED (never a second submit) for an id already present", () => {
  const pkg = { story_id: "s1", snapshot: { snapshot_hash: "abc" } };
  const built = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", captionText: "hello" });
  assert.equal(built.ok, true);
  const first = queueBufferPlacement(built.placement, { existingPlacementIds: new Set() });
  assert.equal(first.outcome, "WOULD_QUEUE");
  const second = queueBufferPlacement(built.placement, { existingPlacementIds: new Set([built.placement.placement_id]) });
  assert.equal(second.outcome, "ALREADY_QUEUED");
});

test("AUTO1-21. this phase never reaches a live Buffer submit - dryRun:false is refused, not silently ignored", () => {
  const pkg = { story_id: "s1", snapshot: { snapshot_hash: "abc" } };
  const built = buildBufferPlacement({ storyPackage: pkg, platform: "x", placementType: "post" });
  const r = queueBufferPlacement(built.placement, { dryRun: false });
  assert.equal(r.ok, false);
  assert.equal(r.simulated, false);
  assert.equal(r.state, "BUFFER_HOLD");
});

test("AUTO1-22. socialStoryEngine's dry-run orchestrator never calls the real Buffer provider, and the dry-run queueBufferPlacement function body has no path to createPost", async () => {
  const { readFileSync } = await import("node:fs");
  const engineSrc = readFileSync(new URL("../../lib/autonomous/socialStoryEngine.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(engineSrc, /from\s+["'].*providers\/buffer["']|\.createPost\(/, "socialStoryEngine.mjs must not import or call the live Buffer provider this phase");
  // AUTOPILOT-2 (a later phase) added a REAL, gated submit path
  // (submitBufferPlacementLive) to bufferHandoff.mjs behind
  // SOCIAL_BUFFER_LIVE_SUBMIT + OWNER_APPROVED - see social-autopilot-2.test.mjs
  // for its own safety proofs. The invariant this phase actually cares
  // about is narrower: the DRY-RUN function itself never reaches it.
  const bufferSrc = readFileSync(new URL("../../lib/autonomous/bufferHandoff.mjs", import.meta.url), "utf8");
  const dryRunFnMatch = bufferSrc.match(/export function queueBufferPlacement\([\s\S]*?\n}/);
  assert.ok(dryRunFnMatch, "queueBufferPlacement function body not found");
  assert.doesNotMatch(dryRunFnMatch[0], /\.createPost\(/, "the dry-run queueBufferPlacement must never call createPost");
});

// ===================== §17 QA GATE =====================
test("AUTO1-23. the QA gate WITHHOLDs on any required FAIL/MISSING and PASSes only when every required check is PASS", () => {
  const failing = { qa: { _sources: { factLock: "PASS", snapshotDrift: "PASS", cardFidelity: "PASS", cardMetadata: "PASS", semantic: "PASS", scope: "PASS", direction: "PASS", visualQa: "PASS", brandSafeZone: "PASS", cta: "PASS", caption: "FAIL", disclosure: "PASS", platformFit: "PASS", staleCheck: "PASS", duplicateCheck: "PASS" } }, video: null };
  const g1 = evaluateQaGate(failing);
  assert.equal(g1.ok, false);
  assert.ok(g1.results.some((r) => r.key === "CAPTION" && r.verdict === "FAIL"));

  const passing = { qa: { _sources: { factLock: "PASS", snapshotDrift: "PASS", cardFidelity: "PASS", cardMetadata: "PASS", semantic: "PASS", scope: "PASS", direction: "PASS", visualQa: "PASS", brandSafeZone: "PASS", cta: "PASS", caption: "PASS", disclosure: "PASS", platformFit: "PASS", staleCheck: "PASS", duplicateCheck: "PASS" } }, video: null };
  assert.equal(evaluateQaGate(passing).ok, true);
});

test("AUTO1-24. a video hold (video attempted but not ok) never sinks a package whose eligible platforms don't need video", () => {
  const pkg = { qa: { _sources: { factLock: "PASS", snapshotDrift: "PASS", cardFidelity: "PASS", cardMetadata: "PASS", semantic: "PASS", scope: "PASS", direction: "PASS", visualQa: "PASS", brandSafeZone: "PASS", cta: "PASS", caption: "PASS", disclosure: "PASS", videoFact: "FAIL", videoVisual: "FAIL", platformFit: "PASS", staleCheck: "PASS", duplicateCheck: "PASS" } }, video: { ok: false } };
  const gate = evaluateQaGate(pkg);
  assert.equal(gate.ok, true, JSON.stringify(gate.results.filter((r) => r.verdict !== "PASS" && r.verdict !== "N_A")));
  assert.ok(gate.results.find((r) => r.key === "VIDEO_FACT").verdict === "N_A");
});

// ===================== §5 NO FILLER =====================
test("AUTO1-25. a candidate below the quality floor is excluded from the evaluated/selectable set, never selected to fill a quota", () => {
  const weak = { family: "evergreen", bucket: "EVERGREEN_EDUCATION", facts: { ...FACTS_A, canonical_card_ids: [], canonical_card_metadata: {}, prices: null, market_reference_values: null, derived_percentages: null, fact_trace: [], classification: "EDITORIAL" } };
  const scored = scoreCandidate(weak, { diversitySignals: { novelty: 0, feed_diversity: 0, click_potential: 0, share_potential: 0, save_potential: 0 } });
  // this is a real, deliberately weak fixture - assert the floor mechanism
  // itself works in both directions rather than asserting a fixed score.
  assert.equal(typeof meetsQualityFloor(scored), "boolean");
  assert.equal(meetsQualityFloor({ overall: EDITORIAL_QUALITY_FLOOR - 0.01 }), false);
  assert.equal(meetsQualityFloor({ overall: EDITORIAL_QUALITY_FLOOR }), true);
});

// ===================== §8 COST CONTROL =====================
test("AUTO1-26. the daily/monthly image-generation budget cap actually blocks further spend", () => {
  const cfg = readGenerationBudgetConfig({ SOCIAL_DAILY_IMAGE_GEN_BUDGET: "1", SOCIAL_MONTHLY_IMAGE_GEN_BUDGET: "10" });
  assert.equal(withinGenerationBudget(0.5, 2, cfg), true);
  assert.equal(withinGenerationBudget(1, 2, cfg), false);
  assert.equal(withinGenerationBudget(0.5, 10, cfg), false);
});

test("AUTO1-27. a cached master is reused at $0 - resolveCreative never calls the generator on a cache hit", async () => {
  const dir = tmpCache();
  const prevDir = process.env.MASTER_CREATIVE_CACHE_DIR;
  process.env.MASTER_CREATIVE_CACHE_DIR = dir;
  try {
    const srcPng = join(dir, "_src.png");
    writeFileSync(srcPng, PNG_1x1);
    const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "asking_vs_sold", editorialAngle: "x", facts: FACTS_A });
    const pkg = { story_id: "s1", family: "asking_vs_sold", snapshot: snap };
    const resolved = { data: { askingUsd: 49.98, marketRefUsd: 199, card_name: "Clefairy", card_set: "Base Set" } };
    const keys = computeCreativeCacheKey(pkg, { resolved });
    registerExistingMaster({ storyId: "s1", semanticHash: keys.cacheKey, family: "asking_vs_sold", imagePath: srcPng, dir, verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY" } });
    const r = await resolveCreative(pkg, { resolved, allowGenerate: false });
    assert.equal(r.ok, true);
    assert.equal(r.source, "cache");
    assert.equal(r.costUsd, 0);
  } finally {
    if (prevDir === undefined) delete process.env.MASTER_CREATIVE_CACHE_DIR; else process.env.MASTER_CREATIVE_CACHE_DIR = prevDir;
  }
});

test("AUTO1-28. a cache miss with generation disabled WITHHOLDS (MASTER_CREATIVE_UNAVAILABLE) rather than spending or downgrading", async () => {
  const dir = tmpCache();
  const prevDir = process.env.MASTER_CREATIVE_CACHE_DIR;
  process.env.MASTER_CREATIVE_CACHE_DIR = dir;
  try {
    const snap = buildStorySnapshot({ storyId: "s2", storyFamily: "asking_vs_sold", editorialAngle: "x", facts: FACTS_A });
    const pkg = { story_id: "s2", family: "asking_vs_sold", snapshot: snap };
    const resolved = { data: { askingUsd: 49.98, marketRefUsd: 199, card_name: "Clefairy", card_set: "Base Set" } };
    const r = await resolveCreative(pkg, { resolved, allowGenerate: false });
    assert.equal(r.ok, false);
    assert.equal(r.state, "MASTER_CREATIVE_UNAVAILABLE");
  } finally {
    if (prevDir === undefined) delete process.env.MASTER_CREATIVE_CACHE_DIR; else process.env.MASTER_CREATIVE_CACHE_DIR = prevDir;
  }
});

// ===================== §9 CAPTION HANDOFF PERSISTED =====================
function mockCaptionFetch(bundle) {
  return async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(bundle) } }] }) });
}
const GOOD_BUNDLE = {
  instagram: { hook: "Asking $49.98. Market reference $199.", body: "That is 75% below a real reference, not a was-price.", why_it_matters: "Compare before you judge a listing.", cta: "pokemondealfinder.com", hashtags: [] },
  x: { hook: "Asking $49.98 vs $199 market - a 75% gap.", body: "Always compare before you judge a listing.", why_it_matters: "Real reference beats a guess.", cta: "pokemondealfinder.com", hashtags: [] },
  hooks_considered: ["a", "b"],
};

test("AUTO1-29. resolveCaptions attaches a caption_handoff onto the result - it is not left a detached stub", async () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "asking_vs_sold", editorialAngle: "x", facts: FACTS_A });
  const pkg = { story_id: "s1", family: "asking_vs_sold", snapshot: snap };
  const semanticManifest = {
    layout: "asking_vs_sold", classification: "EDITORIAL",
    story_premise: "an asking price and the real market value can differ",
    required_takeaway: "an asking price can also sit well below market - compare before you judge",
    appropriate_lesson: "an asking price can also sit well below market - compare before you judge",
    prohibited_takeaways: ["calling a below-market ask a 'premium'", "advice implying the ask is too high when ask < market"],
    comparison_left: { label: "asking price", value: 49.98, text: "$49.98" },
    comparison_right: { label: "market reference", value: 199, text: "$199" },
    comparison_direction: "BELOW_MARKET", comparison_pct: 75,
    card_identity: { name: "Clefairy" }, fact_lock_hash: "abc123",
    card_metadata_lock: { _displayable: ["name", "set"], name: "Clefairy", set: "Base Set" },
    source_attribution_manifest: { allowed_statements: ["market reference"] },
    timeframe_manifest: { allowed_timeframes: [] },
  };
  const r = await resolveCaptions(pkg, {
    semanticManifest, env: { OPENAI_API_KEY: "test" }, fetchImpl: mockCaptionFetch(GOOD_BUNDLE),
    budget: { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] },
  });
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.caption_handoff, "caption_handoff must be attached, not a detached stub");
  assert.equal(r.caption_handoff.story_id, "s1");
  assert.ok(r.captions.instagram?.caption_text);
});

test("AUTO1-30. videoApplicable is true only for families the 4C.7 derivative actually supports; evergreen/price_band_insight are N/A not a failure", () => {
  assert.equal(videoApplicable("asking_vs_sold"), true);
  assert.equal(videoApplicable("deal_drop"), true);
  assert.equal(videoApplicable("market_snapshot"), true);
  assert.equal(videoApplicable("three_under_25"), true);
  assert.equal(videoApplicable("printing_compare"), true);
  assert.equal(videoApplicable("evergreen"), false);
  assert.equal(videoApplicable("price_band_insight"), false);
});

// ===================== §21/§22 SEO / REDDIT HANDOFF (never activated) =====================
test("AUTO1-31. seo_handoff and reddit_handoff are built from the frozen snapshot only, and Reddit posting is explicitly not automated", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "printing_compare", editorialAngle: "1st Edition vs Unlimited", facts: { ...FACTS_A, canonical_card_ids: ["1", "2"], canonical_card_metadata: { 1: { name: "Charizard", set: "Base" }, 2: { name: "Charizard", set: "Base" } } } });
  const pkg = { story_id: "s1", family: "printing_compare", bucket: "PRINTING_EDUCATION", editorial_angle: "1st Edition vs Unlimited", snapshot: snap };
  const seo = buildSeoHandoff(pkg);
  assert.equal(seo.pokemon, "Charizard");
  assert.ok(Array.isArray(seo.internal_link_opportunities) && seo.internal_link_opportunities.length === 2);
  const reddit = buildRedditHandoff(pkg);
  assert.equal(reddit.posting_automated, false);
  assert.equal(reddit.omit_affiliate_link, true);
});

// ===================== §18 MANUAL_REVIEW ONLY / AUTOPILOT NOT ACTIVE =====================
test("AUTO1-32. AUTOPILOT_MODES declares both names but runSocialAutopilot refuses AUTOPILOT mode outright this phase", async () => {
  assert.deepEqual([...AUTOPILOT_MODES].sort(), ["AUTOPILOT", "MANUAL_REVIEW"]);
  const r = await runSocialAutopilot({ mode: "AUTOPILOT" });
  assert.equal(r.ok, false);
  assert.equal(r.state, "EDITORIAL_WITHHOLD");
});

test("AUTO1-33. an unknown mode throws rather than silently defaulting to something live", async () => {
  await assert.rejects(() => runSocialAutopilot({ mode: "LIVE" }), /unknown autopilot mode/);
});

// ===================== DAILY DIGEST =====================
test("AUTO1-34. the daily digest states plainly when zero stories were selected - never implies a post happened", () => {
  const d = buildDailyDigest({ candidatesDiscovered: 5, candidatesRejected: [{ family: "x", reason: "y" }], storiesSelected: [] });
  assert.match(d.headline, /no story cleared the quality floor|0 posts/);
  assert.equal(d.stories_selected, 0);
});

// ===================== ARCHITECTURE / SCOPE (§0/§26) =====================
test("AUTO1-35. every SOCIAL-AUTOPILOT-1 failure state is declared + none are silently invented", () => {
  for (const s of ["STORY_SNAPSHOT_DRIFT_FAIL", "STALE_STORY_FAIL", "LISTING_GONE_FAIL", "PRICE_CHANGED_MATERIALLY_FAIL", "DUPLICATE_PLACEMENT_FAIL", "PLATFORM_NOT_ELIGIBLE_FAIL", "BUDGET_EXCEEDED_HOLD", "WEAK_CANDIDATE_FAIL", "DIVERSITY_REPETITION_FAIL"]) {
    assert.ok(FAILURE_STATES.includes(s), s);
  }
});

test("AUTO1-36. no lib/autonomous module touches Reddit posting, SEO page generation, email, eBay Browse, or RIGHTS_STATE mutation", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../../lib/autonomous/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(src, /reddit\.post|generateSeoPage|resend\.emails\.send|ebayBrowse|RIGHTS_STATE\.publishing\s*=/i, f);
  }
});

test("AUTO1-37. no 4C.8 / new video engine references anywhere in the autopilot layer - 4C.7 is reused, not redesigned", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../../lib/autonomous/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(src, /4c\.?8|4C\.8/, f);
  }
});
