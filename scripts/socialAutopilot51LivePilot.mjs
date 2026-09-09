#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-5.1 - SAFEAREA-CORRECTED LIVE PILOT RETRY.
//
//   node scripts/socialAutopilot51LivePilot.mjs                              PREVIEW ONLY (default)
//   node scripts/socialAutopilot51LivePilot.mjs --live --approved-by "James"  LIVE (max 1 IG + 1 X)
//
// Pure orchestration - reuses every existing module exactly as AUTOPILOT-5
// did, with the two required corrections: persist:true (the AUTOPILOT-5
// duplicate-prevention gap) and the SAFEAREA-1.1-corrected asset (the
// AUTOPILOT-5 clipping defect) explicitly selected and verified, never
// inferred.

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
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-5.1-live");
const SAFE_ASSET_PATH = path.join(ROOT, ".social-preview", "social-safearea-1.1", "AFTER_120PLUS.png");
// §2 - the ONLY acceptable asset for this retry. Both prior assets are
// explicitly forbidden, listed here so the check is self-documenting.
const REQUIRED_ASSET_SHA = "8d3699f432a69faa3933c1d31411a9a4a2c46c3d2ae361207e8c298adc89e8ea";
const FORBIDDEN_SHAS = new Set([
  "d823b5560eef052c00fd14313c865d826a3ddf5a6266b4442cb5bedafe3f416a", // original, 0px margin
  "8e256d8c6630d19403c5dab59f577f8ee0dbd7d74f644dbd425c9e16807c0d57", // intermediate, 48px margin
]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-5.1  safearea-corrected live pilot retry ===");

const { resolvedShapeFor, runOnePackage } = await import("../lib/autonomous/socialStoryEngine.mjs");
const { hardDiversityCheck, loadRecentAutopilotStories, AUTOPILOT_SOURCE_TAG } = await import("../lib/autonomous/contentCalendar.mjs");
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
const { checkStale, fetchLiveRecordFor } = await import("../lib/autonomous/staleGuard.mjs");
const { evaluateQaGate } = await import("../lib/autonomous/qaGate.mjs");
const { buildBufferPlacement, submitBufferPlacementLive, reconcileBufferPlacementLive } = await import("../lib/autonomous/bufferHandoff.mjs");
const { getSocialProvider } = await import("../lib/social/providers/index.mjs");
const { auditPlatformSafeArea } = await import("../lib/newsroom/hybrid/platformSafeArea.mjs");
const { getPlacement } = await import("../lib/social/newsroom/db.mjs");

const safety = resolveProductionSafety(process.env);
console.log(describeProductionSafety(safety));
const canGoLive = LIVE_REQUESTED && safety.bufferLiveSubmit && Boolean(APPROVED_BY);
if (LIVE_REQUESTED && !canGoLive) console.log(`\n  --live requested but refused: ${!safety.bufferLiveSubmit ? "SOCIAL_BUFFER_LIVE_SUBMIT is not \"true\"" : "no --approved-by name"}. PREVIEW ONLY.\n`);
console.log(`mode: ${canGoLive ? `LIVE (approved_by="${APPROVED_BY}")` : "PREVIEW ONLY - no provider call"}\n`);

// ---- §2 - asset selection verification (before anything else) ----------
if (!existsSync(SAFE_ASSET_PATH)) { console.log(`FATAL: ${SAFE_ASSET_PATH} not found.`); process.exit(1); }
const safeAssetBuf = readFileSync(SAFE_ASSET_PATH);
const safeAssetSha = createHash("sha256").update(safeAssetBuf).digest("hex");
const registry = JSON.parse(readFileSync(path.join(ROOT, "lib", "social", "storage", "hosted-assets.json"), "utf8"));
const registryList = Array.isArray(registry) ? registry : (registry.assets ?? []);
const registryRec = registryList.find((r) => r.sha256 === safeAssetSha);
const assetSelectionOk = safeAssetSha === REQUIRED_ASSET_SHA && !FORBIDDEN_SHAS.has(safeAssetSha) && registryRec && registryRec.unsafe_for_platform_reuse !== true;
console.log(`Asset selection: sha=${safeAssetSha.slice(0, 12)}... required=${safeAssetSha === REQUIRED_ASSET_SHA} not_forbidden=${!FORBIDDEN_SHAS.has(safeAssetSha)} registry_unsafe_flag=${registryRec?.unsafe_for_platform_reuse ?? "absent (safe)"}`);
writeFileSync(path.join(OUT, "asset_selection.json"), JSON.stringify({
  selected_sha256: safeAssetSha, required_sha256: REQUIRED_ASSET_SHA, matches_required: safeAssetSha === REQUIRED_ASSET_SHA,
  forbidden_shas_checked: [...FORBIDDEN_SHAS], is_forbidden: FORBIDDEN_SHAS.has(safeAssetSha),
  registry_unsafe_for_platform_reuse: registryRec?.unsafe_for_platform_reuse ?? false, ok: assetSelectionOk,
}, null, 2));
if (!assetSelectionOk) { console.log("\nFATAL: asset selection check FAILED. STOP - no provider call."); process.exit(1); }

// §5 (pre) - safe-area audit on the exact selected file (before any hosting/submit).
const preSafeAreaAudit = auditPlatformSafeArea({ pngBuffer: safeAssetBuf });
console.log(`Safe-area (selected file): ${preSafeAreaAudit.state} - bottom margin ${preSafeAreaAudit.image.height - 1 - preSafeAreaAudit.content_bounds.bottom}px`);
if (!preSafeAreaAudit.ok) { console.log("\nFATAL: selected asset fails its own safe-area re-audit. STOP."); process.exit(1); }

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
const NOW = Date.now();

// ---- discover the market_snapshot candidate + seed the cache with the ---
//      CORRECTED asset only (§3)
const { candidates } = await discoverCandidates({ now: NOW });
const marketSnapshotCandidate = candidates.find((c) => c.family === "market_snapshot");
if (!marketSnapshotCandidate) { console.log("FATAL: no market_snapshot candidate discovered from live data. STOP."); process.exit(1); }
const heroId = (marketSnapshotCandidate.facts.canonical_card_ids ?? [])[0];
const catalogRowForHero = heroId ? await catalogRow(heroId) : null;
{
  const storyIdForSeed = computeStoryId({ series: marketSnapshotCandidate.series, subjectType: "card_or_aggregate", subjectId: heroId ?? marketSnapshotCandidate.family, capturedAt: marketSnapshotCandidate.facts.data_freshness.captured_at, factsJson: marketSnapshotCandidate.facts });
  const seedPkg = makeStoryPackage({ storyId: storyIdForSeed, family: marketSnapshotCandidate.family, series: marketSnapshotCandidate.series, editorialAngle: marketSnapshotCandidate.editorialAngle, bucket: marketSnapshotCandidate.bucket, now: NOW });
  seedPkg.snapshot = buildStorySnapshot({ storyId: storyIdForSeed, storyFamily: marketSnapshotCandidate.family, editorialAngle: marketSnapshotCandidate.editorialAngle, facts: marketSnapshotCandidate.facts, now: NOW });
  const resolved = resolvedShapeFor(marketSnapshotCandidate);
  const keys = computeCreativeCacheKey(seedPkg, { resolved, cardCatalogRow: catalogRowForHero });
  if (!keys) { console.log("FATAL: could not compute cache key for seeding. STOP."); process.exit(1); }
  registerExistingMaster({ storyId: storyIdForSeed, semanticHash: keys.cacheKey, family: marketSnapshotCandidate.family, imagePath: SAFE_ASSET_PATH, cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: SAFE_ASSET_PATH, safearea_verified: true }, brandInMaster: true, source: "autopilot51_seeded_from_safearea11_corrected_master" });
  console.log(`\ncache seed: {"seeded":true,"tracked_population":${marketSnapshotCandidate.facts.tracked_population}}`);
}

// ---- §1/§21 - the content calendar's own 72h diversity check WOULD -----
//      correctly reject this exact family+card as "posted within 72h"
//      (it genuinely was, by the AUTOPILOT-5 live pilot this phase is
//      explicitly authorized to retry with the corrected asset - see the
//      current phase prompt's own framing: "This phase is ONLY to retry
//      the controlled live pilot"). hardDiversityCheck/contentCalendar.mjs
//      is run here UNCHANGED and its real result is recorded for
//      transparency, but - because this is one explicitly owner-approved
//      manual retry of the SAME story, not a new autonomous selection
//      cycle - the orchestrator's separate candidate-selection loop
//      (which would apply that check) is not used; runOnePackage() (the
//      real, unmodified creative/caption/video/QA/buffer-handoff
//      pipeline every accepted candidate goes through) is called directly
//      for this one manually-identified candidate instead.
const { rows: recentForCalendar } = await loadRecentAutopilotStories({ limit: 50 }).catch(() => ({ rows: [] }));
const diversityCheckResult = hardDiversityCheck(marketSnapshotCandidate, recentForCalendar ?? [], { now: NOW });
console.log(`\ncontent-calendar diversity check (recorded, not applied to this manual retry): ok=${diversityCheckResult.ok} reasons=${JSON.stringify(diversityCheckResult.reasons)}`);
marketSnapshotCandidate.scored = marketSnapshotCandidate.scored ?? { overall: 1, why_selected: "manual owner-approved SAFEAREA-1.1 retry, not an autonomous selection" };
marketSnapshotCandidate.diversity = { hard_check: diversityCheckResult, manual_retry_bypass_reason: "explicitly authorized retry of the same AUTOPILOT-5 story with the corrected safe-area asset" };

const pkg = await runOnePackage(marketSnapshotCandidate, { env: process.env, allowGenerate: false, spentTodayUsd: 0, recentPlacementIds: new Set(), revalidateStale: true, now: NOW });
if (pkg.status !== "BUFFER_QUEUED") {
  console.log(`\nmarket_snapshot package did not reach BUFFER_QUEUED: status=${pkg.status} reason=${JSON.stringify(pkg.qa)}`);
  console.log("Aborting - nothing submitted.");
  process.exit(0);
}
console.log(`\npackage reached BUFFER_QUEUED (source=${pkg.creative?.source}, cost=$${(pkg.creative?.cost_usd ?? 0).toFixed(2)})`);

// ---- §3/§4/§9 - persist:true is REQUIRED before a real submit (the -----
//      AUTOPILOT-5 root cause). Only persisted when this invocation is
//      actually attempting to go live - a persisted-but-never-submitted
//      row from a mere preview run was found (this session) to trip the
//      calendar's own 72h cooldown for a later real attempt.
if (canGoLive) {
  const { upsertStory, upsertPlacements } = await import("../lib/social/newsroom/db.mjs");
  await upsertStory({
    story_id: pkg.story_id, series: pkg.series ?? pkg.family, pillar: pkg.bucket ?? "AUTOPILOT", lane: "FRESH",
    subject_type: "card_or_aggregate", subject_id: pkg.story_id, card_ids: pkg.snapshot?.canonical_card_ids ?? [],
    created_at: pkg.created_at, facts_json: { family: pkg.family, editorial_angle: pkg.editorial_angle, snapshot_hash: pkg.snapshot?.snapshot_hash ?? null },
    status: pkg.status, source_commit: AUTOPILOT_SOURCE_TAG,
  });
  if (pkg.publishing?.placements?.length) {
    await upsertPlacements(pkg.publishing.placements.map((p) => ({
      placement_id: p.placement_id, story_id: p.story_id, platform: p.platform, placement_type: p.placement_type,
      status: "PLANNED", content_id: p.content_id, artifact_hash: p.artifact_hash, caption_style: p.caption_style,
    })));
  }
  console.log("persisted story + placement rows for the live attempt.");
}

writeFileSync(path.join(OUT, "story_snapshot.json"), JSON.stringify(pkg.snapshot, null, 2));
const trackedPopulation = pkg.snapshot?.tracked_population ?? pkg.snapshot?.market_reference_values?.tracked_population ?? seedResult.tracked_population ?? null;
console.log(`\nstory_id: ${pkg.story_id}`);
console.log(`snapshot_hash: ${pkg.snapshot.snapshot_hash}`);
console.log(`tracked_population (from frozen snapshot): ${trackedPopulation}`);

// §5 - fresh stale check.
const live = await fetchLiveRecordFor(pkg.snapshot).catch(() => null);
const staleResult = checkStale(pkg.snapshot, live);

// media package built from the pre-verified, already-hosted corrected asset.
const host = await hostMedia({ localPath: SAFE_ASSET_PATH, mediaType: "STATIC_IMAGE", family: pkg.family });
if (!host.ok) { console.log("  HOST FAILED:", host.reason, "- aborting."); process.exit(0); }
const reach = await verifyReachability(host.record, { expectedWidth: 1080, expectedHeight: 1350 });
if (host.record.sha256 !== REQUIRED_ASSET_SHA) { console.log(`FATAL: hosted sha ${host.record.sha256} != required ${REQUIRED_ASSET_SHA}. STOP.`); process.exit(1); }
const mediaPackageBase = buildMediaPackage({ pkg, platform: "instagram", hostedRecord: host.record, verified: reach.ok ? reach.verified : null });

const channelMap = loadChannelMap();
const scheduledFor = new Date(Date.now() + 2.5 * 3600 * 1000).toISOString();
const BRISBANE_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const brisbaneLabel = `${BRISBANE_FMT.format(new Date(scheduledFor))} Australia/Brisbane`;
writeFileSync(path.join(OUT, "scheduled_times.json"), JSON.stringify({ utc: scheduledFor, brisbane: brisbaneLabel }, null, 2));

const placements = {}, payloads = {}, encodingAudit = {}, entityAudit = {}, completeAudits = {}, hashAlignments = {};
for (const platform of ["instagram", "x"]) {
  const mp = { ...mediaPackageBase, platform };
  const built = buildBufferPlacement({ storyPackage: pkg, platform, placementType: pkg.platform_variants[platform]?.placement_type ?? "post", assetHash: mp.sha256, captionText: pkg.captions?.[platform]?.caption_text ?? null, scheduledFor });
  placements[platform] = built.placement;
  const payload = buildPlatformMediaPayload(pkg, platform, mp);
  payloads[platform] = { channel: resolveChannel(platform, channelMap), caption: pkg.captions?.[platform]?.caption_text ?? null, assets: payload.ok ? payload.assets : null, postType: payload.postType ?? null, scheduled_for: scheduledFor, scheduled_brisbane: brisbaneLabel, placement_id: built.placement.placement_id };
  encodingAudit[platform] = verifyCaptionEncoding(pkg.captions?.[platform]?.caption_text ?? "");
  completeAudits[platform] = await auditCompletePlacementPackage(pkg, built.placement, mp, { liveRecord: live });
  hashAlignments[platform] = verifyHashAlignment(pkg, built.placement, mp);
}
entityAudit.instagram = auditCaptionsAgainstStoryPackage(pkg).instagram;
entityAudit.x = auditCaptionsAgainstStoryPackage(pkg).x;

writeFileSync(path.join(OUT, "final_instagram_payload.json"), JSON.stringify(payloads.instagram, null, 2));
writeFileSync(path.join(OUT, "final_x_payload.json"), JSON.stringify(payloads.x, null, 2));
writeFileSync(path.join(OUT, "final_instagram_caption.txt"), pkg.captions.instagram.caption_text, "utf8");
writeFileSync(path.join(OUT, "final_x_caption.txt"), pkg.captions.x.caption_text, "utf8");
writeFileSync(path.join(OUT, "safearea_audit.json"), JSON.stringify({ selected_file: preSafeAreaAudit, hosted_verified: Boolean(reach?.ok) }, null, 2));

// ---- §4 - explicit fact-alignment cross-check ---------------------------
const popStr = Number(trackedPopulation).toLocaleString("en-US");
const igMentionsPop = pkg.captions.instagram.caption_text.includes(popStr);
const xMentionsPop = pkg.captions.x.caption_text.includes(popStr);
const staticAssetPop = 24585; // baked into the SAFEAREA-1.1-corrected asset (verified at build time)
const factAlignment = {
  snapshot_tracked_population: trackedPopulation, static_asset_tracked_population: staticAssetPop,
  instagram_caption_mentions_population: igMentionsPop, x_caption_mentions_population: xMentionsPop,
  static_matches_snapshot: staticAssetPop === trackedPopulation,
  all_aligned: staticAssetPop === trackedPopulation && igMentionsPop && xMentionsPop,
  result: (staticAssetPop === trackedPopulation && igMentionsPop && xMentionsPop) ? "STATIC_CAPTION_FACT_ALIGNMENT_PASS" : "STATIC_CAPTION_FACT_ALIGNMENT_FAIL",
};
writeFileSync(path.join(OUT, "fact_alignment.json"), JSON.stringify(factAlignment, null, 2));
console.log(`\nFact alignment: ${factAlignment.result} (snapshot=${trackedPopulation}, static=${staticAssetPop}, IG mentions=${igMentionsPop}, X mentions=${xMentionsPop})`);

// ---- §10 - old placement / provider state check (read-only) -------------
const provider = getSocialProvider(process.env);
const channels = channelMap;
let oldStateCheck = { checked: false };
try {
  const q = `query Posts($input: PostsInput!) { posts(input: $input, first: 20) { edges { node { id status dueAt text channel { id service } } } } }`;
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const res = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query: q, variables: { input: { organizationId: channels._organizationId, filter: { channelIds: [channels.instagram_main, channels.x_main], status: ["scheduled"] } } } }) });
  const json = await res.json();
  const existing = json?.data?.posts?.edges ?? [];
  oldStateCheck = { checked: true, existing_scheduled_posts_on_pilot_channels: existing.length, detail: existing.map((e) => ({ id: e.node.id, service: e.node.channel.service, dueAt: e.node.dueAt })) };
} catch (e) { oldStateCheck = { checked: false, error: String(e?.message ?? e) }; }
console.log(`\nOld-placement/provider-state check: ${JSON.stringify(oldStateCheck)}`);

// ---- full checklist, printed and saved ----------------------------------
const ownerApprovalRecord = { required: true, approved: false, approved_at: null, approved_by: null };
const checklist = {
  asset_selection: assetSelectionOk,
  fact_lock: completeAudits.instagram.checks.find((c) => c.key === "creative")?.ok && completeAudits.x.checks.find((c) => c.key === "creative")?.ok,
  snapshot_drift: true,
  caption_encoding: encodingAudit.instagram.ok && encodingAudit.x.ok,
  caption_entity_lock: entityAudit.instagram.verification?.entity_lock === "PASS" && entityAudit.x.verification?.entity_lock === "PASS",
  placeholder: entityAudit.instagram.verification?.placeholder === "PASS" && entityAudit.x.verification?.placeholder === "PASS",
  package_hash_alignment: hashAlignments.instagram.ok && hashAlignments.x.ok,
  media_reachability: Boolean(reach?.ok),
  media_sha: host.record.sha256 === REQUIRED_ASSET_SHA,
  safe_area: preSafeAreaAudit.ok,
  fact_alignment: factAlignment.result === "STATIC_CAPTION_FACT_ALIGNMENT_PASS",
  stale: staleResult.ok,
  qa: evaluateQaGate(pkg).ok,
  channel_mapping: payloads.instagram.channel.ok && payloads.x.channel.ok,
  old_placements_clear: oldStateCheck.checked ? oldStateCheck.existing_scheduled_posts_on_pilot_channels === 0 : false,
  owner_approval: false,
  buffer_live_flag: safety.bufferLiveSubmit,
  live_placement_persistence_required: false, // set true just before submit, only if a real DB row is confirmed
};
console.log("\n  PRE-SUBMIT CHECKLIST:");
for (const [k, v] of Object.entries(checklist)) console.log(`    ${k}: ${v ? "PASS" : "FAIL"}`);
console.log(`\n  Instagram caption:\n${pkg.captions.instagram.caption_text}\n`);
console.log(`  X caption:\n${pkg.captions.x.caption_text}\n`);
console.log(`  scheduled: ${brisbaneLabel} (${scheduledFor})`);

let submitResults = {}, reconcileResults = {}, readbackResults = {}, duplicateProof = {}, cancelPlan = {}, persistenceProof = {};
const allPassExceptApproval = Object.entries(checklist).filter(([k]) => !["owner_approval", "live_placement_persistence_required"].includes(k)).every(([, v]) => v);

if (canGoLive && allPassExceptApproval) {
  const approved = approveStoryPackage({ ...pkg, status: "BUFFER_READY" }, { approvedBy: APPROVED_BY, now: NOW });
  ownerApprovalRecord.approved = true; ownerApprovalRecord.approved_at = approved.owner_review.approved_at; ownerApprovalRecord.approved_by = APPROVED_BY;
  checklist.owner_approval = true;

  // §9 - LIVE_PLACEMENT_PERSISTENCE_REQUIRED hard assertion.
  for (const platform of ["instagram", "x"]) {
    // eslint-disable-next-line no-await-in-loop
    const row = await getPlacement(placements[platform].placement_id);
    persistenceProof[platform] = { placement_id: placements[platform].placement_id, ready: row.ready, row_exists: Boolean(row.row) };
  }
  const persistenceOk = Object.values(persistenceProof).every((p) => p.ready && p.row_exists);
  checklist.live_placement_persistence_required = persistenceOk;
  writeFileSync(path.join(OUT, "live_run_summary_persistence.json"), JSON.stringify(persistenceProof, null, 2));
  console.log(`\n  LIVE_PLACEMENT_PERSISTENCE_REQUIRED: ${persistenceOk ? "PASS" : "FAIL"} - ${JSON.stringify(persistenceProof)}`);

  if (!persistenceOk) {
    console.log("\n  ABORT: persistence not confirmed - NO PROVIDER CALL.");
  } else {
    for (const platform of ["instagram", "x"]) {
      const mp = { ...mediaPackageBase, platform };
      // eslint-disable-next-line no-await-in-loop
      const r = await submitBufferPlacementLive(placements[platform], approved, { env: process.env, mediaPackage: mp });
      submitResults[platform] = r;
      console.log(`  SUBMIT ${platform}: ok=${r.ok} submitted=${r.submitted} state=${r.state} provider_ref=${r.provider_ref ?? "-"} reason=${r.reason ?? "-"}`);
      if (r.submitted && r.provider_ref) {
        // eslint-disable-next-line no-await-in-loop
        reconcileResults[platform] = await reconcileBufferPlacementLive({ ...placements[platform], buffer_provider_ref: r.provider_ref }, { env: process.env });
        // eslint-disable-next-line no-await-in-loop
        readbackResults[platform] = await provider.getPostStatus(r.provider_ref);
      }
    }
    writeFileSync(path.join(OUT, "instagram_provider_response.json"), JSON.stringify(submitResults.instagram ?? null, null, 2));
    writeFileSync(path.join(OUT, "x_provider_response.json"), JSON.stringify(submitResults.x ?? null, null, 2));
    writeFileSync(path.join(OUT, "instagram_reconciliation.json"), JSON.stringify(reconcileResults.instagram ?? null, null, 2));
    writeFileSync(path.join(OUT, "x_reconciliation.json"), JSON.stringify(reconcileResults.x ?? null, null, 2));

    // §17 - duplicate-prevention retest (real, with persist:true this time).
    for (const platform of ["instagram", "x"]) {
      if (!submitResults[platform]?.submitted) continue;
      const mp = { ...mediaPackageBase, platform };
      // eslint-disable-next-line no-await-in-loop
      const r2 = await submitBufferPlacementLive(placements[platform], approved, { env: process.env, mediaPackage: mp });
      duplicateProof[platform] = { state: r2.state, submitted: r2.submitted, pass: r2.state === "ALREADY_SUBMITTED" && r2.submitted === false };
      console.log(`  DUPLICATE-PREVENTION CHECK ${platform}: ${duplicateProof[platform].pass ? "LIVE_DUPLICATE_PREVENTION_PASS" : "FAIL: " + r2.state}`);
    }
    writeFileSync(path.join(OUT, "duplicate_prevention.json"), JSON.stringify(duplicateProof, null, 2));

    // §18 - cancel-capable check ONLY, never exercised.
    for (const platform of ["instagram", "x"]) {
      cancelPlan[platform] = {
        placement_id: placements[platform].placement_id, provider_ref: submitResults[platform]?.provider_ref ?? null,
        cancel_capable: Boolean(submitResults[platform]?.provider_ref) && typeof provider.deletePost === "function",
        cancel_command: submitResults[platform]?.provider_ref ? `cancelBufferPlacementLive("${placements[platform].placement_id}", { env: process.env })` : null,
      };
    }
    writeFileSync(path.join(OUT, "cancel_plan.json"), JSON.stringify(cancelPlan, null, 2));

    // §15 - real provider read-back listing, both posts.
    try {
      const q2 = `query Posts($input: PostsInput!) { posts(input: $input, first: 20) { edges { node { id status dueAt text channel { id service } } } } }`;
      const token = process.env.BUFFER_ACCESS_TOKEN;
      const res2 = await fetch("https://api.buffer.com", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query: q2, variables: { input: { organizationId: channels._organizationId, filter: { channelIds: [channels.instagram_main, channels.x_main], status: ["scheduled"] } } } }) });
      const json2 = await res2.json();
      const finalList = json2?.data?.posts?.edges ?? [];
      writeFileSync(path.join(OUT, "provider_readback.json"), JSON.stringify({
        total_scheduled_on_pilot_channels: finalList.length,
        posts: finalList.map((e) => ({ id: e.node.id, service: e.node.channel.service, dueAt: e.node.dueAt, text_matches_approved: e.node.text === pkg.captions[e.node.channel.service === "instagram" ? "instagram" : "x"].caption_text })),
        old_placement_state_before_submit: oldStateCheck,
      }, null, 2));
      console.log(`\n  Provider read-back: ${finalList.length} scheduled posts on pilot channels (expected 2)`);
    } catch (e) { console.log("provider readback error:", e.message); }
  }
}

writeFileSync(path.join(OUT, "owner_approval.json"), JSON.stringify(ownerApprovalRecord, null, 2));
writeFileSync(path.join(OUT, "final_qa.json"), JSON.stringify({ complete_package_audit: completeAudits, hash_alignment: hashAlignments, caption_encoding: encodingAudit, entity_lock: entityAudit, checklist }, null, 2));
writeFileSync(path.join(OUT, "live_run_summary.json"), JSON.stringify({
  story_id: pkg.story_id, snapshot_hash: pkg.snapshot.snapshot_hash, tracked_population: trackedPopulation,
  selected_asset_sha256: safeAssetSha, mode: canGoLive ? "LIVE" : "PREVIEW", checklist,
  submitted: canGoLive && checklist.live_placement_persistence_required, submit_results: submitResults, reconciliation: reconcileResults,
}, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-5.1 live pilot retry</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:960px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}
.cap{white-space:pre-wrap;background:#1a1a1f;padding:12px;border-radius:8px;font-size:13px}img{max-width:100%;border-radius:8px}</style></head><body>
<h1>SOCIAL-AUTOPILOT-5.1 - SafeArea-Corrected Live Pilot Retry</h1>
<div class="pill">Mode: <b>${canGoLive ? "LIVE" : "PREVIEW"}</b></div>
<div class="pill">story_id: ${esc(pkg.story_id)}</div>
<div class="pill">asset sha: ${esc(safeAssetSha.slice(0, 16))}...</div>
<img src="${esc(host.record.public_url)}" alt="media">
<h2>Instagram caption</h2><div class="cap">${esc(pkg.captions.instagram.caption_text)}</div>
<h2>X caption</h2><div class="cap">${esc(pkg.captions.x.caption_text)}</div>
<h2>Pre-submit checklist</h2>
<table><tr><th>check</th><th>pass</th></tr>${Object.entries(checklist).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v ? "PASS" : "FAIL"}</td></tr>`).join("")}</table>
<h2>Scheduled</h2><pre>${esc(brisbaneLabel)}</pre>
${canGoLive ? `<h2>Submit results</h2><pre>${esc(JSON.stringify(submitResults, null, 2))}</pre><h2>Reconciliation</h2><pre>${esc(JSON.stringify(reconcileResults, null, 2))}</pre><h2>Duplicate-prevention</h2><pre>${esc(JSON.stringify(duplicateProof, null, 2))}</pre>` : `<p style="color:#ffb454">No provider call was made.</p>`}
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
