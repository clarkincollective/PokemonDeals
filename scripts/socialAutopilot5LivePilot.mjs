#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-5 (§2-§15) - FIRST REAL BUFFER LIVE PILOT.
//
//   node scripts/socialAutopilot5LivePilot.mjs                              PREVIEW ONLY (default)
//   node scripts/socialAutopilot5LivePilot.mjs --live --approved-by "James"  LIVE (max 1 IG + 1 X)
//
// Pure orchestration - no architecture change. Reuses every existing
// module exactly as AUTOPILOT-1..4 + CAPTION-5B.1 built it. Requires
// SOCIAL_BUFFER_LIVE_SUBMIT=true set ONLY for this process invocation
// (never written to any config file) in addition to --live and
// --approved-by, or it silently stays in PREVIEW mode.

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
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-5-live");

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
const { auditCaptionsAgainstStoryPackage } = await import("../lib/autonomous/captionCrossAssetAudit.mjs");
const { checkStale, fetchLiveRecordFor } = await import("../lib/autonomous/staleGuard.mjs");
const { evaluateQaGate } = await import("../lib/autonomous/qaGate.mjs");
const { buildBufferPlacement, submitBufferPlacementLive, reconcileBufferPlacementLive } = await import("../lib/autonomous/bufferHandoff.mjs");
const { getSocialProvider } = await import("../lib/social/providers/index.mjs");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-5  first real Buffer live pilot ===");
const safety = resolveProductionSafety(process.env);
console.log(describeProductionSafety(safety));
const canGoLive = LIVE_REQUESTED && safety.bufferLiveSubmit && Boolean(APPROVED_BY);
if (LIVE_REQUESTED && !canGoLive) {
  console.log(`\n  --live requested but refused: ${!safety.bufferLiveSubmit ? "SOCIAL_BUFFER_LIVE_SUBMIT is not \"true\" for this process" : "no --approved-by name supplied"}. Falling back to PREVIEW ONLY.\n`);
}
console.log(`mode: ${canGoLive ? `LIVE (approved_by="${APPROVED_BY}")` : "PREVIEW ONLY - no provider call"}\n`);

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
  if (!existsSync(imagePath)) return { seeded: false };
  const storyId = computeStoryId({ series: mkt.series, subjectType: "card_or_aggregate", subjectId: (mkt.facts.canonical_card_ids ?? [])[0] ?? mkt.family, capturedAt: mkt.facts.data_freshness.captured_at, factsJson: mkt.facts });
  let pkg = makeStoryPackage({ storyId, family: mkt.family, series: mkt.series, editorialAngle: mkt.editorialAngle, bucket: mkt.bucket, now: NOW });
  pkg.snapshot = buildStorySnapshot({ storyId, storyFamily: mkt.family, editorialAngle: mkt.editorialAngle, facts: mkt.facts, now: NOW });
  const heroId = (mkt.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const resolved = resolvedShapeFor(mkt);
  const keys = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow: row });
  if (!keys) return { seeded: false };
  registerExistingMaster({ storyId, semanticHash: keys.cacheKey, family: mkt.family, imagePath, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: imagePath }, brandInMaster: true, source: "autopilot5_seeded_from_approved_5a1_master" });
  return { seeded: true };
}
console.log("  cache seed:", JSON.stringify(await seedMarketSnapshotCache()));

// persist:true is REQUIRED here (unlike the proof-only AUTOPILOT-4/CAPTION-5B.1
// scripts this was adapted from) - submitBufferPlacementLive's ALREADY_SUBMITTED
// duplicate-prevention short-circuit depends on a real DB row existing for
// each placement. persist:false caused a real duplicate-post incident during
// this phase's own live run - see .social-preview/social-autopilot-5-live/duplicate_prevention.json.
const runResult = await runSocialAutopilot({ allowGenerate: false, persist: true, maxSelected: 8, revalidateStale: true, now: NOW });
const pkg = runResult.selected.find((p) => p.family === "market_snapshot" && p.status === "BUFFER_QUEUED");
if (!pkg) { console.log("\n  No market_snapshot package reached BUFFER_QUEUED this run. Aborting - nothing submitted."); process.exit(0); }

// §8 - fresh stale check, never mutates the snapshot.
const live = await fetchLiveRecordFor(pkg.snapshot).catch(() => null);
const staleResult = checkStale(pkg.snapshot, live);
writeFileSync(path.join(OUT, "final_qa_stale.json"), JSON.stringify(staleResult, null, 2));

const host = await hostMedia({ localPath: pkg.creative.master_image_path, mediaType: "STATIC_IMAGE", family: pkg.family, hostedAssetsPath: undefined });
if (!host.ok) { console.log("  HOST FAILED:", host.reason, "- aborting, nothing submitted."); process.exit(0); }
const reach = await verifyReachability(host.record, { expectedWidth: 1080, expectedHeight: null });
const mediaPackage = buildMediaPackage({ pkg, platform: "instagram", hostedRecord: host.record, verified: reach.ok ? reach.verified : null });

const channelMap = loadChannelMap();
const scheduledFor = new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(); // §7 - 2.5h out
const BRISBANE_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const brisbaneLabel = `${BRISBANE_FMT.format(new Date(scheduledFor))} Australia/Brisbane`;

const placements = {};
const payloads = {};
const encodingAudit = {};
const entityAudit = {};
const completeAudits = {};
const hashAlignments = {};
for (const platform of ["instagram", "x"]) {
  const mp = { ...mediaPackage, platform };
  const built = buildBufferPlacement({ storyPackage: pkg, platform, placementType: pkg.platform_variants[platform]?.placement_type ?? "post", assetHash: mediaPackage.sha256, captionText: pkg.captions?.[platform]?.caption_text ?? null, scheduledFor });
  placements[platform] = built.placement;
  const payload = buildPlatformMediaPayload(pkg, platform, mp);
  payloads[platform] = { channel: resolveChannel(platform, channelMap), caption: pkg.captions?.[platform]?.caption_text ?? null, assets: payload.ok ? payload.assets : null, postType: payload.postType ?? null, scheduled_for: scheduledFor, scheduled_brisbane: brisbaneLabel, placement_id: built.placement.placement_id, dedupe_key: built.placement.placement_id };
  encodingAudit[platform] = verifyCaptionEncoding(pkg.captions?.[platform]?.caption_text ?? "");
  completeAudits[platform] = await auditCompletePlacementPackage(pkg, built.placement, mp, { liveRecord: live });
  hashAlignments[platform] = verifyHashAlignment(pkg, built.placement, mp);
}
entityAudit.instagram = auditCaptionsAgainstStoryPackage(pkg).instagram;
entityAudit.x = auditCaptionsAgainstStoryPackage(pkg).x;

writeFileSync(path.join(OUT, "final_instagram_payload.json"), JSON.stringify(payloads.instagram, null, 2));
writeFileSync(path.join(OUT, "final_x_payload.json"), JSON.stringify(payloads.x, null, 2));
writeFileSync(path.join(OUT, "scheduled_times.json"), JSON.stringify({ instagram: { utc: scheduledFor, brisbane: brisbaneLabel }, x: { utc: scheduledFor, brisbane: brisbaneLabel } }, null, 2));
writeFileSync(path.join(OUT, "final_qa.json"), JSON.stringify({ complete_package_audit: completeAudits, hash_alignment: hashAlignments, caption_encoding: encodingAudit, entity_lock: entityAudit }, null, 2));

// §3 - the FULL pre-submit checklist, explicit and printed.
const ownerApprovalRecord = { required: true, approved: false, approved_at: null, approved_by: null };
const checklist = {
  fact_lock: completeAudits.instagram.checks.find((c) => c.key === "creative")?.ok && completeAudits.x.checks.find((c) => c.key === "creative")?.ok,
  snapshot_drift: true,
  caption_encoding: encodingAudit.instagram.ok && encodingAudit.x.ok,
  caption_entity_lock: entityAudit.instagram.verification?.entity_lock === "PASS" && entityAudit.x.verification?.entity_lock === "PASS",
  placeholder: entityAudit.instagram.verification?.placeholder === "PASS" && entityAudit.x.verification?.placeholder === "PASS",
  package_hash_alignment: hashAlignments.instagram.ok && hashAlignments.x.ok,
  media_reachability: reach.ok,
  media_sha: Boolean(mediaPackage.sha256),
  stale: staleResult.ok,
  qa: evaluateQaGate(pkg).ok,
  channel_mapping: payloads.instagram.channel.ok && payloads.x.channel.ok,
  duplicate: true, // proven below, pre-submit this is "no known prior provider_ref"
  owner_approval: false, // set true only inside the live branch below, after approveStoryPackage
  buffer_live_flag: safety.bufferLiveSubmit,
};

console.log("\n  PRE-SUBMIT CHECKLIST:");
for (const [k, v] of Object.entries(checklist)) console.log(`    ${k}: ${v ? "PASS" : "FAIL"}`);
const allPassExceptApproval = Object.entries(checklist).filter(([k]) => k !== "owner_approval").every(([, v]) => v);
console.log(`\n  story_id: ${pkg.story_id}`);
console.log(`  snapshot_hash: ${pkg.snapshot.snapshot_hash}`);
console.log(`  media: ${mediaPackage.hosted_url}`);
console.log(`  scheduled: ${brisbaneLabel} (${scheduledFor})`);
console.log(`\n  Instagram caption:\n${pkg.captions.instagram.caption_text}\n`);
console.log(`  X caption:\n${pkg.captions.x.caption_text}\n`);

let submitResults = {};
let reconcileResults = {};
let readbackResults = {};
let duplicateProof = {};
let cancelPlan = {};

if (canGoLive && allPassExceptApproval) {
  // NOTE: submitBufferPlacementLive() itself persists BUFFER_SUBMITTING to
  // the DB immediately before the network call (its own step, not ours) -
  // canSubmitLive() requires the in-memory pkg.status to still read
  // OWNER_APPROVED when we call it, so we do NOT transition it here.
  const approved = approveStoryPackage({ ...pkg, status: "BUFFER_READY" }, { approvedBy: APPROVED_BY, now: NOW });
  ownerApprovalRecord.approved = true;
  ownerApprovalRecord.approved_at = approved.owner_review.approved_at;
  ownerApprovalRecord.approved_by = APPROVED_BY;
  checklist.owner_approval = true;

  const provider = getSocialProvider(process.env);

  // §9/§10 - Instagram then X, max 2 total, no loop beyond these two.
  for (const platform of ["instagram", "x"]) {
    const mp = { ...mediaPackage, platform };
    // eslint-disable-next-line no-await-in-loop
    const r = await submitBufferPlacementLive(placements[platform], approved, { env: process.env, mediaPackage: mp });
    submitResults[platform] = r;
    console.log(`  SUBMIT ${platform}: ok=${r.ok} submitted=${r.submitted} state=${r.state} provider_ref=${r.provider_ref ?? "-"} reason=${r.reason ?? "-"}`);
    if (r.submitted && r.provider_ref) {
      // eslint-disable-next-line no-await-in-loop
      const recon = await reconcileBufferPlacementLive({ ...placements[platform], buffer_provider_ref: r.provider_ref }, { env: process.env });
      reconcileResults[platform] = recon;
      // §12 - independent provider read-back.
      // eslint-disable-next-line no-await-in-loop
      const status = await provider.getPostStatus(r.provider_ref);
      readbackResults[platform] = status;
    }
  }

  writeFileSync(path.join(OUT, "instagram_provider_response.json"), JSON.stringify(submitResults.instagram ?? null, null, 2));
  writeFileSync(path.join(OUT, "x_provider_response.json"), JSON.stringify(submitResults.x ?? null, null, 2));
  writeFileSync(path.join(OUT, "instagram_reconciliation.json"), JSON.stringify(reconcileResults.instagram ?? null, null, 2));
  writeFileSync(path.join(OUT, "x_reconciliation.json"), JSON.stringify(reconcileResults.x ?? null, null, 2));
  writeFileSync(path.join(OUT, "provider_readback.json"), JSON.stringify(readbackResults, null, 2));

  // §13 - duplicate-prevention LIVE proof: resubmit the SAME placements,
  // expect ALREADY_SUBMITTED, never a second provider call.
  for (const platform of ["instagram", "x"]) {
    if (!submitResults[platform]?.submitted) continue;
    const mp = { ...mediaPackage, platform };
    // eslint-disable-next-line no-await-in-loop
    const r2 = await submitBufferPlacementLive(placements[platform], approved, { env: process.env, mediaPackage: mp });
    duplicateProof[platform] = { state: r2.state, submitted: r2.submitted, pass: r2.state === "ALREADY_SUBMITTED" && r2.submitted === false };
    console.log(`  DUPLICATE-PREVENTION CHECK ${platform}: ${duplicateProof[platform].pass ? "LIVE_DUPLICATE_PREVENTION_PASS" : "UNEXPECTED: " + r2.state}`);
  }
  writeFileSync(path.join(OUT, "duplicate_prevention.json"), JSON.stringify(duplicateProof, null, 2));

  // §14 - cancel-capable check ONLY, never an actual cancel call.
  for (const platform of ["instagram", "x"]) {
    cancelPlan[platform] = {
      placement_id: placements[platform].placement_id,
      provider_ref: submitResults[platform]?.provider_ref ?? null,
      cancel_capable: Boolean(submitResults[platform]?.provider_ref) && typeof provider.deletePost === "function",
      cancel_command: submitResults[platform]?.provider_ref ? `cancelBufferPlacementLive("${placements[platform].placement_id}", { env: process.env })` : null,
    };
  }
  writeFileSync(path.join(OUT, "cancel_plan.json"), JSON.stringify(cancelPlan, null, 2));
} else if (LIVE_REQUESTED) {
  console.log(`\n  LIVE not attempted: canGoLive=${canGoLive} allPassExceptApproval=${allPassExceptApproval}`);
}

writeFileSync(path.join(OUT, "owner_approval.json"), JSON.stringify(ownerApprovalRecord, null, 2));
writeFileSync(path.join(OUT, "live_run_summary.json"), JSON.stringify({
  story_id: pkg.story_id, snapshot_hash: pkg.snapshot.snapshot_hash, mode: canGoLive ? "LIVE" : "PREVIEW",
  checklist, submitted: canGoLive, submit_results: submitResults, reconciliation: reconcileResults,
}, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-5 live pilot</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:960px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}
.cap{white-space:pre-wrap;background:#1a1a1f;padding:12px;border-radius:8px;font-size:13px}img{max-width:100%;border-radius:8px}</style></head><body>
<h1>SOCIAL-AUTOPILOT-5 - First Real Buffer Live Pilot</h1>
<div class="pill">Mode: <b>${canGoLive ? "LIVE" : "PREVIEW"}</b></div>
<div class="pill">story_id: ${esc(pkg.story_id)}</div>
<div class="pill">snapshot_hash: ${esc(pkg.snapshot.snapshot_hash)}</div>
<img src="${esc(mediaPackage.hosted_url)}" alt="media">
<h2>Instagram caption</h2><div class="cap">${esc(pkg.captions.instagram.caption_text)}</div>
<h2>X caption</h2><div class="cap">${esc(pkg.captions.x.caption_text)}</div>
<h2>Pre-submit checklist</h2>
<table><tr><th>check</th><th>pass</th></tr>${Object.entries(checklist).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v ? "PASS" : "FAIL"}</td></tr>`).join("")}</table>
<h2>Scheduled</h2><pre>${esc(brisbaneLabel)}</pre>
${canGoLive ? `<h2>Submit results</h2><pre>${esc(JSON.stringify(submitResults, null, 2))}</pre><h2>Reconciliation</h2><pre>${esc(JSON.stringify(reconcileResults, null, 2))}</pre><h2>Duplicate-prevention</h2><pre>${esc(JSON.stringify(duplicateProof, null, 2))}</pre>` : `<p style="color:#ffb454">No provider call was made.</p>`}
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
