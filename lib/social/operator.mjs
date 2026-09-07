// Phase 13E.9A - OPERATOR DASHBOARD pure logic.
//
// The status/blocker/readiness derivations, extracted so they are unit-
// testable without a DB or network. NOTHING here reads a file, calls a
// provider, or mutates anything.

// eBay Browse quota thresholds (shared with _recoverWhenQuota.sh / _waitForQuota.sh).
export const QUOTA_RESERVE = 900; // recovery reserve
export const QUOTA_HEALTHY_FLOOR = 1500; // _waitForQuota.sh resume threshold

// remaining -> state. null -> UNKNOWN. 0 -> RESET_PENDING (spent, waiting
// for the daily reset). < reserve -> RESERVE. < healthy floor -> LOW.
export function quotaState(remaining, { reserve = QUOTA_RESERVE, healthy = QUOTA_HEALTHY_FLOOR } = {}) {
  if (remaining == null || remaining === "") return "UNKNOWN"; // Number(null) === 0
  const r = Number(remaining);
  if (!Number.isFinite(r)) return "UNKNOWN";
  if (r <= 0) return "RESET_PENDING";
  if (r >= healthy) return "HEALTHY";
  if (r >= reserve) return "LOW";
  return "RESERVE";
}

// The status a single planned placement is in, from three read-only inputs:
//   planState  - the persisted plan state for this content_id+platform (plans.json), or undefined
//   ledgerRow  - the distribution ledger row for this content_id+platform, or undefined
// Precedence: EXPIRED (plan) > the ledger status if a row exists >
// UNAVAILABLE (plan REJECTED) > the plan state > PROPOSED.
export function statusForItem({ planState, ledgerRow } = {}) {
  if (planState === "EXPIRED") return "EXPIRED";
  if (ledgerRow && ledgerRow.status) return ledgerRow.status;
  if (planState === "REJECTED") return "UNAVAILABLE";
  return planState ?? "PROPOSED";
}

// Per-service platform summary. PURE - `planned` is this service's planned
// items, `ledgerRows` is this service's ledger rows, `ceiling` the daily
// cadence ceiling, `resolved` whether the Buffer alias maps. Each service
// is computed from its OWN slice; no cross-service coupling.
export function platformSummary({ label, role, planned = [], ledgerRows = [], ceiling = 1, resolved = false } = {}) {
  const next = planned.map((p) => p.time_utc).filter(Boolean).sort()[0] ?? null;
  return {
    label,
    role,
    planned_today: planned.length,
    queued: ledgerRows.filter((r) => r.status === "QUEUED").length,
    published: ledgerRows.filter((r) => r.status === "PUBLISHED").length,
    failed: ledgerRows.filter((r) => r.status === "FAILED").length,
    remaining_ceiling: Math.max(0, ceiling - planned.length),
    next_proposed_utc: next,
    connection_resolved: resolved === true,
  };
}

// First-live readiness (§12). `gates` is { key: { ok:boolean, detail } }.
// Rules:
//   * ready_to_send.ok === true (every gate ok)          -> "READY FOR LIVE SEND"
//   * else, if the INFRA gates (fresh_candidate, provider_auth,
//     channel_mapping, media_hosted) are all ok and the only things
//     missing are owner_approved + the live switches -> "READY FOR OWNER APPROVAL"
//   * anything else                                       -> "BLOCKED"
// NEVER returns a non-BLOCKED value while any infra gate fails.
export const INFRA_GATES = Object.freeze(["fresh_candidate", "provider_auth", "channel_mapping", "media_hosted"]);
export const LIVE_SWITCH_GATES = Object.freeze(["publishing_switch", "live_mode", "epn_classification"]);

export function firstLiveOverall(gates = {}) {
  const ok = (k) => gates[k]?.ok === true;
  const infraOk = INFRA_GATES.every(ok);
  const allOk = Object.keys(gates).filter((k) => k !== "ready_to_send").every(ok);

  if (allOk) return "READY FOR LIVE SEND";
  if (!infraOk) return "BLOCKED";

  // infra is ready; the remaining gaps are only owner approval + the live
  // switches (which are the owner's launch action) -> the operator can act now.
  const remaining = Object.keys(gates).filter((k) => k !== "ready_to_send" && !ok(k));
  const onlyLaunchGaps = remaining.every((k) => k === "owner_approved" || k === "batch_created" || LIVE_SWITCH_GATES.includes(k) || k === "fact_drift");
  return onlyLaunchGaps ? "READY FOR OWNER APPROVAL" : "BLOCKED";
}

// Build the blocker list from read-only signals. Each entry { code, detail }.
// Deterministic order (most-fundamental first).
export function deriveBlockers(sig = {}) {
  const b = [];
  const add = (code, detail) => b.push({ code, detail: String(detail ?? "") });

  if (sig.publishing_disabled) add("PUBLISHING_DISABLED", sig.publishing_detail);
  if (sig.epn_unclassified) add("EPN_UNCLASSIFIED", "SOCIAL_EPN_AI_CLASSIFICATION not set");
  if (sig.no_fresh_live_content) add("NO_FRESH_LIVE_CONTENT", sig.no_fresh_detail);
  if (sig.stale_source) add("STALE_SOURCE", sig.stale_detail);
  if (sig.channel_unresolved) add("CHANNEL_UNRESOLVED", sig.channel_detail);
  if (sig.provider_unconfigured) add("PROVIDER_UNCONFIGURED", "no BUFFER_ACCESS_TOKEN");
  if (sig.media_not_hosted) add("MEDIA_NOT_HOSTED", "no verified hosted asset");
  if (sig.no_batch) add("NO_BATCH", "no first-live batch prepared");
  else if (sig.owner_approval_required) add("OWNER_APPROVAL_REQUIRED", "no APPROVED, untampered batch");
  if (sig.qa_failed) add("QA_FAILED", sig.qa_detail);
  if (sig.rights_blocked) add("RIGHTS_BLOCKED", sig.rights_detail);
  if (sig.provider_error) add("PROVIDER_ERROR", sig.provider_error_detail);
  if (sig.quota_state === "RESET_PENDING" || sig.quota_state === "RESERVE") {
    add("QUOTA_" + sig.quota_state, `Browse quota remaining ${sig.quota_remaining ?? "?"} (reserve ${QUOTA_RESERVE})`);
  }
  return b;
}

// The recovery waiter/job state from the tail line of its log.
export function recoveryStateFromLog(lastLine) {
  if (!lastLine) return "UNKNOWN";
  if (/RECOVERED|COMPLETE\b|\bdone\b/i.test(lastLine)) return "COMPLETE";
  if (/applying|recovering|--recover/i.test(lastLine)) return "RUNNING";
  return "WAITING";
}
