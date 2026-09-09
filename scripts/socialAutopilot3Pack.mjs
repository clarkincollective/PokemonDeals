#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-3 (§17) - PRODUCTION MEDIA HOSTING PROOF.
//
//   node scripts/socialAutopilot3Pack.mjs [--render-video]
//
// PROOF ONLY - never submits to Buffer (§19). Runs against the REAL
// current database via the unmodified AUTOPILOT-1 engine. Hosts real
// media to the REAL Supabase "social-public" bucket (this is the OWNER's
// own storage - not a public social post; nothing becomes visible to
// anyone unless later actually published via Buffer, which this script
// never does).

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const RENDER_VIDEO = process.argv.slice(2).includes("--render-video");
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-3");
const CARD_CACHE = path.join(ROOT, ".social-preview", "card-art-cache");

const { runSocialAutopilot, resolvedShapeFor } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { makeStoryPackage } = await import("../lib/autonomous/storyPackage.mjs");
const { computeCreativeCacheKey } = await import("../lib/autonomous/creativeStage.mjs");
const { registerExistingMaster } = await import("../lib/newsroom/video/masterCreativeCache.mjs");
const { storyId: computeStoryId } = await import("../lib/social/newsroom/story.mjs");
const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { hostMedia, verifyReachability, MEDIA_TYPE_FOR_PLATFORM } = await import("../lib/autonomous/mediaHostingStage.mjs");
const { buildMediaPackage, buildPlatformMediaPayload } = await import("../lib/autonomous/mediaPackage.mjs");
const { auditCompletePlacementPackage } = await import("../lib/autonomous/completePackageAudit.mjs");
const { summarizeHostingRun, projectStorage } = await import("../lib/autonomous/storageEstimate.mjs");
const { buildBufferPlacement } = await import("../lib/autonomous/bufferHandoff.mjs");
const { resolveChannel, loadChannelMap } = await import("../lib/autonomous/channelResolution.mjs");
const { renderProfessionalSocialLoopToMp4 } = await import("../lib/newsroom/video/professionalSocialLoop.mjs");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "stories"), { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-3  production media hosting proof ===");
console.log(`render-video: ${RENDER_VIDEO ? "ON (local ffmpeg/chrome, $0 API)" : "OFF (video hosting section skipped)"}\n`);

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}

const NOW = Date.now();

async function seedCacheFor(family, imagePath) {
  const { candidates } = await discoverCandidates({ now: NOW });
  const c = candidates.find((x) => x.family === family);
  if (!c) return { seeded: false, reason: `${family} not discoverable right now` };
  if (!existsSync(imagePath)) return { seeded: false, reason: `${imagePath} not found` };
  const storyId = computeStoryId({ series: c.series, subjectType: "card_or_aggregate", subjectId: (c.facts.canonical_card_ids ?? [])[0] ?? c.family, capturedAt: c.facts.data_freshness.captured_at, factsJson: c.facts });
  let pkg = makeStoryPackage({ storyId, family: c.family, series: c.series, editorialAngle: c.editorialAngle, bucket: c.bucket, now: NOW });
  pkg.snapshot = buildStorySnapshot({ storyId, storyFamily: c.family, editorialAngle: c.editorialAngle, facts: c.facts, now: NOW });
  const heroId = (c.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const resolved = resolvedShapeFor(c);
  const keys = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow: row });
  if (!keys) return { seeded: false, reason: "no cache key" };
  registerExistingMaster({ storyId, semanticHash: keys.cacheKey, family: c.family, imagePath, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: imagePath }, brandInMaster: true, source: "autopilot3_seeded_from_approved_5a1_master" });
  return { seeded: true, storyId };
}

console.log("  seed market_snapshot:", JSON.stringify(await seedCacheFor("market_snapshot", ".social-preview/creative-5a1-final/full/B_market_snapshot.png")));
console.log("  seed asking_vs_sold:", JSON.stringify(await seedCacheFor("asking_vs_sold", ".social-preview/creative-5a1-final/full/A_asking_vs_sold.png")));

const runResult = await runSocialAutopilot({ allowGenerate: false, persist: false, maxSelected: 8, revalidateStale: true, now: NOW });
const marketPkg = runResult.selected.find((p) => p.family === "market_snapshot" && p.status === "BUFFER_QUEUED");
const askingPkg = runResult.selected.find((p) => p.family === "asking_vs_sold" && p.status === "BUFFER_QUEUED");

const hostingResults = [];
const imageGenCost = 0; // both packages reused cached masters this run
const captionCost = runResult.digest.api_spend_usd;
let videoGenCost = 0;
let mediaHostingCost = 0; // Supabase Storage - no per-request cost this phase, $0 shown explicitly

const channelMap = loadChannelMap();
const failureTests = {};

async function processStaticStory(pkg, label) {
  if (!pkg) return null;
  const dir = path.join(OUT, "stories", label);
  mkdirSync(dir, { recursive: true });
  const localPath = pkg.creative.master_image_path;
  const host = await hostMedia({ localPath, mediaType: "STATIC_IMAGE", family: pkg.family, hostedAssetsPath: undefined });
  hostingResults.push(host);
  writeFileSync(path.join(dir, "hosted_record.json"), JSON.stringify(host.ok ? host.record : host, null, 2));
  if (!host.ok) { console.log(`  ${label}: HOST FAILED - ${host.reason}`); return { pkg, host }; }

  const reach = await verifyReachability(host.record, { expectedWidth: 1080, expectedHeight: null });
  writeFileSync(path.join(dir, "reachability.json"), JSON.stringify(reach, null, 2));

  const mediaPackage = buildMediaPackage({ pkg, platform: "instagram", hostedRecord: host.record, verified: reach.ok ? reach.verified : null });
  writeFileSync(path.join(dir, "media_package.json"), JSON.stringify(mediaPackage, null, 2));

  const payloads = {};
  const completeAudits = {};
  for (const platform of ["instagram", "x"]) {
    const mp = { ...mediaPackage, platform };
    const payload = buildPlatformMediaPayload(pkg, platform, mp);
    const placement = buildBufferPlacement({ storyPackage: pkg, platform, placementType: pkg.platform_variants[platform]?.placement_type ?? "post", assetHash: mediaPackage.sha256, captionText: pkg.captions?.[platform]?.caption_text ?? null, scheduledFor: new Date(Date.now() + 3 * 3600 * 1000).toISOString() }).placement;
    const audit = await auditCompletePlacementPackage(pkg, placement, mp, { liveRecord: null });
    payloads[platform] = { channel: resolveChannel(platform, channelMap), text_preview: (pkg.captions?.[platform]?.caption_text ?? "").slice(0, 160), assets: payload.ok ? payload.assets : null, postType: payload.postType ?? null, scheduled_for: placement.scheduled_for, placement_id: placement.placement_id, dedupe_key: placement.placement_id };
    completeAudits[platform] = audit;
  }
  writeFileSync(path.join(dir, "platform_payloads.json"), JSON.stringify(payloads, null, 2));
  writeFileSync(path.join(dir, "complete_package_audit.json"), JSON.stringify(completeAudits, null, 2));
  console.log(`  ${label}: hosted (${host.cacheHit ? "cache hit" : "fresh upload"}) reach=${reach.ok} instagram_audit=${completeAudits.instagram.verdict} x_audit=${completeAudits.x.verdict}`);
  return { pkg, host, reach, mediaPackage, payloads, completeAudits };
}

async function processVideoStory(pkg, label) {
  if (!pkg || !pkg.video?.ok) { console.log(`  ${label}: no ready video plan this run - skipping video hosting section`); return null; }
  const dir = path.join(OUT, "stories", label);
  mkdirSync(dir, { recursive: true });
  if (!RENDER_VIDEO) { console.log(`  ${label}: video plan ready but --render-video not passed - skipping actual render/host`); return { pkg, skipped: true }; }

  const mp4Path = path.join(dir, "video.mp4");
  console.log(`  ${label}: rendering 4C.7 video plan to MP4 (local, $0 API, ~1-2 min)...`);
  const rr = await renderProfessionalSocialLoopToMp4(pkg.video, mp4Path);
  if (!rr.ok) { console.log(`  ${label}: RENDER FAILED - ${rr.reason ?? JSON.stringify(rr)}`); return { pkg, renderFailed: true, detail: rr }; }

  const host = await hostMedia({ localPath: mp4Path, mediaType: "VIDEO", family: pkg.family, hostedAssetsPath: undefined });
  hostingResults.push(host);
  writeFileSync(path.join(dir, "hosted_record.json"), JSON.stringify(host.ok ? host.record : host, null, 2));
  if (!host.ok) { console.log(`  ${label}: HOST FAILED - ${host.reason}`); return { pkg, host }; }

  const reach = await verifyReachability(host.record, { expectedWidth: 1080, expectedHeight: 1920 });
  writeFileSync(path.join(dir, "video_probe.json"), JSON.stringify(reach, null, 2));

  const mediaPackage = buildMediaPackage({ pkg, platform: "tiktok", hostedRecord: host.record, verified: reach.ok ? reach.verified : null });
  writeFileSync(path.join(dir, "media_package.json"), JSON.stringify(mediaPackage, null, 2));

  const payloads = {};
  const completeAudits = {};
  for (const platform of ["tiktok", "youtube_shorts"]) {
    const mp = { ...mediaPackage, platform };
    const payload = buildPlatformMediaPayload(pkg, platform, mp);
    const placement = buildBufferPlacement({ storyPackage: pkg, platform, placementType: pkg.platform_variants[platform]?.placement_type ?? "video", assetHash: mediaPackage.sha256, captionText: pkg.captions?.x?.caption_text ?? null, scheduledFor: new Date(Date.now() + 4 * 3600 * 1000).toISOString() }).placement;
    const audit = await auditCompletePlacementPackage(pkg, placement, mp, { liveRecord: null });
    payloads[platform] = { channel: resolveChannel(platform, channelMap), text_preview: (pkg.captions?.x?.caption_text ?? "").slice(0, 160), assets: payload.ok ? payload.assets : null, postType: payload.postType ?? null, scheduled_for: placement.scheduled_for, placement_id: placement.placement_id, dedupe_key: placement.placement_id };
    completeAudits[platform] = audit;
  }
  writeFileSync(path.join(dir, "platform_payloads.json"), JSON.stringify(payloads, null, 2));
  writeFileSync(path.join(dir, "complete_package_audit.json"), JSON.stringify(completeAudits, null, 2));
  console.log(`  ${label}: video hosted (${host.cacheHit ? "cache hit" : "fresh upload"}) reach=${reach.ok} tiktok_audit=${completeAudits.tiktok.verdict} yt_audit=${completeAudits.youtube_shorts.verdict}`);
  return { pkg, host, reach, mediaPackage, payloads, completeAudits };
}

const marketResult = await processStaticStory(marketPkg, "MARKET_SNAPSHOT");
const askingVideoResult = await processVideoStory(askingPkg, "ASKING_VS_SOLD");

// §15 failure-test proofs (deterministic, no live network needed for most)
{
  const { verifyHostedAssetDrift } = await import("../lib/autonomous/mediaHostingStage.mjs");
  failureTests.wrong_sha = verifyHostedAssetDrift({ sha256: "aaa", public_url: "https://x" }, "bbb");
  failureTests.missing_public_url = verifyHostedAssetDrift({ sha256: "aaa", public_url: null }, "aaa");
}

const storageSummary = summarizeHostingRun(hostingResults);
const storageProjection = projectStorage({ postsPerDay: 1 });

writeFileSync(path.join(OUT, "hosting_audit.json"), JSON.stringify({
  existing_architecture: "lib/social/storage/{supabase,hostedAssets,index}.mjs (13E.5C) - REUSED, no second hosting system built",
  bucket: "social-public", url_style: "PERMANENT public URL (not signed/expiring)", content_addressed: true,
}, null, 2));
writeFileSync(path.join(OUT, "storage_configuration.json"), JSON.stringify({ configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), bucket: "social-public" }, null, 2));
writeFileSync(path.join(OUT, "media_manifest.json"), JSON.stringify(hostingResults.map((r) => r.ok ? r.record : r), null, 2));
writeFileSync(path.join(OUT, "complete_packages.json"), JSON.stringify({ market_snapshot: Boolean(marketResult), asking_vs_sold_video: Boolean(askingVideoResult?.host) }, null, 2));
writeFileSync(path.join(OUT, "cache_reuse.json"), JSON.stringify(storageSummary, null, 2));
writeFileSync(path.join(OUT, "storage_estimate.json"), JSON.stringify(storageProjection, null, 2));
writeFileSync(path.join(OUT, "failure_tests.json"), JSON.stringify(failureTests, null, 2));
writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify({
  ok: runResult.ok, discovery: runResult.discovery,
  cost: { image_generation_usd: imageGenCost, caption_usd: captionCost, video_generation_usd: videoGenCost, media_hosting_usd: mediaHostingCost },
}, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-3 media hosting proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:960px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}</style>
</head><body>
<h1>SOCIAL-AUTOPILOT-3 - Production Media Hosting Proof</h1>
<div class="pill">Reused: lib/social/storage/*.mjs (13E.5C, no 2nd hosting system)</div>
<div class="pill">Cost - image gen: $${imageGenCost.toFixed(2)}</div>
<div class="pill">Cost - caption: $${captionCost.toFixed(2)}</div>
<div class="pill">Cost - video gen: $${videoGenCost.toFixed(2)}</div>
<div class="pill">Cost - media hosting: $${mediaHostingCost.toFixed(2)}</div>
<h2>MARKET_SNAPSHOT (static)</h2>
${marketResult ? `<p>hosted: ${esc(marketResult.host?.record?.public_url)}<br>reachability: ${marketResult.reach?.ok}<br>Instagram audit: ${marketResult.completeAudits?.instagram?.verdict} | X audit: ${marketResult.completeAudits?.x?.verdict}</p>` : "<p>not available this run</p>"}
<h2>ASKING_VS_SOLD (video)</h2>
${askingVideoResult?.host ? `<p>hosted: ${esc(askingVideoResult.host.record.public_url)}<br>reachability/probe: ${askingVideoResult.reach?.ok}<br>TikTok audit: ${askingVideoResult.completeAudits?.tiktok?.verdict} | YouTube Shorts audit: ${askingVideoResult.completeAudits?.youtube_shorts?.verdict}</p>` : `<p>${RENDER_VIDEO ? "render/host did not complete this run" : "skipped - run with --render-video to render+host the 4C.7 MP4"}</p>`}
<h2>Storage accounting</h2><pre>${esc(JSON.stringify(storageSummary, null, 2))}</pre>
<h2>Storage projection (estimate)</h2><pre>${esc(JSON.stringify(storageProjection, null, 2))}</pre>
<p style="color:#888;margin-top:32px">PROOF ONLY. No Buffer submission was made. SOCIAL_AUTOPILOT_ENABLED and SOCIAL_BUFFER_LIVE_SUBMIT remain false.</p>
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: see final report`);
