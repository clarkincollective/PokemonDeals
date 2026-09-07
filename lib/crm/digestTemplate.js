// Phase CRM-1 - the deal-digest email template (PREP ONLY - nothing in
// this phase sends it).
//
// Pure string assembly: `renderDigest(rows, opts)` -> { subject, html,
// text }. No I/O, no money/locale logic (the caller pre-formats each row
// into a plain price label), no deal fetching, no Supabase.
//
// Contract (enforced by tests/scanner/email-return-loop-crm1.test.mjs):
//   * every deal link is WEBSITE-FIRST - https://pokemondealfinder.com/
//     deals/<id>. No eBay / affiliate URL is ever emitted from the digest.
//   * footer always carries: why-received line, one-click unsubscribe
//     link, the bare domain.
//   * subject + intro state a truthful, non-hyped cadence.
//
// `rows`: [{ id, name, set, priceLabel, marketRefLabel?, pct, imageUrl? }]
// `opts`: { unsubscribeUrl (required), siteUrl?, preset? }

const SITE_URL = "https://pokemondealfinder.com";

// Cadence presets - all truthful, none promising real-time / "every deal".
const PRESETS = Object.freeze({
  // the first-iteration framing from the brief: occasional standout finds
  standout: {
    subjectFor: (n) => `${n} standout Pokemon card ${n === 1 ? "deal" : "deals"} worth a look`,
    intro: "A few standout below-market finds from PokemonDealFinder - sent occasionally, only when they're worth sharing.",
    whyReceived: "You're getting this because you signed up for occasional deal alerts on pokemondealfinder.com.",
  },
  // the existing weekly digest framing (kept so send-digest is unchanged)
  weekly: {
    subjectFor: () => "This week's best Pokemon card deals",
    intro: "The biggest below-market finds on eBay right now, checked against real sold prices.",
    whyReceived: "You're getting this because you opted in on pokemondealfinder.com.",
  },
});

const AFFILIATE_DISCLOSURE =
  "As an eBay affiliate we may earn a commission on purchases, at no cost to you.";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dealUrl(siteUrl, id) {
  return `${siteUrl}/deals/${encodeURIComponent(String(id))}`;
}

function renderDigest(rows = [], opts = {}) {
  const siteUrl = (opts.siteUrl || SITE_URL).replace(/\/$/, "");
  const preset = PRESETS[opts.preset] || PRESETS.standout;
  const unsub = opts.unsubscribeUrl;
  if (!unsub || typeof unsub !== "string") throw new Error("renderDigest: opts.unsubscribeUrl is required");
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.id != null) : [];

  const subject = preset.subjectFor(list.length);

  const textBody = list
    .map((r, i) => {
      const bits = [
        `${i + 1}. ${r.name}${r.set ? ` — ${r.set}` : ""}`,
        `   Listed: ${r.priceLabel}${r.marketRefLabel ? `  ·  Recent market: ${r.marketRefLabel}` : ""}${r.pct != null ? `  ·  ${r.pct}% below market` : ""}`,
        `   View deal: ${dealUrl(siteUrl, r.id)}`,
      ];
      return bits.join("\n");
    })
    .join("\n\n");

  const text = [
    preset.intro,
    "",
    textBody,
    "",
    `Browse all live deals: ${siteUrl}/deals`,
    "",
    "—",
    preset.whyReceived,
    AFFILIATE_DISCLOSURE,
    `Unsubscribe: ${unsub}`,
    siteUrl.replace(/^https?:\/\//, ""),
  ].join("\n");

  const htmlRows = list
    .map((r) => {
      const img = r.imageUrl
        ? `<img src="${esc(r.imageUrl)}" width="56" height="56" alt="" style="border-radius:6px;object-fit:contain;background:#f4f3f0">`
        : "";
      return `<tr>
  <td style="padding:8px 12px 8px 0;vertical-align:top;width:56px">${img}</td>
  <td style="padding:8px 0;vertical-align:top">
    <a href="${dealUrl(siteUrl, r.id)}" style="color:#171514;font-weight:600;font-size:14px;text-decoration:none">${esc(r.name)}</a><br>
    <span style="color:#6b6560;font-size:12px">${esc(r.set || "")}</span><br>
    <span style="font-weight:700;font-size:14px">${esc(r.priceLabel)}</span>${
        r.marketRefLabel ? `<span style="color:#9a938c;font-size:12px"> &nbsp;recent market ${esc(r.marketRefLabel)}</span>` : ""
      }${r.pct != null ? `<span style="color:#0e7c46;font-size:12px;font-weight:600"> &nbsp;${esc(String(r.pct))}% below market</span>` : ""}
  </td>
</tr>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#171514">
  <h1 style="font-size:19px;margin:0 0 4px">${esc(subject)}</h1>
  <p style="color:#6b6560;font-size:13px;margin:0 0 16px">${esc(preset.intro)}</p>
  <table style="width:100%;border-collapse:collapse">${htmlRows}</table>
  <p style="margin:20px 0"><a href="${siteUrl}/deals" style="display:inline-block;background:#1a1613;color:#fff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px">Browse all live deals &rarr;</a></p>
  <hr style="border:none;border-top:1px solid #e7e4dd;margin:20px 0">
  <p style="color:#9a938c;font-size:11px;line-height:1.5">
    ${esc(preset.whyReceived)} ${esc(AFFILIATE_DISCLOSURE)}<br>
    <a href="${esc(unsub)}" style="color:#9a938c">Unsubscribe</a> &nbsp;·&nbsp; ${esc(siteUrl.replace(/^https?:\/\//, ""))}
  </p>
</div>`;

  return { subject, html, text };
}

// RFC 8058 one-click unsubscribe headers for the send layer to attach.
function listUnsubscribeHeaders(unsubscribeUrl) {
  if (!unsubscribeUrl) return {};
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

module.exports = { renderDigest, listUnsubscribeHeaders, PRESETS, SITE_URL };
