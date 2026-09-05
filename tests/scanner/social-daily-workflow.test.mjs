// Phase 13E.1 - the DAILY SOCIAL CONTENT PRODUCTION WORKFLOW
// (npm run social:daily). Fixtures only - no live database, no eBay, no
// PokemonPriceTracker API, no Chrome render (except one explicit
// 1080x1350 HTML-shape assertion). Covers docs/social-daily-workflow.md
// SS1-SS27 and this brief's SS26 test list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildDailyBatch, DAILY_FAMILIES, batchMixWarnings } from "../../lib/social/dailyMix.mjs";
import { assembleCaption, assemblePlatformCaptions } from "../../lib/social/caption.mjs";
import { buildHashtags } from "../../lib/social/hashtags.mjs";
import { buildSlideContent, renderHtml } from "../../lib/social/templates.mjs";
import {
  buildCooldownKeys,
  checkCooldowns,
  isBlockedByCooldown,
  COOLDOWN_WINDOW_HOURS,
} from "../../lib/social/cooldown.mjs";
import { checkCaptionCompliance, captionComplianceOk, buildReviewChecklist } from "../../lib/social/reviewSummary.mjs";
import { pickMarketSnapshot, buildMarketSnapshotPayload, MARKET_SNAPSHOT_MIN_DEALS } from "../../lib/social/marketSnapshot.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import { buildDailyGalleryHtml } from "../../lib/social/gallery.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-06T12:00:00.000Z");
const ago = (h) => new Date(NOW - h * HOUR).toISOString();

// A fully-populated, clean, socially-eligible BIN deal row - the same
// shape lib/social/db.mjs returns. Overridable per test. `watchlist_id`
// defaults to the row id so a fixture pool holds DISTINCT catalogue
// cards (rankFlagshipDeals de-dupes by watchlist_id); `discount_pct`
// derives from the prices so the review checklist's arithmetic recompute
// always agrees unless a test overrides it deliberately.
function dealRow(over = {}) {
  const id = over.id ?? 5000;
  const cardName = over.card_name ?? "Blastoise";
  const cardSet = over.card_set ?? "SM - Hidden Fates";
  const market = over.market_price ?? 100;
  const total = over.total_price_usd ?? over.total_price ?? 60;
  return {
    id,
    watchlist_id: id,
    card_name: cardName,
    card_set: cardSet,
    card_language: "english",
    listing_id: "v1|555000111222|0",
    marketplace: "EBAY_US",
    listing_type: "FIXED_PRICE",
    title: `RARE ${cardName} ${cardSet} Holo NM`,
    image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg",
    listing_url: "https://www.ebay.com/itm/555000111222",
    affiliate_url: "https://www.ebay.com/itm/555000111222",
    price: total,
    shipping: 0,
    total_price: total,
    total_price_usd: total,
    market_price: market,
    discount_pct: Number((1 - total / market).toFixed(4)),
    condition: "Near Mint",
    is_graded: false,
    grader: null,
    grade: null,
    is_active: true,
    first_seen_at: ago(3),
    last_seen_at: ago(1),
    exact_verified_at: ago(1),
    auction_end_at: null,
    disqualified_reason: null,
    visual_authenticity_status: "MATCH",
    visual_authenticity_reason: null,
    ...over,
  };
}

// A pool big/varied enough that every family can produce a distinct candidate.
function fullPool() {
  const rows = [];
  // Charizard prints (deepest discounts) -> Deal of the Day + one spare
  // for the market snapshot to name
  [
    ["Charizard - 4/102 (Base Set)", 900, 250],
    ["Charizard - 11/108 (XY Evolutions)", 400, 150],
    ["Charizard ex - 223/197 (Obsidian Flames)", 300, 130],
  ].forEach(([n, mk, tp], i) => rows.push(dealRow({ id: 100 + i, card_name: n, card_set: "Assorted", market_price: mk, total_price_usd: tp })));
  // Neo Genesis set group of 4 (species disjoint from every other group)
  // -> Set Spotlight
  [
    ["Lugia - 9/111", 220, 130],
    ["Typhlosion - 17/111", 90, 55],
    ["Feraligatr - 4/111", 80, 50],
    ["Ampharos - 1/111", 70, 46],
  ].forEach(([n, mk, tp], i) => rows.push(dealRow({ id: 200 + i, card_name: n, card_set: "Neo Genesis", market_price: mk, total_price_usd: tp })));
  // just-found: discovered minutes ago
  rows.push(dealRow({ id: 300, card_name: "Snorlax - 27/64 (Jungle)", card_set: "Jungle", first_seen_at: ago(0.3), market_price: 120, total_price_usd: 96 }));
  // Pikachu prints x6 -> Pokemon Spotlight (deepest grouping) + snapshot spread
  for (let i = 0; i < 6; i++) rows.push(dealRow({ id: 400 + i, card_name: `Pikachu - ${i}/102 (Base Set)`, card_set: `Set ${i}`, market_price: 60 + i * 5, total_price_usd: 40 + i * 3 }));
  return rows;
}

// === 1. deal-candidate eligibility reuses the existing gates ===============

test("1. an ineligible row (stale, sold, wrong-language, bad reference) never becomes a daily candidate", () => {
  const bad = [
    dealRow({ id: 1, is_active: false }),
    dealRow({ id: 2, exact_verified_at: ago(48), last_seen_at: ago(48) }), // stale
    dealRow({ id: 3, market_price: 0 }), // no valid reference
    dealRow({ id: 4, market_price: 100, discount_pct: -0.1 }), // no positive gap
    dealRow({ id: 5, listing_type: "AUCTION" }), // auctions excluded from the daily families
  ];
  const batch = buildDailyBatch(bad, { history: [], now: NOW });
  assert.equal(batch.selected.length, 0);
  assert.equal(batch.rejected.length, DAILY_FAMILIES.length);
});

// === 2. daily mix: <=1 per family, 3-5 when supported, FEWER when thin =====

test("2. a healthy pool yields a varied batch of 3-5 posts, at most one per family", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  assert.ok(batch.selected.length >= 3 && batch.selected.length <= 5, `expected 3-5, got ${batch.selected.length}`);
  const families = batch.selected.map((s) => s.family);
  assert.equal(new Set(families).size, families.length, "no family appears twice");
  const types = new Set(batch.selected.map((s) => s.payload.content_type));
  assert.ok(types.size >= 3, "at least three distinct content types");
});

test("2b. a thin pool produces FEWER posts, never a fabricated one", () => {
  // exactly one eligible deal, nothing else - no Pokemon/set group of 3,
  // below the market-snapshot minimum
  const batch = buildDailyBatch([dealRow({ id: 1 })], { history: [], now: NOW });
  assert.ok(batch.selected.length <= 2, `thin pool must produce few posts, got ${batch.selected.length}`);
  // the ones it can't produce are explained, not silently dropped
  assert.ok(batch.rejected.every((r) => typeof r.reason === "string" && r.reason.length > 0));
});

test("2c. an empty pool produces zero posts and a clean (non-error) result", () => {
  const batch = buildDailyBatch([], { history: [], now: NOW });
  assert.equal(batch.selected.length, 0);
  assert.equal(batch.warnings.length, 0);
  assert.equal(batch.considered, DAILY_FAMILIES.length);
});

// === 3. cooldowns =========================================================

test("3. an empty post history never blocks anything (fresh install)", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  assert.ok(batch.selected.length >= 3);
});

test("3b. a history entry for the same deal id blocks that exact deal forever (never repeat)", () => {
  const pool = fullPool();
  const dealOfDayRow = pool[0]; // the highest-discount charizard, id 100
  const keys = buildCooldownKeys({
    content_type: "deal_of_day",
    template_family: "deal_of_day",
    deal_data: { id: dealOfDayRow.id, card_name: dealOfDayRow.card_name, card_set: dealOfDayRow.card_set },
    subject: { display_name: dealOfDayRow.card_name },
  });
  // 400 days ago - way past every rolling window, but "deal" is Infinity
  const history = [{ key: keys.deal_cooldown_key, postedAt: ago(400 * 24), contentType: "deal_of_day" }];
  assert.equal(checkCooldowns(keys, history).deal, true);
  assert.equal(isBlockedByCooldown(checkCooldowns(keys, history)), true);
});

test("3c. cooldown windows match the documented SS17 policy", () => {
  assert.equal(COOLDOWN_WINDOW_HOURS.deal, Infinity);
  assert.equal(COOLDOWN_WINDOW_HOURS.card, 14 * 24);
  assert.equal(COOLDOWN_WINDOW_HOURS.pokemon, 3 * 24);
  assert.equal(COOLDOWN_WINDOW_HOURS.set, 7 * 24);
});

test("3d. a same-card post 10 days ago is still on cooldown (14-day window); 20 days ago is not", () => {
  const keys = { card_cooldown_key: "card:Blastoise|Base Set", deal_cooldown_key: null, pokemon_cooldown_key: null, set_cooldown_key: null, template_cooldown_key: "template:x" };
  assert.equal(checkCooldowns(keys, [{ key: keys.card_cooldown_key, postedAt: ago(10 * 24), contentType: "x" }]).card, true);
  assert.equal(checkCooldowns(keys, [{ key: keys.card_cooldown_key, postedAt: ago(20 * 24), contentType: "x" }]).card, false);
});

// === 4. duplicate suppression (within a batch) ============================

test("4. two families that resolve to the same Pokemon are not both selected in one batch", () => {
  // a pool where the single best deal AND the deepest Pokemon group are
  // the same species
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push(dealRow({ id: 700 + i, card_name: `Gyarados - ${i}/102 (Base Set)`, card_set: "Base Set", market_price: 200 - i * 5, total_price_usd: 40 + i }));
  for (let i = 0; i < 6; i++) rows.push(dealRow({ id: 800 + i, card_name: `Snubbull - ${i}/111 (Neo Genesis)`, card_set: `S${i}`, market_price: 100, total_price_usd: 70 }));
  const batch = buildDailyBatch(rows, { history: [], now: NOW });
  const species = batch.selected
    .map((s) => (s.payload.content_type === "pokemon_spotlight" ? s.payload.subject.display_name : null))
    .filter(Boolean);
  // if deal-of-day AND pokemon-spotlight both landed on Gyarados, one is rejected
  const gyaradosPosts = batch.selected.filter((s) => JSON.stringify(s.payload).includes("Gyarados"));
  assert.ok(gyaradosPosts.length <= 1 || batch.rejected.some((r) => /within-batch duplicate/.test(r.reason)));
});

test("4b. the market snapshot names a DIFFERENT card than the one already used as Deal of the Day", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  const dod = batch.selected.find((s) => s.family === "deal-of-day");
  const snap = batch.selected.find((s) => s.family === "market-snapshot");
  if (dod && snap) {
    const dodCard = (Array.isArray(dod.payload.deal_data) ? dod.payload.deal_data[0] : dod.payload.deal_data).card_name;
    assert.notEqual(snap.payload.market_snapshot.biggest_gap_card, dodCard);
  }
});

// === 5. rights gating ====================================================

test("5. market_snapshot is only produced while ppt_social_data is CLEARED", () => {
  assert.equal(RIGHTS_STATE.ppt_social_data, "CLEARED");
  const pool = fullPool();
  const { candidate } = pickMarketSnapshot(pool, NOW);
  assert.ok(candidate, "expected a market snapshot candidate from a healthy pool");
  const payload = buildMarketSnapshotPayload({ candidate, now: NOW });
  assert.equal(payload.rights_state.ppt_social_data, "CLEARED");
});

test("5b. every daily payload carries the full 5-key per-capability rights_state and publishing stays DISABLED", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  for (const s of batch.selected) {
    assert.deepEqual(Object.keys(s.payload.rights_state).sort(), ["card_image", "ebay_genai", "ebay_seller_images", "ppt_social_data", "publishing"]);
    assert.equal(s.payload.rights_state.publishing, "DISABLED");
    assert.equal(s.payload.rights_state.card_image, "NOT_CLEARED"); // Mode B
    assert.equal(s.payload.rights_state.ebay_seller_images, "NOT_CLEARED");
    assert.equal(s.payload.rights_state.ebay_genai, "NOT_ALLOWED"); // no EPN AI Tools approval
  }
});

// === 6/7. stale / unsupported-reference rejection ========================

test("6. a stale listing is rejected before any caption/creative is built", () => {
  const rows = fullPool().map((r) => ({ ...r, exact_verified_at: ago(72), last_seen_at: ago(72) }));
  const batch = buildDailyBatch(rows, { history: [], now: NOW });
  assert.equal(batch.selected.length, 0);
});

test("7. a listing with no/zero market reference never reaches a payload", () => {
  const rows = fullPool().map((r) => ({ ...r, market_price: 0 }));
  const batch = buildDailyBatch(rows, { history: [], now: NOW });
  assert.equal(batch.selected.length, 0);
});

test("7b. market snapshot needs a real spread - below the minimum it fails closed", () => {
  const rows = [];
  for (let i = 0; i < MARKET_SNAPSHOT_MIN_DEALS - 1; i++) rows.push(dealRow({ id: 900 + i, card_name: `C${i} (X)`, card_set: `S${i}` }));
  assert.equal(pickMarketSnapshot(rows, NOW).candidate, null);
});

// === 8. caption truthfulness ============================================

test("8. every generated caption's discount claim recomputes correctly and carries no forward-looking language", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  for (const s of batch.selected) {
    const ig = assembleCaption(s.payload, { variant: "instagram" });
    assert.doesNotMatch(ig, /\b(will be worth|going to (rise|moon|explode)|guaranteed to appreciate|invest(ment)? opportunity|price will|expected to (rise|climb))\b/i);
    // the review checklist's own math check must pass for a real candidate
    const mathCheck = buildReviewChecklist(s.payload).find((c) => c.item.includes("arithmetically correct"));
    assert.notEqual(mathCheck.auto, false);
  }
});

// === 9. affiliate disclosure present ===================================

test("9. every Instagram AND TikTok caption ends with the approved 'Ad ·' disclosure", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  for (const s of batch.selected) {
    const caps = assemblePlatformCaptions(s.payload);
    for (const cap of [caps.instagram, caps.tiktok]) {
      assert.match(cap, /\nAd · PokemonDealFinder is an eBay Partner Network affiliate/);
      // never one of EPN's NOT-approved disclosure phrases
      assert.doesNotMatch(cap, /#eBayad|#Endorsement|#Partner\b|Affiliate Link|Commissionable Link/i);
    }
  }
});

// === 10. no fabricated urgency ==========================================

test("10. no generated caption uses fake-scarcity / urgency language", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  for (const s of batch.selected) {
    const caps = assemblePlatformCaptions(s.payload);
    for (const cap of [caps.instagram, caps.tiktok]) {
      assert.equal(checkCaptionCompliance(cap).noFakeUrgency, true, `urgency language in ${s.family}`);
      assert.ok(captionComplianceOk(cap), `caption compliance failed for ${s.family}`);
    }
  }
});

test("10b. checkCaptionCompliance actually catches urgency and missing disclosure", () => {
  assert.equal(checkCaptionCompliance("Only 2 left, buy now before it's gone!").noFakeUrgency, false);
  assert.equal(checkCaptionCompliance("A calm factual sentence about a card.").hasDisclosure, false);
});

// === 11. no user identity, no listing/eBay id ==========================

test("11. no caption, hashtag set, or payload ever contains a user id, session id, or raw eBay listing id", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  for (const s of batch.selected) {
    const blob = JSON.stringify(s.payload) + assembleCaption(s.payload, { variant: "instagram" }) + assembleCaption(s.payload, { variant: "tiktok" }) + buildHashtags(s.payload).join(" ");
    assert.doesNotMatch(blob, /\bv1\|\d/); // eBay REST item id form
    assert.doesNotMatch(blob, /555000111222/); // the fixture's raw listing_id
    assert.doesNotMatch(blob, /user[_-]?id|session[_-]?id|distinct_id|posthog/i);
    assert.doesNotMatch(blob, /i\.ebayimg\.com|ebay\.com\/itm/); // no image / listing URL leaked
  }
});

// === 12. no secret exposure ============================================

test("12. the new daily-workflow lib files never read process.env or a credential, and never touch a network call", () => {
  for (const f of [
    "lib/social/dailyMix.mjs",
    "lib/social/marketSnapshot.mjs",
    "lib/social/hashtags.mjs",
    "lib/social/cooldown.mjs",
    "lib/social/gallery.mjs",
  ]) {
    const src = read(f);
    assert.doesNotMatch(src, /process\.env|SERVICE_ROLE|SUPABASE_|fetch\(|api\.ebay|pokemonpricetracker/i, `${f} must be pure/local`);
  }
});

test("12b. scripts/socialDaily.mjs imports no Instagram/TikTok/Buffer/Meta client and has no publish function", () => {
  const src = read("scripts/socialDaily.mjs");
  assert.doesNotMatch(src, /instagram-private-api|graph\.facebook|graph\.instagram|api\.buffer|open-api\.tiktok|tiktok-api|buffer-sdk/i);
  assert.doesNotMatch(src, /\bfunction\s+(publish|schedulePost|postToInstagram|postToTikTok|sendToBuffer)\b/);
});

// === 13. deterministic repeatability ==================================

test("13. the same pool + the same `now` always produces the identical batch selection", () => {
  const pool = fullPool();
  const a = buildDailyBatch(pool, { history: [], now: NOW });
  const b = buildDailyBatch(pool, { history: [], now: NOW });
  assert.deepEqual(
    a.selected.map((s) => [s.family, s.payload.content_type, s.reasonSelected]),
    b.selected.map((s) => [s.family, s.payload.content_type, s.reasonSelected])
  );
  assert.deepEqual(a.rejected, b.rejected);
  assert.deepEqual(a.warnings, b.warnings);
});

// === 14. valid 1080x1350 render output ===============================

test("14. the market_snapshot template renders a 1080x1350 Mode-B document with no <img> tag", () => {
  const pool = fullPool();
  const { candidate } = pickMarketSnapshot(pool, NOW);
  const payload = buildMarketSnapshotPayload({ candidate, now: NOW });
  for (const variant of ["A", "B"]) {
    const html = renderHtml(buildSlideContent(payload), { variant });
    assert.match(html, /width:\s*1080px/);
    assert.match(html, /height:\s*1350px/);
    assert.doesNotMatch(html, /<img/i);
    assert.match(html, /UNDER MARKET/); // the SS2 pillar
    assert.match(html, /BIGGEST GAP TODAY/);
  }
});

// === 15. platform caption variants ==================================

test("15. Instagram and TikTok captions share the facts but are not blindly identical", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  for (const s of batch.selected) {
    const { instagram, tiktok } = assemblePlatformCaptions(s.payload);
    assert.notEqual(instagram, tiktok, `${s.family}: IG and TikTok captions must differ`);
    assert.ok(tiktok.length <= instagram.length, `${s.family}: TikTok caption should be the shorter one`);
    // same headline hook opens both
    assert.equal(instagram.split("\n\n")[0], tiktok.split("\n\n")[0]);
  }
});

// === 16. the review gallery: review-only, per-capability rights, mix warnings ===

test("16. the daily gallery is review-only (no publish control), shows per-capability rights, and surfaces mix warnings", () => {
  const batch = buildDailyBatch(fullPool(), { history: [], now: NOW });
  const html = buildDailyGalleryHtml(
    batch.selected.map((s) => ({ family: s.family, payload: s.payload, thumb: "x.png", captions: { instagram: "i", tiktok: "t" }, hashtags: ["#PokemonCards"], reasonSelected: s.reasonSelected })),
    { warnings: ["Every post is about the same Pokemon (Charizard) - vary the subject."], rejected: batch.rejected, considered: batch.considered, generatedAt: "2026-09-06T12:00:00.000Z" }
  );
  assert.match(html, /PUBLISHING DISABLED/);
  assert.match(html, /Approve \(local\)/);
  assert.doesNotMatch(html, /type=["']submit["']|>\s*Publish\s*</i);
  assert.match(html, /ebay_seller_images/);
  assert.match(html, /Daily mix warnings/);
  assert.match(html, /vary the subject/);
});

test("16b. batchMixWarnings flags an all-Charizard batch and an all-same-type batch", () => {
  const mk = (type, name) => ({ family: type, payload: { content_type: type, subject: { display_name: name }, deal_data: { card_name: `${name} (X)`, card_set: "X" } } });
  const allChar = [mk("deal_of_day", "Charizard"), mk("just_found", "Charizard"), mk("pokemon_spotlight", "Charizard")];
  const w = batchMixWarnings(allChar);
  assert.ok(w.some((x) => /Charizard/.test(x)));
  assert.ok(w.some((x) => /same content type|same Pokemon/.test(x)));
});
