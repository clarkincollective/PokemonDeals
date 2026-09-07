// Phase 13E.6A - FIRST-LIVE BATCH WORKFLOW tests.
//
// Pins: a batch freezes exact placements + copy + artifact hashes + facts;
// approval stamps a checksum that any later edit invalidates; a send
// needs the batch approved AND every independent live switch AND the
// explicit --confirm-live flag; fact drift after approval BLOCKS; a
// changed artifact hash BLOCKS; one placement's failure does not corrupt
// the others; retry reuses the same ledger job and refuses a
// double-submit; sync-batch updates placements independently; provider
// acceptance is never "published"; partial success is represented
// truthfully. No network. No eBay. No Buffer mutation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildBatch,
  approveBatch,
  batchApprovalValid,
  approvalChecksum,
  factDrift,
  batchStatus,
  DEFAULT_SEND_ORDER,
  DRIFT_TOLERANCE,
} from "../../lib/social/distribution/batch.mjs";
import { revalidatePlacement } from "../../lib/social/distribution/revalidate.mjs";
import { applyProviderAccept, applyProviderEvidence, applyProviderReject } from "../../lib/social/distribution/ledger.mjs";
import { readDistributionFlags } from "../../lib/social/distribution/config.mjs";
import { RIGHTS_STATE } from "../../lib/social/rights.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const CID = "pdf-deal-drop-x-20260907-A-abc1234";

// a prepared ledger row for one placement
function row(platform, over = {}) {
  const isX = platform === "x_post";
  return {
    job_id: `${CID}::${platform}::9x16-reel`,
    content_id: CID,
    creative_family: "deal_drop",
    creative_variant: "9x16-reel",
    platform,
    placement: platform === "x_post" ? "post" : platform === "tiktok" ? "video" : platform === "youtube_short" ? "short" : "reel",
    service: platform === "x_post" ? "twitter" : platform === "tiktok" ? "tiktok" : platform === "youtube_short" ? "youtube" : "instagram",
    channel_key: platform === "x_post" ? "x_main" : platform === "tiktok" ? "tiktok_main" : platform === "youtube_short" ? "youtube_main" : "instagram_main",
    channel_id: "chan_1",
    status: "READY",
    caption: `Just found: Ditto\nListed: $39.81\n72% below reference\n\nx.com\n\nAd`,
    youtube_title: platform === "youtube_short" ? "$141 Pokemon Card Listed for $40" : null,
    hashtags: ["#PokemonCards"],
    cta_url: "https://pokemondealfinder.com/deals/30945",
    qa: { ok: true, passed: 39, total: 39, failed: [] },
    rights: { ...RIGHTS_STATE },
    media: isX
      ? { kind: "text_only", files: [], width: 0, height: 0, filesExist: true }
      : { kind: "video_916", files: ["/local/x.mp4"], width: 1080, height: 1920, durationS: 8, filesExist: true },
    public_media_url: isX ? null : "https://cdn.example.com/by-hash/deadbeef.mp4",
    media_sha256: isX ? null : "deadbeef",
    snapshot: {
      market_price: 140.82, discount_pct: 0.72, listed_usd: 39.81,
      source_is_live: true, source_captured_at: new Date().toISOString(),
    },
    ...over,
  };
}
const FRESH_FLAGS = { publishEnabled: true, dryRun: false, epnAiClassification: "NOT_APPLICABLE_CURRENT_PIPELINE", hasBufferToken: true };
const CHANNELS = { instagram_main: "chan_1", tiktok_main: "chan_1", x_main: "chan_1", youtube_main: "chan_1" };
const liveFacts = { listedUsd: 39.81, marketRefUsd: 140.82, discountPct: 0.72 };

test("13E.6A-1. buildBatch freezes exact placements, copy, artifact hashes, source + facts", () => {
  const rows = [row("x_post"), row("instagram_reel"), row("tiktok"), row("youtube_short")];
  const b = buildBatch({ content_id: CID, rows, sourceCommit: "abc1234" });
  assert.equal(b.status, "DRAFT");
  assert.equal(b.content_id, CID);
  assert.equal(b.placements.length, 4);
  assert.deepEqual(b.send_order, ["x_post", "instagram_reel", "tiktok", "youtube_short"]); // §7 default order
  assert.equal(b.frozen_facts.listed_usd, 39.81);
  assert.equal(b.frozen_facts.market_price, 140.82);
  const ig = b.placements.find((p) => p.platform === "instagram_reel");
  assert.equal(ig.approved_artifact_sha256, "deadbeef");
  assert.match(ig.frozen_copy.caption, /Just found: Ditto/);
  assert.equal(b.placements.find((p) => p.platform === "youtube_short").frozen_copy.youtube_title, "$141 Pokemon Card Listed for $40");
  assert.equal(b.owner_approved_at, null);
  assert.equal(b.approval_checksum, null); // not signed yet
});

test("13E.6A-2. approveBatch stamps a checksum; ANY later edit invalidates it", () => {
  const b = buildBatch({ content_id: CID, rows: [row("x_post"), row("instagram_reel")] });
  const r = approveBatch(b, { by: "owner" });
  assert.equal(r.ok, true);
  assert.equal(b.status, "APPROVED");
  assert.ok(b.owner_approved_at && b.approval_checksum?.startsWith("sha256:"));
  assert.equal(batchApprovalValid(b).ok, true);

  // edit the frozen copy -> checksum no longer matches
  b.placements[0].frozen_copy.caption += " EDITED";
  const bad = batchApprovalValid(b);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /checksum mismatch/);

  // swap an artifact hash -> also invalid
  b.placements[0].frozen_copy.caption = b.placements[0].frozen_copy.caption.replace(" EDITED", "");
  assert.equal(batchApprovalValid(b).ok, true);
  b.placements[1].approved_artifact_sha256 = "cafebabe";
  assert.equal(batchApprovalValid(b).ok, false);

  // add a placement -> also invalid
  b.placements[1].approved_artifact_sha256 = "deadbeef";
  assert.equal(batchApprovalValid(b).ok, true);
  b.placements.push({ job_id: "new::x", platform: "tiktok", frozen_copy: {} });
  assert.equal(batchApprovalValid(b).ok, false);
});

test("13E.6A-3. approveBatch does NOT publish and refuses a non-DRAFT / media-less batch", () => {
  const src = read("lib/social/distribution/batch.mjs");
  assert.doesNotMatch(src, /createPost|fetch\(|graph\.buffer|api\.buffer/);
  const b = buildBatch({ content_id: CID, rows: [row("instagram_reel", { public_media_url: null, media_sha256: null })] });
  assert.equal(approveBatch(b).ok, false); // IG placement with no hosted artifact
  const b2 = buildBatch({ content_id: CID, rows: [row("x_post")] });
  approveBatch(b2);
  assert.equal(approveBatch(b2).ok, false); // already APPROVED
});

test("13E.6A-4. fact drift after approval BLOCKS (price / discount / movement / listing ended)", () => {
  const b = buildBatch({ content_id: CID, rows: [row("instagram_reel")] });
  approveBatch(b);
  assert.equal(factDrift(b, liveFacts).drifted, false); // unchanged -> ok
  // price moved a cent -> block
  assert.equal(factDrift(b, { ...liveFacts, listedUsd: 41.5 }).findings[0].action, "BLOCK");
  // discount moved 3 points -> block
  assert.equal(factDrift(b, { ...liveFacts, discountPct: 0.75 }).findings[0].field, "discount_pct");
  // reference wobble within 2% -> NOT drift
  assert.equal(factDrift(b, { ...liveFacts, marketRefUsd: 140.82 * 1.015 }).drifted, false);
  // reference moved 5% -> block
  assert.equal(factDrift(b, { ...liveFacts, marketRefUsd: 140.82 * 1.05 }).drifted, true);
  // listing ended -> CANCEL
  assert.equal(factDrift(b, { ...liveFacts, listing_ended: true }).findings[0].action, "CANCEL");
  // an UNFROZEN fact (movement is null here) never false-triggers
  assert.equal(factDrift(b, { ...liveFacts, movementPct: 0.9 }).drifted, false);
});

test("13E.6A-5. revalidatePlacement: changed artifact hash BLOCKS; unchanged everything passes only with live switches", () => {
  const b = buildBatch({ content_id: CID, rows: [row("instagram_reel")] });
  approveBatch(b);
  const r0 = row("instagram_reel", { status: "APPROVED" });
  const variant = { media: r0.media, qa: r0.qa, rights: r0.rights, caption_instagram: r0.caption, facts: liveFacts, snapshot: r0.snapshot };

  // local file sha no longer matches the approved artifact -> asset_hash blocker
  const drifted = revalidatePlacement({
    row: r0, batch: b, variant, liveFacts, currentMediaSha: "beefdead",
    flags: FRESH_FLAGS, providerConfigured: true, channels: CHANNELS, ledger: [],
  });
  assert.equal(drifted.ok, false);
  assert.ok(drifted.blockers.some((x) => x.startsWith("asset_hash")));

  // clean: everything matches, live switches on -> the ONLY thing left is
  // publish_switch (RIGHTS_STATE.publishing is DISABLED in source)
  const clean = revalidatePlacement({
    row: r0, batch: b, variant, liveFacts, currentMediaSha: "deadbeef",
    flags: FRESH_FLAGS, providerConfigured: true, channels: CHANNELS, ledger: [],
  });
  assert.equal(clean.blockers.filter((x) => !x.startsWith("publish_switch")).length, 0, JSON.stringify(clean.blockers));
});

test("13E.6A-6. copy is NEVER mutated at send time - a drifted row caption is a blocker, not a silent fix", () => {
  const b = buildBatch({ content_id: CID, rows: [row("instagram_reel")] });
  approveBatch(b);
  const r0 = row("instagram_reel", { status: "APPROVED", caption: "SOMEONE EDITED THIS AFTER APPROVAL" });
  const variant = { media: r0.media, qa: r0.qa, rights: r0.rights, caption_instagram: r0.caption, facts: liveFacts, snapshot: r0.snapshot };
  const rv = revalidatePlacement({ row: r0, batch: b, variant, liveFacts, currentMediaSha: "deadbeef", flags: FRESH_FLAGS, providerConfigured: true, channels: CHANNELS, ledger: [] });
  assert.ok(rv.blockers.some((x) => x.startsWith("copy_frozen")));
});

test("13E.6A-7. one placement failure does not corrupt the others; partial success is truthful", () => {
  const rows = [row("x_post"), row("instagram_reel"), row("tiktok"), row("youtube_short")];
  const b = buildBatch({ content_id: CID, rows });
  approveBatch(b);
  // simulate: X + IG queued, TikTok failed, YouTube queued
  const ledger = rows.map((r) => ({ ...r, status: "APPROVED" }));
  applyProviderAccept(ledger[0], { provider: "buffer", providerRef: "p-x" });
  applyProviderAccept(ledger[1], { provider: "buffer", providerRef: "p-ig" });
  applyProviderReject(ledger[2], { provider: "buffer", reason: "buffer_error" });
  applyProviderAccept(ledger[3], { provider: "buffer", providerRef: "p-yt" });
  assert.equal(ledger[0].status, "QUEUED");
  assert.equal(ledger[2].status, "FAILED");
  assert.equal(ledger[2].retry_count, 1);
  assert.equal(batchStatus(b, ledger), "PARTIAL_SUCCESS");
  // the failed one carries no provider_ref -> retry is allowed; the others untouched
  assert.equal(ledger[2].provider_ref ?? null, null);
  assert.equal(ledger[1].provider_ref, "p-ig");
});

test("13E.6A-8. provider acceptance is QUEUED, never PUBLISHED; sync promotes only on real evidence, independently", () => {
  const rows = [row("x_post"), row("instagram_reel")];
  const ledger = rows.map((r) => ({ ...r, status: "APPROVED" }));
  applyProviderAccept(ledger[0], { provider: "buffer", providerRef: "p-x" });
  applyProviderAccept(ledger[1], { provider: "buffer", providerRef: "p-ig" });
  assert.equal(ledger[0].status, "QUEUED");
  assert.equal(ledger[0].published_at ?? null, null);
  // sync X: real sent evidence -> PUBLISHED with the provider timestamp
  applyProviderEvidence(ledger[0], { ok: true, published: true, publishedAt: "2026-09-07T05:00:00.000Z" });
  assert.equal(ledger[0].status, "PUBLISHED");
  assert.equal(ledger[0].published_at, "2026-09-07T05:00:00.000Z");
  // sync IG: no evidence yet -> stays QUEUED, independent of X
  applyProviderEvidence(ledger[1], { ok: true, published: false, publishedAt: null });
  assert.equal(ledger[1].status, "QUEUED");
});

test("13E.6A-9. the CLI: send-batch needs --confirm-live AND all live switches; retry refuses a double-submit", () => {
  const cli = read("scripts/socialPublish.mjs");
  const sb = cli.slice(cli.indexOf("async function cmdSendBatch"), cli.indexOf("async function submitOne"));
  assert.match(sb, /opts\.confirmLive !== true[\s\S]*?requires the explicit  --confirm-live/);
  assert.match(sb, /RIGHTS_STATE\.publishing !== "ALLOWED"/);
  assert.match(sb, /SOCIAL_PUBLISH_ENABLED != true/);
  assert.match(sb, /SOCIAL_PUBLISH_DRY_RUN is not/);
  assert.match(sb, /SOCIAL_EPN_AI_CLASSIFICATION not set/);
  assert.match(sb, /batchApprovalValid/);
  // one failure doesn't stop the loop
  assert.match(sb, /One failure does\s*\n?\s*\/\/ NOT stop the others|does NOT stop the others/i);

  const rt = cli.slice(cli.indexOf("async function cmdRetry"), cli.indexOf("async function cmdSyncBatch"));
  assert.match(rt, /row\.status !== "FAILED"/);
  assert.match(rt, /row\.provider_ref\)[\s\S]*?do NOT re-submit/);
  assert.match(rt, /batchApprovalValid/);
  assert.match(rt, /opts\.confirmLive !== true/);
});

test("13E.6A-10. sync-batch polls every QUEUED placement; provider truth (accepted != published)", () => {
  const cli = read("scripts/socialPublish.mjs");
  const sb = cli.slice(cli.indexOf("async function cmdSyncBatch"), cli.indexOf("function cmdBatches"));
  assert.match(sb, /row\.status !== "QUEUED"/);
  assert.match(sb, /PROVIDER\.getPostStatus\(row\.provider_ref\)/);
  assert.match(sb, /applyProviderEvidence/);
  assert.doesNotMatch(sb, /published_at\s*=\s*new Date\(\)/); // never a local clock
});

test("13E.6A-11. batches.json + ledger.json are committed empty; DEFAULT_SEND_ORDER is X-first", () => {
  assert.deepEqual(JSON.parse(read("lib/social/distribution/batches.json")), []);
  assert.deepEqual(JSON.parse(read("lib/social/distribution/ledger.json")), []);
  assert.equal(DEFAULT_SEND_ORDER[0], "x_post");
  assert.ok(DEFAULT_SEND_ORDER.indexOf("youtube_short") === DEFAULT_SEND_ORDER.length - 1);
  assert.ok(DRIFT_TOLERANCE.listed_usd_abs <= 0.01);
});

test("13E.6A-12. no eBay / OpenAI / Buffer-mutation coupling in the batch layer", () => {
  for (const f of ["lib/social/distribution/batch.mjs", "lib/social/distribution/revalidate.mjs"]) {
    const src = read(f);
    assert.doesNotMatch(src, /ebay|browse|verify-deals|openai|createPost|api\.buffer|graph\.buffer/i);
    assert.doesNotMatch(src, /\bfetch\s*\(/);
  }
});

test("13E.6A-13. live switches remain OFF by default (nothing this phase changed that)", () => {
  assert.equal(RIGHTS_STATE.publishing, "DISABLED");
  const def = readDistributionFlags({});
  assert.equal(def.publishEnabled, false);
  assert.equal(def.dryRun, true);
  assert.equal(def.epnAiClassification, null);
});
