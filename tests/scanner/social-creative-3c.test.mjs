// Phase SOCIAL-CREATIVE-3C - artifact-level autonomous eligibility +
// three_up hardening + visual-consensus policy. Pure-logic + source-scan.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  consensusFromReviews, CONSENSUS_RULE, VISUAL_REVIEW_POLICY_VERSION, CONSENSUS_CORE_DIMS,
} from "../../lib/newsroom/visualConsensus.mjs";
import {
  CARD_LAYOUT_STATUS, FAMILY_STATUSES, ARTIFACT_ELIGIBILITIES,
  familyStatusFor, seriesAutonomousConsiderable, cardForwardAutonomousSafe,
  artifactEligibility, AUTONOMOUS_SAFE_CARD_LAYOUTS, CONDITIONAL_CARD_LAYOUTS, MANUAL_ONLY_CARD_LAYOUTS,
} from "../../lib/social/newsroom/cardLayoutStatus.mjs";
import { threeUpChecks, THREE_UP_LAYOUT } from "../../lib/social/newsroom/cardCreativeChecks.mjs";
import { renderCardEditorialHtml } from "../../lib/social/newsroom/cardEditorialTemplates.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");

const scored = (v, core) => v.map((verdict) => ({ verdict, scores: Object.fromEntries([...CONSENSUS_CORE_DIMS, "AI_SPAM_RISK"].map((k) => [k, k === "AI_SPAM_RISK" ? 30 : core])) }));

// ---- family status vs artifact eligibility ----------------------
test("C3C-1. FAMILY_STATUS model (3C evidence-based): bid_vs_total + movers MANUAL_ONLY; deal_hero/three_up/asking_vs_sold CONDITIONAL; market_shape + printing_compare AUTONOMOUS_SAFE", () => {
  assert.equal(CARD_LAYOUT_STATUS.AUCTION_BID_VS_TOTAL.family_status, "MANUAL_ONLY");
  assert.equal(CARD_LAYOUT_STATUS.BIGGEST_MOVERS.family_status, "MANUAL_ONLY");
  assert.equal(CARD_LAYOUT_STATUS.DEAL_DROP.family_status, "CONDITIONAL");
  assert.equal(CARD_LAYOUT_STATUS.THREE_UNDER_25.family_status, "CONDITIONAL");
  assert.equal(CARD_LAYOUT_STATUS.WHY_SOLD_PRICES_MATTER.family_status, "CONDITIONAL");
  const autos = Object.entries(CARD_LAYOUT_STATUS).filter(([, s]) => s.family_status === "AUTONOMOUS_SAFE").map(([k]) => k);
  assert.deepEqual(autos.sort(), ["EXACT_PRINTING_MATTERS", "MARKET_SNAPSHOT"]);
  for (const s of Object.values(CARD_LAYOUT_STATUS)) assert.ok(FAMILY_STATUSES.includes(s.family_status));
  assert.equal(familyStatusFor("nope"), null);
});

test("C3C-2. seriesAutonomousConsiderable = AUTONOMOUS_SAFE or CONDITIONAL only; MANUAL_ONLY never considerable", () => {
  assert.equal(seriesAutonomousConsiderable("MARKET_SNAPSHOT"), true);
  assert.equal(seriesAutonomousConsiderable("DEAL_DROP"), true);       // conditional -> considerable, but needs artifact consensus
  assert.equal(seriesAutonomousConsiderable("AUCTION_BID_VS_TOTAL"), false);
  assert.equal(seriesAutonomousConsiderable("BIGGEST_MOVERS"), false);
  assert.equal(cardForwardAutonomousSafe("DEAL_DROP"), false);          // conditional is NOT blind-safe
});

test("C3C-3. artifactEligibility: AUTONOMOUS_SAFE with all soft gates ok -> ELIGIBLE; a soft-gate miss -> HELD", () => {
  const okGates = { factOk: true, rightsOk: true, deterministicOk: true, pullGateOk: true, collectibleOk: true, originalityOk: true, sequenceOk: true, thumbnailOk: true, feedOk: true };
  assert.equal(artifactEligibility({ familyStatus: "AUTONOMOUS_SAFE", gates: okGates }).eligibility, "ELIGIBLE");
  assert.equal(artifactEligibility({ familyStatus: "AUTONOMOUS_SAFE", gates: { ...okGates, feedOk: false } }).eligibility, "HELD");
  assert.ok(ARTIFACT_ELIGIBILITIES.includes("BLOCKED"));
});

test("C3C-4. CONDITIONAL family cannot be ELIGIBLE without a visual-consensus PASS", () => {
  const okGates = { factOk: true, rightsOk: true, deterministicOk: true, pullGateOk: true, collectibleOk: true, originalityOk: true, sequenceOk: true, thumbnailOk: true, feedOk: true };
  assert.equal(artifactEligibility({ familyStatus: "CONDITIONAL", gates: okGates, consensus: null }).eligibility, "HELD");
  assert.equal(artifactEligibility({ familyStatus: "CONDITIONAL", gates: okGates, consensus: { result: "HELD" } }).eligibility, "HELD");
  assert.equal(artifactEligibility({ familyStatus: "CONDITIONAL", gates: okGates, consensus: { result: "PASS" } }).eligibility, "ELIGIBLE");
});

test("C3C-5. MANUAL_ONLY / WITHHELD never autonomous - always BLOCKED regardless of gates", () => {
  const okGates = { factOk: true, rightsOk: true, deterministicOk: true, pullGateOk: true, collectibleOk: true, originalityOk: true, sequenceOk: true, thumbnailOk: true, feedOk: true };
  assert.equal(artifactEligibility({ familyStatus: "MANUAL_ONLY", gates: okGates, consensus: { result: "PASS" } }).eligibility, "BLOCKED");
  assert.equal(artifactEligibility({ familyStatus: "WITHHELD", gates: okGates }).eligibility, "BLOCKED");
});

// ---- consensus rule ------------------------------------------
test("C3C-6. consensus: >=4/5 PASS + 0 FAIL + core score >= floor -> PASS", () => {
  const r = consensusFromReviews(scored(["PASS", "PASS", "PASS", "PASS", "WATCH"], 82));
  assert.equal(r.result, "PASS");
  assert.equal(r.policy_version, VISUAL_REVIEW_POLICY_VERSION);
  assert.equal(r.pass_count, 4);
});

test("C3C-7. consensus: 3/5 PASS is HELD (genuinely split, not model noise)", () => {
  assert.equal(consensusFromReviews(scored(["PASS", "PASS", "PASS", "WATCH", "WATCH"], 82)).result, "HELD");
});

test("C3C-8. consensus: ANY FAIL blocks and never becomes PASS - even with 4 PASS", () => {
  const r = consensusFromReviews(scored(["PASS", "PASS", "PASS", "PASS", "FAIL"], 90));
  assert.equal(r.result, "BLOCKED");
  assert.equal(r.fail_count, 1);
  assert.match(r.reasons.join(" "), /never overrides FAIL/);
});

test("C3C-9. consensus: 5/5 PASS but a weak core score is still HELD (score floor is real)", () => {
  assert.equal(consensusFromReviews(scored(["PASS", "PASS", "PASS", "PASS", "PASS"], 60)).result, "HELD");
});

test("C3C-10. consensus: high AI-spam mean is HELD even with a PASS majority", () => {
  const runs = ["PASS", "PASS", "PASS", "PASS", "PASS"].map(() => ({ verdict: "PASS", scores: Object.fromEntries([...CONSENSUS_CORE_DIMS.map((k) => [k, 82]), ["AI_SPAM_RISK", 70]]) }));
  assert.equal(consensusFromReviews(runs).result, "HELD");
});

test("C3C-11. staged consensus runner exists, runs min 3, expands to 5, stops early on unanimous PASS / all-WATCH-weak, blocks on FAIL", () => {
  const s = read("lib/newsroom/visualConsensus.mjs");
  assert.match(s, /min_reviews: 3/);
  assert.match(s, /max_reviews: 5/);
  assert.match(s, /UNANIMOUS_PASS/);
  assert.match(s, /ALL_WATCH_WEAK/);
  assert.match(s, /r\.verdict === "FAIL"/);
  assert.match(s, /export async function reviewConsensus/);
});

// ---- policy versioning / QA persistence --------------------
test("C3C-12. the consensus result carries a policy_version and per-verdict counts (SS17/SS18)", () => {
  const r = consensusFromReviews(scored(["PASS", "WATCH", "PASS", "PASS", "PASS"], 80));
  for (const k of ["policy_version", "review_count", "pass_count", "watch_count", "fail_count", "verdicts", "core_score"]) assert.ok(k in r, `missing ${k}`);
  assert.match(String(VISUAL_REVIEW_POLICY_VERSION), /^\d+c\.\d+$/);
});

test("C3C-13. db.artifactQueueEligible gates a CONDITIONAL family on a policy-matched consensus PASS; a stale-policy or non-consensus row cannot authorise", () => {
  const src = read("lib/social/newsroom/db.mjs");
  const fn = src.slice(src.indexOf("export async function artifactQueueEligible"), src.indexOf("export async function artifactQueueEligible") + 2400);
  assert.match(fn, /familyStatus === "CONDITIONAL"/);
  assert.match(fn, /latestConsensusForArtifact/);
  assert.match(fn, /matches_policy/);
  assert.match(fn, /consensus_result !== "PASS"/);
  assert.match(fn, /MANUAL_ONLY" \|\| familyStatus === "WITHHELD"/);
  // the consensus reader requires a consensus row + the current policy
  const reader = src.slice(src.indexOf("export async function latestConsensusForArtifact"), src.indexOf("export async function artifactQueueEligible"));
  assert.match(reader, /if \(!d\.consensus_result\) continue/);
  assert.match(reader, /policyVersion == null \|\| d\.policy_version === policyVersion/);
});

test("C3C-14. the backlog-render queue path threads familyStatus + policyVersion into artifactQueueEligible", () => {
  const s = read("scripts/socialBacklogRender.mjs");
  assert.match(s, /cardFamilyStatusFor\(st\.series\)/);
  assert.match(s, /familyStatus: famStatus/);
  assert.match(s, /policyVersion: VISUAL_REVIEW_POLICY_VERSION/);
});

// ---- three_up hardening -------------------------------------
const TU_ITEMS = [
  { tcgplayerId: "111", card_name: "Blastoise", price_usd: 15.85, market_usd: 61, discount_pct: 74 },
  { tcgplayerId: "222", card_name: "Gengar", price_usd: 9.5, market_usd: 22, discount_pct: 57 },
  { tcgplayerId: "333", card_name: "Pikachu", price_usd: 22, market_usd: 40, discount_pct: 45 },
];
const TU_OK = { ...THREE_UP_LAYOUT, cap: 25, items: TU_ITEMS, card_art_ready_ids: ["111", "222", "333"] };

test("C3C-15. three_up: 3 distinct real cards, all under the cap, all with canonical art -> PASS", () => {
  const r = threeUpChecks(TU_OK);
  assert.equal(r.grade, "PASS");
  assert.deepEqual(r.failed, []);
});

test("C3C-16. three_up: a price over the cap FAILS (budget cap is hard)", () => {
  const r = threeUpChecks({ ...TU_OK, items: [{ ...TU_ITEMS[0], price_usd: 31 }, TU_ITEMS[1], TU_ITEMS[2]] });
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("all_under_cap"));
});

test("C3C-17. three_up: a duplicate printing FAILS", () => {
  const r = threeUpChecks({ ...TU_OK, items: [TU_ITEMS[0], TU_ITEMS[0], TU_ITEMS[2]], card_art_ready_ids: ["111", "333"] });
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("distinct_printings"));
});

test("C3C-18. three_up: a missing canonical-art card FAILS (exact art required)", () => {
  const r = threeUpChecks({ ...TU_OK, card_art_ready_ids: ["111", "222"] });
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("all_have_art"));
});

test("C3C-19. three_up: fabricated / tiny saving is flagged; real data required", () => {
  assert.ok(threeUpChecks({ ...TU_OK, items: TU_ITEMS.map((i) => ({ ...i, discount_pct: 90 })) }).failed.includes("real_saving"));
  assert.ok(threeUpChecks({ ...TU_OK, items: TU_ITEMS.map((i) => ({ ...i, market_usd: i.price_usd - 1, discount_pct: 5 })) }).failed.some((f) => f === "real_market_ref" || f === "real_saving" || f === "save_value"));
});

test("C3C-20. three_up: same species x3 fails card_variety; a >$30 cap fails budget_relevance", () => {
  assert.ok(threeUpChecks({ ...TU_OK, items: TU_ITEMS.map((i) => ({ ...i, card_name: "Pikachu" })) }).failed.includes("card_variety"));
  assert.ok(threeUpChecks({ ...TU_OK, cap: 50, items: TU_ITEMS.map((i) => ({ ...i, price_usd: 40, market_usd: 90 })) }).failed.includes("budget_relevance"));
});

test("C3C-21. three_up template renders 3 real prices, a saving badge per card, one CTA, no fake urgency", () => {
  const html = renderCardEditorialHtml("three_up", { cap: 25, items: TU_ITEMS, target: "ig_45", cardArt: {} });
  assert.equal((html.match(/&minus;\d+%/g) || []).length, 3);
  assert.equal((html.match(/Live on eBay/g) || []).length, 1);
  assert.doesNotMatch(html, /ends in|hurry|last chance|selling fast/i);
});

// ---- feed sufficiency replacing the arbitrary "5 families" rule ----
test("C3C-22. the review-policy harness scores feed SUFFICIENCY (>=4 auto/conditional families, >=3 pillars, FEED_PASS, commercial <=60%) instead of a fixed family count", () => {
  const s = read("scripts/socialReviewPolicy.mjs");
  assert.match(s, /sufficient_for_newsroom3/);
  assert.match(s, /distinctPillars >= 3/);
  assert.match(s, /feed\.verdict === "FEED_PASS"/);
  assert.match(s, /commercialShare <= 0\.6/);
  assert.doesNotMatch(s.replace(/\/\/[^\n]*/g, ""), /families\.length >= 5|>= 5 autonomous-safe families/);
});

// ---- SAFETY -----------------------------------------------
test("C3C-23. no Buffer write / no NEWSROOM-3 activation / no eBay Browse in this phase's code", () => {
  for (const p of ["scripts/socialReviewPolicy.mjs", "lib/newsroom/visualConsensus.mjs", "lib/social/newsroom/cardLayoutStatus.mjs", "lib/social/newsroom/cardCreativeChecks.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /getSocialProvider|scheduleOne|createPost|customScheduled|saveToDraft|addToQueue/, `${p} Buffer write`);
    assert.doesNotMatch(c, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE\.activated\s*=\s*true|activateRefill/, `${p} NEWSROOM-3`);
    assert.doesNotMatch(c, /ebayBrowse|\/buy\/browse|browseSearch/i, `${p} eBay Browse`);
  }
  const s = read("scripts/socialReviewPolicy.mjs");
  assert.match(s, /buffer_calls: 0/);
  assert.match(s, /stage1: "OFF"/);
  assert.match(s, /newsroom3: "OFF"/);
});

test("C3C-24. RIGHTS_STATE.publishing DISABLED; no generated art; verify + email untouched by this phase", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  for (const p of ["scripts/socialReviewPolicy.mjs", "lib/social/newsroom/marketData.mjs", "lib/social/newsroom/cardCreativeChecks.mjs", "lib/newsroom/visualConsensus.mjs"]) {
    const c = code(p);
    assert.doesNotMatch(c, /verifyAllocator|allocateVerifyBatch|api\/verify-deals/, `${p} verify`);
    assert.doesNotMatch(c, /newsletter_subscribers|sendDigest|resendClient|RESEND_API_KEY/i, `${p} email`);
  }
  const tpl = code("lib/social/newsroom/cardEditorialTemplates.mjs");
  assert.doesNotMatch(tpl, /openai|dall-?e|images\/generations/i);
});
