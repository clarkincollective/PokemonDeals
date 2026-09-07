// Phase SOCIAL-NEWSROOM-2D - gate integrity + platform coverage +
// scheduled-mode readiness. Pure-logic + source-scan + mock-provider.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { preflightPlacement, scheduleOne } from "../../lib/newsroom/bufferBacklog.mjs";
import {
  SERIES_RENDER, AUTONOMOUS_SAFE_LAYOUTS, seriesAutonomousSafe,
} from "../../lib/social/newsroom/renderRegistry.mjs";
import { renderEditorialHtml, EDITORIAL_LAYOUTS } from "../../lib/social/newsroom/editorialTemplates.mjs";
import { placementsForStory, xAllowed, youtubeAllowed } from "../../lib/social/newsroom/placements.mjs";
import { makeStory } from "../../lib/social/newsroom/story.mjs";
import { captionSimilarity, captionDuplicateCheck } from "../../lib/social/newsroom/captionSimilarity.mjs";
import { shelfWindow, laneFor } from "../../lib/social/newsroom/clocks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const NOW = Date.parse("2026-09-08T02:00:00Z");
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();

const edStory = (series, over = {}) => ({
  story_id: `${series.toLowerCase()}-2d`, series,
  pillar: over.pillar ?? "MARKET", content_goal: "TRUST", cta_intensity: "BRAND_ONLY",
  shelf_life_class: "EDITORIAL", lane: "PLANNED", subject_id: `${series.toLowerCase()}-proof`,
  captured_at: iso(-24), valid_until: iso(24 * 13), latest_safe_publish_at: iso(24 * 13),
  status: "BUFFER_READY", facts_json: {}, deal_ids: [], card_ids: [],
});
const mockProv = ({ id = "buf_2d", status = "scheduled" } = {}) => ({
  isConfigured: () => true,
  async createPost() { return { accepted: true, id, statusRaw: status }; },
  async getPostStatus() { return { ok: true, published: status === "sent", statusRaw: status }; },
});

// ---- SS2/SS3: artifact-scoped QA invariant ---------------------
test("2D-1. preflightPlacement HARD-blocks when the artifact-scoped QA invariant is not supplied / not ok", () => {
  const s = edStory("MARKET_SNAPSHOT");
  const p = { placement_id: "p1", platform: "instagram", hosted_url: "https://cdn/x.png", artifact_hash: "sha1" };
  const at = iso(3);
  // no artifactQa -> blocked
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: at, professionalResult: "PASS", now: NOW }).ok, false);
  // artifactQa not ok -> blocked, with the reason surfaced
  const r = preflightPlacement({ story: s, placement: p, dueAtUtc: at, professionalResult: "PASS", artifactQa: { ok: false, reason: "latest LAYER-5 verdict for this artifact = WATCH" }, now: NOW });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /artifact-scoped QA invariant/.test(b) && /WATCH/.test(b)));
  // artifactQa ok + everything else fine -> passes
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: at, professionalResult: "PASS", artifactQa: { ok: true }, now: NOW }).ok, true);
});

test("2D-2. scheduleOne cannot createPost when the artifact QA invariant fails (WATCH current artifact)", async () => {
  const s = edStory("MARKET_SNAPSHOT");
  const p = { placement_id: "p1", platform: "x", placement_type: "post", hosted_url: "https://cdn/x.png", artifact_hash: "sha1", content_id: s.story_id };
  let called = false;
  const prov = { isConfigured: () => true, async createPost() { called = true; return { accepted: true, id: "x" }; }, async getPostStatus() { return { ok: true }; } };
  const r = await scheduleOne({ story: s, placement: p, channelId: "ch", caption: "c", dueAtUtc: iso(3), professionalResult: "PASS", artifactQa: { ok: false, reason: "latest STACK QA for this artifact = WATCH" }, mode: "scheduled", now: NOW, provider: prov });
  assert.equal(r.queued, false);
  assert.equal(r.reason, "preflight_failed");
  assert.equal(called, false, "createPost must NOT be reached when the artifact QA invariant fails");
});

test("2D-3. db.artifactQueueEligible requires a HASH-MATCHED latest PASS for BOTH STACK and LAYER-5 (source)", () => {
  const src = readFileSync(join(REPO, "lib", "social", "newsroom", "db.mjs"), "utf8");
  // reads a matching detail.artifact_sha256, newest-first, both qa_types PASS
  assert.match(src, /String\(r\.detail\?\.artifact_sha256 \?\? ""\) === String\(artifactSha\)/);
  assert.match(src, /order\("checked_at", \{ ascending: false \}\)/);
  const fn = src.slice(src.indexOf("export async function artifactQueueEligible"), src.indexOf("export async function artifactQueueEligible") + 900);
  assert.match(fn, /qaType: "STACK"/);
  assert.match(fn, /qaType: "VISUAL_REVIEW"/);
  assert.match(fn, /stack\.verdict !== "PASS"/);
  assert.match(fn, /visual\.verdict !== "PASS"/);
});

test("2D-4. the render pass persists artifact_sha256 on every QA run AND downgrades a re-rendered BUFFER_READY/QUEUED that no longer PASSes", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /qaType: "STACK", result: qa\.professional_result[^}]*artifact_sha256: sha/);
  assert.match(src, /qaType: "VISUAL_REVIEW"[^}]*artifact_sha256: sha/);
  assert.match(src, /else if \(\["BUFFER_READY", "BUFFER_QUEUED"\]\.includes\(p\.status\)\) \{/);
  assert.match(src, /status: "QA_WATCH", artifact_hash: sha/);
  assert.match(src, /provider_state = "INVALIDATED_LOCAL"/);
});

test("2D-5. the queue path reads artifactQueueEligible for the EXACT hash and stops on failure (source)", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /const artifactQa = await artifactQueueEligible\(\{ placementId: p\.placement_id, artifactSha: p\.artifact_hash \}\)/);
  assert.match(src, /if \(!artifactQa\.ok\) \{[\s\S]*?reason: `artifact_qa_invariant/);
  assert.doesNotMatch(src, /professionalResult: "PASS", mode/); // no hardcoded PASS anymore
});

// ---- SS7: only reliable-PASS layouts are autonomous-safe ------
test("2D-6. AUTONOMOUS_SAFE_LAYOUTS excludes the flaky layouts (data_ranking, story_reveal)", () => {
  assert.ok(!AUTONOMOUS_SAFE_LAYOUTS.includes("data_ranking"));
  assert.ok(!AUTONOMOUS_SAFE_LAYOUTS.includes("story_reveal"));
  assert.ok(AUTONOMOUS_SAFE_LAYOUTS.length >= 4);
  assert.equal(seriesAutonomousSafe("BIGGEST_MOVERS"), false);
  assert.equal(seriesAutonomousSafe("PRICE_STORY"), false);
  assert.equal(seriesAutonomousSafe("MARKET_SNAPSHOT"), true);
  assert.equal(seriesAutonomousSafe("METHODOLOGY"), true);
});

test("2D-7. the queue curation filters to autonomous-safe series AND layouts AND BUFFER_READY only (source)", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /\.filter\(\(p\) => p\.status === "BUFFER_READY"\)/);
  assert.match(src, /\.filter\(\(p\) => seriesAutonomousSafe\(byId\[p\.story_id\]\?\.series\)\)/);
  assert.match(src, /\.filter\(\(p\) => AUTONOMOUS_SAFE_LAYOUTS\.includes\(p\.caption_style\?\.layout_family\)\)/);
});

// ---- SS10: Instagram format mapping (post, not 1-asset carousel) --
test("2D-8. Instagram editorial placement type is a static `post`, never `carousel` (Buffer rejects a 1-asset carousel)", () => {
  const s = makeStory({ series: "MARKET_SNAPSHOT", subjectType: "catalog", subjectId: "ms", capturedAt: iso(-24), facts: {}, now: NOW });
  const ig = placementsForStory(s).find((p) => p.platform === "instagram");
  assert.ok(ig);
  assert.equal(ig.placement_type, "post");
  assert.notEqual(ig.placement_type, "carousel");
});

// ---- SS12: X editorial coverage widened ----------------------
test("2D-9. X now accepts EDUCATION / STORY / BEHIND_THE_FINDER / selected BRAND editorial series", () => {
  for (const series of ["WHY_SOLD_PRICES_MATTER", "EXACT_PRINTING_MATTERS", "AUCTION_BID_VS_TOTAL", "HOW_WE_FIND_DEALS", "PRICE_STORY", "METHODOLOGY"]) {
    const s = makeStory({ series, subjectType: "concept", subjectId: series, capturedAt: iso(-24), facts: {}, now: NOW });
    assert.equal(xAllowed(s), true, series);
    assert.ok(placementsForStory(s).some((p) => p.platform === "x"), `${series} has an X placement`);
  }
  // a thin BRAND recap is NOT auto-eligible for X
  const recap = makeStory({ series: "WEEKLY_RECAP", subjectType: "concept", subjectId: "wr", capturedAt: iso(-24), facts: {}, now: NOW });
  assert.equal(xAllowed(recap), false);
});

test("2D-10. X value guard: the dup check blocks a repeated numeric template but NOT two distinct prose captions", () => {
  const a = "$140 CARD. LISTED FOR $320. THAT'S 55% OFF.";
  const b = "$70 CARD. LISTED FOR $210. THAT'S 66% OFF.";
  assert.equal(captionSimilarity(a, b).numeric_template_match, true);
  assert.equal(captionDuplicateCheck({ platform: "x", caption: b }, [{ platform: "x", caption: a }]).blocked, true);
  // two genuinely different one-sentence editorial captions must NOT be blocked
  const e1 = "Asking prices say what a seller wants. Sold prices say what a card is worth.\n\n#pokemontcg";
  const e2 = "The bid is not the price. Bid plus shipping plus import is what you actually pay.\n\n#pokemontcg";
  assert.equal(captionDuplicateCheck({ platform: "x", caption: e2 }, [{ platform: "x", caption: e1 }]).blocked, false);
});

// ---- SS14/SS15: YouTube fit + TikTok motion-only ------------
test("2D-11. YouTube is offered only for narrative / editorial / evergreen series; TikTok never gets a static editorial placement", () => {
  const narr = makeStory({ series: "HOW_WE_FIND_DEALS", subjectType: "concept", subjectId: "h", capturedAt: iso(-24), facts: {}, now: NOW });
  assert.equal(youtubeAllowed(narr), true);
  const movers = makeStory({ series: "BIGGEST_MOVERS", subjectType: "catalog", subjectId: "m", capturedAt: iso(-24), facts: {}, now: NOW });
  assert.equal(youtubeAllowed(movers), false); // BIGGEST_MOVERS short:false
  // no series produces a tiktok placement (motion-only, not wired for editorial)
  for (const series of Object.keys(SERIES_RENDER)) {
    const s = makeStory({ series, subjectType: "concept", subjectId: series, capturedAt: iso(-24), facts: {}, now: NOW });
    assert.ok(!placementsForStory(s).some((p) => p.platform === "tiktok"), `${series} must not have a tiktok placement`);
  }
});

// ---- SS21: scheduled mode - future only, never PUBLISHED ----
test("2D-12. scheduled mode: a future dueAt yields provider_state 'scheduled', BUFFER_QUEUED, never PUBLISHED", async () => {
  const s = edStory("MARKET_SNAPSHOT");
  const p = { placement_id: "p1", platform: "instagram", placement_type: "post", hosted_url: "https://cdn/x.png", artifact_hash: "sha1", content_id: s.story_id };
  const r = await scheduleOne({ story: s, placement: p, channelId: "ch", caption: "c", dueAtUtc: iso(72), professionalResult: "PASS", artifactQa: { ok: true }, mode: "scheduled", now: NOW, provider: mockProv({ status: "scheduled" }) });
  assert.equal(r.queued, true);
  assert.equal(r.placement_patch.status, "BUFFER_QUEUED");
  assert.equal(r.placement_patch.provider_state, "scheduled");
  assert.notEqual(r.placement_patch.status, "PUBLISHED");
});

test("2D-13. scheduled mode still rejects a near-immediate dueAt (< now + 60m)", async () => {
  const s = edStory("MARKET_SNAPSHOT");
  const p = { placement_id: "p1", platform: "x", placement_type: "post", hosted_url: "https://cdn/x.png", artifact_hash: "sha1" };
  const r = await scheduleOne({ story: s, placement: p, channelId: "ch", caption: "c", dueAtUtc: iso(0.5), professionalResult: "PASS", artifactQa: { ok: true }, mode: "scheduled", now: NOW, provider: mockProv() });
  assert.equal(r.queued, false);
});

// ---- Buffer adapter: safe draft removal ---------------------
test("2D-14. the Buffer adapter has deletePost and it refuses to delete a sent post", () => {
  const src = readFileSync(join(REPO, "lib", "social", "providers", "buffer.mjs"), "utf8");
  assert.match(src, /async deletePost\(id\)/);
  assert.match(src, /refusing_to_delete_sent_post/);
  assert.match(src, /DeletePostSuccess/);
});

// ---- EVERGREEN shelf window anchored to now, not the 2020 epoch ---
test("2D-15. an EVERGREEN story's publish window is anchored to render time, not the identity epoch", () => {
  const w = shelfWindow("EVERGREEN", { capturedAt: "2020-01-01T00:00:00.000Z", now: NOW });
  assert.ok(Date.parse(w.valid_until) > NOW, "valid_until must be in the future");
  assert.equal(laneFor("EVERGREEN"), "PLANNED");
});

// ---- SS26: unsupported platform does not create a refill loop ---
test("2D-16. an unsupported platform yields no placement (not a generic failure that would loop refill)", () => {
  // WEEKLY_RECAP: BRAND, not X-eligible, not in the render registry
  const s = makeStory({ series: "WEEKLY_RECAP", subjectType: "concept", subjectId: "wr", capturedAt: iso(-24), facts: {}, now: NOW });
  const pls = placementsForStory(s);
  // it simply produces fewer/no eligible placements - never an error
  assert.ok(Array.isArray(pls));
  assert.ok(!pls.some((p) => p.platform === "x"));
});

// ---- SAFETY -----------------------------------------------
test("2D-17. NEWSROOM-2D changes make no eBay Browse call and do not touch the verifier / Stage 1 / email", () => {
  const files = ["scripts/socialBacklogRender.mjs", "lib/newsroom/bufferBacklog.mjs", "lib/social/newsroom/db.mjs", "lib/social/newsroom/placements.mjs", "lib/social/newsroom/renderRegistry.mjs", "lib/social/providers/buffer.mjs"];
  for (const f of files) {
    const src = readFileSync(join(REPO, f), "utf8");
    assert.doesNotMatch(src, /from ["'][^"']*lib\/ebay|getBrowseRateLimit\(|getListingSnapshot\(/);
    assert.doesNotMatch(src, /from ["'][^"']*verifyAllocator|allocateVerifyBatch\(/);
    assert.doesNotMatch(src, /RIGHTS_STATE\.\w+\s*=|SOCIAL_AUTONOMOUS_ENABLED\s*=\s*["']?true/);
    assert.doesNotMatch(src, /sendBatch|renderDigest|lib\/email/);
  }
});
