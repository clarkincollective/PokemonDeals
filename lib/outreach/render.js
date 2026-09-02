// SEO Phase 10D - turn an approved outreach record into the exact
// { to, from, replyTo, subject, text, html } payload handed to
// lib/email.js. Pure - no network, no credentials.

import { resolveBody, normalizeSpelling } from "./core.js";

// Restrained professional footer - NOT a marketing signature. Includes a
// plain opt-out sentence so a recipient can stop contact in one reply.
function footer({ senderName, siteUrl }) {
  return [
    "--",
    senderName,
    "Pokemon Deal Finder",
    siteUrl,
    "",
    'One-off message about your article. Reply "no thanks" and I won\'t contact you again.',
  ].join("\n");
}

const UTM = "utm_source=outreach&utm_medium=email&utm_campaign=authority";

export function withUtm(url) {
  if (!url) return url;
  if (/[?&]utm_/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + UTM;
}

// testRecipient: when set, the message is delivered ONLY there; the real
// prospect address is preserved in the record and echoed in the body.
export function renderMessage(
  record,
  {
    senderName = "James",
    fromEmail,
    replyTo,
    siteUrl = "https://pokemondealfinder.com/",
    testRecipient = null,
    utm = false,
  } = {}
) {
  const preserve = Array.isArray(record?.doNotNormalize) ? record.doNotNormalize : [];
  let bodyText = normalizeSpelling(resolveBody(record), { preserve });
  if (utm && record?.destinationUrl) {
    bodyText = bodyText.split(record.destinationUrl).join(withUtm(record.destinationUrl));
  }

  const isTest = Boolean(testRecipient);
  const to = isTest ? testRecipient : record.recipient;
  const subject = (isTest ? "[TEST] " : "") + normalizeSpelling(String(record.subject ?? ""), { preserve });

  const testBanner = isTest
    ? `[TEST MODE] This message was redirected. Intended recipient: ${record.recipient} (${record.contactType}). Target page: ${record.targetPage}\n\n`
    : "";

  const text = `${testBanner}${bodyText}\n\n${footer({ senderName, siteUrl })}\n`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#111">${text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;

  return {
    to,
    from: fromEmail,
    replyTo: replyTo || fromEmail,
    subject,
    text,
    html,
    meta: {
      recordId: record.id,
      intendedRecipient: record.recipient,
      redirectedToTest: isTest,
      contactType: record.contactType,
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
