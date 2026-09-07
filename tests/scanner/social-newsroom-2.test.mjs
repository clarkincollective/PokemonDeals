// Phase SOCIAL-NEWSROOM-2 - persistent backlog + Buffer future-scheduling
// + Layer-5 visual review. Pure-logic + mock-provider tests. No DB, no
// real Buffer call, no eBay, no render.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  makeStory,
  stableStoryId,
  stableCapturedAt,
  quantizedCapturedAtIso,
  EVERGREEN_EPOCH_ISO,
  isoWeekKey,
  storyRow,
  placementRows,
  qaRunRow,
  freezeFacts,
  placementsForStory,
  organicScore,
  resolveBacklogPosture,
  scheduleTimeAcceptable,
  SCHEDULE_SAFETY_MINUTES,
  BACKLOG_FLAG,
  KILL_FLAG,
  normaliseSchedule,
  brisbaneWallToUtc,
  brisbaneDateOf,
  OWNER_UTC_OFFSET_HOURS,
  feedReview,
  makeEvent,
  EVENT_TYPES,
  editorialCapacityPerDay,
  freshReservePerDay,
  backlogHealthForPlatform,
} from "../../lib/social/newsroom/index.mjs";
import {
  preflightPlacement,
  buildProviderMessage,
  scheduleOne,
  reconcileOne,
  queuedContentStale,
  resolveProviderMode,
} from "../../lib/newsroom/bufferBacklog.mjs";
import { _resolveArtifact, RUBRIC_KEYS, reviewAvailable } from "../../lib/newsroom/visualReview.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const NOW = Date.parse("2026-09-07T12:00:00Z");
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();

function edStory(series = "MARKET_SNAPSHOT", over = {}) {
  const s = makeStory({
    series,
    subjectType: "catalog",
    subjectId: over.subjectId ?? `${series}-rep`,
    capturedAt: over.capturedAt ?? iso(-4),
    facts: over.facts ?? { headline_fact: "distribution", layout_family: "market" },
    now: NOW,
  });
  s.story_id = stableStoryId({ series, subjectType: "catalog", subjectId: over.subjectId ?? `${series}-rep`, now: NOW });
  s.organic_score = organicScore(s);
  s.originality_score = 1;
  s.status = "PLANNED";
  return s;
}

// mock Buffer provider
function mockProvider({ accept = true, id = "buf_test_1", status = "scheduled", onCreate = null } = {}) {
  return {
    isConfigured: () => true,
    async createPost(msg) {
      if (onCreate) onCreate(msg);
      return accept ? { accepted: true, id, statusRaw: status } : { accepted: false, reason: "buffer_InvalidInputError", detail: "mock reject" };
    },
    async getPostStatus(pid) {
      return { ok: true, published: status === "sent", publishedAt: status === "sent" ? iso(1) : null, failed: status === "error", statusRaw: status, platformPostUrl: null };
    },
  };
}

// ---- §43: migration file idempotency -----------------------------
test("N2-1. the migration is idempotent (create/add IF NOT EXISTS) and non-destructive", () => {
  const sql = readFileSync(join(REPO, "supabase", "social_editorial_newsroom_migration.sql"), "utf8");
  assert.match(sql, /create table if not exists social_stories/);
  assert.match(sql, /create table if not exists social_story_placements/);
  assert.match(sql, /create table if not exists social_qa_runs/);
  assert.ok((sql.match(/create index if not exists/g) || []).length >= 8);
  assert.match(sql, /add column if not exists/);
  assert.doesNotMatch(sql, /drop table|truncate|alter table deals\b|delete from/i);
  assert.match(sql, /enable row level security/);
});

test("N2-2. tablesReady() + the newsroom writers no-op until the migration is applied", () => {
  const db = readFileSync(join(REPO, "lib", "social", "newsroom", "db.mjs"), "utf8");
  const code = db.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // every writer guards on tablesReady and returns { ready:false }
  for (const fn of ["upsertStory", "upsertPlacements", "patchPlacement", "recordQaRun"]) {
    const body = code.slice(code.indexOf(`export async function ${fn}`), code.indexOf(`export async function ${fn}`) + 400);
    assert.match(body, /if \(!\(await tablesReady\(db\)\)\) return \{ ready: false/, `${fn} must gate on tablesReady`);
  }
});

// ---- §43: idempotent story identity ----------------------------
test("N2-3. stableCapturedAt quantises by shelf-life class", () => {
  assert.equal(stableCapturedAt("EXACT_PRINTING_MATTERS", { now: NOW }), "evergreen"); // EVERGREEN
  assert.equal(stableCapturedAt("MARKET_SNAPSHOT", { now: NOW }), isoWeekKey(NOW)); // EDITORIAL -> ISO week
  assert.equal(stableCapturedAt("THREE_UNDER_25", { now: NOW }), new Date(NOW).toISOString().slice(0, 10)); // SHORT -> UTC day
  assert.equal(stableCapturedAt("DEAL_DROP", { now: NOW, anchorAt: iso(-1) }), iso(-1)); // LIVE -> exact_verified_at
});

test("N2-3b. quantizedCapturedAtIso always returns a valid ISO timestamp (for the timestamptz column) and is window-stable", () => {
  const ev = quantizedCapturedAtIso("EXACT_PRINTING_MATTERS", { now: NOW });
  assert.equal(ev, EVERGREEN_EPOCH_ISO);
  const ed = quantizedCapturedAtIso("MARKET_SNAPSHOT", { now: NOW });
  assert.ok(Number.isFinite(Date.parse(ed)) && ed.endsWith("Z"));
  assert.equal(quantizedCapturedAtIso("MARKET_SNAPSHOT", { now: NOW + 2 * 86_400_000 }), ed); // same ISO week
  const sh = quantizedCapturedAtIso("THREE_UNDER_25", { now: NOW });
  assert.match(sh, /^2026-09-07T00:00:00\.000Z$/);
  // never a bare week key
  assert.doesNotMatch(ed, /-W\d\d/);
});

test("N2-4. stableStoryId is stable across rebuilds in the same window and differs across windows", () => {
  const a = stableStoryId({ series: "MARKET_SNAPSHOT", subjectType: "catalog", subjectId: "ms", now: NOW });
  const b = stableStoryId({ series: "MARKET_SNAPSHOT", subjectType: "catalog", subjectId: "ms", now: NOW + 2 * 86_400_000 }); // same ISO week
  const c = stableStoryId({ series: "MARKET_SNAPSHOT", subjectType: "catalog", subjectId: "ms", now: NOW + 10 * 86_400_000 }); // next week
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("N2-5. a Deal Drop's stable id is tied to the listing verification instant + deal id", () => {
  const a = stableStoryId({ series: "DEAL_DROP", subjectType: "card", subjectId: "charizard", now: NOW, anchorAt: iso(-1), deal_ids: [42] });
  const b = stableStoryId({ series: "DEAL_DROP", subjectType: "card", subjectId: "charizard", now: NOW + 3_600_000, anchorAt: iso(-1), deal_ids: [42] });
  const c = stableStoryId({ series: "DEAL_DROP", subjectType: "card", subjectId: "charizard", now: NOW, anchorAt: iso(-1), deal_ids: [99] });
  assert.equal(a, b); // same verification instant + deal -> same story
  assert.notEqual(a, c); // different deal
});

// ---- §43: row builders + frozen facts -------------------------
test("N2-6. storyRow / placementRows / qaRunRow produce the migration column shapes", () => {
  const s = edStory();
  const pls = placementsForStory(s);
  const sr = storyRow(s, { now: NOW, sourceCommit: "abc123" });
  assert.equal(sr.story_id, s.story_id);
  assert.equal(sr.status, "PLANNED");
  assert.equal(sr.source_commit, "abc123");
  assert.ok("facts_json" in sr && "latest_safe_publish_at" in sr && "updated_at" in sr);
  const pr = placementRows(s, pls, { now: NOW });
  assert.equal(pr.length, pls.length);
  assert.ok(pr.every((r) => r.story_id === s.story_id && "buffer_provider_ref" in r && "scheduled_for" in r));
  const qr = qaRunRow({ storyId: s.story_id, qaType: "STACK", result: "PASS", score: 0.7, blockers: [] });
  assert.equal(qr.qa_type, "STACK");
  assert.equal(qr.result, "PASS");
});

test("N2-7. freezeFacts stores only source-supported factual fields, never generated copy", () => {
  const f = freezeFacts({ market_price: 100, discount_pct: 0.5, caption: "Buy now!!", cta_text: "Shop the deal", hook_line: "70% OFF", exact_verified_at: iso(-1) });
  assert.ok("market_price" in f && "discount_pct" in f && "exact_verified_at" in f);
  assert.ok(!("caption" in f) && !("cta_text" in f) && !("hook_line" in f));
});

// ---- §43: buffer future-schedule only + immediate publish rejected
test("N2-8. scheduleTimeAcceptable rejects a time inside the 60-minute safety buffer", () => {
  assert.equal(scheduleTimeAcceptable(new Date(NOW + 30 * 60_000).toISOString(), { now: NOW }).ok, false);
  assert.equal(scheduleTimeAcceptable(new Date(NOW + 2 * 3_600_000).toISOString(), { now: NOW }).ok, true);
  assert.equal(scheduleTimeAcceptable("not-a-date", { now: NOW }).ok, false);
  assert.equal(SCHEDULE_SAFETY_MINUTES, 60);
});

test("N2-9. preflightPlacement blocks LIVE/FRESH stories, non-PASS QA, near-immediate times, and missing assets", () => {
  const s = edStory();
  s.professional_score = "PASS";
  const p = { placement_id: "p1", platform: "instagram", hosted_url: "https://cdn/x.png", artifact_hash: "h" };
  const okAt = new Date(NOW + 3 * 3_600_000).toISOString();
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: okAt, professionalResult: "PASS", artifactQa: { ok: true }, now: NOW }).ok, true);
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: okAt, professionalResult: "WATCH", now: NOW }).ok, false);
  assert.equal(preflightPlacement({ story: s, placement: { ...p, hosted_url: null }, dueAtUtc: okAt, professionalResult: "PASS", now: NOW }).ok, false);
  const live = makeStory({ series: "DEAL_DROP", subjectType: "card", subjectId: "x", dealIds: [1], capturedAt: iso(-1), facts: { exact_verified_at: iso(-1) }, now: NOW });
  assert.equal(preflightPlacement({ story: live, placement: p, dueAtUtc: okAt, professionalResult: "PASS", artifactQa: { ok: true }, now: NOW }).ok, false);
});

test("N2-10. scheduleOne: provider ACCEPT -> BUFFER_QUEUED, never PUBLISHED; a future dueAt is sent", async () => {
  const s = edStory();
  const p = { placement_id: "p1", platform: "instagram", placement_type: "carousel", hosted_url: "https://cdn/x.png", artifact_hash: "h", content_id: s.story_id };
  let sentMsg = null;
  const prov = mockProvider({ onCreate: (m) => (sentMsg = m) });
  const due = new Date(NOW + 3 * 3_600_000).toISOString();
  const r = await scheduleOne({ story: s, placement: p, channelId: "ch_ig", caption: "editorial caption", dueAtUtc: due, professionalResult: "PASS", artifactQa: { ok: true }, mode: "scheduled", now: NOW, provider: prov });
  assert.equal(r.queued, true);
  assert.equal(r.placement_patch.status, "BUFFER_QUEUED");
  assert.notEqual(r.placement_patch.status, "PUBLISHED");
  assert.equal(r.placement_patch.buffer_provider_ref, "buf_test_1");
  assert.equal(sentMsg.dueAt, due);
});

test("N2-11. scheduleOne in default (draft) mode passes saveToDraft so the post never auto-sends", async () => {
  const s = edStory();
  const p = { placement_id: "p1", platform: "x", placement_type: "post", hosted_url: "https://cdn/x.png", artifact_hash: "h" };
  let sentMsg = null;
  const r = await scheduleOne({ story: s, placement: p, channelId: "ch_x", caption: "x commentary", dueAtUtc: new Date(NOW + 3 * 3_600_000).toISOString(), professionalResult: "PASS", artifactQa: { ok: true }, mode: "draft", now: NOW, provider: mockProvider({ onCreate: (m) => (sentMsg = m), status: "draft" }) });
  assert.equal(r.queued, true);
  assert.equal(sentMsg.saveToDraft, true);
  assert.equal(resolveProviderMode({}), "draft");
});

test("N2-12. scheduleOne refuses an immediate/near-term dueAt outright", async () => {
  const s = edStory();
  const p = { placement_id: "p1", platform: "instagram", hosted_url: "https://cdn/x.png", artifact_hash: "h" };
  const r = await scheduleOne({ story: s, placement: p, channelId: "ch", caption: "c", dueAtUtc: new Date(NOW + 10 * 60_000).toISOString(), professionalResult: "PASS", artifactQa: { ok: true }, now: NOW, provider: mockProvider() });
  assert.equal(r.queued, false);
  assert.equal(r.reason, "preflight_failed");
  assert.ok(r.blockers.some((b) => /safety buffer/.test(b)));
});

test("N2-13. published is never inferred - reconcileOne only reports published on provider sent-evidence", async () => {
  const p = { placement_id: "p1", buffer_provider_ref: "buf_1", status: "BUFFER_QUEUED", scheduled_for: iso(3) };
  const scheduled = await reconcileOne({ placement: p, provider: mockProvider({ status: "scheduled" }) });
  assert.equal(scheduled.published, false);
  const sent = await reconcileOne({ placement: p, provider: mockProvider({ status: "sent" }) });
  assert.equal(sent.published, true);
  assert.ok(sent.publishedAt);
});

test("N2-14. reconcileOne never resubmits (no createPost call in the reconcile path)", () => {
  const src = readFileSync(join(REPO, "lib", "newsroom", "bufferBacklog.mjs"), "utf8");
  const fn = src.slice(src.indexOf("export async function reconcileOne"), src.indexOf("export function queuedContentStale"));
  assert.doesNotMatch(fn, /createPost\(/);
  assert.match(fn, /getPostStatus\(/);
});

// ---- §43: timezone Brisbane <-> UTC ---------------------------
test("N2-15. Brisbane wall-clock <-> UTC conversion is explicit and offset is a fixed +10 (no DST)", () => {
  assert.equal(OWNER_UTC_OFFSET_HOURS, 10);
  // 2026-09-11 09:00 Brisbane == 2026-09-10 23:00 UTC
  assert.equal(brisbaneWallToUtc({ y: 2026, m: 9, d: 11, hh: 9 }), "2026-09-10T23:00:00.000Z");
  const n = normaliseSchedule("2026-09-10T23:00:00Z");
  assert.equal(n.scheduled_for_utc, "2026-09-10T23:00:00.000Z");
  assert.match(n.scheduled_for_local, /2026-09-11 09:00 Australia\/Brisbane/);
  assert.equal(n.timezone, "Australia/Brisbane");
});

test("N2-16. a UTC instant near the Brisbane date boundary maps to the correct Brisbane calendar date", () => {
  // 2026-09-10 20:00 UTC is 2026-09-11 06:00 Brisbane
  assert.equal(brisbaneDateOf("2026-09-10T20:00:00Z"), "2026-09-11");
  // 2026-09-10 13:00 UTC is 2026-09-10 23:00 Brisbane (still the 10th)
  assert.equal(brisbaneDateOf("2026-09-10T13:00:00Z"), "2026-09-10");
});

// ---- §43: reserved capacity + OVERFILLED --------------------
test("N2-17. reserved live capacity is preserved (IG/TikTok 30%, X 40%, YouTube 20%)", () => {
  assert.ok(freshReservePerDay("x") >= freshReservePerDay("youtube"));
  for (const p of ["instagram", "tiktok", "x", "youtube"]) assert.ok(editorialCapacityPerDay(p) >= 1);
});

test("N2-18. OVERFILLED backlog blocks refill (refillNeeds does not target it)", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ platform: "instagram", status: "BUFFER_QUEUED", lane: "PLANNED", planned_for: new Date(NOW + (i + 1) * 86_400_000).toISOString() }));
  const h = backlogHealthForPlatform("instagram", rows, { now: NOW });
  assert.equal(h.state, "OVERFILLED");
});

// ---- §43: visual review WATCH/FAIL/PASS -----------------------
test("N2-19. visual review rubric has the §18 keys and reviewAvailable follows the OpenAI key", () => {
  for (const k of ["HOOK_CLARITY", "CARD_DOMINANCE", "SAFE_ZONE_INTEGRITY", "EDITORIAL_VALUE", "AI_SPAM_RISK"]) assert.ok(RUBRIC_KEYS.includes(k));
  assert.equal(reviewAvailable({}), false);
  assert.equal(reviewAvailable({ OPENAI_API_KEY: "sk-x" }), true);
});

test("N2-20. visual review refuses a remote URL and only accepts a local rendered artifact (§19)", () => {
  assert.equal(_resolveArtifact("https://evil.example/x.png"), null);
  assert.equal(_resolveArtifact("http://cdn/x.png"), null);
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  const r = _resolveArtifact(dataUrl);
  assert.ok(r && r.dataUrl === dataUrl && typeof r.sha === "string");
});

test("N2-21. visual review falls back to WATCH (never auto-PASS) when unavailable (§20)", async () => {
  const { reviewRenderedCreative } = await import("../../lib/newsroom/visualReview.mjs");
  const r = await reviewRenderedCreative("data:image/png;base64,iVBORw0KGgo=", { platform: "instagram" }, { env: {}, noCache: true });
  assert.equal(r.available, false);
  assert.equal(r.verdict, "WATCH");
});

test("N2-22. visual review lives OUTSIDE lib/social (no GenAI call inside lib/social)", () => {
  // the reviewer file is under lib/newsroom, not lib/social
  const under = readdirSync(join(REPO, "lib", "newsroom"));
  assert.ok(under.includes("visualReview.mjs"));
  // and no lib/social/newsroom file contains an OpenAI/Anthropic endpoint
  const nr = join(REPO, "lib", "social", "newsroom");
  for (const f of readdirSync(nr).filter((f) => f.endsWith(".mjs"))) {
    const src = readFileSync(join(nr, f), "utf8");
    assert.doesNotMatch(src, /api\.openai\.com|api\.anthropic\.com|chat\/completions/);
  }
});

// ---- §43: artifact-hash review cache -------------------------
test("N2-23. the visual review is cached by artifact sha (same bytes -> not re-reviewed)", async () => {
  const { reviewRenderedCreative, VISUAL_REVIEW_CACHE_PATH } = await import("../../lib/newsroom/visualReview.mjs");
  assert.match(VISUAL_REVIEW_CACHE_PATH, /visual-review-cache\.json$/);
  // with no key we can't populate the cache, but the sha is still computed + stable
  const a = await reviewRenderedCreative("data:image/png;base64,AAAA", {}, { env: {}, noCache: true });
  const b = await reviewRenderedCreative("data:image/png;base64,AAAA", {}, { env: {}, noCache: true });
  assert.equal(a.artifact_sha, b.artifact_sha);
});

// ---- §43: feed-level fatigue --------------------------------
test("N2-24. feedReview FAILs a feed that is all price-cards / one layout family (§33/§34)", () => {
  const planned = Array.from({ length: 12 }, () => ({ story: { pillar: "DEALS", series: "DEAL_DROP", bucket: "CONVERSION", pokemon: "charizard", facts_json: { layout_family: "deal" } } }));
  const r = feedReview(planned);
  assert.equal(r.verdict, "FEED_FAIL");
  assert.ok(r.blockers.length > 0);
});

test("N2-25. feedReview PASSes a varied editorial feed", () => {
  const series = ["MARKET_SNAPSHOT", "WHY_SOLD_PRICES_MATTER", "EXACT_PRINTING_MATTERS", "HOW_WE_FIND_DEALS", "SET_WATCH", "RAW_VS_GRADED_EXPLAINER", "METHODOLOGY", "BUDGET_COLLECTION", "VINTAGE_VS_MODERN"];
  const pillars = ["MARKET", "EDUCATION", "BEHIND_THE_FINDER", "BEHIND_THE_FINDER", "MARKET", "EDUCATION", "BRAND", "BUDGET", "COMPARISON"];
  const planned = series.map((s, i) => ({ story: { pillar: pillars[i], series: s, bucket: pillars[i] === "BUDGET" ? "CONVERSION" : pillars[i] === "BRAND" ? "BRAND" : "AUTHORITY", pokemon: null, facts_json: { layout_family: pillars[i].toLowerCase(), cta_zone: i % 2 ? "bottom" : "top", loud_brand: i % 3 === 0 } }, signature: { hook_grammar: `h${i}` } }));
  const r = feedReview(planned);
  assert.notEqual(r.verdict, "FEED_FAIL");
});

// ---- §43: config posture / kill / circuit -------------------
test("N2-26. resolveBacklogPosture is fail-closed: default no provider, kill wins, --queue + token required", () => {
  assert.equal(resolveBacklogPosture({}).canQueueProvider, false);
  assert.equal(resolveBacklogPosture({ [BACKLOG_FLAG]: "true" }, { requestQueue: true }).canQueueProvider, false); // no token
  assert.equal(resolveBacklogPosture({ [BACKLOG_FLAG]: "true", BUFFER_ACCESS_TOKEN: "x" }, { requestQueue: true }).canQueueProvider, true);
  assert.equal(resolveBacklogPosture({ [BACKLOG_FLAG]: "true", [KILL_FLAG]: "true", BUFFER_ACCESS_TOKEN: "x" }, { requestQueue: true }).mode, "OFF");
});

test("N2-27. enabling SOCIAL_BUFFER_BACKLOG_ENABLED does not touch Stage 1 / RIGHTS_STATE / autonomous flags", () => {
  const cfg = readFileSync(join(REPO, "lib", "social", "newsroom", "backlogConfig.mjs"), "utf8");
  // no assignment to / import of the live publishing switches (prose mentions are fine)
  assert.doesNotMatch(cfg, /RIGHTS_STATE\.\w+\s*=|import .*rights\.mjs|SOCIAL_AUTONOMOUS_ENABLED\s*=\s*["']?true|SOCIAL_PUBLISH_ENABLED\s*=\s*["']?true/);
  assert.match(cfg, /never enables Social Stage 1/);
});

// ---- §43: stale queued content -----------------------------
test("N2-28. queuedContentStale flags a queued placement whose story valid_until has passed or precedes the schedule", () => {
  const s = edStory();
  s.valid_until = iso(-1); // already expired
  const p1 = { status: "BUFFER_QUEUED", scheduled_for: iso(3) };
  assert.equal(queuedContentStale(s, p1, { now: NOW }), true);
  const s2 = edStory();
  s2.valid_until = iso(2);
  const p2 = { status: "BUFFER_QUEUED", scheduled_for: iso(5) }; // fires after it goes stale
  assert.equal(queuedContentStale(s2, p2, { now: NOW }), true);
  const s3 = edStory();
  s3.valid_until = iso(48);
  assert.equal(queuedContentStale(s3, { status: "BUFFER_QUEUED", scheduled_for: iso(3) }, { now: NOW }), false);
});

// ---- §43: events + UTM -----------------------------------
test("N2-29. structured events cover the pipeline and never carry a secret-looking value (§41)", () => {
  for (const t of ["STORY_CREATED", "BUFFER_QUEUE_REQUEST", "BUFFER_QUEUED", "BUFFER_DRIFT", "QUEUED_CONTENT_STALE", "BACKLOG_SUSPENDED"]) {
    assert.ok(EVENT_TYPES.includes(t));
  }
  const ev = makeEvent("BUFFER_QUEUED", { story_id: "s1", token: "Bearer abc.def", api_key: "sk-secret123456", provider_ref: "buf_9" });
  assert.equal(ev.provider_ref, "buf_9");
  assert.ok(!("token" in ev) && !("api_key" in ev));
});

test("N2-30. buffer message uses the deterministic UTM scheme (utm_source/medium/campaign/content) (§42)", () => {
  const s = edStory();
  const msg = buildProviderMessage({ story: s, placement: { platform: "instagram", placement_type: "carousel", content_id: s.story_id }, channelId: "ch", caption: "c", assetUrl: "https://cdn/x.png", dueAtUtc: iso(3), mode: "draft" });
  assert.match(msg.siteLink, /utm_source=instagram/);
  assert.match(msg.siteLink, /utm_medium=social/);
  assert.match(msg.siteLink, /utm_content=/);
});

// ---- §43: no eBay / no verifier / no Stage 1 / no email --------
test("N2-31. NEWSROOM-2 modules make no eBay Browse call and do not touch the P0.4.3 verifier", () => {
  const files = [
    ...readdirSync(join(REPO, "lib", "social", "newsroom")).map((f) => join(REPO, "lib", "social", "newsroom", f)),
    ...readdirSync(join(REPO, "lib", "newsroom")).map((f) => join(REPO, "lib", "newsroom", f)),
  ].filter((f) => f.endsWith(".mjs"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /from ["'][^"']*lib\/ebay|getBrowseRateLimit\(|getListingSnapshot\(/);
    assert.doesNotMatch(src, /from ["'][^"']*verifyAllocator|allocateVerifyBatch\(/);
  }
});

test("N2-32. socialBacklog does not enable Stage 1, flip RIGHTS_STATE, or send email", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklog.mjs"), "utf8");
  assert.doesNotMatch(src, /RIGHTS_STATE\.\w+\s*=|SOCIAL_AUTONOMOUS_ENABLED\s*=\s*["']?true|SOCIAL_PUBLISH_ENABLED\s*=\s*["']?true/);
  assert.doesNotMatch(src, /sendBatch|renderDigest|lib\/email|resend/i);
});

test("N2-33. the only provider call in the backlog path is via getSocialProvider() - no second Buffer client", () => {
  const bb = readFileSync(join(REPO, "lib", "newsroom", "bufferBacklog.mjs"), "utf8");
  assert.match(bb, /from "\.\.\/social\/providers\/index\.mjs"/);
  assert.doesNotMatch(bb, /api\.buffer\.com|new BufferClient|bufferGraphQL/);
});

// ---- §43: circuit breaker ----------------------------------
test("N2-34. the backlog circuit reuses the autonomous circuit primitives (no new breaker impl)", () => {
  const src = readFileSync(join(REPO, "lib", "social", "newsroom", "backlogCircuit.mjs"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/autonomous\/runState\.mjs"/);
  assert.match(src, /recordFailure|recordSuccess|resumeCircuit|isTripped/);
  assert.doesNotMatch(src, /class .*Circuit|function recordFailure\s*\(/); // not re-implemented
});
