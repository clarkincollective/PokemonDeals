#!/usr/bin/env node
// Phase 13E.5A / 13E.5B - SOCIAL DISTRIBUTION CLI (dry-run by default; NON-PUBLISHING).
//
//   npm run social:publish -- list                       show artifacts + ledger
//   npm run social:publish -- channels                   discover Buffer channels
//   npm run social:publish -- prepare <id> <platform> [--cut reel|tiktok] [--at <iso>]
//                                                        build/refresh a DRAFT ledger row (freezes the copy)
//   npm run social:publish -- dry-run <job_id>           run the full gate stack, mutate NOTHING external
//   npm run social:publish -- approve <job_id>           READY -> APPROVED (explicit human approval)
//   npm run social:publish -- send <job_id> [--force]    HARD-FAILS unless every gate passes
//   npm run social:publish -- sync <job_id>              poll the provider; QUEUED -> PUBLISHED only on real evidence
//   npm run social:publish -- metrics <job_id>           READ-ONLY: pull the provider's metrics, append a snapshot
//   npm run social:publish -- metrics-batch <batch_id>   READ-ONLY: metrics for every placement in a batch
//   npm run social:publish -- review-pack                build the dry-run 4-platform distribution review pack
//
//   (see also  npm run social:metrics -- sync | report  — the same read-only measurement layer)
//
//   <platform> = instagram_feed | instagram_carousel | instagram_reel | tiktok | x_post | youtube_short
//   <id>       = a content_id, a "<source>/<family>" key (e.g. video:13e4/deal_drop),
//                or a daily content_type (e.g. deal_of_day)
//
// This script CANNOT publish in Phase 13E.5A/B: SOCIAL_PUBLISH_ENABLED is
// unset, RIGHTS_STATE.publishing is "DISABLED", EPN_AI_TOOLS_APPROVED is
// unset, and SOCIAL_PUBLISH_DRY_RUN defaults to on. `send` checks all of
// these (and ~11 more) independently and refuses. `dry-run` is the verb.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { readDistributionFlags, describeFlags, toUtcIso, brisbaneLabel } from "../lib/social/distribution/config.mjs";
import {
  LEDGER_PATH,
  loadLedger,
  saveLedger,
  findJob,
  jobId,
  markReady,
  approve as approveRow,
  applyProviderAccept,
  applyProviderReject,
  applyProviderEvidence,
  duplicateOf,
  distributedInWindow,
} from "../lib/social/distribution/ledger.mjs";
import { runAllGates, readinessGates } from "../lib/social/distribution/gates.mjs";
import { resolveArtifactVariant, listAllArtifacts } from "../lib/social/distribution/artifacts.mjs";
import {
  PLATFORM_CHANNEL_KEY,
  PLATFORM_POST_TYPE,
  PLATFORM_PLACEMENT,
  PLATFORM_SERVICE,
} from "../lib/social/distribution/artifactMap.mjs";
import { getSocialProvider } from "../lib/social/providers/index.mjs";
import {
  loadBatches,
  saveBatches,
  findBatch,
  buildBatch,
  approveBatch,
  batchApprovalValid,
  batchStatus,
  DEFAULT_SEND_ORDER,
} from "../lib/social/distribution/batch.mjs";
import { revalidatePlacement } from "../lib/social/distribution/revalidate.mjs";
import { attributedCtaUrl, SITE_ORIGIN, parseAttribution, hasSocialAttribution } from "../lib/social/distribution/attribution.mjs";
import { emptyMetrics, normalizeProviderMetrics, buildSnapshot, attachSnapshot } from "../lib/social/distribution/metrics.mjs";
import { getStorageProvider } from "../lib/social/storage/index.mjs";
import {
  loadHostedAssets,
  saveHostedAssets,
  findByHash,
  findByAssetId,
  buildHostedRecord,
  canHost,
  assetMatches,
  sha256,
  EXT_MIME,
} from "../lib/social/storage/hostedAssets.mjs";
import { readFileSync as fsRead } from "node:fs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";

const CHANNELS_PATH = path.join(process.cwd(), "lib", "social", "distribution", "channels.json");
const REVIEW_PACK_DIR = path.join(process.cwd(), ".social-preview", "distribution-review-pack");
const STORAGE = getStorageProvider();

const flags = readDistributionFlags();
const PROVIDER = getSocialProvider();

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}
function headGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
function loadChannels() {
  try {
    return JSON.parse(readFileSync(CHANNELS_PATH, "utf8"));
  } catch {
    return {};
  }
}
// Resolve the FROZEN platform-appropriate copy (§4). IG/TikTok reuse
// lib/social/caption.mjs output; X + YouTube use the deterministic
// platformCopy.mjs derivations carried on the variant.
function copyForPlatform(platform, variant) {
  if (platform === "tiktok") return { text: variant.caption_tiktok ?? "", title: null, error: null };
  if (platform.startsWith("instagram")) return { text: variant.caption_instagram ?? "", title: null, error: null };
  if (platform === "x_post") {
    return variant.x?.ok ? { text: variant.x.text, title: null, error: null } : { text: "", title: null, error: variant.x?.reason ?? "no X copy" };
  }
  if (platform === "youtube_short") {
    return variant.youtube?.ok
      ? { text: variant.youtube.description, title: variant.youtube.title, error: null }
      : { text: "", title: null, error: variant.youtube?.reason ?? "no YouTube copy" };
  }
  return { text: "", title: null, error: `no copy mapping for ${platform}` };
}

// The media a placement actually carries. X text posts have no file; a 9:16
// video master is reused as-is for Reel / TikTok / YouTube Short.
function mediaForPlatform(platform, variant) {
  if (platform === "x_post") {
    if (variant.media.kind === "image_45") return { ...variant.media };
    return { kind: "text_only", files: [], width: 0, height: 0, filesExist: true }; // no file to check; the caption gate covers it
  }
  return { ...variant.media };
}

// The single local media file for a media object.
function primaryLocalFile(media) {
  return (media.files ?? []).find(Boolean) ?? null;
}

// Look up (not upload) the hosted-asset record that already covers this
// media's exact bytes. Returns { record, sha } or null.
function hostedFor(media) {
  const f = primaryLocalFile(media);
  if (!f || !existsSync(f)) return null;
  const sha = sha256(fsRead(f));
  const rec = findByHash(loadHostedAssets(), sha);
  return rec ? { record: rec, sha } : { record: null, sha };
}

function banner() {
  console.log("\n  === social:publish — Phase 13E.5B (dry-run / non-publishing) ===");
  console.log(`  ${describeFlags(flags)}`);
  console.log(`  rights.publishing = ${RIGHTS_STATE.publishing}   provider = ${PROVIDER.name}${PROVIDER.isConfigured() ? " (configured)" : " (not configured)"}`);
  console.log("");
}

// ---- commands -------------------------------------------------------

function cmdList() {
  banner();
  const arts = listAllArtifacts();
  console.log("  ARTIFACTS (from .social-preview/):");
  if (!arts.length) console.log("    (none — run npm run social:daily and/or npm run social:video first)");
  for (const a of arts) {
    const tag = a.stale ? " [STALE — re-run social:daily]" : "";
    console.log(`    ${a.source.padEnd(16)} ${String(a.creative_family).padEnd(15)} ${a.content_id ?? "(no id)"}${tag}`);
    for (const v of a.variants) {
      console.log(`        variant ${String(v.creative_variant).padEnd(12)} media=${v.media.kind} qa.ok=${v.qa?.ok} files=${v.media.filesExist ? "present" : "MISSING"}`);
    }
  }
  const ledger = loadLedger();
  console.log(`\n  LEDGER (${LEDGER_PATH}):`);
  if (!ledger.length) console.log("    (empty — nothing has been prepared)");
  for (const r of ledger) {
    console.log(`    [${String(r.status).padEnd(9)}] ${r.job_id}`);
    console.log(`        platform=${r.platform} channel=${r.channel_id ?? "(unresolved)"} provider_ref=${r.provider_ref ?? "-"} scheduled=${brisbaneLabel(r.scheduled_for)}`);
  }
  console.log(`\n  distributed (QUEUED+PUBLISHED) in last 24h: ${distributedInWindow(ledger)}`);
  console.log("");
}

async function cmdChannels() {
  banner();
  if (!PROVIDER.isConfigured()) {
    console.log("  BLOCKED ON OWNER AUTH: no BUFFER_ACCESS_TOKEN.");
    console.log("  1. In Buffer, connect Instagram (Business/Creator), TikTok (Business), X, and YouTube.");
    console.log("  2. Generate an API key at https://publish.buffer.com/settings/api");
    console.log("  3. Put  BUFFER_ACCESS_TOKEN=...  in .env.local  (gitignored, server-side only)");
    console.log("  4. Re-run this command; it will print the channel ids to map into");
    console.log(`     ${path.relative(process.cwd(), CHANNELS_PATH)}`);
    console.log("");
    return;
  }
  const r = await PROVIDER.listChannels();
  if (!r.ok) die(`channel discovery failed: ${r.reason} ${r.detail ?? ""}`.trim());
  const alias = { instagram: "instagram_main", tiktok: "tiktok_main", twitter: "x_main", youtube: "youtube_main" };
  console.log(`  Connected Buffer channels (org ${r.organizationId}):`);
  for (const c of r.channels) {
    console.log(`    ${String(c.service).padEnd(12)} -> ${(alias[c.service] ?? "?").padEnd(15)} id=${c.id}  name=${JSON.stringify(c.name)}  type=${c.type}  locked=${c.locked}  disconnected=${c.disconnected}`);
  }
  console.log(`\n  Map each id to its alias in  ${path.relative(process.cwd(), CHANNELS_PATH)}`);
  console.log("");
}

function buildRow({ artifact, variant, platform, scheduledForIso }) {
  const channels = loadChannels();
  const channelKey = PLATFORM_CHANNEL_KEY[platform];
  const copy = copyForPlatform(platform, variant);
  const media = mediaForPlatform(platform, variant);
  const f = variant.facts ?? {};
  // Freeze the PUBLIC hosted-media URL if this placement carries a media
  // file and one has already been hosted (content-addressed). X text-only
  // posts carry no media and stay { null }.
  const needsMedia = media.kind !== "text_only";
  const h = needsMedia ? hostedFor(media) : null;
  // 13E.7A - stamp deterministic first-party campaign attribution onto the
  // on-site CTA for THIS placement's platform. Never touches the eBay
  // affiliate URL. Falls back to the bare link if it can't be attributed.
  const baseCta = variant.cta_url ?? `${SITE_ORIGIN}/deals`;
  let ctaUrl;
  try {
    ctaUrl = attributedCtaUrl({
      baseUrl: baseCta,
      platform,
      contentGoal: artifact.content_goal ?? null,
      contentId: artifact.content_id ?? variant.content_id ?? null,
      contentFamily: artifact.creative_family ?? null,
    });
  } catch {
    ctaUrl = baseCta;
  }
  return {
    job_id: jobId({ content_id: artifact.content_id ?? variant.content_id, platform, creative_variant: variant.creative_variant }),
    content_id: artifact.content_id ?? variant.content_id ?? null,
    creative_family: artifact.creative_family,
    creative_variant: variant.creative_variant,
    platform,
    placement: PLATFORM_PLACEMENT[platform],
    service: PLATFORM_SERVICE[platform],
    content_goal: artifact.content_goal ?? null,
    // 13E.7A §2 - full identity for later performance comparison
    hook_variant: artifact.hook_variant ?? variant.hook_variant ?? null,
    cta_variant: artifact.cta_variant ?? variant.cta_variant ?? null,
    media: {
      kind: media.kind,
      files: media.files ?? [],
      width: media.width ?? 0,
      height: media.height ?? 0,
      durationS: media.durationS ?? null,
      itemCount: media.itemCount ?? null,
      filesExist: media.filesExist,
    },
    // frozen public media (13E.5C) - Buffer fetches this URL; there is NO
    // upload at send time. null for a text-only X post, or when the
    // artifact has not been hosted yet.
    hosted_asset_id: h?.record?.asset_id ?? null,
    public_media_url: h?.record?.public_url ?? null,
    media_sha256: h?.sha ?? null,
    caption: copy.text ?? "",
    youtube_title: copy.title ?? null,
    copy_error: copy.error ?? null,
    hashtags: variant.hashtags ?? [],
    first_comment: variant.first_comment ?? null,
    cta_url: ctaUrl,
    cta_attribution: parseAttribution(ctaUrl),
    channel_key: channelKey,
    channel_id: channels[channelKey] ?? null,
    provider: null,
    provider_ref: null,
    status: "DRAFT",
    qa: variant.qa ?? null,
    rights: variant.rights ?? artifact.rights ?? null,
    source: artifact.source,
    source_commit: headGitCommit(),
    // frozen deterministic facts - carried in a shape the gate + batch read
    snapshot: {
      ...(variant.snapshot ?? {}),
      market_price: f.marketRefUsd ?? variant.snapshot?.market_price ?? null,
      discount_pct: f.discountPct ?? variant.snapshot?.discount_pct ?? null,
      listed_usd: f.listedUsd ?? variant.snapshot?.listed_usd ?? null,
      movement: f.movementPct != null ? { pct: f.movementPct, direction: f.movementDirection, windowLabel: f.movementWindow } : (variant.snapshot?.movement ?? null),
      facts_source: f.source ?? null,
    },
    scheduled_for: scheduledForIso,
    created_at: new Date().toISOString(),
    approved_at: null,
    queued_at: null,
    published_at: null,
    failed_at: null,
    last_error: null,
    retry_count: 0,
    dry_runs: [],
    // 13E.6A §17-18 / 13E.7A §9 - post-publish verification + read-only
    // performance tracking. `metrics` is the newest reading (every key
    // null = "no reading", NOT zero); `metrics_snapshots` is the timestamped
    // history; `metrics_error` holds the last failed sync (last good
    // snapshot is retained, never overwritten with zeros).
    platform_post_url: null,
    metrics: emptyMetrics(),
    metrics_snapshots: [],
    metrics_error: null,
    last_metrics_sync: null,
    // §14 content-experiment tags - design only, inert until an experiment
    // is explicitly started (no experiments run in 13E.7A).
    experiment_id: null,
    experiment_variant: null,
    experiment_hypothesis: null,
    history: [{ at: new Date().toISOString(), from: null, to: "DRAFT", note: "prepared from artifact" }],
  };
}

function cutFor(platform, explicit) {
  if (explicit) return explicit;
  if (platform === "tiktok") return "tiktok";
  if (platform === "instagram_reel" || platform === "youtube_short" || platform === "x_post") return "reel";
  return null; // instagram_feed / instagram_carousel -> daily static
}

function cmdPrepare(idOrKey, platform, opts) {
  banner();
  if (!idOrKey || !platform) die("usage: social:publish -- prepare <id> <platform> [--cut reel|tiktok] [--at <iso>]");
  if (!PLATFORM_CHANNEL_KEY[platform]) die(`unknown platform "${platform}". one of: ${Object.keys(PLATFORM_CHANNEL_KEY).join(", ")}`);
  let scheduledForIso = null;
  try {
    scheduledForIso = toUtcIso(opts.at);
  } catch (e) {
    die(e.message);
  }
  const cut = cutFor(platform, opts.cut);
  let res = resolveArtifactVariant(idOrKey, { platformCut: cut });
  if (!res.ok && cut === "reel") res = resolveArtifactVariant(idOrKey, { platformCut: "tiktok" }); // some families only cut one way
  if (!res.ok) die(res.reason);
  const { artifact, variant } = res;

  const ledger = loadLedger();
  const row = buildRow({ artifact, variant, platform, scheduledForIso });

  // reuse a non-terminal existing row for the same placement (retry, not
  // a new duplicate). A QUEUED/PUBLISHED row blocks re-prepare entirely.
  const existing = findJob(ledger, row.job_id);
  if (existing && ["QUEUED", "PUBLISHED"].includes(existing.status)) {
    die(`"${row.job_id}" is already ${existing.status} - refusing to re-prepare (use sync/cancel).`);
  }
  const dup = duplicateOf(row, ledger);
  if (dup) die(`a different row is already ${dup.status} for this exact placement: ${dup.job_id}`);

  let out;
  if (existing) {
    // refresh the frozen fields but keep id + history
    Object.assign(existing, {
      media: row.media,
      placement: row.placement,
      service: row.service,
      hosted_asset_id: row.hosted_asset_id,
      public_media_url: row.public_media_url,
      media_sha256: row.media_sha256,
      caption: row.caption,
      youtube_title: row.youtube_title,
      copy_error: row.copy_error,
      hashtags: row.hashtags,
      first_comment: row.first_comment,
      cta_url: row.cta_url,
      channel_id: row.channel_id,
      qa: row.qa,
      rights: row.rights,
      snapshot: row.snapshot,
      scheduled_for: row.scheduled_for,
      source_commit: row.source_commit,
      status: "DRAFT",
    });
    existing.history.push({ at: new Date().toISOString(), from: existing.status, to: "DRAFT", note: "re-prepared (copy re-frozen)" });
    out = existing;
  } else {
    ledger.push(row);
    out = row;
  }

  // run readiness gates (everything except approval + live switch)
  const rg = readinessGates({
    row: out,
    variant,
    flags,
    providerConfigured: PROVIDER.isConfigured(),
    ledger,
  });
  const mr = markReady(out, { gatesOk: rg.ok, blockers: rg.blockers });
  saveLedger(ledger);

  console.log(`  prepared  ${out.job_id}`);
  console.log(`  family=${out.creative_family}  variant=${out.creative_variant}  platform=${out.platform} (${out.placement})  goal=${out.content_goal}`);
  console.log(`  channel_key=${out.channel_key}  channel_id=${out.channel_id ?? "(unresolved)"}`);
  console.log(`  media: ${out.media.kind === "text_only" ? "text_only (no media file)" : `${out.media.kind} ${out.media.width}x${out.media.height}${out.media.durationS ? ` ${out.media.durationS}s` : ""}  files ${out.media.filesExist ? "present" : "MISSING"}`}`);
  console.log(`  cta: ${out.cta_url}`);
  console.log(`  scheduled_for: ${brisbaneLabel(out.scheduled_for)}`);
  if (out.youtube_title) console.log(`  YouTube title (FROZEN, ${out.youtube_title.length} chars): ${out.youtube_title}`);
  if (out.copy_error) console.log(`  copy: NOT BUILT — ${out.copy_error}`);
  console.log(`  copy (FROZEN, ${out.caption.length} chars):`);
  console.log(out.caption.split("\n").map((l) => "      " + l).join("\n"));
  console.log(`  hashtags: ${out.hashtags.join(" ")}`);
  console.log("");
  console.log(`  readiness gates: ${rg.ok ? "ALL PASS" : "BLOCKED"}`);
  for (const g of rg.gates) console.log(`    [${g.ok ? "ok " : "no "}] ${g.id} — ${g.detail}`);
  console.log(`  status: ${out.status}${mr.ok ? "" : `  (${mr.reason})`}`);
  console.log("");
}

function requireJob(id) {
  const ledger = loadLedger();
  const row = findJob(ledger, id);
  if (!row) die(`no ledger row "${id}" (try: social:publish -- list)`);
  return { ledger, row };
}

// sha256 of the row's local media file RIGHT NOW - for the asset-drift gate.
function currentMediaShaOf(row) {
  const f = (row.media?.files ?? []).find(Boolean);
  if (!f || !existsSync(f)) return null;
  return sha256(fsRead(f));
}

function reResolveVariant(row) {
  const cut = cutFor(row.platform, null);
  let res = resolveArtifactVariant(row.content_id, { platformCut: cut });
  if (!res.ok && cut === "reel") res = resolveArtifactVariant(row.content_id, { platformCut: "tiktok" });
  return res.ok ? res.variant : null;
}

function cmdDryRun(id) {
  banner();
  const { ledger, row } = requireJob(id);
  const variant = reResolveVariant(row) ?? { qa: row.qa, rights: row.rights, media: row.media, snapshot: row.snapshot, caption_instagram: row.caption, caption_tiktok: row.caption };
  const full = runAllGates({ row, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger, currentMediaSha: currentMediaShaOf(row) });
  row.dry_runs = row.dry_runs ?? [];
  row.dry_runs.push({ at: new Date().toISOString(), gates_ok: full.ok, blockers: full.blockers });
  saveLedger(ledger);

  console.log(`  DRY RUN — ${row.job_id}`);
  console.log(`  (no provider call, no ledger state change, nothing left this machine)\n`);
  for (const g of full.gates) console.log(`    [${g.ok ? "ok " : "NO "}] ${g.id} — ${g.detail}`);
  console.log("");
  if (full.ok) {
    console.log("  ALL GATES PASS. `send` WOULD submit this to the provider now (still not SENT/PUBLISHED until sync evidence).");
  } else {
    console.log(`  BLOCKED by ${full.blockers.length} gate(s):`);
    for (const b of full.blockers) console.log(`    - ${b}`);
  }
  console.log("");
}

function cmdApprove(id) {
  banner();
  const { ledger, row } = requireJob(id);
  if (row.status === "DRAFT") die(`"${id}" is DRAFT — run prepare again; it only reaches READY when every non-approval gate passes.`);
  const r = approveRow(row, { by: "owner" });
  if (!r.ok) die(r.reason);
  saveLedger(ledger);
  console.log(`  ✓ ${id} -> APPROVED  (this alone does NOT publish — send still runs every gate)\n`);
}

async function cmdSend(id, opts) {
  banner();
  const { ledger, row } = requireJob(id);
  const variant = reResolveVariant(row) ?? { qa: row.qa, rights: row.rights, media: row.media, snapshot: row.snapshot, caption_instagram: row.caption, caption_tiktok: row.caption };

  const full = runAllGates({ row, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger, force: opts.force === true, currentMediaSha: currentMediaShaOf(row) });
  if (!full.ok) {
    console.log("  send BLOCKED — the following gates are not satisfied:\n");
    for (const b of full.blockers) console.log(`    - ${b}`);
    console.log("\n  Nothing was submitted. Nothing left this machine.\n");
    process.exit(1);
  }

  // Defence in depth: even past the gate stack, refuse if the null
  // provider is active or the master rights flag is not ALLOWED.
  if (!PROVIDER.isConfigured() || RIGHTS_STATE.publishing !== "ALLOWED") {
    die("internal guard: provider unconfigured or RIGHTS_STATE.publishing != ALLOWED — refusing to submit.");
  }

  // Buffer requires a PUBLIC asset URL (no direct upload). It is FROZEN on
  // the row (row.public_media_url) at prepare time from the hosted-asset
  // record - there is NO upload here at send time. Text-only X posts have
  // no asset.
  const assets = row.media.kind === "text_only" || !row.public_media_url
    ? []
    : [{ type: row.media.kind === "video_916" ? "video" : "image", url: row.public_media_url }];
  const msg = {
    channelId: row.channel_id,
    platform: row.service, // "instagram" | "tiktok" | "twitter" | "youtube"
    placement: row.placement, // "feed" | "carousel" | "reel" | "video" | "post" | "short"
    text: row.caption,
    assets,
    dueAt: row.scheduled_for,
    saveToDraft: false,
    schedulingType: "automatic",
    postType: PLATFORM_POST_TYPE[row.platform],
    firstComment: row.first_comment,
    youtubeTitle: row.youtube_title ?? null,
    tiktokTitle: row.platform === "tiktok" ? null : null,
    siteLink: row.platform === "instagram_feed" ? row.cta_url : null,
  };
  const res = await PROVIDER.createPost(msg);
  if (res?.accepted) {
    applyProviderAccept(row, { provider: PROVIDER.name, providerRef: res.id });
    saveLedger(ledger);
    console.log(`  ✓ accepted by ${PROVIDER.name} (post ${res.id}). status: QUEUED — NOT published.`);
    console.log(`  confirm with:  npm run social:publish -- sync ${id}\n`);
  } else {
    applyProviderReject(row, { provider: PROVIDER.name, reason: res?.reason ?? "unknown", detail: res?.detail ?? "" });
    saveLedger(ledger);
    die(`provider rejected the post (${res?.reason}). Row marked FAILED, not retried automatically.`);
  }
}

async function cmdSync(id) {
  banner();
  const { ledger, row } = requireJob(id);
  if (row.status !== "QUEUED") {
    console.log(`  "${id}" is ${row.status}, not QUEUED — nothing to sync.\n`);
    return;
  }
  if (!PROVIDER.isConfigured()) die("no provider configured — cannot query post status.");
  const evidence = await PROVIDER.getPostStatus(row.provider_ref);
  if (!evidence?.ok) die(`sync failed: ${evidence?.reason ?? "unknown"} ${evidence?.detail ?? ""}`.trim());
  const r = applyProviderEvidence(row, evidence);
  saveLedger(ledger);
  console.log(`  ${r.note}`);
  console.log(`  status: ${row.status}${row.published_at ? `  published_at: ${row.published_at} (provider evidence)` : ""}\n`);
}

// ---- 13E.5C: public media hosting -------------------------------------

const MIME_FOR = (p) => EXT_MIME[path.extname(String(p)).toLowerCase()] ?? null;

// Host ONE media file for one artifact variant. Content-addressed +
// dedupe. Uploading is NOT publishing.
async function hostOneVariant({ artifact, variant }) {
  const media = variant.media;
  const file = primaryLocalFile(media);
  if (!file) return { ok: false, label: `${artifact.creative_family}/${variant.creative_variant}`, reason: "no local media file (text-only?)" };
  if (!existsSync(file)) return { ok: false, label: file, reason: "local media file missing on disk" };
  const bytes = fsRead(file);
  const mime = MIME_FOR(file);
  const rights = variant.rights ?? artifact.rights ?? RIGHTS_STATE;

  const gate = canHost({ localPath: file, bytes, mime, qa: variant.qa, rights, currentRights: RIGHTS_STATE });
  if (!gate.ok) return { ok: false, label: file, reason: `canHost blocked: ${gate.reason}` };

  const rows = loadHostedAssets();
  const sha = sha256(bytes);
  const existing = findByHash(rows, sha);
  if (existing && existing.public_url) {
    return { ok: true, deduped: true, record: existing, reason: "identical bytes already hosted - reusing the immutable URL" };
  }

  if (!STORAGE.isConfigured()) {
    return { ok: false, label: file, reason: "no storage provider configured (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)" };
  }

  const rec =
    existing ??
    buildHostedRecord({
      content_id: artifact.content_id ?? variant.content_id,
      creative_family: artifact.creative_family,
      artifact_type: media.kind,
      platform_eligibility: media.kind === "video_916" ? ["instagram_reel", "tiktok", "youtube_short"] : media.kind === "carousel_45" ? ["instagram_carousel"] : ["instagram_feed", "x_post"],
      localPath: file,
      bytes,
      mime,
      width: media.width ?? null,
      height: media.height ?? null,
      durationS: media.durationS ?? null,
      qa: variant.qa,
      rights,
      sourceCommit: headGitCommit(),
    });

  const up = await STORAGE.upload({ storageKey: rec.storage_key, bytes, contentType: mime });
  if (!up.ok) return { ok: false, label: file, reason: `upload failed: ${up.reason} ${up.detail ?? ""}`.trim() };

  rec.storage_provider = STORAGE.name;
  rec.public_url = up.publicUrl;
  rec.uploaded_at = rec.uploaded_at ?? new Date().toISOString();
  rec.history.push({ at: new Date().toISOString(), note: up.deduped ? "storage object already present (dedupe)" : "uploaded" });

  // verify Buffer could fetch it
  const head = await STORAGE.head(up.publicUrl);
  const range = mime === "video/mp4" ? await STORAGE.probeRange(up.publicUrl, 4096) : { ok: true, status: 200, bytes: 0 };
  rec.verified = {
    at: new Date().toISOString(),
    status: head.status,
    contentType: head.contentType,
    contentLength: head.contentLength,
    authChallenged: Boolean(head.authChallenged),
    rangeOk: Boolean(range.ok),
    acceptRanges: range.acceptRanges ?? null,
  };
  const verifiedOk =
    head.ok && head.status === 200 && !head.authChallenged &&
    String(head.contentType || "").startsWith(mime.split("/")[0]) &&
    (head.contentLength == null || Math.abs(head.contentLength - bytes.length) < 1024) &&
    range.ok;

  const idx = rows.findIndex((r) => r.sha256 === sha);
  if (idx >= 0) rows[idx] = rec;
  else rows.push(rec);
  saveHostedAssets(rows);

  return { ok: true, deduped: up.deduped, record: rec, verifiedOk, reason: up.deduped ? "storage object already present; record refreshed" : "uploaded + verified" };
}

const HOST_TARGETS = [
  { key: "video:13e4/deal_drop", cut: "reel", label: "Instagram Reel / X? — Deal Drop 9:16 master" },
  { key: "video:13e4/deal_drop", cut: "tiktok", label: "TikTok — Deal Drop 9:16 master" },
  { key: "video:13e4/market_mover", cut: "reel", label: "YouTube Short — Market Mover 9:16 master" },
  { key: "video:13e4/hook_carousel", cut: "reel", label: "Reel/Short — Hook Carousel 9:16 master" },
  { key: "video:13e4/brand_ad", cut: "reel", label: "Reel/Short — Brand Ad 9:16 master" },
  // static (only if social:daily produced them)
  { key: "deal_of_day", label: "Instagram feed / X image — Deal Drop static" },
  { key: "pokemon_spotlight", label: "Instagram carousel — Hook Carousel still" },
];

async function cmdHost() {
  banner();
  console.log(`  storage provider: ${STORAGE.name}${STORAGE.isConfigured() ? ` (bucket ${STORAGE.bucket})` : " — NOT configured"}`);
  console.log("  hosting = uploading publish-eligible rendered media to a PUBLIC URL. It is NOT publishing.\n");
  for (const t of HOST_TARGETS) {
    const res = resolveArtifactVariant(t.key, { platformCut: t.cut ?? null });
    if (!res.ok) {
      console.log(`  - ${t.label}: UNAVAILABLE — ${res.reason}`);
      continue;
    }
    const r = await hostOneVariant(res);
    if (!r.ok) {
      console.log(`  - ${t.label}: NOT HOSTED — ${r.reason}`);
      continue;
    }
    console.log(`  - ${t.label}: ${r.deduped ? "DEDUPED" : "HOSTED"}  ${r.record.asset_id}`);
    console.log(`      sha256 ${r.record.sha256}`);
    console.log(`      ${r.record.public_url}`);
    if (r.record.verified) {
      const v = r.record.verified;
      console.log(`      verify: HTTP ${v.status}  ${v.contentType}  ${v.contentLength} bytes  auth=${v.authChallenged}  range=${v.rangeOk}  -> ${r.verifiedOk ? "OK" : "CHECK"}`);
    }
  }
  console.log("\n  hosted-asset store: lib/social/storage/hosted-assets.json");
  console.log("  NOTHING WAS PUBLISHED. Hosting media != posting it.\n");
}

async function cmdVerifyHosts() {
  banner();
  const rows = loadHostedAssets();
  if (!rows.length) return console.log("  no hosted assets yet — run  npm run social:publish -- host\n");
  let allOk = true;
  for (const r of rows) {
    if (!r.public_url) {
      console.log(`  ${r.asset_id}: no public_url`);
      allOk = false;
      continue;
    }
    const head = await STORAGE.head(r.public_url);
    const range = r.mime_type === "video/mp4" ? await STORAGE.probeRange(r.public_url, 4096) : { ok: true, status: 200 };
    const ok = head.ok && head.status === 200 && !head.authChallenged && range.ok;
    allOk = allOk && ok;
    console.log(`  ${r.asset_id}  ${ok ? "OK  " : "FAIL"}  HTTP ${head.status}  ${head.contentType}  ${head.contentLength} bytes  ranges=${range.acceptRanges ?? "?"}`);
    console.log(`      ${r.public_url}`);
  }
  console.log(`\n  ${allOk ? "all hosted assets are publicly fetchable (Buffer-compatible)." : "one or more hosted assets FAILED verification."}\n`);
}

function cmdHosts() {
  banner();
  const rows = loadHostedAssets();
  const ledger = loadLedger();
  console.log(`  HOSTED ASSETS (${rows.length}):`);
  for (const r of rows) {
    const refs = ledger.filter((j) => j.hosted_asset_id === r.asset_id).map((j) => `${j.platform}:${j.status}`);
    console.log(`    ${r.asset_id}  ${r.artifact_type}  ${r.bytes} bytes  ${r.creative_family}`);
    console.log(`        ${r.public_url ?? "(not uploaded)"}`);
    console.log(`        sha ${r.sha256.slice(0, 20)}…  uploaded ${r.uploaded_at ?? "-"}  ledger refs: ${refs.join(", ") || "none"}`);
  }
  console.log("");
}

// A dry-run 4-PLATFORM pack from the CURRENT artifacts (§12): Instagram
// still/carousel/Reel, TikTok, X Deal Drop + Market Mover, YouTube Short
// Deal Drop + Market Mover — prepared, gated, NOT sent.
function cmdReviewPack() {
  banner();
  const targets = [
    // Instagram still + carousel come from the daily static pipeline; only
    // present when social:daily selected a post that day (thin inventory ->
    // UNAVAILABLE, the correct fail-closed outcome).
    { key: "deal_of_day", platform: "instagram_feed", label: "Instagram — Deal Drop static (daily)" },
    { key: "pokemon_spotlight", platform: "instagram_carousel", label: "Instagram — Hook Carousel (daily)" },
    // 13E.4 9:16 video masters.
    { key: "video:13e4/deal_drop", platform: "instagram_reel", cut: "reel", label: "Instagram — Deal Drop Reel (9:16)" },
    { key: "video:13e4/deal_drop", platform: "tiktok", cut: "tiktok", label: "TikTok — Deal Drop (9:16)" },
    // X — concise real-data text posts (§6).
    { key: "video:13e4/deal_drop", platform: "x_post", cut: "reel", label: "X — Deal Drop (text)" },
    { key: "video:13e4/market_mover", platform: "x_post", cut: "reel", label: "X — Market Mover (text)" },
    // YouTube Shorts — reuse the 9:16 master, YouTube-specific title + description (§5).
    { key: "video:13e4/deal_drop", platform: "youtube_short", cut: "reel", label: "YouTube Short — Deal Drop" },
    { key: "video:13e4/market_mover", platform: "youtube_short", cut: "reel", label: "YouTube Short — Market Mover" },
  ];
  mkdirSync(REVIEW_PACK_DIR, { recursive: true });
  // A dry-run PREVIEW: rows are built in memory and gated, but NOT
  // persisted to the ledger. Only `prepare` creates a real ledger row.
  const ledger = loadLedger();
  const pack = [];
  for (const t of targets) {
    const res = resolveArtifactVariant(t.key, { platformCut: t.cut ?? null });
    if (!res.ok) {
      pack.push({ label: t.label, error: res.reason });
      continue;
    }
    const { artifact, variant } = res;
    const target = buildRow({ artifact, variant, platform: t.platform, scheduledForIso: null });
    const rg = readinessGates({ row: target, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger, currentMediaSha: currentMediaShaOf(target) });
    markReady(target, { gatesOk: rg.ok, blockers: rg.blockers });
    const full = runAllGates({ row: target, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger, currentMediaSha: currentMediaShaOf(target) });
    pack.push({
      label: t.label,
      job_id: target.job_id,
      content_id: target.content_id,
      creative_family: target.creative_family,
      creative_variant: target.creative_variant,
      content_goal: target.content_goal,
      platform: target.platform,
      placement: target.placement,
      channel_key: target.channel_key,
      channel_id: target.channel_id,
      artifact: target.media.files,
      media: target.media.kind === "text_only" ? "text_only (no media file)" : `${target.media.kind} ${target.media.width}x${target.media.height}${target.media.durationS ? ` ${target.media.durationS}s` : ""}`,
      hosted_asset_id: target.hosted_asset_id ?? null,
      public_media_url: target.public_media_url ?? null,
      media_sha256: target.media_sha256 ?? null,
      planned_cta: target.cta_url,
      youtube_title: target.youtube_title ?? null,
      copy_error: target.copy_error ?? null,
      caption: target.caption,
      hashtags: target.hashtags,
      qa_state: target.qa?.ok ? `PASS (${target.qa.passed}/${target.qa.total})` : `FAIL [${(target.qa?.failed ?? []).join(", ")}]`,
      rights_state: target.rights,
      distribution_state: target.status,
      readiness_gates: rg.gates,
      full_gate_blockers: full.blockers,
      would_send: full.ok,
    });
  }
  // deliberately NOT saveLedger(ledger) - review-pack is a preview
  const manifest = {
    phase: "13E.5C",
    generated_at: new Date().toISOString(),
    published: false,
    scheduled: false,
    storage_provider: STORAGE.name,
    note: "DRY RUN. No createPost call was made. No post was published or scheduled. Media placements carry REAL public hosted URLs; nothing was posted.",
    flags: describeFlags(flags),
    rights_publishing: RIGHTS_STATE.publishing,
    provider: PROVIDER.name,
    // 13E.5D - the recommended single strongest FIRST LIVE piece + platforms.
    // (Advisory only - it still cannot send: live gates closed, and the
    //  current content is a fixture snapshot, not fresh live data.)
    first_live_candidate: {
      content: "Deal Drop (deal_of_day) - strongest truthful hook + real canonical card art + highest savings + video-QA-verified facts + website-first CTA",
      platforms: ["instagram_reel", "tiktok", "youtube_short", "x_post"],
      one_master_note: "one 9:16 master -> Reel + TikTok + YouTube Short; X carries the frozen text form",
      hard_prerequisite: "a fresh `social:source -- live` snapshot (verify-deals cron must catch up) so `freshness_at_send` passes; then the 4 owner gates",
      lower_dependency_alt: "Market Mover (MARKET_DATA) - exempt from `freshness_at_send`; X + YouTube Short",
    },
    items: pack,
  };
  const p = path.join(REVIEW_PACK_DIR, "manifest.json");
  writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("  FIRST DRY-RUN 4-PLATFORM DISTRIBUTION REVIEW PACK\n");
  for (const it of pack) {
    if (it.error) {
      console.log(`  - ${it.label}: UNAVAILABLE — ${it.error}\n`);
      continue;
    }
    console.log(`  - ${it.label}`);
    console.log(`      content_id   : ${it.content_id}`);
    console.log(`      family/variant: ${it.creative_family} / ${it.creative_variant}   goal: ${it.content_goal}`);
    console.log(`      platform     : ${it.platform} (${it.placement})  channel ${it.channel_key} -> ${it.channel_id ?? "UNRESOLVED"}`);
    console.log(`      artifact     : ${it.artifact.length ? it.artifact.join(", ") : "(text only)"}`);
    console.log(`      media        : ${it.media}`);
    if (it.media !== "text_only (no media file)")
      console.log(`      public URL   : ${it.public_media_url ?? "NOT HOSTED — run `social:publish host`"}${it.media_sha256 ? `  (sha ${it.media_sha256.slice(0, 12)}…)` : ""}`);
    if (it.youtube_title) console.log(`      YT title     : ${it.youtube_title} (${it.youtube_title.length} chars)`);
    console.log(`      planned CTA  : ${it.planned_cta}`);
    if (it.copy_error) console.log(`      copy         : NOT BUILT — ${it.copy_error}`);
    else {
      console.log(`      copy (${it.caption.length} chars, frozen):`);
      console.log(it.caption.split("\n").map((l) => "        " + l).join("\n"));
    }
    console.log(`      QA           : ${it.qa_state}`);
    console.log(`      rights       : ${JSON.stringify(it.rights_state)}`);
    console.log(`      distribution : ${it.distribution_state}`);
    console.log(`      would send?  : ${it.would_send ? "yes (all gates pass)" : `NO — blocked: ${it.full_gate_blockers.join(" | ")}`}`);
    console.log("");
  }
  console.log(`  manifest: ${path.relative(process.cwd(), p)}`);
  console.log("  NOTHING WAS PUBLISHED OR SCHEDULED. NOTHING LEFT THIS MACHINE.\n");
}

// ==== 13E.6A: FIRST-LIVE BATCH WORKFLOW ==============================

const PLATFORM_LABEL = { instagram_feed: "Instagram (feed)", instagram_carousel: "Instagram (carousel)", instagram_reel: "Instagram (reel)", tiktok: "TikTok", x_post: "X", youtube_short: "YouTube (Short)" };

// Expand a --platforms alias list ("instagram,tiktok,x,youtube") to the
// concrete placement platforms available for this content.
function resolvePlatforms(aliasCsv, artifact) {
  const ALIAS = {
    instagram: artifact.source?.startsWith("video") ? ["instagram_reel"] : ["instagram_feed"],
    "instagram-reel": ["instagram_reel"],
    "instagram-feed": ["instagram_feed"],
    "instagram-carousel": ["instagram_carousel"],
    tiktok: ["tiktok"],
    x: ["x_post"],
    youtube: ["youtube_short"],
  };
  const wanted = String(aliasCsv || "instagram,tiktok,x,youtube")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const w of wanted) {
    const ps = ALIAS[w] ?? (PLATFORM_CHANNEL_KEY[w] ? [w] : null);
    if (!ps) die(`unknown platform alias "${w}". one of: instagram, instagram-reel, instagram-feed, instagram-carousel, tiktok, x, youtube`);
    for (const p of ps) if (!out.includes(p)) out.push(p);
  }
  return out;
}

// Prepare one ledger row per requested platform for a content_id, then
// freeze them into a DRAFT batch.
function cmdPrepareBatch(idOrKey, opts) {
  banner();
  if (!idOrKey) die("usage: social:publish -- prepare-batch <content_id|key> [--platforms instagram,tiktok,x,youtube] [--order ...] [--schedule now|<iso>]");
  const probe = resolveArtifactVariant(idOrKey, { platformCut: "reel" });
  if (!probe.ok) die(probe.reason);
  const artifact = probe.artifact;
  const platforms = resolvePlatforms(opts.platforms, artifact);
  let scheduleMode = "PUBLISH_NOW";
  let scheduledForIso = null;
  if (opts.schedule && opts.schedule !== "now") {
    scheduleMode = "SCHEDULED";
    try { scheduledForIso = toUtcIso(opts.schedule); } catch (e) { die(e.message); }
  }
  const sendOrder = opts.order ? opts.order.split(",").map((s) => s.trim()) : DEFAULT_SEND_ORDER;

  const ledger = loadLedger();
  const prepared = [];
  for (const platform of platforms) {
    const cut = cutFor(platform, null);
    let res = resolveArtifactVariant(idOrKey, { platformCut: cut });
    if (!res.ok && cut === "reel") res = resolveArtifactVariant(idOrKey, { platformCut: "tiktok" });
    if (!res.ok) { console.log(`  - ${platform}: SKIP - ${res.reason}`); continue; }
    const row = buildRow({ artifact: res.artifact, variant: res.variant, platform, scheduledForIso });
    const existing = findJob(ledger, row.job_id);
    if (existing && ["QUEUED", "PUBLISHED"].includes(existing.status)) {
      console.log(`  - ${platform}: SKIP - ${row.job_id} already ${existing.status}`);
      continue;
    }
    let out;
    if (existing) {
      Object.assign(existing, {
        media: row.media, placement: row.placement, service: row.service,
        hosted_asset_id: row.hosted_asset_id, public_media_url: row.public_media_url, media_sha256: row.media_sha256,
        caption: row.caption, youtube_title: row.youtube_title, copy_error: row.copy_error,
        hashtags: row.hashtags, first_comment: row.first_comment, cta_url: row.cta_url,
        channel_id: row.channel_id, qa: row.qa, rights: row.rights, snapshot: row.snapshot,
        scheduled_for: row.scheduled_for, source_commit: row.source_commit, status: "DRAFT",
      });
      existing.history.push({ at: new Date().toISOString(), from: existing.status, to: "DRAFT", note: "re-prepared for a batch" });
      out = existing;
    } else {
      ledger.push(row);
      out = row;
    }
    const rg = readinessGates({ row: out, variant: res.variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger, currentMediaSha: currentMediaShaOf(out) });
    markReady(out, { gatesOk: rg.ok, blockers: rg.blockers });
    prepared.push(out);
  }
  if (!prepared.length) die("no placements could be prepared for this content");
  saveLedger(ledger);

  const contentId = prepared[0].content_id;
  const batch = buildBatch({ content_id: contentId, rows: prepared, sendOrder, scheduleMode, scheduledFor: scheduledForIso, sourceCommit: headGitCommit() });
  const batches = loadBatches();
  batches.push(batch);
  saveBatches(batches);

  console.log(`  BATCH CREATED  ${batch.batch_id}   status: DRAFT`);
  console.log(`  content_id     ${batch.content_id}`);
  console.log(`  source         ${batch.source_snapshot_id ?? "?"}  captured ${batch.source_captured_at ?? "?"}  live=${batch.source_is_live}`);
  console.log(`  schedule       ${batch.schedule_mode}${batch.scheduled_for ? `  ${brisbaneLabel(batch.scheduled_for)}` : ""}`);
  console.log(`  send order     ${batch.send_order.join(" -> ")}`);
  console.log(`  placements     ${batch.placements.length}`);
  for (const p of batch.placements) console.log(`    - ${PLATFORM_LABEL[p.platform] ?? p.platform}  (${p.job_id})  asset ${p.approved_artifact_sha256 ? p.approved_artifact_sha256.slice(0, 12) + "…" : "text-only"}`);
  console.log(`\n  next:  npm run social:publish -- review ${batch.batch_id}\n`);
}

function freshVariantFor(row) {
  const v = reResolveVariant(row);
  return v ?? { qa: row.qa, rights: row.rights, media: row.media, snapshot: row.snapshot, caption_instagram: row.caption, caption_tiktok: row.caption, facts: {} };
}

// §13 - human-readable batch review.
function cmdReview(batchId) {
  banner();
  const batches = loadBatches();
  const batch = findBatch(batches, batchId);
  if (!batch) die(`no batch "${batchId}" (try: social:publish -- batches)`);
  const ledger = loadLedger();
  const channels = loadChannels();
  const derived = batchStatus(batch, ledger);

  console.log(`  BATCH ${batch.batch_id}   status: ${batch.status}${derived !== batch.status ? ` (derived: ${derived})` : ""}`);
  console.log(`  content_id ${batch.content_id}`);
  console.log(`  source     ${batch.source_snapshot_id ?? "?"}  captured ${batch.source_captured_at ?? "?"}  live=${batch.source_is_live}  commit ${batch.source_commit ?? "?"}`);
  console.log(`  schedule   ${batch.schedule_mode}${batch.scheduled_for ? `  ${brisbaneLabel(batch.scheduled_for)}` : "  (publish now)"}`);
  console.log(`  facts      market_ref=${batch.frozen_facts.market_price ?? "-"}  discount=${batch.frozen_facts.discount_pct ?? "-"}  listed=${batch.frozen_facts.listed_usd ?? "-"}  movement=${batch.frozen_facts.movement_pct ?? "-"}`);
  if (batch.owner_approved_at) console.log(`  approved   ${batch.owner_approved_at} by ${batch.owner_approved_by}   checksum ${batch.approval_checksum?.slice(0, 26)}…  valid=${batchApprovalValid(batch).ok}`);
  console.log("");

  const allBlockers = [];
  for (const p of batch.placements) {
    const row = findJob(ledger, p.job_id);
    if (!row) { console.log(`  ── ${PLATFORM_LABEL[p.platform] ?? p.platform}: LEDGER ROW MISSING (${p.job_id})\n`); allBlockers.push(`${p.platform}: ledger row missing`); continue; }
    const variant = freshVariantFor(row);
    const rv = revalidatePlacement({
      row, batch, variant, liveFacts: variant.facts ?? {},
      currentMediaSha: currentMediaShaOf(row),
      flags, providerConfigured: PROVIDER.isConfigured(), channels, ledger,
    });
    const fresh = rv.gates.find((g) => g.id === "freshness_at_send");
    const dup = rv.gates.find((g) => g.id === "not_duplicate");
    console.log(`  ── ${PLATFORM_LABEL[p.platform] ?? p.platform}`);
    console.log(`     PLACEMENT   ${p.placement}   STATUS ${row.status}`);
    console.log(`     MEDIA       ${row.media.kind === "text_only" ? "text-only" : `${row.media.kind} ${row.media.width}x${row.media.height}${row.media.durationS ? " " + row.media.durationS + "s" : ""}`}`);
    if (row.public_media_url) console.log(`                 ${row.public_media_url}  sha ${String(row.media_sha256 ?? "").slice(0, 12)}…`);
    if (row.youtube_title) console.log(`     TITLE       ${row.youtube_title}`);
    console.log(`     COPY        ${String(row.caption ?? "").replace(/\n+/g, " / ").slice(0, 160)}${(row.caption ?? "").length > 160 ? "…" : ""}`);
    console.log(`     CTA         ${row.cta_url}`);
    console.log(`     ATTRIBUTION ${hasSocialAttribution(row.cta_url) ? `utm_source=${row.cta_attribution?.utm_source} utm_campaign=${row.cta_attribution?.utm_campaign} utm_content=${row.cta_attribution?.utm_content}` : "MISSING — CTA carries no first-party UTM"}`);
    console.log(`     FRESHNESS   ${fresh ? fresh.detail : "(n/a - MARKET_DATA/brand)"}`);
    console.log(`     QA          ${row.qa?.ok ? `PASS (${row.qa.passed}/${row.qa.total})` : `FAIL [${(row.qa?.failed ?? []).join(", ")}]`}`);
    console.log(`     RIGHTS      ${JSON.stringify(row.rights)}`);
    console.log(`     DUPLICATE   ${dup ? (dup.ok ? "none" : dup.detail) : "n/a"}`);
    console.log(`     DRIFT       ${rv.drift.length ? rv.drift.map((d) => `${d.field}(${d.action})`).join(", ") : "none"}`);
    console.log(`     READY       ${rv.ok ? "YES" : "NO"}`);
    if (!rv.ok) { for (const b of rv.blockers) console.log(`                 - ${b}`); allBlockers.push(...rv.blockers.map((b) => `${p.platform}: ${b}`)); }
    console.log("");
  }

  const uniq = [...new Set(allBlockers)];
  const canApprove = batch.status === "DRAFT" && batch.placements.every((p) => {
    const r = findJob(ledger, p.job_id);
    return r && r.qa?.ok && (p.platform === "x_post" || r.public_media_url);
  });
  console.log(`  READY TO APPROVE:  ${canApprove ? "yes" : "no"}   (approval freezes the plan; it does NOT publish)`);
  console.log(`  READY TO SEND:     no  ${uniq.length ? `(${uniq.length} blocker${uniq.length === 1 ? "" : "s"})` : ""}`);
  if (uniq.length) { console.log("  BLOCKERS:"); for (const b of uniq) console.log(`    - ${b}`); }
  console.log(`\n  approve with:  npm run social:publish -- approve-batch ${batch.batch_id}`);
  console.log("");
}

function cmdApproveBatch(batchId) {
  banner();
  const batches = loadBatches();
  const batch = findBatch(batches, batchId);
  if (!batch) die(`no batch "${batchId}"`);
  const ledger = loadLedger();
  // every placement row must be READY (all non-approval gates green)
  for (const p of batch.placements) {
    const row = findJob(ledger, p.job_id);
    if (!row) die(`ledger row ${p.job_id} missing - re-run prepare-batch`);
    if (!["READY", "APPROVED"].includes(row.status)) die(`placement ${p.platform} is ${row.status}, not READY - run review ${batchId} to see blockers`);
  }
  const r = approveBatch(batch, { by: "owner" });
  if (!r.ok) die(`cannot approve batch: ${r.reason}`);
  // stamp each placement row APPROVED too (so the send gate stack passes owner_approval)
  for (const p of batch.placements) {
    const row = findJob(ledger, p.job_id);
    if (row.status === "READY") approveRow(row, { by: "owner" });
  }
  saveBatches(batches);
  saveLedger(ledger);
  console.log(`  ✓ BATCH ${batch.batch_id} APPROVED  at ${batch.owner_approved_at}`);
  console.log(`  checksum ${batch.approval_checksum}`);
  console.log(`  This is a signed-off launch plan. It has NOT published anything.`);
  console.log(`  A future send needs:  RIGHTS_STATE.publishing=ALLOWED, SOCIAL_PUBLISH_ENABLED=true,`);
  console.log(`  SOCIAL_PUBLISH_DRY_RUN=false, SOCIAL_EPN_AI_CLASSIFICATION set, provider auth, channels, no drift,`);
  console.log(`  AND the explicit flag:  social:publish -- send-batch ${batch.batch_id} --confirm-live\n`);
}

async function cmdSendBatch(batchId, opts) {
  banner();
  const batches = loadBatches();
  const batch = findBatch(batches, batchId);
  if (!batch) die(`no batch "${batchId}"`);

  // GUARD 1 - explicit live confirmation flag
  if (opts.confirmLive !== true) {
    die(`send-batch requires the explicit  --confirm-live  flag. Without it this is a hard fail. Nothing was submitted.`);
  }
  // GUARD 2 - batch must be approved + the approval untampered
  if (batch.status !== "APPROVED" && batch.status !== "PARTIAL_SUCCESS") die(`batch is ${batch.status} - approve it first`);
  const bv = batchApprovalValid(batch);
  if (!bv.ok) die(`batch approval invalid: ${bv.reason}`);
  // GUARD 3 - all the independent live switches
  const notReady = [];
  if (RIGHTS_STATE.publishing !== "ALLOWED") notReady.push("RIGHTS_STATE.publishing != ALLOWED");
  if (flags.publishEnabled !== true) notReady.push("SOCIAL_PUBLISH_ENABLED != true");
  if (flags.dryRun !== false) notReady.push("SOCIAL_PUBLISH_DRY_RUN is not \"false\"");
  if (flags.epnAiClassification == null) notReady.push("SOCIAL_EPN_AI_CLASSIFICATION not set");
  if (!PROVIDER.isConfigured()) notReady.push("no social provider configured");
  if (notReady.length) {
    console.log("  send-batch BLOCKED - the live switches are not all set:\n");
    for (const n of notReady) console.log(`    - ${n}`);
    console.log("\n  Nothing was submitted. Nothing left this machine.\n");
    process.exit(1);
  }

  // per-placement revalidate -> submit, in send order. One failure does
  // NOT stop the others.
  const ledger = loadLedger();
  const channels = loadChannels();
  const results = [];
  const ordered = [...batch.placements].sort((a, b) => batch.send_order.indexOf(a.platform) - batch.send_order.indexOf(b.platform));
  for (const p of ordered) {
    const row = findJob(ledger, p.job_id);
    if (!row) { results.push({ platform: p.platform, outcome: "SKIP", reason: "ledger row missing" }); continue; }
    if (["QUEUED", "PUBLISHED"].includes(row.status)) { results.push({ platform: p.platform, outcome: "ALREADY", status: row.status, providerRef: row.provider_ref }); continue; }
    const variant = freshVariantFor(row);
    const rv = revalidatePlacement({ row, batch, variant, liveFacts: variant.facts ?? {}, currentMediaSha: currentMediaShaOf(row), flags, providerConfigured: PROVIDER.isConfigured(), channels, ledger });
    if (!rv.ok) { results.push({ platform: p.platform, outcome: "BLOCKED", blockers: rv.blockers }); continue; }
    // defence in depth
    if (RIGHTS_STATE.publishing !== "ALLOWED" || !PROVIDER.isConfigured()) { results.push({ platform: p.platform, outcome: "BLOCKED", blockers: ["internal guard"] }); continue; }
    const res = await submitOne(row, ledger);
    results.push({ platform: p.platform, ...res });
  }
  saveLedger(ledger);
  batch.status = batchStatus(batch, ledger);
  batch.history.push({ at: new Date().toISOString(), note: `send-batch: ${results.map((r) => `${r.platform}=${r.outcome}`).join(" ")}` });
  saveBatches(batches);

  const anyOk = results.some((r) => r.outcome === "QUEUED" || r.outcome === "ALREADY");
  const anyBad = results.some((r) => r.outcome === "FAILED" || r.outcome === "BLOCKED");
  const verdict = anyOk && anyBad ? "PARTIAL_SUCCESS" : anyOk ? "ALL_QUEUED" : "ALL_FAILED";
  console.log(`  SEND-BATCH ${batch.batch_id}:  ${verdict}\n`);
  for (const r of results) {
    console.log(`    ${PLATFORM_LABEL[r.platform] ?? r.platform}: ${r.outcome}${r.providerRef ? `  ref ${r.providerRef}` : ""}${r.reason ? `  (${r.reason})` : ""}`);
    if (r.blockers) for (const b of r.blockers) console.log(`        - ${b}`);
  }
  console.log(`\n  QUEUED != PUBLISHED. Confirm with:  npm run social:publish -- sync-batch ${batch.batch_id}`);
  console.log(`  A FAILED placement needs explicit:  npm run social:publish -- retry <job_id>  (never auto-retried)\n`);
}

// submit ONE row through the provider. Returns { outcome, providerRef?, reason? }.
async function submitOne(row, ledger) {
  const assets = row.media.kind === "text_only" || !row.public_media_url ? [] : [{ type: row.media.kind === "video_916" ? "video" : "image", url: row.public_media_url }];
  const msg = {
    channelId: row.channel_id, platform: row.service, placement: row.placement,
    text: row.caption, assets, dueAt: row.scheduled_for, saveToDraft: false, schedulingType: "automatic",
    postType: PLATFORM_POST_TYPE[row.platform], firstComment: row.first_comment,
    youtubeTitle: row.youtube_title ?? null, siteLink: row.platform === "instagram_feed" ? row.cta_url : null,
  };
  const res = await PROVIDER.createPost(msg);
  if (res?.accepted) {
    applyProviderAccept(row, { provider: PROVIDER.name, providerRef: res.id });
    return { outcome: "QUEUED", providerRef: res.id };
  }
  applyProviderReject(row, { provider: PROVIDER.name, reason: res?.reason ?? "unknown", detail: res?.detail ?? "" });
  return { outcome: "FAILED", reason: res?.reason ?? "unknown" };
}

async function cmdRetry(jobId_, opts) {
  banner();
  const ledger = loadLedger();
  const row = findJob(ledger, jobId_);
  if (!row) die(`no ledger row "${jobId_}"`);
  if (row.status !== "FAILED") die(`retry is only for a FAILED row - "${jobId_}" is ${row.status}`);
  if (row.provider_ref) die(`"${jobId_}" already has a provider_ref (${row.provider_ref}) - the provider accepted it; use sync, do NOT re-submit`);
  // find its batch + re-validate against the SAME approved batch
  const batches = loadBatches();
  const batch = batches.find((b) => b.placements.some((p) => p.job_id === jobId_));
  if (!batch) die(`"${jobId_}" is not part of any batch`);
  const bv = batchApprovalValid(batch);
  if (!bv.ok) die(`batch approval no longer valid: ${bv.reason} - re-approve the batch`);
  if (opts.confirmLive !== true) die("retry submits to the provider - it requires --confirm-live");
  if (RIGHTS_STATE.publishing !== "ALLOWED" || flags.publishEnabled !== true || flags.dryRun !== false || flags.epnAiClassification == null || !PROVIDER.isConfigured()) {
    die("retry BLOCKED - the live switches are not all set (see send-batch).");
  }
  const channels = loadChannels();
  const variant = freshVariantFor(row);
  const rv = revalidatePlacement({ row, batch, variant, liveFacts: variant.facts ?? {}, currentMediaSha: currentMediaShaOf(row), flags, providerConfigured: PROVIDER.isConfigured(), channels, ledger });
  if (!rv.ok) { console.log("  retry BLOCKED:\n"); for (const b of rv.blockers) console.log(`    - ${b}`); process.exit(1); }
  // reuse the SAME row - status FAILED -> QUEUED on accept
  row.status = "APPROVED"; // transient, so applyProviderAccept's guard passes
  const res = await submitOne(row, ledger);
  saveLedger(ledger);
  batch.status = batchStatus(batch, ledger);
  saveBatches(batches);
  console.log(`  retry ${jobId_}: ${res.outcome}${res.providerRef ? `  ref ${res.providerRef}` : `  (${res.reason})`}\n`);
}

async function cmdSyncBatch(batchId) {
  banner();
  const batches = loadBatches();
  const batch = findBatch(batches, batchId);
  if (!batch) die(`no batch "${batchId}"`);
  const ledger = loadLedger();
  if (!PROVIDER.isConfigured()) die("no provider configured - cannot query post status");
  const lines = [];
  for (const p of batch.placements) {
    const row = findJob(ledger, p.job_id);
    if (!row || row.status !== "QUEUED") { lines.push(`  ${p.platform}: ${row?.status ?? "MISSING"} - nothing to sync`); continue; }
    const evidence = await PROVIDER.getPostStatus(row.provider_ref);
    if (!evidence?.ok) { lines.push(`  ${p.platform}: sync error - ${evidence?.reason ?? "?"}`); continue; }
    const r = applyProviderEvidence(row, evidence);
    lines.push(`  ${p.platform}: ${r.note}${row.published_at ? `  published_at ${row.published_at}` : ""}`);
  }
  saveLedger(ledger);
  batch.status = batchStatus(batch, ledger);
  saveBatches(batches);
  console.log(`  SYNC-BATCH ${batch.batch_id}  ->  ${batch.status}\n`);
  for (const l of lines) console.log(l);
  console.log("");
}

// ==== 13E.7A: READ-ONLY METRICS (mirrors of scripts/socialMetrics.mjs) ==
// `send`-free by construction: these only ever call PROVIDER.getPostMetrics.
async function cmdMetrics(jobId_) {
  banner();
  if (!jobId_) die("usage: social:publish -- metrics <job_id>");
  const { ledger, row } = requireJob(jobId_);
  if (!PROVIDER.isConfigured()) die("no provider configured — cannot read metrics.");
  if (!row.provider_ref) {
    console.log(`  "${jobId_}" has no provider_ref (status ${row.status}). Nothing published -> metrics NOT_AVAILABLE_YET.\n`);
    return;
  }
  const r = await PROVIDER.getPostMetrics(row.provider_ref);
  if (!r?.ok) {
    attachSnapshot(row, buildSnapshot({ platform: row.platform, error: { reason: r?.reason ?? "unknown", detail: r?.detail ?? "" } }));
    saveLedger(ledger);
    die(`metrics read failed: ${r?.reason ?? "?"} — last good snapshot retained, no zeros written.`);
  }
  const norm = normalizeProviderMetrics(r.metrics, row.platform);
  const snap = buildSnapshot({ platform: row.platform, metrics: norm.metrics, unsupported: norm.unsupported, units: norm.units, metricsUpdatedAt: r.metricsUpdatedAt });
  attachSnapshot(row, snap);
  saveLedger(ledger);
  console.log(`  ${row.job_id}  snapshot @ ${snap.captured_at}  (provider updated ${r.metricsUpdatedAt ?? "?"})`);
  for (const k of Object.keys(norm.metrics)) {
    const val = norm.unsupported.includes(k) ? "— (unsupported on this platform)" : norm.metrics[k] == null ? "· (no reading)" : norm.metrics[k];
    console.log(`      ${k.padEnd(24)} ${val}`);
  }
  console.log("\n  READ-ONLY. Nothing was published or modified at the provider.\n");
}

async function cmdMetricsBatch(batchId) {
  banner();
  if (!batchId) die("usage: social:publish -- metrics-batch <batch_id>");
  const batch = findBatch(loadBatches(), batchId);
  if (!batch) die(`no batch "${batchId}"`);
  if (!PROVIDER.isConfigured()) die("no provider configured — cannot read metrics.");
  const ledger = loadLedger();
  for (const p of batch.placements) {
    const row = findJob(ledger, p.job_id);
    if (!row || !row.provider_ref) { console.log(`  ${p.platform}: ${row?.status ?? "MISSING"} — no provider_ref, metrics NOT_AVAILABLE_YET`); continue; }
    const r = await PROVIDER.getPostMetrics(row.provider_ref);
    if (!r?.ok) {
      attachSnapshot(row, buildSnapshot({ platform: row.platform, error: { reason: r?.reason ?? "unknown", detail: r?.detail ?? "" } }));
      console.log(`  ${p.platform}: sync error — ${r?.reason ?? "?"} (last good snapshot retained)`);
      continue;
    }
    const norm = normalizeProviderMetrics(r.metrics, row.platform);
    attachSnapshot(row, buildSnapshot({ platform: row.platform, metrics: norm.metrics, unsupported: norm.unsupported, units: norm.units, metricsUpdatedAt: r.metricsUpdatedAt }));
    console.log(`  ${p.platform}: snapshot @ ${new Date().toISOString()}  reported: ${norm.reported.join(", ") || "(none yet)"}`);
  }
  saveLedger(ledger);
  console.log("\n  READ-ONLY. Full report:  npm run social:metrics -- report\n");
}

function cmdBatches() {
  banner();
  const batches = loadBatches();
  const ledger = loadLedger();
  if (!batches.length) return console.log("  no batches yet - create one with  social:publish -- prepare-batch <content_id>\n");
  for (const b of batches) {
    console.log(`  ${b.batch_id}  ${batchStatus(b, ledger)}  ${b.content_id}  (${b.placements.length} placements: ${b.send_order.join(",")})`);
    console.log(`      created ${b.created_at}  ${b.owner_approved_at ? `approved ${b.owner_approved_at} valid=${batchApprovalValid(b).ok}` : "not approved"}`);
  }
  console.log("");
}

// ---- dispatch ------------------------------------------------------
function parseOpts(rest) {
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--force") opts.force = true;
    else if (rest[i] === "--confirm-live") opts.confirmLive = true;
    else if (rest[i] === "--cut") opts.cut = rest[++i];
    else if (rest[i] === "--at") opts.at = rest[++i];
    else if (rest[i] === "--platforms") opts.platforms = rest[++i];
    else if (rest[i] === "--order") opts.order = rest[++i];
    else if (rest[i] === "--schedule") opts.schedule = rest[++i]; // now | <iso>
    else if (rest[i] === "--approve") opts.approve = rest[++i]; // subset for approve-batch
  }
  return opts;
}

const OPT_FLAGS = new Set(["--cut", "--at", "--platforms", "--order", "--schedule", "--approve"]);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = rest.filter((a, i) => !a.startsWith("--") && !OPT_FLAGS.has(rest[i - 1]));
  const opts = parseOpts(rest);
  switch (cmd) {
    case "list":
    case undefined:
      return cmdList();
    case "channels":
      return cmdChannels();
    case "prepare":
      return cmdPrepare(args[0], args[1], opts);
    case "dry-run":
      return cmdDryRun(args[0]);
    case "approve":
      return cmdApprove(args[0]);
    case "send":
      return cmdSend(args[0], opts);
    case "sync":
      return cmdSync(args[0]);
    case "prepare-batch":
      return cmdPrepareBatch(args[0], opts);
    case "review":
      return cmdReview(args[0]);
    case "approve-batch":
      return cmdApproveBatch(args[0]);
    case "send-batch":
      return cmdSendBatch(args[0], opts);
    case "retry":
      return cmdRetry(args[0], opts);
    case "sync-batch":
      return cmdSyncBatch(args[0]);
    case "metrics":
      return cmdMetrics(args[0]);
    case "metrics-batch":
      return cmdMetricsBatch(args[0]);
    case "batches":
      return cmdBatches();
    case "host":
      return cmdHost();
    case "verify-hosts":
      return cmdVerifyHosts();
    case "hosts":
      return cmdHosts();
    case "review-pack":
      return cmdReviewPack();
    default:
      die(`unknown command "${cmd}". one of: list, channels, prepare, dry-run, approve, send, sync, prepare-batch, review, approve-batch, send-batch, retry, sync-batch, metrics, metrics-batch, batches, host, verify-hosts, hosts, review-pack`);
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
