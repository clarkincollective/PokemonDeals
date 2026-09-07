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
import { RIGHTS_STATE } from "../lib/social/rights.mjs";

const CHANNELS_PATH = path.join(process.cwd(), "lib", "social", "distribution", "channels.json");
const REVIEW_PACK_DIR = path.join(process.cwd(), ".social-preview", "distribution-review-pack");

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
  const full = runAllGates({ row, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger });
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

  const full = runAllGates({ row, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger, force: opts.force === true });
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

  // NOTE: Buffer requires PUBLIC asset URLs (no direct upload). row.media.files
  // are local .social-preview paths - a hosted-URL step is a documented
  // remaining item; the gate stack blocks the send long before here anyway.
  const msg = {
    channelId: row.channel_id,
    platform: row.service, // "instagram" | "tiktok" | "twitter" | "youtube"
    placement: row.placement, // "feed" | "carousel" | "reel" | "video" | "post" | "short"
    text: row.caption,
    assets: (row.media.files ?? []).map((f) => ({ type: row.media.kind === "video_916" ? "video" : "image", url: f })),
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
    const rg = readinessGates({ row: target, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger });
    markReady(target, { gatesOk: rg.ok, blockers: rg.blockers });
    const full = runAllGates({ row: target, variant, flags, providerConfigured: PROVIDER.isConfigured(), ledger });
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
    phase: "13E.5B",
    generated_at: new Date().toISOString(),
    published: false,
    scheduled: false,
    note: "DRY RUN. No provider call was made. No post was published or scheduled. Every row is DRAFT/READY only.",
    flags: describeFlags(flags),
    rights_publishing: RIGHTS_STATE.publishing,
    provider: PROVIDER.name,
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
    case "review-pack":
      return cmdReviewPack();
    default:
      die(`unknown command "${cmd}". one of: list, channels, prepare, dry-run, approve, send, sync, review-pack`);
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
