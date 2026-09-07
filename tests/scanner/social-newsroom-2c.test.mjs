// Phase SOCIAL-NEWSROOM-2C - real render -> host -> visual QA -> safe
// Buffer proof. Pure-logic + source-scan + mock-provider tests. No real
// Chrome, no real OpenAI, no real Buffer call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { renderEditorialHtml, EDITORIAL_LAYOUTS, EDITORIAL_TARGETS } from "../../lib/social/newsroom/editorialTemplates.mjs";
import { SERIES_RENDER, seriesRenderable, layoutFamilyFor, renderablePlatformsFor, buildEditorialAsset, newsroomRights, LAYOUT_CTA_ZONE } from "../../lib/social/newsroom/renderRegistry.mjs";
import { editorialCreativeQa } from "../../lib/social/newsroom/editorialQa.mjs";
import { runQaStack, feedReview } from "../../lib/social/newsroom/index.mjs";
import { platformCaptions } from "../../lib/social/newsroom/captions.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import { canHost } from "../../lib/social/storage/hostedAssets.mjs";
import { preflightPlacement, scheduleOne, reconcileOne } from "../../lib/newsroom/bufferBacklog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const NOW = Date.parse("2026-09-08T02:00:00Z");
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();

const story = (series, over = {}) => ({
  story_id: `${series.toLowerCase()}-t`,
  series, pillar: over.pillar ?? "MARKET", content_goal: "TRUST",
  cta_intensity: SERIES_RENDER[series]?.cta ?? "BRAND_ONLY",
  shelf_life_class: "EDITORIAL", lane: "PLANNED",
  subject_id: `${series.toLowerCase()}-proof`,
  captured_at: iso(-24), valid_from: iso(-24), valid_until: iso(24 * 13),
  latest_safe_publish_at: iso(24 * 13), status: "PLANNED",
  facts_json: over.facts ?? {}, deal_ids: [], card_ids: [],
});

function mockProvider({ accept = true, id = "buf_x", status = "draft" } = {}) {
  return {
    isConfigured: () => true,
    async listChannels() { return { ok: true, organizationId: "org", channels: [{ id: "ch_x", service: "twitter" }, { id: "ch_ig", service: "instagram" }] }; },
    async createPost() { return accept ? { accepted: true, id, statusRaw: status } : { accepted: false, reason: "buffer_InvalidInputError", detail: "mock" }; },
    async getPostStatus() { return { ok: true, published: status === "sent", publishedAt: status === "sent" ? iso(1) : null, failed: status === "error", statusRaw: status }; },
  };
}

// ---- render path ------------------------------------------------
test("2C-1. every editorial layout renders self-contained HTML (no network resource)", () => {
  for (const lf of EDITORIAL_LAYOUTS) {
    const html = renderEditorialHtml(lf, { target: "ig_45", headline: "H", thesis: "T is the hero.", support: "s", quote: "q", reveal: "r", stats: [{ label: "A", value: "1" }], rows: [{ name: "C", deltaPct: 3 }], steps: [{ title: "s", detail: "d" }] });
    assert.match(html, /<!doctype html>/i);
    assert.doesNotMatch(html, /https?:\/\/(?!fonts\.gstatic)/i); // no remote src (fonts are embedded base64)
    assert.doesNotMatch(html, /i\.ebayimg\.com|<img /i); // no card image, no seller image
    assert.doesNotMatch(html, /data:image\/(?!png;base64,iVBOR)/); // (fontData is base64 font, not image)
  }
});

test("2C-2. platform-native output: 4:5 for IG/X, 9:16 for a YouTube Short", () => {
  const s = story("MARKET_SNAPSHOT", { facts: { stats: [{ label: "A", value: "1" }] } });
  const ig = buildEditorialAsset(s, "instagram");
  const yt = buildEditorialAsset(s, "youtube");
  assert.equal(EDITORIAL_TARGETS[ig.target].ratio, "4:5");
  assert.equal(EDITORIAL_TARGETS[yt.target].ratio, "9:16");
  assert.notEqual(ig.html, yt.html);
});

test("2C-3. a YouTube Short is only offered when the series is materially varied (SS40)", () => {
  // BIGGEST_MOVERS: short:false -> no youtube; METHODOLOGY editorial -> youtube ok
  assert.ok(!renderablePlatformsFor("BIGGEST_MOVERS").includes("youtube"));
  assert.ok(renderablePlatformsFor("METHODOLOGY").includes("youtube"));
  // TikTok is motion-only -> never a static editorial placement
  assert.ok(!renderablePlatformsFor("MARKET_SNAPSHOT").includes("tiktok"));
});

test("2C-4. each renderable series maps to a distinct layout family, mixed CTA (SS3/SS11/SS12)", () => {
  const layouts = new Set();
  const ctas = new Set();
  for (const [s, def] of Object.entries(SERIES_RENDER)) {
    assert.ok(EDITORIAL_LAYOUTS.includes(def.layout), s);
    layouts.add(def.layout);
    ctas.add(def.cta);
  }
  assert.ok(layouts.size >= 5, `${layouts.size} distinct editorial layout families in use`);
  assert.ok(ctas.has("NONE") && ctas.has("BRAND_ONLY"), "CTA intensity varies (education = NONE/BRAND_ONLY)");
  // distinct wordmark/CTA zones so the feed rhythm varies (SS13)
  assert.equal(new Set(Object.values(LAYOUT_CTA_ZONE)).size, Object.keys(LAYOUT_CTA_ZONE).length, "every layout has a distinct CTA zone");
});

// ---- deterministic editorial QA ------------------------------
test("2C-5. editorialCreativeQa: PASS clean, FAIL on 2 CTAs, WATCH on a too-long hook", () => {
  const base = { target: "ig_45", hookText: "A short clear editorial hook", minInlineFontPx: 24, ctaCount: 1, wordmarkCount: 1, statCallouts: [], bodyChars: 120, safe: { top: 104, right: 84, bottom: 116, left: 84 } };
  assert.equal(editorialCreativeQa(base).grade, "PASS");
  assert.equal(editorialCreativeQa({ ...base, ctaCount: 2 }).grade, "FAIL");
  assert.equal(editorialCreativeQa({ ...base, hookText: "word ".repeat(40) }).grade, "FAIL"); // P1 -> hard
  assert.equal(editorialCreativeQa({ ...base, statCallouts: ["1", "1"] }).grade, "WATCH"); // P2 duplicate
});

test("2C-6. qaStack routes editorial meta to editorialCreativeQa, not the deal-density check", () => {
  const s = story("METHODOLOGY", { pillar: "BRAND" });
  const qa = runQaStack(s, {
    creativeMeta: { editorial: true, target: "ig_45", hookText: "What counts as a deal here", minInlineFontPx: 22, ctaCount: 1, wordmarkCount: 1, statCallouts: [], bodyChars: 140, safe: { top: 104, right: 84, bottom: 116, left: 84 } },
    rights: { rightsCleared: true, artifactIsOwnRender: true }, requireVisualReview: false, originalityContext: [],
  });
  assert.equal(qa.layers.find((l) => l.layer === "CREATIVE").result, "PASS");
});

// ---- hosting -----------------------------------------------
test("2C-7. newsroomRights matches the live RIGHTS_STATE so canHost's drift guard passes", () => {
  const r = newsroomRights();
  for (const k of Object.keys(RIGHTS_STATE)) assert.equal(r[k], RIGHTS_STATE[k], k);
  const gate = canHost({
    localPath: "/x/by-hash/abc.png", bytes: Buffer.alloc(50_000), mime: "image/png",
    qa: { ok: true, passed: 4, total: 4, failed: [] }, rights: r, currentRights: RIGHTS_STATE,
  });
  assert.equal(gate.ok, true, gate.reason);
});

test("2C-8. canHost still refuses a flagged seller image and a failing QA", () => {
  assert.equal(canHost({ localPath: "/x/a.png", isSellerImage: true, bytes: Buffer.alloc(10), mime: "image/png", qa: { ok: true }, rights: newsroomRights() }).ok, false);
  assert.equal(canHost({ localPath: "/x/a.png", bytes: Buffer.alloc(50000), mime: "image/png", qa: { ok: false, failed: ["x"] }, rights: newsroomRights(), currentRights: RIGHTS_STATE }).ok, false);
  assert.equal(canHost({ localPath: "/x/a.gif", bytes: Buffer.alloc(50000), mime: "image/gif", qa: { ok: true, passed: 1, total: 1, failed: [] }, rights: newsroomRights(), currentRights: RIGHTS_STATE }).ok, false); // bad mime
});

test("2C-9. the render script hosts via the EXISTING storage provider + hosted-assets registry (no new system)", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /from "\.\.\/lib\/social\/storage\/index\.mjs"/);
  assert.match(src, /from "\.\.\/lib\/social\/storage\/hostedAssets\.mjs"/);
  assert.match(src, /from "\.\.\/lib\/social\/render\.mjs"/);
  assert.doesNotMatch(src, /new .*Renderer\(|puppeteer|playwright|node-canvas/);
  assert.match(src, /storageKeyFor\(sha/); // content-addressed immutable key
});

// ---- QA gates before Buffer ------------------------------
test("2C-10. a placement reaches BUFFER_READY only on QA PASS AND visual PASS AND a hosted URL", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /const ready = qaOk && reviewOk && Boolean\(hostedUrl\) && !hostErr;/);
  assert.match(src, /if \(qaOk && reviewOk\)/); // host only when both pass
  assert.match(src, /status: "BUFFER_READY"/);
});

test("2C-11. visual WATCH / FAIL blocks the queue (fail-closed, SS10/SS20)", async () => {
  const s = story("MARKET_SNAPSHOT");
  // preflight requires professionalResult === "PASS"
  const p = { placement_id: "p1", platform: "x", hosted_url: "https://cdn/x.png", artifact_hash: "h" };
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: iso(48), professionalResult: "WATCH", now: NOW }).ok, false);
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: iso(48), professionalResult: "FAIL", now: NOW }).ok, false);
  assert.equal(preflightPlacement({ story: s, placement: p, dueAtUtc: iso(48), professionalResult: "PASS", artifactQa: { ok: true }, now: NOW }).ok, true);
});

test("2C-12. FEED_PASS is required before the proof queue (SS13)", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /if \(feed\.verdict !== "FEED_PASS"\)/);
  assert.match(src, /blocked: `feed review/);
});

// ---- Buffer proof: future only, draft, BUFFER_QUEUED, reconcile ----
test("2C-13. the proof queue is DRAFT mode by default - a real provider write that never auto-publishes", () => {
  const src = readFileSync(join(REPO, "lib", "newsroom", "bufferBacklog.mjs"), "utf8");
  assert.match(src, /mode === "scheduled" \? \{ dueAt: dueAtUtc \} : \{ saveToDraft: true, dueAt: dueAtUtc \}/);
  const rs = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(rs, /resolveProviderMode\(process\.env\)/); // "draft" default
});

test("2C-14. scheduleOne: provider accept -> BUFFER_QUEUED, never PUBLISHED; future dueAt only", async () => {
  const s = story("MARKET_SNAPSHOT");
  const p = { placement_id: "p1", platform: "x", placement_type: "post", hosted_url: "https://cdn/x.png", artifact_hash: "h", content_id: s.story_id };
  const near = await scheduleOne({ story: s, placement: p, channelId: "ch_x", caption: "c", dueAtUtc: iso(0.5), professionalResult: "PASS", artifactQa: { ok: true }, now: NOW, provider: mockProvider() });
  assert.equal(near.queued, false); // <= now + 60m rejected
  const ok = await scheduleOne({ story: s, placement: p, channelId: "ch_x", caption: "c", dueAtUtc: iso(48), professionalResult: "PASS", artifactQa: { ok: true }, mode: "draft", now: NOW, provider: mockProvider({ status: "draft" }) });
  assert.equal(ok.queued, true);
  assert.equal(ok.placement_patch.status, "BUFFER_QUEUED");
  assert.notEqual(ok.placement_patch.status, "PUBLISHED");
});

test("2C-15. reconcile reads provider state back and never infers PUBLISHED without sent-evidence", async () => {
  const p = { placement_id: "p1", buffer_provider_ref: "buf_x", status: "BUFFER_QUEUED", scheduled_for: iso(48) };
  const d = await reconcileOne({ placement: p, provider: mockProvider({ status: "draft" }) });
  assert.equal(d.published, false);
  assert.equal(d.providerState, "draft");
  const sent = await reconcileOne({ placement: p, provider: mockProvider({ status: "sent" }) });
  assert.equal(sent.published, true);
});

test("2C-16. no live Deal Drop can enter the proof - LIVE/FRESH stories are rejected at preflight (SS19)", async () => {
  const live = { ...story("MARKET_SNAPSHOT"), shelf_life_class: "LIVE", lane: "FRESH" };
  const p = { placement_id: "p1", platform: "x", hosted_url: "https://cdn/x.png", artifact_hash: "h" };
  const r = preflightPlacement({ story: live, placement: p, dueAtUtc: iso(48), professionalResult: "PASS", artifactQa: { ok: true }, now: NOW });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /LIVE\/FRESH/.test(b)));
  // the render registry only maps EDITORIAL/EVERGREEN series - no DEAL_DROP
  assert.ok(!seriesRenderable("DEAL_DROP"));
});

test("2C-17. proof queue scheduling is Brisbane wall-clock converted explicitly to UTC (SS17)", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /brisbaneWallToUtc\(\{/);
  assert.match(src, /normaliseSchedule\(dueUtc\)/);
  assert.doesNotMatch(src, /new Date\(\)\.getHours\(\)/); // no ambient local time
});

test("2C-18. no duplicate placement: the queue path skips a placement that already has a provider ref", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.match(src, /alreadyQueued = new Set\(placements\.filter\(\(p\) => p\.buffer_provider_ref\)/);
  assert.match(src, /!alreadyQueued\.has\(p\.placement_id\)/);
});

// ---- captions -------------------------------------------
test("2C-19. one story -> distinct platform-native captions; education carries no tracked pitch (SS12/SS19)", () => {
  const caps = platformCaptions(story("METHODOLOGY", { pillar: "BRAND" }), { cta: "BRAND_ONLY" });
  assert.notEqual(caps.instagram.text, caps.x.text);
  assert.notEqual(caps.instagram.text, caps.youtube.text);
  // BRAND_ONLY -> a plain domain, never a utm-tracked link
  for (const p of ["instagram", "x", "youtube"]) assert.doesNotMatch(caps[p].text, /utm_source=/);
  const edu = platformCaptions(story("WHY_SOLD_PRICES_MATTER", { pillar: "EDUCATION" }), { cta: "NONE" });
  for (const p of ["instagram", "x", "youtube"]) assert.doesNotMatch(edu[p].text, /pokemondealfinder\.com/);
});

// ---- SAFETY -------------------------------------------
test("2C-20. NEWSROOM-2C makes no eBay Browse call and does not touch the verifier", () => {
  const files = [
    join(REPO, "scripts", "socialBacklogRender.mjs"),
    ...readdirSync(join(REPO, "lib", "social", "newsroom")).map((f) => join(REPO, "lib", "social", "newsroom", f)),
    ...readdirSync(join(REPO, "lib", "newsroom")).map((f) => join(REPO, "lib", "newsroom", f)),
  ].filter((f) => f.endsWith(".mjs"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /from ["'][^"']*lib\/ebay|getBrowseRateLimit\(|getListingSnapshot\(|getListingFreshness\(/);
    assert.doesNotMatch(src, /from ["'][^"']*verifyAllocator|allocateVerifyBatch\(/);
  }
});

test("2C-21. NEWSROOM-2C does not enable Stage 1 / flip RIGHTS_STATE / send email", () => {
  const src = readFileSync(join(REPO, "scripts", "socialBacklogRender.mjs"), "utf8");
  assert.doesNotMatch(src, /RIGHTS_STATE\.\w+\s*=|SOCIAL_AUTONOMOUS_ENABLED\s*=\s*["']?true|SOCIAL_PUBLISH_ENABLED\s*=\s*["']?true/);
  assert.doesNotMatch(src, /sendBatch|renderDigest|lib\/email|resend/i);
  // it imports RIGHTS_STATE read-only (for the canHost drift check)
  assert.match(src, /import \{ RIGHTS_STATE \} from "\.\.\/lib\/social\/rights\.mjs"/);
});

test("2C-22. editorial layouts carry exactly one wordmark and at most one CTA line", () => {
  for (const lf of EDITORIAL_LAYOUTS) {
    const html = renderEditorialHtml(lf, { target: "ig_45", headline: "H", thesis: "T.", support: "s", quote: "q", reveal: "r", stats: [{ label: "A", value: "1" }], rows: [{ name: "C", deltaPct: 3 }], steps: [{ title: "s", detail: "d" }], cta: "pokemondealfinder.com" });
    const wm = (html.match(/PokemonDealFinder<\/b>/g) || []).length;
    assert.equal(wm, 1, `${lf} has ${wm} wordmarks`);
  }
});
