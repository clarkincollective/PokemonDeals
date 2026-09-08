// Phase SOCIAL-CREATIVE-4B - hybrid AI image pipeline: creative director,
// FACT_LOCK enforcement after the AI call, data-free background prompt +
// generation + safety scan, canonical-art protection, compositor + output
// modes, contextual enrichment, bounded iteration, cost. Pure-logic +
// source-scan + MOCKED OpenAI. No real network, no DB, no Chrome.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildFactLock } from "../../lib/newsroom/editorial/factLock.mjs";
import { contractFor } from "../../lib/newsroom/editorial/storyContracts.mjs";
import { buildCreativeBrief } from "../../lib/newsroom/editorial/creativeBrief.mjs";
import {
  runCreativeDirector, deterministicDirection, DIRECTOR_FIELDS, directorAvailable,
} from "../../lib/newsroom/hybrid/creativeDirector.mjs";
import {
  buildBackgroundPrompt, scanBackground, SAFETY_FLAGS, generateBackground,
} from "../../lib/newsroom/hybrid/aiBackground.mjs";
import {
  OUTPUT_MODES, chooseOutputMode, buildCompositeSpec, assertCanonicalArtUntouched, validateBranding,
} from "../../lib/newsroom/hybrid/compositor.mjs";
import {
  planEnrichments, assertEnrichmentsBacked, ENRICHMENT_KINDS,
} from "../../lib/newsroom/hybrid/enrichment.mjs";
import {
  BUDGET_LIMITS, newBudget, canSpend, recordCall, costReport,
} from "../../lib/newsroom/hybrid/budget.mjs";
import {
  VISUAL_CONTRACTS, VISUAL_CONTRACT_LAYOUTS, checkVisualContract,
} from "../../lib/newsroom/hybrid/visualContracts.mjs";
import { runHybridPipeline, hybridEnabled, HYBRID_PIPELINE_VERSION } from "../../lib/newsroom/hybrid/pipeline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

const HYBRID_DIR = "lib/newsroom/hybrid";
const hybridFiles = readdirSync(join(REPO, HYBRID_DIR)).filter((f) => f.endsWith(".mjs")).map((f) => `${HYBRID_DIR}/${f}`);

// ---- a mock OpenAI fetch ------------------------------------------
function mockFetch(handler) {
  return async (url, opts) => {
    const body = JSON.parse(opts?.body ?? "{}");
    const r = handler(url, body);
    return {
      ok: r.status ? r.status < 400 : true,
      status: r.status ?? 200,
      async json() { return r.json; },
      async text() { return JSON.stringify(r.json ?? {}); },
    };
  };
}
const chatJSON = (obj) => ({ json: { choices: [{ message: { content: JSON.stringify(obj) } }] } });
const imageJSON = () => ({ json: { data: [{ b64_json: Buffer.from("fake-png-bytes").toString("base64") }] } });

const DEAL_SOURCE = {
  series: "DEAL_DROP",
  facts_json: {
    card_name: "Charizard ex", card_set: "Obsidian Flames", card_tcgplayer_id: "517236",
    total_price_usd: 180.5, market_price: 300, discount_pct: 0.42,
  },
};
const lockOf = (s) => buildFactLock(s);
const briefOf = (s) => buildCreativeBrief({ story: s, platform: "instagram", factLock: lockOf(s), contract: contractFor(s.series) });

// ================= CREATIVE DIRECTOR + FACT LOCK (§2, §3) ======
test("C4B-1. director fields cover §2; with no key it returns a deterministic direction (not a failure)", async () => {
  assert.ok(DIRECTOR_FIELDS.includes("layout_intent") && DIRECTOR_FIELDS.includes("collector_takeaway") && DIRECTOR_FIELDS.includes("why_this_works"));
  const r = await runCreativeDirector({ factLock: lockOf(DEAL_SOURCE), brief: briefOf(DEAL_SOURCE), contract: contractFor("DEAL_DROP"), env: {}, budget: newBudget() });
  assert.equal(r.ok, true);
  assert.equal(r.source, "deterministic");
  assert.ok(r.direction.layout_intent && Array.isArray(r.direction.hierarchy));
});

test("C4B-2. FACT_LOCK is enforced AFTER the AI director - a changed price -> AI_FACT_MUTATION", async () => {
  const fetchImpl = mockFetch(() => chatJSON({
    direction: Object.fromEntries(DIRECTOR_FIELDS.map((f) => [f, f === "visual_density" ? "low" : f === "hierarchy" ? ["card", "saving"] : `x`])),
    facts_echo: { card_name: "Charizard ex", listed_price: 99.0, market_price: 300 }, // listed_price mutated
    critique: { verdict: "PROCEED" },
  }));
  const r = await runCreativeDirector({ factLock: lockOf(DEAL_SOURCE), brief: briefOf(DEAL_SOURCE), contract: contractFor("DEAL_DROP"), env: { OPENAI_API_KEY: "k" }, fetchImpl, budget: newBudget() });
  assert.equal(r.ok, false);
  assert.equal(r.state, "AI_FACT_MUTATION");
  assert.ok(r.mutations.some((m) => m.field === "listed_price"));
});

test("C4B-3. a faithful director response passes; a self-REJECT critique -> CREATIVE_BRIEF_REJECT", async () => {
  const okFetch = mockFetch(() => chatJSON({
    direction: Object.fromEntries(DIRECTOR_FIELDS.map((f) => [f, f === "visual_density" ? "low" : f === "accent_strategy" ? "single_red" : f === "hierarchy" ? ["card", "saving"] : "x"])),
    facts_echo: { card_name: "Charizard ex", listed_price: 180.5, market_price: 300, discount_pct: 42 },
    critique: { verdict: "PROCEED", story_clear: true },
  }));
  const ok = await runCreativeDirector({ factLock: lockOf(DEAL_SOURCE), brief: briefOf(DEAL_SOURCE), contract: contractFor("DEAL_DROP"), env: { OPENAI_API_KEY: "k" }, fetchImpl: okFetch, budget: newBudget() });
  assert.equal(ok.ok, true);
  assert.equal(ok.source, "openai");

  const rejFetch = mockFetch(() => chatJSON({
    direction: Object.fromEntries(DIRECTOR_FIELDS.map((f) => [f, "x"])),
    facts_echo: { card_name: "Charizard ex", listed_price: 180.5, market_price: 300 },
    critique: { verdict: "REJECT", revise_hint: "premise too thin" },
  }));
  const rej = await runCreativeDirector({ factLock: lockOf(DEAL_SOURCE), brief: briefOf(DEAL_SOURCE), contract: contractFor("DEAL_DROP"), env: { OPENAI_API_KEY: "k" }, fetchImpl: rejFetch, budget: newBudget() });
  assert.equal(rej.ok, false);
  assert.equal(rej.state, "CREATIVE_BRIEF_REJECT");
});

// ================= BACKGROUND PROMPT / GEN / SCAN (§6, §7, §8) =
test("C4B-4. background prompt is DATA-FREE by construction and rejects any live-data key", () => {
  const spec = buildBackgroundPrompt({ layout: "deal_hero", densityHint: "low", cardPaletteHint: "warm", storyCategory: "DEAL_DROP" });
  assert.match(spec.prompt, /BACKGROUND/);
  assert.doesNotMatch(spec.prompt, /\$\s?\d|charizard|obsidian|517236|market_price/i);
  assert.ok(spec.safe_zones && Object.keys(spec.safe_zones).length >= 3);
  assert.throws(() => buildBackgroundPrompt({ layout: "deal_hero", card_name: "Charizard" }), /data-free by construction/);
  assert.throws(() => buildBackgroundPrompt({ price: 180 }), /unexpected key/);
});

test("C4B-5. background prompt forbids cards, text and logos", () => {
  const spec = buildBackgroundPrompt({ layout: "market_shape" });
  assert.match(spec.prompt, /DO NOT DRAW A TRADING CARD/);
  assert.match(spec.prompt, /NO TEXT of any kind/);
  assert.match(spec.prompt, /MUST NOT contain/);
});

test("C4B-6. scanBackground: a flagged image -> AI_BACKGROUND_REJECT; no key -> not used (never unscanned)", async () => {
  const flagFetch = mockFetch(() => chatJSON({ flags: Object.fromEntries(SAFETY_FLAGS.map((f) => [f, f === "readable_generated_text"])), notes: ["has a word"] }));
  const bad = await scanBackground({ b64: "AAAA", env: { OPENAI_API_KEY: "k" }, fetchImpl: flagFetch, budget: newBudget() });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "AI_BACKGROUND_REJECT");
  assert.ok(bad.flags.includes("readable_generated_text"));

  const noKey = await scanBackground({ b64: "AAAA", env: {}, budget: newBudget() });
  assert.equal(noKey.ok, false);
  assert.equal(noKey.state, "AI_BACKGROUND_REJECT");

  const clean = await scanBackground({ b64: "AAAA", env: { OPENAI_API_KEY: "k" }, fetchImpl: mockFetch(() => chatJSON({ flags: {}, notes: [] })), budget: newBudget() });
  assert.equal(clean.ok, true);
});

test("C4B-7. generateBackground with no key does not fabricate an image", async () => {
  const r = await generateBackground({ spec: buildBackgroundPrompt({ layout: "deal_hero" }), env: {}, budget: newBudget() });
  assert.equal(r.ok, false);
  assert.equal(r.availability, "no_key");
});

// ================= CANONICAL ART + COMPOSITOR (§9, §10, §11, §12) =
test("C4B-8. canonical art guard: data: URL rejected, file:// ok, unknown host rejected", () => {
  assert.equal(assertCanonicalArtUntouched({ 1: "file:///c/art/1.jpg" }).ok, true);
  assert.equal(assertCanonicalArtUntouched({ 1: "data:image/png;base64,AAA" }).ok, false);
  assert.equal(assertCanonicalArtUntouched({ 1: "https://evil.example/x.png" }).ok, false);
  assert.equal(assertCanonicalArtUntouched({ 1: "https://cdn.ok/x.png" }, { allowHosts: ["cdn.ok"] }).ok, true);
});

test("C4B-9. output modes + chooseOutputMode: OFF -> DETERMINISTIC_ONLY; enabled + bg + composed direction -> AI_DIRECTED", () => {
  assert.deepEqual([...OUTPUT_MODES], ["DETERMINISTIC_ONLY", "HYBRID_BACKGROUND", "AI_DIRECTED_COMPOSITION"]);
  assert.equal(chooseOutputMode({ enabled: false }), "DETERMINISTIC_ONLY");
  assert.equal(chooseOutputMode({ enabled: true, backgroundOk: false, direction: { source: "openai" } }), "DETERMINISTIC_ONLY");
  assert.equal(chooseOutputMode({ enabled: true, backgroundOk: true, direction: { source: "openai", layout_intent: "asymmetric split rail" } }), "AI_DIRECTED_COMPOSITION");
  assert.equal(chooseOutputMode({ enabled: true, backgroundOk: true, direction: { source: "openai", layout_intent: "centered stack" } }), "AI_DIRECTED_COMPOSITION");
  assert.equal(chooseOutputMode({ enabled: true, backgroundOk: true, direction: { source: "openai", layout_intent: "plain" } }), "HYBRID_BACKGROUND");
});

test("C4B-10. buildCompositeSpec: non-sanctioned fact source rejected; branding > 5% rejected; clean spec ok", () => {
  const good = buildCompositeSpec({
    mode: "HYBRID_BACKGROUND", layout: "deal_hero", target: "ig_45",
    cardArt: { 1: "file:///c/art/1.jpg" }, backgroundDataUrl: "data:image/png;base64,AAAA", backgroundSha: "abc",
    deterministicProps: { price: 1 }, factOverlaySources: ["fact_lock", "resolver:resolveDealHeroSamples"],
    brandBox: { w: 240, h: 60 },
  });
  assert.equal(good.ok, true);
  assert.equal(good.mode, "HYBRID_BACKGROUND");
  assert.ok(good.layers.background && good.layers.background.data_url);

  const badSrc = buildCompositeSpec({ mode: "HYBRID_BACKGROUND", layout: "deal_hero", target: "ig_45", cardArt: { 1: "file:///c/1.jpg" }, deterministicProps: {}, factOverlaySources: ["fact_lock", "ai_creative_director"] });
  assert.equal(badSrc.state, "QA_FAIL");

  const bigBrand = buildCompositeSpec({ mode: "HYBRID_BACKGROUND", layout: "deal_hero", target: "ig_45", cardArt: { 1: "file:///c/1.jpg" }, deterministicProps: {}, factOverlaySources: ["fact_lock"], brandBox: { w: 600, h: 400 } });
  assert.equal(bigBrand.state, "QA_FAIL");

  const noBg = buildCompositeSpec({ mode: "HYBRID_BACKGROUND", layout: "deal_hero", target: "ig_45", cardArt: { 1: "file:///c/1.jpg" }, deterministicProps: {}, factOverlaySources: ["fact_lock"] });
  assert.equal(noBg.mode, "DETERMINISTIC_ONLY");
});

test("C4B-11. validateBranding enforces the <=5% dominance ceiling", () => {
  assert.equal(validateBranding({ brandBox: { w: 240, h: 56 } }).ok, true);
  assert.equal(validateBranding({ brandBox: { w: 240, h: 56 }, coversCardArt: true }).ok, false);
  assert.equal(validateBranding({ brandBox: { w: 400, h: 300 } }).ok, false);
});

// ================= ENRICHMENT (§5) ============================
test("C4B-12. enrichments come ONLY from real data; a sourceless enrichment throws", () => {
  const lock = buildFactLock({ facts_json: { total_price_usd: 180, market_price: 300, discount_pct: 0.4, card_set: "Obsidian Flames" } });
  const plan = planEnrichments({ factLock: lock, contract: contractFor("DEAL_DROP"), resolved: null, layout: "deal_hero" });
  assert.ok(plan.enrichments.length >= 1 && plan.enrichments.length <= 4);
  for (const e of plan.enrichments) {
    assert.ok(ENRICHMENT_KINDS.includes(e.kind));
    assert.ok(e.source && e.value != null);
  }
  assert.ok(plan.enrichments.some((e) => e.kind === "price_gap_bar"));
  assertEnrichmentsBacked(plan.enrichments);
  assert.throws(() => assertEnrichmentsBacked([{ kind: "price_gap_bar", value: 1 }]), /decorative fake stats/);
  // no data -> no enrichments (never invents)
  const empty = planEnrichments({ factLock: buildFactLock({ facts_json: {} }), contract: contractFor("METHODOLOGY") });
  assert.equal(empty.enrichments.length, 0);
});

// ================= BOUNDED ITERATION + COST (§22, §29) ========
test("C4B-13. budget limits are 1 director / 1 background / 1 revision; canSpend stops at the cap", () => {
  assert.equal(BUDGET_LIMITS.creative_director_calls, 1);
  assert.equal(BUDGET_LIMITS.background_generations, 1);
  assert.equal(BUDGET_LIMITS.revisions, 1);
  const b = newBudget();
  assert.equal(canSpend(b, "background_generation"), true);
  recordCall(b, "background_generation", { ok: true });
  assert.equal(canSpend(b, "background_generation"), false);
});

test("C4B-14. costReport aggregates calls + estimates cost per 10 posts", () => {
  const budgets = [];
  for (let i = 0; i < 3; i++) {
    const b = newBudget();
    recordCall(b, "creative_director_call", { ok: true });
    recordCall(b, "background_generation", { ok: true });
    recordCall(b, "visual_review_call", { ok: true });
    budgets.push(b);
  }
  const rep = costReport(budgets);
  assert.equal(rep.artifacts, 3);
  assert.equal(rep.creative_director_calls, 3);
  assert.equal(rep.background_generations, 3);
  assert.ok(rep.total_cost_usd > 0);
  assert.ok(rep.estimated_cost_per_10_posts_usd > 0);
});

// ================= VISUAL CONTRACTS (§14-§19) =================
test("C4B-15. the 5 key visual families exist; checkVisualContract catches a missing must-show / wrong card count", () => {
  assert.deepEqual([...VISUAL_CONTRACT_LAYOUTS].sort(), ["asking_vs_sold", "deal_hero", "market_shape", "printing_compare", "three_up"]);
  for (const l of VISUAL_CONTRACT_LAYOUTS) {
    assert.ok(VISUAL_CONTRACTS[l].must_show.length >= 3);
    assert.ok(VISUAL_CONTRACTS[l].avoid.length >= 2);
  }
  const bad = checkVisualContract("three_up", { shows: ["headline"], cardCount: 2, hasCta: true });
  assert.equal(bad.ok, false);
  assert.ok(bad.warnings.some((w) => /exactly 3/.test(w)));
  const pc = checkVisualContract("printing_compare", { shows: ["two real cards", "the distinguishing feature labelled", "why the difference matters", "real value difference"], cardCount: 2, relevanceMeaningful: false });
  assert.ok(pc.warnings.some((w) => /MEANINGFUL/.test(w)));
});

// ================= FULL PIPELINE (mocked OpenAI) =============
test("C4B-16. runHybridPipeline: a publishable deal story -> ok, a mode, a direction, enrichments, a composite spec", async () => {
  const fetchImpl = mockFetch((url) => {
    if (url.includes("/images/")) return imageJSON();
    if (url.includes("/chat/") ) {
      // director call vs safety scan: distinguish by presence of "flags" ask
      return chatJSON({
        direction: Object.fromEntries(DIRECTOR_FIELDS.map((f) => [f, f === "visual_density" ? "low" : f === "accent_strategy" ? "positive_green_if_real_saving" : f === "hierarchy" ? ["card", "saving", "market ref"] : "x"])),
        facts_echo: { card_name: "Charizard ex", listed_price: 180.5, market_price: 300, discount_pct: 42 },
        critique: { verdict: "PROCEED" },
        flags: {}, // also satisfies the safety-scan shape
      });
    }
    return chatJSON({});
  });
  const r = await runHybridPipeline({
    story: DEAL_SOURCE, platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 180.5, marketUsd: 300, discountPct: 42 } },
    cardArt: { 517236: "file:///c/art/517236.jpg" },
    deterministicProps: { priceUsd: 180.5 }, factOverlaySources: ["fact_lock", "resolver:resolveDealHeroSamples"],
    enabled: true, env: { OPENAI_API_KEY: "k", SOCIAL_HYBRID_CREATIVE: "true" }, fetchImpl,
  });
  assert.equal(r.ok, true, r.reason);
  assert.ok(OUTPUT_MODES.includes(r.mode));
  assert.ok(r.direction && r.direction.layout_intent);
  assert.ok(Array.isArray(r.enrichments));
  assert.ok(r.compositeSpec && r.compositeSpec.ok);
  assert.ok(r.versionStamp.creative_director_model || r.direction_source === "openai");
  assert.ok("background_generation_model" in r.versionStamp);
});

test("C4B-17. runHybridPipeline: the unrelated-era Umbreon still cannot render (editorial gate blocks it)", async () => {
  const r = await runHybridPipeline({
    story: { series: "EXACT_PRINTING_MATTERS", facts_json: {} },
    platform: "instagram", layout: "printing_compare",
    printingPair: {
      high: { name: "Umbreon", set: "Evolving Skies", card_number: "215", market_price: 520 },
      low: { name: "Umbreon", set: "Neo Discovery", card_number: "13", market_price: 110 },
    },
    enabled: true, env: {}, fetchImpl: mockFetch(() => chatJSON({})),
  });
  assert.equal(r.ok, false);
  assert.equal(r.stage, "editorial_gate");
  assert.equal(r.state, "EDITORIAL_WITHHOLD");
});

test("C4B-18. runHybridPipeline: an AI director that mutates a fact -> AI_FACT_MUTATION, no render", async () => {
  const fetchImpl = mockFetch((url) => {
    if (url.includes("/chat/")) return chatJSON({
      direction: Object.fromEntries(DIRECTOR_FIELDS.map((f) => [f, "x"])),
      facts_echo: { market_price: 999 }, // mutated
      critique: { verdict: "PROCEED" },
    });
    return imageJSON();
  });
  const r = await runHybridPipeline({
    story: DEAL_SOURCE, platform: "instagram", layout: "deal_hero",
    resolved: { data: { priceUsd: 180.5, marketUsd: 300 } },
    enabled: true, env: { OPENAI_API_KEY: "k" }, fetchImpl,
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, "AI_FACT_MUTATION");
});

// ================= WIRING + SCOPE (§1, §31, §32) =============
test("C4B-19. runEditorialGate is wired INTO the real card-forward render path (not a disconnected library)", () => {
  const src = read("lib/newsroom/cardForwardRender.mjs");
  assert.match(src, /runEditorialGate|runHybridPipeline/);
  assert.match(src, /EDITORIAL_WITHHOLD/);
  assert.match(src, /gateInputsFor/);
  // renderPass threads the hybrid flag
  assert.match(read("scripts/socialBacklogRender.mjs"), /hybridEnabled\(\)/);
});

test("C4B-20. hybrid is OFF by default and the deterministic render is byte-identical without a background", async () => {
  assert.equal(hybridEnabled({}), false);
  assert.equal(hybridEnabled({ SOCIAL_HYBRID_CREATIVE: "false" }), false);
  const ct = await import("../../lib/social/newsroom/cardEditorialTemplates.mjs");
  const props = { pricedCards: 21000, under25Pct: 65, over100Pct: 5, featured: { card_name: "X", asking_usd: 10, market_ref_usd: 20 }, target: "ig_45", cardArt: {} };
  assert.equal(ct.renderCardEditorialHtml("market_shape", props), ct.renderCardEditorialHtml("market_shape", { ...props }));
  const withBg = ct.renderCardEditorialHtml("market_shape", { ...props, backgroundDataUrl: "data:image/png;base64,AAAA" });
  assert.ok(withBg.includes("z-index:0") && withBg.length > ct.renderCardEditorialHtml("market_shape", props).length);
});

test("C4B-21. the hybrid layer performs NO Buffer / cron / Stage-1 / RIGHTS / email / eBay-Browse action", () => {
  for (const f of hybridFiles) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} Buffer`);
    assert.doesNotMatch(src, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} schedule`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} RIGHTS`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} email`);
    assert.doesNotMatch(src, /ebay|getBrowse|browse api/i, `${f} eBay`);
    assert.doesNotMatch(src, /from\(\s*price_history\s*\)/, `${f} price_history`);
  }
  assert.ok(HYBRID_PIPELINE_VERSION);
});

test("C4B-22. deterministicDirection is a complete, valid direction (mode A never blocks on the AI)", () => {
  const d = deterministicDirection({ brief: briefOf(DEAL_SOURCE), contract: contractFor("DEAL_DROP"), enrichmentsAvailable: ["price_gap_bar"] });
  for (const f of DIRECTOR_FIELDS) assert.ok(f in d.direction, `missing ${f}`);
  assert.equal(d.critique.verdict, "PROCEED");
  assert.equal(directorAvailable({}), false);
});
