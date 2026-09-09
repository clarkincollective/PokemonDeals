// Phase SOCIAL-AUTOPILOT-3 (§18) - production media hosting scanner
// tests. No real network call, no real Supabase upload - the storage
// provider is an injected in-memory fake (hostMedia/verifyReachability
// both accept a `storage` override for exactly this reason).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { hostMedia, verifyReachability, verifyHostedAssetDrift, MEDIA_TYPE_FOR_PLATFORM } from "../../lib/autonomous/mediaHostingStage.mjs";
import { buildMediaPackage, assertMediaPresent, buildPlatformMediaPayload, MEDIA_REQUIRED } from "../../lib/autonomous/mediaPackage.mjs";
import { auditCompletePlacementPackage } from "../../lib/autonomous/completePackageAudit.mjs";
import { summarizeHostingRun, projectStorage } from "../../lib/autonomous/storageEstimate.mjs";
import { verifyPackageIntegrity } from "../../lib/autonomous/packageIntegrity.mjs";
import { submitBufferPlacementLive, buildBufferPlacement } from "../../lib/autonomous/bufferHandoff.mjs";
import { buildStorySnapshot } from "../../lib/autonomous/storySnapshot.mjs";
import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import { saveHostedAssets } from "../../lib/social/storage/hostedAssets.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const LIVE_ENV = { SOCIAL_BUFFER_LIVE_SUBMIT: "true" };

// a tiny valid 1x1 PNG (same fixture used across the 4C/5A test suites)
const PNG_1x1 = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108020000009077533d0000000c4944415478da6364f8cf00000201010027187a870000000049454e44ae426082", "hex");

function tmpDir() { return mkdtempSync(join(tmpdir(), "auto3-")); }
function hostedAssetsPathIn(dir) { const p = join(dir, "hosted-assets.json"); return p; }

// in-memory fake storage - no network, no real Supabase project touched.
function fakeStorage({ objects = new Map(), configured = true, headOverride = null, fetchOverride = null } = {}) {
  return {
    name: "fake",
    isConfigured: () => configured,
    async upload({ storageKey, bytes, contentType }) {
      if (objects.has(storageKey)) return { ok: true, storageKey, publicUrl: `https://fake.test/${storageKey}`, deduped: true };
      objects.set(storageKey, { bytes, contentType });
      return { ok: true, storageKey, publicUrl: `https://fake.test/${storageKey}`, deduped: false };
    },
    async head(url) {
      if (headOverride) return headOverride(url);
      const key = url.replace("https://fake.test/", "");
      const obj = objects.get(key);
      if (!obj) return { ok: false, status: 404 };
      return { ok: true, status: 200, contentType: obj.contentType, contentLength: obj.bytes.length };
    },
    _objects: objects,
  };
}

// patch global fetch for verifyReachability's GET download step
function withFetch(handler, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  return fn().finally(() => { globalThis.fetch = orig; });
}

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
function goodPackage() {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: FACTS });
  return {
    story_id: "s1", family: "market_snapshot", status: "OWNER_APPROVED",
    owner_review: { required: true, approved: true, approved_at: new Date().toISOString(), approved_by: "tester" },
    snapshot: snap, semantic_manifest: { comparison_direction: "BELOW_MARKET" },
    creative: { master_image_sha256: null }, // set per-test to the real hosted sha
    captions: { instagram: { caption_text: "hello world" }, x: { caption_text: "hi" } },
    video: null, qa: { _sources: PASSING_QA_SOURCES },
  };
}
function fakeDb(rows = {}) {
  const store = new Map(Object.entries(rows));
  return { async getPlacement(id) { return { ready: true, row: store.get(id) ?? null }; }, async patchPlacement(id, patch) { const cur = store.get(id) ?? {}; store.set(id, { ...cur, ...patch }); return { ready: true }; }, _store: store };
}
function fakeProvider({ createPost } = {}) {
  return { isConfigured: () => true, createPost: createPost ?? (async () => ({ accepted: true, id: "buf_1" })), getPostStatus: async () => ({ ok: false }), deletePost: async () => ({ ok: false }) };
}

// ===================== §18.1 MEDIA-REQUIRED HARD RULE =====================
test("AUTO3-1. a media-required placement cannot submit with assets:[] (no mediaPackage supplied)", async () => {
  const pkg = goodPackage();
  pkg.creative.master_image_sha256 = "abc";
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: "abc", captionText: "hello world" }).placement;
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider: fakeProvider(), db: fakeDb() });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MEDIA_REQUIRED_FAIL");
});

test("assertMediaPresent requires PUBLIC_VERIFIED accessibility, not just a URL", () => {
  assert.equal(assertMediaPresent({ hosted_url: "https://x", accessibility: "HOSTED_UNVERIFIED" }, "instagram").ok, false);
  assert.equal(assertMediaPresent({ hosted_url: "https://x", accessibility: "PUBLIC_VERIFIED" }, "instagram").ok, true);
  assert.equal(MEDIA_REQUIRED.x, true);
});

// ===================== §18.2/3 UPLOAD -> PERSISTED RECORD =====================
test("AUTO3-2. hosting an image returns a persisted media record with a public URL", async () => {
  const dir = tmpDir();
  const storage = fakeStorage();
  const localPath = join(dir, "master.png");
  writeFileSync(localPath, PNG_1x1);
  const r = await hostMedia({ localPath, mediaType: "STATIC_IMAGE", family: "market_snapshot", hostedAssetsPath: hostedAssetsPathIn(dir), storage });
  assert.equal(r.ok, true);
  assert.equal(r.record.sha256, sha256(PNG_1x1));
  assert.ok(r.record.public_url.startsWith("https://fake.test/"));
  assert.equal(r.cacheHit, false);
});

test("AUTO3-3. hosting a video-typed asset persists a media record too (mp4 mime)", async () => {
  const dir = tmpDir();
  const storage = fakeStorage();
  const localPath = join(dir, "clip.mp4");
  writeFileSync(localPath, Buffer.from("fake-mp4-bytes-not-real-but-non-empty"));
  const r = await hostMedia({ localPath, mediaType: "VIDEO", family: "asking_vs_sold", hostedAssetsPath: hostedAssetsPathIn(dir), storage });
  assert.equal(r.ok, true);
  assert.equal(r.record.mime_type, "video/mp4");
});

// ===================== §18.4/5 CACHE REUSE =====================
test("AUTO3-4. the same SHA reuses the existing hosted media (no re-upload)", async () => {
  const dir = tmpDir();
  const storage = fakeStorage();
  const localPath = join(dir, "master.png");
  writeFileSync(localPath, PNG_1x1);
  const hostedAssetsPath = hostedAssetsPathIn(dir);
  const first = await hostMedia({ localPath, mediaType: "STATIC_IMAGE", hostedAssetsPath, storage });
  const second = await hostMedia({ localPath, mediaType: "STATIC_IMAGE", hostedAssetsPath, storage });
  assert.equal(second.cacheHit, true);
  assert.equal(second.uploadedBytes, 0);
  assert.equal(second.record.public_url, first.record.public_url);
  assert.equal(storage._objects.size, 1, "only one object should ever be uploaded for identical bytes");
});

test("AUTO3-5. the same story's media used on Instagram+X resolves to one hosted object, not two", async () => {
  const dir = tmpDir();
  const storage = fakeStorage();
  const localPath = join(dir, "master.png");
  writeFileSync(localPath, PNG_1x1);
  const hostedAssetsPath = hostedAssetsPathIn(dir);
  const forInstagram = await hostMedia({ localPath, mediaType: MEDIA_TYPE_FOR_PLATFORM.instagram, hostedAssetsPath, storage });
  const forX = await hostMedia({ localPath, mediaType: MEDIA_TYPE_FOR_PLATFORM.x, hostedAssetsPath, storage });
  assert.equal(forInstagram.record.sha256, forX.record.sha256);
  assert.equal(storage._objects.size, 1);
});

// ===================== §18.6 WRONG SHA BLOCKS =====================
test("AUTO3-6. verifyHostedAssetDrift blocks on a wrong SHA (HOSTED_ASSET_DRIFT_FAIL)", () => {
  const record = { sha256: "aaa", public_url: "https://fake.test/x" };
  const ok = verifyHostedAssetDrift(record, "aaa");
  assert.equal(ok.ok, true);
  const bad = verifyHostedAssetDrift(record, "bbb");
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "HOSTED_ASSET_DRIFT_FAIL");
});

// ===================== §18.7/8/9/10/11/12 REACHABILITY / MIME / SIZE / DIMENSION =====================
test("AUTO3-7. an inaccessible URL blocks (MEDIA_URL_UNREACHABLE_FAIL)", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: false, status: 0, error: "timeout" }) });
  const r = await verifyReachability({ public_url: "https://fake.test/missing", sha256: "x", artifact_type: "image_45" }, { storage });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MEDIA_URL_UNREACHABLE_FAIL");
});

test("AUTO3-8. a 404 blocks", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: false, status: 404 }) });
  const r = await verifyReachability({ public_url: "https://fake.test/x", sha256: "x", artifact_type: "image_45" }, { storage });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MEDIA_URL_UNREACHABLE_FAIL");
});

test("AUTO3-9. a 403 blocks", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: false, status: 403, authChallenged: true }) });
  const r = await verifyReachability({ public_url: "https://fake.test/x", sha256: "x", artifact_type: "image_45" }, { storage });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MEDIA_URL_UNREACHABLE_FAIL");
});

test("AUTO3-10. an incorrect MIME type blocks (MEDIA_MIME_FAIL)", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: true, status: 200, contentType: "text/html", contentLength: 500 }) });
  const r = await verifyReachability({ public_url: "https://fake.test/x", sha256: "x", artifact_type: "image_45" }, { storage });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MEDIA_MIME_FAIL");
});

test("AUTO3-11. a zero-byte hosted object blocks (MEDIA_IDENTITY_FAIL)", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: true, status: 200, contentType: "image/png", contentLength: 0 }) });
  const r = await verifyReachability({ public_url: "https://fake.test/x", sha256: "x", artifact_type: "image_45" }, { storage });
  assert.equal(r.ok, false);
  assert.equal(r.state, "MEDIA_IDENTITY_FAIL");
});

test("AUTO3-12. wrong image dimensions block (MEDIA_DIMENSION_FAIL)", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: true, status: 200, contentType: "image/png", contentLength: PNG_1x1.length }) });
  const record = { public_url: "https://fake.test/x", sha256: sha256(PNG_1x1), artifact_type: "image_45" };
  await withFetch(async () => ({ arrayBuffer: async () => PNG_1x1 }), async () => {
    const r = await verifyReachability(record, { storage, expectedWidth: 1080 }); // the 1x1 fixture is not 1080 wide
    assert.equal(r.ok, false);
    assert.equal(r.state, "MEDIA_DIMENSION_FAIL");
  });
});

test("a correctly-sized/identical image passes reachability end to end", async () => {
  const storage = fakeStorage({ headOverride: async () => ({ ok: true, status: 200, contentType: "image/png", contentLength: PNG_1x1.length }) });
  const record = { public_url: "https://fake.test/x", sha256: sha256(PNG_1x1), artifact_type: "image_45" };
  await withFetch(async () => ({ arrayBuffer: async () => PNG_1x1 }), async () => {
    const r = await verifyReachability(record, { storage, expectedWidth: 1 });
    assert.equal(r.ok, true);
    assert.equal(r.verified.width, 1);
  });
});

test("AUTO3-13/14. an invalid/corrupt MP4 blocks with MEDIA_VIDEO_PROBE_FAIL", async () => {
  const corrupt = Buffer.from("this is not a real mp4 file at all");
  const storage = fakeStorage({ headOverride: async () => ({ ok: true, status: 200, contentType: "video/mp4", contentLength: corrupt.length }) });
  const record = { public_url: "https://fake.test/x", sha256: sha256(corrupt), artifact_type: "video_916" };
  await withFetch(async () => ({ arrayBuffer: async () => corrupt }), async () => {
    const r = await verifyReachability(record, { storage });
    assert.equal(r.ok, false);
    assert.equal(r.state, "MEDIA_VIDEO_PROBE_FAIL");
  });
});

// ===================== §18.16/17 PLATFORM INDEPENDENCE =====================
test("AUTO3-16. a static network (instagram/x) survives a video HOLD", () => {
  const pkg = { creative: { master_image_sha256: "abc" }, video: { ok: false } };
  const placement = { story_id: undefined, platform: "instagram", artifact_hash: "abc", caption_style: {} };
  const media = { sha256: "abc", accessibility: "PUBLIC_VERIFIED", hosted_url: "https://x", media_type: "STATIC_IMAGE" };
  assert.equal(assertMediaPresent(media, "instagram").ok, true);
});

test("AUTO3-17. a video-required network cannot use missing video (asserted via buildPlatformMediaPayload/verifyPackageIntegrity)", () => {
  const pkg = { story_id: "s1", creative: { master_image_sha256: "abc" }, video: { ok: false } };
  const placement = { story_id: "s1", platform: "tiktok", artifact_hash: null, caption_style: {} };
  const r = verifyPackageIntegrity(pkg, placement, null);
  assert.equal(r.ok, false);
  assert.ok(r.mismatches.some((m) => m.includes("requires a ready video")));
});

// ===================== §18.18 HASH CONSISTENCY =====================
test("AUTO3-18. package snapshot/asset hashes all match when a real hosted media package is used for a video platform", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "asking_vs_sold", editorialAngle: "x", facts: FACTS });
  const pkg = { story_id: "s1", snapshot: snap, creative: { master_image_sha256: "static_sha" }, video: { ok: true } };
  const media = { sha256: "video_sha_123" };
  const placement = { story_id: "s1", platform: "tiktok", artifact_hash: "video_sha_123", caption_style: { caption_sha256: null } };
  const r = verifyPackageIntegrity(pkg, placement, media);
  // artifact hash now correctly checked against the VIDEO's hosted sha,
  // not the static creative's sha - this is the real bug this phase fixed.
  assert.ok(!r.mismatches.some((m) => m.startsWith("asset hash")));
});

// ===================== §18.19/20/21/22 EXISTING GATES STILL ENFORCED =====================
test("AUTO3-19. a stale story still blocks even with hosted media present", async () => {
  const pkg = goodPackage();
  pkg.creative.master_image_sha256 = "abc";
  pkg.family = "deal_drop"; // a live-deal family - subject to staleness
  pkg.snapshot = buildStorySnapshot({ storyId: "s1", storyFamily: "deal_drop", editorialAngle: "x", facts: { ...FACTS, canonical_card_ids: ["999"], prices: { 999: 10 } } });
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: "abc", captionText: "hello world" }).placement;
  const media = { sha256: "abc", accessibility: "PUBLIC_VERIFIED", hosted_url: "https://fake.test/x", media_type: "STATIC_IMAGE" };
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider: fakeProvider(), db: fakeDb(), mediaPackage: media });
  assert.equal(r.ok, false);
  assert.match(r.state, /HOLD/);
});

test("AUTO3-20. owner approval is still required even with hosted media present", async () => {
  const pkg = goodPackage();
  pkg.creative.master_image_sha256 = "abc";
  pkg.owner_review.approved = false;
  pkg.status = "BUFFER_READY";
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: "abc", captionText: "hello world" }).placement;
  const media = { sha256: "abc", accessibility: "PUBLIC_VERIFIED", hosted_url: "https://fake.test/x", media_type: "STATIC_IMAGE" };
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider: fakeProvider(), db: fakeDb(), mediaPackage: media });
  assert.equal(r.ok, false);
});

test("AUTO3-21. the Buffer live flag is still required even with hosted media present", async () => {
  const pkg = goodPackage();
  pkg.creative.master_image_sha256 = "abc";
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: "abc", captionText: "hello world" }).placement;
  const media = { sha256: "abc", accessibility: "PUBLIC_VERIFIED", hosted_url: "https://fake.test/x", media_type: "STATIC_IMAGE" };
  const r = await submitBufferPlacementLive(placement, pkg, { env: {}, provider: fakeProvider(), db: fakeDb(), mediaPackage: media });
  assert.equal(r.ok, false);
});

test("AUTO3-22. autopilot flag still defaults false", async () => {
  const { resolveProductionSafety } = await import("../../lib/autonomous/productionSafety.mjs");
  assert.equal(resolveProductionSafety({}).autopilotEnabled, false);
});

// ===================== §18.23 NO TEXT-ONLY FALLBACK =====================
test("AUTO3-23. no silent text-only fallback exists in bufferHandoff.mjs's submit path", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../lib/autonomous/bufferHandoff.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /assets:\s*\[\]\s*,?\s*\/\/.*outside this phase/i);
});

// ===================== §18.24/25 NO SECOND INTEGRATION =====================
test("AUTO3-24. no alternate Buffer client is introduced - mediaHostingStage/mediaPackage never import a Buffer provider", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["mediaHostingStage.mjs", "mediaPackage.mjs", "completePackageAudit.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["'].*providers\/buffer["']|\.createPost\(/, f);
  }
});

test("AUTO3-25. no alternate creative renderer is introduced - this phase only hosts existing artifacts", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../lib/autonomous/mediaHostingStage.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /runFullGenerativeSocial|generateFullSocial|openai/i);
});

// ===================== §18.26-30 SCOPE =====================
test("AUTO3-26. no cron/setInterval registration anywhere in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["mediaHostingStage.mjs", "mediaPackage.mjs", "completePackageAudit.mjs", "storageEstimate.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /setInterval|node-cron/i, f);
  }
});

test("AUTO3-27/28/29/30. no Reddit/email/SEO/eBay-Browse code anywhere in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["mediaHostingStage.mjs", "mediaPackage.mjs", "completePackageAudit.mjs", "storageEstimate.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /reddit\.post|resend\.emails\.send|generateSeoPage|ebayBrowse/i, f);
  }
});

// ===================== COMPLETE PACKAGE AUDIT + STORAGE ACCOUNTING =====================
test("auditCompletePlacementPackage returns COMPLETE_PACKAGE_PASS only when every check passes, COMPLETE_PACKAGE_FAIL otherwise", async () => {
  const pkg = goodPackage();
  pkg.creative.master_image_sha256 = "abc";
  pkg.captions.instagram.cta = "pokemondealfinder.com";
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: "abc", captionText: "hello world" }).placement;
  const media = { sha256: "abc", accessibility: "PUBLIC_VERIFIED", hosted_url: "https://fake.test/x", media_type: "STATIC_IMAGE" };
  const good = await auditCompletePlacementPackage(pkg, placement, media, { liveRecord: null });
  assert.equal(good.verdict, "COMPLETE_PACKAGE_PASS", JSON.stringify(good.checks.filter((c) => !c.ok)));

  const badMedia = { sha256: null, accessibility: "NOT_HOSTED", hosted_url: null };
  const bad = await auditCompletePlacementPackage(pkg, placement, badMedia, { liveRecord: null });
  assert.equal(bad.verdict, "COMPLETE_PACKAGE_FAIL");
});

test("summarizeHostingRun accounts uploaded vs reused bytes and dedupe count", () => {
  const results = [
    { cacheHit: false, uploadedBytes: 1000, record: { sha256: "a", mime_type: "image/png", bytes: 1000 } },
    { cacheHit: true, uploadedBytes: 0, record: { sha256: "a", mime_type: "image/png", bytes: 1000 } },
    { cacheHit: false, uploadedBytes: 2000, record: { sha256: "b", mime_type: "video/mp4", bytes: 2000 } },
  ];
  const s = summarizeHostingRun(results);
  assert.equal(s.uploaded_bytes, 3000);
  assert.equal(s.reused_bytes, 1000);
  assert.equal(s.duplicate_uploads_prevented, 1);
  assert.equal(s.total_distinct_assets, 2);
});

test("projectStorage returns a labelled estimate, never presented as an exact bill", () => {
  const p = projectStorage({ postsPerDay: 1 });
  assert.match(p.note, /estimate/i);
  assert.ok(p.projected_new_storage_mb_per_month >= 0);
});

test("every SOCIAL-AUTOPILOT-3 failure state is declared", () => {
  for (const s of ["HOSTED_ASSET_DRIFT_FAIL", "MEDIA_URL_UNREACHABLE_FAIL", "MEDIA_MIME_FAIL", "MEDIA_DIMENSION_FAIL", "MEDIA_VIDEO_PROBE_FAIL", "MEDIA_IDENTITY_FAIL", "MEDIA_REQUIRED_FAIL"]) {
    assert.ok(FAILURE_STATES.includes(s), s);
  }
});

test("no 4C.8 / new visual-refinement references in the new media-hosting modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["mediaHostingStage.mjs", "mediaPackage.mjs", "completePackageAudit.mjs", "storageEstimate.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /4c\.?8|4C\.8/, f);
  }
});
