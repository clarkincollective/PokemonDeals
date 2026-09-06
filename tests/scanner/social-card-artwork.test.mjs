// Phase 13E.2.1 - REAL canonical card artwork (Layer 2 / Version C),
// the strengthened no-fake-card background prompts, the centralized
// OpenAI model config, and the Version D brand-ad architecture.
//
// Fixtures only: no OpenAI call, no live database, no real image
// download (a stub downloadImpl is injected), one Chrome-free HTML
// assertion. The load-bearing guarantees under test: the real card image
// and its identity NEVER reach an OpenAI prompt; Version C fails closed
// on any doubt; an eBay seller photo can never substitute for canonical
// artwork; the artwork pixels are never transformed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { RIGHTS_STATE } from "../../lib/social/rights.mjs";
import {
  canonicalArtworkUrl,
  printingMatch,
  resolveCardArtwork,
  resolveMultiCardArtwork,
  isSellerImageUrl,
  isCanonicalImageUrl,
  CANONICAL_IMAGE_HOST,
  CARD_ART_PROVIDER,
  NON_CANONICAL_IMAGE_HOSTS,
} from "../../lib/social/cardArtwork.mjs";
import { buildSlideContent, renderHtml } from "../../lib/social/templates.mjs";
import { buildDealPayload } from "../../lib/social/payload.mjs";
import { buildAssetPrompt, assertDataFree, ASSET_FAMILIES, PROMPT_SPEC_VERSION } from "../../lib/social/assetPrompts.mjs";
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_MODEL_PREVIOUS, OPENAI_IMAGE_REQUEST_SIZE } from "../../lib/social/imageModelConfig.mjs";
import { resolveBrandScreenshot, BRAND_AD_SPEC, BRAND_AD_SCREENSHOT_SOURCE } from "../../lib/social/brandAd.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const TCG_ID = "84640";
const CANON_URL = `https://tcgplayer-cdn.tcgplayer.com/product/${TCG_ID}_in_1000x1000.jpg`;

function dealRow(over = {}) {
  const total = over.total_price_usd ?? 120;
  const market = over.market_price ?? 158;
  return {
    id: 5001,
    watchlist_id: 5001,
    card_name: over.card_name ?? "Dark Porygon2",
    card_set: over.card_set ?? "Neo Destiny",
    card_tcgplayer_id: "card_tcgplayer_id" in over ? over.card_tcgplayer_id : TCG_ID,
    is_graded: over.is_graded ?? false,
    grader: over.grader ?? null,
    grade: over.grade ?? null,
    listing_type: "FIXED_PRICE",
    marketplace: "EBAY_US",
    image_url: "https://i.ebayimg.com/images/g/abcAAOSw/s-l1600.jpg", // the eBay SELLER photo - must never be used
    total_price: total,
    total_price_usd: total,
    market_price: market,
    discount_pct: Number((1 - total / market).toFixed(4)),
    exact_verified_at: new Date().toISOString(),
    first_seen_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    ...over,
  };
}

const catalogRow = (over = {}) => ({
  tcgplayer_id: TCG_ID,
  name: "Dark Porygon2",
  set: "Neo Destiny",
  card_number: "008/105",
  image_url: CANON_URL,
  ...over,
});

// a stub "download" that just writes a small valid-ish file - no network
function stubDownload(url, dest) {
  assert.equal(isCanonicalImageUrl(url), true, "stubDownload was asked to fetch a non-canonical host!");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.alloc(2048, 7));
  return Promise.resolve(dest);
}

function tmpCache() {
  const d = join(tmpdir(), `pdf-cardart-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return d;
}

// === 1. rights state ===================================================

test("1. card_image rights state is CLEARED; seller images + genai + publishing stay locked", () => {
  assert.equal(RIGHTS_STATE.card_image, "CLEARED");
  assert.equal(RIGHTS_STATE.ebay_seller_images, "NOT_CLEARED");
  assert.equal(RIGHTS_STATE.ebay_genai, "NOT_ALLOWED");
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
});

// === 2. exact canonical artwork can render ==============================

test("2. an exact printing resolves its canonical TCGplayer URL and renders a Version C creative", async () => {
  const deal = dealRow();
  assert.equal(canonicalArtworkUrl(deal), CANON_URL);
  const cacheDir = tmpCache();
  const r = await resolveCardArtwork(deal, { rightsState: RIGHTS_STATE, catalogRow: catalogRow(), cacheDir, downloadImpl: stubDownload });
  assert.equal(r.status, "ready");
  assert.equal(r.provider, CARD_ART_PROVIDER);
  assert.ok(existsSync(r.localPath));
  rmSync(cacheDir, { recursive: true, force: true });

  const payload = buildDealPayload({ contentType: "deal_of_day", row: deal, utmCampaign: "deal_of_day" });
  const slide = buildSlideContent(payload);
  const html = renderHtml(slide, { variant: "A", cardArtwork: { presentation: "center_card", card: { fileUrl: "file:///c/x.jpg" } } });
  assert.match(html, /<img class="card-art" src="file:\/\/\/c\/x\.jpg"/);
  assert.match(html, /width:\s*1080px/);
  assert.match(html, /height:\s*1350px/);
  assert.match(html, /class="disclosure">Ad</); // Layer 3 facts intact
  assert.match(html, /UNDER MARKET REF/);
});

// === 3. missing artwork fails closed ==================================

test("3. a failed download fails closed (status 'failed', no throw) - Mode B stands", async () => {
  const cacheDir = tmpCache();
  const r = await resolveCardArtwork(dealRow(), {
    rightsState: RIGHTS_STATE,
    catalogRow: catalogRow(),
    cacheDir,
    downloadImpl: () => Promise.reject(new Error("network down")),
  });
  assert.equal(r.status, "failed");
  assert.match(r.reason, /download failed/i);
  rmSync(cacheDir, { recursive: true, force: true });
});

// === 4. wrong-print artwork fails closed =============================

test("4. a catalogue row whose identity does not reconcile with the deal fails closed", async () => {
  const deal = dealRow({ card_name: "Blastoise", card_set: "Base Set" });
  const wrong = catalogRow({ name: "Charizard", set: "Base Set" }); // same id column, different card
  const pm = printingMatch(deal, wrong);
  assert.equal(pm.ok, false);
  assert.match(pm.reason, /identity mismatch/i);
  const r = await resolveCardArtwork(deal, { rightsState: RIGHTS_STATE, catalogRow: wrong, cacheDir: tmpCache(), downloadImpl: stubDownload });
  assert.equal(r.status, "failed");
});

test("4b. a deal with NO exact-printing tcgplayer id fails closed (never a species-level guess)", async () => {
  const deal = dealRow({ card_tcgplayer_id: null });
  assert.equal(canonicalArtworkUrl(deal), null);
  assert.equal(printingMatch(deal, null).ok, false);
  const r = await resolveCardArtwork(deal, { rightsState: RIGHTS_STATE, cacheDir: tmpCache(), downloadImpl: stubDownload });
  assert.equal(r.status, "failed");
});

test("4c. a catalogue row for a DIFFERENT id fails closed", () => {
  assert.equal(printingMatch(dealRow(), catalogRow({ tcgplayer_id: "999999" })).ok, false);
});

// === 5. seller image cannot substitute for canonical artwork ==========

test("5. an eBay seller photo can never be the canonical source", () => {
  for (const h of NON_CANONICAL_IMAGE_HOSTS) assert.equal(isSellerImageUrl(`https://${h}/x.jpg`), true);
  assert.equal(isSellerImageUrl("https://i.ebayimg.com/images/g/abc/s-l1600.jpg"), true);
  assert.equal(isCanonicalImageUrl("https://i.ebayimg.com/images/g/abc/s-l1600.jpg"), false);
  // deal.image_url (the seller photo) is NEVER what canonicalArtworkUrl reads
  const deal = dealRow();
  assert.equal(canonicalArtworkUrl(deal), CANON_URL);
  assert.doesNotMatch(String(canonicalArtworkUrl(deal)), /ebayimg|ebay\.com/);
  // a catalogue row that somehow carries a seller URL is rejected
  assert.equal(printingMatch(deal, catalogRow({ image_url: "https://i.ebayimg.com/x.jpg" })).ok, false);
});

test("5b. the payload carries the structured tcgplayer id, never the eBay image_url", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  assert.equal(payload.deal_data.card_tcgplayer_id, TCG_ID);
  assert.ok(!("image_url" in payload.deal_data));
  assert.doesNotMatch(JSON.stringify(payload), /i\.ebayimg\.com/);
});

// === 6-10. OpenAI data isolation =====================================

test("6. the real card image / local path is never sent to an OpenAI prompt", () => {
  for (const family of ASSET_FAMILIES) {
    const { prompt } = buildAssetPrompt({ family });
    assert.doesNotMatch(prompt, /tcgplayer-cdn|\.jpg|\.png|file:\/\/|card-art-cache/i);
    assert.doesNotThrow(() => assertDataFree(prompt));
  }
});

test("7. an image URL poisoned into a prompt string is caught by assertDataFree", () => {
  assert.throws(() => assertDataFree(`nice background with ${CANON_URL}`), /live-data signature/i);
  assert.throws(() => assertDataFree("background, product 84640 from tcgplayer-cdn"), /live-data signature/i);
});

test("8. Pokemon / card / set identity never enters a prompt", () => {
  // the structural guarantee: no parameter can carry an identity at all
  assert.throws(() => buildAssetPrompt({ family: "deal_intelligence", cardName: "Dark Porygon2" }), /unexpected key/i);
  assert.throws(() => buildAssetPrompt({ family: "deal_intelligence", set: "Neo Destiny", pokemon: "x" }), /unexpected key/i);
  // and the secondary string net catches obvious identity tokens
  assert.throws(() => assertDataFree("a Charizard-themed background"), /live-data signature/i);
  assert.throws(() => assertDataFree("card_name: Dark Porygon2"), /live-data signature/i);
  assert.throws(() => assertDataFree("card_set: Neo Destiny"), /live-data signature/i);
});

test("9. prices never enter a prompt", () => {
  assert.throws(() => assertDataFree("listed at $120 vs $158 reference"), /live-data signature/i);
  assert.throws(() => assertDataFree("24% below market ref"), /live-data signature/i);
});

test("10. deal / listing ids never enter a prompt", () => {
  assert.throws(() => assertDataFree("deal id 5001, listing v1|123|0"), /live-data signature/i);
  assert.throws(() => assertDataFree("watchlist_id 5001"), /live-data signature/i);
});

test("10b. cardArtwork.mjs imports no OpenAI code and buildAssetPrompt cannot receive card data", () => {
  const ca = read("lib/social/cardArtwork.mjs");
  assert.doesNotMatch(ca, /from ["']openai["']|api\.openai\.com|gpt-image/i);
  const sa = read("scripts/socialAssets.mjs");
  assert.doesNotMatch(sa, /from ["'][^"']*cardArtwork/); // the generator never touches Layer 2
  assert.throws(() => buildAssetPrompt({ family: "deal_intelligence", cardImage: CANON_URL }), /unexpected key/i);
  assert.throws(() => buildAssetPrompt({ family: "deal_intelligence", tcgplayer_id: TCG_ID }), /unexpected key/i);
});

// === 11. prompts explicitly prohibit fake cards / creatures ===========

test("11. every background prompt forbids drawing a card / creature and reserves an empty hero zone", () => {
  for (const family of ASSET_FAMILIES) {
    const { prompt } = buildAssetPrompt({ family });
    assert.match(prompt, /DO NOT DRAW A TRADING CARD/);
    assert.match(prompt, /DO NOT DRAW CREATURES, MONSTERS, OR POKEMON-LIKE CHARACTERS/);
    assert.match(prompt, /DO NOT DRAW A CARD, SLAB, OR RECTANGULAR PRODUCT SHAPE INSIDE THE RESERVED HERO ZONE/);
    assert.match(prompt, /LEAVE THE RESERVED HERO ZONE COMPLETELY EMPTY/);
    assert.doesNotMatch(prompt, /blank card rectangle|fanned stack of blank cards|anonymous clear slab shape/i);
  }
  assert.equal(PROMPT_SPEC_VERSION, "13e3-v1"); // 13E.3 - premium-dark background direction
});

// === 12-13. artwork is never transformed ============================

test("12. the card image preserves aspect ratio (object-fit:contain, never cover/fill)", () => {
  const html = renderHtml({ kind: "deal", eyebrow: "X", metricValue: "24%", metricLabel: "L", name: "n", set: "s", listed: 1, reference: 2, chips: ["Raw"], freshnessLabel: "f", ctaText: "go" }, { cardArtwork: { presentation: "center_card", card: { fileUrl: "file:///x.jpg" } } });
  assert.match(html, /\.card-art\s*\{[^}]*object-fit:\s*contain/);
  assert.doesNotMatch(html, /\.card-art\s*\{[^}]*object-fit:\s*(cover|fill|scale-down)/);
});

test("13. no crop / no generative filter is applied to the artwork (no blur/hue/saturate/sepia/grayscale on .card-art)", () => {
  const html = renderHtml({ kind: "deal", eyebrow: "X", metricValue: "24%", metricLabel: "L", name: "n", set: "s", listed: 1, reference: 2, chips: ["Raw"], freshnessLabel: "f", ctaText: "go" }, { cardArtwork: { presentation: "hero_left", card: { fileUrl: "file:///x.jpg" } } });
  // the frame may carry a drop-shadow / rotate, the image itself carries nothing
  const artRule = (html.match(/\.card-art\s*\{[^}]*\}/) || [""])[0];
  assert.doesNotMatch(artRule, /blur\(|hue-rotate|saturate\(|sepia\(|grayscale\(|contrast\(|brightness\(/i);
  assert.doesNotMatch(artRule, /clip-path|object-position:\s*(top|bottom|left|right)\s+-/);
  // a drop-shadow on the FRAME is allowed; a blur is never
  assert.doesNotMatch(html, /\.card-frame[^}]*filter:[^}]*blur/i);
});

test("13b. Version C still emits NO eBay image and NO remote image src", () => {
  const html = renderHtml({ kind: "deal", eyebrow: "X", metricValue: "24%", metricLabel: "L", name: "n", set: "s", listed: 1, reference: 2, chips: ["Raw"], freshnessLabel: "f", ctaText: "go" }, { cardArtwork: { presentation: "center_card", card: { fileUrl: "file:///local/84640.jpg" } } });
  assert.doesNotMatch(html, /i\.ebayimg\.com|ebayimg|\bebay\.com/i);
  assert.doesNotMatch(html, /src="https?:/i); // every image src is a local file://
  assert.match(html, /src="file:\/\/\/local\/84640\.jpg"/);
});

// === 14-17. Versions A / B / C / D ===================================

test("14. Version A still renders (no card image, Mode B, 1080x1350)", () => {
  const slide = buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }));
  const html = renderHtml(slide, { variant: "A" });
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /width:\s*1080px/);
});

test("15. Version B still renders (approved data-free background, still no card <img>)", () => {
  const slide = buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }));
  const html = renderHtml(slide, { variant: "A", background: { absFile: "C:/x/bg.png", zone: "C" } });
  assert.match(html, /background-image:\s*url\("file:/);
  assert.doesNotMatch(html, /<img/i);
});

test("16. Version C renders with a real canonical fixture (single and multi-card)", () => {
  const single = renderHtml(buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" })), {
    cardArtwork: { presentation: "card_metric_panel", card: { fileUrl: "file:///c/84640.jpg" } },
  });
  assert.match(single, /class="card-art" src="file:\/\/\/c\/84640\.jpg"/);
  assert.match(single, /hero-split|hero-stack-card/);

  const multi = renderHtml(
    { kind: "spotlight", eyebrow: "POKEMON WATCH", metricValue: "24%", metricLabel: "BEST GAP", name: "Lugia", set: null, stats: ["14 live verified deals"], listItems: [], freshnessLabel: "f", ctaText: "go" },
    { cardArtwork: { presentation: "multi_card", cards: [{ fileUrl: "file:///c/1.jpg" }, { fileUrl: "file:///c/2.jpg" }, { fileUrl: "file:///c/3.jpg" }] } }
  );
  assert.equal((multi.match(/class="card-art"/g) || []).length, 3);
  assert.match(multi, /card-strip/);
});

test("16b. multi-card resolution needs >=2 DISTINCT printings, never duplicates one card", async () => {
  const cacheDir = tmpCache();
  const deals = [dealRow({ id: 1, card_tcgplayer_id: "111" }), dealRow({ id: 2, card_tcgplayer_id: "111" }), dealRow({ id: 3, card_tcgplayer_id: null })];
  const r = await resolveMultiCardArtwork(deals, {
    rightsState: RIGHTS_STATE,
    catalogRowFor: () => null,
    cacheDir,
    downloadImpl: stubDownload,
  });
  assert.equal(r.status, "failed"); // only 1 distinct id resolvable
  assert.match(r.reason, /only 1 distinct exact printing/i);
  rmSync(cacheDir, { recursive: true, force: true });
});

test("17. Version D architecture accepts a real screenshot and renders a framed brand ad", () => {
  const shotDir = join(tmpdir(), `pdf-brandad-${Date.now()}`);
  mkdirSync(shotDir, { recursive: true });
  const shotPath = join(shotDir, "home.png");
  writeFileSync(shotPath, Buffer.alloc(4096, 3));
  const resolved = resolveBrandScreenshot({ route: "/", screenshotPath: shotPath });
  assert.equal(resolved.status, "ready");

  const html = renderHtml({ kind: "deal" }, {
    brandAd: {
      screenshot: { fileUrl: "file:///shot/home.png" },
      headline: "Compare every Pokemon card deal",
      sub: "Live eBay listings vs a real reference.",
      urlLabel: "pokemondealfinder.com",
    },
  });
  assert.match(html, /device-frame/);
  assert.match(html, /<img src="file:\/\/\/shot\/home\.png"/);
  assert.match(html, /pokemondealfinder\.com/);
  assert.match(html, /width:\s*1080px/);
  rmSync(shotDir, { recursive: true, force: true });

  assert.equal(BRAND_AD_SPEC.openai_generates, "background environment only - NEVER the site UI, a phone, listings, prices, cards, or text");
  assert.ok(BRAND_AD_SCREENSHOT_SOURCE.origin.startsWith("https://pokemondealfinder.com"));
});

test("17b. Version D fails closed (unavailable) when no real screenshot is cached", () => {
  const r = resolveBrandScreenshot({ route: "/", screenshotPath: join(tmpdir(), "definitely-not-here-" + Date.now() + ".png") });
  assert.equal(r.status, "unavailable");
});

// === 18-21. publishing / generation / secrets / model config =========

test("18. nothing here publishes; RIGHTS_STATE.publishing stays DISABLED and no publish fn exists", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  for (const f of ["lib/social/cardArtwork.mjs", "lib/social/brandAd.mjs", "lib/social/templates.mjs"]) {
    assert.doesNotMatch(read(f), /\bfunction\s+(publish|schedulePost|postToInstagram|postToTikTok)\b/);
  }
});

test("19. social:daily performs zero OpenAI generation calls (no import, no endpoint, no fetch)", () => {
  const src = read("scripts/socialDaily.mjs");
  assert.doesNotMatch(src, /from ["'][^"']*assetPrompts|from ["'][^"']*socialAssets|from ["']openai["']|api\.openai\.com|gpt-image/i);
  assert.doesNotMatch(src, /\bfetch\s*\(/);
  // it DOES use the read-only Layer 2 resolver + the read-only asset loader
  assert.match(src, /from "\.\.\/lib\/social\/cardArtwork\.mjs"/);
  assert.match(src, /from "\.\.\/lib\/social\/assets\.mjs"/);
});

test("20. OPENAI_API_KEY stays server/local only - no client/browser read, never logged as a value", () => {
  const sa = read("scripts/socialAssets.mjs");
  assert.match(sa, /process\.env\.OPENAI_API_KEY/);
  assert.doesNotMatch(sa, /console\.\w+\(\s*key\s*[),]/);
  assert.doesNotMatch(sa, /console\.\w+\([^)]*\$\{[^}]*key[^}]*\}/i);
  // no lib/social file (client-reachable pattern) reads the OpenAI key
  for (const f of ["lib/social/cardArtwork.mjs", "lib/social/imageModelConfig.mjs", "lib/social/assetPrompts.mjs", "lib/social/assets.mjs"]) {
    assert.doesNotMatch(read(f), /OPENAI_API_KEY/);
  }
});

test("21. the GPT Image model is centralized (single constant) and set to the current SOTA model", () => {
  assert.equal(OPENAI_IMAGE_MODEL, "gpt-image-2"); // per developers.openai.com image-generation docs, audited 2026-09-06
  assert.equal(OPENAI_IMAGE_MODEL_PREVIOUS, "gpt-image-1");
  assert.equal(OPENAI_IMAGE_REQUEST_SIZE, "1024x1536");
  // the model string appears in exactly one source file
  const cfg = read("lib/social/imageModelConfig.mjs");
  assert.match(cfg, /"gpt-image-2"/);
  const sa = read("scripts/socialAssets.mjs");
  assert.match(sa, /from "\.\.\/lib\/social\/imageModelConfig\.mjs"/);
  assert.doesNotMatch(sa, /"gpt-image-1"|"gpt-image-2"/); // no hard-coded model string in the script
  // and not scattered anywhere else under lib/social
  for (const f of ["lib/social/assetPrompts.mjs", "lib/social/assets.mjs", "lib/social/cardArtwork.mjs", "lib/social/templates.mjs"]) {
    assert.doesNotMatch(read(f), /gpt-image-[12]/);
  }
});
