// Phase 13E.8A - MULTI-PLATFORM CONTENT PLANNER + CADENCE ENGINE.
//
// Pins the deterministic planning layer:
//   * family<->goal matrix + platform roles + cadence ceilings are fixed;
//   * scoring is deterministic and a stronger deal outranks a weaker one;
//   * exact-print cooldown is HARD; species / set are SOFT penalties; an
//     exceptional deal overrides the soft penalty;
//   * quality tiers classify (S/A/B/NOT_SOCIAL); NOT_SOCIAL != bad site deal;
//   * latest_safe_publish_at is derived from exact_verified_at + the
//     freshness contract - margin; a stale deal cannot be planned; a
//     Market Mover has a longer shelf life;
//   * no artificial slot filling; no-content returns cleanly;
//   * minimum per-platform spacing; cross-platform reuse allowed;
//     same-platform duplicate blocked;
//   * the planner calls no Buffer, no eBay, does not render, does not
//     mutate the publishing ledger.
// No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FAMILY_GOALS, isValidCombo, defaultGoalFor, validCombos } from "../../lib/social/planner/families.mjs";
import {
  PLATFORM_ROLES,
  CADENCE_CEILING_PER_DAY,
  MIN_SPACING_MINUTES,
  POSTING_WINDOWS_UTC_HOURS,
  serviceOf,
} from "../../lib/social/planner/platformRoles.mjs";
import { WEEKLY_GOAL_MIX, WEEKLY_FAMILY_MIX, goalMixCheck } from "../../lib/social/planner/contentMix.mjs";
import { scoreCandidate, scoreBreakdown, SCORE_WEIGHTS } from "../../lib/social/planner/scoring.mjs";
import {
  hardGuard,
  applyDiversity,
  diversityPenalty,
  EXCEPTIONAL_OVERRIDE_SCORE,
  REPETITION_WINDOWS_HOURS,
} from "../../lib/social/planner/diversity.mjs";
import { qualityTier, TIER_RANK } from "../../lib/social/planner/tiers.mjs";
import { latestSafePublishAt, isPlannableAt, PUBLISH_SAFETY_MARGIN_MINUTES, MOVER_SHELF_LIFE_HOURS } from "../../lib/social/planner/freshness.mjs";
import { choosePlacements } from "../../lib/social/planner/placements.mjs";
import { buildPlan } from "../../lib/social/planner/planner.mjs";
import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../../lib/social/eligibility.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const NOW = Date.parse("2026-09-07T00:00:00.000Z");
const freshISO = (hAgo) => new Date(NOW - hAgo * 3_600_000).toISOString();

// a strong, fresh, recognizable deal-drop candidate
function strongDeal(over = {}) {
  return {
    family: "deal_drop",
    goal: "CONVERSION",
    deal_id: 1001,
    card_name: "Charizard",
    card_set: "Base Set",
    species: "charizard",
    card_tcgplayer_id: "12345",
    is_graded: false,
    discount_pct: 0.62,
    market_price: 480,
    total_price_usd: 182,
    exact_verified_at: freshISO(1),
    freshness_state: "FRESH",
    content_id: "pdf-deal-drop-strong",
    ...over,
  };
}
// a weaker but valid deal-drop candidate (same shape, worse numbers)
function weakDeal(over = {}) {
  return {
    ...strongDeal(),
    deal_id: 1002,
    card_name: "Bidoof",
    species: "bidoof",
    card_set: "Diamond & Pearl",
    discount_pct: 0.18,
    market_price: 12,
    total_price_usd: 9.8,
    content_id: "pdf-deal-drop-weak",
    ...over,
  };
}
function mover(over = {}) {
  return {
    family: "market_mover",
    goal: "ENGAGEMENT",
    deal_id: 2001,
    card_name: "Umbreon",
    card_set: "Evolving Skies",
    species: "umbreon",
    card_tcgplayer_id: "67890",
    discount_pct: 0.2,
    market_price: 300,
    total_price_usd: 240,
    exact_verified_at: freshISO(2),
    freshness_state: "MARKET_DATA",
    movement: { pct: 0.31, direction: "up", windowLabel: "90 days", confidence: "high" },
    confidence: "high",
    content_id: "pdf-market-mover-x",
    ...over,
  };
}

// ---- §1 family <-> goal matrix -------------------------------

test("13E.8A-1. family<->goal combinations are deterministic and match creativeSpec goals", () => {
  assert.deepEqual(Object.keys(FAMILY_GOALS).sort(), ["brand_ad", "deal_drop", "hook_carousel", "market_mover"]);
  assert.equal(defaultGoalFor("deal_drop"), "CONVERSION");
  assert.equal(defaultGoalFor("market_mover"), "ENGAGEMENT");
  assert.equal(defaultGoalFor("hook_carousel"), "REACH");
  assert.equal(defaultGoalFor("brand_ad"), "BRAND");
  assert.ok(isValidCombo("deal_drop", "REACH"));
  assert.ok(!isValidCombo("deal_drop", "TRUST"));
  assert.ok(!isValidCombo("market_mover", "BRAND"));
  // every combo listed is a real goal
  for (const { goal } of validCombos()) assert.ok(["REACH", "ENGAGEMENT", "TRUST", "CONVERSION", "BRAND"].includes(goal));
});

// ---- §2 / §3 platform roles + cadence -----------------------

test("13E.8A-2. platform roles are distinct and not every family goes to every platform", () => {
  assert.deepEqual(PLATFORM_ROLES.x.families, ["deal_drop", "market_mover"]); // no carousel on X
  assert.ok(!PLATFORM_ROLES.x.families.includes("hook_carousel"));
  assert.ok(!PLATFORM_ROLES.youtube.families.includes("hook_carousel"));
  assert.ok(PLATFORM_ROLES.instagram.families.includes("hook_carousel"));
  assert.equal(serviceOf("instagram_reel"), "instagram");
  assert.equal(serviceOf("x_post"), "x");
});

test("13E.8A-3. cadence ceilings are conservative planning ceilings, not quotas", () => {
  assert.deepEqual(CADENCE_CEILING_PER_DAY, { instagram: 2, tiktok: 2, x: 4, youtube: 1 });
  // the number of posting windows never exceeds the ceiling for a service
  for (const [svc, hours] of Object.entries(POSTING_WINDOWS_UTC_HOURS)) {
    assert.ok(hours.length <= CADENCE_CEILING_PER_DAY[svc], `${svc} has more windows than its ceiling`);
  }
});

// ---- §4 content mix ---------------------------------------

test("13E.8A-4. weekly mix is expressed as ranges and Deal Drops lead without dominating", () => {
  for (const v of Object.values(WEEKLY_GOAL_MIX)) {
    assert.ok(Array.isArray(v) && v.length === 2 && v[0] < v[1] && v[1] <= 1);
  }
  // conversion (deal drops) is the biggest single share but < 50%
  assert.ok(WEEKLY_GOAL_MIX.CONVERSION[1] < 0.5);
  assert.ok(WEEKLY_FAMILY_MIX.deal_drop[0] >= 0.3);
  const chk = goalMixCheck({ CONVERSION: 4, ENGAGEMENT: 3, REACH: 2, TRUST: 1 }, 10);
  assert.equal(chk.byKey.CONVERSION.status, "ok");
});

// ---- §5 deterministic scoring ---------------------------

test("13E.8A-5. scoring is deterministic and weights sum to 1", () => {
  const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
  const a = scoreCandidate(strongDeal(), { now: NOW, roles: PLATFORM_ROLES });
  const b = scoreCandidate(strongDeal(), { now: NOW, roles: PLATFORM_ROLES });
  assert.equal(a, b);
  assert.ok(a > 0 && a <= 1);
});

test("13E.8A-6. a stronger deal ranks above an otherwise-equivalent weaker deal", () => {
  const strong = scoreCandidate(strongDeal(), { now: NOW, roles: PLATFORM_ROLES });
  const weak = scoreCandidate(weakDeal(), { now: NOW, roles: PLATFORM_ROLES });
  assert.ok(strong > weak, `strong ${strong} should beat weak ${weak}`);
  // and the breakdown explains why
  const bd = scoreBreakdown(strongDeal(), { now: NOW, roles: PLATFORM_ROLES });
  assert.ok(bd.weighted.discount_strength > bd.weighted.performance);
});

test("13E.8A-7. §18 performance hook shifts SCORE only, default is neutral", () => {
  const neutral = scoreCandidate(strongDeal(), { now: NOW, roles: PLATFORM_ROLES });
  const boosted = scoreCandidate(strongDeal({ perf: { score: 1 } }), { now: NOW, roles: PLATFORM_ROLES });
  const hurt = scoreCandidate(strongDeal({ perf: { score: -1 } }), { now: NOW, roles: PLATFORM_ROLES });
  assert.ok(boosted > neutral && neutral > hurt);
  // and it can never flip a NOT_SOCIAL classification (tiers don't read perf)
  assert.equal(qualityTier(strongDeal({ perf: { score: 1 }, card_tcgplayer_id: "" })), "NOT_SOCIAL");
});

// ---- §6 / §7 diversity ----------------------------------

test("13E.8A-8. exact-deal cooldown is HARD (never overridable)", () => {
  const cand = strongDeal();
  const history = [{ key: "deal:1001", postedAt: freshISO(200), contentType: "deal_of_day" }];
  const g = hardGuard(cand, history, NOW);
  assert.equal(g.blocked, true);
  assert.match(g.reason, /already been posted/);
});

test("13E.8A-9. same canonical card within 14d is a HARD block", () => {
  const cand = strongDeal();
  const recent = [{ key: "card:Charizard|Base Set", postedAt: freshISO(24 * 5), contentType: "deal_of_day" }];
  assert.equal(hardGuard(cand, recent, NOW).blocked, true);
  const old = [{ key: "card:Charizard|Base Set", postedAt: freshISO(24 * 20), contentType: "deal_of_day" }];
  assert.equal(hardGuard(cand, old, NOW).blocked, false);
});

test("13E.8A-10. species / set repetition are SOFT penalties on the score", () => {
  const cand = strongDeal();
  const hist = [
    { key: "species:charizard", postedAt: freshISO(24), contentType: "deal_of_day" },
    { key: "set:Base Set", postedAt: freshISO(24), contentType: "deal_of_day" },
  ];
  const pen = diversityPenalty(cand, hist, NOW);
  assert.ok(pen.byDimension.species.penalty > 0);
  assert.ok(pen.byDimension.set.penalty > 0);
  // it lowers, never blocks
  const applied = applyDiversity(cand, 0.6, hist, NOW);
  assert.ok(applied.adjusted < 0.6 && applied.adjusted > 0);
});

test("13E.8A-11. an EXCEPTIONAL deal overrides the SOFT diversity penalty (but not the hard guard)", () => {
  const cand = strongDeal();
  const hist = [{ key: "species:charizard", postedAt: freshISO(12), contentType: "deal_of_day" }];
  const low = applyDiversity(cand, 0.6, hist, NOW);
  assert.equal(low.overridden, false);
  const high = applyDiversity(cand, EXCEPTIONAL_OVERRIDE_SCORE + 0.01, hist, NOW);
  assert.equal(high.overridden, true);
  assert.equal(high.penaltyApplied, 0);
  // the hard guard is still enforced regardless of score
  assert.equal(hardGuard(cand, [{ key: "deal:1001", postedAt: freshISO(1), contentType: "x" }], NOW).blocked, true);
});

test("13E.8A-12. repetition windows are reasonable + mirror the existing cooldown windows", () => {
  assert.equal(REPETITION_WINDOWS_HOURS.exact_deal, Infinity);
  assert.equal(REPETITION_WINDOWS_HOURS.card, 14 * 24);
  assert.equal(REPETITION_WINDOWS_HOURS.species, 3 * 24);
  assert.equal(REPETITION_WINDOWS_HOURS.set, 7 * 24);
  assert.ok(REPETITION_WINDOWS_HOURS.family < 24);
});

// ---- §8 quality tiers -----------------------------------

test("13E.8A-13. quality tiers classify deterministically; NOT_SOCIAL is creative-suitability only", () => {
  assert.equal(qualityTier(strongDeal()), "S_TIER");
  assert.equal(qualityTier(weakDeal({ card_tcgplayer_id: "999", discount_pct: 0.35, species: "eevee", market_price: 200, total_price_usd: 120 })), "A_TIER");
  assert.equal(qualityTier(weakDeal({ card_tcgplayer_id: "999", discount_pct: 0.22 })), "B_TIER");
  // NOT_SOCIAL: a real site deal with no canonical art / too-shallow discount
  assert.equal(qualityTier(strongDeal({ card_tcgplayer_id: "" })), "NOT_SOCIAL");
  assert.equal(qualityTier(strongDeal({ discount_pct: 0.1 })), "NOT_SOCIAL");
  assert.deepEqual([TIER_RANK.S_TIER, TIER_RANK.A_TIER, TIER_RANK.B_TIER, TIER_RANK.NOT_SOCIAL], [3, 2, 1, 0]);
});

// ---- §9 market mover quality ----------------------------

test("13E.8A-14. a low-confidence Market Mover is NOT_SOCIAL (fail closed)", () => {
  assert.equal(qualityTier(mover({ confidence: "low", movement: { pct: 0.31, direction: "up", windowLabel: "90 days", confidence: "low" } })), "NOT_SOCIAL");
  assert.equal(qualityTier(mover()), "A_TIER");
});

// ---- §15 freshness vs scheduling ------------------------

test("13E.8A-15. latest_safe_publish_at = exact_verified_at + freshness contract - margin", () => {
  const cand = strongDeal({ exact_verified_at: "2026-09-07T00:00:00.000Z" });
  const { at } = latestSafePublishAt(cand, { now: NOW });
  const expected = Date.parse("2026-09-07T00:00:00.000Z") + SOCIAL_FRESHNESS_MAX_AGE_HOURS * 3_600_000 - PUBLISH_SAFETY_MARGIN_MINUTES * 60_000;
  assert.equal(Date.parse(at), expected);
});

test("13E.8A-16. a stale deal cannot be planned; a Market Mover has a longer shelf life", () => {
  const stale = strongDeal({ exact_verified_at: freshISO(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 2) });
  assert.equal(isPlannableAt(stale, new Date(NOW + 3_600_000).toISOString(), { now: NOW }), false);
  const mv = mover();
  const mvSafe = latestSafePublishAt(mv, { now: NOW });
  assert.equal(Date.parse(mvSafe.at), NOW + MOVER_SHELF_LIFE_HOURS * 3_600_000);
  assert.equal(isPlannableAt(mv, new Date(NOW + 24 * 3_600_000).toISOString(), { now: NOW }), true);
});

// ---- §12 placements ------------------------------------

test("13E.8A-17. placement selection is deliberate and only proposes eligible placements", () => {
  assert.deepEqual(choosePlacements({ ...strongDeal(), quality_tier: "S_TIER" }).map((p) => p.platform).sort(), ["instagram_reel", "tiktok", "x_post", "youtube_short"]);
  assert.deepEqual(choosePlacements({ ...strongDeal(), quality_tier: "A_TIER" }).map((p) => p.platform).sort(), ["instagram_reel", "x_post", "youtube_short"]);
  assert.deepEqual(choosePlacements({ ...weakDeal(), quality_tier: "B_TIER" }).map((p) => p.platform), ["x_post"]);
  assert.deepEqual(choosePlacements({ family: "hook_carousel", quality_tier: "A_TIER", item_count: 5 }).map((p) => p.platform), ["instagram_carousel"]);
  assert.deepEqual(choosePlacements({ ...strongDeal(), quality_tier: "NOT_SOCIAL" }), []);
});

// ---- planner end-to-end -------------------------------

const FRESH_SNAP = {
  source: "test-fixture",
  captured_at: "2026-09-07T00:00:00.000Z",
  deals: [
    { label: "s", row: { id: 1, card_name: "Charizard ex", card_set: "Obsidian Flames", card_tcgplayer_id: "111", discount_pct: 0.55, market_price: 500, total_price_usd: 210, exact_verified_at: "2026-09-06T23:30:00.000Z" }, freshness_state: "FRESH" },
    { label: "a", row: { id: 2, card_name: "Gengar", card_set: "Fusion Strike", card_tcgplayer_id: "222", discount_pct: 0.34, market_price: 120, total_price_usd: 79, exact_verified_at: "2026-09-06T23:40:00.000Z" }, freshness_state: "FRESH" },
    { label: "b", row: { id: 3, card_name: "Bidoof", card_set: "Brilliant Stars", card_tcgplayer_id: "333", discount_pct: 0.19, market_price: 10, total_price_usd: 8, exact_verified_at: "2026-09-06T23:45:00.000Z" }, freshness_state: "FRESH" },
  ],
  movers: [
    { label: "m", row: { id: 9, card_name: "Umbreon VMAX", card_set: "Evolving Skies", card_tcgplayer_id: "999", discount_pct: 0.2, market_price: 300, total_price_usd: 240 }, movement: { pct: 0.3, direction: "up", windowLabel: "90 days", confidence: "high" } },
  ],
  carousel: null,
};

test("13E.8A-18. cross-platform reuse of one content item is allowed; same-platform duplicate is blocked", () => {
  const plan = buildPlan({ snapshot: FRESH_SNAP, history: [], horizon: "week", now: NOW });
  const byContent = {};
  for (const e of plan.entries) (byContent[e.content_id] ??= []).push(e.platform);
  // the S-tier deal reaches multiple platforms
  const multi = Object.values(byContent).find((ps) => ps.length > 1);
  assert.ok(multi, "expected at least one content item on multiple platforms");
  // never the same (content_id, platform) twice
  for (const [cid, ps] of Object.entries(byContent)) {
    assert.equal(new Set(ps).size, ps.length, `${cid} was scheduled twice on the same platform`);
  }
});

test("13E.8A-19. minimum per-platform spacing is enforced", () => {
  const plan = buildPlan({ snapshot: FRESH_SNAP, history: [], horizon: "week", now: NOW });
  const byService = {};
  for (const e of plan.entries) (byService[e.service] ??= []).push(Date.parse(e.time_utc));
  for (const [svc, times] of Object.entries(byService)) {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] - times[i - 1] >= MIN_SPACING_MINUTES[svc] * 60_000, `${svc} placements too close`);
    }
  }
});

test("13E.8A-20. NO artificial slot filling - a thin snapshot leaves slots UNFILLED, never padded", () => {
  const thin = { source: "t", captured_at: "2026-09-07T00:00:00.000Z", deals: [FRESH_SNAP.deals[0]], movers: [], carousel: null };
  const plan = buildPlan({ snapshot: thin, history: [], horizon: "week", now: NOW });
  assert.ok(plan.unfilled.length > 0, "expected unfilled slots to be reported, not padded");
  // the only deal content in the plan traces to the ONE real deal (a
  // heavily-capped brand_ad may also appear - that is not padding)
  const dealContent = new Set(plan.entries.filter((e) => e.family === "deal_drop").map((e) => e.content_id));
  assert.equal(dealContent.size, 1);
  const brandCount = plan.entries.filter((e) => e.family === "brand_ad").length;
  assert.ok(brandCount <= 2, "brand_ad must stay within its weekly ceiling");
  // no fabricated deal / mover / carousel content beyond the single real deal
  assert.equal(plan.entries.filter((e) => e.family === "market_mover" || e.family === "hook_carousel").length, 0);
});

test("13E.8A-21. no eligible content -> a clean run, NO placeholder / fixture / brand filler", () => {
  const emptySnap = { source: "t", empty: true, empty_reason: "0 eligible" };
  const p1 = buildPlan({ snapshot: emptySnap, history: [], horizon: "today", now: NOW });
  assert.equal(p1.empty, true);
  assert.equal(p1.entries.length, 0);

  // a snapshot with only NOT_SOCIAL candidates also yields zero entries cleanly
  const junk = { source: "t", captured_at: "2026-09-07T00:00:00.000Z", deals: [{ label: "j", row: { id: 5, card_name: "Bidoof", card_set: "X", card_tcgplayer_id: "", discount_pct: 0.05 }, freshness_state: null }], movers: [], carousel: null };
  const p2 = buildPlan({ snapshot: junk, history: [], horizon: "today", now: NOW });
  assert.equal(p2.entries.length, 0);
  assert.ok(p2.not_scheduled.length >= 1);
  assert.match(p2.not_scheduled[0].reason, /NOT_SOCIAL/);
});

test("13E.8A-22. Market Mover longer shelf life lets it plan across the week where a deal cannot", () => {
  // a snapshot whose deal freshness window already closed at capture
  const staleDealSnap = {
    source: "t",
    captured_at: "2026-09-07T00:00:00.000Z",
    deals: [{ label: "s", row: { id: 1, card_name: "Charizard", card_set: "Base", card_tcgplayer_id: "111", discount_pct: 0.6, market_price: 500, total_price_usd: 200, exact_verified_at: "2026-09-06T12:00:00.000Z" }, freshness_state: "FRESH" }],
    movers: [FRESH_SNAP.movers[0]],
    carousel: null,
  };
  const plan = buildPlan({ snapshot: staleDealSnap, history: [], horizon: "week", now: NOW });
  const fams = new Set(plan.entries.map((e) => e.family));
  assert.ok(fams.has("market_mover"));
  assert.ok(!fams.has("deal_drop"), "the stale deal must not be scheduled");
  assert.ok(plan.not_scheduled.some((n) => n.family === "deal_drop" && /freshness/i.test(n.reason)));
});

test("13E.8A-23. the planner touches NO provider / eBay / renderer / publishing ledger", () => {
  const files = [
    "lib/social/planner/planner.mjs",
    "lib/social/planner/scoring.mjs",
    "lib/social/planner/diversity.mjs",
    "lib/social/planner/tiers.mjs",
    "lib/social/planner/freshness.mjs",
    "lib/social/planner/placements.mjs",
    "lib/social/planner/plans.mjs",
    "lib/social/planner/contentMix.mjs",
    "lib/social/planner/families.mjs",
    "lib/social/planner/platformRoles.mjs",
    "scripts/socialPlan.mjs",
  ];
  const BANNED = /providers\/(buffer|index)|createPost|getPostStatus|getPostMetrics|fetchActiveDealPool|from ["'][^"']*lib\/ebay|browseSearch|getBrowseRateLimit|social\/render|videoRender|socialVideo|distribution\/ledger|saveLedger|applyProvider/;
  for (const f of files) {
    const src = read(f).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, BANNED, `${f} reaches a provider / eBay / renderer / ledger`);
    assert.doesNotMatch(src, /\bfetch\(/, `${f} makes a network call`);
  }
  // plans.json is committed empty (like ledger.json / batches.json)
  assert.deepEqual(JSON.parse(read("lib/social/planner/plans.json")), []);
});

test("13E.8A-24. buildPlan is pure: same inputs -> byte-identical entries", () => {
  const a = buildPlan({ snapshot: FRESH_SNAP, history: [], horizon: "week", now: NOW });
  const b = buildPlan({ snapshot: FRESH_SNAP, history: [], horizon: "week", now: NOW });
  assert.deepEqual(a.entries, b.entries);
  assert.deepEqual(a.unfilled, b.unfilled);
});
