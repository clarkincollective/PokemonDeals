// Phase 13E.3 - the STRUCTURED CREATIVE SYSTEM: the reusable composition
// spec, the four creative families (deal_drop / market_mover /
// hook_carousel / brand_ad), the deterministic dark renderer, and the
// fail-closed guarantees for real card artwork, real price movement, the
// real site screenshot, and the OpenAI background boundary.
//
// Fixtures only. No OpenAI call, no live DB, no Chrome. The load-bearing
// guarantees under test: real data is NEVER invented or altered; the
// image model NEVER receives a fact; a family fails CLOSED rather than
// fabricate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  PLATFORM_TARGETS, DEFAULT_TARGET, RENDERABLE_TARGETS, ZONES, COMPOSITIONS,
  FAMILIES, FAMILY_SPECS, TOKENS, CARD_GEOMETRY,
  resolveCreativeSpec, resolveCardGeometry, resolveAccent, familyForContentType,
  buildCarouselSequence, validateAllFamilySpecs,
} from "../../lib/social/creativeSpec.mjs";
import { resolveMovement } from "../../lib/social/priceMovement.mjs";
import {
  buildSlideContent, buildCoverSlideContent, buildCloseSlideContent, renderHtml, safeText,
} from "../../lib/social/templates.mjs";
import { buildDealPayload, buildMoverPayload } from "../../lib/social/payload.mjs";
import { assembleCaption } from "../../lib/social/caption.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const HOUR = 3_600_000;
const dealRow = (over = {}) => ({
  id: 700, watchlist_id: 700, card_tcgplayer_id: "12345",
  card_name: over.card_name ?? "Charizard", card_set: over.card_set ?? "Base Set",
  is_graded: over.is_graded ?? false, grader: over.grader ?? null, grade: over.grade ?? null,
  listing_type: "FIXED_PRICE", marketplace: over.marketplace ?? "EBAY_US",
  total_price_usd: over.total_price_usd ?? 120, total_price: over.total_price_usd ?? 120,
  market_price: over.market_price ?? 300, discount_pct: over.discount_pct ?? 0.6,
  exact_verified_at: new Date(Date.now() - HOUR).toISOString(),
  first_seen_at: new Date(Date.now() - 3 * HOUR).toISOString(),
  last_seen_at: new Date(Date.now() - HOUR).toISOString(),
  auction_end_at: null, ...over,
});
const realMovement = {
  ok: true, pct: 0.17, direction: "up", windowLabel: "30 days", comparedOn: "2026-08-07",
  series: Array.from({ length: 20 }, (_, i) => ({ t: `2026-08-${String(i + 1).padStart(2, "0")}`, v: 100 + i * 2 })),
  confidence: "ok",
};

// === 1. STRUCTURED CREATIVE SPEC ======================================

test("1. every zone the families use is in the ZONES vocabulary; the product zone exists", () => {
  assert.ok(ZONES.includes("product"));
  assert.ok(ZONES.includes("headline") && ZONES.includes("metric") && ZONES.includes("price") && ZONES.includes("chart") && ZONES.includes("cta") && ZONES.includes("disclosure"));
  assert.deepEqual(validateAllFamilySpecs(), []); // no family references an unknown zone / composition / policy
});

test("2. every platform target defines a fixed canvas and non-empty safe margins", () => {
  for (const [k, t] of Object.entries(PLATFORM_TARGETS)) {
    assert.ok(t.w > 0 && t.h > 0, `${k} canvas`);
    for (const side of ["top", "right", "bottom", "left"]) assert.ok(t.safe[side] > 0, `${k} safe.${side}`);
  }
  assert.ok(RENDERABLE_TARGETS.includes(DEFAULT_TARGET));
  // 13E.3 renders portrait 4:5 only; 9:16 targets are declared, not rendered
  assert.equal(PLATFORM_TARGETS.reel_9x16.renders, false);
  assert.equal(PLATFORM_TARGETS.tiktok_9x16.renders, false);
});

test("3. card geometry is clamped - rotation never exceeds the cap, scale stays in the envelope", () => {
  const g = resolveCardGeometry({ scale: 5, rotationDeg: -45, shadow: "deep" });
  assert.ok(Math.abs(g.rotationDeg) <= CARD_GEOMETRY.maxRotationDeg);
  assert.ok(g.scale <= CARD_GEOMETRY.maxScale && g.scale >= CARD_GEOMETRY.minScale);
  for (const fam of FAMILIES) {
    const s = FAMILY_SPECS[fam];
    if (s.card) assert.ok(Math.abs(resolveCardGeometry(s.card).rotationDeg) <= CARD_GEOMETRY.maxRotationDeg, fam);
  }
});

test("4. resolveCreativeSpec resolves each family + variant to a real composition", () => {
  for (const fam of FAMILIES) {
    const a = resolveCreativeSpec({ family: fam, variant: "A" });
    assert.ok(COMPOSITIONS[a.compositionKey], `${fam} A -> ${a.compositionKey}`);
    assert.equal(a.canvas.w, 1080);
    assert.equal(a.canvas.h, 1350);
    if (fam !== "hook_carousel") {
      const b = resolveCreativeSpec({ family: fam, variant: "B" });
      assert.ok(COMPOSITIONS[b.compositionKey]);
    }
  }
  // carousel slide index picks cover / slide / close
  const cov = resolveCreativeSpec({ family: "hook_carousel", slide: { index: 0, count: 4 } });
  const mid = resolveCreativeSpec({ family: "hook_carousel", slide: { index: 1, count: 4 } });
  const end = resolveCreativeSpec({ family: "hook_carousel", slide: { index: 3, count: 4 } });
  assert.equal(cov.compositionKey, "hook_cover");
  assert.equal(mid.compositionKey, "product_hero_split");
  assert.equal(end.compositionKey, "hook_close");
});

// === 2. ACCENT COLOUR IS A GUARD (green only from a real positive metric) ===

test("5. a saving accent is green ONLY when discount_pct is a real number > 0", () => {
  assert.equal(resolveAccent({ policy: "saving", discountPct: 0.42 }).color, TOKENS.color.up);
  assert.equal(resolveAccent({ policy: "saving", discountPct: 0.42 }).allowed, true);
  for (const bad of [0, -0.1, null, undefined, NaN, "lots"]) {
    const r = resolveAccent({ policy: "saving", discountPct: bad });
    assert.equal(r.color, TOKENS.color.neutral, `discountPct=${bad}`);
    assert.equal(r.allowed, false);
  }
});

test("6. a movement accent is directional ONLY from a real confident trend", () => {
  assert.equal(resolveAccent({ policy: "movement", movement: { direction: "up", pct: 0.2 } }).color, TOKENS.color.up);
  assert.equal(resolveAccent({ policy: "movement", movement: { direction: "down", pct: -0.2 } }).color, TOKENS.color.down);
  for (const bad of [null, {}, { direction: "sideways", pct: 0.1 }, { direction: "up", pct: NaN }]) {
    assert.equal(resolveAccent({ policy: "movement", movement: bad }).color, TOKENS.color.neutral, JSON.stringify(bad));
  }
  assert.equal(resolveAccent({ policy: "none" }).allowed, false);
});

// === 3. MARKET MOVER FAILS CLOSED =====================================

test("7. resolveMovement returns { ok:false } for thin / flat / low-confidence history - never a fabricated trend", () => {
  assert.equal(resolveMovement({ series: [] }).ok, false);
  assert.equal(resolveMovement({ series: [{ date: "2026-01-01", price: 10 }, { date: "2026-01-02", price: 10 }] }).ok, false); // < MOVER_MIN_POINTS
  // a real, steadily-rising 400-day series with corroboration -> a window may resolve;
  // if it does, pct is a fraction and a series of >=2 {t,v} points comes back
  const rising = Array.from({ length: 120 }, (_, i) => ({ date: `2026-01-${i + 1}`, price: 100 + i })).map((p, i) => ({ date: new Date(2026, 0, 1 + i).toISOString().slice(0, 10), price: 100 + i * 1.5 }));
  const r = resolveMovement({ series: rising, rows: null });
  if (r.ok) {
    assert.equal(typeof r.pct, "number");
    assert.ok(Math.abs(r.pct) < 5, "pct is a fraction, not a percent");
    assert.ok(r.series.length >= 2 && r.series.every((p) => Number.isFinite(p.v)));
    assert.ok(["up", "down"].includes(r.direction));
  } else {
    assert.match(r.reason, /fail closed|confident|withheld/i);
  }
});

test("8. buildMoverPayload THROWS if handed a fail-closed movement (no chart without real history)", () => {
  assert.throws(() => buildMoverPayload({ row: dealRow(), movement: { ok: false, reason: "x" } }));
  assert.throws(() => buildMoverPayload({ row: dealRow(), movement: null }));
  const p = buildMoverPayload({ row: dealRow(), movement: realMovement });
  assert.equal(p.content_type, "market_mover");
  assert.ok(Array.isArray(p.movement.series) && p.movement.series.length >= 2);
});

test("9. the Market Mover creative renders a real chart (with the real card), and fails closed to a chart-free layout when the series is empty", () => {
  const p = buildMoverPayload({ row: dealRow(), movement: realMovement });
  const art = { presentation: "hero_left", card: { fileUrl: "file:///cache/12345.jpg" } };
  const withChart = renderHtml(buildSlideContent(p), { variant: "A", cardArtwork: art });
  assert.match(withChart, /<svg /);
  assert.match(withChart, /class="chart"/);
  assert.match(withChart, /class="card-art"/); // 13E.3C: the card is part of the Mover identity
  assert.match(withChart, /class="disclosure">Ad</);

  const empty = buildSlideContent({ ...p, movement: { ...p.movement, series: [] } });
  const html = renderHtml(empty, { variant: "A", cardArtwork: art });
  assert.doesNotMatch(html, /class="chart"/); // no confident chart -> chart element dropped
  assert.match(html, /class="disclosure">Ad</); // still a complete creative
});

// === 4. HOOK CAROUSEL SEQUENCING (deterministic; a final CTA slide) ===

test("10. buildCarouselSequence is deterministic: cover, one slide per DISTINCT card (capped), then a fixed close slide", () => {
  const deals = [1, 2, 3].map((id) => dealRow({ id, card_tcgplayer_id: String(id), card_name: "Species" + id }));
  const a = buildCarouselSequence(deals);
  const b = buildCarouselSequence(deals);
  assert.deepEqual(a.slides.map((s) => s.kind), b.slides.map((s) => s.kind));
  assert.equal(a.slides[0].kind, "cover");
  assert.equal(a.slides[a.slides.length - 1].kind, "close"); // a final CTA / brand slide ALWAYS exists
  assert.equal(a.count, deals.length + 2); // 3 distinct -> cover + 3 + close
  assert.equal(a.distinctCount, 3);
  // capped
  const many = Array.from({ length: 20 }, (_, i) => dealRow({ id: i, card_tcgplayer_id: String(1000 + i), card_name: "P" + i }));
  assert.ok(buildCarouselSequence(many).count <= FAMILY_SPECS.hook_carousel.sequence.maxSlides);
  // too few -> not ok
  assert.equal(buildCarouselSequence([]).ok, false);
});

test("11. the carousel close slide is a PokemonDealFinder + value-prop + CTA slide", () => {
  const payload = { content_type: "pokemon_spotlight", deal_data: [dealRow()], subject: { display_name: "Lugia", deal_count: 3 }, freshness: { label: "x" } };
  const close = buildCloseSlideContent(payload);
  assert.equal(close.kind, "close");
  const html = renderHtml(close, { variant: "A" });
  assert.match(html, /DealFinder<\/span>/); // the wordmark lockup
  assert.match(html, /class="cta"/);
  assert.match(html, /market reference/i); // one-line value proposition
  assert.match(html, /class="disclosure">Ad</);
});

// === 5. DETERMINISTIC DATA IS IDENTICAL ACROSS VISUAL VARIANTS =========

test("12. the same deal's numbers are byte-identical in variant A, B, and the Version-C render", () => {
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow({ total_price_usd: 149.99, market_price: 500, discount_pct: 0.7002 }), utmCampaign: "deal_of_day" });
  const slide = buildSlideContent(payload);
  const body = (html) => html.split("</style>")[1] ?? html;
  const money = (html) => (body(html).match(/\$[\d,]+\.\d{2}/g) || []).sort();
  const metric = (html) => (body(html).match(/class="fig"[^>]*>([^<]+)</) || [])[1];
  const a = renderHtml(slide, { variant: "A" });
  const b = renderHtml(slide, { variant: "B" });
  const c = renderHtml(slide, { variant: "A", cardArtwork: { presentation: "hero_left", card: { fileUrl: "file:///x.jpg" } } });
  assert.deepEqual(money(a), money(b));
  assert.deepEqual(money(a), money(c));
  assert.equal(metric(a), metric(b));
  assert.equal(metric(a), metric(c));
  assert.ok(money(a).includes("$149.99") && money(a).includes("$500.00"));
  assert.equal(metric(a), "70%"); // discount 0.7002 -> 70%, identical everywhere
});

// === 6. LONG NAMES, SAFE AREAS, DISCLOSURE ============================

test("13. a very long card name is word-boundary truncated, never left to overflow raw", () => {
  const long = "Charizard VMAX Rainbow Secret Rare Alternate Full Art Championship Promo";
  const cut = safeText(long, 32);
  assert.ok(cut.length <= 33 && /…$/.test(cut));
  assert.ok(!cut.includes("Championship")); // trimmed at a word boundary
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow({ card_name: long }), utmCampaign: "deal_of_day" });
  const html = renderHtml(buildSlideContent(payload), { variant: "A", cardArtwork: { presentation: "hero_left", card: { fileUrl: "file:///x.jpg" } } });
  assert.doesNotMatch(html, /Championship Promo<\/div>/); // the raw tail never reaches the DOM
});

test("14. every family's creative carries the Ad disclosure and the canvas is the safe fixed size", () => {
  const cases = [
    renderHtml(buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" })), { variant: "A" }),
    renderHtml(buildSlideContent(buildMoverPayload({ row: dealRow(), movement: realMovement })), { variant: "A" }),
    renderHtml(buildCoverSlideContent({ content_type: "pokemon_spotlight", deal_data: [dealRow(), dealRow({ id: 2 })], subject: { display_name: "x", deal_count: 2 }, freshness: { label: "x" } }), { variant: "A" }),
    renderHtml({ kind: "deal" }, { brandAd: { screenshot: { fileUrl: "file:///s.png" }, sub: "x", urlLabel: "pokemondealfinder.com" } }),
  ];
  for (const html of cases) {
    assert.match(html, /class="disclosure">Ad</);
    assert.match(html, /width:\s*1080px/);
    assert.match(html, /height:\s*1350px/);
  }
});

// === 7. IMAGE BOUNDARIES + PUBLISHING (spot checks; full coverage in the
//        13E.2 / 13E.2.1 suites) ======================================

test("15. Version A / B emit NO <img>; the OpenAI background is CSS only; Version C's <img> is a local file://", () => {
  const slide = buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }));
  assert.doesNotMatch(renderHtml(slide, { variant: "A" }), /<img/i);
  assert.doesNotMatch(renderHtml(slide, { variant: "A", background: { absFile: "C:/x/bg.png", zone: "A" } }), /<img/i);
  const c = renderHtml(slide, { variant: "A", cardArtwork: { presentation: "hero_left", card: { fileUrl: "file:///cache/12345.jpg" } } });
  assert.match(c, /<img class="card-art" src="file:\/\/\/cache\/12345\.jpg"/);
  assert.doesNotMatch(c, /src="https?:/i);
});

test("16. Version D requires a real screenshot handle; the brand-ad hook never carries a fabricated stat", () => {
  const html = renderHtml({ kind: "deal" }, { brandAd: { screenshot: { fileUrl: "file:///shot/home.png" }, sub: "PokemonDealFinder scans live eBay listings and compares each one to a real market reference.", urlLabel: "pokemondealfinder.com" } });
  assert.match(html, /<img src="file:\/\/\/shot\/home\.png"/);
  assert.match(html, /class="device-frame"/);
  assert.doesNotMatch(html, /\$\d|\d+%\s*(off|below|under)/i); // no invented number in the ad
});

test("17. templates.mjs / creativeSpec.mjs never import OpenAI, never read a key, never publish", () => {
  for (const f of ["lib/social/templates.mjs", "lib/social/creativeSpec.mjs", "lib/social/priceMovement.mjs"]) {
    const src = read(f);
    // no OpenAI import / SDK / endpoint / model string (the word "OpenAI"
    // may appear in a comment describing the data boundary - that's fine)
    assert.doesNotMatch(src, /from ["'][^"']*openai|require\(["']openai|api\.openai\.com|gpt-image-[12]|process\.env\.OPENAI/i, f);
    assert.doesNotMatch(src, /\bfunction\s+(publish|schedulePost|postToInstagram|postToTikTok)\b/, f);
  }
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
});

// === 8. CAPTIONS FOR THE NEW FAMILY ==================================

test("18. the Market Mover caption states only the real movement - no forecast, no urgency, keeps the disclosure", () => {
  const p = buildMoverPayload({ row: dealRow({ card_name: "Umbreon" }), movement: realMovement });
  for (const variant of ["instagram", "tiktok"]) {
    const cap = assembleCaption(p, { variant });
    assert.match(cap, /up 17%/);
    assert.match(cap, /over the last 30 days/);
    assert.match(cap, /\nAd ·/);
    assert.match(cap, /not investment advice/i);
    assert.doesNotMatch(cap, /\b(buy now|will (rise|hit|go up|moon)|price target|guaranteed returns?|hurry|act now|don'?t miss)\b/i);
  }
});

// === 9. content_type -> family map ===================================

test("19. every family's content types resolve back to that family", () => {
  for (const fam of FAMILIES) {
    for (const ct of FAMILY_SPECS[fam].contentTypes) {
      assert.equal(familyForContentType(ct), fam, ct);
    }
  }
  assert.equal(familyForContentType("nope"), null);
});

// === 10. HOOK CAROUSEL - DISTINCT CARD IDENTITIES (13E.3C) ============

const cRow = (over = {}) => dealRow({
  id: over.id, card_tcgplayer_id: over.card_tcgplayer_id,
  card_name: over.card_name ?? "Charizard", card_set: over.card_set ?? "Base Set",
});

test("20. a carousel never shows the same exact printing twice", () => {
  const rows = [
    cRow({ id: 1, card_tcgplayer_id: "100", card_name: "Charizard", card_set: "Base Set" }),
    cRow({ id: 2, card_tcgplayer_id: "100", card_name: "Charizard", card_set: "Base Set" }), // exact dup id
    cRow({ id: 3, card_tcgplayer_id: null, card_name: "Pikachu", card_set: "Jungle" }),
    cRow({ id: 4, card_tcgplayer_id: null, card_name: "pikachu", card_set: "jungle" }),      // dup name|set
    cRow({ id: 5, card_tcgplayer_id: "200", card_name: "Blastoise", card_set: "Base Set" }),
  ];
  const seq = buildCarouselSequence(rows);
  const cards = seq.slides.filter((s) => s.kind === "card").map((s) => s.deal);
  const keyOf = (d) => (/^\d+$/.test(String(d.card_tcgplayer_id ?? "")) ? "tcg:" + d.card_tcgplayer_id
    : "ns:" + String(d.card_name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + String(d.card_set).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const keys = cards.map(keyOf);
  assert.equal(new Set(keys).size, keys.length, "no printing repeats");
  assert.equal(cards.length, 3); // Charizard, Pikachu, Blastoise
});

test("21. a carousel prefers distinct Pokemon when enough alternatives exist", () => {
  const rows = [
    cRow({ id: 1, card_tcgplayer_id: "1", card_name: "Charizard", card_set: "Base Set" }),
    cRow({ id: 2, card_tcgplayer_id: "2", card_name: "Charizard", card_set: "Base Set 2" }), // 2nd Charizard printing
    cRow({ id: 3, card_tcgplayer_id: "3", card_name: "Pikachu", card_set: "Jungle" }),
    cRow({ id: 4, card_tcgplayer_id: "4", card_name: "Blastoise", card_set: "Base Set" }),
  ];
  const cards = buildCarouselSequence(rows).slides.filter((s) => s.kind === "card").map((s) => s.deal.id);
  // the 2nd Charizard (id 2) is a filler and comes AFTER the distinct-species cards
  assert.deepEqual(cards, [1, 3, 4, 2]);
});

test("22. carousel sequencing is deterministic for a given input", () => {
  const rows = [1, 2, 3, 4].map((id) => cRow({ id, card_tcgplayer_id: String(id), card_name: "P" + id }));
  const a = buildCarouselSequence(rows).slides.map((s) => `${s.kind}:${s.deal ? s.deal.id : ""}`);
  const b = buildCarouselSequence(rows).slides.map((s) => `${s.kind}:${s.deal ? s.deal.id : ""}`);
  assert.deepEqual(a, b);
});

test("23. not enough distinct cards -> a SHORTER carousel and a truthful count (never a duplicate)", () => {
  const rows = [
    cRow({ id: 1, card_tcgplayer_id: "9", card_name: "Gyarados" }),
    cRow({ id: 2, card_tcgplayer_id: "9", card_name: "Gyarados" }),
    cRow({ id: 3, card_tcgplayer_id: "9", card_name: "Gyarados" }),
    cRow({ id: 4, card_tcgplayer_id: null, card_name: "Gyarados", card_set: "X" }),
    cRow({ id: 5, card_tcgplayer_id: null, card_name: "gyarados", card_set: "x" }),
  ];
  const seq = buildCarouselSequence(rows);
  const cards = seq.slides.filter((s) => s.kind === "card");
  assert.equal(seq.distinctCount, 2);          // tcg:9  +  ns:gyarados|x
  assert.equal(cards.length, 2);
  assert.equal(seq.count, 4);                   // cover + 2 + close
  assert.equal(seq.slides[seq.slides.length - 1].kind, "close");
});

test("24. the cover slide count and hook match the DISTINCT content-slide count, not the raw input", () => {
  const payload = { deal_data: [1, 2, 3, 4, 5, 6, 7].map((id) => cRow({ id })), freshness: { label: "x" } };
  const rawFallback = buildCoverSlideContent(payload); // no opts -> deal_data.length + 2
  assert.equal(rawFallback.carousel.total, 9);
  // with the real deduped numbers from buildCarouselSequence
  const cover = buildCoverSlideContent(payload, { distinctCount: 3, totalSlides: 5 });
  assert.equal(cover.carousel.total, 5);
  assert.match(cover.headline, /^3 Pokemon cards$/);
  const one = buildCoverSlideContent(payload, { distinctCount: 1, totalSlides: 3 });
  assert.match(one.headline, /^1 Pokemon card$/); // singular
});

// === 11. MARKET MOVER - CARD ART IS PART OF THE IDENTITY (13E.3C) =====

test("25. a Market Mover creative renders BOTH the real card and the real chart in variant A and variant B", () => {
  const p = buildMoverPayload({ row: dealRow(), movement: realMovement });
  const slide = buildSlideContent(p);
  const art = { presentation: "hero_left", card: { fileUrl: "file:///cache/12345.jpg" } };
  for (const variant of ["A", "B"]) {
    const html = renderHtml(slide, { variant, cardArtwork: art });
    assert.match(html, /<svg /, `${variant}: has the chart`);
    assert.match(html, /class="card-art" src="file:\/\/\/cache\/12345\.jpg"/, `${variant}: has the real card`);
    assert.match(html, /class="disclosure">Ad</);
  }
});

test("26. a Market Mover with NO resolvable card art fails closed to identity + figure - never a chart-only premium creative", () => {
  const p = buildMoverPayload({ row: dealRow(), movement: realMovement });
  const slide = buildSlideContent(p);
  const html = renderHtml(slide, { variant: "A", cardArtwork: null });
  assert.doesNotMatch(html, /class="chart"/); // the chart element is dropped
  assert.doesNotMatch(html, /<img/i);         // no card image
  assert.match(html, /class="disclosure">Ad</); // still a complete (minimal) slide
  assert.match(html, /\+17%/); // the movement figure is still stated
});
