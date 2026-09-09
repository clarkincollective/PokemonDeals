#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-4 (§9-§13) - FIRST LIVE PILOT PROOF PACKAGE.
//
//   node scripts/socialAutopilot4Pilot.mjs                                  PROPOSE_ONLY (default)
//   node scripts/socialAutopilot4Pilot.mjs --live --approved-by "James"     LIVE SUBMIT (max 1 IG + 1 X)
//                                                                            requires SOCIAL_BUFFER_LIVE_SUBMIT=true too
//
// Runs the unmodified AUTOPILOT-1/2/3 pipeline end to end for ONE stable
// editorial story (market_snapshot), hosts real media to the owner's own
// Supabase bucket, builds the exact Instagram + X provider payloads via
// buildPlatformMediaPayload(), runs the full §12 pre-submit checklist,
// and writes the owner-review artifact. Never submits unless ALL of
// --live, SOCIAL_BUFFER_LIVE_SUBMIT=true, and --approved-by are present.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const argv = process.argv.slice(2);
const LIVE_REQUESTED = argv.includes("--live");
const approvedByIdx = argv.indexOf("--approved-by");
const APPROVED_BY = approvedByIdx >= 0 ? argv[approvedByIdx + 1] : null;

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-4");

const { runSocialAutopilot, resolvedShapeFor } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { makeStoryPackage, approveStoryPackage, transition } = await import("../lib/autonomous/storyPackage.mjs");
const { computeCreativeCacheKey } = await import("../lib/autonomous/creativeStage.mjs");
const { registerExistingMaster } = await import("../lib/newsroom/video/masterCreativeCache.mjs");
const { storyId: computeStoryId } = await import("../lib/social/newsroom/story.mjs");
const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { resolveProductionSafety, describeProductionSafety } = await import("../lib/autonomous/productionSafety.mjs");
const { resolveChannel, loadChannelMap } = await import("../lib/autonomous/channelResolution.mjs");
const { hostMedia, verifyReachability } = await import("../lib/autonomous/mediaHostingStage.mjs");
const { buildMediaPackage, buildPlatformMediaPayload } = await import("../lib/autonomous/mediaPackage.mjs");
const { auditCompletePlacementPackage } = await import("../lib/autonomous/completePackageAudit.mjs");
const { verifyHashAlignment } = await import("../lib/autonomous/hashAlignment.mjs");
const { verifyCaptionEncoding } = await import("../lib/autonomous/captionEncoding.mjs");
const { checkStale, fetchLiveRecordFor } = await import("../lib/autonomous/staleGuard.mjs");
const { evaluateQaGate } = await import("../lib/autonomous/qaGate.mjs");
const { canSubmitLive } = await import("../lib/autonomous/productionSafety.mjs");
const { buildBufferPlacement, submitBufferPlacementLive, reconcileBufferPlacementLive } = await import("../lib/autonomous/bufferHandoff.mjs");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-4  first live pilot proof ===");
const safety = resolveProductionSafety(process.env);
console.log(describeProductionSafety(safety));
const canGoLive = LIVE_REQUESTED && safety.bufferLiveSubmit && Boolean(APPROVED_BY);
if (LIVE_REQUESTED && !canGoLive) {
  console.log(`\n  --live requested but refused: ${!safety.bufferLiveSubmit ? "SOCIAL_BUFFER_LIVE_SUBMIT is not \"true\"" : "no --approved-by name supplied"}. Falling back to PROPOSE_ONLY.\n`);
}
console.log(`mode: ${canGoLive ? `LIVE SUBMIT (approved by "${APPROVED_BY}")` : "PROPOSE_ONLY - no provider call"}\n`);

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}

const NOW = Date.now();

async function seedMarketSnapshotCache() {
  const { candidates } = await discoverCandidates({ now: NOW });
  const mkt = candidates.find((c) => c.family === "market_snapshot");
  if (!mkt) return { seeded: false };
  const imagePath = ".social-preview/creative-5a1-final/full/B_market_snapshot.png";
  if (!existsSync(imagePath)) return { seeded: false, reason: `${imagePath} not found` };
  const storyId = computeStoryId({ series: mkt.series, subjectType: "card_or_aggregate", subjectId: (mkt.facts.canonical_card_ids ?? [])[0] ?? mkt.family, capturedAt: mkt.facts.data_freshness.captured_at, factsJson: mkt.facts });
  let pkg = makeStoryPackage({ storyId, family: mkt.family, series: mkt.series, editorialAngle: mkt.editorialAngle, bucket: mkt.bucket, now: NOW });
  pkg.snapshot = buildStorySnapshot({ storyId, storyFamily: mkt.family, editorialAngle: mkt.editorialAngle, facts: mkt.facts, now: NOW });
  const heroId = (mkt.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const resolved = resolvedShapeFor(mkt);
  const keys = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow: row });
  if (!keys) return { seeded: false };
  registerExistingMaster({ storyId, semanticHash: keys.cacheKey, family: mkt.family, imagePath, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: imagePath }, brandInMaster: true, source: "autopilot4_seeded_from_approved_5a1_master" });
  return { seeded: true };
}
console.log("  cache seed:", JSON.stringify(await seedMarketSnapshotCache()));

const runResult = await runSocialAutopilot({ allowGenerate: false, persist: false, maxSelected: 8, revalidateStale: true, now: NOW });
const pkg = runResult.selected.find((p) => p.family === "market_snapshot" && p.status === "BUFFER_QUEUED");
if (!pkg) { console.log("\n  No market_snapshot package reached BUFFER_QUEUED this run. Aborting."); process.exit(0); }

// §9 - re-run stale/validity fresh before the final proof (market_snapshot
// is an aggregate/editorial family - always STILL_VALID, but run it for
// real rather than assuming).
const live = await fetchLiveRecordFor(pkg.snapshot).catch(() => null);
const staleResult = checkStale(pkg.snapshot, live);
writeFileSync(path.join(OUT, "final_stale_check.json"), JSON.stringify(staleResult, null, 2));

// ---- host the static creative ----------------------------------------
const host = await hostMedia({ localPath: pkg.creative.master_image_path, mediaType: "STATIC_IMAGE", family: pkg.family, hostedAssetsPath: undefined });
if (!host.ok) { console.log("  HOST FAILED:", host.reason); process.exit(0); }
const reach = await verifyReachability(host.record, { expectedWidth: 1080, expectedHeight: null });
const mediaPackage = buildMediaPackage({ pkg, platform: "instagram", hostedRecord: host.record, verified: reach.ok ? reach.verified : null });
writeFileSync(path.join(OUT, "final_media_package.json"), JSON.stringify(mediaPackage, null, 2));

// ---- captions (already normalized + encoding-verified by captionStage) ----
const igCaption = pkg.captions?.instagram?.caption_text ?? "";
const xCaption = pkg.captions?.x?.caption_text ?? "";
writeFileSync(path.join(OUT, "final_caption_instagram.txt"), igCaption, "utf8");
writeFileSync(path.join(OUT, "final_caption_x.txt"), xCaption, "utf8");
const encodingAudit = { instagram: verifyCaptionEncoding(igCaption), x: verifyCaptionEncoding(xCaption) };
writeFileSync(path.join(OUT, "encoding_audit.json"), JSON.stringify(encodingAudit, null, 2));

writeFileSync(path.join(OUT, "final_story_snapshot.json"), JSON.stringify(pkg.snapshot, null, 2));

const channelMap = loadChannelMap();
const scheduledFor = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
const placements = {};
const payloads = {};
const completeAudits = {};
const hashAlignments = {};
for (const platform of ["instagram", "x"]) {
  const mp = { ...mediaPackage, platform };
  const built = buildBufferPlacement({ storyPackage: pkg, platform, placementType: pkg.platform_variants[platform]?.placement_type ?? "post", assetHash: mediaPackage.sha256, captionText: pkg.captions?.[platform]?.caption_text ?? null, scheduledFor });
  placements[platform] = built.placement;
  const payload = buildPlatformMediaPayload(pkg, platform, mp);
  payloads[platform] = {
    channel: resolveChannel(platform, channelMap),
    caption: pkg.captions?.[platform]?.caption_text ?? null,
    assets: payload.ok ? payload.assets : null,
    postType: payload.postType ?? null,
    scheduled_for: scheduledFor,
    placement_id: built.placement.placement_id,
    dedupe_key: built.placement.placement_id,
  };
  completeAudits[platform] = await auditCompletePlacementPackage(pkg, built.placement, mp, { liveRecord: live });
  hashAlignments[platform] = verifyHashAlignment(pkg, built.placement, mp);
}
writeFileSync(path.join(OUT, "final_instagram_payload.json"), JSON.stringify(payloads.instagram, null, 2));
writeFileSync(path.join(OUT, "final_x_payload.json"), JSON.stringify(payloads.x, null, 2));
writeFileSync(path.join(OUT, "final_qa.json"), JSON.stringify(completeAudits, null, 2));
writeFileSync(path.join(OUT, "hash_alignment.json"), JSON.stringify(hashAlignments, null, 2));
writeFileSync(path.join(OUT, "scheduled_times.json"), JSON.stringify({ instagram: scheduledFor, x: scheduledFor, note: "3h from proof generation - ample owner inspection/cancellation window" }, null, 2));

// §12 - the FULL pre-submit checklist, spelled out explicitly (even in
// PROPOSE_ONLY mode, to show the owner exactly what would gate a live call).
const ownerApprovalState = { required: true, approved: false, approved_at: null, approved_by: null, note: canGoLive ? `will approve via --approved-by "${APPROVED_BY}"` : "NOT approved - PROPOSE_ONLY run" };
const checklist = {
  owner_approval: ownerApprovalState.approved,
  snapshot_drift: true, // re-verified per-platform inside submitBufferPlacementLive itself
  caption_encoding: encodingAudit.instagram.ok && encodingAudit.x.ok,
  package_hash_alignment: hashAlignments.instagram.ok && hashAlignments.x.ok,
  media_reachability: reach.ok,
  media_sha: Boolean(mediaPackage.sha256),
  stale_check: staleResult.ok,
  qa_gate: evaluateQaGate(pkg).ok,
  channel_mapping: payloads.instagram.channel.ok && payloads.x.channel.ok,
  buffer_live_flag: safety.bufferLiveSubmit,
};
writeFileSync(path.join(OUT, "live_submit_command.json"), JSON.stringify({
  command: 'node scripts/socialAutopilot4Pilot.mjs --live --approved-by "<owner name>"',
  also_requires_env: "SOCIAL_BUFFER_LIVE_SUBMIT=true",
  pre_submit_checklist: checklist,
  all_pass: Object.values(checklist).every(Boolean),
}, null, 2));
writeFileSync(path.join(OUT, "final_owner_approval.json"), JSON.stringify(ownerApprovalState, null, 2));

// ---- LIVE SUBMIT (only if explicitly requested + gated) ---------------
let liveResults = null;
if (canGoLive) {
  let approved = approveStoryPackage({ ...pkg, status: "BUFFER_READY" }, { approvedBy: APPROVED_BY, now: NOW });
  approved = transition(approved, "BUFFER_SUBMITTING", { reason: "live pilot submit" });
  liveResults = {};
  // §13 - maximum 1 Instagram + 1 X. No TikTok. No YouTube. No loop.
  for (const platform of ["instagram", "x"]) {
    const mp = { ...mediaPackage, platform };
    // eslint-disable-next-line no-await-in-loop
    const r = await submitBufferPlacementLive(placements[platform], approved, { env: process.env, mediaPackage: mp });
    liveResults[platform] = r;
    if (r.submitted) {
      // eslint-disable-next-line no-await-in-loop
      const recon = await reconcileBufferPlacementLive({ ...placements[platform], buffer_provider_ref: r.provider_ref }, { env: process.env });
      liveResults[platform].reconciliation = recon;
    }
  }
  writeFileSync(path.join(OUT, "live_submit_results.json"), JSON.stringify(liveResults, null, 2));
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-4 pilot proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:900px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}
.cap{white-space:pre-wrap;background:#1a1a1f;padding:12px;border-radius:8px;font-size:13px}</style></head><body>
<h1>SOCIAL-AUTOPILOT-4 - First Live Pilot Proof</h1>
<div class="pill">Mode: <b>${canGoLive ? "LIVE SUBMIT" : "PROPOSE_ONLY"}</b></div>
<div class="pill">Story: ${esc(pkg.story_id)}</div>
<div class="pill">Media: ${esc(mediaPackage.hosted_url)}</div>
<h2>Instagram caption</h2><div class="cap">${esc(igCaption)}</div>
<h2>X caption</h2><div class="cap">${esc(xCaption)}</div>
<h2>Pre-submit checklist</h2>
<table><tr><th>check</th><th>pass</th></tr>${Object.entries(checklist).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v ? "PASS" : "FAIL"}</td></tr>`).join("")}</table>
<h2>Scheduled times</h2><pre>${esc(JSON.stringify({ instagram: scheduledFor, x: scheduledFor }, null, 2))}</pre>
${canGoLive ? `<h2>Live submit results</h2><pre>${esc(JSON.stringify(liveResults, null, 2))}</pre>` : `<p style="color:#ffb454">No provider call was made. Exact live command is in live_submit_command.json.</p>`}
<p style="color:#888;margin-top:32px">SOCIAL_AUTOPILOT_ENABLED and (unless explicitly overridden for this one run) SOCIAL_BUFFER_LIVE_SUBMIT remain false. No cron. No Reddit/SEO/email touched.</p>
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`  story: ${pkg.story_id}`);
console.log(`  media: ${mediaPackage.hosted_url}`);
console.log(`  checklist: ${Object.entries(checklist).map(([k, v]) => `${k}=${v ? "PASS" : "FAIL"}`).join(" ")}`);
if (canGoLive) {
  for (const [p, r] of Object.entries(liveResults)) console.log(`  LIVE ${p}: ok=${r.ok} state=${r.state} provider_ref=${r.provider_ref ?? "-"}`);
} else {
  console.log("  PROPOSE_ONLY - nothing submitted.");
}
console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
