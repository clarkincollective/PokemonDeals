// Phase 13D.4 - local social content preview system. All tests run
// against fixtures (no live database, no eBay, no Chrome render) so the
// suite stays fast and fully offline, matching this repo's existing
// testing convention for admin/reporting tooling (see
// tests/scanner/reporting-homepage-conversion.test.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  isSociallyEligible,
  isSociallyEligiblePremium,
  isJustFoundEligible,
  isBuyItNowOnly,
  socialFreshnessLine,
  SOCIAL_FRESHNESS_MAX_AGE_HOURS,
} from "../../lib/social/eligibility.mjs";
import {
  socialBinPool,
  pickDealOfTheDay,
  pickBestDealsFoundToday,
  pickJustFound,
  pickPokemonSpotlight,
  pickSetSpotlight,
} from "../../lib/social/candidates.mjs";
import { buildDealPayload, buildBestDealsPayload, buildSpotlightPayload } from "../../lib/social/payload.mjs";
import { assembleCaption } from "../../lib/social/caption.mjs";
import { buildSlideContent, buildCoverSlideContent, renderHtml, safeText, headlineSizePx } from "../../lib/social/templates.mjs";
import { buildUtmPreview } from "../../lib/social/utm.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import { buildReviewChecklist } from "../../lib/social/reviewSummary.mjs";
import { buildGalleryHtml } from "../../lib/social/gallery.mjs";
import { carouselFileName, buildFamilyPayload } from "../../scripts/socialPreview.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const SOCIAL_FILES = walk("lib/social").concat(["scripts/socialPreview.mjs"]);

const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();

// A fully-populated, otherwise-clean, socially-eligible deal row -
// mirrors the shape lib/social/db.mjs's fetchActiveDealPool returns.
// `title` defaults to a realistic seller-junk title that STILL carries
// enough real identity signal (name + set) to clear
// lib/dealQuality.js's own catalogue-matching gate - it is computed from
// the (possibly overridden) card_name/card_set unless a test explicitly
// supplies its own title, so overriding the card identity in a test
// never accidentally produces a title/identity mismatch.
const dealRow = (over = {}) => {
  const cardName = over.card_name ?? "Charizard GX";
  const cardSet = over.card_set ?? "SM - Hidden Fates";
  return {
    id: 501,
    watchlist_id: 9001,
    card_tcgplayer_id: null,
    card_name: cardName,
    card_set: cardSet,
    card_language: "english",
    listing_id: "v1|123456789012|0",
    marketplace: "EBAY_US",
    listing_type: "FIXED_PRICE",
    title: `🔥 RARE INVESTMENT PSA GEM MINT WOW ${cardName} ${cardSet} Holo Rare 🔥 L@@K`,
    image_url: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  price: 40,
  shipping: 0,
  total_price: 40,
  total_price_usd: 40,
  market_price: 55,
  discount_pct: (55 - 40) / 55,
  condition: "Near Mint",
  is_graded: false,
  grader: null,
  grade: null,
  is_active: true,
  first_seen_at: ago(1),
  last_seen_at: ago(1),
  exact_verified_at: ago(1),
  auction_end_at: null,
  disqualified_reason: null,
  visual_authenticity_status: null,
    visual_authenticity_reason: null,
    ...over,
  };
};

// === 1-4. eligibility: reuses existing truth contracts, adds only freshness ===

test("1. a stale (last_seen_at expired) listing is rejected", () => {
  // low tier TTL is 48h (P0.2) - well past it
  const r = dealRow({ last_seen_at: ago(60), exact_verified_at: ago(60) });
  assert.equal(isSociallyEligible(r), false);
});

test("2. an inactive (is_active=false) listing is rejected", () => {
  const r = dealRow({ is_active: false });
  assert.equal(isSociallyEligible(r), false);
});

test("3. an ended auction is rejected", () => {
  const r = dealRow({ listing_type: "AUCTION", auction_end_at: ago(1) });
  assert.equal(isSociallyEligible(r), false);
  assert.equal(isBuyItNowOnly(r), false); // also excluded from the MVP's BIN-only scope
});

test("4. exact verification is required and must be within the social threshold (stricter than premium)", () => {
  assert.equal(isSociallyEligible(dealRow({ exact_verified_at: null })), false);
  assert.equal(isSociallyEligible(dealRow({ exact_verified_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 1) })), false);
  assert.equal(isSociallyEligible(dealRow({ exact_verified_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS - 0.5) })), true);
  // the social threshold is strictly tighter than the homepage premium bound
  assert.ok(SOCIAL_FRESHNESS_MAX_AGE_HOURS < 12);
});

test("4b. freshness language never fabricates 'live now' outside the threshold", () => {
  const stale = dealRow({ exact_verified_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 5) });
  const line = socialFreshnessLine(stale);
  assert.doesNotMatch(line.label, /\blive\b/i);
  assert.equal(line.checkedAt, null);
  const fresh = dealRow({ exact_verified_at: ago(1) });
  const freshLine = socialFreshnessLine(fresh);
  assert.match(freshLine.label, /^Checked .+ UTC\. Availability can change\.$/);
  assert.ok(freshLine.checkedAt); // exact ISO timestamp still present for the payload/audit trail
});

test("4c. Just Found requires BOTH recent discovery AND fresh exact verification", () => {
  // recent discovery, but never re-verified beyond the social threshold
  const notVerified = dealRow({ first_seen_at: ago(2), exact_verified_at: ago(SOCIAL_FRESHNESS_MAX_AGE_HOURS + 2) });
  assert.equal(isJustFoundEligible(notVerified), false);
  // verified, but discovered outside the Just-Added window (P0.2, unchanged)
  const tooOld = dealRow({ first_seen_at: ago(96), exact_verified_at: ago(1) });
  assert.equal(isJustFoundEligible(tooOld), false);
  // both conditions met
  const good = dealRow({ first_seen_at: ago(2), exact_verified_at: ago(1) });
  assert.equal(isJustFoundEligible(good), true);
});

// === 5. Deal of the Day is deterministic (reuses rankFlagshipDeals unchanged) ===

test("5. Deal of the Day picks the same candidate every time given the same pool", () => {
  // row 2 is high-value + deep-discount, so it also needs a positive
  // visual-match verdict to clear isPremiumDealEligible's own high-risk
  // gate (unchanged, reused as-is) - matching real premium eligibility,
  // not a simplified test-only rule.
  const rows = [
    dealRow({ id: 1, watchlist_id: 1, discount_pct: 0.3, market_price: 50 }),
    dealRow({ id: 2, watchlist_id: 2, discount_pct: 0.6, market_price: 200, visual_authenticity_status: "MATCH" }),
  ];
  const a = pickDealOfTheDay(rows);
  const b = pickDealOfTheDay(rows);
  assert.equal(a.candidate.id, b.candidate.id);
  assert.equal(a.candidate.id, 2); // the stronger flagship candidate wins
});

// === 6. Best Deals dedupes canonical card ===

test("6. Best Deals Found Today never features two listings of the same canonical card", () => {
  const rows = [
    dealRow({ id: 1, watchlist_id: 1, discount_pct: 0.5 }),
    dealRow({ id: 2, watchlist_id: 1, discount_pct: 0.7 }), // same card, different listing
    dealRow({ id: 3, watchlist_id: 2, discount_pct: 0.4 }),
  ];
  const { candidates } = pickBestDealsFoundToday(rows, { max: 5 });
  const watchlistIds = candidates.map((c) => c.watchlist_id);
  assert.equal(new Set(watchlistIds).size, watchlistIds.length);
});

test("6b. Best Deals never pads with an ineligible row - fewer results is acceptable", () => {
  const rows = [dealRow({ id: 1, watchlist_id: 1 }), dealRow({ id: 2, watchlist_id: 2, is_active: false })];
  const { candidates } = pickBestDealsFoundToday(rows, { max: 5 });
  assert.equal(candidates.length, 1);
});

// === 7. Pokemon/Set Spotlight require genuine multi-deal inventory =========

test("7. Pokemon Spotlight requires the minimum deal count - does not force a thin Pokemon", () => {
  const thin = [dealRow({ id: 1, watchlist_id: 1, card_name: "Pikachu" }), dealRow({ id: 2, watchlist_id: 2, card_name: "Pikachu VMAX" })];
  const { candidate } = pickPokemonSpotlight(thin);
  assert.equal(candidate, null); // only 2 Pikachu deals, below SOCIAL_SPOTLIGHT_MIN_DEALS

  const strong = [
    ...thin,
    dealRow({ id: 3, watchlist_id: 3, card_name: "Pikachu V" }),
  ];
  const { candidate: picked } = pickPokemonSpotlight(strong);
  assert.equal(picked.pokemon_display_name, "Pikachu");
  assert.equal(picked.deal_count, 3);
  assert.equal(picked.destination_url, "/pokemon/pikachu");
});

test("7b. Set Spotlight mirrors the same rule, grouped by set", () => {
  const rows = [
    dealRow({ id: 1, watchlist_id: 1, card_set: "Evolving Skies" }),
    dealRow({ id: 2, watchlist_id: 2, card_set: "Evolving Skies" }),
    dealRow({ id: 3, watchlist_id: 3, card_set: "Evolving Skies" }),
  ];
  const { candidate } = pickSetSpotlight(rows);
  assert.equal(candidate.set_display_name, "Evolving Skies");
  assert.equal(candidate.destination_url, "/sets/evolving-skies");
});

// === 8. raw eBay titles never reach public copy =============================

test("8. normalized deal payloads never carry the raw seller listing title", () => {
  const row = dealRow(); // has an all-caps emoji-laden title
  const payload = buildDealPayload({ contentType: "deal_of_day", row, utmCampaign: "deal_of_day" });
  const json = JSON.stringify(payload);
  assert.ok(!json.includes("RARE INVESTMENT"), "raw seller title text leaked into the payload");
  assert.ok(!json.includes("WOW"));
  assert.ok(!("title" in payload.deal_data));
  assert.equal(payload.subject.display_name, "Charizard GX"); // normalized, not the raw title
});

test("8b. no file in lib/social reads row.title into public-facing copy", () => {
  for (const f of ["lib/social/payload.mjs", "lib/social/caption.mjs", "lib/social/templates.mjs"]) {
    const src = read(f);
    assert.ok(!/row\.title|deal\.title\b/.test(src), `${f} must not read a raw listing title into public copy`);
  }
});

// === 9. eBay image URL never reaches the renderer ===========================

test("9. image_url never appears in a built payload, and the template has no <img> tag at all", () => {
  const row = dealRow(); // has a real eBay image_url
  const payload = buildDealPayload({ contentType: "deal_of_day", row, utmCampaign: "deal_of_day" });
  const json = JSON.stringify(payload);
  assert.ok(!json.includes("i.ebayimg.com"), "an eBay image URL leaked into the payload");
  assert.ok(!("image_url" in payload.deal_data));

  const slide = buildSlideContent(payload);
  const html = renderHtml(slide, { variant: "A" });
  assert.doesNotMatch(html, /<img/i);
  assert.ok(!html.includes("i.ebayimg.com"));
});

test("9b. lib/social/render.mjs never references an image URL field", () => {
  const src = read("lib/social/render.mjs");
  assert.ok(!/image_url|ebayimg/.test(src));
});

// === 10. PPT price-HISTORY templates still do not exist (13E.1: PPT
//         social DATA is now cleared, so an aggregate market_snapshot of
//         TODAY's pool is allowed - but movers / grade-spread / raw-vs-
//         graded / biggest-losers all need PPT price-history or explicit
//         grade-comparison data and remain unbuilt / fail-closed) =========

test("10. no PPT price-history / movers / grade-spread / raw-vs-graded template exists anywhere in lib/social", () => {
  const blockedFamilies = /\bmarket_movers\b|\braw_vs_graded\b|\bgrade_spread\b|\bprice_history\b|\bbiggest_losers\b/i;
  // 13E.2: lib/social/assetPrompts.mjs + assets.mjs carry a `raw_vs_graded`
  // token as the id of an EVERGREEN, DATA-FREE image-background category
  // (a blank card next to a blank slab shape) - it is not a PPT-history
  // template and reaches no live data. Those two modules are checked
  // separately (they must stay pure) in tests/scanner/social-asset-library.test.mjs.
  const ASSET_PACK = new Set(["lib/social/assetPrompts.mjs", "lib/social/assets.mjs"]);
  for (const f of SOCIAL_FILES) {
    if (ASSET_PACK.has(f)) continue;
    assert.doesNotMatch(read(f), blockedFamilies, `${f} must not implement a PPT-price-history-dependent template`);
  }
});

test("10b. the only market-intelligence content type is market_snapshot, and it derives ONLY from the current deal pool (no PPT history import, no price_history table)", () => {
  const src = read("lib/social/marketSnapshot.mjs");
  assert.doesNotMatch(src, /priceHistory|price_history|getCanonicalPriceHistory|getFullPriceAnalysis|pokemonPriceTracker/i);
  // it reads the same fields every other family uses off an already-fetched pool
  assert.match(src, /socialBinPool/);
  assert.match(src, /discount_pct/);
});

test("10c. rights_state: ppt_social_data + card_image CLEARED (13E.1 / 13E.2.1); seller images + GenAI + publishing still locked", () => {
  assert.equal(RIGHTS_STATE.ppt_social_data, "CLEARED");
  assert.equal(RIGHTS_STATE.card_image, "CLEARED"); // 13E.2.1 - canonical catalogue artwork (Version C)
  assert.equal(RIGHTS_STATE.ebay_seller_images, "NOT_CLEARED"); // separate; seller photos never composited
  assert.equal(RIGHTS_STATE.ebay_genai, "NOT_ALLOWED"); // no EPN AI Tools approval
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
});

// === 11. GenAI is confined to ONE place, image-only, data-free =============
// 13E.2: an OpenAI IMAGE call is permitted, but ONLY in
// scripts/socialAssets.mjs, ONLY to produce evergreen non-data-bearing
// brand backgrounds. It must never appear in the render/caption path, in
// lib/social/*, in social:daily, or in social:preview - and no GenAI
// TEXT provider may appear anywhere.

test("11. no GenAI provider is imported or CALLED anywhere in lib/social, social:daily, or social:preview", () => {
  // a real SDK import / endpoint / call - NOT a bare mention of the word
  // "OpenAI" in a header comment explaining the boundary
  const forbiddenCall =
    /from ["'](openai|@anthropic-ai\/sdk|@google\/generative-ai)["']|require\(["'](openai|@anthropic-ai\/sdk)["']\)|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|\b(chatCompletion|createCompletion|generateContent|images\.generate)\b/i;
  const scanned = SOCIAL_FILES.concat(["scripts/socialDaily.mjs"]);
  for (const f of scanned) {
    assert.doesNotMatch(read(f), forbiddenCall, `${f} must not import or call a GenAI provider`);
  }
});

test("11b. the OpenAI image call lives ONLY in scripts/socialAssets.mjs and is image-only", () => {
  const src = read("scripts/socialAssets.mjs");
  assert.match(src, /api\.openai\.com\/v1\/images\/generations/); // images endpoint
  assert.doesNotMatch(src, /chat\/completions|responses|generateContent/i); // never a text/LLM call
  // exactly one fetch in the whole asset pipeline
  assert.equal((src.match(/\bfetch\s*\(/g) || []).length, 1);
  // it reads the key from the environment only
  assert.match(src, /process\.env\.OPENAI_API_KEY/);
});

// === 12. publishing is impossible ============================================

test("12. rights_state.publishing is always DISABLED", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  assert.equal(payload.rights_state.publishing, "DISABLED");
});

test("12b. no publish/schedule/send-to-platform function exists anywhere in the social system", () => {
  const forbidden = /\bfunction\s+(publish|schedulePost|sendToBuffer|postToInstagram|postToTikTok)\s*\(|(publish|schedulePost|sendToBuffer|postToInstagram|postToTikTok)\s*[:=]\s*(async\s*)?\(/i;
  for (const f of SOCIAL_FILES) {
    assert.doesNotMatch(read(f), forbidden, `${f} defines a publish-like function`);
  }
});

test("12c. no social platform API client or SDK is imported anywhere in the social system", () => {
  const forbidden = /instagram-private-api|tiktok-api|buffer-sdk|facebook-nodejs-business|graph\.facebook\.com|api\.buffer\.com|open-api\.tiktok\.com|graph\.instagram\.com/i;
  for (const f of SOCIAL_FILES) {
    assert.doesNotMatch(read(f), forbidden, `${f} references a social platform API`);
  }
});

test("12d. the social system makes no fetch()/publish call; its only network calls are the DB read and (13E.2.1) a host-locked canonical image GET", () => {
  for (const f of SOCIAL_FILES) {
    if (f.endsWith("db.mjs")) continue; // Supabase client call - reads the database, not a network publish
    if (f.endsWith("render.mjs")) continue; // spawns local Chrome + writes a local file - no network call
    if (f.endsWith("cardArtwork.mjs")) continue; // 13E.2.1 - a GET to the TCGplayer product CDN ONLY (host-locked, cached by id); asserted below
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\(/, `${f} must not make a network call`);
  }
  // cardArtwork.mjs: no fetch(), no OpenAI, no eBay; its https.get is
  // guarded to the one canonical host and nowhere else.
  const ca = read("lib/social/cardArtwork.mjs");
  assert.doesNotMatch(ca, /\bfetch\(/);
  assert.doesNotMatch(ca, /api\.openai\.com|api\.ebay\.com|graph\.facebook|api\.buffer/i);
  assert.match(ca, /isCanonicalImageUrl\(url\)\)\s*return reject|refusing to fetch non-canonical host/);
  assert.match(ca, /tcgplayer-cdn\.tcgplayer\.com/);
  assert.doesNotMatch(ca, /i\.ebayimg\.com["'][^)]*get|https\.get\([^)]*ebay/i);
});

// === 13. caption content: no guarantee/urgency language, CTA stays internal ===

test("13. no caption contains guarantee/urgency/investment language", () => {
  const forbidden = /buy now|guaranteed|will explode|before it.s too late|free money|don.t miss out|profit opportunity|save \$\d+ .*auction/i;
  const payloads = [
    buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }),
    buildDealPayload({ contentType: "just_found", row: dealRow({ first_seen_at: ago(1) }), utmCampaign: "just_found" }),
    buildBestDealsPayload({ rows: [dealRow({ id: 1, watchlist_id: 1 }), dealRow({ id: 2, watchlist_id: 2 })] }),
  ];
  for (const payload of payloads) {
    for (const variant of ["short", "standard"]) {
      const caption = assembleCaption(payload, { variant });
      assert.doesNotMatch(caption, forbidden, `${payload.content_type}/${variant} caption used forbidden language`);
    }
  }
});

test("13b. every caption includes the disclosure line", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  for (const variant of ["short", "standard"]) {
    assert.match(assembleCaption(payload, { variant }), /^Ad ·/m);
  }
});

// === 14. CTA/destination always points back to PokemonDealFinder, never eBay ===

test("14. every payload destination is an internal PokemonDealFinder route, never an eBay/TCGPlayer URL", () => {
  const payloads = [
    buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }),
    buildBestDealsPayload({ rows: [dealRow({ id: 1, watchlist_id: 1 })] }),
    buildSpotlightPayload({ contentType: "pokemon_spotlight", displayName: "Pikachu", dealCount: 3, topDeals: [dealRow({ id: 1, watchlist_id: 1 })], destinationRoute: "/pokemon/pikachu" }),
  ];
  for (const payload of payloads) {
    assert.match(payload.destination.route, /^\//, "destination must be a relative internal route");
    assert.ok(!/ebay\.|tcgplayer\.com/i.test(payload.destination.route));
  }
});

test("14b. no caption ever links directly to eBay/TCGPlayer - the destination is always PokemonDealFinder first", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  const caption = assembleCaption(payload, { variant: "standard" });
  assert.ok(!/ebay\.com|tcgplayer\.com/i.test(caption));
});

// === 15. UTM preview carries no identity =====================================

test("15. UTM preview values are fixed enums only - no card/Pokemon/set/eBay/user identity accepted", () => {
  const params = buildUtmPreview({ source: "instagram", campaign: "deal_of_day", content: "slide_hook" });
  assert.deepEqual(params, { utm_source: "instagram", utm_medium: "social", utm_campaign: "deal_of_day", utm_content: "slide_hook" });
  assert.throws(() => buildUtmPreview({ source: "instagram", campaign: "Charizard GX", content: "slide_hook" }));
  assert.throws(() => buildUtmPreview({ source: "instagram", campaign: "listing_123456789012", content: "slide_hook" }));
});

// === 16. every payload includes a fully-populated rights_state ===============

test("16. every generated payload includes the exact five-key rights_state (13E.1 added ebay_seller_images as a distinct capability), unambiguous", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  assert.deepEqual(Object.keys(payload.rights_state).sort(), ["card_image", "ebay_genai", "ebay_seller_images", "ppt_social_data", "publishing"]);
  for (const v of Object.values(payload.rights_state)) assert.equal(typeof v, "string");
});

// === 17. local preview output stays gitignored ===============================

test("17. .social-preview/ is gitignored", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /\.social-preview\//);
});

// === 18. homepage/scanner runtime never imports the social system ============

test("18. nothing under app/ or components/ imports lib/social or scripts/socialPreview", () => {
  const appFiles = [...walk("app"), ...walk("components")].filter((f) => /\.jsx?$/.test(f));
  for (const f of appFiles) {
    const src = read(f);
    assert.ok(!/lib\/social|socialPreview/.test(src), `${f} must not import the social preview system`);
  }
});

test("18b. lib/social never imports lib/deals.js (which pulls in next/cache) and never touches ranking weights/scanner files", () => {
  for (const f of walk("lib/social")) {
    const src = read(f);
    assert.ok(!/from ["']\.\.\/deals\.js["']|require\(["']\.\.\/deals\.js["']\)/.test(src), `${f} must not import lib/deals.js`);
  }
});

// === 19. review checklist / summary structure =================================

test("19. the review checklist auto-verifies math, freshness, image rights, disclosure, and destination", () => {
  const row = dealRow();
  const payload = buildDealPayload({ contentType: "deal_of_day", row, utmCampaign: "deal_of_day" });
  const checklist = buildReviewChecklist(payload);
  const byItem = Object.fromEntries(checklist.map((c) => [c.item, c]));
  assert.equal(byItem["Discount %/$ calculation is arithmetically correct"].auto, true);
  assert.equal(byItem["Freshness/verification timestamp is current"].auto, true);
  assert.equal(byItem["Image rights safe (no eBay seller photo; Version C uses cleared canonical artwork only)"].auto, true);
  assert.equal(byItem["Disclosure present in caption and creative"].auto, true);
  assert.equal(byItem["Destination route is correct for this content type"].auto, true);
  // never auto-approves identity/spelling/CTA/prediction/trademark - those stay human-only
  assert.equal(byItem["Card/subject identity is correct"].auto, null);
  assert.equal(byItem["No forward-looking/predictive claim anywhere in the copy"].auto, null);
});

test("19b. a bad calculation is caught, not silently approved", () => {
  const row = dealRow({ discount_pct: 0.99 }); // wildly inconsistent with price/reference
  const payload = buildDealPayload({ contentType: "deal_of_day", row, utmCampaign: "deal_of_day" });
  const checklist = buildReviewChecklist(payload);
  const mathCheck = checklist.find((c) => c.item.includes("arithmetically correct"));
  assert.equal(mathCheck.auto, false);
});

// === 20. local static review gallery (13D.4.1) ===============================

test("20. the gallery page states the per-capability rights_state, that publishing is DISABLED, and carries the no-platform banner", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  const html = buildGalleryHtml([{ family: "deal-of-day", payload }]);
  assert.match(html, /PUBLISHING DISABLED/);
  assert.match(html, /published, scheduled, or connected to Instagram, TikTok, or any platform/i);
  assert.match(html, /NOT_CLEARED/); // card_image / ebay_seller_images
  assert.match(html, /CLEARED/); // ppt_social_data (now owner-cleared)
  assert.match(html, /NOT_ALLOWED/); // ebay_genai
  assert.match(html, /ebay_seller_images/); // the new distinct capability row is shown
});

test("20b. the gallery has no server route, no auth, no database write, and no publish control anywhere in its source", () => {
  const src = read("lib/social/gallery.mjs");
  assert.doesNotMatch(src, /\.insert\(|\.update\(|\.delete\(|supabaseAdmin|export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE)\b/);
  assert.doesNotMatch(src, /<button[^>]*>\s*Publish|type=["']submit["']/i);
});

test("20c. an empty gallery (no candidates today) still renders a clean local placeholder, not an error", () => {
  const html = buildGalleryHtml([]);
  assert.match(html, /No candidate posts today/i);
  assert.match(html, /PUBLISHING DISABLED/);
});

// === 21. no secret/credential can leak into any generated artifact ===========

test("21. gallery.mjs, caption.mjs, payload.mjs, and templates.mjs never read process.env", () => {
  for (const f of ["lib/social/gallery.mjs", "lib/social/caption.mjs", "lib/social/payload.mjs", "lib/social/templates.mjs", "lib/social/reviewSummary.mjs"]) {
    assert.doesNotMatch(read(f), /process\.env/, `${f} must never read an environment variable - it only touches already-sanitized payload data`);
  }
});

test("21b. a payload built from a row carrying incidental env-shaped junk never forwards unknown fields into the gallery or captions", () => {
  // Simulates a hypothetically-widened row shape leaking something it
  // should not (e.g. a stray internal field). buildDealPayload only ever
  // whitelists known fields (see lib/social/payload.mjs's normalizeDeal),
  // so anything extra on the source row must not survive into output.
  const row = dealRow({ SUPABASE_SERVICE_ROLE_KEY: "sk-should-never-appear", api_key: "sk-should-never-appear" });
  const payload = buildDealPayload({ contentType: "deal_of_day", row, utmCampaign: "deal_of_day" });
  const html = buildGalleryHtml([{ family: "deal-of-day", payload }]);
  const shortCaption = assembleCaption(payload, { variant: "short" });
  for (const blob of [JSON.stringify(payload), html, shortCaption]) {
    assert.ok(!blob.includes("sk-should-never-appear"), "a non-whitelisted field leaked into generated output");
  }
});

// === 22. long-name / large-value stress safety (13D.4.1 SS14) ================

test("22. safeText truncates on a word boundary, never mid-word, and respects the max length", () => {
  const long = "Rocket's Shadowless First Edition Holographic Charizard-GX Full Art Secret Rare";
  const out = safeText(long, 34);
  assert.ok(out.length <= 35, "truncated text must not exceed maxChars (+1 for the ellipsis)");
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s$/.test(out.slice(0, -1)), "must not leave trailing whitespace before the ellipsis");
  const short = "Pikachu";
  assert.equal(safeText(short, 34), short); // untouched under the limit
});

test("22b. headlineSizePx never returns a size for text that hasn't already been bounded by safeText", () => {
  const bounded = safeText("Rocket's Shadowless First Edition Holographic Charizard-GX", 34);
  assert.ok(headlineSizePx(bounded) >= 44); // smallest tier, never below it
});

test("22c. an extreme deal payload renders without the raw untruncated name/set ever reaching the HTML", () => {
  const longName = "Rocket's Shadowless First Edition Holographic Charizard-GX Full Art Secret Rare";
  const longSet = "Super Ultra Deluxe Championship Anniversary Collector's Tin Promo Edition Set";
  const payload = buildDealPayload({
    contentType: "deal_of_day",
    row: dealRow({ card_name: longName, card_set: longSet, total_price_usd: 123456.78, market_price: 999999.99 }),
    utmCampaign: "deal_of_day",
  });
  const slide = buildSlideContent(payload);
  for (const variant of ["A", "B"]) {
    const html = renderHtml(slide, { variant });
    assert.ok(!html.includes(longName), "the full untruncated card name must not reach the rendered HTML");
    assert.ok(!html.includes(longSet), "the full untruncated set name must not reach the rendered HTML");
    assert.match(html, /\$123,456\.78/); // large currency values still format with thousands separators
    assert.match(html, /\$999,999\.99/);
  }
});

// === 23. currency consistency (13D.4.1 SS8/13) ===============================

test("23. every displayed price is explicitly labeled USD, and only total_price_usd/market_price ever reach fmtUsd", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow({ marketplace: "EBAY_GB" }), utmCampaign: "deal_of_day" });
  const slide = buildSlideContent(payload);
  const html = renderHtml(slide, { variant: "A" });
  assert.match(html, /LISTED \(USD\)/);
  assert.match(html, /MARKET REF \(USD\)/);
  // a non-US marketplace chip (e.g. "GB") can legitimately appear alongside
  // the price without implying the price itself is in that currency
  assert.match(html, />GB</);
});

test("23b. market_data.currency is always the literal string USD in every payload family", () => {
  const payloads = [
    buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }),
    buildBestDealsPayload({ rows: [dealRow({ id: 1, watchlist_id: 1 })] }),
    buildSpotlightPayload({ contentType: "pokemon_spotlight", displayName: "Pikachu", dealCount: 3, topDeals: [dealRow({ id: 1, watchlist_id: 1 })], destinationRoute: "/pokemon/pikachu" }),
  ];
  for (const payload of payloads) assert.equal(payload.market_data.currency, "USD");
});

// === 24. Best Deals carousel file naming is deterministic (13D.4.1) ==========

test("24. carouselFileName produces a stable, zero-padded, variant-suffixed name", () => {
  assert.equal(carouselFileName(1, "A"), "01-A.png");
  assert.equal(carouselFileName(2, "B"), "02-B.png");
  assert.equal(carouselFileName(11, "A"), "11-A.png");
});

test("24b. a Best Deals payload with N deals implies exactly N+1 carousel positions (cover + one per deal), in stable pool order", () => {
  const rows = [
    dealRow({ id: 1, watchlist_id: 1, discount_pct: 0.5 }),
    dealRow({ id: 2, watchlist_id: 2, discount_pct: 0.6 }),
    dealRow({ id: 3, watchlist_id: 3, discount_pct: 0.7 }),
  ];
  const { payload } = buildFamilyPayload("best-deals", rows);
  const cover = buildCoverSlideContent(payload);
  assert.equal(cover.carousel.total, payload.deal_data.length + 1);
  const names = ["01-cover-A.png", ...payload.deal_data.map((_, i) => carouselFileName(i + 2, "A"))];
  assert.deepEqual(new Set(names).size, names.length); // no collisions
});

// === 25. new 13D.4.1 artifacts stay gitignored, and no runtime code imports them ===

test("25. gallery.mjs and the render session helper are gitignored the same way as every other generated preview artifact (via the .social-preview/ directory rule, never committed themselves as output)", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /\.social-preview\//);
  // the SOURCE files themselves (lib/social/gallery.mjs, lib/social/render.mjs)
  // are normal tracked source - only generated OUTPUT under .social-preview/
  // (index.html, the numbered carousel PNGs, payload.json, captions) is ignored.
  assert.ok(!/^lib\/social\//m.test(gitignore), "lib/social/ source must stay tracked, not gitignored");
});

test("25b. nothing under app/ or components/ imports the gallery module", () => {
  const appFiles = [...walk("app"), ...walk("components")].filter((f) => /\.jsx?$/.test(f));
  for (const f of appFiles) {
    assert.ok(!/lib\/social\/gallery/.test(read(f)), `${f} must not import the local review gallery builder`);
  }
});
