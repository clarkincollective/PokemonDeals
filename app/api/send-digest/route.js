import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchBestFinds } from "@/lib/deals";
import { emailEnabled, sendBatch } from "@/lib/email";
import { currencyForDeal, formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE_URL = "https://pokemondealfinder.com";
const MIN_DAYS_BETWEEN_SENDS = 6;
const DEAL_COUNT = 8;

// Weekly cron: emails confirmed newsletter subscribers the week's best
// below-market deals. Dormant without RESEND_API_KEY. Guarded so a
// double-fire within 6 days is a no-op.
export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailEnabled()) return Response.json({ ok: true, skipped: "disabled" });

  const db = supabaseAdmin();

  // Idempotency: don't re-send if the last send was recent.
  const { data: state } = await db
    .from("catalog_snapshot")
    .select("data")
    .eq("kind", "digest_state")
    .maybeSingle();
  const lastSentAt = state?.data?.lastSentAt ? new Date(state.data.lastSentAt).getTime() : 0;
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && Date.now() - lastSentAt < MIN_DAYS_BETWEEN_SENDS * 24 * 60 * 60 * 1000) {
    return Response.json({ ok: true, skipped: "sent_recently", lastSentAt: state?.data?.lastSentAt });
  }

  const [{ deals }, { data: subs, error: subErr }] = await Promise.all([
    fetchBestFinds({ limit: DEAL_COUNT }),
    db
      .from("newsletter_subscribers")
      .select("email, token")
      .eq("confirmed", true)
      .is("unsubscribed_at", null),
  ]);
  if (subErr) return Response.json({ ok: false, error: subErr.message }, { status: 200 });
  if (!subs?.length) return Response.json({ ok: true, sent: 0, note: "no subscribers" });
  if (!deals?.length) return Response.json({ ok: true, sent: 0, note: "no deals to send" });

  const rows = deals
    .map((d) => {
      const name = d.watchlist?.name ?? d.title;
      const set = d.watchlist?.set ?? "";
      const price = formatMoney(d.total_price, currencyForDeal(d));
      const pct = Math.round(d.discount_pct * 100);
      const img = d.image_url
        ? `<img src="${d.image_url}" width="56" height="56" alt="" style="border-radius:6px;object-fit:contain;background:#f4f3f0">`
        : "";
      return `<tr>
  <td style="padding:8px 12px 8px 0;vertical-align:top;width:56px">${img}</td>
  <td style="padding:8px 0;vertical-align:top">
    <a href="${SITE_URL}/deals/${d.id}" style="color:#171514;font-weight:600;font-size:14px;text-decoration:none">${esc(name)}</a><br>
    <span style="color:#6b6560;font-size:12px">${esc(set)}</span><br>
    <span style="font-weight:700;font-size:14px">${price}</span>
    <span style="color:#0e7c46;font-size:12px;font-weight:600"> &nbsp;${pct}% below market</span>
  </td>
</tr>`;
    })
    .join("");

  const messages = subs.map((s) => {
    const unsub = `${SITE_URL}/api/newsletter?token=${s.token}&action=unsubscribe`;
    return {
      to: s.email,
      subject: "This week's best Pokémon card deals",
      text: `The biggest below-market Pokémon card finds on eBay this week:\n\n${deals
        .map((d) => `${d.watchlist?.name ?? d.title} — ${formatMoney(d.total_price, currencyForDeal(d))} (${Math.round(d.discount_pct * 100)}% below market)\n${SITE_URL}/deals/${d.id}`)
        .join("\n\n")}\n\nMore: ${SITE_URL}/best-finds\nUnsubscribe: ${unsub}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#171514">
  <h1 style="font-size:19px;margin:0 0 4px">This week's best Pokémon deals</h1>
  <p style="color:#6b6560;font-size:13px;margin:0 0 16px">The biggest below-market finds on eBay right now, checked against real sold prices.</p>
  <table style="width:100%;border-collapse:collapse">${rows}</table>
  <p style="margin:20px 0"><a href="${SITE_URL}/best-finds" style="display:inline-block;background:#1a1613;color:#fff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px">See more deals &rarr;</a></p>
  <hr style="border:none;border-top:1px solid #e7e4dd;margin:20px 0">
  <p style="color:#9a938c;font-size:11px;line-height:1.5">
    You're getting this because you opted in on pokemondealfinder.com. As an eBay affiliate we may earn a commission on purchases, at no cost to you.<br>
    <a href="${unsub}" style="color:#9a938c">Unsubscribe</a>
  </p>
</div>`,
    };
  });

  const result = await sendBatch(messages);

  await db.from("catalog_snapshot").upsert(
    {
      kind: "digest_state",
      data: { lastSentAt: new Date().toISOString(), recipients: result.sent, failed: result.failed, deals: deals.length },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kind" }
  );

  return Response.json({ ok: true, subscribers: subs.length, ...result, deals: deals.length });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
