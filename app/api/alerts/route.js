import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailEnabled, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const SITE_URL = "https://pokemondealfinder.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/alerts  { email, cardSlug, cardName, targetPrice? }
//   -> creates an unconfirmed alert and emails a confirmation link.
export async function POST(request) {
  if (!emailEnabled()) {
    return Response.json({ ok: false, reason: "disabled" }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const cardSlug = String(body.cardSlug ?? "").trim();
  const cardName = String(body.cardName ?? "").trim();
  const wantsNewsletter = body.newsletter === true;
  const targetRaw = body.targetPrice;
  const targetPrice =
    targetRaw != null && targetRaw !== "" && Number.isFinite(Number(targetRaw)) && Number(targetRaw) > 0
      ? Number(targetRaw)
      : null;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }
  if (!cardSlug || !cardName || cardSlug.length > 200) {
    return Response.json({ ok: false, reason: "invalid_card" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // One pending/active alert per email+card - re-submitting just refreshes it.
  const { data: existing } = await db
    .from("price_alerts")
    .select("id, token, confirmed")
    .eq("card_slug", cardSlug)
    .eq("email", email)
    .maybeSingle();

  const token = existing?.token ?? cryptoToken();

  if (existing) {
    await db
      .from("price_alerts")
      .update({ card_name: cardName, target_price: targetPrice })
      .eq("id", existing.id);
  } else {
    const { error } = await db.from("price_alerts").insert({
      email,
      card_slug: cardSlug,
      card_name: cardName,
      target_price: targetPrice,
      token,
    });
    if (error) return Response.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  // Separate marketing consent - a distinct table, distinct opt-in.
  // Created unconfirmed here; the same confirm click below activates it.
  if (wantsNewsletter) {
    const { data: sub } = await db
      .from("newsletter_subscribers")
      .select("id, confirmed")
      .eq("email", email)
      .maybeSingle();
    if (!sub) {
      await db
        .from("newsletter_subscribers")
        .insert({ email, token: cryptoToken(), source: "price_alert_form" });
    } else if (sub.confirmed) {
      // if they re-tick it after unsubscribing, resubscribe
      await db.from("newsletter_subscribers").update({ unsubscribed_at: null }).eq("id", sub.id);
    }
  }

  if (existing?.confirmed) {
    return Response.json({ ok: true, status: "already_confirmed" });
  }

  const confirmUrl = `${SITE_URL}/api/alerts?token=${token}&action=confirm`;
  const targetLine = targetPrice
    ? `at or below $${targetPrice.toFixed(2)}`
    : `below its market price`;
  const send = await sendEmail({
    to: email,
    subject: `Confirm your ${cardName} price alert`,
    text: `Confirm you want an email when ${cardName} is listed ${targetLine}:\n${confirmUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Confirm you want an email when <strong>${escapeHtml(cardName)}</strong> is listed ${targetLine}:</p>
<p><a href="${confirmUrl}">Confirm price alert</a></p>
<p style="color:#888;font-size:12px">If you didn't request this, just ignore this email.</p>`,
  });

  if (!send.sent) {
    return Response.json({ ok: false, reason: send.reason ?? "send_failed" }, { status: 502 });
  }
  return Response.json({ ok: true, status: "confirmation_sent" });
}

// GET /api/alerts?token=...&action=confirm|unsubscribe
export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");
  if (!token) return htmlResponse("Missing token.", 400);

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("price_alerts")
    .select("id, email, card_slug, card_name")
    .eq("token", token)
    .maybeSingle();
  if (!row) return htmlResponse("This alert link is no longer valid.", 404);

  if (action === "unsubscribe") {
    await db.from("price_alerts").delete().eq("id", row.id);
    return htmlResponse(`Removed. You won't get further emails about ${escapeHtml(row.card_name)}.`);
  }

  const now = new Date().toISOString();
  await db.from("price_alerts").update({ confirmed: true, confirmed_at: now }).eq("id", row.id);
  // This click is also the double-opt-in for a pending newsletter row
  // for the same address (see the POST handler).
  await db
    .from("newsletter_subscribers")
    .update({ confirmed: true, confirmed_at: now })
    .eq("email", row.email)
    .eq("confirmed", false);
  return htmlResponse(
    `You're set. We'll email you when ${escapeHtml(row.card_name)} next has a matching listing.`,
    200,
    `${SITE_URL}/cards/${row.card_slug}`
  );
}

function cryptoToken() {
  // 32 hex chars, no dependency.
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? require("node:crypto").webcrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function htmlResponse(message, status = 200, backHref = SITE_URL) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pokemon Deal Finder</title>
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.25rem;text-align:center">
  <p style="font-size:1.05rem;line-height:1.5">${escapeHtml(message)}</p>
  <p><a href="${backHref}" style="color:#d62828;font-weight:600">← Back to Pokemon Deal Finder</a></p>
</div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
