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
import { buildSlideContent, renderHtml } from "../../lib/social/templates.mjs";
import { buildUtmPreview } from "../../lib/social/utm.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import { buildReviewChecklist } from "../../lib/social/reviewSummary.mjs";

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
  assert.doesNotMatch(line.label, /live/i);
  const fresh = dealRow({ exact_verified_at: ago(1) });
  assert.match(socialFreshnessLine(fresh).label, /Live when checked at/);
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

// === 10. PPT-derived history/movement templates do not exist while rights are WAITING ===

test("10. no market-mover / raw-vs-graded / grade-spread / price-history template exists anywhere in lib/social", () => {
  const blockedFamilies = /market_movers|raw_vs_graded|grade_spread|price_history|market_snapshot|biggest_losers/i;
  for (const f of SOCIAL_FILES) {
    assert.doesNotMatch(read(f), blockedFamilies, `${f} must not implement a PPT-history-dependent template while rights are WAITING`);
  }
});

test("10b. rights_state.ppt_social_data is WAITING, and nothing marks it APPROVED", () => {
  assert.equal(RIGHTS_STATE.ppt_social_data, "WAITING");
  for (const f of SOCIAL_FILES) {
    assert.doesNotMatch(read(f), /ppt_social_data:\s*["']APPROVED["']/);
  }
});

// === 11. GenAI is never used ================================================

test("11. no GenAI provider is imported or called anywhere in lib/social or the CLI", () => {
  const forbidden = /openai|anthropic|@google\/generative|gemini|chatcompletion|createCompletion|generateContent/i;
  for (const f of SOCIAL_FILES) {
    assert.doesNotMatch(read(f), forbidden, `${f} must not reference a GenAI provider`);
  }
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

test("12d. no fetch()/network call of any kind exists in the social system (database + local file/Chrome I/O only)", () => {
  for (const f of SOCIAL_FILES) {
    if (f.endsWith("db.mjs")) continue; // Supabase client call is the one intentional exception - reads the database, not a network publish
    if (f.endsWith("render.mjs")) continue; // spawns local Chrome + writes a local file - no network call
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\(/, `${f} must not make a network call`);
  }
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

test("16. every generated payload includes the exact four-key rights_state, unambiguous", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  assert.deepEqual(Object.keys(payload.rights_state).sort(), ["card_image", "ebay_genai", "ppt_social_data", "publishing"]);
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
  assert.equal(byItem["Image rights safe (Mode B in force, no card image used)"].auto, true);
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
