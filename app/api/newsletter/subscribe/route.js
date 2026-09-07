import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailEnabled, sendEmail } from "@/lib/email";
import { sanitizeUtmValue } from "@/lib/analytics/props";
import {
  isValidEmail,
  normalizeEmail,
  buildSignupRecord,
  deriveStatus,
  SUBSCRIBER_STATUS,
  CONSENT_COPY,
  GENERIC_SUCCESS,
  INVALID_EMAIL,
  DISABLED,
  RATE_LIMITED,
} from "@/lib/crm/subscribers";
import { honeypotTripped, rateLimit, keyFromRequest } from "@/lib/crm/signupGuard";

export const dynamic = "force-dynamic";

const SITE_URL = "https://pokemondealfinder.com";

// POST /api/newsletter/subscribe  { email, company_website (honeypot),
//   placement, route, utm_source, utm_medium, utm_campaign, utm_content }
//
// Double opt-in: creates/refreshes a PENDING newsletter_subscribers row
// and emails a confirmation link (the existing GET /api/newsletter
// ?token=..&action=confirm flips it to ACTIVE). Dormant until
// RESEND_API_KEY + ALERT_FROM_EMAIL are set (emailEnabled()).
//
// Non-enumerating: every non-input-error outcome returns the SAME
// { ok:true, status:"received" } body - a caller cannot tell a brand-new
// address from one already on the list.
export async function POST(request) {
  if (!emailEnabled()) return Response.json(DISABLED, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  // Honeypot: a bot filled the hidden field. Look successful, write nothing.
  if (honeypotTripped(body)) return Response.json(GENERIC_SUCCESS);

  const rl = rateLimit(keyFromRequest(request));
  if (!rl.allowed) {
    return Response.json(RATE_LIMITED, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  if (!isValidEmail(body.email)) return Response.json(INVALID_EMAIL, { status: 400 });

  const record = buildSignupRecord({
    email: body.email,
    placement: body.placement,
    route: body.route,
    utm: {
      utm_source: sanitizeUtmValue(body.utm_source),
      utm_medium: sanitizeUtmValue(body.utm_medium),
      utm_campaign: sanitizeUtmValue(body.utm_campaign),
      utm_content: sanitizeUtmValue(body.utm_content),
    },
  });
  const email = normalizeEmail(body.email);

  const db = supabaseAdmin();

  const { data: existing, error: lookupErr } = await db
    .from("newsletter_subscribers")
    .select("id, token, status, confirmed, unsubscribed_at")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) {
    // a genuine DB failure - do not pretend it worked
    console.error("[subscribe] lookup failed:", lookupErr.message);
    return Response.json({ ok: false, reason: "server_error" }, { status: 500 });
  }

  const token = cryptoToken();
  let needsConfirmation = false;

  if (!existing) {
    const { error } = await db.from("newsletter_subscribers").insert({ ...record, token });
    if (error) {
      console.error("[subscribe] insert failed:", error.message);
      return Response.json({ ok: false, reason: "server_error" }, { status: 500 });
    }
    needsConfirmation = true;
  } else {
    const status = deriveStatus(existing);
    if (status === SUBSCRIBER_STATUS.ACTIVE) {
      // row is already ACTIVE - respond generically, write nothing, send nothing
      return Response.json(GENERIC_SUCCESS);
    }
    // PENDING or previously UNSUBSCRIBED -> a deliberate (re)opt-in via the
    // form. Refresh the pending state + token and (re)send confirmation.
    const { error } = await db
      .from("newsletter_subscribers")
      .update({
        token,
        status: SUBSCRIBER_STATUS.PENDING,
        confirmed: false,
        confirmed_at: null,
        unsubscribed_at: null,
        signup_route: record.signup_route,
        consent_version: record.consent_version,
        utm_source: record.utm_source,
        utm_medium: record.utm_medium,
        utm_campaign: record.utm_campaign,
        utm_content: record.utm_content,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[subscribe] update failed:", error.message);
      return Response.json({ ok: false, reason: "server_error" }, { status: 500 });
    }
    needsConfirmation = true;
  }

  if (needsConfirmation) {
    const confirmUrl = `${SITE_URL}/api/newsletter?token=${token}&action=confirm`;
    const send = await sendEmail({
      to: email,
      subject: "Confirm your Pokemon deal alerts",
      text: `Confirm you'd like occasional Pokemon card deal alerts from PokemonDealFinder:\n${confirmUrl}\n\n${CONSENT_COPY}\nIf you didn't request this, ignore this email.`,
      html: `<p>Confirm you'd like occasional Pokemon card deal alerts from <strong>PokemonDealFinder</strong>:</p>
<p><a href="${confirmUrl}">Confirm deal alerts</a></p>
<p style="color:#888;font-size:12px">${escapeHtml(CONSENT_COPY)}<br>If you didn't request this, just ignore this email.</p>`,
    });
    // A send failure must not leak list membership or 500 the visitor -
    // the PENDING row is written; they can retry. Log it for ops.
    if (!send.sent) console.error("[subscribe] confirmation send failed:", send.reason ?? "unknown");
  }

  return Response.json(GENERIC_SUCCESS);
}

function cryptoToken() {
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? require("node:crypto").webcrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
