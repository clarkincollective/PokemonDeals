// Phase SOCIAL-CREATIVE-5 - FULL_GENERATIVE_SOCIAL: generate first like a
// designer, verify afterward like an auditor. Pure-logic + source-scan +
// MOCKED OpenAI (image + vision). No real network, no DB, no Chrome.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { buildFactLock } from "../../lib/newsroom/editorial/factLock.mjs";
import { contractFor } from "../../lib/newsroom/editorial/storyContracts.mjs";
import {
  buildFactManifest, buildMasterPrompt, generateFullSocial, reviewCardFidelity,
  verifyFacts, reviewCreativeQuality, MAX_FULLGEN_CANDIDATES,
} from "../../lib/newsroom/hybrid/fullGenerative.mjs";
import { assessRepair, buildRepairOverlayHtml } from "../../lib/newsroom/hybrid/fullGenerativeRepair.mjs";
import { runFullGenerativeSocial } from "../../lib/newsroom/hybrid/fullGenerativePipeline.mjs";
import {
  PRODUCTION_IMAGE_MODES, DEPRECATED_IMAGE_PATHS, resolveImageMode, isDeprecatedImagePath, FULLGEN_STATES, IMAGE_MODE_VERSION,
} from "../../lib/newsroom/hybrid/imageMode.mjs";
import { isEbayFirstCta } from "../../lib/newsroom/hybrid/cta.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const hybridFiles = readdirSync(join(REPO, "lib/newsroom/hybrid")).filter((f) => f.endsWith(".mjs")).map((f) => `lib/newsroom/hybrid/${f}`);

// a fake card PNG on disk (generateFullSocial needs a real file)
const TMP = join(tmpdir(), "sc5-test");
mkdirSync(TMP, { recursive: true });
const CARD_PNG = join(TMP, "card.png");
writeFileSync(CARD_PNG, Buffer.from("89504e470d0a1a0a", "hex")); // PNG magic bytes, enough for existsSync + Blob

const mockFetch = (h) => async (url, opts) => {
  const isForm = opts?.body instanceof FormData;
  const body = isForm ? {} : JSON.parse(opts?.body ?? "{}");
  const r = h(url, body, isForm);
  return { ok: r.status ? r.status < 400 : true, status: r.status ?? 200, async json() { return r.json; }, async text() { return JSON.stringify(r.json ?? {}); } };
};
const chat = (o) => ({ json: { choices: [{ message: { content: JSON.stringify(o) } }] } });
const image = () => ({ json: { data: [{ b64_json: Buffer.from("generated-social-post").toString("base64") }] } });

const DEAL_LOCK = () => buildFactLock({ facts_json: { card_name: "Gyarados EX", card_set: "XY Promos", card_tcgplayer_id: "1", total_price_usd: 12.93, market_price: 23, discount_pct: 45 } });
const DEAL_MANIFEST = () => buildFactManifest({ layout: "deal_hero", factLock: DEAL_LOCK(), resolved: { data: {} }, contract: contractFor("DEAL_DROP") });

// ================= §1/§25/§26 SIMPLIFICATION ================
test("SC5-1. only two production image modes; the four old paths are DEPRECATED_IMAGE_PATH", () => {
  assert.deepEqual([...PRODUCTION_IMAGE_MODES], ["FULL_GENERATIVE_SOCIAL", "SAFE_FALLBACK"]);
  for (const k of ["DETERMINISTIC_TEMPLATE", "HYBRID_BACKGROUND", "AI_DIRECTED_COMPOSITION", "GENERATIVE_DESIGN_CANVAS"]) {
    assert.equal(DEPRECATED_IMAGE_PATHS[k].status, "DEPRECATED_IMAGE_PATH");
  }
  assert.ok(isDeprecatedImagePath("HYBRID_BACKGROUND"));
  assert.ok(isDeprecatedImagePath("GENERATIVE_DESIGN_CANVAS"));
  assert.ok(!isDeprecatedImagePath("FULL_GENERATIVE_SOCIAL"));
  assert.ok(IMAGE_MODE_VERSION);
});

test("SC5-2. resolveImageMode defaults to SAFE_FALLBACK; full_generative is opt-in", () => {
  assert.equal(resolveImageMode({}), "SAFE_FALLBACK");
  assert.equal(resolveImageMode({ SOCIAL_IMAGE_MODE: "safe_fallback" }), "SAFE_FALLBACK");
  assert.equal(resolveImageMode({ SOCIAL_IMAGE_MODE: "full_generative" }), "FULL_GENERATIVE_SOCIAL");
  assert.equal(resolveImageMode({ SOCIAL_IMAGE_MODE: "GENERATIVE_DESIGN_CANVAS" }), "SAFE_FALLBACK"); // a deprecated mode is NOT selectable
});

test("SC5-3. the §27 failure states are all declared", () => {
  for (const s of ["EDITORIAL_WITHHOLD", "GENERATION_FAILED", "CARD_FIDELITY_FAIL", "FACT_VERIFY_FAIL", "TEXT_VERIFY_FAIL", "VISUAL_QUALITY_HOLD", "SAFE_REPAIR_REQUIRED", "BUFFER_READY"]) {
    assert.ok(FULLGEN_STATES.includes(s), `missing ${s}`);
  }
});

// ================= §5 FACT MANIFEST =========================
test("SC5-4. buildFactManifest is the deterministic source of truth (required text, numerics, CTA, card identity)", () => {
  const m = DEAL_MANIFEST();
  assert.ok(m.required_text.includes("Gyarados EX") && m.required_text.includes("XY Promos"));
  assert.ok(m.required_text.includes("$12.93") && m.required_text.includes("$23"));
  assert.ok(m.required_text.includes("45% below market"));
  assert.ok(m.required_text.includes("PokemonDealFinder"));
  assert.ok(m.required_text.includes("See the live deal"));
  assert.equal(m.required_numeric_facts.listed_price, 12.93);
  assert.equal(m.required_numeric_facts.market_price, 23);
  assert.equal(m.required_numeric_facts.discount_pct, 45);
  assert.equal(m.website_first_cta, true);
  assert.equal(m.card_identity.name, "Gyarados EX");
  assert.ok(m.prohibited_claims.some((c) => /eBay/.test(c) || /fake urgency/.test(c)));
  assert.ok(m.fact_lock_hash && m.fact_lock_hash.length === 16);
});

test("SC5-5. the master prompt carries the real facts (§4) + the quality bar + anti-HUD list; never an eBay-first CTA instruction", () => {
  const p = buildMasterPrompt({ layout: "deal_hero", factManifest: DEAL_MANIFEST() });
  assert.match(p, /Gyarados EX/);
  assert.match(p, /\$12\.93/);
  assert.match(p, /45% below market/);
  assert.match(p, /gaming HUD|tactical UI|cyberpunk/);
  assert.match(p, /CARD-FIRST|card-first/i);
  assert.match(p, /modern trading-card magazine|COLLECTOR EDITORIAL/i);
  assert.match(p, /See the live deal/);
  assert.match(p, /NEVER "View on eBay"|NEVER 'View on eBay'/);
});

// ================= §3 REAL CARD INPUT =======================
test("SC5-6. generateFullSocial passes the real card image(s) as multipart input; no key / no card -> no fabrication", async () => {
  let sawForm = false, sawImagePart = false;
  const fetchImpl = mockFetch((url, _b, isForm) => {
    if (url.includes("/images/edits")) { sawForm = isForm; return image(); }
    return chat({});
  });
  // patch FormData.append detection: re-run with a spy
  const realAppend = FormData.prototype.append;
  FormData.prototype.append = function (k, ...rest) { if (k === "image[]") sawImagePart = true; return realAppend.call(this, k, ...rest); };
  try {
    const r = await generateFullSocial({ prompt: "design it", cardImagePaths: [CARD_PNG], env: { OPENAI_API_KEY: "k" }, fetchImpl });
    assert.equal(r.ok, true);
    assert.ok(sawForm, "the edits call must be multipart form data");
    assert.ok(sawImagePart, "the real card must be attached as image[]");
  } finally { FormData.prototype.append = realAppend; }

  const noKey = await generateFullSocial({ prompt: "x", cardImagePaths: [CARD_PNG], env: {} });
  assert.equal(noKey.ok, false);
  assert.equal(noKey.availability, "no_key");
  const noCard = await generateFullSocial({ prompt: "x", cardImagePaths: ["/nope/missing.png"], env: { OPENAI_API_KEY: "k" }, fetchImpl });
  assert.equal(noCard.ok, false);
  assert.equal(noCard.availability, "no_card_image");
});

// ================= §17 FACT VERIFICATION ====================
test("SC5-7. verifyFacts: a wrong price -> FACT_VERIFY_FAIL; an invented percentage -> FACT_VERIFY_FAIL", async () => {
  const wrongPrice = await verifyFacts({ b64: "AA", factManifest: DEAL_MANIFEST(), env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ missing_required_text: [], wrong_numbers: [{ shown: "$19.99", expected: "$12.93", label: "deal price" }], invented_numbers: [], invented_claims: [], cta_is_ebay_first: false, branding_present: true, typos_or_garbled_text: [], severity: "MAJOR" })) });
  assert.equal(wrongPrice.ok, false);
  assert.equal(wrongPrice.state, "FACT_VERIFY_FAIL");

  const invented = await verifyFacts({ b64: "AA", factManifest: DEAL_MANIFEST(), env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ missing_required_text: [], wrong_numbers: [], invented_numbers: ["73% sold this week"], invented_claims: [], cta_is_ebay_first: false, branding_present: true, typos_or_garbled_text: [], severity: "MAJOR" })) });
  assert.equal(invented.ok, false);
  assert.equal(invented.state, "FACT_VERIFY_FAIL");
});

test("SC5-8. verifyFacts: an eBay-first CTA -> FACT_VERIFY_FAIL; a clean post -> ok", async () => {
  const ebay = await verifyFacts({ b64: "AA", factManifest: DEAL_MANIFEST(), env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ missing_required_text: [], wrong_numbers: [], invented_numbers: [], invented_claims: [], cta_is_ebay_first: true, branding_present: true, typos_or_garbled_text: [], severity: "MAJOR" })) });
  assert.equal(ebay.ok, false);
  assert.equal(ebay.state, "FACT_VERIFY_FAIL");

  const clean = await verifyFacts({ b64: "AA", factManifest: DEAL_MANIFEST(), env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ missing_required_text: [], wrong_numbers: [], invented_numbers: [], invented_claims: [], cta_is_ebay_first: false, branding_present: true, typos_or_garbled_text: [], severity: "NONE" })) });
  assert.equal(clean.ok, true);
});

test("SC5-9. verifyFacts: a small missing footer string -> SAFE_REPAIR_REQUIRED (repairable), not a hard fail", async () => {
  const r = await verifyFacts({ b64: "AA", factManifest: DEAL_MANIFEST(), env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ missing_required_text: ["PokemonDealFinder"], wrong_numbers: [], invented_numbers: [], invented_claims: [], cta_is_ebay_first: false, branding_present: false, typos_or_garbled_text: [], severity: "MINOR" })) });
  // branding_present:false is a hard fail; test the pure repairable branch instead:
  const r2 = await verifyFacts({ b64: "AA", factManifest: DEAL_MANIFEST(), env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ missing_required_text: ["See the live deal"], wrong_numbers: [], invented_numbers: [], invented_claims: [], cta_is_ebay_first: false, branding_present: true, typos_or_garbled_text: [], severity: "MINOR" })) });
  assert.equal(r2.ok, false);
  assert.equal(r2.state, "SAFE_REPAIR_REQUIRED");
  assert.deepEqual(r2.repairable.missing, ["See the live deal"]);
});

// ================= §19 DETERMINISTIC REPAIR =================
test("SC5-10. assessRepair: a missing CTA/domain is footer-patchable; a garbled fact / missing price is NOT", () => {
  assert.equal(assessRepair({ missing: ["See the live deal", "pokemondealfinder.com"], typos: [] }).patchable, true);
  assert.equal(assessRepair({ missing: ["$12.93"], typos: [] }).patchable, false);
  assert.equal(assessRepair({ missing: [], typos: ["Gyrados EX"] }).patchable, false);
  const html = buildRepairOverlayHtml({ generatedDataUrl: "data:image/png;base64,QQ==", ctaText: "See the live deal" });
  assert.match(html, /PokemonDealFinder/);
  assert.match(html, /pokemondealfinder\.com/);
  assert.match(html, /See the live deal/);
  assert.doesNotMatch(html, /view on ebay/i);
});

// ================= §20 CARD FIDELITY ========================
test("SC5-11. reviewCardFidelity: altered artwork / mangled card -> CARD_FIDELITY_FAIL; faithful -> PASS", async () => {
  const bad = await reviewCardFidelity({ b64: "AA", cardImageB64s: ["BB"], cardIdentity: { name: "Gyarados EX" }, env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ artwork_materially_changed: true, card_details_altered: false, card_shape_mangled: false, fake_card_variation_introduced: false, fidelity_score: 30, notes: [] })) });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "CARD_FIDELITY_FAIL");

  const ok = await reviewCardFidelity({ b64: "AA", cardImageB64s: ["BB"], cardIdentity: { name: "Gyarados EX" }, env: { OPENAI_API_KEY: "k" },
    fetchImpl: mockFetch(() => chat({ artwork_materially_changed: false, card_details_altered: false, card_shape_mangled: false, fake_card_variation_introduced: false, fidelity_score: 92, notes: [] })) });
  assert.equal(ok.ok, true);
  assert.equal(ok.fidelity_score, 92);
});

// ================= FULL PIPELINE (mocked) ==================
function fullMock({ fidelity = 90, factState = "NONE", quality = "PASS", missing = [], wrong = [], invented = [], ebay = false, branding = true } = {}) {
  return mockFetch((url, _b, isForm) => {
    if (url.includes("/images/edits") || isForm) return image();
    const body = _b?.messages?.[0]?.content?.find?.((c) => c.type === "text")?.text ?? JSON.stringify(_b);
    if (/fidelity_score/.test(body)) return chat({ artwork_materially_changed: fidelity < 62, card_details_altered: false, card_shape_mangled: false, fake_card_variation_introduced: false, fidelity_score: fidelity, notes: [] });
    if (/REQUIRED TEXT/.test(body)) return chat({ missing_required_text: missing, wrong_numbers: wrong, invented_numbers: invented, invented_claims: [], cta_is_ebay_first: ebay, branding_present: branding, typos_or_garbled_text: [], severity: factState });
    return chat({ scores: Object.fromEntries(["scroll_stop", "professional_polish", "premium_feel", "card_is_hero", "story_instantly_clear", "supporting_graphics_useful", "information_rich_not_cluttered", "looks_like_a_real_media_brand", "save_share_likelihood", "click_curiosity", "ai_spam_risk"].map((k) => [k, k === "ai_spam_risk" ? 25 : 80])), verdict: quality, notes: [] });
  });
}
const STORY = { series: "DEAL_DROP", facts_json: { card_name: "Gyarados EX", card_set: "XY Promos", card_tcgplayer_id: "1", total_price_usd: 12.93, market_price: 23, discount_pct: 45 } };

test("SC5-12. runFullGenerativeSocial: a clean generate+verify -> BUFFER_READY with the image + manifest + caption handoff", async () => {
  const r = await runFullGenerativeSocial({
    story: STORY, platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 12.93, marketUsd: 23, discountPct: 45, card: { name: "Gyarados EX", set: "XY Promos", tcgplayerId: "1" } } },
    cardImagePaths: [CARD_PNG], env: { OPENAI_API_KEY: "k" }, fetchImpl: fullMock({}),
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.state, "BUFFER_READY");
  assert.ok(r.imageB64);
  assert.equal(r.repaired, false);
  assert.ok(r.factManifest.required_text.includes("$12.93"));
  assert.equal(r.verification.card_fidelity, true);
  assert.equal(r.verification.fact_verify, "PASS");
  assert.ok(r.caption_handoff && "why_it_matters" in r.caption_handoff);
});

test("SC5-13. runFullGenerativeSocial: a wrong price -> FACT_VERIFY_FAIL, no silent weak fallback", async () => {
  const r = await runFullGenerativeSocial({
    story: STORY, platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 12.93, marketUsd: 23, discountPct: 45 } },
    cardImagePaths: [CARD_PNG], env: { OPENAI_API_KEY: "k" }, fetchImpl: fullMock({ factState: "MAJOR", wrong: [{ shown: "$19.99", expected: "$12.93", label: "price" }] }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "FACT_VERIFY_FAIL");
});

test("SC5-14. runFullGenerativeSocial: card fidelity failure -> CARD_FIDELITY_FAIL", async () => {
  const r = await runFullGenerativeSocial({
    story: STORY, platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 12.93, marketUsd: 23, discountPct: 45 } },
    cardImagePaths: [CARD_PNG], env: { OPENAI_API_KEY: "k" }, fetchImpl: fullMock({ fidelity: 20 }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CARD_FIDELITY_FAIL");
});

test("SC5-15. runFullGenerativeSocial: a footer-repairable slip -> BUFFER_READY with repaired:true + repair HTML", async () => {
  const r = await runFullGenerativeSocial({
    story: STORY, platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 12.93, marketUsd: 23, discountPct: 45 } },
    cardImagePaths: [CARD_PNG], env: { OPENAI_API_KEY: "k" }, fetchImpl: fullMock({ factState: "MINOR", missing: ["See the live deal"] }),
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.repaired, true);
  assert.match(r.repairedHtml, /PokemonDealFinder/);
});

test("SC5-16. runFullGenerativeSocial: the unrelated-era Umbreon is still EDITORIAL_WITHHOLD (gate first)", async () => {
  const r = await runFullGenerativeSocial({
    story: { series: "EXACT_PRINTING_MATTERS", facts_json: {} }, platform: "instagram", layout: "printing_compare",
    printingPair: { high: { name: "Umbreon", set: "Evolving Skies", card_number: "215", market_price: 520 }, low: { name: "Umbreon", set: "Neo Discovery", card_number: "13", market_price: 110 } },
    cardImagePaths: [CARD_PNG], env: { OPENAI_API_KEY: "k" }, fetchImpl: fullMock({}),
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "EDITORIAL_WITHHOLD");
});

test("SC5-17. runFullGenerativeSocial: generation failure -> GENERATION_FAILED (no fabrication)", async () => {
  const r = await runFullGenerativeSocial({
    story: STORY, platform: "instagram", layout: "deal_hero", resolved: { data: {} },
    cardImagePaths: [CARD_PNG], env: {}, fetchImpl: fullMock({}),
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "GENERATION_FAILED");
});

test("SC5-18. 2-candidate ceiling; bounded (no endless retry)", () => {
  assert.equal(MAX_FULLGEN_CANDIDATES, 2);
});

// ================= SCOPE / SAFETY (§29, §30, §31) ==========
test("SC5-19. the phase-5 layer does NO Buffer / cron / Stage-1 / RIGHTS / email / eBay-Browse / video / verify action", () => {
  for (const f of ["lib/newsroom/hybrid/fullGenerative.mjs", "lib/newsroom/hybrid/fullGenerativePipeline.mjs", "lib/newsroom/hybrid/fullGenerativeRepair.mjs", "lib/newsroom/hybrid/imageMode.mjs"]) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} Buffer`);
    assert.doesNotMatch(src, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} schedule`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} RIGHTS`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com|\/buy\/browse\//i, `${f} eBay Browse`);
    assert.doesNotMatch(src, /verify-deals|verifyDeals/i, `${f} verify`);
    assert.doesNotMatch(src, /videoRender|videoTimeline|1080x1920|storyboard/i, `${f} video`);
  }
});

test("SC5-20. renderCardForwardStory routes FULL_GENERATIVE_SOCIAL and withholds on a failure state (no weak fallback)", () => {
  const src = read("lib/newsroom/cardForwardRender.mjs");
  assert.match(src, /runFullGenerativeSocial/);
  assert.match(src, /FULL_GENERATIVE_SOCIAL/);
  assert.match(src, /if \(!fg\.ok\)[\s\S]{0,120}withheld/);
});
