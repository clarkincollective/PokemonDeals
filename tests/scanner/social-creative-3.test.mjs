// Phase SOCIAL-CREATIVE-3 - hobby-native visual quality upgrade.
// Pure-logic + source-scan. No DB, no OpenAI, no renderer, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { collectibleAppeal, CARD_SPECIFIC_FAMILIES, DATA_FAMILIES } from "../../lib/social/newsroom/collectibleAppeal.mjs";
import { editorialCreativeQa } from "../../lib/social/newsroom/editorialQa.mjs";
import { runQaStack, QA_LAYERS, collectibleAppealLayer } from "../../lib/social/newsroom/qaStack.mjs";
import { RUBRIC_KEYS } from "../../lib/newsroom/visualReview.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import {
  CARD_LAYOUT_STATUS, AUTONOMOUS_SAFE_CARD_LAYOUTS, MANUAL_ONLY_CARD_LAYOUTS,
  cardForwardAutonomousSafe, cardLayoutStatusFor,
} from "../../lib/social/newsroom/cardLayoutStatus.mjs";
import { CARD_LAYOUTS } from "../../lib/social/newsroom/cardEditorialTemplates.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
// code only - strip // line comments, /* */ block comments, and string/
// template literals so prose ("no verify-deals change") and mock UI copy
// ("View on eBay") don't trip a behavioural source-scan.
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

const goodMeta = (over = {}) => ({
  layout_family: "deal_hero",
  card_ids_shown: ["12345"],
  card_art_ready_ids: ["12345"],
  numeric_callouts: [12, 61, 80],
  has_price_contrast: true,
  hero_fraction: 0.42,
  is_generic_typographic: false,
  species: "blastoise",
  ...over,
});

// ---- SS17: collectible appeal gate --------------------------------
test("C3-1. collectibleAppeal PASSes a card-forward layout with real art + real numbers + a prominent hero", () => {
  const r = collectibleAppeal(goodMeta());
  assert.equal(r.grade, "PASS");
  assert.deepEqual(r.failed, []);
});

test("C3-2. canonical card art is REQUIRED where the layout is card-specific", () => {
  const r = collectibleAppeal(goodMeta({ card_art_ready_ids: [] }));
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("card_art_present"));
  for (const lf of CARD_SPECIFIC_FAMILIES) {
    const g = collectibleAppeal(goodMeta({ layout_family: lf, card_art_ready_ids: [] }));
    assert.equal(g.grade, "FAIL", `${lf} must FAIL with no art`);
  }
});

test("C3-3. a generic empty typographic infographic on a data family is blocked", () => {
  const r = collectibleAppeal(goodMeta({ is_generic_typographic: true }));
  assert.equal(r.grade, "FAIL");
  assert.ok(r.failed.includes("not_generic_typographic"));
});

test("C3-4. a text-only 'corporate' layout with no numbers and a tiny hero cannot PASS", () => {
  const r = collectibleAppeal(goodMeta({ numeric_callouts: [], hero_fraction: 0.1 }));
  assert.notEqual(r.grade, "PASS");
  assert.ok(r.failed.includes("data_points"));
  assert.ok(r.failed.includes("hero_prominence"));
});

test("C3-5. a market post must carry real data emphasis (>=2 numeric callouts + contrast)", () => {
  const ok = collectibleAppeal({ layout_family: "market_shape", numeric_callouts: [24545, 85.7, 4.7], has_price_contrast: false, hero_fraction: 0.34, is_generic_typographic: false, card_ids_shown: [], card_art_ready_ids: [] });
  assert.equal(ok.grade, "PASS");
  const thin = collectibleAppeal({ layout_family: "market_shape", numeric_callouts: [1], has_price_contrast: false, hero_fraction: 0.34, is_generic_typographic: false, card_ids_shown: [], card_art_ready_ids: [] });
  assert.equal(thin.grade, "WATCH");
  assert.ok(thin.failed.includes("data_points"));
});

// ---- SS17 wired into the QA stack --------------------------------
test("C3-6. COLLECTIBLE_APPEAL is a required layer in runQaStack for card-specific data families", () => {
  assert.ok(QA_LAYERS.includes("COLLECTIBLE_APPEAL"));
  const story = {
    captured_at: "2026-09-08T00:00:00Z", latest_safe_publish_at: "2026-09-20T00:00:00Z",
    shelf_life_class: "EDITORIAL", facts_json: {}, deal_ids: [],
  };
  const bad = runQaStack(story, {
    rights: { rightsCleared: true }, requireVisualReview: false,
    creativeMeta: { editorial: true, layout_family: "deal_hero", ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 24, statCallouts: ["12", "61"] },
    collectibleMeta: goodMeta({ card_art_ready_ids: [] }),
  });
  assert.equal(bad.passed_all, false);
  const layer = bad.layers.find((l) => l.layer === "COLLECTIBLE_APPEAL");
  assert.equal(layer.result, "FAIL");
});

test("C3-7. collectibleAppealLayer is a no-op PASS for a non-card editorial layout", () => {
  assert.equal(collectibleAppealLayer(null).result, "PASS");
  assert.equal(collectibleAppealLayer({ layout_family: "trust_editorial" }).result, "PASS");
});

// ---- SS8: deterministic editorial QA still enforces the basics ----
test("C3-8. editorialCreativeQa blocks two CTAs and a hook over 3 lines", () => {
  const twoCta = editorialCreativeQa({ layout_family: "deal_hero", target: "ig_45", hookText: "short", ctaCount: 2, wordmarkCount: 1, minInlineFontPx: 24 });
  assert.equal(twoCta.grade, "FAIL");
  const longHook = editorialCreativeQa({ layout_family: "deal_hero", target: "ig_45", hookText: "word ".repeat(40), ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 24 });
  assert.notEqual(longHook.grade, "PASS");
});

test("C3-9. multi-card grids are exempt from the stat_distinct dedupe (two real cards can share a price)", () => {
  const r = editorialCreativeQa({ layout_family: "three_up", target: "ig_45", hookText: "What $25 buys", ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 24, statCallouts: ["15", "50", "15", "50", "20", "60"] });
  assert.ok(!r.failed.includes("stat_distinct"));
  const single = editorialCreativeQa({ layout_family: "deal_hero", target: "ig_45", hookText: "Deal", ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 24, statCallouts: ["15", "15"] });
  assert.ok(single.failed.includes("stat_distinct"));
});

// ---- SS2: Layer-5 hobby-native rubric ----------------------------
test("C3-10. Layer-5 rubric carries the hobby-native dimensions", () => {
  for (const k of ["COLLECTIBLE_VISUAL_APPEAL", "CARD_ART_USAGE", "DATA_VISUAL_IMPACT", "SCROLL_STOP_STRENGTH", "HOBBY_NATIVE_FEEL", "THUMBNAIL_STORY_CLARITY", "VISUAL_SPECIFICITY", "EMOTIONAL_COLLECTOR_RELEVANCE", "AI_SPAM_RISK"]) {
    assert.ok(RUBRIC_KEYS.includes(k), `missing rubric key ${k}`);
  }
  const src = read("lib/newsroom/visualReview.mjs");
  assert.match(src, /reviewRenderedCreativeMulti/);
  assert.match(src, /worst/i); // worst-case across samples
});

test("C3-11. the professional PASS rule has no 'technically valid' exception", () => {
  const src = read("lib/newsroom/visualReview.mjs");
  assert.match(src, /bar is NOT/i);
  assert.match(src, /technically (clean|valid|professional)/i);
});

// ---- SS22: real data only, no fabricated numbers -----------------
test("C3-12. marketData resolvers return VISUALLY_UNDERPOWERED_DATA and never fabricate", () => {
  const src = read("lib/social/newsroom/marketData.mjs");
  assert.match(src, /VISUALLY_UNDERPOWERED_DATA/);
  // no random / placeholder number generation
  assert.doesNotMatch(src, /Math\.random/);
  assert.doesNotMatch(src, /faker|lorem|placeholder\s*number/i);
});

test("C3-13. the movers series is never autonomous-safe and renders only from the sanctioned confidence gate", () => {
  assert.equal(CARD_LAYOUT_STATUS.BIGGEST_MOVERS.family_status, "MANUAL_ONLY");
  // no direct price_history access - it delegates to lib/social/priceMovement
  const md = read("lib/social/newsroom/marketData.mjs");
  assert.doesNotMatch(md.replace(/\/\/[^\n]*/g, ""), /\.from\(\s*["']price_history["']\s*\)/);
  assert.match(md, /priceMovement/);
});

// ---- SS23/SS31 (updated by SOCIAL-CREATIVE-3C): FAMILY_STATUS model ----
test("C3-14. every card layout maps to a FAMILY_STATUS; the autonomous-safe set excludes conditional/manual", () => {
  const layouts = new Set(Object.values(CARD_LAYOUT_STATUS).map((s) => s.layout));
  for (const lf of CARD_LAYOUTS) assert.ok(layouts.has(lf), `${lf} unclassified`);
  for (const s of Object.values(CARD_LAYOUT_STATUS)) {
    assert.ok(["AUTONOMOUS_SAFE", "CONDITIONAL", "MANUAL_ONLY", "WITHHELD"].includes(s.family_status), `bad family_status ${s.family_status}`);
  }
  assert.ok(AUTONOMOUS_SAFE_CARD_LAYOUTS.length >= 1);
  for (const lf of AUTONOMOUS_SAFE_CARD_LAYOUTS) assert.ok(!MANUAL_ONLY_CARD_LAYOUTS.includes(lf));
});

test("C3-15. the deal floor (deal_hero) and process/story (bid_vs_total) are NOT yet autonomous-safe", () => {
  assert.equal(cardForwardAutonomousSafe("DEAL_DROP"), false);
  assert.equal(cardForwardAutonomousSafe("AUCTION_BID_VS_TOTAL"), false);
  assert.equal(cardForwardAutonomousSafe("MARKET_SNAPSHOT"), true);
  assert.equal(cardLayoutStatusFor("nope"), null);
});

// ---- SS0/SS30: nothing scheduled, no Buffer writes --------------
test("C3-16. the creative pack script does not publish, schedule, host, or call Buffer / eBay Browse", () => {
  const c = code("scripts/socialCreativePack.mjs");
  assert.doesNotMatch(c, /getSocialProvider|bufferBacklog|scheduleOne|createPost|customScheduled/);
  assert.doesNotMatch(c, /getStorageProvider|hostAsset|uploadAsset/);
  assert.doesNotMatch(c, /ebayBrowse|browseSearch|getBrowse|\/buy\/browse/i);
  const src = read("scripts/socialCreativePack.mjs");
  assert.match(src, /published:\s*0/);
  assert.match(src, /scheduled:\s*0/);
  assert.match(src, /stage1:\s*"OFF"/);
});

test("C3-17. feed-grid + previews are generated for a diversity / thumbnail read", () => {
  const src = read("scripts/socialCreativePack.mjs");
  assert.match(src, /feed-grid\.html/);
  assert.match(src, /previews\.html/);
  assert.match(src, /thumb 120px|120px/);
  assert.match(src, /corporate infographic/i);
});

// ---- Stage 1 OFF / rights unchanged ----------------------------
test("C3-18. RIGHTS_STATE.publishing stays DISABLED and eBay imagery/GenAI not cleared", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  assert.equal(RIGHTS_STATE.ebay_seller_images, "NOT_CLEARED");
  assert.equal(RIGHTS_STATE.ebay_genai, "NOT_ALLOWED");
});

// ---- verify-deals + email untouched by this phase --------------
test("C3-19. this phase does not touch verify-deals, the verify allocator, or the email system", () => {
  for (const p of [
    "lib/social/newsroom/marketData.mjs",
    "lib/social/newsroom/cardEditorialTemplates.mjs",
    "lib/social/newsroom/collectibleAppeal.mjs",
    "lib/social/newsroom/cardLayoutStatus.mjs",
    "scripts/socialCreativePack.mjs",
  ]) {
    const c = code(p);
    assert.doesNotMatch(c, /verifyAllocator|allocateVerifyBatch|api\/verify-deals/, `${p} references verify-deals`);
    assert.doesNotMatch(c, /newsletter_subscribers|sendDigest|resendClient|RESEND_API_KEY/i, `${p} references email`);
  }
});

// ---- card templates: real card art only, no GenAI / seller photo -
test("C3-20. card-forward templates use only pre-resolved local canonical art - no remote fetch, no GenAI call", () => {
  const src = read("lib/social/newsroom/cardEditorialTemplates.mjs");
  // strip comments so prose ("no seller photo, no GenAI redraw") isn't matched
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /https?:\/\/[^"'\s)]*\.(?:jpg|png|webp)/i);
  assert.doesNotMatch(code, /fetch\(|openai|images\/generations|dall-?e/i);
  // the image source is only ever the injected cardArt map (file:// URLs)
  assert.match(code, /cardArt\?\.\[String\(id\)\]/);
});
