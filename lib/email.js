// Thin Resend wrapper. The whole price-alert feature is dormant until
// RESEND_API_KEY (and ALERT_FROM_EMAIL) are set: sendEmail() no-ops and
// returns { sent: false, reason: "disabled" }, and callers check
// emailEnabled() before doing anything that would collect an address.
//
// No SDK dependency - Resend's REST API is one fetch call.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!emailEnabled()) return { sent: false, reason: "disabled" };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ALERT_FROM_EMAIL,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `resend_${res.status}`, detail: body.slice(0, 300) };
    }
    // Resend returns { id: "..." } on success - surface it so callers that
    // need an audit trail (e.g. the outreach sender) can store the
    // provider message id. Existing callers only read `.sent`.
    const json = await res.json().catch(() => ({}));
    return { sent: true, id: json?.id ?? null };
  } catch (err) {
    return { sent: false, reason: "fetch_error", detail: err.message };
  }
}

// Resend's batch endpoint - up to 100 messages per call. `messages` is an
// array of { to, subject, html, text }. Returns { sent, failed }.
async function sendBatch(messages) {
  if (!emailEnabled()) return { sent: 0, failed: messages.length, reason: "disabled" };
  const from = process.env.ALERT_FROM_EMAIL;
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({
      from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
    }));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
      else failed += chunk.length;
    } catch {
      failed += chunk.length;
    }
  }
  return { sent, failed };
}

module.exports = { emailEnabled, sendEmail, sendBatch };
