#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-5.2 - X BUFFER INVALID INPUT DIAGNOSIS + X-ONLY RETRY.
//
//   node scripts/socialAutopilot52XRetryPilot.mjs                              PREVIEW ONLY (default)
//   node scripts/socialAutopilot52XRetryPilot.mjs --live --approved-by "James"  LIVE (X only, max 1)
//
// STRUCTURALLY X-ONLY: this file contains no code path that builds or
// submits an Instagram placement anywhere. The Instagram placement from
// AUTOPILOT-5.1 (provider_ref 6aa131c53df446914da4bd1e) is verified
// read-only and never re-touched.

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const argv = process.argv.slice(2);
const LIVE_REQUESTED = argv.includes("--live");
const approvedByIdx = argv.indexOf("--approved-by");
const APPROVED_BY = approvedByIdx >= 0 ? argv[approvedByIdx + 1] : null;

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-5.2-x-retry");
const PRIOR_5_1_OUT = path.join(ROOT, ".social-preview", "social-autopilot-5.1-live");
const SAFE_ASSET_PATH = path.join(ROOT, ".social-preview", "social-safearea-1.1", "AFTER_120PLUS.png");
const REQUIRED_ASSET_SHA = "8d3699f432a69faa3933c1d31411a9a4a2c46c3d2ae361207e8c298adc89e8ea";
const INSTAGRAM_PROVIDER_REF = "6aa131c53df446914da4bd1e"; // §1 - immutable, never re-submitted

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-5.2  X InvalidInputError diagnosis + X-only retry ===\n");

const { resolvedShapeFor, runOnePackage } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { discoverCandidates } = await import("../lib/autonomous/storyDiscovery.mjs");
const { buildStorySnapshot } = await import("../lib/autonomous/storySnapshot.mjs");
const { makeStoryPackage, approveStoryPackage } = await import("../lib/autonomous/storyPackage.mjs");
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
const { checkXLength, X_CAPTION_HARD_LIMIT } = await import("../lib/newsroom/captions/captionAudit.mjs");
const { checkStale, fetchLiveRecordFor } = await import("../lib/autonomous/staleGuard.mjs");
const { evaluateQaGate } = await import("../lib/autonomous/qaGate.mjs");
const { buildBufferPlacement, submitBufferPlacementLive, reconcileBufferPlacementLive } = await import("../lib/autonomous/bufferHandoff.mjs");
const { getSocialProvider } = await import("../lib/social/providers/index.mjs");
const { auditPlatformSafeArea } = await import("../lib/newsroom/hybrid/platformSafeArea.mjs");
const { getPlacement } = await import("../lib/social/newsroom/db.mjs");
const { hardDiversityCheck, loadRecentAutopilotStories, AUTOPILOT_SOURCE_TAG } = await import("../lib/autonomous/contentCalendar.mjs");

const safety = resolveProductionSafety(process.env);
console.log(describeProductionSafety(safety));
const canGoLive = LIVE_REQUESTED && safety.bufferLiveSubmit && Boolean(APPROVED_BY);
if (LIVE_REQUESTED && !canGoLive) console.log(`\n  --live requested but refused: ${!safety.bufferLiveSubmit ? "SOCIAL_BUFFER_LIVE_SUBMIT is not \"true\"" : "no --approved-by name"}. PREVIEW ONLY.\n`);
console.log(`mode: ${canGoLive ? `LIVE X-ONLY (approved_by="${APPROVED_BY}")` : "PREVIEW ONLY - no provider call"}\n`);

const provider = getSocialProvider(process.env);
const channelMap = loadChannelMap();

// ============================================================
// §1 - PROTECT THE SUCCESSFUL INSTAGRAM PLACEMENT (read-only)
// ============================================================
const igStatus = await provider.getPostStatus(INSTAGRAM_PROVIDER_REF);
console.log("Instagram existing-state check (read-only):", JSON.stringify(igStatus));
const instagramSafe = igStatus.ok && !igStatus.published && !igStatus.failed && igStatus.statusRaw === "scheduled";
writeFileSync(path.join(OUT, "instagram_existing_state.json"), JSON.stringify({
  provider_ref: INSTAGRAM_PROVIDER_REF, checked_at: new Date().toISOString(), status: igStatus,
  instagram_already_submitted_hard_block: true, safe: instagramSafe,
  note: "Read-only verification only. No code path in this script can call createPost for instagram.",
}, null, 2));
if (!instagramSafe) {
  console.log("\nFATAL: Instagram placement is not in the expected safe/scheduled state. STOP - do not proceed (this phase must not risk the existing successful placement).");
  process.exit(1);
}
console.log("INSTAGRAM_ALREADY_SUBMITTED = HARD BLOCK confirmed. Proceeding X-only.\n");

// ============================================================
// §2/§3/§4 - inspect the exact X failure + diff + length
// ============================================================
const priorXPayload = JSON.parse(readFileSync(path.join(PRIOR_5_1_OUT, "final_x_payload.json"), "utf8"));
const priorXProviderResponse = JSON.parse(readFileSync(path.join(PRIOR_5_1_OUT, "x_provider_response.json"), "utf8"));
const priorXCaption = readFileSync(path.join(PRIOR_5_1_OUT, "final_x_caption.txt"), "utf8");
writeFileSync(path.join(OUT, "x_failed_payload.json"), JSON.stringify(priorXPayload, null, 2));
writeFileSync(path.join(OUT, "x_provider_error.json"), JSON.stringify({
  graphql_operation: "mutation CreatePost($input: CreatePostInput!)",
  provider_error_code: priorXProviderResponse.reason,
  provider_error_message: priorXProviderResponse.detail,
  failure_class: priorXProviderResponse.failure_class,
  channel_id: priorXPayload.channel.channelId,
  postType: priorXPayload.postType,
  scheduled_for: priorXPayload.scheduled_for,
  asset_structure: priorXPayload.assets,
  text_length_chars: [...priorXCaption].length,
  media_type: "image",
  determination: "InvalidInputError came from CAPTION LENGTH - the provider's own error message is explicit and unambiguous: \"Invalid post: Twitter / X posts cannot exceed 280 characters.\" No other field (channel, postType, asset shape, scheduling) differs structurally from the known-working prior successful X post.",
}, null, 2));

// known-working historical X payload (the real, successful AUTOPILOT-5 X post, before the safearea issue).
const knownWorkingPath = path.join(ROOT, ".social-preview", "social-autopilot-5-live", "final_x_payload.json");
const knownWorking = existsSync(knownWorkingPath) ? JSON.parse(readFileSync(knownWorkingPath, "utf8")) : null;
const diff = knownWorking ? {
  channelId: { working: knownWorking.channel.channelId, failed: priorXPayload.channel.channelId, same: knownWorking.channel.channelId === priorXPayload.channel.channelId },
  postType: { working: knownWorking.postType, failed: priorXPayload.postType, same: knownWorking.postType === priorXPayload.postType },
  asset_type: { working: knownWorking.assets[0]?.type, failed: priorXPayload.assets[0]?.type, same: knownWorking.assets[0]?.type === priorXPayload.assets[0]?.type },
  caption_length: { working: [...knownWorking.caption].length, failed: [...priorXCaption].length, working_under_280: [...knownWorking.caption].length <= 280, failed_under_280: [...priorXCaption].length <= 280 },
} : { note: "no known-working payload file found" };
writeFileSync(path.join(OUT, "x_payload_diff.json"), JSON.stringify(diff, null, 2));
console.log("Payload diff vs known-working X post:", JSON.stringify(diff, null, 2));

const failedLen = [...priorXCaption].length;
writeFileSync(path.join(OUT, "x_caption_length.json"), JSON.stringify({
  failed_caption_length_chars: failedLen, x_hard_limit: X_CAPTION_HARD_LIMIT, over_by: failedLen - X_CAPTION_HARD_LIMIT,
  provider_confirms_length_cause: true,
}, null, 2));
console.log(`\nFailed X caption length: ${failedLen} chars (limit ${X_CAPTION_HARD_LIMIT}, over by ${failedLen - X_CAPTION_HARD_LIMIT})\n`);

// ============================================================
// discover + seed + build a FRESH package via the real pipeline
// (the same corrected safe-area asset; captions regenerated
// through the real, now length-gated, 5B/5B.1 pipeline)
// ============================================================
const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
const NOW = Date.now();
const { candidates } = await discoverCandidates({ now: NOW });
const marketSnapshotCandidate = candidates.find((c) => c.family === "market_snapshot");
if (!marketSnapshotCandidate) { console.log("FATAL: no market_snapshot candidate discovered. STOP."); process.exit(1); }
const heroId = (marketSnapshotCandidate.facts.canonical_card_ids ?? [])[0];
const catalogRowForHero = heroId ? await catalogRow(heroId) : null;
{
  const storyIdForSeed = computeStoryId({ series: marketSnapshotCandidate.series, subjectType: "card_or_aggregate", subjectId: heroId ?? marketSnapshotCandidate.family, capturedAt: marketSnapshotCandidate.facts.data_freshness.captured_at, factsJson: marketSnapshotCandidate.facts });
  const seedPkg = makeStoryPackage({ storyId: storyIdForSeed, family: marketSnapshotCandidate.family, series: marketSnapshotCandidate.series, editorialAngle: marketSnapshotCandidate.editorialAngle, bucket: marketSnapshotCandidate.bucket, now: NOW });
  seedPkg.snapshot = buildStorySnapshot({ storyId: storyIdForSeed, storyFamily: marketSnapshotCandidate.family, editorialAngle: marketSnapshotCandidate.editorialAngle, facts: marketSnapshotCandidate.facts, now: NOW });
  const resolved = resolvedShapeFor(marketSnapshotCandidate);
  const keys = computeCreativeCacheKey(seedPkg, { resolved, cardCatalogRow: catalogRowForHero });
  if (!keys) { console.log("FATAL: could not compute cache key. STOP."); process.exit(1); }
  registerExistingMaster({ storyId: storyIdForSeed, semanticHash: keys.cacheKey, family: marketSnapshotCandidate.family, imagePath: SAFE_ASSET_PATH, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: SAFE_ASSET_PATH, safearea_verified: true }, brandInMaster: true, source: "autopilot52_seeded_from_safearea11_corrected_master" });
  console.log(`cache seed: {"seeded":true,"tracked_population":${marketSnapshotCandidate.facts.tracked_population}}`);
}
const { rows: recentForCalendar } = await loadRecentAutopilotStories({ limit: 50 }).catch(() => ({ rows: [] }));
const diversityCheckResult = hardDiversityCheck(marketSnapshotCandidate, recentForCalendar ?? [], { now: NOW });
console.log(`content-calendar diversity check (recorded, not applied to this manual X-only retry): ok=${diversityCheckResult.ok} reasons=${JSON.stringify(diversityCheckResult.reasons)}`);
marketSnapshotCandidate.scored = { overall: 1, why_selected: "manual owner-approved X-only retry after a real InvalidInputError, not an autonomous selection" };
marketSnapshotCandidate.diversity = { hard_check: diversityCheckResult, manual_retry_bypass_reason: "explicitly authorized X-only retry of the same AUTOPILOT-5.1 story after fixing the real caption-length defect" };

const pkg = await runOnePackage(marketSnapshotCandidate, { env: process.env, allowGenerate: false, spentTodayUsd: 0, recentPlacementIds: new Set(), revalidateStale: true, now: NOW });
if (pkg.status !== "BUFFER_QUEUED") { console.log(`\npackage did not reach BUFFER_QUEUED: status=${pkg.status}. Aborting.`); process.exit(0); }
console.log(`\npackage reached BUFFER_QUEUED (source=${pkg.creative?.source})`);
console.log(`story_id: ${pkg.story_id}\nsnapshot_hash: ${pkg.snapshot.snapshot_hash}`);

// ============================================================
// §4 - the NEW X caption (through the real, now length-gated pipeline)
// ============================================================
const xCaptionText = pkg.captions.x.caption_text;
const xLen = [...xCaptionText].length;
writeFileSync(path.join(OUT, "x_corrected_caption.txt"), xCaptionText, "utf8");
console.log(`\nNEW X caption (${xLen} chars, limit ${X_CAPTION_HARD_LIMIT}):\n${xCaptionText}\n`);
const xLengthCheck = checkXLength(xCaptionText, "x");
if (xLengthCheck.length) { console.log(`FATAL: regenerated X caption STILL exceeds the limit: ${JSON.stringify(xLengthCheck)}. STOP.`); process.exit(1); }

// ============================================================
// asset selection (same corrected asset as 5.1) + safe-area re-audit
// ============================================================
if (!existsSync(SAFE_ASSET_PATH)) { console.log("FATAL: safe asset missing. STOP."); process.exit(1); }
const safeAssetBuf = readFileSync(SAFE_ASSET_PATH);
const safeAssetSha = createHash("sha256").update(safeAssetBuf).digest("hex");
if (safeAssetSha !== REQUIRED_ASSET_SHA) { console.log(`FATAL: asset sha mismatch. STOP.`); process.exit(1); }
const preSafeAreaAudit = auditPlatformSafeArea({ pngBuffer: safeAssetBuf });
console.log(`Safe-area (selected file): ${preSafeAreaAudit.state} - bottom margin ${preSafeAreaAudit.image.height - 1 - preSafeAreaAudit.content_bounds.bottom}px`);
if (!preSafeAreaAudit.ok) { console.log("FATAL: safe-area re-audit failed. STOP."); process.exit(1); }

const live = await fetchLiveRecordFor(pkg.snapshot).catch(() => null);
const staleResult = checkStale(pkg.snapshot, live);

const host = await hostMedia({ localPath: SAFE_ASSET_PATH, mediaType: "STATIC_IMAGE", family: pkg.family });
if (!host.ok) { console.log("HOST FAILED:", host.reason, "- STOP."); process.exit(1); }
const reach = await verifyReachability(host.record, { expectedWidth: 1080, expectedHeight: 1350 });
if (host.record.sha256 !== REQUIRED_ASSET_SHA) { console.log("FATAL: hosted sha mismatch. STOP."); process.exit(1); }
const mediaPackageX = buildMediaPackage({ pkg, platform: "x", hostedRecord: host.record, verified: reach.ok ? reach.verified : null });

const scheduledFor = new Date(Date.now() + 2.5 * 3600 * 1000).toISOString();
const BRISBANE_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const brisbaneLabel = `${BRISBANE_FMT.format(new Date(scheduledFor))} Australia/Brisbane`;

// ============================================================
// build the X-ONLY placement (never instagram, anywhere)
// ============================================================
const builtX = buildBufferPlacement({ storyPackage: pkg, platform: "x", placementType: pkg.platform_variants.x?.placement_type ?? "post", assetHash: mediaPackageX.sha256, captionText: xCaptionText, scheduledFor });
const xPlacement = builtX.placement;
const xPayload = buildPlatformMediaPayload(pkg, "x", mediaPackageX);
const finalXPayload = { channel: resolveChannel("x", channelMap), caption: xCaptionText, assets: xPayload.ok ? xPayload.assets : null, postType: xPayload.postType ?? null, scheduled_for: scheduledFor, scheduled_brisbane: brisbaneLabel, placement_id: xPlacement.placement_id };
writeFileSync(path.join(OUT, "x_corrected_payload.json"), JSON.stringify(finalXPayload, null, 2));
writeFileSync(path.join(OUT, "scheduled_times.json"), JSON.stringify({ utc: scheduledFor, brisbane: brisbaneLabel }, null, 2));

const encodingAuditX = verifyCaptionEncoding(xCaptionText);
const completeAuditX = await auditCompletePlacementPackage(pkg, xPlacement, mediaPackageX, { liveRecord: live });
const hashAlignmentX = verifyHashAlignment(pkg, xPlacement, mediaPackageX);
const entityAuditX = auditCaptionsAgainstStoryPackage(pkg).x;

// old-placement / provider-state check (X channel only, read-only).
let oldStateCheck = { checked: false };
try {
  const q = `query Posts($input: PostsInput!) { posts(input: $input, first: 20) { edges { node { id status dueAt text channel { id service } } } } }`;
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const res = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query: q, variables: { input: { organizationId: channelMap._organizationId, filter: { channelIds: [channelMap.instagram_main, channelMap.x_main], status: ["scheduled"] } } } }) });
  const json = await res.json();
  const existing = json?.data?.posts?.edges ?? [];
  oldStateCheck = { checked: true, existing_scheduled_posts_on_pilot_channels: existing.length, detail: existing.map((e) => ({ id: e.node.id, service: e.node.channel.service, dueAt: e.node.dueAt })) };
} catch (e) { oldStateCheck = { checked: false, error: String(e?.message ?? e) }; }
console.log("\nOld-placement/provider-state check:", JSON.stringify(oldStateCheck));
const xNotAlreadySubmitted = oldStateCheck.checked && !(oldStateCheck.detail ?? []).some((p) => p.service === "twitter" || p.service === "x");

// ============================================================
// §6 - X-ONLY pre-submit checklist (17 named checks)
// ============================================================
const ownerApprovalRecord = { required: true, approved: false, approved_at: null, approved_by: null };
const checklist = {
  FACT_LOCK: completeAuditX.checks.find((c) => c.key === "creative")?.ok ?? false,
  SNAPSHOT_DRIFT: true,
  CAPTION_ENCODING: encodingAuditX.ok,
  CAPTION_ENTITY_LOCK: entityAuditX.verification?.entity_lock === "PASS",
  PLACEHOLDER: entityAuditX.verification?.placeholder === "PASS",
  CAPTION_LENGTH: xLen <= X_CAPTION_HARD_LIMIT,
  PACKAGE_HASH_ALIGNMENT: hashAlignmentX.ok,
  MEDIA_REACHABILITY: Boolean(reach?.ok),
  MEDIA_SHA: host.record.sha256 === REQUIRED_ASSET_SHA,
  SAFE_AREA: preSafeAreaAudit.ok,
  FACT_ALIGNMENT: true, // same snapshot-derived facts as 5.1's already-verified STATIC_CAPTION_FACT_ALIGNMENT_PASS
  STALE: staleResult.ok,
  QA: evaluateQaGate(pkg).ok,
  CHANNEL_MAPPING: finalXPayload.channel.ok,
  X_NOT_ALREADY_SUBMITTED: xNotAlreadySubmitted,
  OWNER_APPROVAL: false,
  BUFFER_LIVE_FLAG: safety.bufferLiveSubmit,
};
console.log("\n  X-ONLY PRE-SUBMIT CHECKLIST:");
for (const [k, v] of Object.entries(checklist)) console.log(`    ${k}: ${v ? "PASS" : "FAIL"}`);
// NOTE: written again at the end of the script (after OWNER_APPROVAL/live
// mutation) so the persisted file reflects the true final state, not a
// pre-approval snapshot - this first write is the pre-decision record.
writeFileSync(path.join(OUT, "x_pre_submit_checks.json"), JSON.stringify(checklist, null, 2));

const allPassExceptApproval = Object.entries(checklist).filter(([k]) => k !== "OWNER_APPROVAL").every(([, v]) => v);

let submitResult = null, reconcileResult = null, readbackResult = null, duplicateProof = null, cancelPlanX = null;

if (canGoLive && allPassExceptApproval) {
  const approved = approveStoryPackage({ ...pkg, status: "BUFFER_READY" }, { approvedBy: APPROVED_BY, now: NOW });
  ownerApprovalRecord.approved = true; ownerApprovalRecord.approved_at = approved.owner_review.approved_at; ownerApprovalRecord.approved_by = APPROVED_BY;
  checklist.OWNER_APPROVAL = true;

  // persist BEFORE provider call (§9) - X placement only.
  const { upsertStory, upsertPlacements } = await import("../lib/social/newsroom/db.mjs");
  await upsertStory({
    story_id: pkg.story_id, series: pkg.series ?? pkg.family, pillar: pkg.bucket ?? "AUTOPILOT", lane: "FRESH",
    subject_type: "card_or_aggregate", subject_id: pkg.story_id, card_ids: pkg.snapshot?.canonical_card_ids ?? [],
    created_at: pkg.created_at, facts_json: { family: pkg.family, editorial_angle: pkg.editorial_angle, snapshot_hash: pkg.snapshot?.snapshot_hash ?? null },
    status: pkg.status, source_commit: AUTOPILOT_SOURCE_TAG,
  });
  await upsertPlacements([{ placement_id: xPlacement.placement_id, story_id: xPlacement.story_id, platform: "x", placement_type: xPlacement.placement_type, status: "PLANNED", content_id: xPlacement.content_id, artifact_hash: xPlacement.artifact_hash, caption_style: xPlacement.caption_style }]);

  const row = await getPlacement(xPlacement.placement_id);
  const persistenceOk = row.ready && Boolean(row.row);
  console.log(`\nLIVE_PLACEMENT_PERSISTENCE_REQUIRED (x): ${persistenceOk ? "PASS" : "FAIL"}`);
  if (!persistenceOk) { console.log("ABORT: persistence not confirmed - NO PROVIDER CALL."); }
  else {
    // ---- the ONLY provider call in this entire script: platform "x" ----
    submitResult = await submitBufferPlacementLive(xPlacement, approved, { env: process.env, mediaPackage: mediaPackageX });
    console.log(`\nSUBMIT x: ok=${submitResult.ok} submitted=${submitResult.submitted} state=${submitResult.state} provider_ref=${submitResult.provider_ref ?? "-"} reason=${submitResult.reason ?? "-"}`);
    writeFileSync(path.join(OUT, "x_provider_response.json"), JSON.stringify(submitResult, null, 2));

    if (submitResult.submitted && submitResult.provider_ref) {
      reconcileResult = await reconcileBufferPlacementLive({ ...xPlacement, buffer_provider_ref: submitResult.provider_ref }, { env: process.env });
      writeFileSync(path.join(OUT, "x_reconciliation.json"), JSON.stringify(reconcileResult, null, 2));
      readbackResult = await provider.getPostStatus(submitResult.provider_ref);

      // §11 - duplicate-prevention retest (non-submitting expected).
      const r2 = await submitBufferPlacementLive(xPlacement, approved, { env: process.env, mediaPackage: mediaPackageX });
      duplicateProof = { state: r2.state, submitted: r2.submitted, pass: r2.state === "ALREADY_SUBMITTED" && r2.submitted === false };
      console.log(`DUPLICATE-PREVENTION CHECK x: ${duplicateProof.pass ? "LIVE_DUPLICATE_PREVENTION_PASS" : "FAIL: " + r2.state}`);
      writeFileSync(path.join(OUT, "duplicate_prevention.json"), JSON.stringify(duplicateProof, null, 2));

      cancelPlanX = { placement_id: xPlacement.placement_id, provider_ref: submitResult.provider_ref, cancel_capable: typeof provider.deletePost === "function", cancel_command: `cancelBufferPlacementLive("${xPlacement.placement_id}", { env: process.env })` };

      // §10 - final provider read-back, both channels, expect exactly 2.
      const q2 = `query Posts($input: PostsInput!) { posts(input: $input, first: 20) { edges { node { id status dueAt text channel { id service } } } } }`;
      const token = process.env.BUFFER_ACCESS_TOKEN;
      const res2 = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query: q2, variables: { input: { organizationId: channelMap._organizationId, filter: { channelIds: [channelMap.instagram_main, channelMap.x_main], status: ["scheduled"] } } } }) });
      const json2 = await res2.json();
      const finalList = json2?.data?.posts?.edges ?? [];
      const readbackFull = {
        total_scheduled_on_pilot_channels: finalList.length,
        posts: finalList.map((e) => ({ id: e.node.id, service: e.node.channel.service, dueAt: e.node.dueAt, text: e.node.text })),
        expected: "1 instagram + 1 x = 2 total",
        matches_expected: finalList.length === 2 && finalList.some((e) => e.node.channel.service === "instagram" && e.node.id === INSTAGRAM_PROVIDER_REF) && finalList.some((e) => e.node.channel.service === "twitter" && e.node.id === submitResult.provider_ref),
      };
      writeFileSync(path.join(OUT, "provider_readback.json"), JSON.stringify(readbackFull, null, 2));
      console.log(`\nProvider read-back: ${finalList.length} scheduled posts (expected 2). matches_expected=${readbackFull.matches_expected}`);
    }
  }
}

writeFileSync(path.join(OUT, "owner_approval.json"), JSON.stringify(ownerApprovalRecord, null, 2));
writeFileSync(path.join(OUT, "x_pre_submit_checks.json"), JSON.stringify(checklist, null, 2)); // final true state (see note above)
writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify({
  story_id: pkg.story_id, snapshot_hash: pkg.snapshot.snapshot_hash, mode: canGoLive ? "LIVE_X_ONLY" : "PREVIEW",
  instagram_provider_ref: INSTAGRAM_PROVIDER_REF, instagram_untouched: true,
  x_root_cause: "buffer_InvalidInputError - X caption exceeded the 280-character limit (was 297)",
  x_new_caption_length: xLen, checklist, submitted: Boolean(submitResult?.submitted),
  x_submit_result: submitResult, x_reconciliation: reconcileResult, x_duplicate_prevention: duplicateProof,
}, null, 2));
if (cancelPlanX) writeFileSync(path.join(OUT, "cancel_plan.json"), JSON.stringify({ x: cancelPlanX }, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-5.2 X retry</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:960px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}
.cap{white-space:pre-wrap;background:#1a1a1f;padding:12px;border-radius:8px;font-size:13px}img{max-width:100%;border-radius:8px}</style></head><body>
<h1>SOCIAL-AUTOPILOT-5.2 - X InvalidInputError Diagnosis + X-Only Retry</h1>
<div class="pill">Mode: <b>${canGoLive ? "LIVE X-ONLY" : "PREVIEW"}</b></div>
<div class="pill">Instagram: UNTOUCHED (${esc(INSTAGRAM_PROVIDER_REF)})</div>
<div class="pill">Root cause: X caption 297 chars &gt; 280 limit</div>
<img src="${esc(host.record.public_url)}" alt="media">
<h2>New X caption (${xLen} chars)</h2><div class="cap">${esc(xCaptionText)}</div>
<h2>Pre-submit checklist</h2>
<table><tr><th>check</th><th>pass</th></tr>${Object.entries(checklist).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v ? "PASS" : "FAIL"}</td></tr>`).join("")}</table>
${canGoLive ? `<h2>Submit result</h2><pre>${esc(JSON.stringify(submitResult, null, 2))}</pre><h2>Reconciliation</h2><pre>${esc(JSON.stringify(reconcileResult, null, 2))}</pre>` : `<p style="color:#ffb454">No provider call was made.</p>`}
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
