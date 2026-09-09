// Phase SOCIAL-CAPTION-5B.1 (§15) - caption entity lock + placeholder
// hardening scanner tests. Deterministic; the caption-generation network
// call is mocked exactly as tests/scanner/social-creative-5b.test.mjs
// already does.

import { test } from "node:test";
import assert from "node:assert/strict";

import { auditCaptionEntityLock, buildLockedEntitySet, extractMentionedSpecies } from "../../lib/newsroom/captions/captionEntityLock.mjs";
import { auditPlaceholders } from "../../lib/newsroom/captions/captionPlaceholderAudit.mjs";
import { auditCaption, CAPTION_AUDIT_VERSION } from "../../lib/newsroom/captions/captionAudit.mjs";
import { buildCaptionBrief, buildCaptionPrompt, runCaptionDirector } from "../../lib/newsroom/captions/captionDirector.mjs";
import { auditCaptionAgainstStoryPackage, auditCaptionsAgainstStoryPackage } from "../../lib/autonomous/captionCrossAssetAudit.mjs";
import { FAILURE_STATES, REVISABLE_STATES } from "../../lib/newsroom/editorial/failureStates.mjs";
import { buildStorySnapshot } from "../../lib/autonomous/storySnapshot.mjs";

const SEM_CLEFAIRY = Object.freeze({
  layout: "market_shape", classification: "EDITORIAL", claim_value: 85.7,
  example_card: "Clefairy", example_card_is_not_population: true,
  card_identity: { name: "Clefairy" },
  card_metadata_lock: { _displayable: ["set"], set: "Base Set (Shadowless)" },
  required_numeric_facts: { under_25_pct: 85.7, tracked_count: 24545 },
  visualization_data_manifest: { allowed_points: [{ label: "under $25", value: 85.7 }] },
});

// ===================== §15.1-5 ENTITY LOCK =====================
test("CAP5B1-1. a wrong specific Pokemon claim fails (Pikachu vs locked Clefairy)", () => {
  const f = auditCaptionEntityLock("Pikachu is a great example of this trend.", SEM_CLEFAIRY);
  assert.ok(f.some((x) => x.code === "CAPTION_ENTITY_MISMATCH"));
});

test("CAP5B1-2. a wrong card fails (same mechanism as a wrong Pokemon claim)", () => {
  const f = auditCaptionEntityLock("This Charizard fits the pattern.", SEM_CLEFAIRY);
  assert.ok(f.some((x) => x.code === "CAPTION_ENTITY_MISMATCH" && x.detail.includes("Charizard")));
});

test("CAP5B1-3. a wrong set fails (Jungle named when the locked set is Base Set)", () => {
  const f = auditCaptionEntityLock("From Jungle, this card is a great pickup.", SEM_CLEFAIRY);
  assert.ok(f.some((x) => x.code === "CAPTION_ENTITY_MISMATCH" && x.detail.includes("Jungle")));
});

test("CAP5B1-4. a wrong printing fails (Unlimited named when the locked printing is Shadowless)", () => {
  const semShadowless = { ...SEM_CLEFAIRY, card_metadata_lock: { _displayable: ["set"], set: "Base Set (Shadowless)" } };
  const f = auditCaptionEntityLock("This Unlimited print is a steal.", semShadowless);
  assert.ok(f.some((x) => x.code === "CAPTION_ENTITY_MISMATCH" && x.detail.includes("Unlimited")));
});

test("CAP5B1-5. invented metadata (a species with no locked example at all) fails", () => {
  const f = auditCaptionEntityLock("Blastoise represents this trend well.", { classification: "EDITORIAL" });
  assert.ok(f.some((x) => x.code === "CAPTION_ENTITY_MISMATCH"));
});

test("CAP5B1-6. generic Pokemon wording passes (no specific entity claimed)", () => {
  const f = auditCaptionEntityLock("Pokemon singles are often more affordable than collectors expect.", SEM_CLEFAIRY);
  assert.equal(f.length, 0);
});

test("CAP5B1-7. the correct locked entity passes", () => {
  const f = auditCaptionEntityLock("Clefairy is one real example.", SEM_CLEFAIRY);
  assert.equal(f.length, 0);
});

// ===================== §15.8-12 PLACEHOLDER HARD FAIL =====================
test("CAP5B1-8. a literal null fails", () => {
  assert.ok(auditPlaceholders("Example: null fits this range.").some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL"));
});
test("CAP5B1-9. a literal undefined fails", () => {
  assert.ok(auditPlaceholders("Price: undefined for this listing.").some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL"));
});
test("CAP5B1-10. a literal NaN fails", () => {
  assert.ok(auditPlaceholders("Discount: NaN% off.").some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL"));
});
test("CAP5B1-11. a literal [object Object] fails", () => {
  assert.ok(auditPlaceholders("Details: [object Object]").some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL"));
});
test("CAP5B1-12. an unresolved mustache/template-literal placeholder fails", () => {
  assert.ok(auditPlaceholders("Card: {{card_name}} is affordable.").some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL"));
  assert.ok(auditPlaceholders("Card: ${cardName} is affordable.").some((f) => f.code === "CAPTION_PLACEHOLDER_FAIL"));
});
test("intentional lowercase prose containing the word 'unknown' does not false-positive (only the UPPERCASE template-default marker is flagged)", () => {
  assert.equal(auditPlaceholders("The exact grade is currently unknown to the seller.").length, 0);
});

// ===================== §15.13 OPTIONAL FIELD OMITTED CLEANLY =====================
test("CAP5B1-13. buildCaptionPrompt never interpolates a bare 'null'/'undefined' AS A VALUE when example_card is missing (the words may still appear inside the explicit anti-placeholder instruction itself)", () => {
  const brief = buildCaptionBrief({ story: { series: "MARKET_SNAPSHOT" }, semanticManifest: { layout: "market_shape", classification: "EDITORIAL", example_card_is_not_population: true, example_card: null }, family: "market_shape" });
  const prompt = buildCaptionPrompt({ brief });
  // the old bug: the SCOPE clause interpolated ${b.example_card} directly,
  // producing "NOT for null" / "null is only ONE example" / `"null singles"`.
  assert.doesNotMatch(prompt, /NOT for null\b/);
  assert.doesNotMatch(prompt, /\bnull is only ONE example\b/);
  assert.doesNotMatch(prompt, /"null singles"/);
  assert.match(prompt, /No specific example card name was supplied/);
});

test("a populated example_card still renders the LOCKED EXAMPLE CARD block correctly", () => {
  const brief = buildCaptionBrief({ story: { series: "MARKET_SNAPSHOT" }, semanticManifest: SEM_CLEFAIRY, family: "market_shape" });
  const prompt = buildCaptionPrompt({ brief });
  assert.match(prompt, /LOCKED EXAMPLE CARD/);
  assert.match(prompt, /Clefairy/);
});

// ===================== §15.14 INDEPENDENT PLATFORM AUDIT =====================
test("CAP5B1-14. Instagram and X are audited independently via auditCaptionsAgainstStoryPackage", () => {
  const snap = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts: {
    source_records: [], canonical_card_ids: ["107001"], canonical_card_metadata: { "107001": { name: "Clefairy" } },
    prices: null, market_reference_values: null, derived_percentages: { under_25_pct: 85.7 }, tracked_population: 24545,
    distribution_values: null, comparison_direction: null, timeframe: null, source_statements: null,
    semantic_scope: "GLOBAL_TRACKED_POPULATION", fact_trace: [], fact_lock_hash: null, visualization_manifest: null,
    classification: "EDITORIAL", cta_class: "WEBSITE_FIRST", disclosure_required: false, data_freshness: { captured_at: new Date().toISOString() },
  } });
  const pkg = {
    story_id: "s1", family: "market_shape", snapshot: snap, semantic_manifest: SEM_CLEFAIRY,
    captions: {
      instagram: { caption_text: "Most tracked Pokemon singles sell for under $25, which surprises a lot of new collectors. Clefairy is one real example that fits this range. Understanding how affordable the market really is helps you build a collection without overspending. Explore pokemondealfinder.com.", hook: "x", cta: "pokemondealfinder.com", hashtags: [] },
      x: { caption_text: "85.7% of tracked singles sell under $25 - Pikachu fits this range, which surprises a lot of collectors. Explore pokemondealfinder.com.", hook: "y", cta: "pokemondealfinder.com", hashtags: [] },
    },
  };
  const results = auditCaptionsAgainstStoryPackage(pkg);
  // targeted at entity-lock independence specifically - not the unrelated
  // quality-score heuristic, which either fixture may or may not clear.
  assert.equal(results.instagram.verification.entity_lock, "PASS", JSON.stringify(results.instagram));
  assert.equal(results.x.verification.entity_lock, "FAIL");
  assert.equal(results.x.ok, false);
  assert.equal(results.x.state, "CAPTION_ENTITY_MISMATCH");
});

// ===================== §15.15-17 BOUNDED RETRY =====================
function mockFetch(sequence) {
  let i = 0;
  return async () => {
    const bundle = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(bundle) } }] }) };
  };
}
test("CAP5B1-15. a bounded retry repairs an entity mismatch without changing locked numeric facts", async () => {
  const bad = { instagram: { hook: "Pikachu is a great find", body: "85.7% of 24,545 tracked singles sell under $25.", why_it_matters: "Affordable collecting.", cta: "pokemondealfinder.com", hashtags: [] }, x: { hook: "Pikachu example", body: "85.7% of 24,545 singles under $25.", why_it_matters: "Affordable.", cta: "pokemondealfinder.com", hashtags: [] }, hooks_considered: ["a"] };
  const good = { instagram: { hook: "Clefairy is a great example", body: "85.7% of 24,545 tracked singles sell under $25.", why_it_matters: "Affordable collecting.", cta: "pokemondealfinder.com", hashtags: [] }, x: { hook: "Clefairy example", body: "85.7% of 24,545 singles under $25.", why_it_matters: "Affordable.", cta: "pokemondealfinder.com", hashtags: [] }, hooks_considered: ["a"] };
  const r = await runCaptionDirector({
    story: { story_id: "s1", series: "MARKET_SNAPSHOT" }, semanticManifest: { ...SEM_CLEFAIRY, required_numeric_facts: { under_25_pct: 85.7, tracked_count: 24545 } },
    factTrace: [], family: "market_shape", platforms: ["instagram", "x"],
    budget: { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] },
    env: { OPENAI_API_KEY: "test" }, fetchImpl: mockFetch([bad, good]),
  });
  assert.equal(r.instagram.status, "READY", JSON.stringify(r.instagram));
  assert.match(r.instagram.caption_text, /Clefairy/);
  assert.doesNotMatch(r.instagram.caption_text, /Pikachu/);
  assert.match(r.instagram.caption_text, /85\.7%/);
});

test("CAP5B1-16. repeated entity-mismatch failure becomes a HOLD state, never a silent pass", async () => {
  const bad = { instagram: { hook: "Pikachu example", body: "85.7% of 24,545 tracked singles sell under $25.", why_it_matters: "x", cta: "pokemondealfinder.com", hashtags: [] }, x: { hook: "Pikachu", body: "85.7% under $25.", why_it_matters: "x", cta: "pokemondealfinder.com", hashtags: [] }, hooks_considered: ["a"] };
  const r = await runCaptionDirector({
    story: { story_id: "s1", series: "MARKET_SNAPSHOT" }, semanticManifest: { ...SEM_CLEFAIRY, required_numeric_facts: { under_25_pct: 85.7, tracked_count: 24545 } },
    factTrace: [], family: "market_shape", platforms: ["instagram"],
    budget: { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] },
    env: { OPENAI_API_KEY: "test" }, fetchImpl: mockFetch([bad, bad]),
  });
  assert.notEqual(r.instagram.status, "READY");
  assert.equal(r.instagram.caption_text, null);
});

test("CAP5B1-17. no factual numeric value changes between the failing and repaired candidate", async () => {
  const bad = { instagram: { hook: "Pikachu example", body: "85.7% of 24,545 tracked singles sell under $25.", why_it_matters: "x", cta: "pokemondealfinder.com", hashtags: [] }, x: { hook: "x", body: "y", why_it_matters: "z", cta: "pokemondealfinder.com", hashtags: [] }, hooks_considered: ["a"] };
  const good = { instagram: { hook: "Clefairy example", body: "85.7% of 24,545 tracked singles sell under $25.", why_it_matters: "x", cta: "pokemondealfinder.com", hashtags: [] }, x: { hook: "x", body: "y", why_it_matters: "z", cta: "pokemondealfinder.com", hashtags: [] }, hooks_considered: ["a"] };
  const r = await runCaptionDirector({
    story: { story_id: "s1", series: "MARKET_SNAPSHOT" }, semanticManifest: { ...SEM_CLEFAIRY, required_numeric_facts: { under_25_pct: 85.7, tracked_count: 24545 } },
    factTrace: [], family: "market_shape", platforms: ["instagram"],
    budget: { limits: { creative_director_calls: 2 }, used: { creative_director_calls: 0 }, calls: [], latencies_ms: [] },
    env: { OPENAI_API_KEY: "test" }, fetchImpl: mockFetch([bad, good]),
  });
  assert.match(r.instagram.caption_text, /85\.7%/);
  assert.match(r.instagram.caption_text, /24,545/);
});

// ===================== §15.18/19 CTA + DISCLOSURE INTACT =====================
test("CAP5B1-18/19. the CTA stays website-first and disclosure logic is unchanged by this phase", () => {
  const brief = buildCaptionBrief({ story: { series: "MARKET_SNAPSHOT" }, semanticManifest: SEM_CLEFAIRY, family: "market_shape" });
  assert.match(brief.cta_intent.text, /pokemondealfinder\.com/);
  assert.equal(brief.disclosure_required, false); // EDITORIAL, not COMMERCIAL
});

// ===================== §15.20 SNAPSHOT HASH UNCHANGED =====================
test("CAP5B1-20. buildStorySnapshot's hash formula is untouched by this phase (same facts -> same hash)", () => {
  const facts = { source_records: [], canonical_card_ids: ["1"], canonical_card_metadata: { 1: { name: "Clefairy" } }, prices: null, market_reference_values: null, derived_percentages: null, tracked_population: null, distribution_values: null, comparison_direction: null, timeframe: null, source_statements: null, semantic_scope: "x", fact_trace: [], fact_lock_hash: null, visualization_manifest: null, classification: "EDITORIAL", cta_class: "WEBSITE_FIRST", disclosure_required: false, data_freshness: { captured_at: "2026-01-01T00:00:00.000Z" } };
  const a = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts });
  const b = buildStorySnapshot({ storyId: "s1", storyFamily: "market_snapshot", editorialAngle: "x", facts });
  assert.equal(a.snapshot_hash, b.snapshot_hash);
});

// ===================== §15.21/22 NO ARCHITECTURE CHANGES =====================
test("CAP5B1-21/22. no creative/video architecture changes - the new modules never import 5A.1 generation or 4C.7 rendering internals", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEntityLock.mjs", "captionPlaceholderAudit.mjs"]) {
    const src = readFileSync(new URL(`../../lib/newsroom/captions/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /runFullGenerativeSocial|generateFullSocial|renderVideoPlanToMp4|professionalSocialLoop/i, f);
  }
});

// ===================== §15.23/24 NO BUFFER / LIVE SCHEDULING =====================
test("CAP5B1-23/24. no Buffer provider call, no live scheduling anywhere in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEntityLock.mjs", "captionPlaceholderAudit.mjs"]) {
    const src = readFileSync(new URL(`../../lib/newsroom/captions/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /createPost\(|providers\/buffer/i, f);
  }
  const crossSrc = readFileSync(new URL("../../lib/autonomous/captionCrossAssetAudit.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(crossSrc, /createPost\(|providers\/buffer/i);
});

// ===================== §15.25/26 AUTOPILOT / CRON =====================
test("CAP5B1-25/26. autopilot remains false by default; no cron/setInterval in the new modules", async () => {
  const { resolveProductionSafety } = await import("../../lib/autonomous/productionSafety.mjs");
  assert.equal(resolveProductionSafety({}).autopilotEnabled, false);
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEntityLock.mjs", "captionPlaceholderAudit.mjs"]) {
    const src = readFileSync(new URL(`../../lib/newsroom/captions/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /setInterval|node-cron/i, f);
  }
});

// ===================== §15.27-30 SCOPE =====================
test("CAP5B1-27/28/29/30. no Reddit/SEO/email/eBay-Browse code anywhere in the new modules", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["captionEntityLock.mjs", "captionPlaceholderAudit.mjs"]) {
    const src = readFileSync(new URL(`../../lib/newsroom/captions/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /reddit\.post|generateSeoPage|resend\.emails\.send|ebayBrowse/i, f);
  }
});

// ===================== DECLARED STATES =====================
test("both new failure states are declared and revisable", () => {
  assert.ok(FAILURE_STATES.includes("CAPTION_ENTITY_MISMATCH"));
  assert.ok(FAILURE_STATES.includes("CAPTION_PLACEHOLDER_FAIL"));
  assert.ok(REVISABLE_STATES.includes("CAPTION_ENTITY_MISMATCH"));
  assert.ok(REVISABLE_STATES.includes("CAPTION_PLACEHOLDER_FAIL"));
});

test("captionAudit composes the new checks - a locked-entity-violating caption fails through the normal auditCaption() pipeline", () => {
  const parts = { hook: "Pikachu is one example", body: "85.7% of tracked singles sell under $25.", why_it_matters: "x", cta: "pokemondealfinder.com", hashtags: [] };
  const r = auditCaption({ parts, captionText: "Pikachu is one example. 85.7% of tracked singles sell under $25. pokemondealfinder.com", family: "market_shape", platform: "instagram", semanticManifest: SEM_CLEFAIRY, factTrace: [] });
  assert.equal(r.ok, false);
  assert.equal(r.state, "CAPTION_ENTITY_MISMATCH");
  assert.equal(r.verification.entity_lock, "FAIL");
});

test("extractMentionedSpecies finds every distinct species mentioned, not just the first", () => {
  const s = extractMentionedSpecies("Pikachu and Charizard are both popular, but Clefairy is the locked example.");
  assert.ok(s.includes("Pikachu"));
  assert.ok(s.includes("Charizard"));
  assert.ok(s.includes("Clefairy"));
});

test("buildLockedEntitySet reads only the frozen manifest - no I/O", () => {
  const locked = buildLockedEntitySet(SEM_CLEFAIRY);
  assert.ok(locked.species.has("Clefairy"));
});
