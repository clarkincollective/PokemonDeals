// Phase 13E.6A - PRE-SEND REVALIDATION.
//
// Every placement is re-checked immediately before a (future) real send.
// This is the single choke point between "the owner approved a batch"
// and "a lead is handed to Buffer". It runs the FULL distribution gate
// stack PLUS batch-integrity + fact-drift checks, and it NEVER mutates
// copy. If any material fact has drifted it BLOCKS and demands a
// re-render + re-approval.
//
// Pure: takes already-read inputs, returns { ok, blockers, drift }. The
// CLI does the I/O.

import { runAllGates } from "./gates.mjs";
import { batchApprovalValid, factDrift } from "./batch.mjs";

// row        : the distribution ledger row for this placement
// batch      : the approved batch record
// variant    : the artifact variant, RE-RESOLVED now
// liveFacts  : facts as re-read from the artifact now (variant.facts)
// currentMediaSha : sha256 of the local media file right now
// flags / providerConfigured / channels / ledger : current environment
export function revalidatePlacement({
  row,
  batch,
  variant,
  liveFacts = {},
  currentMediaSha = null,
  flags,
  providerConfigured,
  channels = {},
  ledger = [],
  force = false,
} = {}) {
  const blockers = [];

  // 1. batch approval still valid (nothing tampered since sign-off)
  const bv = batchApprovalValid(batch);
  if (!bv.ok) blockers.push(`batch_approval: ${bv.reason}`);

  // 2. this placement is actually in the approved batch
  const bp = batch?.placements?.find((p) => p.job_id === row.job_id);
  if (!bp) blockers.push(`batch_membership: ${row.job_id} is not in batch ${batch?.batch_id}`);

  // 3. the copy the row carries NOW is byte-identical to what the batch froze
  if (bp) {
    if (String(row.caption ?? "") !== String(bp.frozen_copy?.caption ?? "")) {
      blockers.push("copy_frozen: row caption differs from the approved batch copy - re-approve");
    }
    if ((row.youtube_title ?? null) !== (bp.frozen_copy?.youtube_title ?? null)) {
      blockers.push("copy_frozen: youtube_title differs from the approved batch copy");
    }
    if ((row.cta_url ?? null) !== (bp.frozen_copy?.cta_url ?? null)) {
      blockers.push("copy_frozen: cta_url differs from the approved batch copy");
    }
  }

  // 4. the hosted asset hash still matches the approved artifact
  if (bp && bp.approved_artifact_sha256) {
    if ((row.media_sha256 ?? null) !== bp.approved_artifact_sha256) {
      blockers.push(`asset_hash: row media sha ${String(row.media_sha256 ?? "?").slice(0, 12)}… != approved ${bp.approved_artifact_sha256.slice(0, 12)}… - re-host + re-approve`);
    }
    if (currentMediaSha != null && currentMediaSha !== bp.approved_artifact_sha256) {
      blockers.push(`asset_hash: local file sha ${currentMediaSha.slice(0, 12)}… != approved ${bp.approved_artifact_sha256.slice(0, 12)}… - the source artifact changed`);
    }
  }

  // 5. deterministic FACT DRIFT (§6) - price / reference / discount /
  //    movement moved beyond tolerance, or the listing ended.
  const drift = factDrift(batch, liveFacts);
  for (const d of drift.findings) {
    blockers.push(`fact_drift[${d.action}]: ${d.field} frozen=${d.frozen} now=${d.now}`);
  }

  // 6. Buffer channel: if the alias still maps, re-resolve the id (safe);
  //    if it no longer maps, block.
  if (bp) {
    const liveChannelId = channels[bp.channel_key] ?? null;
    if (!liveChannelId) {
      blockers.push(`channel: alias "${bp.channel_key}" no longer resolves - reconnect the channel`);
    } else if (liveChannelId !== (row.channel_id ?? null)) {
      // metadata-only change: allowed, but note it (caller re-resolves)
      blockers.push(`channel_reresolve: "${bp.channel_key}" id changed ${row.channel_id ?? "?"} -> ${liveChannelId} (re-resolve before send)`);
    }
  }

  // 7. the FULL distribution gate stack (publish_switch, live_mode,
  //    epn_compliance, qa_pass, rights_cleared, owner_approval,
  //    provider_auth, channel_resolved, placement_eligible,
  //    media_compatible, media_present, asset_not_drifted, caption_frozen,
  //    deterministic_facts, freshness_at_send, not_duplicate)
  const gate = runAllGates({ row, variant, flags, providerConfigured, ledger, force, currentMediaSha });
  for (const b of gate.blockers) blockers.push(b);

  return {
    ok: blockers.length === 0,
    blockers,
    drift: drift.findings,
    gates: gate.gates,
  };
}
