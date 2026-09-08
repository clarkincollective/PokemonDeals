// Phase SOCIAL-CREATIVE-4B.2 - GENERATIVE DESIGN CANVAS: gpt-image-2 owns
// the visual design, our compositor owns the truth. Pure-logic +
// source-scan + MOCKED OpenAI. No real network, no DB, no Chrome.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildFactLock } from "../../lib/newsroom/editorial/factLock.mjs";
import {
  CANVAS_SLOTS, SLOT_LAYOUTS, slotLayoutFor, reservedRegionsClause, CANVAS_W, CANVAS_H,
} from "../../lib/newsroom/hybrid/canvasSlots.mjs";
import {
  buildDesignCanvasPrompt, generateDesignCanvas, MAX_CANVAS_CANDIDATES, DESIGN_CANVAS_VERSION,
} from "../../lib/newsroom/hybrid/designCanvas.mjs";
import {
  reviewCanvas, selectBestCanvas, CANVAS_VIOLATIONS,
} from "../../lib/newsroom/hybrid/canvasReview.mjs";
import { renderCompositedCanvasHtml } from "../../lib/newsroom/hybrid/canvasCompositor.mjs";
import {
  webFirstCta, isEbayFirstCta, assertNotEbayDefaultCta, WEB_CTAS, SITE,
} from "../../lib/newsroom/hybrid/cta.mjs";
import { generativeCanvasEnabled, runHybridPipeline } from "../../lib/newsroom/hybrid/pipeline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const hybridFiles = readdirSync(join(REPO, "lib/newsroom/hybrid")).filter((f) => f.endsWith(".mjs")).map((f) => `lib/newsroom/hybrid/${f}`);

const mockFetch = (handler) => async (url, opts) => {
  const body = JSON.parse(opts?.body ?? "{}");
  const r = handler(url, body);
  return { ok: r.status ? r.status < 400 : true, status: r.status ?? 200, async json() { return r.json; }, async text() { return JSON.stringify(r.json ?? {}); } };
};
const chatJSON = (obj) => ({ json: { choices: [{ message: { content: JSON.stringify(obj) } }] } });
const imageJSON = () => ({ json: { data: [{ b64_json: Buffer.from("canvas-bytes-here").toString("base64") }] } });

const DEAL_LOCK = () => buildFactLock({ facts_json: { card_name: "Charizard ex", card_set: "Obsidian Flames", card_tcgplayer_id: "517236", total_price_usd: 180.5, market_price: 300, discount_pct: 40 } });

// ================= §4 SAFE-ZONE SPEC =========================
test("C4B2-1. the semantic slot vocabulary + per-family slot layouts exist and stay inside the canvas", () => {
  for (const s of ["HERO_CARD_SLOT", "HEADLINE_SLOT", "HERO_STAT_SLOT", "CHART_SLOT", "WHY_THIS_MATTERS_SLOT", "CTA_SLOT", "BRAND_SLOT", "FOOTER_SLOT"]) {
    assert.ok(CANVAS_SLOTS.includes(s), `missing slot ${s}`);
  }
  for (const layout of ["deal_hero", "market_shape", "asking_vs_sold", "printing_compare", "three_up"]) {
    const L = slotLayoutFor(layout);
    assert.ok(L, `no slot layout for ${layout}`);
    for (const [name, r] of Object.entries(L)) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= CANVAS_W && r.y + r.h <= CANVAS_H, `${layout}.${name} out of canvas`);
    }
    assert.ok("HEADLINE_SLOT" in L && "WHY_THIS_MATTERS_SLOT" in L && "BRAND_SLOT" in L);
  }
  assert.match(reservedRegionsClause("deal_hero"), /RESERVED REGIONS/);
});

// ================= §2/§3/§8 DESIGN CANVAS PROMPT =============
test("C4B2-2. the design-canvas prompt is DATA-FREE by construction and rejects any live-data key", () => {
  const spec = buildDesignCanvasPrompt({ layout: "deal_hero", storyCategory: "DEAL_DROP", candidateSeed: 1 });
  assert.doesNotMatch(spec.prompt, /\$\s?\d|charizard|obsidian|517236|market_price|\d+%/i);
  assert.match(spec.prompt, /NO readable text|NO readable text, letters/i);
  assert.match(spec.prompt, /RESERVED REGIONS/);
  assert.match(spec.prompt, /DO NOT DRAW A TRADING CARD/);
  assert.throws(() => buildDesignCanvasPrompt({ layout: "deal_hero", card_name: "Charizard" }), /data-free by construction/);
  assert.ok(spec.slots && Object.keys(spec.slots).length >= 6);
  assert.equal(spec.model, "gpt-image-2");
  assert.ok(DESIGN_CANVAS_VERSION);
});

test("C4B2-3. the prompt tells the image model NOT to draw cards, characters, logos, or factual text", () => {
  const spec = buildDesignCanvasPrompt({ layout: "market_shape" });
  assert.match(spec.prompt, /NO Pokemon creature|MUST NOT contain/i);
  assert.match(spec.prompt, /no.*card|EMPTY reserved|framed void/i);
  assert.match(spec.prompt, /composited on afterward|composited later/i);
});

test("C4B2-4. generateDesignCanvas with no key does not fabricate a canvas; 2-candidate ceiling", () => {
  assert.equal(MAX_CANVAS_CANDIDATES, 2);
  return generateDesignCanvas({ spec: buildDesignCanvasPrompt({ layout: "deal_hero" }), env: {} }).then((r) => {
    assert.equal(r.ok, false);
    assert.equal(r.availability, "no_key");
  });
});

// ================= §20 CANVAS SAFETY REVIEW =================
test("C4B2-5. reviewCanvas rejects an invented card / readable text / fake numbers; no key -> not used", async () => {
  const bad = await reviewCanvas({ b64: "AAAA", layout: "deal_hero", env: { OPENAI_API_KEY: "k" }, fetchImpl: mockFetch(() => chatJSON({ violations: { invented_trading_card: true }, quality: {}, notes: [] })) });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "AI_BACKGROUND_REJECT");
  assert.ok(bad.reason.includes("invented_trading_card"));

  const noKey = await reviewCanvas({ b64: "AAAA", env: {} });
  assert.equal(noKey.ok, false);
  assert.equal(noKey.state, "AI_BACKGROUND_REJECT");

  const clean = await reviewCanvas({ b64: "AAAA", layout: "deal_hero", env: { OPENAI_API_KEY: "k" }, fetchImpl: mockFetch(() => chatJSON({ violations: {}, quality: { premium_editorial_feel: 80, information_design_richness: 75, composition_strength: 78, safe_zone_usability: 82, scroll_stop_potential: 76, brand_atmosphere: 74 }, notes: [] })) });
  assert.equal(clean.ok, true);
  assert.ok(clean.q_score >= 70);
});

test("C4B2-6. selectBestCanvas picks the higher-quality CLEAN candidate", async () => {
  let n = 0;
  const fetchImpl = mockFetch(() => {
    n += 1;
    const q = n === 1 ? 60 : 85;
    return chatJSON({ violations: {}, quality: Object.fromEntries(["premium_editorial_feel", "information_design_richness", "composition_strength", "safe_zone_usability", "scroll_stop_potential", "brand_atmosphere"].map((d) => [d, q])), notes: [] });
  });
  const sel = await selectBestCanvas({ candidates: [{ b64: "A" }, { b64: "B" }], layout: "market_shape", env: { OPENAI_API_KEY: "k" }, fetchImpl });
  assert.equal(sel.ok, true);
  assert.equal(sel.selected.b64, "B");
  assert.ok(sel.selectedReview.q_score >= 80);
});

// ================= §21/§22/§23 COMPOSITOR ===================
test("C4B2-7. the compositor overlays factual primitives at the reserved slot rects; text is measured-fit", () => {
  const { html, overlayManifest, cta } = renderCompositedCanvasHtml({
    layout: "deal_hero", canvasDataUrl: "data:image/png;base64,QQ==",
    factLock: DEAL_LOCK(), resolved: { data: {} }, cardArt: {}, classification: "COMMERCIAL",
  });
  assert.match(html, /z-index:0.*base64/s); // the canvas is layer 0
  const zones = html.match(/position:absolute;left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px/g) || [];
  assert.ok(zones.length >= 8, `expected >=8 positioned slots, got ${zones.length}`);
  // every slot rect must be a real SLOT_LAYOUTS.deal_hero rect
  const rects = new Set(Object.values(SLOT_LAYOUTS.deal_hero).map((r) => `${r.x},${r.y},${r.w},${r.h}`));
  for (const z of zones) {
    const m = z.match(/left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px/);
    assert.ok(rects.has(`${m[1]},${m[2]},${m[3]},${m[4]}`), `zone ${m.slice(1).join(",")} is not a declared deal_hero slot`);
  }
  assert.ok(overlayManifest.length >= 6);
  assert.equal(cta.text, WEB_CTAS.live_deal);
});

test("C4B2-8. §23 chart proportions are deterministic (from real facts, not image geometry)", () => {
  const { html } = renderCompositedCanvasHtml({
    layout: "deal_hero", canvasDataUrl: "data:image/png;base64,QQ==",
    factLock: buildFactLock({ facts_json: { total_price_usd: 60, market_price: 300, discount_pct: 80, _p: 1 } }), resolved: { data: {} }, cardArt: {}, classification: "COMMERCIAL",
  });
  // price_gap_bar renders a green fill at listed/market = 20%
  assert.match(html, /width:20%/);
});

test("C4B2-9. every overlay value in the manifest is sourced from FACT_LOCK / sanctioned resolver", () => {
  const { overlayManifest } = renderCompositedCanvasHtml({
    layout: "market_shape", canvasDataUrl: "data:image/png;base64,QQ==",
    factLock: buildFactLock({ facts_json: { tracked_count: 24000, percentages: [85, 5] } }),
    resolved: { data: { under25Pct: 85, over100Pct: 5, pricedCards: 24000, featured: { card_name: "Clefairy", asking_usd: 50, market_ref_usd: 199 } } },
    cardArt: {}, classification: "EDITORIAL",
  });
  for (const m of overlayManifest) assert.match(m.source, /FACT_LOCK|resolver/);
});

// ================= §11 WEBSITE-FIRST CTA ====================
test("C4B2-10. 'View on eBay' (and eBay-first phrasing) is rejected as a social CTA; website-first is used", () => {
  assert.ok(isEbayFirstCta("View on eBay"));
  assert.ok(isEbayFirstCta("See it on eBay →"));
  assert.ok(isEbayFirstCta("Buy on eBay"));
  assert.ok(!isEbayFirstCta("See the live deal"));
  assert.ok(!isEbayFirstCta("pokemondealfinder.com"));
  assert.throws(() => assertNotEbayDefaultCta("View on eBay"), /straight to eBay/);
  assert.doesNotThrow(() => assertNotEbayDefaultCta("Browse live deals"));

  const commercial = webFirstCta({ classification: "COMMERCIAL", layout: "deal_hero" });
  assert.equal(commercial.text, "See the live deal");
  assert.ok(!isEbayFirstCta(commercial.text));
  const edu = webFirstCta({ classification: "EDITORIAL" });
  assert.equal(edu.text, SITE);
  assert.equal(edu.intensity, "DOMAIN_ONLY");
});

test("C4B2-11. the composited canvas HTML never contains an eBay-first CTA", () => {
  for (const layout of ["deal_hero", "market_shape", "asking_vs_sold", "three_up"]) {
    const { html } = renderCompositedCanvasHtml({ layout, canvasDataUrl: "data:image/png;base64,QQ==", factLock: DEAL_LOCK(), resolved: { data: {} }, cardArt: {}, classification: layout === "deal_hero" || layout === "three_up" ? "COMMERCIAL" : "EDITORIAL" });
    assert.doesNotMatch(html, /view on ebay|on ebay/i, `${layout} html has an eBay-first CTA`);
    assert.match(html, /pokemondealfinder\.com/i);
  }
});

// ================= PIPELINE + FACT LOCK =====================
test("C4B2-12. runHybridPipeline generative-canvas: a full mocked run -> mode GENERATIVE_DESIGN_CANVAS + html + manifest", async () => {
  const fetchImpl = mockFetch((url) => {
    if (url.includes("/images/")) return imageJSON();
    return chatJSON({ violations: {}, quality: Object.fromEntries(["premium_editorial_feel", "information_design_richness", "composition_strength", "safe_zone_usability", "scroll_stop_potential", "brand_atmosphere"].map((d) => [d, 80])), notes: [] });
  });
  const r = await runHybridPipeline({
    story: { series: "DEAL_DROP", facts_json: { card_name: "Charizard ex", card_set: "Obsidian Flames", card_tcgplayer_id: "517236", total_price_usd: 180.5, market_price: 300, discount_pct: 42 } },
    platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 180.5, marketUsd: 300, discountPct: 42 } },
    cardArt: { 517236: "file:///c/art/517236.jpg" },
    generativeCanvas: true, enabled: true,
    env: { OPENAI_API_KEY: "k", SOCIAL_GENERATIVE_CANVAS: "true" }, fetchImpl,
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.mode, "GENERATIVE_DESIGN_CANVAS");
  assert.ok(r.generativeCanvas && r.generativeCanvas.html.includes("base64"));
  assert.ok(r.generativeCanvas.overlay_manifest.length >= 6);
  assert.equal(r.generativeCanvas.cta.text, "See the live deal");
});

test("C4B2-13. generative-canvas: no design canvas passes safety -> AI_BACKGROUND_REJECT, no render", async () => {
  const fetchImpl = mockFetch((url) => {
    if (url.includes("/images/")) return imageJSON();
    return chatJSON({ violations: { invented_trading_card: true }, quality: {}, notes: [] });
  });
  const r = await runHybridPipeline({
    story: { series: "DEAL_DROP", facts_json: { card_name: "X", total_price_usd: 10, market_price: 20, discount_pct: 50 } },
    platform: "instagram", layout: "deal_hero", resolved: { data: {} },
    generativeCanvas: true, enabled: true, env: { OPENAI_API_KEY: "k" }, fetchImpl,
  });
  assert.equal(r.ok, false);
  assert.equal(r.stage, "generative_canvas");
  assert.equal(r.state, "AI_BACKGROUND_REJECT");
});

test("C4B2-14. generative-canvas still blocks the unrelated-era Umbreon (editorial gate first)", async () => {
  const r = await runHybridPipeline({
    story: { series: "EXACT_PRINTING_MATTERS", facts_json: {} }, platform: "instagram", layout: "printing_compare",
    printingPair: { high: { name: "Umbreon", set: "Evolving Skies", card_number: "215", market_price: 520 }, low: { name: "Umbreon", set: "Neo Discovery", card_number: "13", market_price: 110 } },
    generativeCanvas: true, enabled: true, env: {}, fetchImpl: mockFetch(() => chatJSON({})),
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "EDITORIAL_WITHHOLD");
});

// ================= §1 / §5 / §6 / §30 / §31 SCOPE ============
test("C4B2-15. existing systems preserved: deterministic template + 4B background + 4B.1 freeform still exported", async () => {
  const P = await import("../../lib/newsroom/hybrid/pipeline.mjs");
  assert.equal(typeof P.buildBackgroundPrompt, "function"); // 4B
  assert.equal(typeof P.renderBlueprintHtml, "function"); // 4B.1
  assert.equal(typeof P.runGenerativeCanvas, "function"); // 4B.2
  assert.equal(typeof P.generativeCanvasEnabled, "function");
  const ct = await import("../../lib/social/newsroom/cardEditorialTemplates.mjs");
  assert.equal(typeof ct.renderCardEditorialHtml, "function"); // deterministic
});

test("C4B2-16. generative canvas is OFF by default", () => {
  assert.equal(generativeCanvasEnabled({}), false);
  assert.equal(generativeCanvasEnabled({ SOCIAL_GENERATIVE_CANVAS: "false" }), false);
  assert.equal(generativeCanvasEnabled({ SOCIAL_GENERATIVE_CANVAS: "true" }), true);
});

test("C4B2-17. the 4B.2 layer does NO Buffer / cron / Stage-1 / RIGHTS / email / eBay-Browse / verify action", () => {
  for (const f of ["lib/newsroom/hybrid/canvasSlots.mjs", "lib/newsroom/hybrid/designCanvas.mjs", "lib/newsroom/hybrid/canvasReview.mjs", "lib/newsroom/hybrid/canvasCompositor.mjs", "lib/newsroom/hybrid/cta.mjs"]) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} Buffer`);
    assert.doesNotMatch(src, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} schedule`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} RIGHTS`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browse api/i, `${f} eBay`);
    assert.doesNotMatch(src, /verify-deals|verifyDeals/i, `${f} verify`);
    assert.doesNotMatch(src, /from\(\s*price_history\s*\)/, `${f} price_history`);
  }
});

test("C4B2-18. no video / motion work in this phase (§30)", () => {
  for (const f of ["lib/newsroom/hybrid/designCanvas.mjs", "lib/newsroom/hybrid/canvasCompositor.mjs"]) {
    assert.doesNotMatch(code(f), /videoRender|videoTimeline|1080x1920|storyboard/i, `${f}`);
  }
});
