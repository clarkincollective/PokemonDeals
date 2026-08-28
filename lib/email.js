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

async function sendEmail({ to, subject, html, text }) {
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
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `resend_${res.status}`, detail: body.slice(0, 300) };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: "fetch_error", detail: err.message };
  }
}

module.exports = { emailEnabled, sendEmail };
