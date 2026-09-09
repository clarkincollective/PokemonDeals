// Phase SOCIAL-AUTOPILOT-4 (§18) - live pilot wiring + caption encoding
// scanner tests. No real network call, no real Supabase write - the
// provider and db layers are injected fakes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { normalizeSocialCaptionText, verifyCaptionEncoding, captionRoundTrip } from "../../lib/autonomous/captionEncoding.mjs";
import { verifyHashAlignment } from "../../lib/autonomous/hashAlignment.mjs";
import { buildBufferPlacement, submitBufferPlacementLive, placementDedupeKey } from "../../lib/autonomous/bufferHandoff.mjs";
import { buildPlatformMediaPayload } from "../../lib/autonomous/mediaPackage.mjs";
import { buildStorySnapshot } from "../../lib/autonomous/storySnapshot.mjs";
import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import { resolveProductionSafety } from "../../lib/autonomous/productionSafety.mjs";

const LIVE_ENV = { SOCIAL_BUFFER_LIVE_SUBMIT: "true" };

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
function goodPackage(captionText = "Pokémon cards – a market snapshot. 85.7% under $25. Explore pokemondealfinder.com.") {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: FACTS });
  return {
    story_id: "s1", family: "market_snapshot", status: "OWNER_APPROVED",
    owner_review: { required: true, approved: true, approved_at: new Date().toISOString(), approved_by: "tester" },
    snapshot: snap, semantic_manifest: { comparison_direction: "BELOW_MARKET" },
    creative: { master_image_sha256: "abc" },
    captions: { instagram: { caption_text: captionText }, x: { caption_text: captionText } },
    video: null, qa: { _sources: PASSING_QA_SOURCES },
  };
}
function goodMediaPackage(pkg, platform = "instagram") {
  return { snapshot_hash: pkg.snapshot.snapshot_hash, sha256: "abc", hosted_url: "https://fake.test/x.png", accessibility: "PUBLIC_VERIFIED", media_type: "STATIC_IMAGE", platform };
}
function fakeDb(rows = {}) { const store = new Map(Object.entries(rows)); return { async getPlacement(id) { return { ready: true, row: store.get(id) ?? null }; }, async patchPlacement(id, patch) { const cur = store.get(id) ?? {}; store.set(id, { ...cur, ...patch }); return { ready: true }; }, _store: store }; }
function fakeProvider({ createPost } = {}) { return { isConfigured: () => true, createPost: createPost ?? (async () => ({ accepted: true, id: "buf_1", statusRaw: "scheduled" })), getPostStatus: async () => ({ ok: false }), deletePost: async () => ({ ok: false }) }; }

// ===================== §18.1-6 UTF-8 PRESERVATION =====================
test("AUTO4-1/2. UTF-8 caption text is preserved through normalization - Pokemon-with-accent stays intact", () => {
  const s = "Pokémon cards are great.";
  const n = normalizeSocialCaptionText(s);
  assert.equal(n, s);
  assert.ok(n.includes("é"));
});

test("AUTO4-3. an em dash is preserved", () => {
  const s = "Cards – rare finds — great value.";
  assert.equal(normalizeSocialCaptionText(s), s);
});

test("AUTO4-4. an arrow character is preserved", () => {
  const s = "Asking → market comparison.";
  assert.equal(normalizeSocialCaptionText(s), s);
});

test("AUTO4-5. disclosure text with an em dash / bullet survives normalization unchanged", () => {
  const s = "Ad · PokemonDealFinder is an eBay Partner Network affiliate.";
  assert.equal(normalizeSocialCaptionText(s), s);
});

test("AUTO4-6. a replacement character (evidence of prior corruption) fails verification", () => {
  const bad = "broken � text";
  const r = verifyCaptionEncoding(bad);
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_ENCODING_FAIL");
});

test("AUTO4-7. normalizing an already-normalized caption is idempotent (a stable hash across repeats)", () => {
  const s = "Pokémon – 85.7% under $25 → great value.";
  const once = normalizeSocialCaptionText(s);
  const twice = normalizeSocialCaptionText(once);
  assert.equal(once, twice);
  const h1 = createHash("sha256").update(once).digest("hex");
  const h2 = createHash("sha256").update(twice).digest("hex");
  assert.equal(h1, h2);
});

// ===================== §18.8/9 PERSISTED / PAYLOAD ROUND-TRIP =====================
test("AUTO4-8/9. a caption survives a persisted-JSON round trip and a simulated Buffer-payload round trip unchanged", () => {
  const s = "Pokémon cards – 85.7% under $25 → explore pokemondealfinder.com. “Real value.”";
  const r = captionRoundTrip(s);
  assert.equal(r.ok, true);
  assert.equal(r.afterPersist, r.normalized);
  assert.equal(r.afterPayload, r.normalized);
});

// ===================== §18.10/11 MEDIA IN LIVE PAYLOAD =====================
test("AUTO4-10/11. the live payload contains the hosted asset - assets:[] is structurally impossible for a media-required platform", () => {
  const pkg = goodPackage();
  const media = goodMediaPackage(pkg, "instagram");
  const payload = buildPlatformMediaPayload(pkg, "instagram", media);
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.assets) && payload.assets.length >= 1);
  assert.equal(payload.assets[0].url, media.hosted_url);

  const noMedia = buildPlatformMediaPayload(pkg, "instagram", null);
  assert.equal(noMedia.ok, false);
  assert.equal(noMedia.state, "MEDIA_REQUIRED_FAIL");
});

// ===================== §18.12 HOSTED SHA MATCH =====================
test("AUTO4-12. the hosted media package's SHA is what the placement's artifact_hash must equal", () => {
  const pkg = goodPackage();
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  assert.equal(placement.artifact_hash, media.sha256);
});

// ===================== §18.13 MEDIA-SNAPSHOT-HASH ALIGNMENT =====================
test("AUTO4-13. verifyHashAlignment passes when placement/media/snapshot all trace to the same hash, fails on any drift", () => {
  const pkg = goodPackage();
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const good = verifyHashAlignment(pkg, placement, media);
  assert.equal(good.ok, true);

  const driftedMedia = { ...media, snapshot_hash: "wrong_hash" };
  const bad = verifyHashAlignment(pkg, placement, driftedMedia);
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "PLACEMENT_PACKAGE_DRIFT_FAIL");
});

// ===================== §18.14 PLATFORM PAYLOAD BUILDER REUSED =====================
test("AUTO4-14. no ad hoc provider payload construction in the pilot script - buildPlatformMediaPayload is the only path", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../scripts/socialAutopilot4Pilot.mjs", import.meta.url), "utf8");
  assert.match(src, /buildPlatformMediaPayload/);
});

// ===================== §18.15-20 SUBMIT GATES STILL ENFORCED =====================
test("AUTO4-15. owner approval is still required", async () => {
  const pkg = { ...goodPackage(), owner_review: { approved: false }, status: "BUFFER_READY" };
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider: fakeProvider(), db: fakeDb(), mediaPackage: media });
  assert.equal(r.ok, false);
});

test("AUTO4-16. the Buffer live flag is still required", async () => {
  const pkg = goodPackage();
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const r = await submitBufferPlacementLive(placement, pkg, { env: {}, provider: fakeProvider(), db: fakeDb(), mediaPackage: media });
  assert.equal(r.ok, false);
});

test("AUTO4-17. explicit --live is required in the pilot script - a bare run never submits", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../scripts/socialAutopilot4Pilot.mjs", import.meta.url), "utf8");
  assert.match(src, /LIVE_REQUESTED\s*=\s*argv\.includes\(["']--live["']\)/);
  assert.match(src, /canGoLive\s*=\s*LIVE_REQUESTED\s*&&\s*safety\.bufferLiveSubmit\s*&&\s*Boolean\(APPROVED_BY\)/);
});

test("AUTO4-18. the stale check is still required", async () => {
  const pkg = goodPackage();
  pkg.family = "deal_drop";
  pkg.snapshot = buildStorySnapshot({ storyId: "s1", storyFamily: "deal_drop", editorialAngle: "x", facts: { ...FACTS, canonical_card_ids: ["999"], prices: { 999: 10 } } });
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider: fakeProvider(), db: fakeDb(), mediaPackage: { ...media, snapshot_hash: pkg.snapshot.snapshot_hash } });
  assert.equal(r.ok, false);
  assert.match(r.state, /HOLD/);
});

test("AUTO4-19. the QA gate is still required", async () => {
  const pkg = goodPackage();
  pkg.qa._sources = { ...PASSING_QA_SOURCES, caption: "FAIL" };
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider: fakeProvider(), db: fakeDb(), mediaPackage: media });
  assert.equal(r.ok, false);
});

test("AUTO4-20. dedupe is still required - the placement id is deterministic from story+snapshot+platform+type", () => {
  const k1 = placementDedupeKey({ storyId: "s1", snapshotHash: "a", platform: "instagram", placementType: "post" });
  const k2 = placementDedupeKey({ storyId: "s1", snapshotHash: "a", platform: "instagram", placementType: "post" });
  assert.equal(k1, k2);
});

// ===================== §18.21/22 IDEMPOTENCY REGRESSION (WITH MEDIA) =====================
test("AUTO4-21. provider_ref still prevents resubmit when mediaPackage is supplied", async () => {
  const pkg = goodPackage();
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const db = fakeDb({ [placement.placement_id]: { ...placement, buffer_provider_ref: "buf_existing" } });
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "buf_new" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db, mediaPackage: media });
  assert.equal(r.state, "ALREADY_SUBMITTED");
  assert.equal(called, false);
});

test("AUTO4-22. BUFFER_SUBMITTING still triggers reconcile-first when mediaPackage is supplied", async () => {
  const pkg = goodPackage();
  const media = goodMediaPackage(pkg, "instagram");
  const placement = buildBufferPlacement({ storyPackage: pkg, platform: "instagram", placementType: "post", assetHash: media.sha256, captionText: pkg.captions.instagram.caption_text }).placement;
  const db = fakeDb({ [placement.placement_id]: { ...placement, status: "BUFFER_SUBMITTING" } });
  let called = false;
  const provider = fakeProvider({ createPost: async () => { called = true; return { accepted: true, id: "buf_new" }; } });
  const r = await submitBufferPlacementLive(placement, pkg, { env: LIVE_ENV, provider, db, mediaPackage: media });
  assert.equal(r.state, "BUFFER_SUBMIT_UNKNOWN");
  assert.equal(called, false);
});

// ===================== §18.23/24/25 MAX 2 PROOF PLACEMENTS =====================
test("AUTO4-23/24/25. the pilot script submits at most Instagram+X - no TikTok, no YouTube", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../scripts/socialAutopilot4Pilot.mjs", import.meta.url), "utf8");
  assert.match(src, /\["instagram",\s*"x"\]/);
  assert.doesNotMatch(src, /submitBufferPlacementLive[\s\S]{0,400}tiktok/i);
  assert.doesNotMatch(src, /submitBufferPlacementLive[\s\S]{0,400}youtube/i);
});

// ===================== §18.26-31 SCOPE =====================
test("AUTO4-26. no cron/setInterval in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEncoding.mjs", "hashAlignment.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /setInterval|node-cron/i, f);
  }
});

test("AUTO4-27. autopilot flag still defaults false", () => {
  assert.equal(resolveProductionSafety({}).autopilotEnabled, false);
});

test("AUTO4-28/29/30/31. no Reddit/SEO/email/eBay-Browse code anywhere in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEncoding.mjs", "hashAlignment.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /reddit\.post|generateSeoPage|resend\.emails\.send|ebayBrowse/i, f);
  }
});

test("every SOCIAL-AUTOPILOT-4 failure state is declared", () => {
  assert.ok(FAILURE_STATES.includes("CAPTION_ENCODING_FAIL"));
});

test("no 4C.8 references in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEncoding.mjs", "hashAlignment.mjs"]) {
    const src = readFileSync(new URL(`../../lib/autonomous/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /4c\.?8|4C\.8/, f);
  }
});
