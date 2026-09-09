#!/usr/bin/env node
// Phase SOCIAL-AUTOPILOT-2 (§13/§15) - CONTROLLED BUFFER ACTIVATION PROOF.
//
//   node scripts/socialAutopilot2Pack.mjs                        PROPOSE ONLY (default, $0 network to Buffer)
//   node scripts/socialAutopilot2Pack.mjs --seed-cache             also pre-seed a $0 cache-hit master
//   node scripts/socialAutopilot2Pack.mjs --live --approved-by "James"
//                                                                  REAL SUBMIT - requires SOCIAL_BUFFER_LIVE_SUBMIT=true
//                                                                  in the environment AND --approved-by. Without both,
//                                                                  --live is refused and the run falls back to PROPOSE.
//
// Runs against the REAL current database via lib/autonomous/socialStoryEngine
// (SOCIAL-AUTOPILOT-1, unmodified). Prefers a STABLE editorial story
// (market_snapshot) over a live/volatile deal for the first real proof,
// per §13. Selects at most ONE story and at most 2 placements
// (Instagram + X) - never more than necessary to prove the system.

import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const argv = process.argv.slice(2);
const LIVE_REQUESTED = argv.includes("--live");
const SEED_CACHE = argv.includes("--seed-cache") || LIVE_REQUESTED;
const approvedByIdx = argv.indexOf("--approved-by");
const APPROVED_BY = approvedByIdx >= 0 ? argv[approvedByIdx + 1] : null;

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "social-autopilot-2");
const CARD_CACHE = path.join(ROOT, ".social-preview", "card-art-cache");

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
const { submitBufferPlacementLive, buildBufferPlacement } = await import("../lib/autonomous/bufferHandoff.mjs");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("=== SOCIAL-AUTOPILOT-2  controlled Buffer activation proof ===");
const safety = resolveProductionSafety(process.env);
console.log(describeProductionSafety(safety));

const canGoLive = LIVE_REQUESTED && safety.bufferLiveSubmit && Boolean(APPROVED_BY);
if (LIVE_REQUESTED && !canGoLive) {
  console.log(`\n  --live was requested but refused: ${!safety.bufferLiveSubmit ? "SOCIAL_BUFFER_LIVE_SUBMIT is not \"true\"" : "no --approved-by name supplied"}. Falling back to PROPOSE ONLY.\n`);
}
console.log(`mode: ${canGoLive ? `LIVE SUBMIT (approved by "${APPROVED_BY}")` : "PROPOSE ONLY - nothing sent to Buffer"}\n`);

const db = supabaseAdmin();
async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}

const NOW = Date.now();

// §7/§8 reuse pattern from AUTOPILOT-1: seed the exact-key cache for the
// STABLE market_snapshot family (never the volatile live-deal families)
// from the already owner-approved 5A.1 master, so this controlled proof
// spends $0 on image generation.
async function seedMarketSnapshotCache() {
  const { candidates } = await discoverCandidates({ now: NOW });
  const mkt = candidates.find((c) => c.family === "market_snapshot");
  if (!mkt) return { seeded: false, reason: "market_snapshot not discoverable right now" };
  const imagePath = ".social-preview/creative-5a1-final/full/B_market_snapshot.png";
  if (!existsSync(imagePath)) return { seeded: false, reason: `${imagePath} not found` };
  const storyId = computeStoryId({ series: mkt.series, subjectType: "card_or_aggregate", subjectId: (mkt.facts.canonical_card_ids ?? [])[0] ?? mkt.family, capturedAt: mkt.facts.data_freshness.captured_at, factsJson: mkt.facts });
  let pkg = makeStoryPackage({ storyId, family: mkt.family, series: mkt.series, editorialAngle: mkt.editorialAngle, bucket: mkt.bucket, now: NOW });
  pkg.snapshot = buildStorySnapshot({ storyId, storyFamily: mkt.family, editorialAngle: mkt.editorialAngle, facts: mkt.facts, now: NOW });
  const heroId = (mkt.facts.canonical_card_ids ?? [])[0];
  const row = heroId ? await catalogRow(heroId) : null;
  const resolved = resolvedShapeFor(mkt);
  const keys = computeCreativeCacheKey(pkg, { resolved, cardCatalogRow: row });
  if (!keys) return { seeded: false, reason: "no cache key" };
  registerExistingMaster({
    storyId, semanticHash: keys.cacheKey, family: mkt.family, imagePath,
    cardAssets: heroId ? [heroId] : [], verification: { approved: true, derived_values: "EXACT", state: "BUFFER_READY", seeded_from: imagePath },
    brandInMaster: true, source: "autopilot2_seeded_from_approved_5a1_master",
  });
  return { seeded: true, storyId };
}

if (SEED_CACHE) {
  const r = await seedMarketSnapshotCache();
  console.log("  cache seed (market_snapshot):", JSON.stringify(r));
}

// ---- build the package via the UNMODIFIED AUTOPILOT-1 engine ----------
const runResult = await runSocialAutopilot({ allowGenerate: false, persist: false, maxSelected: 8, revalidateStale: true, now: NOW });
const pkg = runResult.selected.find((p) => p.family === "market_snapshot" && p.status === "BUFFER_QUEUED");

writeFileSync(path.join(OUT, "run_summary.json"), JSON.stringify({ ok: runResult.ok, discovery: runResult.discovery, digest: runResult.digest }, null, 2));
writeFileSync(path.join(OUT, "kill_switches.json"), JSON.stringify(safety, null, 2));

const channelMap = loadChannelMap();
const providerMapping = channelMap
  ? { instagram: resolveChannel("instagram", channelMap), x: resolveChannel("x", channelMap), tiktok: resolveChannel("tiktok", channelMap), youtube_shorts: resolveChannel("youtube_shorts", channelMap) }
  : { error: "channels.json not found - run `npm run social:publish -- channels` first" };
writeFileSync(path.join(OUT, "provider_mapping.json"), JSON.stringify(providerMapping, null, 2));

if (!pkg) {
  writeFileSync(path.join(OUT, "proof_candidates.json"), JSON.stringify(runResult.selected.map((p) => ({ story_id: p.story_id, family: p.family, status: p.status })), null, 2));
  console.log("\n  No market_snapshot package reached BUFFER_QUEUED this run (cache seed likely failed or timestamps diverged).");
  console.log(`  See ${path.relative(ROOT, OUT)}/run_summary.json for details.`);
  process.exit(0);
}

writeFileSync(path.join(OUT, "proof_candidates.json"), JSON.stringify(runResult.selected.map((p) => ({ story_id: p.story_id, family: p.family, status: p.status, creative_source: p.creative?.source })), null, 2));

// downgrade back from the dry-run BUFFER_QUEUED to BUFFER_READY so this
// script can demonstrate the REAL AUTOPILOT-2 gates (OWNER_APPROVED ->
// BUFFER_SUBMITTING -> BUFFER_QUEUED) rather than skipping them. This is
// proof-script plumbing only - it never touches the DB.
let controlled = { ...pkg, status: "BUFFER_READY" };

const ownerApprovalRecord = { required: true, approved: false, approved_at: null, approved_by: null, note: canGoLive ? `approved via CLI --approved-by "${APPROVED_BY}"` : "NOT approved - PROPOSE ONLY run" };

const eligiblePlatforms = Object.entries(pkg.platform_variants ?? {}).filter(([p, v]) => v.eligible && (p === "instagram" || p === "x")).map(([p]) => p);
const placements = eligiblePlatforms.map((platform) => {
  const captionKey = platform;
  const built = buildBufferPlacement({ storyPackage: controlled, platform, placementType: pkg.platform_variants[platform].placement_type, assetHash: pkg.creative?.master_image_sha256 ?? null, captionText: pkg.captions?.[captionKey]?.caption_text ?? null, scheduledFor: new Date(Date.now() + 3 * 3600 * 1000).toISOString() });
  return built.ok ? built.placement : null;
}).filter(Boolean);

writeFileSync(path.join(OUT, "live_submit_plan.json"), JSON.stringify({
  story_id: pkg.story_id, family: pkg.family, snapshot_id: pkg.snapshot?.snapshot_id,
  would_submit: placements.map((p) => ({ placement_id: p.placement_id, platform: p.platform, scheduled_for: p.scheduled_for, caption_preview: (pkg.captions?.[p.platform]?.caption_text ?? "").slice(0, 140) + "..." })),
  requires: ["SOCIAL_BUFFER_LIVE_SUBMIT=true", "owner_review.approved === true (via --approved-by)"],
}, null, 2));

let submissionResults = [];
if (canGoLive) {
  controlled = approveStoryPackage(controlled, { approvedBy: APPROVED_BY, now: NOW });
  ownerApprovalRecord.approved = true;
  ownerApprovalRecord.approved_at = controlled.owner_review.approved_at;
  ownerApprovalRecord.approved_by = APPROVED_BY;
  controlled = transition(controlled, "BUFFER_SUBMITTING", { reason: "live submit requested" });
  for (const placement of placements) {
    // eslint-disable-next-line no-await-in-loop
    const r = await submitBufferPlacementLive(placement, controlled, { env: process.env });
    submissionResults.push({ platform: placement.platform, placement_id: placement.placement_id, ...r });
  }
}

writeFileSync(path.join(OUT, "owner_approval.json"), JSON.stringify(ownerApprovalRecord, null, 2));
writeFileSync(path.join(OUT, "idempotency_proof.json"), JSON.stringify({
  dedupe_key_formula: "sha256(story_id :: snapshot_hash :: platform :: placement_type)",
  placements: placements.map((p) => ({ placement_id: p.placement_id, story_id: p.story_id, platform: p.platform })),
}, null, 2));
writeFileSync(path.join(OUT, "reconciliation.json"), JSON.stringify({ note: canGoLive ? "run scripts/socialAutopilot2Pack.mjs's reconcile step (or the CLI) after Buffer's queue has had time to process" : "not applicable - PROPOSE ONLY run", results: submissionResults }, null, 2));
writeFileSync(path.join(OUT, "failure_policy.json"), JSON.stringify({ FAILURE_CLASSES: (await import("../lib/autonomous/bufferHandoff.mjs")).FAILURE_CLASSES, submission_results: submissionResults }, null, 2));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>SOCIAL-AUTOPILOT-2 proof</title>
<style>body{font-family:system-ui,sans-serif;background:#0c0c0f;color:#eee;padding:24px;max-width:900px}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #333;padding:8px 10px;font-size:13px}
th{background:#1a1a1f;text-align:left}h1{color:#e8493d}code{background:#1a1a1f;padding:2px 6px;border-radius:4px}
.pill{display:inline-block;background:#1a1a1f;border:1px solid #333;border-radius:999px;padding:4px 10px;margin:2px}
.warn{color:#ffb454}</style></head><body>
<h1>SOCIAL-AUTOPILOT-2 - Controlled Buffer Activation</h1>
<div class="pill">Mode: <b>${canGoLive ? "LIVE SUBMIT" : "PROPOSE ONLY"}</b></div>
<div class="pill">Story: ${esc(pkg.story_id)} (${esc(pkg.family)})</div>
<div class="pill">Creative: ${esc(pkg.creative?.source)}</div>
<div class="pill">Eligible platforms proposed: ${esc(eligiblePlatforms.join(", "))}</div>
<h2>Kill switches</h2><pre>${esc(JSON.stringify(safety, null, 2))}</pre>
<h2>Would-submit plan</h2>
<table><tr><th>platform</th><th>scheduled_for</th><th>caption preview</th></tr>
${placements.map((p) => `<tr><td>${esc(p.platform)}</td><td>${esc(p.scheduled_for)}</td><td>${esc((pkg.captions?.[p.platform]?.caption_text ?? "").slice(0, 160))}</td></tr>`).join("")}
</table>
${canGoLive ? `<h2>Submission results</h2><table><tr><th>platform</th><th>ok</th><th>state</th><th>provider_ref</th><th>reason</th></tr>${submissionResults.map((r) => `<tr><td>${esc(r.platform)}</td><td>${r.ok}</td><td>${esc(r.state)}</td><td>${esc(r.provider_ref)}</td><td>${esc(r.reason)}</td></tr>`).join("")}</table>` : `<p class="warn">No provider call was made. Re-run with --live --approved-by "&lt;name&gt;" AND SOCIAL_BUFFER_LIVE_SUBMIT=true to actually submit.</p>`}
<p style="color:#888;margin-top:32px">MANUAL_REVIEW mode. Autopilot flag OFF. No cron. No Reddit/SEO/email touched.</p>
</body></html>`;
writeFileSync(path.join(OUT, "index.html"), html);

console.log(`  story: ${pkg.story_id} (${pkg.family}) creative=${pkg.creative?.source} eligible=${eligiblePlatforms.join(",")}`);
if (canGoLive) {
  for (const r of submissionResults) console.log(`    LIVE SUBMIT ${r.platform}: ok=${r.ok} state=${r.state} provider_ref=${r.provider_ref ?? "-"} reason=${r.reason ?? "-"}`);
} else {
  console.log("  PROPOSE ONLY - nothing submitted. See live_submit_plan.json for exactly what would be sent.");
}
console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: ${canGoLive ? "LIVE SUBMIT ATTEMPTED - see reconciliation.json" : "PROPOSED - awaiting explicit owner go-ahead"}`);
