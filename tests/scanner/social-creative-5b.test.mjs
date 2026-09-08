// Phase SOCIAL-CREATIVE-5B - fact-locked platform caption director.
// GOOD CAPTION = HOOK + USEFUL CONTEXT + REAL FACT + WHY IT MATTERS +
// WEBSITE-FIRST CTA. Not raw series names, hype, fake urgency, investment
// language, or unsupported claims.
// Pure-logic + source-scan + a mocked chat call. No real OpenAI, no I/O.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FAILURE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  auditCaption, extractCaptionClaims, allowedFactsFor, scoreCaption,
  checkRawSeries, RAW_SERIES_LABELS,
} from "../../lib/newsroom/captions/captionAudit.mjs";
import {
  buildCaptionBrief, buildCaptionPrompt, assembleCaptionText,
  disclosureFor, semanticHash, buildCaptionHandoff, runCaptionDirector,
  CAPTION_DIRECTOR_VERSION,
} from "../../lib/newsroom/captions/captionDirector.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");
const CAPTION_FILES = ["captionDirector.mjs", "captionAudit.mjs", "index.mjs"].map((f) => `lib/newsroom/captions/${f}`);

// ---- shared fixtures -------------------------------------
const SEM_ASK = Object.freeze({
  layout: "asking_vs_sold", classification: "EDITORIAL",
  story_premise: "an asking price and the real market value can differ",
  required_takeaway: "an asking price can also sit well below market - compare before you judge",
  appropriate_lesson: "an asking price can also sit well below market - compare before you judge",
  prohibited_takeaways: ["calling a below-market ask a 'premium'", "advice implying the ask is too high when ask < market"],
  comparison_left: { label: "asking price", value: 50.14, text: "$50.14" },
  comparison_right: { label: "market reference", value: 199, text: "$199" },
  comparison_direction: "BELOW_MARKET", comparison_pct: 75,
  card_identity: { name: "Clefairy" }, fact_lock_hash: "abc123",
  card_metadata_lock: { _displayable: ["name", "set"], name: "Clefairy", set: "Base Set (Shadowless)" },
  source_attribution_manifest: { allowed_statements: ["market reference"] },
  timeframe_manifest: { allowed_timeframes: [] },
});
const SEM_MKT = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL",
  story_premise: "a distribution statistic about the WHOLE tracked-single population",
  required_takeaway: "the stat applies to the tracked population, not to the example card",
  prohibited_takeaways: ["the stat scoped to the example card / species"],
  claim_scope: "ALL_TRACKED_SINGLES", claim_value: 85.7, claim_metric: "share selling under $25",
  claim_population: "24,545 tracked singles",
  example_card: "Clefairy", example_card_is_not_population: true,
  forbidden_scope_phrases: ["85.7% of clefairy singles", "24,545 clefairy singles", "of clefairy singles"],
  visualization_data_manifest: { allowed_points: [{ label: "Under $25", value: 85.7 }, { label: "$25\u2013$100", value: 9.6 }, { label: "$100+", value: 4.7 }], source_population: 24545 },
  card_metadata_lock: { _displayable: ["name"], name: "Clefairy" },
  source_attribution_manifest: { allowed_statements: [] },
  timeframe_manifest: { allowed_timeframes: [] },
});
const GOOD_ASK = {
  hook: "This Clefairy is listed 75% below its market reference",
  body: "The asking price is $50.14. The market reference is $199. That gap is real - it is not a marked-up 'was' price, it is what the card actually sells for.",
  why_it_matters: "An asking price can sit well below market value. It is worth comparing every listing to a real reference before you judge it.",
  cta: "pokemondealfinder.com", hashtags: ["#PokemonTCG", "#PokemonCards"],
};
const auditAsk = (parts, over = {}) => auditCaption({ parts, family: "asking_vs_sold", platform: "instagram", semanticManifest: SEM_ASK, ...over });

// ================= DETERMINISTIC GATES ===================
test("SC5B-1. a raw series / enum caption hard-fails as RAW_SERIES_CAPTION_FAIL (\u00a712/\u00a726)", () => {
  for (const label of ["EXACT PRINTING MATTERS", "MARKET_SNAPSHOT", "Deal Drop", "WHY SOLD PRICES MATTER"]) {
    const r = auditCaption({ parts: { hook: label, body: "x", cta: "See it" }, family: "printing_compare", platform: "x", semanticManifest: { layout: "printing_compare" } });
    assert.equal(r.ok, false, label);
    assert.equal(r.state, "RAW_SERIES_CAPTION_FAIL", label);
  }
  // a normal human hook that merely contains a topical word is fine
  assert.equal(checkRawSeries({ hook: "The printing on this card is why it costs more", body: "", cta: "" }).length, 0);
});

test("SC5B-2. a price NOT in the source of truth -> CAPTION_FACT_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, body: "Listed at $12.99 versus a $199 market reference." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_FACT_FAIL");
});

test("SC5B-3. a percentage NOT in the source of truth -> CAPTION_FACT_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, hook: "This Clefairy is 40% below its market reference" });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_FACT_FAIL");
});

test("SC5B-4. a wrong population figure -> CAPTION_FACT_FAIL", () => {
  const r = auditCaption({
    parts: { hook: "85.7% of tracked singles sell under $25", body: "Based on 30,000 tracked singles. Most of the market is inexpensive.", why_it_matters: "It shows where the liquidity is.", cta: "pokemondealfinder.com", hashtags: [] },
    family: "market_shape", platform: "instagram", semanticManifest: SEM_MKT,
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_FACT_FAIL");
});

test("SC5B-5. a population stat scoped to the example card -> CAPTION_SCOPE_FAIL", () => {
  const r = auditCaption({
    parts: { hook: "85.7% of Clefairy singles sell under $25", body: "That is a lot of cheap Clefairy singles.", why_it_matters: "Scope matters.", cta: "pokemondealfinder.com", hashtags: [] },
    family: "market_shape", platform: "instagram", semanticManifest: SEM_MKT,
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_SCOPE_FAIL");
});

test("SC5B-6. a wrong comparison direction word -> CAPTION_SEMANTIC_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, hook: "A premium Clefairy listing at $50.14", body: "Priced at a premium over the $199 reference." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_SEMANTIC_FAIL");
});

test("SC5B-7. an unsupported timeframe -> UNSUPPORTED_TIMEFRAME_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, body: "Over the last 30 days this Clefairy has been listed at $50.14 versus $199." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "UNSUPPORTED_TIMEFRAME_FAIL");
});

test("SC5B-8. an unsupported data source -> UNSUPPORTED_SOURCE_CLAIM_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, body: "Per eBay sold listings, the market reference is $199 and this is listed at $50.14." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "UNSUPPORTED_SOURCE_CLAIM_FAIL");
});

test("SC5B-9. fake urgency -> FAKE_URGENCY_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, why_it_matters: "Hurry - deals like this one sell fast, don't miss out." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "FAKE_URGENCY_FAIL");
});

test("SC5B-10. unsupported scarcity -> UNSUPPORTED_SCARCITY_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, why_it_matters: "A Clefairy at this price is impossible to find - there are very few left." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "UNSUPPORTED_SCARCITY_FAIL");
});

test("SC5B-11. investment language -> INVESTMENT_LANGUAGE_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, why_it_matters: "This is an undervalued investment - buy before it rises, easy profit." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "INVESTMENT_LANGUAGE_FAIL");
});

test("SC5B-12. an eBay-first CTA -> EBAY_FIRST_CAPTION_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, cta: "View on eBay" });
  assert.equal(r.ok, false);
  assert.equal(r.state, "EBAY_FIRST_CAPTION_FAIL");
});

test("SC5B-13. a clean website-first caption PASSES", () => {
  const r = auditAsk(GOOD_ASK);
  assert.equal(r.ok, true, JSON.stringify(r.findings));
  assert.equal(r.verification.cta, "PASS");
  assert.equal(r.verification.direction, "PASS");
  assert.ok(r.quality.score >= 70);
});

test("SC5B-14. Instagram platform fit: a too-short caption HOLDs, a full one PASSES", () => {
  const tiny = scoreCaption({ hook: "Clefairy", body: "cheap", cta: "site", platform: "instagram", captionText: "Clefairy\n\ncheap\n\nsite" });
  assert.equal(tiny.verdict, "HOLD");
  const full = scoreCaption({ hook: GOOD_ASK.hook, body: GOOD_ASK.body, whyItMatters: GOOD_ASK.why_it_matters, cta: GOOD_ASK.cta, hashtags: GOOD_ASK.hashtags, platform: "instagram", captionText: [GOOD_ASK.hook, GOOD_ASK.body, GOOD_ASK.why_it_matters, GOOD_ASK.cta].join("\n\n") });
  assert.equal(full.verdict, "PASS");
});

test("SC5B-15. X platform fit: an Instagram-length caption on X HOLDs on platform_fit", () => {
  const longText = `${GOOD_ASK.hook}\n\n${GOOD_ASK.body}\n\n${GOOD_ASK.why_it_matters}\n\n${GOOD_ASK.cta}`.repeat(2);
  const s = scoreCaption({ hook: GOOD_ASK.hook, body: GOOD_ASK.body + " " + GOOD_ASK.why_it_matters, cta: GOOD_ASK.cta, platform: "x", captionText: longText });
  assert.equal(s.dims.platform_fit <= 8, true);
  // a tight X caption fits
  const tight = scoreCaption({ hook: "Asking $50.14. Market reference $199.", body: "A 75% gap - and it is a real reference, not a 'was' price.", cta: "pokemondealfinder.com", platform: "x", captionText: "Asking $50.14. Market reference $199.\n\nA 75% gap - and it is a real reference, not a 'was' price.\n\npokemondealfinder.com" });
  assert.equal(tight.dims.platform_fit, 15);
});

test("SC5B-16. an image/caption contradiction -> IMAGE_CAPTION_CONTRADICTION_FAIL", () => {
  const r = auditAsk({ ...GOOD_ASK, hook: "This Clefairy is listed 75% above market", body: "Asking $50.14 vs a $199 reference." });
  assert.equal(r.ok, false);
  assert.equal(r.state, "IMAGE_CAPTION_CONTRADICTION_FAIL");
  // population bound to the example species
  const r2 = auditCaption({
    parts: { hook: "A snapshot of 24,545 Clefairy singles", body: "85.7% sell under $25.", why_it_matters: "scope.", cta: "pokemondealfinder.com", hashtags: [] },
    family: "market_shape", platform: "instagram", semanticManifest: SEM_MKT,
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.state, "IMAGE_CAPTION_CONTRADICTION_FAIL");
});

// ================= BOUNDED GENERATION FLOW ==============
function bundleFor({ igOk = true, xOk = true } = {}) {
  const ig = igOk ? GOOD_ASK : { ...GOOD_ASK, hook: "A premium Clefairy at a premium price" };
  const x = xOk
    ? { hook: "Asking $50.14. Market reference $199.", body: "That is a 75% gap below a real reference - not a 'was' price.", why_it_matters: "Compare before you judge a listing.", cta: "pokemondealfinder.com", hashtags: [] }
    : { hook: "EXACT PRINTING MATTERS", body: "x", why_it_matters: "y", cta: "See it", hashtags: [] };
  return { instagram: ig, x, hooks_considered: ["a", "b", "c"] };
}
function mockFetch(sequence) {
  let i = 0;
  return async () => {
    const bundle = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(bundle) } }] }) };
  };
}
const RUN = (fetchImpl, over = {}) => runCaptionDirector({
  story: { story_id: "s1", series: "WHY_SOLD_PRICES_MATTER" },
  semanticManifest: SEM_ASK, factTrace: [], family: "asking_vs_sold",
  imageArtifactId: "img-1", budget: { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] },
  env: { OPENAI_API_KEY: "test" }, fetchImpl, ...over,
});

test("SC5B-17. candidate 1 clean -> used, no second call", async () => {
  const seq = [bundleFor({ igOk: true, xOk: true })];
  const budget = { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] };
  const r = await runCaptionDirector({ story: { story_id: "s1", series: "WHY_SOLD_PRICES_MATTER" }, semanticManifest: SEM_ASK, family: "asking_vs_sold", imageArtifactId: "img-1", budget, env: { OPENAI_API_KEY: "t" }, fetchImpl: mockFetch(seq) });
  assert.equal(r.ok, true);
  assert.equal(r.instagram.status, "READY");
  assert.equal(r.x.status, "READY");
  assert.equal(r.instagram.verification.candidate, 1);
  assert.equal(budget.used.creative_director_calls, 1);
});

test("SC5B-18. candidate 1 X fails -> ONE bounded retry fixes it", async () => {
  const seq = [bundleFor({ igOk: true, xOk: false }), bundleFor({ igOk: true, xOk: true })];
  const budget = { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] };
  const r = await runCaptionDirector({ story: { story_id: "s1", series: "WHY_SOLD_PRICES_MATTER" }, semanticManifest: SEM_ASK, family: "asking_vs_sold", imageArtifactId: "img-1", budget, env: { OPENAI_API_KEY: "t" }, fetchImpl: mockFetch(seq) });
  assert.equal(r.x.status, "READY");
  assert.equal(r.x.verification.candidate, 2);
  assert.equal(r.x.verification.regenerated, true);
  assert.equal(budget.used.creative_director_calls, 2);
});

test("SC5B-19. both candidates fail a platform -> that platform HOLDs, NO raw-name fallback", async () => {
  const seq = [bundleFor({ igOk: true, xOk: false }), bundleFor({ igOk: true, xOk: false })];
  const budget = { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] };
  const r = await runCaptionDirector({ story: { story_id: "s1", series: "WHY_SOLD_PRICES_MATTER" }, semanticManifest: SEM_ASK, family: "asking_vs_sold", imageArtifactId: "img-1", budget, env: { OPENAI_API_KEY: "t" }, fetchImpl: mockFetch(seq) });
  assert.equal(r.x.status, "RAW_SERIES_CAPTION_FAIL");
  assert.equal(r.x.caption_text, null);
  assert.notEqual(r.x.hook, "EXACT_PRINTING_MATTERS");
  // IG still fine -> overall ok
  assert.equal(r.instagram.status, "READY");
  assert.equal(r.ok, true);
});

test("SC5B-20. no key -> CAPTION_GENERATION_HOLD, never a raw family name", async () => {
  const r = await runCaptionDirector({ story: { story_id: "s1", series: "WHY_SOLD_PRICES_MATTER" }, semanticManifest: SEM_ASK, family: "asking_vs_sold", env: {}, fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_GENERATION_HOLD");
  assert.equal(r.instagram.status, "CAPTION_GENERATION_HOLD");
  assert.equal(r.instagram.caption_text, null);
  assert.doesNotMatch(String(r.instagram.hook ?? ""), /ASKING_VS_SOLD|WHY_SOLD/);
});

test("SC5B-21. caption_handoff persistence shape (\u00a728)", async () => {
  const seq = [bundleFor({ igOk: true, xOk: true })];
  const r = await runCaptionDirector({ story: { story_id: "story-42", series: "WHY_SOLD_PRICES_MATTER" }, semanticManifest: SEM_ASK, family: "asking_vs_sold", imageArtifactId: "img-42", budget: { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] }, env: { OPENAI_API_KEY: "t" }, fetchImpl: mockFetch(seq) });
  assert.equal(r.caption_handoff.length, 2);
  const h = r.caption_handoff[0];
  for (const k of ["story_id", "image_artifact_id", "platform", "caption_text", "hook", "cta", "hashtags", "disclosure", "fact_refs", "semantic_hash", "verification", "quality_score"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(h, k), `handoff missing ${k}`);
  }
  assert.equal(h.story_id, "story-42");
  assert.equal(h.image_artifact_id, "img-42");
  assert.equal(h.semantic_hash, semanticHash(SEM_ASK));
});

test("SC5B-22. disclosure: COMMERCIAL gets the approved line, EDITORIAL does not; X uses the short form", () => {
  assert.equal(disclosureFor({ classification: "EDITORIAL", platform: "instagram" }), null);
  assert.match(disclosureFor({ classification: "COMMERCIAL", platform: "instagram" }), /eBay Partner Network/);
  assert.match(disclosureFor({ classification: "COMMERCIAL", platform: "x" }), /^Ad \u00b7/);
  // the disclosure is the LAST block, not the dominant one (\u00a719)
  const text = assembleCaptionText({ parts: GOOD_ASK, platform: "instagram", disclosure: disclosureFor({ classification: "COMMERCIAL", platform: "instagram" }) });
  assert.ok(text.endsWith(disclosureFor({ classification: "COMMERCIAL", platform: "instagram" })));
});

test("SC5B-23. the writer prompt is fact-locked and website-first", () => {
  const brief = buildCaptionBrief({ story: { story_id: "s", series: "WHY_SOLD_PRICES_MATTER" }, semanticManifest: SEM_ASK, family: "asking_vs_sold" });
  const p = buildCaptionPrompt({ brief });
  assert.match(p, /MUST NOT invent/);
  assert.match(p, /Use ONLY the facts explicitly supplied/);
  assert.match(p, /NEVER "View on eBay"/);
  assert.match(p, /\$50\.14/);
  assert.match(p, /below market/);
  assert.match(p, /resemble, a raw label/);
  // no timeframe supplied for this story -> the prompt locks it out
  assert.match(p, /Do NOT state any timeframe/);
  // a story with NO supplied source phrasing locks the source out too
  const pMkt = buildCaptionPrompt({ brief: buildCaptionBrief({ story: { series: "MARKET_SNAPSHOT" }, semanticManifest: SEM_MKT, family: "market_shape" }) });
  assert.match(pMkt, /Do NOT name any data source/);
  assert.match(pMkt, /85\.7% of tracked singles|WHOLE tracked-single population/);
});

test("SC5B-24. allowedFactsFor pulls prices / % / population from the manifest", () => {
  const a = allowedFactsFor({ semanticManifest: SEM_MKT, factTrace: [] });
  assert.ok(a.percentages.includes(85.7) && a.percentages.includes(9.6) && a.percentages.includes(4.7));
  assert.ok(a.counts.includes(24545));
  const b = allowedFactsFor({ semanticManifest: SEM_ASK, factTrace: [] });
  assert.ok(b.prices.includes(50.14) && b.prices.includes(199));
  assert.ok(b.percentages.includes(75));
});

test("SC5B-25. all 5B failure states declared; NO publishing / cron / RIGHTS / email / eBay-Browse / Stage-1 work", () => {
  for (const s of ["RAW_SERIES_CAPTION_FAIL", "CAPTION_FACT_FAIL", "CAPTION_SCOPE_FAIL", "CAPTION_SEMANTIC_FAIL", "IMAGE_CAPTION_CONTRADICTION_FAIL", "INVESTMENT_LANGUAGE_FAIL", "FAKE_URGENCY_FAIL", "UNSUPPORTED_SCARCITY_FAIL", "EBAY_FIRST_CAPTION_FAIL", "CAPTION_GENERATION_HOLD", "CAPTION_QUALITY_HOLD"]) {
    assert.ok(FAILURE_STATES.includes(s), `missing ${s}`);
  }
  for (const f of CAPTION_FILES) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne|bufferBacklog|BUFFER_ACCESS_TOKEN/i, `${f} Buffer`);
    assert.doesNotMatch(src, /CronCreate|vercel\.json|REFILL_SCHEDULE|cron/i, `${f} cron`);
    assert.doesNotMatch(src, /RIGHTS_STATE|SOCIAL_.*_ENABLED|Stage\s*1/i, `${f} RIGHTS/Stage1`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /getBrowse|browseApi|api\.ebay\.com|BrowseRateLimit/i, `${f} eBay Browse`);
    assert.doesNotMatch(src, /videoRender|storyboard|renderToPng/i, `${f} video/render`);
  }
  // the image mode selector is untouched (still SAFE_FALLBACK default)
  assert.match(read("lib/newsroom/hybrid/imageMode.mjs"), /return "SAFE_FALLBACK"/);
  assert.equal(CAPTION_DIRECTOR_VERSION, "5b.1");
});

test("SC5B-26. every declared raw-series label is caught", () => {
  for (const lbl of RAW_SERIES_LABELS) {
    const asWords = lbl.replace(/_/g, " ");
    assert.equal(checkRawSeries({ hook: asWords, body: "", cta: "" }).length >= 1, true, lbl);
  }
});
