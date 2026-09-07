// Phase AUTO-2 - AUTONOMOUS SOCIAL PROVIDER WIRING.
//
// Reuses the EXISTING Buffer path - it creates NO second implementation.
// The mutation primitives are exactly the ones scripts/socialPublish.mjs
// cmdSendBatch uses:
//   revalidatePlacement        lib/social/distribution/revalidate
//   getSocialProvider().createPost   lib/social/providers
//   applyProviderAccept / applyProviderReject   lib/social/distribution/ledger
//
// Nothing here decides WHETHER to publish - that is socialAuto.mjs +
// resolveLiveSocialGates below. This module only performs an
// already-authorised submit.

import { RIGHTS_STATE } from "../social/rights.mjs";
import { readDistributionFlags } from "../social/distribution/config.mjs";
import { getSocialProvider } from "../social/providers/index.mjs";
import { revalidatePlacement } from "../social/distribution/revalidate.mjs";
import { applyProviderAccept, applyProviderReject, findJob } from "../social/distribution/ledger.mjs";
import { batchApprovalValid, batchStatus } from "../social/distribution/batch.mjs";
import { isTripped } from "./runState.mjs";

// EVERY live-social gate, in one place. `posture` = resolveSocialPosture()
// with requestLive:true. `circuit` = loadCircuit("social"). Returns
// { ok, blockers } - `ok` false => NO MUTATION.
export function resolveLiveSocialGates({ env = process.env, posture, circuit } = {}) {
  const flags = readDistributionFlags(env);
  const provider = getSocialProvider(env);
  const b = [];
  // --- AUTO flags ---
  if (posture?.kill) b.push("SOCIAL_AUTONOMOUS_KILL=true");
  if (!posture?.enabled) b.push("SOCIAL_AUTONOMOUS_ENABLED != true");
  if (!posture?.stage?.mutatesProviders) b.push(`SOCIAL_AUTONOMOUS_STAGE ${posture?.stageId} does not mutate (need >= STAGE_1)`);
  if (posture?.requestLive !== true) b.push("live not explicitly requested");
  if (isTripped(circuit)) b.push(`circuit ${circuit.state} - owner resume required`);
  // --- existing publish controls (defence in depth, same as cmdSendBatch) ---
  if (RIGHTS_STATE.publishing !== "ALLOWED") b.push("RIGHTS_STATE.publishing != ALLOWED");
  if (flags.publishEnabled !== true) b.push("SOCIAL_PUBLISH_ENABLED != true");
  if (flags.dryRun !== false) b.push('SOCIAL_PUBLISH_DRY_RUN is not "false"');
  if (flags.epnAiClassification == null) b.push("SOCIAL_EPN_AI_CLASSIFICATION not set");
  if (!provider.isConfigured()) b.push("no social provider configured (BUFFER_ACCESS_TOKEN)");
  return { ok: b.length === 0, blockers: b, provider, flags };
}

// Submit an AUTONOMOUS-approved batch. Mirrors cmdSendBatch exactly:
// per-placement revalidate -> createPost -> ledger accept/reject; one
// failure never stops the others; QUEUED != PUBLISHED.
//
// The caller MUST have checked resolveLiveSocialGates().ok === true.
export async function submitAutonomousBatch({ batch, ledger, channels = [], env = process.env, now = Date.now() } = {}) {
  const bv = batchApprovalValid(batch);
  if (!bv.ok) return { ok: false, reason: `batch approval invalid: ${bv.reason}`, results: [] };

  const flags = readDistributionFlags(env);
  const provider = getSocialProvider(env);
  if (!provider.isConfigured()) return { ok: false, reason: "provider not configured", results: [] };

  const ordered = [...(batch.placements ?? [])].sort(
    (a, b) => (batch.send_order ?? []).indexOf(a.platform) - (batch.send_order ?? []).indexOf(b.platform)
  );
  const results = [];
  const providerErrors = [];

  for (const p of ordered) {
    const row = findJob(ledger, p.job_id);
    if (!row) { results.push({ platform: p.platform, outcome: "SKIP", reason: "ledger row missing" }); continue; }
    if (["QUEUED", "PUBLISHED"].includes(row.status)) {
      results.push({ platform: p.platform, outcome: "ALREADY", status: row.status, providerRef: row.provider_ref });
      continue;
    }
    // §18 retry safety - a row that already has a provider_ref was accepted; never resubmit.
    if (row.provider_ref) {
      results.push({ platform: p.platform, outcome: "ALREADY", status: row.status, providerRef: row.provider_ref, reason: "has provider_ref - use sync, not resubmit" });
      continue;
    }
    const variant = { facts: row.snapshot ?? {}, qa: row.qa, rights: row.rights, media: row.media, snapshot: row.snapshot, caption_instagram: row.caption, caption_tiktok: row.caption, x: row.platform === "x_post" ? { ok: true, text: row.caption } : undefined, youtube: row.platform === "youtube_short" ? { ok: true, description: row.caption } : undefined };
    const rv = revalidatePlacement({ row, batch, variant, liveFacts: variant.facts ?? {}, currentMediaSha: row.media_sha256 ?? null, flags, providerConfigured: provider.isConfigured(), channels, ledger });
    if (!rv.ok) { results.push({ platform: p.platform, outcome: "BLOCKED", blockers: rv.blockers }); continue; }

    const assets = row.media?.kind === "text_only" || !row.public_media_url ? [] : [{ type: row.media.kind === "video_916" ? "video" : "image", url: row.public_media_url }];
    const msg = {
      channelId: row.channel_id, platform: row.service, placement: row.placement,
      text: row.caption, assets, dueAt: row.scheduled_for, saveToDraft: false, schedulingType: "automatic",
      firstComment: row.first_comment, youtubeTitle: row.youtube_title ?? null,
      siteLink: row.platform === "instagram_feed" ? row.cta_url : null,
    };
    let res;
    try {
      res = await provider.createPost(msg);
    } catch (e) {
      res = { accepted: false, reason: "provider_exception", detail: String(e.message).slice(0, 200) };
    }
    if (res?.accepted) {
      applyProviderAccept(row, { provider: provider.name, providerRef: res.id });
      results.push({ platform: p.platform, outcome: "QUEUED", providerRef: res.id });
    } else {
      applyProviderReject(row, { provider: provider.name, reason: res?.reason ?? "unknown", detail: res?.detail ?? "" });
      results.push({ platform: p.platform, outcome: "FAILED", reason: res?.reason ?? "unknown" });
      providerErrors.push(`${p.platform}: ${res?.reason ?? "unknown"}`);
    }
  }

  batch.status = batchStatus(batch, ledger);
  batch.history = [...(batch.history ?? []), { at: new Date(now).toISOString(), note: `autonomous send-batch: ${results.map((r) => `${r.platform}=${r.outcome}`).join(" ")}` }];

  const anyOk = results.some((r) => r.outcome === "QUEUED" || r.outcome === "ALREADY");
  const anyBad = results.some((r) => r.outcome === "FAILED" || r.outcome === "BLOCKED");
  return {
    ok: anyOk && !anyBad ? true : anyOk,
    verdict: anyOk && anyBad ? "PARTIAL_SUCCESS" : anyOk ? "ALL_QUEUED" : "ALL_FAILED",
    results,
    providerErrors,
  };
}
