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
//   npm run social:publish -- review-pack                build the dry-run 4-platform distribution review pack
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
  return {
    job_id: jobId({ content_id: artifact.content_id ?? variant.content_id, platform, creative_variant: variant.creative_variant }),
    content_id: artifact.content_id ?? variant.content_id ?? null,
    creative_family: artifact.creative_family,
    creative_variant: variant.creative_variant,
    platform,
    placement: PLATFORM_PLACEMENT[platform],
    service: PLATFORM_SERVICE[platform],
    content_goal: artifact.content_goal ?? null,
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
    cta_url: variant.cta_url ?? null,
    channel_key: channelKey,
    channel_id: channels[channelKey] ?? null,
    provider: null,
    provider_ref: null,
    status: "DRAFT",
    qa: variant.qa ?? null,
    rights: variant.rights ?? artifact.rights ?? null,
    source: artifact.source,
    source_commit: headGitCommit(),
    // frozen deterministic facts - carried in a shape the gate reads
    snapshot: {
      ...(variant.snapshot ?? {}),
      market_price: f.marketRefUsd ?? variant.snapshot?.market_price ?? null,
      discount_pct: f.discountPct ?? variant.snapshot?.discount_pct ?? null,
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

// ---- dispatch ------------------------------------------------------
function parseOpts(rest) {
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--force") opts.force = true;
    else if (rest[i] === "--cut") opts.cut = rest[++i];
    else if (rest[i] === "--at") opts.at = rest[++i];
  }
  return opts;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = rest.filter((a) => !a.startsWith("--") && rest[rest.indexOf(a) - 1] !== "--cut" && rest[rest.indexOf(a) - 1] !== "--at");
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
    case "host":
      return cmdHost();
    case "verify-hosts":
      return cmdVerifyHosts();
    case "hosts":
      return cmdHosts();
    case "review-pack":
      return cmdReviewPack();
    default:
      die(`unknown command "${cmd}". one of: list, channels, prepare, dry-run, approve, send, sync, host, verify-hosts, hosts, review-pack`);
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
