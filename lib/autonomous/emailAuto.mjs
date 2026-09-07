// Phase AUTO-1 - AUTONOMOUS EMAIL DIGEST ORCHESTRATION (pure decision logic).
//
// No network, no Resend, no DB client. Takes the current digest-deal set
// + subscriber counts + send history and returns a DECISION: build & send
// a digest, or SKIP (with a reason). A real run refuses on any blocker.
//
// Reuses the existing contracts:
//   digest deal source   lib/deals.fetchDigestDeals  (is_active + BIN-only)
//   subscriber model     lib/crm/subscribers.deriveStatus / canReceiveMail
//   template             lib/crm/digestTemplate.renderDigest
//   the CRM-1B kill switch DIGEST_SEND_ENABLED still applies on top.

import { deriveStatus } from "../crm/subscribers.js";
import { createHash } from "node:crypto";

// §20 - content bounds.
export const DIGEST_MIN_DEALS = 3;
export const DIGEST_MAX_DEALS = 8;
export const DIGEST_TARGET_DEALS = 6;

// §21 - a deal may enter the digest only if ALL of these hold. `d` is a
// row as fetchDigestDeals returns it (already is_active + BIN-only).
export function digestDealSafe(d = {}, { now = Date.now(), maxAgeHours } = {}) {
  const fail = [];
  if (d.is_active !== true) fail.push("not active");
  if (d.listing_type && d.listing_type !== "FIXED_PRICE" && d.listing_type !== "BIN") fail.push(`listing_type ${d.listing_type} (BIN-only)`);
  if (d.total_price == null || Number(d.total_price) <= 0) fail.push("no usable listed price");
  if (d.market_price == null || Number(d.market_price) <= 0) fail.push("no market reference");
  if (d.discount_pct == null || Number(d.discount_pct) <= 0) fail.push("no positive discount");
  if (d.image_verdict === "NO_TRUSTED_IMAGE" || d.image_ok === false) fail.push("image integrity failed");
  const id = d.id ?? d.deal_id;
  if (id == null) fail.push("no deal id (cannot build a website landing URL)");
  const lastSeen = Date.parse(d.last_seen_at ?? "");
  if (maxAgeHours != null && Number.isFinite(lastSeen) && (now - lastSeen) / 3.6e6 > maxAgeHours) {
    fail.push(`last_seen ${((now - lastSeen) / 3.6e6).toFixed(1)}h ago > ${maxAgeHours}h ceiling`);
  }
  return { ok: fail.length === 0, blockers: fail, id };
}

// §20 + §22 - select the digest set from candidates, then (a caller re-runs
// this at pre-send time with the FRESH set) re-check the minimum.
export function selectDigestDeals(candidates = [], opts = {}) {
  const kept = [];
  const dropped = [];
  for (const d of candidates) {
    const s = digestDealSafe(d, opts);
    if (s.ok) kept.push(d);
    else dropped.push({ id: s.id, blockers: s.blockers });
    if (kept.length >= DIGEST_MAX_DEALS) break;
  }
  return {
    deals: kept.slice(0, DIGEST_MAX_DEALS),
    dropped,
    meetsMinimum: kept.length >= DIGEST_MIN_DEALS,
    count: kept.length,
  };
}

// §22 - immediately before send: revalidate every item against the fresh
// deal state. Any item that expired / changed materially / lost image
// integrity is removed. If fewer than the minimum remain -> CANCEL the
// whole digest (never send a weak 1-card email).
export function preSendRevalidateDigest(frozenItems = [], freshById = new Map(), opts = {}) {
  const kept = [];
  const removed = [];
  const DRIFT_PCT = 0.05; // a 5%+ move in listed or reference price = "materially changed"
  for (const item of frozenItems) {
    const id = item.id ?? item.deal_id;
    const fresh = freshById.get(id) ?? freshById.get(String(id));
    if (!fresh) {
      removed.push({ id, reason: "no longer in the fresh digest set (expired / disqualified)" });
      continue;
    }
    const safe = digestDealSafe(fresh, opts);
    if (!safe.ok) {
      removed.push({ id, reason: `failed re-check: ${safe.blockers.join("; ")}` });
      continue;
    }
    const priceMoved = item.total_price != null && fresh.total_price != null && Math.abs(fresh.total_price - item.total_price) / item.total_price > DRIFT_PCT;
    const refMoved = item.market_price != null && fresh.market_price != null && Math.abs(fresh.market_price - item.market_price) / item.market_price > DRIFT_PCT;
    if (priceMoved || refMoved) {
      removed.push({ id, reason: `price/reference moved > ${DRIFT_PCT * 100}% since selection` });
      continue;
    }
    kept.push(fresh);
  }
  return {
    items: kept,
    removed,
    ok: kept.length >= DIGEST_MIN_DEALS,
    verdict: kept.length >= DIGEST_MIN_DEALS ? "SEND" : "CANCEL",
    count: kept.length,
  };
}

// §23 - the audience contract. Pure: takes minimal subscriber rows,
// returns only the sendable ones. HARD contract - no exceptions.
export function selectDigestAudience(rows = []) {
  const active = [];
  const excluded = { PENDING: 0, UNSUBSCRIBED: 0, BOUNCED: 0, COMPLAINED: 0 };
  for (const r of rows) {
    const st = deriveStatus(r);
    const confirmed = r.confirmed === true;
    const notUnsub = r.unsubscribed_at == null;
    if (st === "ACTIVE" && confirmed && notUnsub) active.push(r);
    else if (excluded[st] != null) excluded[st] += 1;
  }
  return { audience: active, count: active.length, excluded };
}

// §25 - deterministic digest fingerprint over the content that matters.
// Two digests with the same deal ids + subject + preset are the "same
// digest" and must not both send.
export function digestFingerprint({ dealIds = [], subject = "", preset = "weekly" } = {}) {
  const norm = [...dealIds].map(String).sort().join(",");
  return "sha256:" + createHash("sha256").update(`${preset}::${subject}::${norm}`).digest("hex").slice(0, 32);
}

// §24 - frequency / rollout-stage cap. `sentHistory` = the persisted
// digest send log (each row has sent_at + fingerprint + status).
export function digestFrequencyCheck({ maxDigestsPerWeek, sentHistory = [], now = Date.now(), candidateFingerprint = null }) {
  if (maxDigestsPerWeek === 0) return { ok: false, reason: "EMAIL_STAGE_0: dry-run only (0 digests/week)" };
  const weekAgo = now - 7 * 24 * 3.6e6;
  const sentThisWeek = sentHistory.filter((h) => h.status === "SENT" && Date.parse(h.sent_at ?? "") >= weekAgo);
  if (candidateFingerprint && sentHistory.some((h) => h.fingerprint === candidateFingerprint && h.status === "SENT")) {
    return { ok: false, reason: "an identical digest (same deal set) has already been sent" };
  }
  if (sentThisWeek.length >= maxDigestsPerWeek) {
    return { ok: false, reason: `weekly digest cap: ${sentThisWeek.length}/${maxDigestsPerWeek} already sent in the last 7 days` };
  }
  return { ok: true, sentThisWeek: sentThisWeek.length, cap: maxDigestsPerWeek, nextEligibleAfter: sentThisWeek.length ? new Date(Math.max(...sentThisWeek.map((h) => Date.parse(h.sent_at))) + 3.5 * 24 * 3.6e6).toISOString() : null };
}

// The full decision: given everything, should a digest be built + sent?
export function decideDigest({
  candidates = [],
  audienceRows = [],
  sentHistory = [],
  maxDigestsPerWeek,
  digestSendEnabled = false, // CRM-1B DIGEST_SEND_ENABLED
  emailEnabled = false, // RESEND_API_KEY + ALERT_FROM_EMAIL
  canMutateProviders = false, // resolved email posture
  now = Date.now(),
  maxAgeHours,
} = {}) {
  const sel = selectDigestDeals(candidates, { now, maxAgeHours });
  const aud = selectDigestAudience(audienceRows);
  const fp = digestFingerprint({ dealIds: sel.deals.map((d) => d.id ?? d.deal_id), subject: "This week's best Pokemon card deals", preset: "weekly" });
  const freq = digestFrequencyCheck({ maxDigestsPerWeek, sentHistory, now, candidateFingerprint: fp });

  const blockers = [];
  if (!sel.meetsMinimum) blockers.push(`only ${sel.count} eligible deals (need >= ${DIGEST_MIN_DEALS}) - SKIP DIGEST`);
  if (aud.count === 0) blockers.push("0 ACTIVE confirmed subscribers");
  if (!freq.ok) blockers.push(freq.reason);
  // send-path gates (informational in dry-run; hard in live)
  const sendGates = [];
  if (!emailEnabled) sendGates.push("emailEnabled() is false (RESEND_API_KEY / ALERT_FROM_EMAIL unset)");
  if (!digestSendEnabled) sendGates.push("DIGEST_SEND_ENABLED is not 'true' (CRM-1B kill switch)");
  if (!canMutateProviders) sendGates.push("email autonomous posture is not LIVE");

  const wouldSend = blockers.length === 0 && sendGates.length === 0;
  return {
    decision: blockers.length ? "SKIP" : sendGates.length ? "READY_BUT_HELD" : "SEND",
    wouldSend,
    fingerprint: fp,
    selected_deal_ids: sel.deals.map((d) => d.id ?? d.deal_id),
    selected_count: sel.count,
    dropped: sel.dropped,
    audience_count: aud.count,
    audience_excluded: aud.excluded,
    frequency: freq,
    blockers,
    send_gates_open: sendGates.length === 0,
    send_gates_blocking: sendGates,
  };
}
