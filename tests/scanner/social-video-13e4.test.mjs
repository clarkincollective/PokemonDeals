// Phase 13E.4 - the SHORT-FORM VIDEO system (Instagram Reels / TikTok):
// the deterministic timeline, the animated HTML document, the caption
// drafts and the fail-closed video QA gate.
//
// Fixtures / synthetic rows only. No Chrome, no ffmpeg, no DB, no network.
// The load-bearing guarantees under test: the video re-states the frozen
// 13E.3D facts verbatim and never invents one; the master format is
// locked to 1080x1920 / 9:16 / 30fps; a family fails CLOSED rather than
// fabricate; nothing here publishes or calls OpenAI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildVideoTimeline,
  sceneAt,
  SHARED_SAFE,
  VIDEO_FPS,
  VIDEO_W,
  VIDEO_H,
  VIDEO_PLATFORMS,
} from "../../lib/social/videoTimeline.mjs";
import { renderVideoHtml, MOTIONS, BAKE_JS } from "../../lib/social/videoDocument.mjs";
import { buildVideoCaptions } from "../../lib/social/videoCaption.mjs";
import { runVideoQa } from "../../lib/social/videoQa.mjs";
import { PLATFORM_TARGETS, SITE_HOST } from "../../lib/social/creativeSpec.mjs";
import { buildDealPayload, buildMoverPayload, buildSpotlightPayload } from "../../lib/social/payload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const HOUR = 3_600_000;

const VIDEO_FILES = readdirSync(join(ROOT, "lib/social"))
  .filter((f) => /^video[A-Z].*\.mjs$/.test(f))
  .map((f) => "lib/social/" + f)
  .concat(["scripts/socialVideo.mjs"]);

const dealRow = (over = {}) => ({
  id: 700,
  watchlist_id: 700,
  card_tcgplayer_id: "12345",
  card_name: over.card_name ?? "Charizard",
  card_set: over.card_set ?? "Base Set",
  is_graded: over.is_graded ?? false,
  grader: over.grader ?? null,
  grade: over.grade ?? null,
  listing_type: "FIXED_PRICE",
  marketplace: over.marketplace ?? "EBAY_US",
  total_price_usd: over.total_price_usd ?? 120,
  total_price: over.total_price_usd ?? 120,
  market_price: over.market_price ?? 300,
  discount_pct: over.discount_pct ?? 0.6,
  exact_verified_at: new Date(Date.now() - HOUR).toISOString(),
  first_seen_at: new Date(Date.now() - 3 * HOUR).toISOString(),
  last_seen_at: new Date(Date.now() - HOUR).toISOString(),
  auction_end_at: null,
  ...over,
});

const realMovement = {
  ok: true,
  pct: 0.17,
  direction: "up",
  windowLabel: "30 days",
  comparedOn: "2026-08-07",
  series: Array.from({ length: 20 }, (_, i) => ({ t: `2026-08-${String(i + 1).padStart(2, "0")}`, v: 100 + i * 2 })),
  confidence: "ok",
};

const dealPayload = (over) => buildDealPayload({ contentType: "deal_of_day", row: dealRow(over), now: Date.now(), utmCampaign: "deal_of_day" });
const moverPayload = () => buildMoverPayload({ row: dealRow({ card_name: "Umbreon", card_set: "Neo Discovery" }), movement: realMovement, now: Date.now() });
const carouselPayload = () =>
  buildSpotlightPayload({
    contentType: "pokemon_spotlight",
    displayName: "Under market today",
    dealCount: 6,
    topDeals: [dealRow({ id: 1, watchlist_id: 1 }), dealRow({ id: 2, watchlist_id: 2, card_tcgplayer_id: "22" }), dealRow({ id: 3, watchlist_id: 3, card_tcgplayer_id: "33" })],
    destinationRoute: "/deals",
    now: Date.now(),
  });

const carouselCards = [
  { fileUrl: "file:///c/cache/12345.jpg", tcgplayerId: "12345", name: "Charizard" },
  { fileUrl: "file:///c/cache/22.jpg", tcgplayerId: "22", name: "Blastoise" },
  { fileUrl: "file:///c/cache/33.jpg", tcgplayerId: "33", name: "Venusaur" },
];

// ============================================================================
// 1. MASTER FORMAT
// ============================================================================

test("1. master format is locked: 1080x1920, 9:16, 30fps, frameCount = fps * duration", () => {
  for (const platform of VIDEO_PLATFORMS) {
    const tl = buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform });
    assert.equal(tl.width, 1080);
    assert.equal(tl.height, 1920);
    assert.equal(tl.width, VIDEO_W);
    assert.equal(tl.height, VIDEO_H);
    assert.equal(tl.fps, 30);
    assert.equal(tl.fps, VIDEO_FPS);
    assert.equal(tl.aspect, "9:16");
    assert.equal(tl.width * 16, tl.height * 9);
    assert.equal(tl.frameCount, Math.round((tl.durationMs / 1000) * 30));
  }
});

test("2. one MASTER safe rectangle = the UNION (strictest) of the reel and tiktok safe zones", () => {
  for (const side of ["top", "right", "bottom", "left"]) {
    assert.equal(
      SHARED_SAFE[side],
      Math.max(PLATFORM_TARGETS.reel_9x16.safe[side], PLATFORM_TARGETS.tiktok_9x16.safe[side]),
      side,
    );
  }
  // the timeline reports that same rectangle regardless of platform, and
  // the platform's own (looser) safe box always sits inside it
  for (const platform of VIDEO_PLATFORMS) {
    const tl = buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform });
    assert.deepEqual(tl.safe, SHARED_SAFE);
    for (const side of ["top", "right", "bottom", "left"]) assert.ok(tl.platformSafe[side] <= tl.safe[side], `${platform} ${side}`);
  }
});

test("3. each family has a distinct within-spec duration and >= 3 scenes, hook first, cta after the hook", () => {
  const specs = [
    ["deal_drop", dealPayload(), null, [7000, 10000]],
    ["market_mover", moverPayload(), null, [8000, 12000]],
    ["brand_ad", dealPayload(), null, [8000, 12000]],
    ["hook_carousel", carouselPayload(), { distinctCount: 3, distinctPrintings: 5, moreCount: 2, cards: carouselCards }, [12000, 18000]],
  ];
  for (const [family, payload, carousel, [lo, hi]] of specs) {
    const tl = buildVideoTimeline({ payload, family, platform: "reel", carousel });
    assert.ok(tl.durationMs >= lo && tl.durationMs <= hi, `${family} duration ${tl.durationMs} in [${lo},${hi}]`);
    assert.ok(tl.scenes.length >= 3, `${family} scenes`);
    assert.equal(tl.scenes[0].id, "hook");
    assert.equal(tl.scenes[0].start, 0);
    assert.ok(tl.ctaAtMs > 0 && tl.ctaAtMs < tl.durationMs, `${family} cta timing`);
    // the hook scene ends inside the first ~2s -> strongest message is immediate
    assert.ok(tl.scenes[0].end <= 4000, `${family} hook holds too long`);
  }
});

// ============================================================================
// 2. DETERMINISM + IDENTIFIERS
// ============================================================================

test("4. buildVideoTimeline is deterministic - identical inputs produce a deep-equal timeline", () => {
  const p = dealPayload();
  const a = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  const b = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  assert.deepEqual(a, b);
});

test("5. the 13E.3D identifiers are carried into the video verbatim, only tagged with -vid-<platform>", () => {
  const p = dealPayload();
  for (const platform of VIDEO_PLATFORMS) {
    const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform });
    assert.equal(tl.content_id, `${p.creative.content_id}-vid-${platform}`);
    assert.equal(tl.content_goal, p.content_goal);
    assert.equal(tl.creative_family, "deal_drop");
    assert.ok(["REACH", "ENGAGEMENT", "TRUST", "CONVERSION", "BRAND"].includes(tl.content_goal));
    assert.equal(tl.cta_variant, p.cta.variant);
  }
});

test("6. reel and tiktok share everything except the platform label + reported platformSafe", () => {
  const p = dealPayload();
  const reel = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  const tiktok = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "tiktok" });
  assert.notEqual(reel.content_id, tiktok.content_id); // platform-tagged
  assert.equal(reel.durationMs, tiktok.durationMs);
  assert.deepEqual(reel.scenes, tiktok.scenes);
  assert.deepEqual(reel.facts, tiktok.facts);
  assert.deepEqual(reel.safe, tiktok.safe);
});

// ============================================================================
// 3. FACTS ARE COPIED, NEVER INVENTED
// ============================================================================

test("7. the deal hook text on the timeline is exactly the payload's hook - never rewritten", () => {
  const p = dealPayload({ discount_pct: 0.55, market_price: 200, total_price_usd: 90 });
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  assert.equal(tl.facts.hook_text, p.hook.text);
  assert.equal(tl.hook_variant, p.hook.variant ?? p.creative.hook_variant);
});

test("8. deal metric / listed / reference on the timeline equal the payload row - no recompute drift", () => {
  const row = dealRow({ discount_pct: 0.6, total_price_usd: 120, market_price: 300 });
  const p = buildDealPayload({ contentType: "deal_of_day", row, now: Date.now(), utmCampaign: "deal_of_day" });
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  assert.equal(tl.facts.metric_value, "60%");
  assert.equal(tl.facts.listed_usd, 120);
  assert.equal(tl.facts.reference_usd, 300);
});

test("9. market mover: the chart facts are the real series - same length, same first / last value", () => {
  const p = moverPayload();
  const tl = buildVideoTimeline({ payload: p, family: "market_mover", platform: "reel" });
  assert.ok(tl.facts.movement, "movement facts present");
  assert.equal(tl.facts.movement.points, realMovement.series.length);
  assert.equal(tl.facts.movement.firstValue, realMovement.series[0].v);
  assert.equal(tl.facts.movement.lastValue, realMovement.series[realMovement.series.length - 1].v);
  assert.equal(tl.facts.movement.direction, "up");
});

test("10. a stale row FAILS CLOSED - no payload, no creative, no diagnostic copy (13E.5D)", () => {
  const stale = dealRow({ exact_verified_at: new Date(Date.now() - 400 * HOUR).toISOString() });
  // buildDealPayload now THROWS rather than emit a creative with placeholder
  // freshness text - the render pipeline catches this and skips the family.
  assert.throws(
    () => buildDealPayload({ contentType: "deal_of_day", row: stale, now: Date.now(), utmCampaign: "deal_of_day" }),
    /social freshness/i
  );
  // a fresh row still builds, and its freshness label is the real
  // exact_verified_at, never the internal diagnostic string
  const fresh = dealRow({ exact_verified_at: new Date(Date.now() - 1 * HOUR).toISOString() });
  const p = buildDealPayload({ contentType: "deal_of_day", row: fresh, now: Date.now(), utmCampaign: "deal_of_day" });
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  assert.doesNotMatch(tl.facts.freshness_label, /not eligible|outside .*threshold/i);
  assert.match(tl.facts.freshness_label, /Availability can change\.$/);
});

// ============================================================================
// 4. WEBSITE-FIRST CTA, ROUTE NEVER FABRICATED
// ============================================================================

test("11. every family's CTA points back to PokemonDealFinder - never eBay, never a fabricated host", () => {
  const cases = [
    ["deal_drop", dealPayload(), null],
    ["market_mover", moverPayload(), null],
    ["brand_ad", dealPayload(), null],
    ["hook_carousel", carouselPayload(), { distinctCount: 3, distinctPrintings: 3, moreCount: 0, cards: carouselCards }],
  ];
  for (const [family, payload, carousel] of cases) {
    const tl = buildVideoTimeline({ payload, family, platform: "reel", carousel });
    assert.ok(tl.facts.cta_url.startsWith(SITE_HOST), `${family} cta_url ${tl.facts.cta_url}`);
    assert.doesNotMatch(tl.facts.cta_url, /ebay|tcgplayer/i);
    assert.doesNotMatch(tl.facts.cta_label, /see it on ebay/i);
  }
});

test("12. the CTA url is the payload's real destination route - not a route the video made up", () => {
  const p = dealPayload();
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  const route = p.destination.route;
  assert.ok(route.startsWith("/"));
  assert.ok(tl.facts.cta_url.endsWith(route) || route === "/", `${tl.facts.cta_url} vs ${route}`);
});

// ============================================================================
// 5. CAROUSEL: DISTINCT PRINTINGS, TRUTHFUL COUNT
// ============================================================================

test("13. carousel: one card scene per DISTINCT printing, and the count fact matches the scene count", () => {
  const carousel = { distinctCount: 3, distinctPrintings: 5, moreCount: 2, cards: carouselCards };
  const tl = buildVideoTimeline({ payload: carouselPayload(), family: "hook_carousel", platform: "reel", carousel });
  const cardScenes = tl.scenes.filter((s) => /^card_\d+$/.test(s.id));
  assert.equal(cardScenes.length, 3);
  assert.equal(tl.facts.carousel_count, 3);
  assert.equal(tl.facts.more_count, 2);
});

test("14. carousel: the source card ids are the distinct printings, with no duplicate", () => {
  const carousel = { distinctCount: 3, distinctPrintings: 3, moreCount: 0, cards: carouselCards };
  const tl = buildVideoTimeline({ payload: carouselPayload(), family: "hook_carousel", platform: "reel", carousel });
  const ids = tl.source.card_ids;
  assert.deepEqual([...ids].sort(), ["12345", "22", "33"]);
  assert.equal(new Set(ids).size, ids.length);
});

// ============================================================================
// 6. THE ANIMATED DOCUMENT
// ============================================================================

test("15. renderVideoHtml emits a self-contained 1080x1920 document - no file:// and no remote resource", () => {
  const p = dealPayload();
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  const html = renderVideoHtml(
    tl,
    { hookText: p.hook.text, metricValue: "60%", metricLabel: "BELOW RECENT MARKET", listed: 120, reference: 300, accentColor: "#3FCF8E", tag: "Raw" },
    {},
  );
  assert.match(html, /width:1080px/);
  assert.match(html, /height:1920px/);
  assert.doesNotMatch(html, /file:\/\//);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/); // no remote css/js/img/font (svg xmlns is allowed)
  assert.ok(html.includes(p.hook.text));
  assert.ok(html.includes(tl.facts.cta_url));
});

test("16. every element motion (--va) the document emits is a known baked motion, and no CSS @keyframes/animation is used", () => {
  const carousel = { distinctCount: 3, distinctPrintings: 3, moreCount: 0, cards: carouselCards };
  const docs = [
    renderVideoHtml(buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform: "reel" }), { hookText: "x", metricValue: "1%", metricLabel: "Y", listed: 1, reference: 2, tag: "Raw" }, {}),
    renderVideoHtml(buildVideoTimeline({ payload: moverPayload(), family: "market_mover", platform: "reel" }), { name: "N", set: "S", moveValue: "+1%", periodLabel: "Last 30 days", series: realMovement.series, firstValue: 100, lastValue: 138 }, {}),
    renderVideoHtml(buildVideoTimeline({ payload: carouselPayload(), family: "hook_carousel", platform: "reel", carousel }), { hookText: "h", moreCount: 0, cards: carouselCards.map((c) => ({ ...c, metricValue: "1%", listed: 1, reference: 2 })) }, {}),
    renderVideoHtml(buildVideoTimeline({ payload: dealPayload(), family: "brand_ad", platform: "reel" }), { benefits: ["a", "b", "c"], urlLabel: "x" }, { screenshot: { fileUrl: "file:///c/x.png" } }),
  ];
  for (const html of docs) {
    const used = [...html.matchAll(/--va:\s*([a-z_]+)/g)].map((m) => m[1]);
    assert.ok(used.length > 0, "no --va motions emitted");
    for (const m of used) assert.ok(MOTIONS.includes(m), `unknown motion "${m}" (known: ${MOTIONS.join(",")})`);
    // motion is baked per frame, never a CSS animation / keyframe
    assert.doesNotMatch(html, /@keyframes/);
    assert.doesNotMatch(html, /animation:/);
    // every motion also has a branch in the baker
    for (const m of new Set(used)) assert.ok(BAKE_JS.includes(`a==='${m}'`), `BAKE_JS has no branch for "${m}"`);
  }
});

test("17. the disclosure + Ad label render in every family document", () => {
  const carousel = { distinctCount: 3, distinctPrintings: 3, moreCount: 0, cards: carouselCards };
  const cases = [
    [renderVideoHtml(buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform: "reel" }), { hookText: "x", metricValue: "1%", metricLabel: "Y", listed: 1, reference: 2, tag: "Raw" }, {})],
    [renderVideoHtml(buildVideoTimeline({ payload: moverPayload(), family: "market_mover", platform: "reel" }), { name: "N", set: "S", moveValue: "+1%", periodLabel: "P", series: realMovement.series, firstValue: 1, lastValue: 2 }, {})],
    [renderVideoHtml(buildVideoTimeline({ payload: carouselPayload(), family: "hook_carousel", platform: "reel", carousel }), { hookText: "h", moreCount: 0, cards: carouselCards.map((c) => ({ ...c, metricValue: "1%", listed: 1, reference: 2 })) }, {})],
  ];
  for (const [html] of cases) {
    assert.match(html, /class="vdisc"/);
    assert.match(html, /class="ad"/);
    assert.match(html, /Availability can change\.|not investment advice/);
  }
});

// ============================================================================
// 7. THE VIDEO QA GATE - FAILS CLOSED
// ============================================================================

test("18. runVideoQa fails closed when there is no MP4 to inspect", async () => {
  const tl = buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform: "reel" });
  const qa = await runVideoQa({ timeline: tl, mp4: null, payload: dealPayload() });
  assert.equal(qa.ok, false);
  assert.ok(qa.failed.some((f) => /mp4_exists/.test(f)));
});

test("19. QA rejects a timeline whose hook was altered away from the payload", async () => {
  const p = dealPayload();
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  const tampered = { ...tl, facts: { ...tl.facts, hook_text: "LIMITED TIME!! BUY NOW" } };
  const qa = await runVideoQa({ timeline: tampered, payload: p });
  assert.ok(qa.checks.find((c) => c.id === "hook_text_matches_payload" && c.ok === false));
});

test("20. QA rejects seller imagery and passes canonical / local artwork", async () => {
  const p = dealPayload();
  const tl = buildVideoTimeline({ payload: p, family: "deal_drop", platform: "reel" });
  const seller = await runVideoQa({ timeline: tl, payload: p, layers: { cardArtwork: { card: { fileUrl: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg" } } } });
  assert.ok(seller.checks.find((c) => c.id === "no_seller_imagery" && c.ok === false));
  const canonical = await runVideoQa({ timeline: tl, payload: p, layers: { cardArtwork: { card: { fileUrl: "file:///c/cache/12345.jpg" } } } });
  assert.ok(canonical.checks.find((c) => c.id === "no_seller_imagery" && c.ok === true));
});

test("21. QA fails closed for a Market Mover with no confident history", async () => {
  const p = moverPayload();
  const tl = buildVideoTimeline({ payload: p, family: "market_mover", platform: "reel" });
  const noHist = { ...tl, facts: { ...tl.facts, movement: null } };
  const qa = await runVideoQa({ timeline: noHist, payload: p, layers: { cardArtwork: { card: { fileUrl: "file:///c/12345.jpg" }, tcgplayerId: "12345" } } });
  assert.ok(qa.checks.find((c) => c.id === "mover_has_confident_history" && c.ok === false));
});

test("22. QA fails closed for a Market Mover with no real card artwork", async () => {
  const p = moverPayload();
  const tl = buildVideoTimeline({ payload: p, family: "market_mover", platform: "reel" });
  const noCard = { ...tl, source: { ...tl.source, has_real_card: false, card_ids: [] } };
  const qa = await runVideoQa({ timeline: noCard, payload: p });
  assert.ok(qa.checks.find((c) => c.id === "mover_has_real_card" && c.ok === false));
});

test("23. QA rejects a carousel with a duplicated printing", async () => {
  const carousel = { distinctCount: 2, distinctPrintings: 2, moreCount: 0, cards: [carouselCards[0], { ...carouselCards[1], tcgplayerId: "12345" }] };
  const tl = buildVideoTimeline({ payload: carouselPayload(), family: "hook_carousel", platform: "reel", carousel });
  const qa = await runVideoQa({ timeline: tl, payload: carouselPayload(), layers: { carousel } });
  assert.ok(qa.checks.find((c) => c.id === "carousel_no_duplicate_printing" && c.ok === false));
});

test("24. QA confirms the safe rectangle is the shared union and that it never publishes", async () => {
  const tl = buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform: "reel" });
  const qa = await runVideoQa({ timeline: tl, payload: dealPayload() });
  assert.ok(qa.checks.find((c) => c.id === "safe_is_shared_union" && c.ok === true));
  assert.ok(qa.checks.find((c) => c.id === "not_published" && c.ok === true));
  assert.ok(qa.checks.find((c) => c.id === "cta_url_on_site" && c.ok === true));
  assert.ok(qa.checks.find((c) => c.id === "disclosure_from_ms_set" && c.ok === true));
});

// ============================================================================
// 8. CAPTIONS - NO FABRICATED VALUES, NO EBAY CTA
// ============================================================================

test("25. video captions carry the disclosure, reference the site, and never use an eBay CTA", () => {
  for (const [family, payload] of [["deal_drop", dealPayload()], ["market_mover", moverPayload()]]) {
    const tl = buildVideoTimeline({ payload, family, platform: "reel" });
    const caps = buildVideoCaptions({ timeline: tl, payload });
    for (const body of [caps.instagram, caps.tiktok]) {
      assert.match(body, /^Ad ·/m); // the disclosure line
      assert.ok(body.includes("PokemonDealFinder"));
      assert.doesNotMatch(body, /see it on ebay/i);
      assert.doesNotMatch(body, /buy now|guaranteed|will explode|don.t miss out/i);
    }
    assert.ok(Array.isArray(caps.hashtags) && caps.hashtags.length <= 6);
    assert.equal(caps.meta.disclosure_present, true);
  }
});

test("26. brand_ad captions fall back to fixed claim-free prose (no static assembler exists for it)", () => {
  const p = { ...dealPayload(), content_type: "brand_ad", content_goal: "BRAND" };
  const tl = buildVideoTimeline({ payload: p, family: "brand_ad", platform: "reel" });
  const caps = buildVideoCaptions({ timeline: tl, payload: p });
  assert.match(caps.instagram, /^Ad ·/m);
  assert.ok(caps.instagram.includes(SITE_HOST));
  assert.doesNotMatch(caps.instagram, /\$\d/); // no invented price in a brand caption
});

// ============================================================================
// 9. NO OPENAI, NO PUBLISHING, NO PLATFORM SDK  (source scan)
// ============================================================================

test("27. no video module imports or calls a GenAI provider (image OR video OR text)", () => {
  const forbidden =
    /from ["'](openai|@anthropic-ai\/sdk|@google\/generative-ai)["']|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|\b(images\.generate|videos\.generate|generateContent|chatCompletion|createCompletion)\b/i;
  for (const f of VIDEO_FILES) assert.doesNotMatch(read(f), forbidden, `${f} must not touch a GenAI provider`);
});

test("28. no video module makes a network call, defines a publish fn, or imports a platform SDK", () => {
  const net = /\bfetch\s*\(/;
  const publish = /\bfunction\s+(publish|schedulePost|sendToBuffer|postToInstagram|postToTikTok|postToReddit)\s*\(|(publish|schedulePost|sendToBuffer)\s*[:=]\s*(async\s*)?\(/i;
  const sdk = /instagram-private-api|tiktok-api|buffer-sdk|facebook-nodejs-business|graph\.facebook\.com|api\.buffer\.com|open-api\.tiktok\.com|graph\.instagram\.com|snoowrap|reddit/i;
  for (const f of VIDEO_FILES) {
    const src = read(f);
    if (!f.endsWith("videoRender.mjs")) assert.doesNotMatch(src, net, `${f} must not fetch()`);
    assert.doesNotMatch(src, publish, `${f} defines a publish-like fn`);
    assert.doesNotMatch(src, sdk, `${f} references a social platform / reddit API`);
  }
});

test("29. the video renderer's only child processes are the local Chrome and the bundled ffmpeg/ffprobe", () => {
  const src = read("lib/social/videoRender.mjs");
  assert.match(src, /ffmpeg-static/);
  assert.match(src, /ffprobe-static/);
  assert.match(src, /CHROME_BIN|chrome\.exe/i);
  // no HTTP client, no upload
  assert.doesNotMatch(src, /\baxios\b|\bnode-fetch\b|https?:\/\/[a-z]/i);
  assert.doesNotMatch(src, /\bfetch\s*\(/);
});

test("30. the npm entry point exists and the script never calls a publish/schedule step", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["social:video"], "node scripts/socialVideo.mjs");
  const src = read("scripts/socialVideo.mjs");
  assert.match(src, /never publishes/i);
  assert.doesNotMatch(src, /\b(publish|schedule|buffer|postTo)\w*\s*\(/i);
});

// ============================================================================
// 10. AUDIO IS OPTIONAL - THE VIDEO MUST WORK SOUND-OFF
// ============================================================================

test("31. the timeline declares audio as NOT required and only carries future cue points", () => {
  const tl = buildVideoTimeline({ payload: dealPayload(), family: "deal_drop", platform: "reel" });
  assert.equal(tl.audio.required, false);
  assert.ok(Array.isArray(tl.audio.cues) && tl.audio.cues.length > 0);
  for (const c of tl.audio.cues) assert.ok(typeof c.at === "number" && typeof c.id === "string");
});

test("32. sceneAt resolves every ms of the timeline to exactly one named scene", () => {
  const tl = buildVideoTimeline({ payload: moverPayload(), family: "market_mover", platform: "reel" });
  for (let t = 0; t < tl.durationMs; t += 250) {
    const s = sceneAt(tl, t);
    assert.ok(s && typeof s.id === "string", `t=${t}`);
  }
});
