// Phase AUTO-2 - AUTONOMOUS EMAIL PROVIDER WIRING.
//
// Reuses the EXISTING Resend path - no second sender. The mutation
// primitive is lib/email.sendBatch (the same one app/api/send-digest
// uses). Rendering is lib/crm/digestTemplate.renderDigest. Audience is
// emailAuto.selectDigestAudience. Digest history is runState.
//
// This module performs an already-authorised send. It does NOT decide
// whether to send - that is emailAuto.decideDigest + resolveLiveEmailGates.

import { renderDigest, listUnsubscribeHeaders } from "../crm/digestTemplate.js";
import { isTripped } from "./runState.mjs";

const SITE_URL = "https://pokemondealfinder.com";

// EVERY live-email gate, in one place. `posture` = resolveEmailPosture()
// with requestLive:true. Returns { ok, blockers }.
export function resolveLiveEmailGates({ env = process.env, posture, circuit } = {}) {
  const b = [];
  const emailEnabled = Boolean(env.RESEND_API_KEY && env.ALERT_FROM_EMAIL);
  const digestSendEnabled = String(env.DIGEST_SEND_ENABLED ?? "").trim().toLowerCase() === "true";
  if (posture?.kill) b.push("EMAIL_AUTONOMOUS_KILL=true");
  if (!posture?.enabled) b.push("EMAIL_AUTONOMOUS_ENABLED != true");
  if (!posture?.stage?.mutatesProviders) b.push(`EMAIL_AUTONOMOUS_STAGE ${posture?.stageId} does not mutate (need >= EMAIL_STAGE_1)`);
  if (posture?.requestLive !== true) b.push("live not explicitly requested");
  if (isTripped(circuit)) b.push(`circuit ${circuit.state} - owner resume required`);
  if (!emailEnabled) b.push("emailEnabled() is false (RESEND_API_KEY / ALERT_FROM_EMAIL)");
  if (!digestSendEnabled) b.push("DIGEST_SEND_ENABLED != true (CRM-1B kill switch)");
  return { ok: b.length === 0, blockers: b, emailEnabled, digestSendEnabled };
}

// Pre-format digest deal rows for the template (plain, recipient-payable
// labels; never an eBay / affiliate URL - renderDigest enforces that too).
export function toDigestRows(deals = []) {
  return deals.map((d) => ({
    id: d.id ?? d.deal_id,
    name: d.watchlist?.name ?? d.title ?? d.card_name ?? "Pokemon card",
    set: d.watchlist?.set ?? d.card_set ?? "",
    priceLabel: `$${Number(d.total_price ?? 0).toFixed(2)}`,
    marketRefLabel: d.market_price != null ? `$${Number(d.market_price).toFixed(2)}` : null,
    pct: d.discount_pct != null ? Math.round(Number(d.discount_pct) * 100) : null,
    imageUrl: d.image_url || null,
  }));
}

// Send the digest. `subscribers` = the ACTIVE audience rows (each carries
// `email` + `token`). The caller MUST have checked
// resolveLiveEmailGates().ok === true and preSendRevalidateDigest().ok.
//
// Uses lib/email.sendBatch - imported HERE, never in the dry-run path.
export async function sendAutonomousDigest({ items = [], subscribers = [], siteUrl = SITE_URL, preset = "weekly", now = Date.now() } = {}) {
  if (!Array.isArray(subscribers) || subscribers.length === 0) {
    return { ok: false, reason: "no audience", sent: 0, failed: 0 };
  }
  const { sendBatch, emailEnabled } = await import("../email.js");
  if (!emailEnabled()) return { ok: false, reason: "emailEnabled() false at send time", sent: 0, failed: 0 };

  const rows = toDigestRows(items);
  const messages = subscribers.map((s) => {
    const unsub = `${siteUrl}/api/newsletter?token=${s.token}&action=unsubscribe`;
    const { subject, html, text } = renderDigest(rows, { unsubscribeUrl: unsub, siteUrl, preset });
    return { to: s.email, subject, html, text, headers: listUnsubscribeHeaders(unsub) };
  });

  let result;
  try {
    result = await sendBatch(messages);
  } catch (e) {
    return { ok: false, reason: "sendBatch_exception", detail: String(e.message).slice(0, 200), sent: 0, failed: messages.length };
  }
  const sent = Number(result?.sent ?? 0);
  const failed = Number(result?.failed ?? 0);
  return {
    ok: sent > 0 && failed === 0,
    verdict: sent > 0 && failed === 0 ? "SENT" : sent > 0 ? "PARTIAL" : failed > 0 ? "FAILED" : "UNCERTAIN",
    sent,
    failed,
    sent_at: new Date(now).toISOString(),
    subject: messages[0]?.subject ?? null,
  };
}
