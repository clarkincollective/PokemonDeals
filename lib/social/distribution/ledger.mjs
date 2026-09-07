// Phase 13E.5A - THE PUBLISHING LEDGER.
//
// A durable, append-friendly record of every social post the distribution
// layer is ASKED to publish - one row per (content_id + platform +
// creative_variant). It is the audit trail and the duplicate-protection
// index. Mirrors the outreach records.json pattern: pure logic here, a
// JSON file next to it, a thin CLI on top.
//
// STATE MACHINE
//   DRAFT      prepared from an artifact, not yet checked
//   READY      passed every preflight gate EXCEPT human approval
//   APPROVED   a human approved it (explicit, per-row)
//   QUEUED     a provider accepted the post (lead/update created) -
//              NOT proof it published
//   PUBLISHED  the provider gave real evidence the post went live
//   FAILED     the provider rejected it, or a sync found a hard failure
//   CANCELLED  a human pulled it back before it published
//
// provider acceptance != PUBLISHED. published_at is set ONLY by
// applyProviderEvidence() on a real "it went live" signal - never from
// our local clock just because an API call returned 200.
//
// This module does NO network I/O and imports no provider.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const LEDGER_PATH = join(HERE, "ledger.json");

export const STATUSES = Object.freeze([
  "DRAFT",
  "READY",
  "APPROVED",
  "QUEUED",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
]);

// A row in one of these has a publish attempt in flight or done - it
// blocks a duplicate and is what "already distributed" means.
export const IN_FLIGHT_OR_DONE = Object.freeze(["QUEUED", "PUBLISHED"]);

// The documented row shape (not runtime-enforced, mirrors records.json):
//   job_id            stable: `${content_id}::${platform}::${creative_variant}`
//   content_id        the deterministic creative id (creativeSpec)
//   creative_family   deal_drop | market_mover | hook_carousel | brand_ad | market_snapshot
//   creative_variant  "A" | "B" | "9x16" | ...  (which cut of the creative)
//   platform          instagram_feed | instagram_carousel | instagram_reel | tiktok
//   content_goal      REACH | ENGAGEMENT | TRUST | CONVERSION | BRAND
//   media             { kind, files:[...], width, height, durationS?, itemCount? }
//   caption           FROZEN at prepare time - the exact text that will post
//   hashtags          FROZEN array
//   first_comment     FROZEN string | null
//   cta_url           the on-site destination (never a raw eBay URL)
//   channel_key       instagram_main | tiktok_main
//   channel_id        resolved Buffer channel id | null (blocked until auth)
//   provider          "buffer" | null
//   provider_ref      the provider's post/update id | null
//   status            one of STATUSES
//   qa                { ok, passed, total, failed:[...] }  (frozen)
//   rights            the frozen RIGHTS_STATE copy carried by the artifact
//   source_commit     git HEAD when the row was prepared
//   snapshot          { checkedAt, market_price?, discount_pct?, movement? } (frozen deterministic facts)
//   scheduled_for     UTC ISO | null (null = publish now)
//   created_at / approved_at / queued_at / published_at / failed_at   UTC ISO | null
//   last_error        { at, stage, reason, detail } | null
//   retry_count       integer
//   dry_runs          [{ at, gates_ok, blockers:[...] }]   (append)
//   history           [{ at, from, to, note }]             (append)
//   --- 13E.7A read-only measurement (never mutated by a publish path) ---
//   cta_attribution   { utm_source, utm_medium, utm_campaign, utm_content } - frozen at prepare
//   platform_post_url the live post URL, from provider evidence only (never scraped)
//   metrics           newest reading; every key null = "no reading" (NOT 0)
//   metrics_snapshots [{ captured_at, source, metrics, unsupported, units, provider_metrics_updated_at }]
//   metrics_error     { at, reason, detail } | null  (last good snapshot retained)
//   last_metrics_sync UTC ISO | null
//   experiment_id / experiment_variant / experiment_hypothesis  design-only tags (inert)

export function jobId({ content_id, platform, creative_variant }) {
  return `${content_id}::${platform}::${creative_variant ?? "A"}`;
}

export function loadLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("ledger.json is not a JSON array");
  return parsed;
}

export function saveLedger(rows, path = LEDGER_PATH) {
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

export function findJob(rows, id) {
  return rows.find((r) => r.job_id === id) ?? null;
}

// Is there ALREADY a row for this exact placement that is in flight or
// published? (duplicate protection - §12). A row for the same placement
// that FAILED/CANCELLED/DRAFT does not block; it is re-used by prepare().
export function duplicateOf(row, rows) {
  return rows.find(
    (r) =>
      r.job_id !== row.job_id &&
      IN_FLIGHT_OR_DONE.includes(r.status) &&
      r.content_id === row.content_id &&
      r.platform === row.platform &&
      (r.creative_variant ?? "A") === (row.creative_variant ?? "A")
  ) ?? null;
}

function pushHistory(row, from, to, note = "") {
  row.history = Array.isArray(row.history) ? row.history : [];
  row.history.push({ at: new Date().toISOString(), from, to, note });
}

// --- transitions (pure: mutate + return the row; caller persists) -----

// DRAFT/FAILED/CANCELLED -> READY. Caller has already run the gates and
// passes their result; this only records it.
export function markReady(row, { gatesOk, blockers = [] } = {}) {
  if (!["DRAFT", "FAILED", "CANCELLED", "READY"].includes(row.status)) {
    return { ok: false, reason: `cannot move ${row.status} -> READY` };
  }
  if (!gatesOk) return { ok: false, reason: `not ready: ${blockers.join("; ") || "gates failed"}` };
  const from = row.status;
  row.status = "READY";
  pushHistory(row, from, "READY", "all non-approval gates passed");
  return { ok: true };
}

// READY -> APPROVED (explicit human approval). Requires the row to be
// READY *now* - you cannot approve a DRAFT that never passed the gates.
export function approve(row, { by = "owner" } = {}) {
  if (row.status !== "READY") {
    return { ok: false, reason: `approve requires status READY, got ${row.status}` };
  }
  row.status = "APPROVED";
  row.approved_at = new Date().toISOString();
  row.approved_by = by;
  pushHistory(row, "READY", "APPROVED", `approved by ${by}`);
  return { ok: true };
}

// APPROVED -> QUEUED, on a provider ACCEPT. NOT a publish.
export function applyProviderAccept(row, { provider, providerRef }) {
  if (row.status !== "APPROVED") {
    return { ok: false, reason: `queue requires APPROVED, got ${row.status}` };
  }
  row.status = "QUEUED";
  row.provider = provider;
  row.provider_ref = providerRef ?? null;
  row.queued_at = new Date().toISOString();
  row.last_error = null;
  pushHistory(row, "APPROVED", "QUEUED", `accepted by ${provider} (ref ${providerRef ?? "n/a"}) - NOT yet published`);
  return { ok: true };
}

// A provider REJECT at submit time -> FAILED (no auto-retry).
export function applyProviderReject(row, { provider, reason, detail = "" }) {
  const from = row.status;
  row.status = "FAILED";
  row.failed_at = new Date().toISOString();
  row.last_error = { at: row.failed_at, stage: "submit", reason: String(reason), detail: String(detail).slice(0, 400) };
  row.retry_count = (row.retry_count ?? 0) + 1;
  pushHistory(row, from, "FAILED", `provider ${provider} rejected: ${reason}`);
  return { ok: true };
}

// A `sync` reading from the provider. `evidence` is the NORMALISED shape
// from the provider adapter:
//   { ok, published:boolean, publishedAt:string|null, failed:boolean,
//     failReason?:string, statusRaw?:any }
// QUEUED -> PUBLISHED ONLY when published===true AND a real publishedAt
// timestamp is present. QUEUED -> FAILED on failed===true. Otherwise no
// state change (still QUEUED).
export function applyProviderEvidence(row, evidence = {}) {
  if (row.status !== "QUEUED") {
    return { ok: false, changed: false, note: `not QUEUED (status ${row.status}) - nothing to sync` };
  }
  row.synced_at = new Date().toISOString();
  if (evidence.failed) {
    row.status = "FAILED";
    row.failed_at = row.synced_at;
    row.last_error = { at: row.synced_at, stage: "sync", reason: String(evidence.failReason || "provider reported failure"), detail: "" };
    pushHistory(row, "QUEUED", "FAILED", `provider evidence: failed (${evidence.failReason || "?"})`);
    return { ok: true, changed: true, note: "provider reported the post failed -> FAILED" };
  }
  if (evidence.published && evidence.publishedAt) {
    row.status = "PUBLISHED";
    row.published_at = evidence.publishedAt; // PROVIDER timestamp, never our clock
    // the live post URL, ONLY if the provider actually returned one.
    if (evidence.platformPostUrl) row.platform_post_url = evidence.platformPostUrl;
    pushHistory(row, "QUEUED", "PUBLISHED", `provider evidence: live at ${evidence.publishedAt}${evidence.platformPostUrl ? ` (${evidence.platformPostUrl})` : ""}`);
    return { ok: true, changed: true, note: `provider confirmed live at ${evidence.publishedAt} -> PUBLISHED` };
  }
  return { ok: true, changed: false, note: "still queued at the provider - no publish evidence yet" };
}

// any non-terminal -> CANCELLED (human pulls it back). QUEUED can still be
// cancelled locally (the provider queue item must be removed by hand -
// the ledger records the intent).
export function cancel(row, { reason = "cancelled by owner" } = {}) {
  if (["PUBLISHED"].includes(row.status)) {
    return { ok: false, reason: "already PUBLISHED - cannot cancel a live post from here" };
  }
  const from = row.status;
  row.status = "CANCELLED";
  row.cancelled_at = new Date().toISOString();
  pushHistory(row, from, "CANCELLED", reason);
  return { ok: true };
}

// Count QUEUED+PUBLISHED rows in a trailing window (a soft throughput
// guard the CLI can surface; not a hard cap in this phase).
export function distributedInWindow(rows, { now = Date.now(), windowMs = 24 * 3600 * 1000 } = {}) {
  return rows.filter((r) => {
    const t = r.published_at ?? r.queued_at;
    return t && now - new Date(t).getTime() < windowMs;
  }).length;
}
