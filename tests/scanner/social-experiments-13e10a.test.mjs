// Phase 13E.10A - CONVERSION CREATIVE EXPERIMENT SYSTEM.
//
// Pins:
//   * deterministic, balanced hash assignment (same content+platform ->
//     same variant; ~50/50 over a sample; no Date.now/random);
//   * fact-safety per hook (just-found only when genuinely fresh; dollar
//     saving blocked below threshold; percent-gap needs a valid discount;
//     collection count truthful; market-mover needs a confident trend);
//   * a CTA maps only to a destination it can fulfil;
//   * one experiment dimension per placement to start;
//   * experiment fields freeze into the batch and any post-approval change
//     invalidates the approval checksum;
//   * the evaluator joins by content_id + variant, keeps unsupported
//     metrics null, and never auto-promotes a winner;
//   * the experiment system makes no Buffer / eBay call and does not
//     change planner eligibility.
// No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { HOOK_VARIANTS, HOOK_IDS, renderHook, hookEligible, hookIsSafe, BANNED_HOOK_PHRASES } from "../../lib/social/experiments/hooks.mjs";
import { CTA_VARIANTS, ctaFitsDestination, destinationKindForRoute, ctasForDestination } from "../../lib/social/experiments/ctas.mjs";
import { EXPERIMENTS, PRIMARY_EXPERIMENT_BY_FAMILY, MAX_EXPERIMENTS_PER_PLACEMENT, experimentApplies, findExperiment } from "../../lib/social/experiments/experiments.mjs";
import { assignVariant, explainAssignment, assignmentBalance } from "../../lib/social/experiments/assignment.mjs";
import { assignExperimentForPlacement, factsFromCandidate, defaultHookFor } from "../../lib/social/experiments/index.mjs";
import { conversionScore, compareVariants, SCORE_WEIGHTS } from "../../lib/social/experiments/score.mjs";
import { learningState, currentLeader, evaluateExperiment, MIN_PLACEMENTS, EXPLOITATION_POLICY } from "../../lib/social/experiments/learning.mjs";
import { reportExperiment, reportAll } from "../../lib/social/experiments/report.mjs";
import { approvalChecksum, buildBatch, approveBatch, batchApprovalValid } from "../../lib/social/distribution/batch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const dealFacts = (over = {}) => ({
  family: "deal_drop",
  cardName: "Charizard",
  listedUsd: 200,
  marketRefUsd: 480,
  discountPct: 0.58,
  freshnessState: "FRESH",
  ...over,
});

// ---- §7 deterministic assignment --------------------------

test("13E.10A-1. variant assignment is deterministic per (experiment, content, platform)", () => {
  const a1 = assignVariant("e1_deal_hook_pricecontrast_vs_percentgap", { contentId: "c-123", platform: "instagram_reel" });
  const a2 = assignVariant("e1_deal_hook_pricecontrast_vs_percentgap", { contentId: "c-123", platform: "instagram_reel" });
  assert.equal(a1, a2);
  assert.ok(a1 === "A" || a1 === "B");
  // a different platform for the same content can differ (per-platform, §9)
  const x = assignVariant("e1_deal_hook_pricecontrast_vs_percentgap", { contentId: "c-123", platform: "x_post" });
  assert.ok(x === "A" || x === "B");
  // explainAssignment is auditable and matches assignVariant
  const ex = explainAssignment("e1_deal_hook_pricecontrast_vs_percentgap", { contentId: "c-123", platform: "instagram_reel" });
  assert.equal(ex.variant, a1);
  assert.match(ex.sha256, /^[0-9a-f]{64}$/);
});

test("13E.10A-2. hash assignment is ~50/50 balanced over a larger sample", () => {
  const pairs = [];
  for (let i = 0; i < 400; i++) for (const p of ["instagram_reel", "x_post", "youtube_short", "tiktok"]) pairs.push({ contentId: `content-${i}`, platform: p });
  const bal = assignmentBalance("e2_deal_cta_seelivedeal_vs_checkcurrentlisting", pairs);
  assert.equal(bal.total, 1600);
  assert.ok(bal.ratioA > 0.44 && bal.ratioA < 0.56, `ratioA ${bal.ratioA} not within 44-56%`);
});

test("13E.10A-3. the experiment code uses NO Date.now / Math.random", () => {
  for (const f of ["assignment.mjs", "experiments.mjs", "hooks.mjs", "ctas.mjs", "score.mjs", "learning.mjs", "report.mjs", "index.mjs", "reviewPack.mjs"]) {
    const src = read(`lib/social/experiments/${f}`).replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(src, /Math\.random|Date\.now\(\)/, `${f} uses random/clock in assignment logic`);
  }
});

// ---- §3 fact-safety per hook ----------------------------

test("13E.10A-4. DISCOVERY (just found) is blocked unless the row is genuinely JUST_FOUND", () => {
  assert.equal(hookEligible("DISCOVERY", dealFacts({ freshnessState: "FRESH" })).ok, false);
  assert.equal(hookEligible("DISCOVERY", dealFacts({ freshnessState: "MARKET_DATA" })).ok, false);
  assert.equal(hookEligible("DISCOVERY", dealFacts({ freshnessState: "JUST_FOUND" })).ok, true);
});

test("13E.10A-5. DOLLAR_SAVING is blocked below the saving threshold", () => {
  // gap = ref - listed
  assert.equal(hookEligible("DOLLAR_SAVING", dealFacts({ listedUsd: 100, marketRefUsd: 140 })).ok, false); // $40 gap < $60 min
  assert.equal(hookEligible("DOLLAR_SAVING", dealFacts({ listedUsd: 100, marketRefUsd: 175 })).ok, true); // $75 gap
});

test("13E.10A-6. PERCENT_GAP requires a valid, positive discount at/above the qualification floor", () => {
  assert.equal(hookEligible("PERCENT_GAP", dealFacts({ discountPct: 0 })).ok, false);
  assert.equal(hookEligible("PERCENT_GAP", dealFacts({ discountPct: 0.05 })).ok, false); // below 10%
  assert.equal(hookEligible("PERCENT_GAP", dealFacts({ discountPct: 0.3 })).ok, true);
});

test("13E.10A-7. PRICE_CONTRAST needs a real, meaningful contrast", () => {
  assert.equal(hookEligible("PRICE_CONTRAST", dealFacts({ marketRefUsd: 80 })).ok, false); // ref < $100 min
  assert.equal(hookEligible("PRICE_CONTRAST", dealFacts({ listedUsd: 300, marketRefUsd: 400 })).ok, false); // ratio 1.33 < 1.8
  assert.equal(hookEligible("PRICE_CONTRAST", dealFacts({ listedUsd: 200, marketRefUsd: 480 })).ok, true);
  assert.match(renderHook("PRICE_CONTRAST", dealFacts({ listedUsd: 200, marketRefUsd: 480 })).text, /\$480 CARD\. LISTED FOR \$200\./);
});

test("13E.10A-8. COLLECTION count is truthful (renders the real itemCount, never padded)", () => {
  assert.equal(hookEligible("COLLECTION", { family: "hook_carousel", itemCount: 2 }).ok, false);
  const r = renderHook("COLLECTION", { family: "hook_carousel", itemCount: 3 });
  assert.equal(r.ok, true);
  assert.match(r.text, /^3 DEALS WE FOUND TODAY$/);
  assert.match(renderHook("COLLECTION_BELOW_MARKET", { family: "hook_carousel", itemCount: 5 }).text, /^5 POKEMON CARDS BELOW RECENT MARKET$/);
});

test("13E.10A-9. MARKET_MOVEMENT needs a market_mover with a confident, meaningful trend", () => {
  const base = { family: "market_mover", movementPct: 0.37, movementDirection: "up", movementWindow: "90 days", movementConfidence: "high" };
  assert.equal(hookEligible("MARKET_MOVEMENT", base).ok, true);
  assert.equal(hookEligible("MARKET_MOVEMENT", { ...base, family: "deal_drop" }).ok, false);
  assert.equal(hookEligible("MARKET_MOVEMENT", { ...base, movementPct: 0.03 }).ok, false); // < 8%
  assert.equal(hookEligible("MARKET_MOVEMENT", { ...base, movementConfidence: "low" }).ok, false);
});

test("13E.10A-10. UNDER_PRICE requires >=3 items AND every item confirmed under the threshold", () => {
  assert.equal(hookEligible("UNDER_PRICE", { itemCount: 3, underPriceThresholdUsd: 25, allUnderThreshold: false }).ok, false);
  assert.equal(hookEligible("UNDER_PRICE", { itemCount: 2, underPriceThresholdUsd: 25, allUnderThreshold: true }).ok, false);
  assert.equal(hookEligible("UNDER_PRICE", { itemCount: 4, underPriceThresholdUsd: 25, allUnderThreshold: true }).ok, true);
});

test("13E.10A-11. no hook may render a banned / urgency / investment phrase (§23)", () => {
  assert.ok(BANNED_HOOK_PHRASES.length >= 8);
  for (const bad of ["YOU WON'T BELIEVE THIS", "BUY NOW", "LAST CHANCE", "SELLING FAST", "GUARANTEED PROFIT", "EASY MONEY", "INVEST NOW"]) {
    assert.equal(hookIsSafe(bad), false, `"${bad}" should be unsafe`);
  }
  // every registered hook renders a safe string for a normal deal
  for (const id of HOOK_IDS) {
    const facts = { ...dealFacts({ freshnessState: "JUST_FOUND" }), family: id.startsWith("COLLECTION") || id === "UNDER_PRICE" ? "hook_carousel" : id === "MARKET_MOVEMENT" ? "market_mover" : "deal_drop", itemCount: 4, underPriceThresholdUsd: 25, allUnderThreshold: true, movementPct: 0.3, movementDirection: "up", movementWindow: "90 days", movementConfidence: "high" };
    const r = renderHook(id, facts);
    if (r.ok) assert.ok(hookIsSafe(r.text), `${id} rendered an unsafe hook: "${r.text}"`);
  }
});

// ---- §4 CTA maps to destination ------------------------

test("13E.10A-12. a CTA is only valid on a destination it can honestly fulfil", () => {
  assert.equal(ctaFitsDestination("SEE_LIVE_DEAL", "deal_exact").ok, true);
  assert.equal(ctaFitsDestination("SEE_LIVE_DEAL", "deals_index").ok, false); // not an exact listing
  assert.equal(ctaFitsDestination("FULL_PRICE_HISTORY", "card_hub").ok, true);
  assert.equal(ctaFitsDestination("FULL_PRICE_HISTORY", "deal_exact").ok, false);
  assert.equal(ctaFitsDestination("SEE_TODAYS_DEALS", "deals_index").ok, true);
  assert.equal(destinationKindForRoute("/deals/12345"), "deal_exact");
  assert.equal(destinationKindForRoute("/deals"), "deals_index");
  assert.equal(destinationKindForRoute("/deals/under-25"), "deals_index");
  assert.equal(destinationKindForRoute("/cards/charizard-base-set"), "card_hub");
});

// ---- §5/§10 experiment identity + one dimension --------

test("13E.10A-13. each experiment tests exactly ONE primary variable; ids are unique", () => {
  assert.equal(MAX_EXPERIMENTS_PER_PLACEMENT, 1);
  const ids = EXPERIMENTS.map((e) => e.experiment_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of EXPERIMENTS) {
    const aKeys = Object.keys(e.variants.A).filter((k) => k === "hook_variant" || k === "cta_variant");
    const bKeys = Object.keys(e.variants.B).filter((k) => k === "hook_variant" || k === "cta_variant");
    assert.equal(aKeys.length, 1, `${e.experiment_id} A varies !=1 dimension`);
    assert.deepEqual(aKeys, bKeys, `${e.experiment_id} A/B vary different dimensions`);
    assert.equal(e.dimension, aKeys[0] === "hook_variant" ? "HOOK" : "CTA");
  }
});

test("13E.10A-14. assignExperimentForPlacement varies ONE dimension and keeps the other at the default", () => {
  const cand = { ...dealFacts(), family: "deal_drop", content_id: "pdf-deal-x", card_name: "Charizard", total_price_usd: 200, market_price: 480, discount_pct: 0.58, freshness_state: "FRESH" };
  const got = assignExperimentForPlacement(cand, "instagram_reel");
  assert.equal(got.experiment_id, "e1_deal_hook_pricecontrast_vs_percentgap");
  assert.ok(["PRICE_CONTRAST", "PERCENT_GAP"].includes(got.hook_variant)); // the varied dimension
  assert.ok(got.cta_variant != null); // the CTA is the default, still set
  // no experiment for brand_ad
  assert.equal(assignExperimentForPlacement({ family: "brand_ad", content_id: "b1" }, "x_post").experiment_id, null);
});

test("13E.10A-15. an experiment only applies when BOTH variants are eligible (unbiased assignment)", () => {
  const exp = findExperiment("e1_deal_hook_pricecontrast_vs_percentgap");
  // a shallow-contrast deal: PERCENT_GAP ok, PRICE_CONTRAST not -> experiment does NOT apply
  const shallow = { family: "deal_drop", facts: factsFromCandidate({ family: "deal_drop", total_price_usd: 300, market_price: 360, discount_pct: 0.17, freshness_state: "FRESH" }), destinationKind: "deal_exact" };
  assert.equal(experimentApplies(exp, shallow).ok, false);
  const strong = { family: "deal_drop", facts: factsFromCandidate({ family: "deal_drop", total_price_usd: 200, market_price: 480, discount_pct: 0.58, freshness_state: "FRESH" }), destinationKind: "deal_exact" };
  assert.equal(experimentApplies(exp, strong).ok, true);
  // when it doesn't apply, assignExperimentForPlacement returns no experiment but a default hook/cta
  const got = assignExperimentForPlacement({ family: "deal_drop", content_id: "d1", total_price_usd: 300, market_price: 360, discount_pct: 0.17, freshness_state: "FRESH" }, "x_post");
  assert.equal(got.experiment_id, null);
  assert.ok(got.hook_variant != null);
});

// ---- §12 conversion score -----------------------------

test("13E.10A-16. conversion score is funnel-based, weights outbound highest, and is null without the dominant signals", () => {
  assert.ok(SCORE_WEIGHTS.affiliate_outbound_rate > SCORE_WEIGHTS.website_ctr);
  assert.ok(SCORE_WEIGHTS.website_ctr > SCORE_WEIGHTS.views_context);
  // no site visits -> no score (never fabricated)
  assert.equal(conversionScore({ impressions: 5000, views: 5000 }).score, null);
  const s = conversionScore({ impressions: 5000, siteVisits: 150, dealPageViews: 90, affiliateOutbound: 33 });
  assert.ok(s.score > 0 && s.score <= 1);
  // raw components are returned separately, not hidden
  assert.ok(Math.abs(s.components.affiliate_outbound_rate.value - 33 / 150) < 1e-9);
  assert.ok(Math.abs(s.components.website_ctr.value - 150 / 5000) < 1e-9);
});

test("13E.10A-17. unsupported / missing metrics stay null in the score (never 0)", () => {
  const s = conversionScore({ impressions: 4000, siteVisits: 100, affiliateOutbound: 10 }); // no dealPageViews, no platformCtr
  assert.equal(s.components.deal_page_engagement.value, null);
  assert.equal(s.components.platform_ctr.value, null);
  assert.ok(s.missing.includes("deal_page_engagement"));
});

// ---- §11/§14 learning + no auto-promotion -------------

test("13E.10A-18. learning states are conservative; 3 posts never a winner", () => {
  assert.equal(learningState({ nA: 3, nB: 3 }), "INSUFFICIENT_DATA");
  assert.equal(learningState({ nA: 12, nB: 11 }), "EARLY_SIGNAL");
  const cmpMeaningful = { meaningful: true, leader: "A" };
  assert.equal(learningState({ nA: 25, nB: 24, cmp: cmpMeaningful }), "PROMISING");
  assert.equal(learningState({ nA: 50, nB: 45, cmp: cmpMeaningful, consistent: true }), "WINNER_CANDIDATE");
  assert.equal(learningState({ nA: 50, nB: 45, cmp: cmpMeaningful, consistent: false }), "NO_CLEAR_WINNER");
  assert.equal(learningState({ nA: 50, nB: 45, cmp: { meaningful: false } }), "NO_CLEAR_WINNER");
  // leader is only named at PROMISING+
  assert.equal(currentLeader("EARLY_SIGNAL", cmpMeaningful), "n/a");
  assert.equal(currentLeader("WINNER_CANDIDATE", cmpMeaningful), "A");
});

test("13E.10A-19. the evaluator + exploitation policy never auto-promote", () => {
  const cli = read("scripts/socialExperiments.mjs").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(cli, /saveLedger|savePlans|saveBatches|writeFileSync\([^)]*homepageVariety|approveBatch\(|createPost/);
  assert.equal(EXPLOITATION_POLICY.enabled, false);
  assert.match(read("lib/social/experiments/learning.mjs"), /no auto-promotion/i);
});

// ---- §13 performance join -----------------------------

test("13E.10A-20. the report joins ledger rows by content_id + variant and holds NOT_AVAILABLE_YET before publish", () => {
  // nothing published
  const empty = reportExperiment("e1_deal_hook_pricecontrast_vs_percentgap", [], {});
  assert.equal(empty.state, "NOT_AVAILABLE_YET");
  assert.equal(empty.variants.A.score, null);
  // a small synthetic join
  const rows = [
    { status: "PUBLISHED", experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap", variant_id: "A", content_id: "c1", metrics: { impressions: 4000 } },
    { status: "PUBLISHED", experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap", variant_id: "B", content_id: "c2", metrics: { impressions: 3800 } },
    { status: "QUEUED", experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap", variant_id: "A", content_id: "c3", metrics: {} }, // not published -> ignored
  ];
  const attr = { c1: { attributed_visits: 120, affiliate_outbound: 30 }, c2: { attributed_visits: 100, affiliate_outbound: 18 } };
  const rep = reportExperiment("e1_deal_hook_pricecontrast_vs_percentgap", rows, attr);
  assert.equal(rep.variants.A.n, 1);
  assert.equal(rep.variants.B.n, 1);
  assert.ok(rep.variants.A.score != null && rep.variants.B.score != null);
  assert.equal(rep.state, "INSUFFICIENT_DATA"); // 1 placement/variant
});

// ---- §20 batch freeze --------------------------------

test("13E.10A-21. experiment fields freeze into the batch and any change invalidates the approval checksum", () => {
  const row = (over = {}) => ({
    job_id: `pdf-x::instagram_reel::A`, content_id: "pdf-x", platform: "instagram_reel", placement: "reel", creative_variant: "A",
    channel_key: "instagram_main", channel_id: "chan1", media_sha256: "sha", public_media_url: "https://h/x.mp4",
    caption: "cap", youtube_title: null, cta_url: "https://pokemondealfinder.com/deals/1?utm_source=instagram", hashtags: [],
    qa: { ok: true, passed: 5, total: 5 }, rights: {}, snapshot: { market_price: 480, discount_pct: 0.58, listed_usd: 200 },
    experiment_id: "e1_deal_hook_pricecontrast_vs_percentgap", variant_id: "A", hook_variant: "PRICE_CONTRAST", cta_variant: "SEE_LIVE_DEAL", experiment_hypothesis: "h",
    ...over,
  });
  const batch = buildBatch({ content_id: "pdf-x", rows: [row()] });
  assert.equal(batch.placements[0].experiment.experiment_id, "e1_deal_hook_pricecontrast_vs_percentgap");
  assert.equal(batch.placements[0].experiment.hook_variant, "PRICE_CONTRAST");
  const approved = approveBatch(batch, { by: "owner" });
  assert.equal(approved.ok, true);
  assert.equal(batchApprovalValid(batch).ok, true);
  // mutate the frozen experiment -> checksum no longer matches
  batch.placements[0].experiment.hook_variant = "PERCENT_GAP";
  assert.equal(batchApprovalValid(batch).ok, false);
  // and the checksum function itself reads the experiment fields
  const before = approvalChecksum(batch);
  batch.placements[0].experiment.variant_id = "B";
  assert.notEqual(before, approvalChecksum(batch));
});

// ---- no Buffer / eBay / planner-eligibility change ----

test("13E.10A-22. the experiment system makes no Buffer or eBay call", () => {
  const BAD = /providers\/(buffer|index)|createPost|getPostStatus|getPostMetrics|from ["'][^"']*lib\/ebay|searchListings|getBrowseRateLimit|graph\.buffer|api\.buffer/;
  for (const f of ["hooks.mjs", "ctas.mjs", "experiments.mjs", "assignment.mjs", "index.mjs", "score.mjs", "learning.mjs", "report.mjs", "reviewPack.mjs"]) {
    const src = read(`lib/social/experiments/${f}`).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, BAD, `lib/social/experiments/${f} reaches Buffer / eBay`);
    assert.doesNotMatch(src, /\bfetch\(/, `lib/social/experiments/${f} makes a network call`);
  }
  const cli = read("scripts/socialExperiments.mjs").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(cli, BAD);
  assert.doesNotMatch(cli, /\bfetch\(/);
});

test("13E.10A-23. planner integration runs AFTER the gates and does not change eligibility", () => {
  const planner = read("lib/social/planner/planner.mjs");
  // the experiment assignment is called in the entries.push block, after
  // scoring / tiering / diversity / freshness / choosePlacements
  const idxChoose = planner.indexOf("choosePlacements(c)");
  const idxAssign = planner.indexOf("assignExperimentForPlacement(c, pc.platform)");
  assert.ok(idxAssign > idxChoose, "experiment assignment must come after choosePlacements");
  // it only adds fields to the entry - it is not used in any gate/filter
  assert.doesNotMatch(planner, /if \([^)]*assignExperimentForPlacement/);
  assert.doesNotMatch(planner, /assignExperimentForPlacement[\s\S]{0,120}(continue|notScheduled\.push|return)/);
  // primary-per-family table is complete + brand_ad is deliberately null
  assert.equal(PRIMARY_EXPERIMENT_BY_FAMILY.brand_ad, null);
  for (const fam of ["deal_drop", "hook_carousel", "market_mover"]) assert.ok(PRIMARY_EXPERIMENT_BY_FAMILY[fam]);
});

// ---- first-4 experiments present ---------------------

test("13E.10A-24. the initial slate is exactly the first four experiments", () => {
  assert.deepEqual(
    EXPERIMENTS.map((e) => e.experiment_id),
    [
      "e1_deal_hook_pricecontrast_vs_percentgap",
      "e2_deal_cta_seelivedeal_vs_checkcurrentlisting",
      "e3_collection_hook_foundtoday_vs_belowmarket",
      "e4_mover_cta_pricehistory_vs_comparelistings",
    ]
  );
  // each has a distinct, non-empty hypothesis
  const hyps = EXPERIMENTS.map((e) => e.hypothesis);
  assert.equal(new Set(hyps).size, 4);
  for (const h of hyps) assert.ok(h.length > 20);
});
