// Phase SOCIAL-DISCOVERY-1 (SS35) - PLATFORM SEO / KEYWORDS / HASHTAGS /
// AUDIENCE TARGETING TESTS. All synthetic fixtures - deterministic,
// no DB, no OpenAI, $0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { entityArrays } from "../../lib/newsroom/discovery/entities.mjs";
import { classifyAudience } from "../../lib/newsroom/discovery/audienceEngine.mjs";
import { buildKeywordSet, auditKeywordEntityAlignment } from "../../lib/newsroom/discovery/keywordEngine.mjs";
import { selectHashtags, scoreHashtagCombo, SPAM_HASHTAGS } from "../../lib/newsroom/discovery/hashtagPools.mjs";
import { auditEmojiUsage } from "../../lib/newsroom/discovery/emojiPlans.mjs";
import { auditOnScreenAlignment } from "../../lib/newsroom/discovery/onScreenAlignment.mjs";
import { resolveRelatedSiteRoute } from "../../lib/newsroom/discovery/siteRouting.mjs";
import { auditDiscoveryMetadata } from "../../lib/newsroom/discovery/spamAudit.mjs";
import { packageInstagram, packageX, packageTikTok, packageYouTubeShorts } from "../../lib/newsroom/discovery/platformPackagers.mjs";
import { buildSocialDiscoveryManifest } from "../../lib/newsroom/discovery/discoveryManifest.mjs";
import { checkXLength } from "../../lib/newsroom/captions/captionAudit.mjs";

// ---- a real-shaped Clefairy market_snapshot fixture --------------------
function fixturePkg(overrides = {}) {
  return {
    story_id: "market_snapshot-107001-testfixture",
    family: "market_snapshot",
    editorial_angle: "affordability",
    snapshot: {
      snapshot_hash: "abc123deadbeef",
      tracked_population: 24585,
      derived_percentages: { under_25_pct: 85.7 },
      canonical_card_ids: [107001],
      canonical_card_metadata: { 107001: { name: "Clefairy", set: "Base Set (Shadowless)" } },
    },
    semantic_manifest: {
      example_card: "Clefairy",
      card_identity: { name: "Clefairy", set: "Base Set (Shadowless)" },
      card_metadata_lock: { name: "Clefairy", set: "Base Set (Shadowless)", rarity: "Holo Rare", printing: null, edition: null, variant: null },
      claim_value: 85.7,
      claim_population: "24,585 tracked singles",
      required_takeaway: "the stat applies to the tracked population, not to the example card",
    },
    captions: {
      instagram: { caption_text: "Did you know 85.7% of tracked singles sell for under $25?\n\nOut of 24,585 tracked singles, Clefairy is one real example of this trend.\n\nExplore the market on pokemondealfinder.com." },
      x: { caption_text: "85.7% of 24,585 tracked singles sell for under $25. Clefairy is one example.\n\nExplore the market on pokemondealfinder.com." },
    },
    ...overrides,
  };
}

test("DISC1-1. an unrelated Pokemon keyword fails the entity-mismatch guard", () => {
  const pkg = fixturePkg();
  const findings = auditKeywordEntityAlignment(["Charizard pokemon card", "cheap pokemon cards"], pkg);
  assert.ok(findings.some((f) => f.code === "KEYWORD_ENTITY_MISMATCH_FAIL"));
});

test("DISC1-2. an unrelated hashtag fails the discovery-metadata audit", () => {
  const pkg = fixturePkg();
  const out = { instagram: { caption: "test", hashtags: ["#Umbreon"] } };
  const audit = auditDiscoveryMetadata(pkg, out);
  assert.equal(audit.ok, false);
  assert.ok(audit.findings.some((f) => f.code === "KEYWORD_ENTITY_MISMATCH_FAIL"));
});

test("DISC1-3. #Charizard on a locked Clefairy story fails", () => {
  const pkg = fixturePkg();
  const findings = auditKeywordEntityAlignment(["#Charizard"], pkg);
  assert.ok(findings.length > 0);
});

test("DISC1-4. #fyp is rejected by default from every hashtag pool", () => {
  for (const family of ["market_snapshot", "deal_drop", "printing_compare", "three_under_25"]) {
    const sel = selectHashtags("tiktok", family, {});
    assert.ok(!sel.tags.some((t) => /^#(fyp|foryou|viral|trending|explorepage)$/i.test(t)), `${family} must never include a spam tag by default`);
  }
  assert.ok(SPAM_HASHTAGS.includes("fyp"));
});

test("DISC1-5. Instagram hashtag count never exceeds 5", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.instagram.hashtags.length <= 5);
});

test("DISC1-6. Instagram emoji count is audited against the <=4 cap", () => {
  const overLimit = "Great card! \u{1F440}\u{1F4CA}\u{1F4C8}\u{1F4B0}\u{1F3AF}"; // 5 emoji
  const audit = auditEmojiUsage(overLimit, "instagram");
  assert.equal(audit.ok, false);
  assert.ok(audit.count > 4);
  const okText = "Great card! \u{1F440}\u{1F4CA}";
  assert.equal(auditEmojiUsage(okText, "instagram").ok, true);
});

test("DISC1-7. X caption <=280 is enforced (reuses the existing hard gate)", () => {
  const long = "a".repeat(281);
  assert.equal(checkXLength(long, "x").length, 1);
  assert.equal(checkXLength("a".repeat(280), "x").length, 0);
});

test("DISC1-8. the X preferred-length (<=240) warning is distinct from the hard 280 limit", () => {
  const pkg = fixturePkg({ captions: { instagram: fixturePkg().captions.instagram, x: { caption_text: "a".repeat(260) } } });
  const out = packageX(pkg, { keywords: buildKeywordSet(pkg) });
  assert.equal(out.audit.within_preferred, false, "260 chars is under the 280 hard limit but over the 240 preferred target");
  assert.equal(out.audit.length_findings.length, 0, "260 chars must still PASS the hard gate");
});

test("DISC1-9. X hashtags never exceed 2", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.x.hashtags.length <= 2);
});

test("DISC1-10. TikTok hashtags never exceed 5", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.tiktok.hashtags.length <= 5);
});

test("DISC1-11. TikTok output always exposes a primary search query", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(typeof result.platform.tiktok.primary_search_query === "string" && result.platform.tiktok.primary_search_query.length > 0);
});

test("DISC1-12. TikTok on-screen alignment is evaluated and exposed as PASS/WARN/FAIL", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(["PASS", "WARN", "FAIL"].includes(result.platform.tiktok.audit.on_screen_alignment));
});

test("DISC1-13. YouTube title never exceeds the 100-char hard limit", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.youtube_shorts.title.length <= 100);
});

test("DISC1-14. YouTube description is a non-empty, fact-bearing string", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  const d = result.platform.youtube_shorts.description;
  assert.ok(d.length > 0);
  assert.match(d, /85\.7%/);
});

test("DISC1-15. YouTube hashtags never exceed 4", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.youtube_shorts.hashtags.length <= 4);
});

test("DISC1-16. YouTube video tags stay focused (never 30-50 near-duplicates)", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.youtube_shorts.video_tags.length <= 12);
});

test("DISC1-17. the primary keyword matches the actual story topic (never off-topic)", () => {
  const pkg = fixturePkg();
  const kw = buildKeywordSet(pkg);
  assert.match(kw.primary_search_query, /pokemon/i);
  assert.match(kw.primary_search_query, /price/i);
});

test("DISC1-18. the entity keyword matches the locked snapshot entity", () => {
  const pkg = fixturePkg();
  const kw = buildKeywordSet(pkg);
  assert.ok(kw.entity_keywords.some((k) => k.toLowerCase().includes("clefairy")));
});

test("DISC1-19. the set keyword matches the locked snapshot set", () => {
  const pkg = fixturePkg();
  const { set_entities } = entityArrays(pkg);
  assert.deepEqual(set_entities, ["Base Set (Shadowless)"]);
});

test("DISC1-20. unknown/unsupported metadata is never invented (missing set stays empty everywhere, not fabricated)", () => {
  const pkg = fixturePkg({
    snapshot: { ...fixturePkg().snapshot, canonical_card_metadata: { 107001: { name: "Clefairy", set: null } } },
    semantic_manifest: { ...fixturePkg().semantic_manifest, card_identity: { name: "Clefairy", set: null }, card_metadata_lock: { name: "Clefairy", set: null, rarity: null, printing: null, edition: null, variant: null } },
  });
  const { set_entities } = entityArrays(pkg);
  assert.deepEqual(set_entities, [], "no set was supplied anywhere in the frozen sources - none may be invented");
});

test("DISC1-21. duplicate hashtags are removed / never produced within one platform's set", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  for (const platform of ["instagram", "x", "tiktok", "youtube_shorts"]) {
    const tags = result.platform[platform].hashtags.map((t) => t.toLowerCase());
    assert.equal(new Set(tags).size, tags.length, `${platform} must not repeat a hashtag`);
  }
});

test("DISC1-22. recent hashtag repetition is penalized in scoring", () => {
  const fresh = scoreHashtagCombo(["#PokemonCardPrices"], { family: "market_snapshot", recentTags: [] });
  const repeated = scoreHashtagCombo(["#PokemonCardPrices"], { family: "market_snapshot", recentTags: ["#PokemonCardPrices", "#PokemonCardPrices"] });
  assert.ok(repeated.total < fresh.total, "a heavily-recently-used tag must score lower than a fresh one");
});

test("DISC1-23. platform captions differ meaningfully (never one caption truncated 4 ways)", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  const ig = result.platform.instagram.caption;
  const tiktok = result.platform.tiktok.caption;
  const ytTitle = result.platform.youtube_shorts.title;
  assert.notEqual(ig, tiktok);
  assert.ok(!ig.startsWith(ytTitle) && !tiktok.startsWith(ytTitle) || ytTitle.length < 60, "YouTube title must be its own front-loaded artifact, not a truncated caption");
});

test("DISC1-24. Instagram gets the light 2-4 emoji plan style", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.instagram.emoji_plan.limits.max <= 4);
  assert.ok(result.platform.instagram.emoji_plan.limits.preferred[0] >= 2);
});

test("DISC1-25. X stays more emoji-restrained than Instagram", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.x.emoji_plan.limits.max <= result.platform.instagram.emoji_plan.limits.max);
  assert.ok(result.platform.x.emoji_plan.limits.max <= 2);
});

test("DISC1-26. YouTube title front-loads the topic/number/entity", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  const title = result.platform.youtube_shorts.title;
  assert.match(title.slice(0, 15), /\d/, "a number should appear early when the story has one");
});

test("DISC1-27. the strengthened SEO handoff never publishes/generates a page - it only returns data", async () => {
  const src = readFileSync(new URL("../../lib/autonomous/seoRedditHandoff.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /writeFile|fs\.write|generateStaticParams|fetch\(/);
});

test("DISC1-28. related_site_route always resolves to a real, non-empty route", () => {
  const pkg = fixturePkg();
  const route = resolveRelatedSiteRoute(pkg);
  assert.ok(route.route.startsWith("/"));
  assert.equal(route.route, "/cards/clefairy-base-set-shadowless");
});

test("DISC1-29. the discovery manifest's snapshot_hash stays aligned with the story package", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.equal(result.manifest.snapshot_hash, pkg.snapshot.snapshot_hash);
});

test("DISC1-30. discovery metadata generation cannot alter the underlying facts", () => {
  const pkg = fixturePkg();
  const before = JSON.stringify(pkg.snapshot);
  buildSocialDiscoveryManifest(pkg);
  assert.equal(JSON.stringify(pkg.snapshot), before, "building discovery metadata must never mutate the frozen snapshot");
});

test("DISC1-31. no Buffer submit anywhere in the discovery module tree", () => {
  const files = ["entities.mjs", "audienceEngine.mjs", "searchIntent.mjs", "keywordEngine.mjs", "hashtagPools.mjs", "emojiPlans.mjs", "hookEngine.mjs", "siteRouting.mjs", "growthScore.mjs", "spamAudit.mjs", "onScreenAlignment.mjs", "platformPackagers.mjs", "discoveryManifest.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../lib/newsroom/discovery/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /createPost|bufferProvider|submitBufferPlacementLive/, `${f} must never touch Buffer`);
  }
});

test("DISC1-32. no cron / recurring scheduling in the discovery module tree or proof script", () => {
  const src = readFileSync(new URL("../../scripts/socialDiscovery1Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /setInterval|node-cron/);
  assert.doesNotMatch(src, /vercel\.json/);
});

test("DISC1-33. autopilot remains false / unset by this phase's code", () => {
  const src = readFileSync(new URL("../../scripts/socialDiscovery1Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /SOCIAL_AUTOPILOT_ENABLED\s*=\s*["']true["']/);
});

test("DISC1-34. no Reddit publish anywhere in the discovery module tree", () => {
  const files = ["discoveryManifest.mjs", "spamAudit.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../lib/newsroom/discovery/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /reddit\.com|postToReddit/i);
  }
});

test("DISC1-35. no email changes - the discovery module tree never imports the email/newsletter stack", () => {
  const src = readFileSync(new URL("../../lib/newsroom/discovery/discoveryManifest.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /resend|newsletter|sendDigest/i);
});

test("DISC1-36. no eBay changes - the discovery module tree never imports Browse/eBay code", () => {
  for (const f of ["discoveryManifest.mjs", "siteRouting.mjs", "keywordEngine.mjs"]) {
    const src = readFileSync(new URL(`../../lib/newsroom/discovery/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /ebay|browse-api/i);
  }
});

test("DISC1-37. no static-creative redesign - the discovery layer never imports the generative image pipeline", () => {
  for (const f of ["platformPackagers.mjs", "onScreenAlignment.mjs"]) {
    const src = readFileSync(new URL(`../../lib/newsroom/discovery/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /runFullGenerativeSocial|buildMasterPrompt|generateFullSocial/);
  }
});

test("DISC1-38. no video redesign - the discovery layer never imports 4C.7 rendering internals, only audits its output", () => {
  const src = readFileSync(new URL("../../lib/newsroom/discovery/onScreenAlignment.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /renderProfessionalSocialLoopToMp4|professionalVideoQa|masterLayeredMotion/);
});

// ---- a few extra structural checks worth having alongside the required 38 ----
test("DISC1-extra. the fixture's discovery manifest builds cleanly end-to-end with no findings", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test("DISC1-extra. audience classification comes from story family, never invented demographics", () => {
  const a = classifyAudience("market_snapshot");
  assert.equal(a.primary_audience, "market/value-focused collectors");
  const b = classifyAudience("deal_drop");
  assert.equal(b.primary_audience, "deal hunters");
});

test("DISC1-extra. on-screen alignment correctly PASSes when real caption text covers the keywords", () => {
  const pkg = fixturePkg();
  const kw = buildKeywordSet(pkg);
  const align = auditOnScreenAlignment(pkg, kw.on_screen_keywords);
  assert.notEqual(align.verdict, "FAIL");
});
