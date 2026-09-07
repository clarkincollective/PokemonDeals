import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchDigestDeals } from "@/lib/deals";
import { emailEnabled, sendBatch } from "@/lib/email";
import { currencyForDeal, formatMoney } from "@/lib/money";
import { digestSubscriberQueryStatus } from "@/lib/newsletterFlow";
import { renderDigest } from "@/lib/crm/digestTemplate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE_URL = "https://pokemondealfinder.com";
const MIN_DAYS_BETWEEN_SENDS = 6;
const DEAL_COUNT = 8;

// Weekly cron: emails confirmed newsletter subscribers the week's best
// below-market deals. Dormant without RESEND_API_KEY. Guarded so a
// double-fire within 6 days is a no-op.
//
// 13C.2.1 - the digest is DELIBERATELY Buy It Now only (fetchDigestDeals,
// which pins that contract independently of the homepage flagship). Each
// row below renders `total_price` as a plain price the recipient can pay,
// so an auction's current bid must never appear here.
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

  const [{ deals }, subsResult] = await Promise.all([
    fetchDigestDeals({ limit: DEAL_COUNT }),
    db
      .from("newsletter_subscribers")
      .select("email, token, status")
      .eq("confirmed", true)
      .is("unsubscribed_at", null),
  ]);
  const { data: subsRaw, error: subErr } = subsResult;
  // CRM-1: a provider webhook can mark a still-"confirmed" row BOUNCED /
  // COMPLAINED without setting unsubscribed_at - never mail those. Legacy
  // rows have status null and are fine to send (filtering with a SQL
  // `neq`/`not in` here would wrongly drop null-status rows too).
  const subs = Array.isArray(subsRaw)
    ? subsRaw.filter((s) => s.status !== "BOUNCED" && s.status !== "COMPLAINED")
    : subsRaw;
  // A genuine query/database failure must never look like a normal
  // "nothing to send" run to anything watching cron status by HTTP code
  // (see the P1 audit - a 200 here is exactly what let the
  // newsletter_subscribers schema drift stay invisible for days).
  if (subErr) return Response.json({ ok: false, error: subErr.message }, { status: digestSubscriberQueryStatus(subsResult) });
  if (!subs?.length) return Response.json({ ok: true, sent: 0, note: "no subscribers" });
  if (!deals?.length) return Response.json({ ok: true, sent: 0, note: "no deals to send" });

  // Pre-format each deal into plain, recipient-payable labels; the
  // template (lib/crm/digestTemplate) does website-first string assembly
  // only and never sees an eBay / affiliate URL.
  const digestRows = deals.map((d) => ({
    id: d.id,
    name: d.watchlist?.name ?? d.title,
    set: d.watchlist?.set ?? "",
    priceLabel: formatMoney(d.total_price, currencyForDeal(d)),
    pct: Math.round(d.discount_pct * 100),
    imageUrl: d.image_url || null,
  }));

  const messages = subs.map((s) => {
    const unsub = `${SITE_URL}/api/newsletter?token=${s.token}&action=unsubscribe`;
    const { subject, html, text } = renderDigest(digestRows, { unsubscribeUrl: unsub, siteUrl: SITE_URL, preset: "weekly" });
    return { to: s.email, subject, html, text };
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
