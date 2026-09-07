#!/usr/bin/env node
// Phase 13E.5A - SOCIAL DISTRIBUTION CLI (dry-run by default; NON-PUBLISHING).
//
//   npm run social:publish -- list                       show artifacts + ledger
//   npm run social:publish -- channels                   discover Buffer channels (needs owner auth)
//   npm run social:publish -- prepare <id> <platform> [--cut reel|tiktok]
//                                                        build/refresh a DRAFT ledger row (freezes caption)
//   npm run social:publish -- dry-run <job_id>           run the full gate stack, mutate NOTHING external
//   npm run social:publish -- approve <job_id>           READY -> APPROVED (explicit human approval)
//   npm run social:publish -- send <job_id> [--force]    HARD-FAILS unless every gate passes
//   npm run social:publish -- sync <job_id>              poll the provider; QUEUED -> PUBLISHED only on real evidence
//   npm run social:publish -- review-pack                build the dry-run distribution review pack
//
//   <platform> = instagram_feed | instagram_carousel | instagram_reel | tiktok
//   <id>       = a content_id, a "<source>/<family>" key (e.g. video:13e4/deal_drop),
//                or a daily content_type (e.g. deal_of_day)
//
// This script CANNOT publish in Phase 13E.5A: SOCIAL_PUBLISH_ENABLED is
// unset, RIGHTS_STATE.publishing is "DISABLED", EPN_AI_TOOLS_APPROVED is
// unset, and no BUFFER_ACCESS_TOKEN exists. `send` checks all of these
// (and more) independently and refuses. `dry-run` is the intended verb.

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
import { PLATFORM_CHANNEL_KEY, PLATFORM_POST_TYPE } from "../lib/social/distribution/artifactMap.mjs";
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
function captionFor(platform, variant) {
  return platform === "tiktok" ? variant.caption_tiktok : variant.caption_instagram;
}

function banner() {
  console.log("\n  === social:publish — Phase 13E.5A (dry-run / non-publishing) ===");
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
    console.log("  1. In Buffer, connect the Instagram (Business/Creator) and TikTok (Business) channels.");
    console.log("  2. Generate an API key at https://publish.buffer.com/settings/api");
    console.log("  3. Put  BUFFER_ACCESS_TOKEN=...  in .env.local  (gitignored, server-side only)");
    console.log("  4. Re-run this command; it will print the channel ids to paste into");
    console.log(`     ${path.relative(process.cwd(), CHANNELS_PATH)}`);
    console.log("");
    return;
  }
  const r = await PROVIDER.listChannels();
  if (!r.ok) die(`channel discovery failed: ${r.reason} ${r.detail ?? ""}`.trim());
  console.log("  Connected Buffer channels:");
  for (const c of r.channels) console.log(`    ${c.service.padEnd(12)} id=${c.id}  name=${JSON.stringify(c.name)} locked=${c.locked}`);
  console.log("\n  Map the Instagram id -> \"instagram_main\" and the TikTok id -> \"tiktok_main\" in");
  console.log(`  ${path.relative(process.cwd(), CHANNELS_PATH)}  (do not commit real ids until the owner confirms).`);
  console.log("");
}

function buildRow({ artifact, variant, platform, scheduledForIso }) {
  const channels = loadChannels();
  const channelKey = PLATFORM_CHANNEL_KEY[platform];
  const caption = captionFor(platform, variant);
  return {
    job_id: jobId({ content_id: artifact.content_id ?? variant.content_id, platform, creative_variant: variant.creative_variant }),
    content_id: artifact.content_id ?? variant.content_id ?? null,
    creative_family: artifact.creative_family,
    creative_variant: variant.creative_variant,
    platform,
    content_goal: artifact.content_goal ?? null,
    media: {
      kind: variant.media.kind,
      files: variant.media.files,
      width: variant.media.width,
      height: variant.media.height,
      durationS: variant.media.durationS ?? null,
      itemCount: variant.media.itemCount ?? null,
      filesExist: variant.media.filesExist,
    },
    caption: caption ?? "",
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
    snapshot: { ...(variant.snapshot ?? {}) },
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
  const cut = opts.cut ?? (platform === "tiktok" ? "tiktok" : platform === "instagram_reel" ? "reel" : null);
  const res = resolveArtifactVariant(idOrKey, { platformCut: cut });
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
      caption: row.caption,
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
    existing.history.push({ at: new Date().toISOString(), from: existing.status, to: "DRAFT", note: "re-prepared (caption re-frozen)" });
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
  console.log(`  family=${out.creative_family}  variant=${out.creative_variant}  platform=${out.platform}  goal=${out.content_goal}`);
  console.log(`  channel_key=${out.channel_key}  channel_id=${out.channel_id ?? "(unresolved — owner auth pending)"}`);
  console.log(`  media: ${out.media.kind} ${out.media.width}x${out.media.height}${out.media.durationS ? ` ${out.media.durationS}s` : ""}  files ${out.media.filesExist ? "present" : "MISSING"}`);
  console.log(`  cta: ${out.cta_url}`);
  console.log(`  scheduled_for: ${brisbaneLabel(out.scheduled_for)}`);
  console.log(`  caption (FROZEN, ${out.caption.length} chars):`);
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
  const cut = row.platform === "tiktok" ? "tiktok" : row.platform === "instagram_reel" ? "reel" : null;
  const res = resolveArtifactVariant(row.content_id, { platformCut: cut });
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

  const msg = {
    channelId: row.channel_id,
    text: row.caption,
    assets: row.media.files.map((f) => ({ type: row.media.kind === "video_916" ? "video" : "image", url: f })),
    dueAt: row.scheduled_for,
    saveToDraft: false,
    schedulingType: "automatic",
    postType: PLATFORM_POST_TYPE[row.platform],
    firstComment: row.first_comment,
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

// A dry-run pack from the CURRENT artifacts: 1 IG deal-drop still,
// 1 IG carousel, 1 IG reel, 1 TikTok — prepared, gated, NOT sent.
function cmdReviewPack() {
  banner();
  const targets = [
    // §18 asks for 1 IG still + 1 IG carousel from the daily static
    // pipeline. Those are only present when `social:daily` selected a post
    // that day; when inventory is thin it selects none and this reports
    // UNAVAILABLE (the correct fail-closed outcome).
    { key: "deal_of_day", platform: "instagram_feed", label: "Instagram — Deal Drop static (daily)" },
    { key: "pokemon_spotlight", platform: "instagram_carousel", label: "Instagram — Hook Carousel (daily)" },
    // 13E.4 video artifacts — always the 9:16 masters.
    { key: "video:13e4/deal_drop", platform: "instagram_reel", cut: "reel", label: "Instagram — Deal Drop Reel (9:16)" },
    { key: "video:13e4/deal_drop", platform: "tiktok", cut: "tiktok", label: "TikTok — Deal Drop (9:16)" },
    { key: "video:13e4/market_mover", platform: "instagram_reel", cut: "reel", label: "Instagram — Market Mover Reel (9:16)" },
    { key: "video:13e4/market_mover", platform: "tiktok", cut: "tiktok", label: "TikTok — Market Mover (9:16)" },
    { key: "video:13e4/hook_carousel", platform: "instagram_reel", cut: "reel", label: "Instagram — Hook Carousel Reel (9:16)" },
    { key: "video:13e4/brand_ad", platform: "tiktok", cut: "tiktok", label: "TikTok — Brand Ad (9:16)" },
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
      channel_key: target.channel_key,
      channel_id: target.channel_id,
      artifact: target.media.files,
      media: `${target.media.kind} ${target.media.width}x${target.media.height}${target.media.durationS ? ` ${target.media.durationS}s` : ""}`,
      planned_cta: target.cta_url,
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
    phase: "13E.5A",
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

  console.log("  FIRST DRY-RUN DISTRIBUTION REVIEW PACK\n");
  for (const it of pack) {
    if (it.error) {
      console.log(`  - ${it.label}: UNAVAILABLE — ${it.error}\n`);
      continue;
    }
    console.log(`  - ${it.label}`);
    console.log(`      content_id   : ${it.content_id}`);
    console.log(`      family/variant: ${it.creative_family} / ${it.creative_variant}   goal: ${it.content_goal}`);
    console.log(`      platform     : ${it.platform}  (channel ${it.channel_key} -> ${it.channel_id ?? "UNRESOLVED (owner auth pending)"})`);
    console.log(`      artifact     : ${it.artifact.join(", ")}`);
    console.log(`      media        : ${it.media}`);
    console.log(`      planned CTA  : ${it.planned_cta}`);
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
