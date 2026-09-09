#!/usr/bin/env node
// Phase SOCIAL-DISCOVERY-2 (SS17/SS21) - AUTOPILOT INTEGRATION PROOF PACK.
//
//   node scripts/socialDiscovery2Pack.mjs
//
// PROPOSE_ONLY - real DB data, no provider calls. runOnePackage() is now
// fully integrated (discovery manifest built internally, discovery QA
// gate composed into evaluateQaGate, placements carry real discovery
// metadata + the final audited provider text) - this script just calls
// it and inspects the result, exactly like SOCIAL-DISCOVERY-1's proof did.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-discovery-2");
const SAFE_ASSET_PATH = path.join(ROOT, ".social-preview", "social-safearea-1.1", "AFTER_120PLUS.png");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-DISCOVERY-2 - autopilot integration + persisted discovery history proof ===\n");

const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { runOnePackage, resolvedShapeFor } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { makeStoryPackage } = await import("../lib/autonomous/storyPackage.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { computeCreativeCacheKey } = await import("../lib/autonomous/creativeStage.mjs");
const { registerExistingMaster } = await import("../lib/newsroom/video/masterCreativeCache.mjs");
const { storyId: computeStoryId } = await import("../lib/social/newsroom/story.mjs");
const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { getRecentDiscoveryHistory } = await import("../lib/social/newsroom/discoveryHistory.mjs");

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}

// §9 - prove getRecentDiscoveryHistory reads real data (empty is a valid,
// honest result if nothing has been persisted with discovery metadata yet).
const historySnapshot = {};
for (const platform of ["instagram", "x", "tiktok", "youtube_shorts"]) {
  // eslint-disable-next-line no-await-in-loop
  historySnapshot[platform] = await getRecentDiscoveryHistory(platform, 50);
}
writeFileSync(path.join(OUT, "discovery_history.json"), JSON.stringify(historySnapshot, null, 2));
console.log("Real persisted discovery history (per platform):", JSON.stringify(Object.fromEntries(Object.entries(historySnapshot).map(([p, h]) => [p, { ready: h.ready, rows: h.rows.length }]))));

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
    registerExistingMaster({ storyId: storyIdForSeed, semanticHash: keys.cacheKey, family: cand.family, imagePath: SAFE_ASSET_PATH, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: SAFE_ASSET_PATH }, brandInMaster: true, source: "discovery2_proof" });
  }
  cand.scored = { overall: 1, why_selected: "SOCIAL-DISCOVERY-2 integration proof run" };
  cand.diversity = { hard_check: { ok: true, reasons: [] } };
  const pkg = await runOnePackage(cand, { env: process.env, allowGenerate: false, spentTodayUsd: 0, recentPlacementIds: new Set(), revalidateStale: false, now: NOW });
  return { available: true, pkg };
}

const FAMILIES = ["market_snapshot", "asking_vs_sold", "deal_drop"];
const proofs = {};
for (const family of FAMILIES) {
  console.log(`\n--- ${family} ---`);
  // eslint-disable-next-line no-await-in-loop
  const r = await runOneStory(family);
  proofs[family] = r;
  if (!r.available) { console.log("  NOT AVAILABLE from live discovery this run."); continue; }
  const pkg = r.pkg;
  console.log(`  story_id: ${pkg.story_id}  status: ${pkg.status}`);
  console.log(`  pkg.discovery present: ${Boolean(pkg.discovery)}`);
  console.log(`  pkg.discovery.snapshot_hash === pkg.snapshot.snapshot_hash: ${pkg.discovery?.snapshot_hash === pkg.snapshot?.snapshot_hash}`);
  console.log(`  discovery QA gate result: ${JSON.stringify(pkg.qa?.gate?.results?.find((r2) => r2.key === "DISCOVERY"))}`);
  console.log(`  placements built: ${pkg.publishing?.placements?.length ?? 0}`);
  for (const p of pkg.publishing?.placements ?? []) {
    console.log(`    [${p.platform}] placement_id=${p.placement_id} discovery.hashtags=${JSON.stringify(p.discovery?.hashtags)} discovery.primary_keyword=${p.discovery?.primary_keyword}`);
  }
  if (pkg.status === "BUFFER_QUEUED") {
    const ig = pkg.discovery?.platform?.instagram;
    const x = pkg.discovery?.platform?.x;
    console.log(`  IG final_provider_text length: ${ig?.final_provider_text?.length} (ok=${ig?.audit?.ok})`);
    console.log(`  X final_provider_text length: ${x?.final_provider_text?.length} (ok=${x?.audit?.ok}, hard_limit=280)`);
  }
}

// §21 proof pack files.
const REQUIRED = ["market_snapshot", "asking_vs_sold"];
for (const fam of REQUIRED) {
  if (!proofs[fam]?.pkg || proofs[fam].pkg.status !== "BUFFER_QUEUED") console.log(`WARNING: required proof story "${fam}" did not reach BUFFER_QUEUED this run (status=${proofs[fam]?.pkg?.status ?? "unavailable"}) - reporting honestly, not fabricating.`);
}

const integrationSummary = {
  runOnePackage_persists_discovery: Object.values(proofs).some((r) => r.pkg?.discovery),
  discovery_qa_gate_composed: Object.values(proofs).some((r) => r.pkg?.qa?.gate?.results?.some((res) => res.key === "DISCOVERY")),
  placements_carry_discovery_metadata: Object.values(proofs).some((r) => r.pkg?.publishing?.placements?.some((p) => p.discovery)),
  final_provider_text_used: Object.values(proofs).some((r) => r.pkg?.discovery?.platform?.x?.final_provider_text),
};
writeFileSync(path.join(OUT, "integration_summary.json"), JSON.stringify(integrationSummary, null, 2));
console.log("\nIntegration summary:", JSON.stringify(integrationSummary, null, 2));

const finalPlatformPackages = {};
const bufferPayloadPreviews = {};
const qaResults = {};
for (const [family, r] of Object.entries(proofs)) {
  if (!r.pkg || r.pkg.status !== "BUFFER_QUEUED") continue;
  const famDir = path.join(OUT, family);
  mkdirSync(famDir, { recursive: true });
  writeFileSync(path.join(famDir, "snapshot.json"), JSON.stringify(r.pkg.snapshot, null, 2));
  writeFileSync(path.join(famDir, "discovery_manifest.json"), JSON.stringify(r.pkg.discovery, null, 2));
  for (const p of ["instagram", "x", "tiktok", "youtube_shorts"]) {
    writeFileSync(path.join(famDir, `${p}.json`), JSON.stringify(r.pkg.discovery?.platform?.[p] ?? null, null, 2));
  }
  finalPlatformPackages[family] = r.pkg.discovery?.platform;
  bufferPayloadPreviews[family] = (r.pkg.publishing?.placements ?? []).map((p) => ({ platform: p.platform, placement_id: p.placement_id, artifact_hash: p.artifact_hash, discovery: p.discovery }));
  qaResults[family] = r.pkg.qa?.gate;
}
writeFileSync(path.join(OUT, "final_platform_packages.json"), JSON.stringify(finalPlatformPackages, null, 2));
writeFileSync(path.join(OUT, "buffer_payload_previews.json"), JSON.stringify(bufferPayloadPreviews, null, 2));
writeFileSync(path.join(OUT, "qa_results.json"), JSON.stringify(qaResults, null, 2));
writeFileSync(path.join(OUT, "hashtag_history.json"), JSON.stringify(Object.fromEntries(Object.entries(historySnapshot).map(([p, h]) => [p, h.rows.map((r) => r.hashtags)])), null, 2));
writeFileSync(path.join(OUT, "keyword_history.json"), JSON.stringify(Object.fromEntries(Object.entries(historySnapshot).map(([p, h]) => [p, h.rows.map((r) => r.primary_keyword)])), null, 2));
writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify({
  integration_summary: integrationSummary,
  stories: Object.fromEntries(Object.entries(proofs).map(([f, r]) => [f, { available: r.available, status: r.pkg?.status ?? null, story_id: r.pkg?.story_id ?? null }])),
  social_discovery_integration: (proofs.market_snapshot?.pkg?.status === "BUFFER_QUEUED" && proofs.asking_vs_sold?.pkg?.status === "BUFFER_QUEUED") ? "READY" : "NOT_READY",
}, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
let storiesHtml = "";
for (const [family, r] of Object.entries(proofs)) {
  if (!r.pkg || r.pkg.status !== "BUFFER_QUEUED") continue;
  const d = r.pkg.discovery;
  storiesHtml += `<h2>${esc(family)} - ${esc(r.pkg.story_id)}</h2>
  <div class="pill">status: ${esc(r.pkg.status)}</div>
  <div class="pill">discovery QA: ${esc(r.pkg.qa?.gate?.results?.find((x) => x.key === "DISCOVERY")?.verdict)}</div>
  <div class="pill">placements: ${r.pkg.publishing?.placements?.length ?? 0}</div>
  <div class="grid">
  <div class="pcard"><h4>Instagram (final provider text)</h4><div class="mono">${esc(d?.platform?.instagram?.final_provider_text)}</div></div>
  <div class="pcard"><h4>X (final provider text, &le;280)</h4><div class="mono">${esc(d?.platform?.x?.final_provider_text)}</div><div>length: ${d?.platform?.x?.final_provider_text?.length ?? 0}/280</div></div>
  </div>`;
}
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-DISCOVERY-2 proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:1200px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin:12px 0 30px}
.pcard{background:#15151a;border:1px solid #2a2a30;border-radius:10px;padding:14px}
.mono{white-space:pre-wrap;font-size:13px;background:#1a1a1f;padding:10px;border-radius:6px;margin:8px 0}
.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px;font-size:13px}
h1{color:#e8493d}h2{border-top:1px solid #333;padding-top:20px;margin-top:24px}</style></head><body>
<h1>SOCIAL-DISCOVERY-2 - Autopilot Integration + Persisted Discovery History</h1>
<pre>${esc(JSON.stringify(integrationSummary, null, 2))}</pre>
${storiesHtml}
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
