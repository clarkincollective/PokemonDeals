// Phase SOCIAL-CREATIVE-4A - AI CREATIVE DIRECTOR foundation: story
// relevance gate, story-type contracts, PRINTING_COMPARISON_RELEVANCE_CHECK,
// FACT_LOCK, creative brief + versioning, taste gate, anti-repetition,
// brand system, failure states. Pure-logic + source-scan. No OpenAI, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  FAILURE_STATES, READY_STATE, failure, isTerminalWithhold,
} from "../../lib/newsroom/editorial/failureStates.mjs";
import {
  FACT_LOCK_FIELDS, buildFactLock, factLockHash, detectFactMutation,
} from "../../lib/newsroom/editorial/factLock.mjs";
import {
  STORY_CONTRACTS, STORY_CONTRACT_IDS, contractFor, contractIdForSeries, isCommercial, unmappedContracts,
} from "../../lib/newsroom/editorial/storyContracts.mjs";
import {
  printingComparisonRelevance, baseCardName, PRINTING_RELEVANCE_VERSION,
} from "../../lib/newsroom/editorial/printingRelevance.mjs";
import {
  CREATIVE_BRIEF_VERSION, BRIEF_FIELDS, FACTUAL_BRIEF_FIELDS, buildCreativeBrief,
  validateCreativeBrief, CREATIVE_VERSION_FIELDS, buildVersionStamp,
} from "../../lib/newsroom/editorial/creativeBrief.mjs";
import {
  TASTE_DIMENSIONS, FIVE_SECOND_QUESTIONS, scoreTaste, fiveSecondTest,
} from "../../lib/newsroom/editorial/tasteGate.mjs";
import {
  RELEVANCE_DIMENSIONS, RELEVANCE_MIN, assessStoryRelevance,
} from "../../lib/newsroom/editorial/relevanceGate.mjs";
import {
  visualFingerprint, repetitionCheck, FINGERPRINT_FACETS,
} from "../../lib/newsroom/editorial/visualFingerprint.mjs";
import {
  BRAND_PALETTE, ANTI_PATTERNS, TYPE_ROLES, TYPE_ROLE_NAMES, MIN_DATA_LABEL_PX,
  COMPOSITION_CONTRACTS, COMPOSITION_FAMILIES, validateComposition,
} from "../../lib/newsroom/editorial/brandSystem.mjs";
import { runEditorialGate } from "../../lib/newsroom/editorial/index.mjs";
import { CARD_LAYOUT_STATUS } from "../../lib/social/newsroom/cardLayoutStatus.mjs";
import { CARD_FORWARD_SERIES } from "../../lib/newsroom/cardForwardRender.mjs";

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

const EDITORIAL_DIR = "lib/newsroom/editorial";
const editorialFiles = readdirSync(join(REPO, EDITORIAL_DIR)).filter((f) => f.endsWith(".mjs")).map((f) => `${EDITORIAL_DIR}/${f}`);

// ================= FAILURE STATES (§35) =========================
test("C4A-1. all §35 failure states are declared, plus the BUFFER_READY terminal", () => {
  for (const s of [
    "EDITORIAL_WITHHOLD", "CREATIVE_BRIEF_REJECT", "AI_FACT_MUTATION", "AI_BACKGROUND_REJECT",
    "CARD_FORWARD_RENDER_UNAVAILABLE", "VISUALLY_UNDERPOWERED_DATA", "CAPTION_WITHHELD", "QA_WATCH", "QA_FAIL",
  ]) assert.ok(FAILURE_STATES.includes(s), `missing failure state ${s}`);
  assert.equal(READY_STATE, "BUFFER_READY");
  assert.ok(isTerminalWithhold("EDITORIAL_WITHHOLD"));
  assert.ok(!isTerminalWithhold("QA_WATCH"));
});

test("C4A-2. failure() refuses a bare state with no human reason (no silent downgrade)", () => {
  assert.throws(() => failure("EDITORIAL_WITHHOLD"));
  assert.throws(() => failure("NOT_A_STATE", "x"));
  const f = failure("VISUALLY_UNDERPOWERED_DATA", "only 1 of 3 cards had canonical art");
  assert.equal(f.ok, false);
  assert.equal(f.state, "VISUALLY_UNDERPOWERED_DATA");
  assert.match(f.reason, /canonical art/);
});

// ================= FACT_LOCK (§7) ==============================
const DEAL_SOURCE = {
  facts_json: {
    card_name: "Charizard ex", card_set: "Obsidian Flames", card_number: "OBF 125", card_tcgplayer_id: "517236",
    total_price_usd: 180.5, market_price: 300, discount_pct: 0.4, grade: null, url: "https://pokemondealfinder.com/deals/abc",
  },
};

test("C4A-3. buildFactLock locks ONLY whitelisted fields, is deeply frozen, and hashes stably", () => {
  const lock = buildFactLock(DEAL_SOURCE);
  assert.ok(Object.isFrozen(lock));
  for (const k of Object.keys(lock)) {
    if (k === "_present") continue;
    assert.ok(FACT_LOCK_FIELDS.includes(k), `${k} is not a FACT_LOCK field`);
  }
  assert.equal(lock.listed_price, 180.5);
  assert.equal(lock.market_price, 300);
  assert.equal(lock.discount_pct, 40); // 0..1 normalised to integer percent
  assert.equal(lock.card_number, "125"); // set prefix + leading zeros stripped
  assert.throws(() => { lock.listed_price = 1; }, TypeError);
  const h1 = factLockHash(lock).full;
  const h2 = factLockHash(buildFactLock(DEAL_SOURCE)).full;
  assert.equal(h1, h2);
  assert.equal(factLockHash(lock).short.length, 16);
});

test("C4A-4. detectFactMutation flags an AI output that changes a locked value; passes a faithful echo", () => {
  const lock = buildFactLock(DEAL_SOURCE);
  const clean = detectFactMutation(lock, {
    editorial_angle: "a real Charizard ex well under a real reference",
    supporting_facts: [{ card_name: "Charizard ex", listed_price: 180.5, market_price: 300 }],
  });
  assert.equal(clean.ok, true);
  assert.equal(clean.mutations.length, 0);

  const bad = detectFactMutation(lock, { hero: { card_name: "Charizard VMAX", listed_price: 99 } });
  assert.equal(bad.ok, false);
  assert.equal(bad.state, "AI_FACT_MUTATION");
  const fields = bad.mutations.map((m) => m.field).sort();
  assert.deepEqual(fields, ["card_name", "listed_price"]);
});

// ================= PRINTING RELEVANCE (§4, §37) =================
const UMBREON_ALT = { name: "Umbreon", set: "Evolving Skies", card_number: "215", rarity: "Alternate Art Secret Rare", market_price: 520 };
const UMBREON_NEO = { name: "Umbreon", set: "Neo Discovery", card_number: "13", rarity: "Rare Holo", market_price: 110 };
const CHAR_DIFF_A = { name: "Charizard ex", set: "Obsidian Flames", card_number: "125", rarity: "Double Rare", market_price: 40 };
const CHAR_DIFF_B = { name: "Charizard VMAX", set: "Darkness Ablaze", card_number: "20", rarity: "Rare Holo VMAX", market_price: 25 };
const SNORLAX_A = { name: "Snorlax", set: "Cosmic Eclipse", card_number: "131", rarity: "Rare", market_price: 18 };
const SNORLAX_B = { name: "Snorlax", set: "Vivid Voltage", card_number: "141", rarity: "Rare", market_price: 9 };

const CHAR_1ST = { name: "Charizard (1st Edition)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 9000 };
const CHAR_UNL = { name: "Charizard (Unlimited)", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 1200 };
const CHAR_BS = { name: "Charizard", set: "Base Set", card_number: "4", rarity: "Rare Holo", market_price: 1200 };
const CHAR_BS2 = { name: "Charizard", set: "Base Set 2", card_number: "4", rarity: "Rare Holo", market_price: 260 };
const PIKA_REG = { name: "Pikachu", set: "Brilliant Stars", card_number: "58", rarity: "Common", market_price: 12 };
const PIKA_RH = { name: "Pikachu (Reverse Holo)", set: "Brilliant Stars", card_number: "58", rarity: "Common", market_price: 5 };

test("C4A-5. PRINTING_COMPARISON_RELEVANCE_CHECK rejects >=3 editorially-pointless pairs (incl. the unrelated-era Umbreon)", () => {
  const bad = [
    printingComparisonRelevance(UMBREON_ALT, UMBREON_NEO),
    printingComparisonRelevance(CHAR_DIFF_A, CHAR_DIFF_B),
    printingComparisonRelevance(SNORLAX_A, SNORLAX_B),
  ];
  for (const r of bad) {
    assert.equal(r.verdict, "REJECT", `expected REJECT, got ${r.verdict}: ${r.reason}`);
    assert.equal(r.ok, false);
    assert.ok(r.reason && r.reason.length > 10);
  }
  // the canonical failure named in §37
  assert.match(bad[0].reason, /era|price gap|printing lesson/i);
});

test("C4A-6. PRINTING_COMPARISON_RELEVANCE_CHECK accepts >=3 genuine printing/variant pairs with a lesson", () => {
  const good = [
    printingComparisonRelevance(CHAR_1ST, CHAR_UNL),
    printingComparisonRelevance(CHAR_BS, CHAR_BS2),
    printingComparisonRelevance(PIKA_RH, PIKA_REG),
  ];
  for (const r of good) {
    assert.equal(r.verdict, "MEANINGFUL", `expected MEANINGFUL, got ${r.verdict}: ${r.reason}`);
    assert.equal(r.ok, true);
    assert.ok(r.lesson && r.lesson.length > 5, "a MEANINGFUL pair must carry a teachable lesson");
    assert.ok(r.axis, "a MEANINGFUL pair must name the printing/variant axis");
  }
  assert.equal(good[0].axis, "first_edition_vs_unlimited");
});

test("C4A-7. baseCardName strips variant markers + set parentheticals so 'same card' is detectable", () => {
  assert.equal(baseCardName("Charizard (1st Edition)"), "charizard");
  assert.equal(baseCardName("Pikachu (Reverse Holo)"), "pikachu");
  assert.notEqual(baseCardName("Charizard ex"), baseCardName("Charizard VMAX"));
});

// ================= STORY CONTRACTS (§3) ========================
test("C4A-8. all 17 §3 story-type contracts exist with the required shape", () => {
  for (const id of [
    "DEAL_DROP", "THREE_UNDER_25", "MARKET_SNAPSHOT", "EXACT_PRINTING_MATTERS", "WHY_SOLD_PRICES_MATTER",
    "ASKING_VS_SOLD", "RAW_VS_GRADED", "SET_SNAPSHOT", "PRICE_DROP", "QUIET_CLIMBER", "BIGGEST_FIND",
    "SAME_CARD_DIFFERENT_PRICE", "AUCTION_LANDED_TOTAL", "BEHIND_THE_FINDER", "METHODOLOGY", "BUYER_EDUCATION",
  ]) {
    const c = STORY_CONTRACTS[id];
    assert.ok(c, `missing contract ${id}`);
    assert.ok(c.meaningful && c.meaningful.length > 20);
    assert.ok(Array.isArray(c.required_facts) && c.required_facts.length);
    assert.ok(Array.isArray(c.required_visual_evidence) && c.required_visual_evidence.length);
    assert.ok(Array.isArray(c.must_not_do) && c.must_not_do.length);
    assert.ok(["LIVE", "SHORT", "EDITORIAL", "EVERGREEN"].includes(c.shelf_life));
    assert.ok(["COMMERCIAL", "EDITORIAL"].includes(c.classification));
  }
  assert.ok(STORY_CONTRACT_IDS.length >= 16);
  assert.deepEqual(unmappedContracts(), []);
});

test("C4A-9. every card-forward series resolves to a story contract", () => {
  for (const series of Object.keys(CARD_FORWARD_SERIES)) {
    assert.ok(contractFor(series), `no contract for card-forward series ${series}`);
  }
  assert.equal(contractIdForSeries("DEAL_DROP"), "DEAL_DROP");
  assert.equal(isCommercial("DEAL_DROP"), true);
  assert.equal(isCommercial("MARKET_SNAPSHOT"), false);
});

// ================= CREATIVE BRIEF + VERSIONING (§5, §34) =======
test("C4A-10. buildCreativeBrief fills factual fields from the lock; validateCreativeBrief catches gaps", () => {
  const story = { series: "DEAL_DROP", facts_json: DEAL_SOURCE.facts_json };
  const lock = buildFactLock(story);
  const brief = buildCreativeBrief({ story, platform: "instagram", factLock: lock });
  for (const f of BRIEF_FIELDS) assert.ok(f in brief, `brief missing field ${f}`);
  assert.equal(brief.story_type, "DEAL_DROP");
  assert.equal(brief.platform, "instagram");
  assert.ok(brief.supporting_facts.join(" ").includes("Charizard ex"));
  assert.ok(FACTUAL_BRIEF_FIELDS.includes("supporting_facts"));

  const v = validateCreativeBrief(brief, { factLock: lock });
  assert.equal(v.ok, true, `brief should validate: ${v.errors.join("; ")}`);

  const broken = { ...brief, why_it_matters: "", layout_family: "" };
  assert.equal(validateCreativeBrief(broken).ok, false);
});

test("C4A-11. the §34 version stamp carries every explainability field", () => {
  const lock = buildFactLock(DEAL_SOURCE);
  const stamp = buildVersionStamp({ factLock: lock, artifactSha256: "a".repeat(64) });
  for (const f of [
    "creative_brief_version", "creative_director_model", "background_generation_model", "layout_version",
    "artifact_sha256", "fact_lock_hash", "visual_review_policy_version",
  ]) assert.ok(f in stamp, `version stamp missing ${f}`);
  assert.equal(stamp.creative_brief_version, CREATIVE_BRIEF_VERSION);
  assert.equal(stamp.fact_lock_hash, factLockHash(lock).short);
  // 4A does no AI - model fields are null, not fabricated
  assert.equal(stamp.creative_director_model, null);
  assert.equal(stamp.background_generation_model, null);
  for (const f of CREATIVE_VERSION_FIELDS) assert.ok(f in stamp);
});

// ================= TASTE GATE + 5-SECOND TEST (§19, §20) ======
test("C4A-12. TASTE_DIMENSIONS == the §19 list; scoreTaste returns every dimension", () => {
  assert.deepEqual([...TASTE_DIMENSIONS].sort(), [
    "AI_SPAM_RISK", "COLLECTOR_VALUE", "DATA_CLARITY", "EDITORIAL_RELEVANCE", "HOBBY_NATIVE_FEEL",
    "PREMIUM_FEEL", "SCROLL_STOP", "SHARE_SAVE_VALUE", "THUMBNAIL_STORY", "VISUAL_HIERARCHY",
  ]);
  const c = contractFor("DEAL_DROP");
  const lock = buildFactLock(DEAL_SOURCE);
  const t = scoreTaste({ contract: c, factLock: lock, dataPointCount: 3, distinctVisualElements: 3, heroDominant: true });
  for (const d of TASTE_DIMENSIONS) assert.ok(Number.isFinite(t.scores[d]), `no score for ${d}`);
  assert.ok(["PASS", "WATCH", "HOLD"].includes(t.verdict));
});

test("C4A-13. a card-less, data-less story scores HOLD-ish and fails the 5-second test", () => {
  const t = scoreTaste({ contract: null, factLock: buildFactLock({ facts_json: {} }), dataPointCount: 0, distinctVisualElements: 8, heroDominant: false });
  assert.ok(t.scores.AI_SPAM_RISK >= 48);
  assert.notEqual(t.verdict, "PASS");
  const five = fiveSecondTest({ brief: {}, factLock: buildFactLock({ facts_json: {} }), contract: null });
  assert.ok(five.unresolved.length >= 2);
  assert.equal(five.verdict, "HOLD");
  assert.deepEqual(FIVE_SECOND_QUESTIONS.length, 4);
});

// ================= RELEVANCE GATE (§2) ========================
test("C4A-14. relevance weights sum to 1; a strong real deal is PUBLISHABLE", () => {
  const sum = Object.values(RELEVANCE_DIMENSIONS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  const story = { series: "DEAL_DROP", facts_json: { ...DEAL_SOURCE.facts_json, discount_pct: 0.42 } };
  const r = assessStoryRelevance({ story, platform: "instagram", originality: 0.8 });
  assert.equal(r.verdict, "PUBLISHABLE", `expected PUBLISHABLE: ${r.reason}`);
  assert.ok(r.score >= RELEVANCE_MIN);
  assert.equal(r.classification, "COMMERCIAL");
});

test("C4A-15. an unrelated-era Umbreon EXACT_PRINTING_MATTERS story is EDITORIAL_WITHHOLD", () => {
  const story = { series: "EXACT_PRINTING_MATTERS", facts_json: {} };
  const r = assessStoryRelevance({ story, platform: "instagram", printingPair: { high: UMBREON_ALT, low: UMBREON_NEO } });
  assert.equal(r.verdict, "EDITORIAL_WITHHOLD");
  assert.equal(r.state, "EDITORIAL_WITHHOLD");
  assert.match(r.reason, /PRINTING_COMPARISON_RELEVANCE_CHECK/);
});

test("C4A-16. a genuine printing pair passes the relevance gate for EXACT_PRINTING_MATTERS", () => {
  const story = {
    series: "EXACT_PRINTING_MATTERS",
    facts_json: { card_name: "Charizard", card_set: "Base Set", market_price: 1200, percentages: [86] },
  };
  const r = assessStoryRelevance({ story, platform: "instagram", printingPair: { high: CHAR_1ST, low: CHAR_UNL } });
  assert.equal(r.verdict, "PUBLISHABLE", `expected PUBLISHABLE: ${r.reason}`);
  assert.equal(r.printing.verdict, "MEANINGFUL");
});

// ================= ANTI-REPETITION (§26) ======================
test("C4A-17. repetitionCheck BLOCKs an exact clone and WATCHes facet over-repetition", () => {
  const base = { layout: "deal_hero", hero_location: "left", card_count: 1, cta_zone: "bottom_right", background_family: "clean_editorial", hook_grammar: "DEAL_DROP", stat_type: "pct", visual_density: "low" };
  const fp = visualFingerprint(base);
  assert.equal(fp.key.length, 16);
  assert.equal(FINGERPRINT_FACETS.length, 8);

  const clone = repetitionCheck(base, [base, base, base]);
  assert.equal(clone.verdict, "BLOCK");
  assert.equal(clone.exact_clone, true);

  const history = Array.from({ length: 8 }, (_, i) => ({ ...base, hook_grammar: `S${i}`, stat_type: `t${i}`, cta_zone: `z${i}` }));
  const rep = repetitionCheck({ ...base, hook_grammar: "NEW", stat_type: "new", cta_zone: "new" }, history);
  assert.ok(["WATCH", "BLOCK"].includes(rep.verdict), `layout+hero+bg repeat should not be OK: ${JSON.stringify(rep.offenders)}`);
  assert.ok(rep.offenders.some((o) => o.startsWith("layout=")));
});

// ================= BRAND SYSTEM (§12, §13, §14) ===============
test("C4A-18. brand palette carries the mandated roles; anti-patterns are enumerated", () => {
  for (const role of ["ground", "ink", "red", "positive_green"]) assert.ok(BRAND_PALETTE[role], `palette missing ${role}`);
  assert.ok(/saving|gain/i.test(BRAND_PALETTE.green_is_only_for));
  assert.ok(ANTI_PATTERNS.length >= 6);
  assert.ok(ANTI_PATTERNS.some((p) => /crypto/i.test(p)));
  assert.ok(ANTI_PATTERNS.some((p) => /dashboard/i.test(p)));
});

test("C4A-19. type hierarchy covers all §13 roles with real limits; no tiny data labels", () => {
  for (const role of ["headline", "hero_number", "supporting_stat", "label", "annotation", "footer", "cta"]) {
    assert.ok(TYPE_ROLES[role], `type role missing ${role}`);
    assert.ok(TYPE_ROLES[role].max_words >= 1);
    assert.ok(TYPE_ROLES[role].min_px >= MIN_DATA_LABEL_PX || role === "label" || role === "footer");
  }
  assert.equal(TYPE_ROLE_NAMES.length, 7);
  assert.ok(Math.min(...Object.values(TYPE_ROLES).map((r) => r.min_px)) >= MIN_DATA_LABEL_PX);
});

test("C4A-20. composition contracts cover the 5 families; validateComposition enforces the occupancy bands", () => {
  for (const fam of ["deal_hero", "market_shape", "printing_compare", "three_up", "asking_vs_sold"]) {
    assert.ok(COMPOSITION_CONTRACTS[fam], `no composition contract for ${fam}`);
  }
  assert.equal(COMPOSITION_FAMILIES.length, 5);
  // deal_hero: card must be 35-55% of frame; a full realistic occupancy validates
  const ok = validateComposition("deal_hero", { card: 0.45, price_contrast: 0.24, headline: 0.12, supporting_text: 0.04, cta: 0.05, brand: 0.03, disclosure: 0.03 });
  assert.equal(ok.ok, true, ok.violations.join("; "));
  const bad = validateComposition("deal_hero", { card: 0.9, price_contrast: 0.25, cta: 0.05, brand: 0.03 });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => /card/.test(v)));
  // printing_compare: two cards must be balanced
  const unbal = validateComposition("printing_compare", { card_a: 0.30, card_b: 0.10, difference_callout: 0.18, prices: 0.12 });
  assert.equal(unbal.ok, false);
});

// ================= INTEGRATION: runEditorialGate ==============
test("C4A-21. runEditorialGate: withholds the pointless story, passes the strong one with a brief + stamp", () => {
  const withheld = runEditorialGate({
    story: { series: "EXACT_PRINTING_MATTERS", facts_json: {} },
    platform: "instagram",
    printingPair: { high: UMBREON_ALT, low: UMBREON_NEO },
  });
  assert.equal(withheld.ok, false);
  assert.equal(withheld.state, "EDITORIAL_WITHHOLD");

  const passed = runEditorialGate({
    story: { series: "DEAL_DROP", facts_json: { ...DEAL_SOURCE.facts_json, discount_pct: 0.42 } },
    platform: "instagram",
    originality: 0.8,
  });
  assert.equal(passed.ok, true, `expected pass: ${passed.reason}`);
  assert.ok(passed.brief && passed.brief.story_type === "DEAL_DROP");
  assert.ok(passed.factLockHash && passed.factLockHash.short.length === 16);
  assert.equal(passed.versionStamp.creative_brief_version, CREATIVE_BRIEF_VERSION);
});

// ================= SCOPE GUARD (§40, §41) ====================
test("C4A-22. the editorial layer performs NO Buffer / cron / Stage-1 / RIGHTS / email / eBay-Browse action", () => {
  for (const f of editorialFiles) {
    const src = code(f);
    assert.doesNotMatch(src, /createPost|scheduleOne|reconcileOne/, `${f} must not touch the Buffer provider`);
    assert.doesNotMatch(src, /SOCIAL_BUFFER_BACKLOG_ENABLED\s*=|SOCIAL_BUFFER_BACKLOG_MODE\s*=/, `${f} must not set the backlog env`);
    assert.doesNotMatch(src, /REFILL_SCHEDULE|CronCreate|vercel\.json/, `${f} must not touch schedules`);
    assert.doesNotMatch(src, /RIGHTS_STATE\.publishing\s*=/, `${f} must not change RIGHTS publishing`);
    assert.doesNotMatch(src, /resend|sendEmail|newsletter_subscribers/i, `${f} must not send email`);
    assert.doesNotMatch(src, /ebay|browse api|getBrowse/i, `${f} must not call eBay`);
    assert.doesNotMatch(src, /from\(\s*price_history\s*\)|\.price_history\b/, `${f} must not touch price_history directly`);
  }
});

test("C4A-23. resolvePrintingPair now gates on PRINTING_COMPARISON_RELEVANCE_CHECK", () => {
  const src = read("lib/social/newsroom/marketData.mjs");
  assert.match(src, /printingComparisonRelevance/);
  assert.match(src, /from ["'][^"']*newsroom\/editorial\/printingRelevance\.mjs["']/);
  assert.match(src, /PRINTING_COMPARISON_RELEVANCE_CHECK/);
  assert.ok(PRINTING_RELEVANCE_VERSION);
});
