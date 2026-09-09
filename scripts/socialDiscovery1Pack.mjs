#!/usr/bin/env node
// Phase SOCIAL-DISCOVERY-1 (SS33/SS34) - DISCOVERY ENGINE PROOF PACK.
//
//   node scripts/socialDiscovery1Pack.mjs
//
// Real DB-backed proof for MARKET_SNAPSHOT + ASKING_VS_SOLD (required),
// plus DEAL_DROP + THREE_UNDER_25 when a real candidate currently
// qualifies. Read-only DB, no Buffer, no cron, no publish. Each story
// runs as its own fully isolated flow (discover -> seed -> runOnePackage)
// rather than a shared loop, matching the reliable pattern already
// established by every other proof script this session.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-discovery-1");
const SAFE_ASSET_PATH = path.join(ROOT, ".social-preview", "social-safearea-1.1", "AFTER_120PLUS.png");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-DISCOVERY-1 - platform SEO / keywords / hashtags / audience proof ===\n");

const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { runOnePackage, resolvedShapeFor } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { makeStoryPackage } = await import("../lib/autonomous/storyPackage.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { computeCreativeCacheKey } = await import("../lib/autonomous/creativeStage.mjs");
const { registerExistingMaster } = await import("../lib/newsroom/video/masterCreativeCache.mjs");
const { storyId: computeStoryId } = await import("../lib/social/newsroom/story.mjs");
const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildSocialDiscoveryManifest, persistenceShape } = await import("../lib/newsroom/discovery/discoveryManifest.mjs");

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}

async function runOneStory(family) {
  const NOW = Date.now();
  const { candidates } = await discoverCandidates({ now: NOW });
  const cand = candidates.find((c) => c.family === family);
  if (!cand) return { available: false };
  const heroId = (cand.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const storyIdForSeed = computeStoryId({ series: cand.series, subjectType: "card_or_aggregate", subjectId: heroId ?? cand.family, capturedAt: cand.facts.data_freshness.captured_at, factsJson: cand.facts });
  const seedPkg = makeStoryPackage({ storyId: storyIdForSeed, family: cand.family, series: cand.series, editorialAngle: cand.editorialAngle, bucket: cand.bucket, now: NOW });
  seedPkg.snapshot = buildStorySnapshot({ storyId: storyIdForSeed, storyFamily: cand.family, editorialAngle: cand.editorialAngle, facts: cand.facts, now: NOW });
  const resolved = resolvedShapeFor(cand);
  const keys = computeCreativeCacheKey(seedPkg, { resolved, cardCatalogRow: row });
  if (keys && existsSync(SAFE_ASSET_PATH)) {
    registerExistingMaster({ storyId: storyIdForSeed, semanticHash: keys.cacheKey, family: cand.family, imagePath: SAFE_ASSET_PATH, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: SAFE_ASSET_PATH }, brandInMaster: true, source: "discovery1_proof" });
  }
  cand.scored = { overall: 1, why_selected: "SOCIAL-DISCOVERY-1 proof run" };
  cand.diversity = { hard_check: { ok: true, reasons: [] } };
  const pkg = await runOnePackage(cand, { env: process.env, allowGenerate: false, spentTodayUsd: 0, recentPlacementIds: new Set(), revalidateStale: false, now: NOW });
  if (pkg.status !== "BUFFER_QUEUED") return { available: true, queued: false, status: pkg.status, reason: pkg.qa };
  const result = buildSocialDiscoveryManifest(pkg, { now: NOW });
  return { available: true, queued: true, pkg, result };
}

const FAMILIES = ["market_snapshot", "asking_vs_sold", "deal_drop", "three_under_25"];
const proofs = {};
for (const family of FAMILIES) {
  console.log(`--- ${family} ---`);
  // eslint-disable-next-line no-await-in-loop
  const r = await runOneStory(family);
  proofs[family] = r;
  if (!r.available) { console.log("  NOT AVAILABLE from live discovery this run.\n"); continue; }
  if (!r.queued) { console.log(`  did not reach BUFFER_QUEUED: ${r.status}\n`); continue; }
  console.log(`  story_id: ${r.pkg.story_id}`);
  console.log(`  discovery ok: ${r.result.ok}${r.result.findings.length ? " findings: " + JSON.stringify(r.result.findings) : ""}`);
  console.log(`  primary_search_query: ${r.result.manifest.primary_search_query}`);
  console.log(`  route: ${r.result.manifest.related_site_route}`);
  console.log(`  growth_score: ${r.result.manifest.growth_potential_score}`);
  console.log(`  IG hashtags: ${JSON.stringify(r.result.platform.instagram.hashtags)} (ok=${r.result.platform.instagram.audit.ok})`);
  console.log(`  X: ${r.result.platform.x.audit.length_chars} chars (ok=${r.result.platform.x.audit.ok})`);
  console.log(`  TikTok: ${r.result.platform.tiktok.audit.length_chars} chars (ok=${r.result.platform.tiktok.audit.ok})`);
  console.log(`  YouTube title: "${r.result.platform.youtube_shorts.title}" (${r.result.platform.youtube_shorts.audit.title_length} chars)\n`);
}

// ---- write proof pack -----------------------------------------------
const REQUIRED = ["market_snapshot", "asking_vs_sold"];
for (const fam of REQUIRED) {
  if (!proofs[fam]?.queued) { console.log(`FATAL: required proof story "${fam}" did not produce a queued package - cannot complete the required proof.`); process.exit(1); }
}

const manifestsOut = {};
const keywordScoresOut = {};
const audienceOut = {};
const hashtagCandidatesOut = {};
const hashtagRotationOut = {};
const growthOut = {};

for (const [family, r] of Object.entries(proofs)) {
  if (!r.queued) continue;
  const famDir = path.join(OUT, family);
  mkdirSync(famDir, { recursive: true });
  manifestsOut[family] = r.result.manifest;
  keywordScoresOut[family] = r.result.audit.keyword_scores;
  audienceOut[family] = { primary: r.result.manifest.primary_audience, secondary: r.result.manifest.secondary_audience, segments: r.result.manifest.audience_segments };
  hashtagCandidatesOut[family] = { instagram: r.result.platform.instagram.hashtags, x: r.result.platform.x.hashtags, tiktok: r.result.platform.tiktok.hashtags, youtube_shorts: r.result.platform.youtube_shorts.hashtags };
  hashtagRotationOut[family] = "no persisted rotation history supplied this run (recentTags defaults empty) - selectHashtags()/scoreHashtagCombo() rotation scoring is real and unit-tested; live historical wiring is a follow-up once placement hashtag history exists";
  growthOut[family] = r.result.growth;

  writeFileSync(path.join(famDir, "instagram.json"), JSON.stringify(r.result.platform.instagram, null, 2));
  writeFileSync(path.join(famDir, "x.json"), JSON.stringify(r.result.platform.x, null, 2));
  writeFileSync(path.join(famDir, "tiktok.json"), JSON.stringify(r.result.platform.tiktok, null, 2));
  writeFileSync(path.join(famDir, "youtube_shorts.json"), JSON.stringify(r.result.platform.youtube_shorts, null, 2));
  writeFileSync(path.join(famDir, "discovery_manifest.json"), JSON.stringify(r.result.manifest, null, 2));
  writeFileSync(path.join(famDir, "persistence_shape.json"), JSON.stringify(persistenceShape(r.result), null, 2));
}

writeFileSync(path.join(OUT, "discovery_manifest.json"), JSON.stringify(manifestsOut, null, 2));
writeFileSync(path.join(OUT, "keyword_scores.json"), JSON.stringify(keywordScoresOut, null, 2));
writeFileSync(path.join(OUT, "audience_map.json"), JSON.stringify(audienceOut, null, 2));
writeFileSync(path.join(OUT, "hashtag_candidates.json"), JSON.stringify(hashtagCandidatesOut, null, 2));
writeFileSync(path.join(OUT, "hashtag_rotation.json"), JSON.stringify(hashtagRotationOut, null, 2));
writeFileSync(path.join(OUT, "growth_scores.json"), JSON.stringify(growthOut, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
function platformCard(label, p) {
  if (!p) return "";
  const text = p.caption ?? p.title ?? "";
  return `<div class="pcard"><h4>${esc(label)}</h4><div class="mono">${esc(text)}</div>
  <div class="row"><span class="chip">audience: ${esc(p.target_audience)}</span><span class="chip">route: ${esc(p.related_site_route)}</span><span class="chip ${p.audit?.ok ? "good" : "bad"}">audit: ${p.audit?.ok ? "PASS" : "FAIL"}</span></div>
  <div class="row">${(p.hashtags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>`;
}
let storiesHtml = "";
for (const [family, r] of Object.entries(proofs)) {
  if (!r.queued) continue;
  storiesHtml += `<h2>${esc(family)} - ${esc(r.pkg.story_id)}</h2>
  <div class="pill">growth: ${r.result.manifest.growth_potential_score}/100</div>
  <div class="pill">primary query: ${esc(r.result.manifest.primary_search_query)}</div>
  <div class="pill">entities: ${esc([...r.result.manifest.pokemon_entities, ...r.result.manifest.card_entities].join(", "))}</div>
  <div class="grid">
  ${platformCard("Instagram", r.result.platform.instagram)}
  ${platformCard("X", r.result.platform.x)}
  ${platformCard("TikTok", r.result.platform.tiktok)}
  ${platformCard("YouTube Shorts", r.result.platform.youtube_shorts)}
  </div>`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-DISCOVERY-1 proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:1300px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin:12px 0 30px}
.pcard{background:#15151a;border:1px solid #2a2a30;border-radius:10px;padding:14px}
.mono{white-space:pre-wrap;font-size:13px;background:#1a1a1f;padding:10px;border-radius:6px;margin:8px 0}
.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px;font-size:13px}
.chip{display:inline-block;background:#222;border-radius:6px;padding:2px 8px;margin:2px;font-size:11px}
.chip.good{color:#3fb27f}.chip.bad{color:#e8493d}
.tag{display:inline-block;background:#22303f;color:#7ec8ff;border-radius:6px;padding:2px 8px;margin:2px;font-size:12px}
h1{color:#e8493d}h2{border-top:1px solid #333;padding-top:20px;margin-top:24px}</style></head><body>
<h1>SOCIAL-DISCOVERY-1 - Platform SEO / Keywords / Hashtags / Audience Targeting</h1>
<p>Same story, four platform-native packages - not one caption truncated four ways.</p>
${storiesHtml}
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
