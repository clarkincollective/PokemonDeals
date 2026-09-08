// Phase SOCIAL-CREATIVE-5A - SEMANTIC FACT AUDITOR + BRAND LOCK.
// BEAUTIFUL + WRONG = FAIL. Pure-logic + source-scan + MOCKED OpenAI.
// Includes the §19 NEGATIVE TEST PACK - every case must FAIL the auditor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { buildFactLock } from "../../lib/newsroom/editorial/factLock.mjs";
import { contractFor } from "../../lib/newsroom/editorial/storyContracts.mjs";
import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  buildSemanticManifest, comparisonDirection, recomputeDerivedFacts, DIRECTION_WORDS, STORY_PREMISES,
} from "../../lib/newsroom/hybrid/semanticManifest.mjs";
import { auditSemantics, detectGeneratedBrandRisk, semanticVerify } from "../../lib/newsroom/hybrid/semanticAudit.mjs";
import { provePrintingPair } from "../../lib/newsroom/hybrid/printingIdentity.mjs";
import { compositeBrandAssetHtml, BRAND_SAFE_ZONE_CLAUSE, APPROVED_BRAND } from "../../lib/newsroom/hybrid/brandLock.mjs";
import { runFullGenerativeSocial } from "../../lib/newsroom/hybrid/fullGenerativePipeline.mjs";
import { newBudget } from "../../lib/newsroom/hybrid/budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const newFiles = ["semanticManifest.mjs", "semanticAudit.mjs", "printingIdentity.mjs", "brandLock.mjs", "fullGenerativePipeline.mjs"].map((f) => `lib/newsroom/hybrid/${f}`);

const semFor = (layout, facts, resolved, series) =>
  buildSemanticManifest({ layout, factLock: buildFactLock({ facts_json: facts }), resolved: { data: resolved }, contract: contractFor(series) });

const TMP = join(tmpdir(), "sc5a-test");
mkdirSync(TMP, { recursive: true });
const CARD_A = join(TMP, "a.png");
const CARD_B = join(TMP, "b.png");
writeFileSync(CARD_A, Buffer.from("89504e470d0a1a0a0000", "hex"));
writeFileSync(CARD_B, Buffer.from("89504e470d0a1a0affff", "hex"));

// ================= §4 COMPARISON-DIRECTION ENGINE ===========
test("SC5A-1. comparisonDirection is deterministic truth: below / above / near market with correct % and sign", () => {
  const below = comparisonDirection(50.14, 199);
  assert.equal(below.relation, "BELOW_MARKET");
  assert.equal(below.discount_pct, 75);
  assert.equal(below.sign, "-");
  const above = comparisonDirection(269, 200);
  assert.equal(above.relation, "ABOVE_MARKET");
  assert.equal(above.premium_pct, 35);
  assert.equal(above.sign, "+");
  assert.equal(comparisonDirection(20, 20.3).relation, "NEAR_MARKET");
  assert.equal(comparisonDirection(20, 20.3, { tolerance: 0.001 }).relation, "BELOW_MARKET");
});

// ================= §2 SEMANTIC MANIFEST =====================
test("SC5A-2. the semantic manifest carries scope, comparison direction, premise + prohibited takeaways", () => {
  const ms = semFor("market_shape", { tracked_count: 24545, percentages: [85.7, 4.7], card_name: "Clefairy" }, { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545, featured: { card_name: "Clefairy" } }, "MARKET_SNAPSHOT");
  assert.equal(ms.claim_scope, "ALL_TRACKED_SINGLES");
  assert.equal(ms.example_card_is_not_population, true);
  assert.equal(ms.example_card, "Clefairy");
  assert.ok(ms.forbidden_scope_phrases.some((p) => /clefairy singles/i.test(p)));

  const avs = semFor("asking_vs_sold", { card_name: "Clefairy", total_price_usd: 50.14, market_price: 199 }, { askingUsd: 50.14, marketRefUsd: 199 }, "WHY_SOLD_PRICES_MATTER");
  assert.equal(avs.comparison_direction, "BELOW_MARKET");
  assert.equal(avs.comparison_pct, 75);
  assert.ok(avs.forbidden_direction_words.includes("premium"));
  assert.ok(avs.allowed_direction_words.includes("below market") || avs.allowed_direction_words.includes("discount"));
  assert.match(avs.appropriate_lesson, /below market/i);
  assert.ok(Object.keys(STORY_PREMISES).length >= 5);
});

// ================= P0 REGRESSION: OWNER-FOUND FAILURES =====
test("SC5A-3. CASE A (owner P0): ASKING_VS_SOLD $50.14 vs $199 shown as 'PREMIUM -75%' + 'Don't pay the ask' -> SEMANTIC_CONTRADICTION_FAIL", () => {
  const sem = semFor("asking_vs_sold", { card_name: "Clefairy", total_price_usd: 50.14, market_price: 199 }, { askingUsd: 50.14, marketRefUsd: 199 }, "WHY_SOLD_PRICES_MATTER");
  const audit = auditSemantics({
    extraction: {
      headline: "PREMIUM -75%",
      all_numbers: ["$50.14", "$199", "-75%"],
      comparisons: [{ left: "ASK $50.14", right: "MARKET $199", stated_relation: "premium", stated_pct: "-75%", arrow_direction: "up", colour_of_main_number: "red" }],
      takeaways: ["Don't pay the ask. Know the market."],
      claims: [], logos_detected: [],
    },
    semanticManifest: sem,
  });
  assert.equal(audit.ok, false);
  assert.ok(["SEMANTIC_CONTRADICTION_FAIL", "SEMANTIC_FACT_FAIL"].includes(audit.state));
  assert.ok(audit.findings.length >= 3);
  assert.ok(audit.findings.some((f) => /premium.*below market|below market.*premium/i.test(f.detail)));
  assert.ok(audit.findings.some((f) => /don'?t pay the ask/i.test(f.detail)));
});

test("SC5A-4. CASE B (owner P0): MARKET_SNAPSHOT '85.7% of Clefairy singles' / '24,545 Clefairy singles' -> CLAIM_SCOPE_FAIL", () => {
  const sem = semFor("market_shape", { tracked_count: 24545, percentages: [85.7, 4.7], card_name: "Clefairy" }, { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545, featured: { card_name: "Clefairy" } }, "MARKET_SNAPSHOT");
  const audit = auditSemantics({
    extraction: {
      headline: "85.7% of Clefairy singles sell under $25",
      claims: [{ subject: "Clefairy singles", predicate: "sell under $25", value: "85.7%", qualifier: "", scope: "24,545 Clefairy singles" }],
      comparisons: [], takeaways: ["Sample: 24,545 Clefairy singles"], all_numbers: ["85.7%", "24,545"], logos_detected: [],
    },
    semanticManifest: sem,
  });
  assert.equal(audit.ok, false);
  assert.equal(audit.state, "CLAIM_SCOPE_FAIL");
});

test("SC5A-5. a CORRECT market_shape post ('85.7% of tracked singles', 'Clefairy is one example') PASSES the auditor", () => {
  const sem = semFor("market_shape", { tracked_count: 24545, percentages: [85.7, 4.7], card_name: "Clefairy" }, { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545, featured: { card_name: "Clefairy" } }, "MARKET_SNAPSHOT");
  const audit = auditSemantics({
    extraction: {
      headline: "85.7% of tracked singles sell under $25",
      claims: [{ subject: "tracked Pokemon singles", predicate: "sell under $25", value: "85.7%", qualifier: "", scope: "24,545 tracked singles" }],
      comparisons: [], takeaways: ["Clefairy is one example."], all_numbers: ["85.7%", "24,545", "14.3%"], logos_detected: [],
    },
    semanticManifest: sem,
  });
  assert.equal(audit.ok, true, JSON.stringify(audit.findings));
});

test("SC5A-6. a CORRECT below-market asking post ('75% below market', 'compare before you judge') PASSES", () => {
  const sem = semFor("asking_vs_sold", { card_name: "Clefairy", total_price_usd: 50.14, market_price: 199 }, { askingUsd: 50.14, marketRefUsd: 199 }, "WHY_SOLD_PRICES_MATTER");
  const audit = auditSemantics({
    extraction: {
      headline: "This ask sits 75% below market",
      comparisons: [{ left: "ASK $50.14", right: "MARKET $199", stated_relation: "below market", stated_pct: "-75%", arrow_direction: "down", colour_of_main_number: "green" }],
      takeaways: ["An asking price can also sit well below market - compare before you judge."],
      claims: [], all_numbers: ["$50.14", "$199", "75%"], logos_detected: [],
    },
    semanticManifest: sem,
  });
  assert.equal(audit.ok, true, JSON.stringify(audit.findings));
});

// ================= §10 PRINTING IDENTITY PROOF =============
test("SC5A-7. CASE C (owner P0): PRINTING_COMPARE with the SAME canonical id/image -> PRINTING_IDENTITY_FAIL", () => {
  assert.equal(provePrintingPair({ high: { tcgplayerId: "52", name: "Gengar", set: "SWSH052", price_usd: 2200 }, low: { tcgplayerId: "52", name: "Gengar", set: "SWSH052", price_usd: 126 }, cardImagePaths: [] }).state, "PRINTING_IDENTITY_FAIL");
  // distinct ids but same set string + no edition axis -> still fail (can't prove the visual distinction)
  const r = provePrintingPair({ high: { tcgplayerId: "52a", name: "Gengar", set: "SWSH052", price_usd: 2200 }, low: { tcgplayerId: "52b", name: "Gengar", set: "SWSH052", price_usd: 126 }, cardImagePaths: [] });
  assert.equal(r.ok, false);
  assert.equal(r.state, "PRINTING_IDENTITY_FAIL");
  // a genuine pair (Base Set 1st Ed vs Unlimited #4, distinct ids) -> proves
  const good = provePrintingPair({
    high: { tcgplayerId: "100", name: "Charizard (1st Edition)", set: "Base Set", number: "4", rarity: "Rare Holo", price_usd: 9000 },
    low: { tcgplayerId: "101", name: "Charizard (Unlimited)", set: "Base Set", number: "4", rarity: "Rare Holo", price_usd: 1200 },
    cardImagePaths: [],
  });
  // no image hashes available in a unit test -> fails on "canonical card image missing", NOT on axis
  assert.match(good.reason, /canonical card image is missing/);
});

// ================= §13 BRAND LOCK ==========================
test("SC5A-8. detectGeneratedBrandRisk flags a Poke Ball / red-white ball / official mark; the approved magnifier is fine", () => {
  assert.equal(detectGeneratedBrandRisk({ logos_detected: ["a red and white ball-shaped logo top-right"] }).risk, true);
  assert.equal(detectGeneratedBrandRisk({ logos_detected: ["a Poke Ball style icon"] }).risk, true);
  assert.equal(detectGeneratedBrandRisk({ brand_wordmark_text: "Official Pokemon" }).risk, true);
  assert.equal(detectGeneratedBrandRisk({ logos_detected: ["a red magnifying glass icon next to the Pokemon Deal Finder wordmark"] }).risk, false);
  assert.equal(detectGeneratedBrandRisk({ logos_detected: [] }).risk, false);
});

test("SC5A-9. the approved brand asset overlay renders the magnifier + wordmark + domain, never a ball; the prompt clause forbids generated marks", () => {
  const html = compositeBrandAssetHtml({ generatedDataUrl: "data:image/png;base64,QQ==", ctaText: "See the live deal", where: "both" });
  assert.match(html, /viewBox="0 0 150 150"/); // the magnifier svg (circle + handle)
  assert.match(html, /Pokemon<\/span> <span[^>]*>Deal Finder/);
  assert.match(html, /pokemondealfinder\.com/);
  assert.doesNotMatch(html, /pok[eé]\s*ball|red[- ]and[- ]white ball/i);
  assert.match(BRAND_SAFE_ZONE_CLAUSE, /do NOT draw the PokemonDealFinder logo/);
  assert.match(BRAND_SAFE_ZONE_CLAUSE, /Poke Ball/i);
  assert.equal(APPROVED_BRAND.icon, "magnifier");
});

// ================= §8 MATH VERIFICATION ===================
test("SC5A-10. recomputeDerivedFacts catches a wrong direction, a wrong %, a wrong discount", () => {
  const sem = { layout: "deal_hero", comparison_left: { value: 12.93 }, comparison_right: { value: 23 }, comparison_direction: "ABOVE_MARKET", comparison_pct: 20, required_numeric_facts: { listed_price: 12.93, market_price: 23, discount_pct: 60 } };
  const r = recomputeDerivedFacts(sem);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "comparison_direction"));
  assert.ok(r.errors.some((e) => e.field === "discount_pct"));
});

// ================= §19 NEGATIVE TEST PACK =================
// Every extraction here is WRONG in one way - the auditor must FAIL each.
const NEG_MS = () => semFor("market_shape", { tracked_count: 24545, percentages: [85.7, 4.7], card_name: "Clefairy" }, { under_25_pct: 85.7, over_100_pct: 4.7, priced_cards: 24545, featured: { card_name: "Clefairy" } }, "MARKET_SNAPSHOT");
const NEG_AVS_BELOW = () => semFor("asking_vs_sold", { card_name: "Umbreon", total_price_usd: 50, market_price: 199 }, { askingUsd: 50, marketRefUsd: 199 }, "WHY_SOLD_PRICES_MATTER");
const NEG_AVS_ABOVE = () => semFor("asking_vs_sold", { card_name: "Umbreon", total_price_usd: 269, market_price: 200 }, { askingUsd: 269, marketRefUsd: 200 }, "WHY_SOLD_PRICES_MATTER");

const NEGATIVE_PACK = [
  ["wrong scope (population = example card)", NEG_MS, { headline: "85.7% of Clefairy singles sell under $25", claims: [{ subject: "Clefairy singles", value: "85.7%", scope: "Clefairy singles" }], comparisons: [], takeaways: [], all_numbers: ["85.7%"], logos_detected: [] }],
  ["wrong subject (this Clefairy)", NEG_MS, { headline: "85.7% of this Clefairy sells under $25", claims: [{ subject: "this Clefairy", value: "85.7%", scope: "this Clefairy" }], comparisons: [], takeaways: [], all_numbers: ["85.7%"], logos_detected: [] }],
  ["wrong population count scoped to example", NEG_MS, { headline: "Under $25", claims: [], comparisons: [], takeaways: ["Sample: 24,545 Clefairy singles"], all_numbers: ["24,545"], logos_detected: [] }],
  ["wrong direction word (premium, ask below market)", NEG_AVS_BELOW, { headline: "A $50 PREMIUM", comparisons: [{ left: "ASK $50", right: "MARKET $199", stated_relation: "premium", stated_pct: "-75%", arrow_direction: "up" }], takeaways: [], claims: [], all_numbers: ["$50", "$199"], logos_detected: [] }],
  ["wrong arithmetic (says 20% below, true is 75%)", NEG_AVS_BELOW, { headline: "20% below market", comparisons: [{ left: "ASK $50", right: "MARKET $199", stated_relation: "below market", stated_pct: "-20%", arrow_direction: "down" }], takeaways: [], claims: [], all_numbers: ["$50", "$199", "20%"], logos_detected: [] }],
  ["contradictory CTA/lesson (don't pay the ask when ask << market)", NEG_AVS_BELOW, { headline: "$50 vs $199", comparisons: [{ left: "ASK $50", right: "MARKET $199", stated_relation: "below market", stated_pct: "-75%", arrow_direction: "down" }], takeaways: ["Don't pay the ask - you're overpaying."], claims: [], all_numbers: ["$50", "$199"], logos_detected: [] }],
  ["discount word for an above-market ask", NEG_AVS_ABOVE, { headline: "35% DISCOUNT", comparisons: [{ left: "ASK $269", right: "MARKET $200", stated_relation: "discount", stated_pct: "+35%", arrow_direction: "down" }], takeaways: ["A bargain."], claims: [], all_numbers: ["$269", "$200"], logos_detected: [] }],
  ["generated Poke Ball logo", NEG_MS, { headline: "85.7% of tracked singles sell under $25", claims: [{ subject: "tracked singles", value: "85.7%", scope: "24,545 tracked singles" }], comparisons: [], takeaways: [], all_numbers: ["85.7%"], logos_detected: ["a red and white Poke Ball style logo top left"] }],
  ["green colour on an above-market premium", NEG_AVS_ABOVE, { headline: "$269 vs $200", comparisons: [{ left: "ASK $269", right: "MARKET $200", stated_relation: "above market", stated_pct: "+35%", arrow_direction: "up", colour_of_main_number: "green" }], takeaways: [], claims: [], all_numbers: ["$269", "$200"], logos_detected: [] }],
  ["headline direction inversion", NEG_AVS_ABOVE, { headline: "This card is trading well BELOW MARKET", comparisons: [{ left: "ASK $269", right: "MARKET $200", stated_relation: "none", arrow_direction: "none" }], takeaways: [], claims: [], all_numbers: ["$269", "$200"], logos_detected: [] }],
];

test("SC5A-11. §19 NEGATIVE TEST PACK: every wrong post FAILS the semantic auditor", () => {
  let failed = 0;
  for (const [label, semFn, extraction] of NEGATIVE_PACK) {
    const audit = auditSemantics({ extraction, semanticManifest: semFn() });
    assert.equal(audit.ok, false, `NEGATIVE case should FAIL but PASSED: ${label}`);
    assert.ok(FAILURE_STATES.includes(audit.state), `${label}: bad state ${audit.state}`);
    failed += 1;
  }
  assert.equal(failed, NEGATIVE_PACK.length);
});

test("SC5A-12. two-card comparison where the images look identical + a printing axis is claimed -> PRINTING_IDENTITY_FAIL", () => {
  const sem = { ...semFor("printing_compare", { card_name: "Gengar" }, { species: "gengar", high: { set: "SWSH052", price_usd: 2200 }, low: { set: "SWSH Promo", price_usd: 126 }, multiple: 17, relevance: { axis: "promo_vs_set_print" } }, "EXACT_PRINTING_MATTERS") };
  const audit = auditSemantics({ extraction: { two_cards_look_identical: true, headline: "Same Gengar, different printing", takeaways: ["Same card, huge value gap."], claims: [], comparisons: [], all_numbers: ["$126", "$2,200"], logos_detected: [] }, semanticManifest: sem });
  assert.equal(audit.ok, false);
  assert.ok(["PRINTING_IDENTITY_FAIL", "SEMANTIC_CONTRADICTION_FAIL"].includes(audit.state));
});

// ================= §17 CANDIDATE PRIORITISATION (mocked pipeline) ====
const mkFetch = (h) => async (url, opts) => {
  const isForm = opts?.body instanceof FormData;
  const r = h(url, isForm ? {} : JSON.parse(opts?.body ?? "{}"), isForm);
  return { ok: r.status ? r.status < 400 : true, status: r.status ?? 200, async json() { return r.json; }, async text() { return JSON.stringify(r.json ?? {}); } };
};
const chat = (o) => ({ json: { choices: [{ message: { content: JSON.stringify(o) } }] } });
const image = () => ({ json: { data: [{ b64_json: Buffer.from("gen-" + Math.random()).toString("base64") }] } });

test("SC5A-13. runFullGenerativeSocial: a semantically WRONG comparison -> SEMANTIC_CONTRADICTION_FAIL after one bounded regeneration, then HOLD", async () => {
  let n = 0;
  const fetchImpl = mkFetch((url, body, isForm) => {
    if (url.includes("/images/edits") || isForm) return image();
    const text = body?.messages?.[0]?.content?.find?.((c) => c.type === "text")?.text ?? "";
    if (/fidelity_score/.test(text)) return chat({ artwork_materially_changed: false, card_details_altered: false, card_shape_mangled: false, fake_card_variation_introduced: false, fidelity_score: 92, notes: [] });
    if (/Extract, as one JSON object/.test(text)) { n += 1; return chat({ headline: "PREMIUM -75%", comparisons: [{ left: "ASK $50.14", right: "MARKET $199", stated_relation: "premium", stated_pct: "-75%", arrow_direction: "up" }], takeaways: ["Don't pay the ask."], claims: [], all_numbers: ["$50.14", "$199"], logos_detected: [], two_cards_look_identical: false }); }
    if (/REQUIRED TEXT/.test(text)) return chat({ missing_required_text: [], wrong_numbers: [], invented_numbers: [], invented_claims: [], cta_is_ebay_first: false, branding_present: true, typos_or_garbled_text: [], severity: "NONE" });
    return chat({ scores: Object.fromEntries(["scroll_stop", "professional_polish", "premium_feel", "card_is_hero", "story_instantly_clear", "supporting_graphics_useful", "information_rich_not_cluttered", "looks_like_a_real_media_brand", "save_share_likelihood", "click_curiosity", "ai_spam_risk"].map((k) => [k, k === "ai_spam_risk" ? 20 : 85])), verdict: "PASS", notes: [] });
  });
  const r = await runFullGenerativeSocial({
    story: { series: "WHY_SOLD_PRICES_MATTER", facts_json: { card_name: "Clefairy", card_tcgplayer_id: "1", total_price_usd: 50.14, market_price: 199 } },
    platform: "instagram", layout: "asking_vs_sold",
    resolved: { data: { askingUsd: 50.14, marketRefUsd: 199, card: { name: "Clefairy", tcgplayerId: "1" } } },
    cardImagePaths: [CARD_A], env: { OPENAI_API_KEY: "k" }, fetchImpl,
    budget: (() => { const b = newBudget(); b.limits.background_generations = 3; return b; })(),
  });
  assert.equal(r.ok, false);
  assert.ok(["SEMANTIC_CONTRADICTION_FAIL", "SEMANTIC_FACT_FAIL"].includes(r.state));
  assert.equal(r.regenerated, true, "one bounded regeneration must have been attempted");
});

test("SC5A-14. runFullGenerativeSocial: a clean semantic + fact + fidelity post -> BUFFER_READY, brand-composited (finalHtml), no eBay CTA", async () => {
  const fetchImpl = mkFetch((url, body, isForm) => {
    if (url.includes("/images/edits") || isForm) return image();
    const text = body?.messages?.[0]?.content?.find?.((c) => c.type === "text")?.text ?? "";
    if (/fidelity_score/.test(text)) return chat({ artwork_materially_changed: false, card_details_altered: false, card_shape_mangled: false, fake_card_variation_introduced: false, fidelity_score: 95, notes: [] });
    if (/Extract, as one JSON object/.test(text)) return chat({ headline: "45% below recent market", comparisons: [{ left: "DEAL $12.93", right: "MARKET $23", stated_relation: "below market", stated_pct: "-45%", arrow_direction: "down", colour_of_main_number: "green" }], takeaways: ["See the live deal"], claims: [], all_numbers: ["$12.93", "$23", "45%"], logos_detected: ["a magnifying glass icon and the Pokemon Deal Finder wordmark"], brand_wordmark_text: "Pokemon Deal Finder", two_cards_look_identical: false });
    if (/REQUIRED TEXT/.test(text)) return chat({ missing_required_text: [], wrong_numbers: [], invented_numbers: [], invented_claims: [], cta_is_ebay_first: false, branding_present: true, typos_or_garbled_text: [], severity: "NONE" });
    return chat({ scores: Object.fromEntries(["scroll_stop", "professional_polish", "premium_feel", "card_is_hero", "story_instantly_clear", "supporting_graphics_useful", "information_rich_not_cluttered", "looks_like_a_real_media_brand", "save_share_likelihood", "click_curiosity", "ai_spam_risk"].map((k) => [k, k === "ai_spam_risk" ? 15 : 88])), verdict: "PASS", notes: [] });
  });
  const r = await runFullGenerativeSocial({
    story: { series: "DEAL_DROP", facts_json: { card_name: "Gyarados EX", card_set: "XY Promos", card_tcgplayer_id: "1", total_price_usd: 12.93, market_price: 23, discount_pct: 45 } },
    platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 12.93, marketUsd: 23, discountPct: 45, card: { name: "Gyarados EX", set: "XY Promos", tcgplayerId: "1" } } },
    cardImagePaths: [CARD_A], env: { OPENAI_API_KEY: "k" }, fetchImpl,
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.state, "BUFFER_READY");
  assert.ok(r.finalHtml && /viewBox="0 0 150 150"/.test(r.finalHtml)); // approved brand mark overlaid
  assert.equal(r.brand_locked, true);
  assert.equal(r.verification.semantic, "PASS");
  assert.doesNotMatch(r.finalHtml, /view on ebay/i);
});

test("SC5A-15. runFullGenerativeSocial: PRINTING_COMPARE with same-id source -> PRINTING_IDENTITY_FAIL before any generation", async () => {
  let genCalls = 0;
  const fetchImpl = mkFetch((url, _b, isForm) => { if (url.includes("/images/edits") || isForm) genCalls += 1; return isForm ? image() : chat({}); });
  const r = await runFullGenerativeSocial({
    story: { series: "EXACT_PRINTING_MATTERS", facts_json: { card_name: "Charizard", card_set: "Base Set", market_price: 9000 } }, platform: "instagram", layout: "printing_compare",
    // the editorial gate sees a genuine 1st-Ed-vs-Unlimited pair (MEANINGFUL)...
    printingPair: { high: { name: "Charizard (1st Edition)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 9000 }, low: { name: "Charizard (Unlimited)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 1200 } },
    // ...but the RESOLVER rows collapse to the SAME canonical id -> provePrintingPair fails
    resolved: { data: { species: "charizard", high: { tcgplayerId: "9", set: "Base Set", price_usd: 9000 }, low: { tcgplayerId: "9", set: "Base Set", price_usd: 1200 } } },
    cardImagePaths: [CARD_A, CARD_B], env: { OPENAI_API_KEY: "k" }, fetchImpl,
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "PRINTING_IDENTITY_FAIL");
  assert.equal(genCalls, 0, "no image should be generated when the printing identity is not proven");
});

// ================= SCOPE / SAFETY (§22, §23, §24) ==========
test("SC5A-16. the 5A layer keeps FULL_GENERATIVE_SOCIAL primary and does NO publishing / video / caption / Stage-1 / RIGHTS / email / eBay action", () => {
  for (const f of newFiles) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} Buffer`);
    assert.doesNotMatch(src, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} schedule`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} RIGHTS`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com|\/buy\/browse\//i, `${f} eBay Browse`);
    assert.doesNotMatch(src, /verify-deals|verifyDeals/i, `${f} verify`);
    assert.doesNotMatch(src, /videoRender|videoTimeline|storyboard|captionDirector/i, `${f} video/caption`);
  }
  // SOCIAL_IMAGE_MODE selector unchanged (still defaults SAFE_FALLBACK)
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
});

test("SC5A-17. all 5A failure states are declared", () => {
  for (const s of ["SEMANTIC_FACT_FAIL", "CLAIM_SCOPE_FAIL", "SEMANTIC_CONTRADICTION_FAIL", "PRINTING_IDENTITY_FAIL", "CARD_PAIR_FIDELITY_FAIL", "GENERATED_BRAND_RISK"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
});
