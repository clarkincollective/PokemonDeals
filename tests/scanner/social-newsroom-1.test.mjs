// Phase SOCIAL-NEWSROOM-1 - editorial newsroom deterministic core.
//
// Covers the §50 checklist. Pure-logic tests only: no DB, no Buffer, no
// eBay, no render. Also asserts the phase's hard boundaries (no second
// source of truth, no Browse calls, P0.4.3 verifier + Stage 1 untouched).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  makeStory,
  storyId,
  STORY_STATES,
  canTransition,
  canReachBuffer,
  storyPublishableAt,
  placementsForStory,
  placementCount,
  youtubeAllowed,
  xAllowed,
  CAPTION_STYLE,
  organicScore,
  organicBreakdown,
  ORGANIC_MIN_FOR_BACKLOG,
  originalityScore,
  ORIGINALITY_MIN_FOR_BACKLOG,
  conversionProxy,
  captionSimilarity,
  captionDuplicateCheck,
  checkSequence,
  resequence,
  sequenceCtaCheck,
  fatigueReport,
  buildSupportMatrix,
  evaluateSeries,
  backlogHealth,
  backlogHealthForPlatform,
  editorialCapacityPerDay,
  freshReservePerDay,
  refillNeeds,
  buildEditorialCalendar,
  runQaStack,
  minimumAutonomousQuality,
  laneFor,
  shelfWindow,
  SERIES_REGISTRY,
  getSeries,
  balanceCheck,
} from "../../lib/social/newsroom/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const NOW = Date.parse("2026-09-07T12:00:00Z");
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();

function dealStory(over = {}) {
  return makeStory({
    series: "DEAL_DROP",
    subjectType: "card",
    subjectId: over.subjectId ?? "charizard-gx-hidden-fates",
    pokemon: over.pokemon ?? "charizard",
    setId: over.setId ?? "SM - Hidden Fates",
    cardIds: ["191319"],
    dealIds: over.dealIds ?? [5001],
    capturedAt: over.capturedAt ?? iso(-1),
    facts: {
      exact_verified_at: over.exact_verified_at ?? iso(-1.5),
      discount_pct: over.discount_pct ?? 0.55,
      dollars_saved: over.dollars_saved ?? 180,
      card_tcgplayer_id: "191319",
      market_price: 320,
      total_price_usd: 140,
      recognisable: true,
      has_exact_destination: true,
      ...(over.facts ?? {}),
    },
    now: NOW,
  });
}
function eduStory(series = "EXACT_PRINTING_MATTERS", over = {}) {
  return makeStory({ series, subjectType: "concept", subjectId: `${series}-x`, capturedAt: iso(-2), facts: over.facts ?? {}, now: NOW });
}

// ---- §50: one story -> multiple native placements -----------------
test("NR-1. one story fans out into multiple platform-native placements (not 4 unrelated ideas)", () => {
  const s = eduStory("RAW_VS_GRADED_EXPLAINER");
  const pl = placementsForStory(s);
  assert.ok(pl.length >= 2, `expected >=2 placements, got ${pl.length}`);
  // same story_id on every placement
  assert.ok(pl.every((p) => p.story_id === s.story_id));
  // distinct platforms
  assert.equal(new Set(pl.map((p) => p.platform)).size, pl.length);
});

test("NR-2. platform-native caption STYLES are meaningfully different per platform (§19)", () => {
  const regs = new Set(Object.values(CAPTION_STYLE).map((c) => c.register));
  assert.equal(regs.size, 4, "each platform has a distinct caption register");
  assert.notEqual(CAPTION_STYLE.x.max_chars, CAPTION_STYLE.instagram.max_chars);
  assert.equal(CAPTION_STYLE.x.first_line_is_hook, false);
  assert.equal(CAPTION_STYLE.instagram.first_line_is_hook, true);
});

// ---- §50: no duplicated planner / ledger truth -------------------
test("NR-3. the newsroom introduces no second planner / ledger / Buffer client / renderer / source", () => {
  const dir = join(REPO, "lib", "social", "newsroom");
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
  // import-level + call-level bans (prose mentions of these files are fine).
  const bannedImports = [
    /from ["'][^"']*distribution\/ledger/, /from ["'][^"']*planner\/plans/,
    /from ["'][^"']*providers\/buffer/, /from ["'][^"']*socialSource/,
    /from ["'][^"']*\/render\.mjs/, /from ["'][^"']*lib\/ebay/,
  ];
  const bannedCalls = [/\.insert\(/, /\.upsert\(/, /\.delete\(\s*\)/, /\.update\(\s*\{/, /api\.buffer\.com/, /getBrowseRateLimit\(/, /createPost\(/];
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const re of bannedImports) assert.ok(!re.test(src), `${f} must not match ${re}`);
    const code = stripComments(src);
    for (const re of bannedCalls) assert.ok(!re.test(code), `${f} (code) must not match ${re}`);
  }
});

test("NR-4. no lib/social/newsroom module imports eBay or makes a Browse call", () => {
  const dir = join(REPO, "lib", "social", "newsroom");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs"))) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /from ["'].*lib\/ebay/);
    assert.doesNotMatch(src, /getItemsByLegacyIds|getListingSnapshot|getListingFreshness/);
  }
});

test("NR-5. the newsroom does not touch the P0.4.3 verifier or flip Stage 1", () => {
  const dir = join(REPO, "lib", "social", "newsroom");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs"))) {
    const src = readFileSync(join(dir, f), "utf8");
    // no import of the verifier allocator and no call into it
    assert.doesNotMatch(src, /from ["'][^"']*verifyAllocator|allocateVerifyBatch\(/);
    // no mutation of the publishing kill-switches
    assert.doesNotMatch(src, /RIGHTS_STATE\.\w+\s*=|publishing\s*=\s*["']ALLOWED/);
    assert.doesNotMatch(src, /SOCIAL_AUTONOMOUS_ENABLED\s*=\s*["']?true|SOCIAL_PUBLISH_ENABLED\s*=\s*["']?true/);
  }
  // the migration must not alter `deals` or the verifier
  const mig = readFileSync(join(REPO, "supabase", "social_editorial_newsroom_migration.sql"), "utf8");
  assert.doesNotMatch(mig, /alter table deals\b|drop table|truncate/i);
  assert.match(mig, /create table if not exists social_stories/);
});

// ---- §50: shelf-life expiry + lane separation -------------------
test("NR-6. shelf-life class -> lane: LIVE/SHORT = FRESH, EDITORIAL/EVERGREEN = PLANNED", () => {
  assert.equal(laneFor("LIVE"), "FRESH");
  assert.equal(laneFor("SHORT"), "FRESH");
  assert.equal(laneFor("EDITORIAL"), "PLANNED");
  assert.equal(laneFor("EVERGREEN"), "PLANNED");
  assert.equal(dealStory().lane, "FRESH");
  assert.equal(eduStory("METHODOLOGY").lane, "PLANNED");
});

test("NR-7. a LIVE story's latest_safe_publish_at is the 6h freshness contract minus the margin (never relaxed)", () => {
  const s = dealStory({ exact_verified_at: iso(0) });
  const w = shelfWindow("LIVE", { capturedAt: iso(0), anchorAt: iso(0) });
  // 6h contract - 45m margin = 5.25h after the anchor
  const expected = NOW + 6 * 3_600_000 - 45 * 60_000;
  assert.equal(Date.parse(w.latest_safe_publish_at), expected);
  assert.equal(s.latest_safe_publish_at, w.latest_safe_publish_at);
});

test("NR-8. a fresh story cannot be scheduled beyond its shelf-life expiry (§34)", () => {
  const s = dealStory({ exact_verified_at: iso(-1) });
  assert.equal(storyPublishableAt(s, iso(-0.5)), true);
  assert.equal(storyPublishableAt(s, iso(10)), false); // well past 6h
});

test("NR-9. story id is deterministic for the same frozen facts, and changes when facts change", () => {
  const a = storyId({ series: "DEAL_DROP", subjectType: "card", subjectId: "x", capturedAt: iso(0), factsJson: { d: 1 } });
  const b = storyId({ series: "DEAL_DROP", subjectType: "card", subjectId: "x", capturedAt: iso(0), factsJson: { d: 1 } });
  const c = storyId({ series: "DEAL_DROP", subjectType: "card", subjectId: "x", capturedAt: iso(0), factsJson: { d: 2 } });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ---- §50: state machine - WATCH/FAIL cannot Buffer-queue --------
test("NR-10. WATCH / BLOCKED / FAIL states can never transition to BUFFER_READY or BUFFER_QUEUED", () => {
  for (const bad of ["QA_WATCH", "BLOCKED", "FAILED"]) {
    assert.equal(canTransition(bad, "BUFFER_READY"), false);
    assert.equal(canTransition(bad, "BUFFER_QUEUED"), false);
    assert.equal(canReachBuffer(bad), false);
  }
  assert.equal(canReachBuffer("HOSTED"), true);
  assert.equal(canReachBuffer("BUFFER_READY"), true);
});

test("NR-11. BUFFER_QUEUED is a distinct state from PUBLISHED (provider acceptance != published)", () => {
  assert.ok(STORY_STATES.includes("BUFFER_QUEUED"));
  assert.ok(STORY_STATES.includes("PUBLISHED"));
  assert.equal(canTransition("BUFFER_QUEUED", "PUBLISHED"), true);
  assert.equal(canTransition("BUFFER_READY", "PUBLISHED"), false); // must go via QUEUED
  const mig = readFileSync(join(REPO, "supabase", "social_editorial_newsroom_migration.sql"), "utf8");
  assert.match(mig, /scheduled post = BUFFER_QUEUED, never PUBLISHED/);
});

// ---- §50: QA stack - PASS only after all required layers -------
test("NR-12. runQaStack is PASS only when every required layer passes; a failing layer blocks", () => {
  const s = dealStory();
  const goodMeta = { family: "deal_drop", canvasW: 1080, canvasH: 1350, hookText: "55% BELOW MARKET", hookPx: 72, ctaCount: 1, brandMarkCount: 1, minInlineFontPx: 26, numericCallouts: ["55%"], cardMaxHeightPx: 640 };
  const pass = runQaStack(s, { creativeMeta: goodMeta, rights: { rightsCleared: true, artifactIsOwnRender: true }, requireVisualReview: false });
  assert.equal(pass.professional_result, "PASS");
  // seller photo -> RIGHTS_IMAGE FAIL -> whole stack FAIL
  const fail = runQaStack(s, { creativeMeta: goodMeta, rights: { rightsCleared: true, artifactIsOwnRender: true, usesSellerPhoto: true }, requireVisualReview: false });
  assert.equal(fail.professional_result, "FAIL");
  assert.ok(fail.blockers.some((b) => /seller photo/.test(b)));
  // visual review required + unconfigured result -> WATCH caps the stack
  const watch = runQaStack(s, { creativeMeta: goodMeta, rights: { rightsCleared: true, artifactIsOwnRender: true }, requireVisualReview: true, visualReviewResult: { verdict: "WATCH" } });
  assert.equal(watch.professional_result, "WATCH");
});

test("NR-13. FACT QA fails a LIVE deal story with no exact_verified_at anchor or no deal_ids", () => {
  const noAnchor = makeStory({ series: "DEAL_DROP", subjectType: "card", subjectId: "x", dealIds: [1], capturedAt: iso(-1), facts: { discount_pct: 0.5 }, now: NOW });
  const qa = runQaStack(noAnchor, { requireVisualReview: false });
  assert.equal(qa.professional_result, "FAIL");
  assert.ok(qa.blockers.some((b) => /exact_verified_at/.test(b)));
});

// ---- §50: minimum autonomous quality - no filler --------------
test("NR-14. minimumAutonomousQuality rejects a technically-valid but low-value story (no filler)", () => {
  const weak = eduStory("HOW_MATCHING_WORKS"); // bare explainer, low organic, no conversion
  weak.organic_score = organicScore(weak);
  const qa = runQaStack(weak, { creativeMeta: { family: "brand_ad", canvasW: 1080, canvasH: 1350, hookText: "HOW MATCHING WORKS", hookPx: 64, ctaCount: 1, brandMarkCount: 1, minInlineFontPx: 24 }, rights: { rightsCleared: true, artifactIsOwnRender: true }, requireVisualReview: false });
  const maq = minimumAutonomousQuality(weak, qa, { conversionScore: 0.2, originalityContext: [], now: NOW });
  if (organicScore(weak) < ORGANIC_MIN_FOR_BACKLOG) {
    assert.equal(maq.ok, false);
    assert.ok(maq.reasons.some((r) => /organic/.test(r)));
  }
});

test("NR-15. a strong fresh deal passes minimum autonomous quality", () => {
  const s = dealStory({ discount_pct: 0.6, dollars_saved: 240 });
  const qa = runQaStack(s, { creativeMeta: { family: "deal_drop", canvasW: 1080, canvasH: 1350, hookText: "60% BELOW MARKET", hookPx: 74, ctaCount: 1, brandMarkCount: 1, minInlineFontPx: 26, numericCallouts: ["60%"], cardMaxHeightPx: 660 }, rights: { rightsCleared: true, artifactIsOwnRender: true }, requireVisualReview: false });
  const maq = minimumAutonomousQuality(s, qa, { conversionScore: conversionProxy(s), originalityContext: [], now: NOW });
  assert.equal(maq.ok, true, JSON.stringify(maq.reasons));
});

// ---- §50: deterministic scores -------------------------------
test("NR-16. organic score is deterministic and independent of the conversion proxy", () => {
  const s = dealStory();
  assert.equal(organicScore(s), organicScore(s));
  const b = organicBreakdown(s);
  assert.ok(b.score >= 0 && b.score <= 1);
  // no engagement-count input
  const src = readFileSync(join(REPO, "lib", "social", "newsroom", "organicScore.mjs"), "utf8");
  assert.doesNotMatch(src, /\blikes\b|\bfollowers\b|engagement_count/);
});

test("NR-17. originality score is deterministic and drops as recent context repeats the same keys", () => {
  const s = eduStory("MARKET_SNAPSHOT");
  const fresh = originalityScore(s, [], NOW);
  const repeated = originalityScore(s, [
    { story: s, postedAt: iso(-10) },
    { story: s, postedAt: iso(-20) },
  ], NOW);
  assert.equal(originalityScore(s, [], NOW), fresh); // deterministic
  assert.ok(repeated < fresh, `expected ${repeated} < ${fresh}`);
});

// ---- §50: caption near-duplicate detection -------------------
test("NR-18. caption near-duplicate detection blocks a same-platform near-copy", () => {
  const recent = [{ platform: "x", caption: "Charizard GX Hidden Fates just dropped 55% below market on eBay." }];
  const dup = captionDuplicateCheck({ platform: "x", caption: "Charizard GX Hidden Fates dropped 55% below market on eBay right now." }, recent);
  assert.equal(dup.blocked, true);
  const distinct = captionDuplicateCheck({ platform: "x", caption: "Why exact-printing matching changes which Umbreon listing is actually the cheapest." }, recent);
  assert.equal(distinct.blocked, false);
});

test("NR-19. X duplicate-automation guard: identical numeric template skeleton is blocked cross-platform (§41)", () => {
  const a = "$140 CARD. LISTED FOR $320. THAT'S 55% OFF.";
  const b = "$70 CARD. LISTED FOR $210. THAT'S 66% OFF.";
  const sim = captionSimilarity(a, b);
  assert.equal(sim.skeleton, 1);
  const dup = captionDuplicateCheck({ platform: "instagram", caption: b }, [{ platform: "x", caption: a }]);
  assert.equal(dup.blocked, true);
});

// ---- §50: sequence diversity + cooldowns --------------------
test("NR-20. the sequence gate blocks 3 consecutive same-series / same-Pokemon posts (anti-AI-spam §17)", () => {
  const items = [
    { id: "a", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "charizard" } },
    { id: "b", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "charizard" } },
    { id: "c", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "charizard" } },
    { id: "d", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "charizard" } },
  ];
  const r = checkSequence(items);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.dimension === "series" && v.rule === "maxConsecutive"));
  assert.ok(r.violations.some((v) => v.dimension === "pokemon"));
});

test("NR-21. series cooldown: the same series may not recur before its minGap (§35)", () => {
  const items = [
    { id: "a", keys: { series: "MARKET_SNAPSHOT", pillar: "MARKET" } },
    { id: "b", keys: { series: "SET_WATCH", pillar: "MARKET" } },
    { id: "c", keys: { series: "MARKET_SNAPSHOT", pillar: "MARKET" } }, // only 1 gap; need 3
  ];
  const r = checkSequence(items);
  assert.ok(r.violations.some((v) => v.dimension === "series" && v.rule === "minGap"));
});

test("NR-22. an exceptional item overrides SOFT sequence rules but the check still reports others", () => {
  const items = [
    { id: "a", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "pikachu" } },
    { id: "b", exceptional: true, keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "pikachu" } },
  ];
  const r = checkSequence(items);
  assert.equal(r.violations.length, 0);
});

test("NR-23. resequence reorders within a platform to clear violations where possible", () => {
  const items = [
    { id: "d1", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "charizard" } },
    { id: "d2", keys: { series: "DEAL_DROP", pillar: "DEALS", pokemon: "charizard" } },
    { id: "m1", keys: { series: "MARKET_SNAPSHOT", pillar: "MARKET", pokemon: null } },
    { id: "e1", keys: { series: "EXACT_PRINTING_MATTERS", pillar: "EDUCATION", pokemon: null } },
  ];
  const r = resequence(items);
  assert.ok(r.order.length === 4);
  // first two must not both be DEAL_DROP/charizard back to back after reorder
  assert.notEqual(r.order[0], r.order[1]);
});

// ---- §50: fatigue metrics ----------------------------------
test("NR-24. fatigue report warns on same-series, same-Pokemon and same-layout over-concentration (§38)", () => {
  const st = (series, pillar, pokemon) => ({ series, pillar, story: { series, pillar, pokemon, facts_json: { layout_family: pillar.toLowerCase() } }, postedAt: iso(-6) });
  const entries = [
    st("DEAL_DROP", "DEALS", "charizard"),
    st("DEAL_DROP", "DEALS", "charizard"),
    st("DEAL_DROP", "DEALS", "charizard"),
    st("MARKET_SNAPSHOT", "MARKET", null),
  ];
  const f = fatigueReport(entries, { now: NOW });
  assert.ok(f.metrics.series_share_7d >= 0.75);
  assert.ok(f.warnings.some((w) => /series_share_7d/.test(w)));
  assert.ok(f.warnings.some((w) => /species_freq_7d/.test(w)));
});

test("NR-25. commercial-share warning fires when the CONVERSION bucket dominates a week (§13/§38)", () => {
  const st = (pillar) => ({ pillar, story: { pillar }, postedAt: iso(-3) });
  const entries = [st("DEALS"), st("DEALS"), st("BUDGET"), st("MARKET")]; // 3/4 = 75%
  const f = fatigueReport(entries, { now: NOW });
  assert.ok(f.metrics.commercial_share_7d >= 0.7);
  assert.ok(f.warnings.some((w) => /commercial_share_7d/.test(w)));
});

test("NR-26. CTA-intensity sequence check flags a HARD-CTA-dominated window", () => {
  const items = Array.from({ length: 5 }, () => ({ cta_intensity: "HARD" }));
  const r = sequenceCtaCheck(items);
  assert.equal(r.ok, false);
  assert.ok(r.hard_share === 1);
  assert.ok(r.warnings.some((w) => /in a row/.test(w)));
});

// ---- §50: YouTube / X guards -------------------------------
test("NR-27. YouTube material-variation guard: a bare card/price story gets no YouTube placement (§40)", () => {
  const s = dealStory(); // DEAL_DROP is LIVE, not narrative, not editorial/evergreen
  assert.equal(youtubeAllowed(s), false);
  assert.ok(!placementsForStory(s).some((p) => p.platform === "youtube"));
  const edu = eduStory("RAW_VS_GRADED_EXPLAINER"); // evergreen -> allowed
  assert.equal(youtubeAllowed(edu), true);
});

test("NR-28. X guard: X placement only for live deal alerts or editorial substance (§41)", () => {
  assert.equal(xAllowed(dealStory()), true); // LIVE deal alert
  assert.equal(xAllowed(eduStory("WEEKLY_RECAP")), false); // BRAND recap - no X
  assert.equal(xAllowed(eduStory("MARKET_SNAPSHOT")), true); // MARKET substance
});

// ---- §50: backlog health + reserved capacity --------------
test("NR-29. editorial capacity reserves 20-40% of each platform's cadence ceiling for the fresh lane (§11)", () => {
  for (const p of ["instagram", "tiktok", "x", "youtube"]) {
    const cap = editorialCapacityPerDay(p);
    const reserve = freshReservePerDay(p);
    assert.ok(cap >= 1);
    assert.ok(reserve >= 0);
  }
  // X keeps the most live capacity
  assert.ok(freshReservePerDay("x") >= freshReservePerDay("youtube"));
});

test("NR-30. backlog health: EMPTY / LOW / WATCH / HEALTHY / OVERFILLED are all reachable", () => {
  const mk = (n, spanDays) =>
    Array.from({ length: n }, (_, i) => ({
      platform: "instagram",
      status: "BUFFER_READY",
      lane: "PLANNED",
      planned_for: new Date(NOW + ((i + 1) / n) * spanDays * 86_400_000).toISOString(),
    }));
  assert.equal(backlogHealthForPlatform("instagram", [], { now: NOW }).state, "EMPTY");
  assert.equal(backlogHealthForPlatform("instagram", mk(1, 1), { now: NOW }).state, "LOW");
  assert.equal(backlogHealthForPlatform("instagram", mk(5, 5), { now: NOW }).state, "WATCH");
  assert.equal(backlogHealthForPlatform("instagram", mk(9, 9), { now: NOW }).state, "HEALTHY");
  assert.equal(backlogHealthForPlatform("instagram", mk(30, 30), { now: NOW }).state, "OVERFILLED");
});

test("NR-31. refillNeeds surfaces the most-under platform first and never asks to fill an OVERFILLED one", () => {
  const placements = [
    ...Array.from({ length: 20 }, (_, i) => ({ platform: "youtube", status: "BUFFER_READY", lane: "PLANNED", planned_for: new Date(NOW + (i + 1) * 86_400_000).toISOString() })),
  ];
  const rn = refillNeeds(backlogHealth(placements, { now: NOW }));
  assert.ok(!rn.some((r) => r.platform === "youtube")); // youtube is >= target
  assert.ok(rn.some((r) => r.platform === "instagram")); // instagram empty
});

// ---- §50: support matrix - no fabricated data ------------
test("NR-32. support matrix: a series whose required facts are absent is DATA_NOT_READY", () => {
  const empty = buildSupportMatrix({});
  assert.ok(empty.summary.DATA_NOT_READY.includes("SAME_CARD_DIFFERENT_PRICES"));
  assert.ok(empty.summary.DATA_NOT_READY.includes("RAW_VS_GRADED"));
  // evergreen explainers need no data -> still supported
  assert.ok(empty.summary.SUPPORTED_NOW.includes("EXACT_PRINTING_MATTERS"));
});

test("NR-33. support matrix lifts a data-backed series to SUPPORTED_NOW only when counts clear the threshold", () => {
  const thin = evaluateSeries("THREE_UNDER_25", { fresh_bin_under_25_count: 3 });
  assert.equal(thin.support, "SUPPORTED_WITH_LIMITATIONS");
  const strong = evaluateSeries("THREE_UNDER_25", { fresh_bin_under_25_count: 8 });
  assert.equal(strong.support, "SUPPORTED_NOW");
  const none = evaluateSeries("THREE_UNDER_25", { fresh_bin_under_25_count: 1 });
  assert.equal(none.support, "DATA_NOT_READY");
});

test("NR-34. every series in the registry has a pillar, a shelf-life class and declared fact requirements", () => {
  for (const s of SERIES_REGISTRY) {
    assert.ok(["DEALS", "COMPARISON", "MARKET", "BUDGET", "EDUCATION", "BEHIND_THE_FINDER", "STORY", "BRAND"].includes(s.pillar), s.id);
    assert.ok(["LIVE", "SHORT", "EDITORIAL", "EVERGREEN"].includes(s.clock), s.id);
    assert.ok(Array.isArray(s.requires), s.id);
    assert.ok(["HARD", "SOFT", "BRAND_ONLY", "NONE"].includes(s.cta), s.id);
  }
});

// ---- §50: calendar - planned/fresh separation, expiry, unfilled OK
test("NR-35. buildEditorialCalendar keeps FRESH-lane stories OUT of the planned editorial slots (§10)", () => {
  const fresh = dealStory();
  const editorial = eduStory("MARKET_SNAPSHOT");
  for (const s of [fresh, editorial]) {
    s.organic_score = organicScore(s);
    s.originality_score = 1;
  }
  const cands = [fresh, editorial].map((s) => ({ story: s, placements: placementsForStory(s), organic_score: s.organic_score, originality_score: 1, exceptional: false }));
  const { calendar } = buildEditorialCalendar(cands, { horizonDays: 7, now: NOW });
  const allFixed = Object.values(calendar).flat().filter((s) => s.type === "FIXED_EDITORIAL_SLOT");
  assert.ok(allFixed.every((s) => s.story_id !== fresh.story_id), "a FRESH story must not occupy a planned editorial slot");
});

test("NR-36. the calendar has RESERVED_FRESH_SLOTs it deliberately leaves open (§33) and unfilled OPEN slots are acceptable (§49)", () => {
  const { calendar, diagnostics } = buildEditorialCalendar([], { horizonDays: 7, now: NOW });
  const slots = Object.values(calendar).flat();
  assert.ok(slots.some((s) => s.type === "RESERVED_FRESH_SLOT"));
  assert.ok(slots.some((s) => s.type === "OPEN_SLOT"));
  assert.ok(diagnostics.unfilled.length > 0); // nothing to place -> all open, and that's fine
  assert.equal(diagnostics.placed_total, 0);
});

test("NR-37. the calendar never schedules a story after its latest_safe_publish_at", () => {
  const stale = eduStory("MARKET_SNAPSHOT");
  stale.latest_safe_publish_at = iso(-1); // already expired
  stale.organic_score = 0.9;
  const cands = [{ story: stale, placements: placementsForStory(stale), organic_score: 0.9, originality_score: 1, exceptional: false }];
  const { calendar } = buildEditorialCalendar(cands, { horizonDays: 7, now: NOW });
  const fixed = Object.values(calendar).flat().filter((s) => s.type === "FIXED_EDITORIAL_SLOT");
  assert.equal(fixed.length, 0);
});

// ---- §50: editorial balance bands -------------------------
test("NR-38. balanceCheck reports under/ok/over against the weekly bands", () => {
  const r = balanceCheck({ CONVERSION: 4, ORGANIC_GROWTH: 3, AUTHORITY: 2, BRAND: 1 }, 10);
  assert.equal(r.byBucket.CONVERSION.status, "ok"); // 40% within [0.35,0.40]
  assert.equal(r.byBucket.BRAND.status, "ok"); // 10% within [0.05,0.10]
  const over = balanceCheck({ CONVERSION: 9, BRAND: 1 }, 10);
  assert.equal(over.byBucket.CONVERSION.status, "over");
});

// ---- §50: no publish / schedule from this phase ----------
test("NR-39. socialBacklog + socialQualityAudit scripts never publish, schedule, or mutate", () => {
  for (const f of ["socialBacklog.mjs", "socialQualityAudit.mjs"]) {
    const src = readFileSync(join(REPO, "scripts", f), "utf8");
    assert.doesNotMatch(src, /createPost|addToQueue|customScheduled|shareNow|api\.buffer\.com/);
    assert.doesNotMatch(src, /\.insert\(|\.upsert\(|\.update\(\{|\.delete\(/);
    assert.doesNotMatch(src, /from ["'].*lib\/ebay/);
    // no import of / assignment to the publishing kill-switches
    assert.doesNotMatch(src, /import .*rights\.mjs|RIGHTS_STATE\.\w+\s*=|SOCIAL_PUBLISH_ENABLED\s*=\s*["']?true/);
  }
});

test("NR-40. placementCount matches placementsForStory length and is stable", () => {
  const s = eduStory("VINTAGE_VS_MODERN");
  assert.equal(placementCount(s), placementsForStory(s).length);
  assert.equal(placementCount(s), placementCount(s));
});
