// Phase 13E.6A - THE FIRST-LIVE BATCH.
//
// A batch is a SIGNED-OFF LAUNCH PLAN for ONE content_id across a chosen
// set of platform placements. It is NOT a publisher and NOT a status
// machine - the individual placement rows in the distribution ledger keep
// their own independent status. The batch only:
//   * freezes exactly which placements, which frozen copy, which approved
//     artifact hash, and which source snapshot are authorised
//   * carries the owner's approval timestamp + an approval CHECKSUM over
//     all of the above, so any post-approval tampering (copy edit, asset
//     swap, added placement) invalidates the approval
//   * records the deterministic send order
//
// Pure logic + a JSON file next to it (batches.json). No network. It
// imports no provider.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BATCHES_PATH = join(HERE, "batches.json");

// First-live send order (13E.6A §7). Rationale in
// docs/first-live-social-runbook.md: X first (text only - no media-upload
// dependency, fastest, lowest-risk first signal), then Instagram
// (Business account, the most-vetted auto-publish path), then TikTok
// (Business account, original-audio-only constraint), then YouTube last
// (largest asset, slowest platform-side processing).
export const DEFAULT_SEND_ORDER = Object.freeze(["x_post", "instagram_reel", "instagram_feed", "instagram_carousel", "tiktok", "youtube_short"]);

// Material fact-drift tolerances (13E.6A §6). Anything outside these ->
// the approved creative is invalid and the send is BLOCKED (never
// silently republished with stale facts).
export const DRIFT_TOLERANCE = Object.freeze({
  // any change at all to the listed price invalidates a "$X vs $Y" creative
  listed_usd_abs: 0.01,
  // the market reference may wobble a little without changing the story
  market_ref_pct: 0.02,
  // the headline discount may move at most ~2 percentage points
  discount_pct_points: 0.02,
  // Market Mover movement % may move at most ~3 percentage points
  movement_pct_points: 0.03,
});

const stable = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());

export function loadBatches(path = BATCHES_PATH) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("batches.json is not a JSON array");
  return parsed;
}
export function saveBatches(rows, path = BATCHES_PATH) {
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n", "utf8");
}
export function findBatch(rows, id) {
  return rows.find((b) => b.batch_id === id) ?? null;
}

// Deterministic checksum over EVERYTHING the owner is signing off. Order-
// independent for the placement set; exact for copy + hashes + source.
export function approvalChecksum(batch) {
  const placements = [...(batch.placements ?? [])]
    .map((p) => ({
      job_id: p.job_id,
      platform: p.platform,
      creative_variant: p.creative_variant,
      caption: p.frozen_copy?.caption ?? "",
      youtube_title: p.frozen_copy?.youtube_title ?? null,
      cta_url: p.frozen_copy?.cta_url ?? null,
      hashtags: p.frozen_copy?.hashtags ?? [],
      media_sha256: p.approved_artifact_sha256 ?? null,
      public_media_url: p.public_media_url ?? null,
      channel_key: p.channel_key ?? null,
    }))
    .sort((a, b) => a.job_id.localeCompare(b.job_id));
  const facts = batch.frozen_facts ?? {};
  const payload = {
    content_id: batch.content_id,
    source_snapshot_id: batch.source_snapshot_id ?? null,
    source_captured_at: batch.source_captured_at ?? null,
    source_is_live: Boolean(batch.source_is_live),
    source_commit: batch.source_commit ?? null,
    schedule_mode: batch.schedule_mode ?? "PUBLISH_NOW",
    scheduled_for: batch.scheduled_for ?? null,
    send_order: batch.send_order ?? [],
    facts: {
      market_price: facts.market_price ?? null,
      discount_pct: facts.discount_pct ?? null,
      listed_usd: facts.listed_usd ?? null,
      movement_pct: facts.movement_pct ?? null,
    },
    placements,
  };
  return "sha256:" + createHash("sha256").update(stable(payload) + JSON.stringify(payload.placements)).digest("hex");
}

// Build a DRAFT batch from a set of prepared ledger rows (all for the
// same content_id). `rows` are distribution-ledger rows.
export function buildBatch({ content_id, rows, sendOrder = DEFAULT_SEND_ORDER, scheduleMode = "PUBLISH_NOW", scheduledFor = null, sourceCommit = null }) {
  if (!rows?.length) throw new Error("buildBatch: no placement rows");
  const ids = new Set(rows.map((r) => r.content_id));
  if (ids.size !== 1 || !ids.has(content_id)) {
    throw new Error(`buildBatch: every placement must share content_id "${content_id}" (got ${[...ids].join(", ")})`);
  }
  const anySnap = rows.find((r) => r.snapshot)?.snapshot ?? {};
  const factSnap = rows.find((r) => r.snapshot?.market_price != null || r.snapshot?.movement || r.snapshot?.listed_usd != null)?.snapshot ?? {};

  const ordered = [...rows].sort((a, b) => {
    const ia = sendOrder.indexOf(a.platform);
    const ib = sendOrder.indexOf(b.platform);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  const batch = {
    batch_id: `batch_${(content_id || "x").replace(/[^a-z0-9]+/gi, "").slice(0, 20)}_${Date.now().toString(36)}`,
    content_id,
    source_snapshot_id: anySnap.source ?? null,
    source_captured_at: anySnap.source_captured_at ?? null,
    source_is_live: Boolean(anySnap.source_is_live),
    source_commit: sourceCommit,
    schedule_mode: scheduleMode, // "PUBLISH_NOW" | "SCHEDULED"
    scheduled_for: scheduleMode === "SCHEDULED" ? scheduledFor : null,
    send_order: ordered.map((r) => r.platform),
    frozen_facts: {
      market_price: factSnap.market_price ?? null,
      discount_pct: factSnap.discount_pct ?? null,
      listed_usd: factSnap.listed_usd ?? null,
      movement_pct: factSnap.movement?.pct ?? null,
    },
    placements: ordered.map((r) => ({
      job_id: r.job_id,
      platform: r.platform,
      placement: r.placement,
      creative_variant: r.creative_variant,
      channel_key: r.channel_key,
      channel_id_at_approval: r.channel_id ?? null,
      approved_artifact_sha256: r.media_sha256 ?? null,
      hosted_asset_id: r.hosted_asset_id ?? null,
      public_media_url: r.public_media_url ?? null,
      frozen_copy: {
        caption: r.caption ?? "",
        youtube_title: r.youtube_title ?? null,
        cta_url: r.cta_url ?? null,
        hashtags: r.hashtags ?? [],
      },
    })),
    status: "DRAFT", // DRAFT | APPROVED | PARTIAL_SUCCESS | PUBLISHED | FAILED | CANCELLED (derived - see batchStatus)
    created_at: new Date().toISOString(),
    owner_approved_at: null,
    owner_approved_by: null,
    approval_checksum: null,
    history: [{ at: new Date().toISOString(), note: `batch built for ${content_id} - ${ordered.length} placement(s), order [${ordered.map((r) => r.platform).join(", ")}]` }],
  };
  return batch;
}

// APPROVE: stamp the owner + freeze the checksum. Does NOT publish.
export function approveBatch(batch, { by = "owner" } = {}) {
  if (batch.status !== "DRAFT") return { ok: false, reason: `batch is ${batch.status}, not DRAFT` };
  if (!batch.placements?.length) return { ok: false, reason: "no placements" };
  if (batch.placements.some((p) => !p.approved_artifact_sha256 && p.platform !== "x_post")) {
    return { ok: false, reason: "a media placement has no approved artifact sha256 - host it first" };
  }
  batch.owner_approved_at = new Date().toISOString();
  batch.owner_approved_by = by;
  batch.approval_checksum = approvalChecksum(batch);
  batch.status = "APPROVED";
  batch.history.push({ at: batch.owner_approved_at, note: `APPROVED by ${by}; checksum ${batch.approval_checksum.slice(0, 22)}…` });
  return { ok: true, checksum: batch.approval_checksum };
}

// Is the approval still valid (nothing tampered since sign-off)?
export function batchApprovalValid(batch) {
  if (batch.status !== "APPROVED" && batch.status !== "PARTIAL_SUCCESS") {
    return { ok: false, reason: `batch status ${batch.status}` };
  }
  if (!batch.approval_checksum) return { ok: false, reason: "no approval checksum" };
  const now = approvalChecksum(batch);
  if (now !== batch.approval_checksum) {
    return { ok: false, reason: `approval checksum mismatch - the batch was edited after sign-off (approved ${batch.approval_checksum.slice(0, 18)}… now ${now.slice(0, 18)}…) - re-approve` };
  }
  return { ok: true };
}

// Deterministic fact-drift check (13E.6A §6). `liveFacts` = the facts as
// re-read from the artifact right now.
export function factDrift(batch, liveFacts = {}) {
  const f = batch.frozen_facts ?? {};
  const out = [];
  // null/undefined/"" -> null (NOT 0 - Number(null) is 0, which would
  // false-trigger every drift check against an unfrozen fact).
  const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const listedFrozen = num(f.listed_usd);
  const listedNow = num(liveFacts.listedUsd ?? liveFacts.listed_usd);
  if (listedFrozen != null && listedNow != null && Math.abs(listedNow - listedFrozen) > DRIFT_TOLERANCE.listed_usd_abs) {
    out.push({ field: "listed_usd", frozen: listedFrozen, now: listedNow, action: "BLOCK" });
  }
  const refFrozen = num(f.market_price);
  const refNow = num(liveFacts.marketRefUsd ?? liveFacts.market_price);
  if (refFrozen != null && refNow != null && refFrozen > 0 && Math.abs(refNow - refFrozen) / refFrozen > DRIFT_TOLERANCE.market_ref_pct) {
    out.push({ field: "market_price", frozen: refFrozen, now: refNow, action: "BLOCK" });
  }
  const dFrozen = num(f.discount_pct);
  const dNow = num(liveFacts.discountPct ?? liveFacts.discount_pct);
  if (dFrozen != null && dNow != null && Math.abs(dNow - dFrozen) > DRIFT_TOLERANCE.discount_pct_points) {
    out.push({ field: "discount_pct", frozen: dFrozen, now: dNow, action: "BLOCK" });
  }
  const mFrozen = num(f.movement_pct);
  const mNow = num(liveFacts.movementPct ?? liveFacts.movement_pct);
  if (mFrozen != null && mNow != null && Math.abs(mNow - mFrozen) > DRIFT_TOLERANCE.movement_pct_points) {
    out.push({ field: "movement_pct", frozen: mFrozen, now: mNow, action: "BLOCK" });
  }
  if (liveFacts.listing_ended === true) {
    out.push({ field: "listing_ended", frozen: false, now: true, action: "CANCEL" });
  }
  return { drifted: out.length > 0, findings: out };
}

// Derive a batch-level status from its placement rows (the ledger is the
// source of truth for per-placement status).
export function batchStatus(batch, ledgerRows = []) {
  const byId = new Map(ledgerRows.map((r) => [r.job_id, r]));
  const st = batch.placements.map((p) => byId.get(p.job_id)?.status ?? "MISSING");
  if (batch.status === "DRAFT") return "DRAFT";
  if (st.every((s) => s === "PUBLISHED")) return "PUBLISHED";
  if (st.every((s) => s === "FAILED" || s === "CANCELLED")) return "FAILED";
  if (st.some((s) => ["QUEUED", "PUBLISHED"].includes(s)) && st.some((s) => ["FAILED", "CANCELLED", "APPROVED", "READY", "DRAFT", "MISSING"].includes(s))) {
    return "PARTIAL_SUCCESS";
  }
  if (st.every((s) => ["QUEUED", "PUBLISHED"].includes(s))) return "ALL_QUEUED_OR_PUBLISHED";
  return "APPROVED";
}
