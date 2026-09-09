// Phase SOCIAL-DISCOVERY-2 (SS22) - AUTOPILOT INTEGRATION + PERSISTED
// DISCOVERY HISTORY TESTS. Deterministic logic is tested directly
// (synthetic fixtures, no DB/OpenAI, $0); the runOnePackage() wiring
// itself is additionally proven for real against live DB data by
// scripts/socialDiscovery2Pack.mjs (.social-preview/social-discovery-2/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildSocialDiscoveryManifest } from "../../lib/newsroom/discovery/discoveryManifest.mjs";
import { auditDiscoveryReadiness } from "../../lib/newsroom/discovery/discoveryQaGate.mjs";
import { buildFinalPlatformText, auditFinalPlatformText } from "../../lib/newsroom/discovery/finalCaptionBuilder.mjs";
import { selectHashtags } from "../../lib/newsroom/discovery/hashtagPools.mjs";
import { buildDiscoveryCaptionStyle, recentTagsFor, recentCombosFor, recentPrimaryKeywordsFor } from "../../lib/social/newsroom/discoveryHistory.mjs";

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
      card_metadata_lock: { name: "Clefairy", set: "Base Set (Shadowless)", rarity: "Holo Rare" },
      claim_value: 85.7, claim_population: "24,585 tracked singles",
      required_takeaway: "the stat applies to the tracked population, not to the example card",
    },
    captions: {
      instagram: { caption_text: "Did you know 85.7% of tracked singles sell for under $25?\n\nOut of 24,585 tracked singles, Clefairy is one real example of this trend.\n\nExplore the market on pokemondealfinder.com." },
      x: { caption_text: "85.7% of 24,585 tracked singles sell for under $25. Clefairy is one example.\n\nExplore the market on pokemondealfinder.com." },
    },
    ...overrides,
  };
}

test("DISC2-1/2/3. runOnePackage builds pkg.discovery from the SAME frozen snapshot, reused across all four platforms", () => {
  const src = readFileSync(new URL("../../lib/autonomous/socialStoryEngine.mjs", import.meta.url), "utf8");
  assert.match(src, /pkg\.discovery\s*=\s*discoveryResult\.manifest/, "runOnePackage must persist the manifest on pkg.discovery");
  assert.match(src, /buildSocialDiscoveryManifest\(pkg,/, "must call buildSocialDiscoveryManifest with the SAME pkg (same frozen snapshot)");
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.equal(result.manifest.snapshot_hash, pkg.snapshot.snapshot_hash);
  for (const p of ["instagram", "x", "tiktok", "youtube_shorts"]) {
    assert.ok(result.platform[p], `${p} package must exist`);
    assert.equal(result.manifest.primary_search_query, result.platform[p].caption_keywords?.[0] ?? result.platform[p].primary_search_query ?? result.manifest.primary_search_query, "same semantic source reused, not independently regenerated");
  }
});

test("DISC2-4. the Instagram final provider text includes the approved (audited) hashtags", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  const ig = result.platform.instagram;
  for (const tag of ig.hashtags) assert.ok(ig.final_provider_text.includes(tag), `final text must include ${tag}`);
});

test("DISC2-5. Instagram final emoji limit (<=4) is enforced on the FINAL combined text, not just the bare caption", () => {
  const pkg = fixturePkg({ captions: { instagram: { caption_text: "Great card! \u{1F440}\u{1F4CA}\u{1F4C8}" }, x: fixturePkg().captions.x } }); // 3 emoji already
  const result = buildSocialDiscoveryManifest(pkg);
  // even if hashtags push it further, emoji count itself must never exceed 4
  const count = (result.platform.instagram.final_provider_text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  assert.ok(count <= 4 ? true : !result.platform.instagram.audit.ok, "if emoji count exceeds 4, audit.ok must be false");
});

test("DISC2-6. the final X provider string (caption + hashtags) is <=280", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok([...result.platform.x.final_provider_text].length <= 280);
  assert.equal(result.platform.x.audit.final_text_within_hard_limit, true);
});

test("DISC2-7. a deliberately 281+ character X fixture cannot become BUFFER_READY (fails before Buffer)", () => {
  const pkg = fixturePkg({ captions: { instagram: fixturePkg().captions.instagram, x: { caption_text: "a".repeat(281) } } });
  const result = buildSocialDiscoveryManifest(pkg);
  assert.equal(result.platform.x.audit.ok, false);
  pkg.discovery = result.manifest; // as runOnePackage does before calling auditDiscoveryReadiness
  const readiness = auditDiscoveryReadiness(pkg, "x");
  assert.equal(readiness.ok, false);
  assert.equal(readiness.checks.PLATFORM_LENGTH_PASS, false);
});

test("DISC2-8. X hashtags never exceed 2 in the final selection", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.x.hashtags.length <= 2);
});

test("DISC2-9. the TikTok package is internally complete (video-ready fields all present)", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  const t = result.platform.tiktok;
  for (const field of ["caption", "hashtags", "primary_search_query", "on_screen_keywords", "target_audience"]) {
    assert.ok(t[field] !== undefined && t[field] !== null, `tiktok.${field} must be present`);
  }
});

test("DISC2-10. the YouTube Shorts package is internally complete", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  const y = result.platform.youtube_shorts;
  for (const field of ["title", "description", "hashtags", "video_tags", "primary_query", "target_audience"]) {
    assert.ok(y[field] !== undefined && y[field] !== null, `youtube_shorts.${field} must be present`);
  }
});

test("DISC2-11. YouTube title never exceeds 100 characters", () => {
  const pkg = fixturePkg();
  const result = buildSocialDiscoveryManifest(pkg);
  assert.ok(result.platform.youtube_shorts.title.length <= 100);
});

test("DISC2-12. persisted hashtag history loads via getRecentDiscoveryHistory's real read path (empty is a valid, honest result)", async () => {
  const { getRecentDiscoveryHistory } = await import("../../lib/social/newsroom/discoveryHistory.mjs");
  const result = await getRecentDiscoveryHistory("instagram", 10);
  assert.ok("ready" in result && "rows" in result, "must always return a well-formed {ready, rows} shape, even on a DB error");
  assert.ok(Array.isArray(result.rows));
});

test("DISC2-13/14. queued AND published posts both count toward rotation history (both real-history statuses are read)", () => {
  const src = readFileSync(new URL("../../lib/social/newsroom/discoveryHistory.mjs", import.meta.url), "utf8");
  assert.match(src, /BUFFER_QUEUED/);
  assert.match(src, /PUBLISHED/);
  assert.match(src, /RECONCILED/);
});

test("DISC2-15. an irrelevant hashtag is never selected for the sake of diversity/rotation", () => {
  const recentCombo = [["#PokemonCardPrices", "#PokemonMarket", "#PokemonTCG", "#PokemonCollectors", "#CardCollecting", "#Clefairy"]];
  const sel = selectHashtags("instagram", "market_snapshot", { entityTerm: "Clefairy", recentCombos: recentCombo, lockedEntityTerms: ["Clefairy"] });
  assert.ok(!sel.tags.some((t) => /Umbreon|Charizard|Pikachu|fyp|viral/i.test(t)), "must never introduce an irrelevant/unlocked tag just to look different from a recent combo");
});

test("DISC2-16. an exactly-repeated hashtag combination is detected and reported (relevance still wins when no safe alternative exists)", () => {
  const first = selectHashtags("instagram", "market_snapshot", { entityTerm: "Clefairy", lockedEntityTerms: ["Clefairy"] });
  const repeat = selectHashtags("instagram", "market_snapshot", { entityTerm: "Clefairy", lockedEntityTerms: ["Clefairy"], recentCombos: [first.tags] });
  assert.equal(repeat.rotation.exact_combo_repeated_recently, true);
  // with this family's small pool, no safe (non-spam, relevant) alternative
  // exists beyond the 5 already selected - the repeat is correctly allowed.
  assert.deepEqual(new Set(repeat.tags), new Set(first.tags));
});

test("DISC2-17. keyword history is exposed for a real caller to persist (recentPrimaryKeywordsFor)", () => {
  const rows = [{ primary_keyword: "pokemon card prices" }, { primary_keyword: "pokemon card deals" }, { primary_keyword: null }];
  assert.deepEqual(recentPrimaryKeywordsFor(rows), ["pokemon card prices", "pokemon card deals"]);
});

test("DISC2-18. the discovery audit can block BUFFER_READY - an entity-mismatched platform never reads ok:true", () => {
  const pkg = fixturePkg({ semantic_manifest: { ...fixturePkg().semantic_manifest }, captions: { instagram: { caption_text: "Charizard is a great pull! Explore pokemondealfinder.com." }, x: fixturePkg().captions.x } });
  pkg.discovery = buildSocialDiscoveryManifest(pkg).manifest;
  const readiness = auditDiscoveryReadiness(pkg, "instagram");
  assert.equal(readiness.ok, false);
  assert.equal(readiness.checks.KEYWORD_ENTITY_PASS, false);
});

test("DISC2-19. bufferHandoff.mjs's real provider payload prefers the discovery-audited final_provider_text over the bare caption", () => {
  const src = readFileSync(new URL("../../lib/autonomous/bufferHandoff.mjs", import.meta.url), "utf8");
  assert.match(src, /pkg\.discovery\?\.\s*platform\?\.\s*\[placement\.platform\]\?\.\s*final_provider_text/, "the msg text must be sourced from the discovery final_provider_text when present");
  assert.match(src, /const caption = pkg\.discovery/, "caption assembly must start from the discovery output, falling back to the bare 5B caption");
});

test("DISC2-20. the discovery manifest version is a stable string, not silently mutated per-call", () => {
  const pkg = fixturePkg();
  const a = buildSocialDiscoveryManifest(pkg).manifest.metadata_version;
  const b = buildSocialDiscoveryManifest(pkg).manifest.metadata_version;
  assert.equal(a, b);
  assert.match(a, /^discovery\d/);
});

test("DISC2-21. no code path in this phase's new/changed files edits, cancels, or resubmits the existing live pilot placements", () => {
  const files = ["lib/autonomous/socialStoryEngine.mjs", "lib/autonomous/bufferHandoff.mjs", "scripts/socialDiscovery2Pack.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /6aa131c53df446914da4bd1e|6aa133de26c7fceabc11d6c0/, `${f} must never reference the live pilot provider_refs`);
  }
  // bufferHandoff.mjs legitimately DEFINES cancelBufferPlacementLive
  // (pre-existing, from SOCIAL-AUTOPILOT-2/4) - this phase's new files
  // must never CALL it, which is the real safety property.
  for (const f of ["lib/autonomous/socialStoryEngine.mjs", "scripts/socialDiscovery2Pack.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /cancelBufferPlacementLive\(/, `${f} must never call cancelBufferPlacementLive`);
  }
});

test("DISC2-22. no real Buffer provider call anywhere in the new discovery-2 code", () => {
  const files = ["lib/newsroom/discovery/discoveryQaGate.mjs", "lib/newsroom/discovery/finalCaptionBuilder.mjs", "lib/social/newsroom/discoveryHistory.mjs", "scripts/socialDiscovery2Pack.mjs"];
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /createPost|submitBufferPlacementLive\(/, `${f} must never submit`);
  }
});

test("DISC2-23. no cron / recurring scheduling introduced", () => {
  const src = readFileSync(new URL("../../scripts/socialDiscovery2Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /setInterval|node-cron|vercel\.json/);
});

test("DISC2-24. autopilot remains false / unset by this phase's code", () => {
  const src = readFileSync(new URL("../../scripts/socialDiscovery2Pack.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /SOCIAL_AUTOPILOT_ENABLED\s*=\s*["']true["']/);
});

test("DISC2-25. no Reddit publish anywhere in the new discovery-2 code", () => {
  const src = readFileSync(new URL("../../lib/social/newsroom/discoveryHistory.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /reddit\.com|postToReddit/i);
});

test("DISC2-26. no SEO page generation anywhere in the new discovery-2 code", () => {
  const src = readFileSync(new URL("../../lib/autonomous/socialStoryEngine.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /generateStaticParams|writeFileSync.*app\//);
});

test("DISC2-27. no email changes - discovery-2 code never imports the email/newsletter stack", () => {
  for (const f of ["lib/newsroom/discovery/discoveryQaGate.mjs", "lib/social/newsroom/discoveryHistory.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /resend|newsletter|sendDigest/i);
  }
});

test("DISC2-28. no eBay changes - discovery-2 code never imports Browse/eBay code", () => {
  for (const f of ["lib/newsroom/discovery/discoveryQaGate.mjs", "lib/newsroom/discovery/finalCaptionBuilder.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /ebay|browse-api/i);
  }
});

test("DISC2-29. no creative (5A.1/FULL_GENERATIVE_SOCIAL) redesign - discovery-2 code never imports the generative image pipeline", () => {
  for (const f of ["lib/newsroom/discovery/discoveryQaGate.mjs", "lib/newsroom/discovery/finalCaptionBuilder.mjs", "lib/social/newsroom/discoveryHistory.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /runFullGenerativeSocial|buildMasterPrompt|generateFullSocial/);
  }
});

test("DISC2-30. no video (4C.7) redesign - discovery-2 code never imports rendering internals", () => {
  for (const f of ["lib/newsroom/discovery/discoveryQaGate.mjs", "lib/social/newsroom/discoveryHistory.mjs"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /renderProfessionalSocialLoopToMp4|professionalVideoQa|masterLayeredMotion/);
  }
});

// ---- extra structural coverage ----
test("DISC2-extra. buildDiscoveryCaptionStyle embeds discovery fields into the SAME existing caption_style shape (no schema change)", () => {
  const style = buildDiscoveryCaptionStyle({ captionSha256: "abc", discoveryFields: { family: "market_snapshot", hashtags: ["#Clefairy"] } });
  assert.equal(style.caption_sha256, "abc");
  assert.deepEqual(style.discovery, { family: "market_snapshot", hashtags: ["#Clefairy"] });
});

test("DISC2-extra. recentTagsFor/recentCombosFor derive correctly from persisted rows", () => {
  const rows = [{ hashtags: ["#A", "#B"] }, { hashtags: ["#A"] }];
  assert.deepEqual(recentTagsFor(rows), ["#A", "#B", "#A"]);
  assert.deepEqual(recentCombosFor(rows), [["#A", "#B"], ["#A"]]);
});

test("DISC2-extra. buildFinalPlatformText never truncates the caption itself - only ever drops hashtags", () => {
  const longCaption = "a".repeat(275);
  const built = buildFinalPlatformText("x", longCaption, ["#PokemonTCG", "#Clefairy"]);
  assert.ok(built.text.startsWith(longCaption), "caption text must be fully intact, never truncated");
  assert.equal(built.hashtags_included.length, 0, "no room for hashtags at 275 chars - both correctly dropped, not the caption");
});
