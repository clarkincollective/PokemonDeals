import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCardSlug, fetchCardOffers } from "@/lib/deals";
import { emailEnabled, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = "https://pokemondealfinder.com";
const RENOTIFY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // don't email the same alert more than ~once a day
const DISCOUNT_FLOOR = 0.1;

// Cron: for every confirmed price alert whose card now has a matching
// listing (at/below the target price, or - with no target - any listing
// below market), email the subscriber once. Dormant without RESEND_API_KEY.
export async function GET() {
  if (!emailEnabled()) {
    return Response.json({ ok: true, skipped: "disabled" });
  }
  const started = Date.now();
  const db = supabaseAdmin();

  const { data: alerts, error } = await db
    .from("price_alerts")
    .select("id, email, card_slug, card_name, target_price, token, last_notified_at, last_notified_deal_id")
    .eq("confirmed", true);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 200 });
  if (!alerts?.length) return Response.json({ ok: true, checked: 0, sent: 0 });

  // Group alerts by card so each card's offers are fetched once.
  const bySlug = new Map();
  for (const a of alerts) {
    if (!bySlug.has(a.card_slug)) bySlug.set(a.card_slug, []);
    bySlug.get(a.card_slug).push(a);
  }

  let sent = 0;
  const now = Date.now();

  for (const [slug, group] of bySlug) {
    const hub = await resolveCardSlug(slug);
    if (!hub) continue;
    const { deals: offers } = await fetchCardOffers(hub.id);
    const cheapest = offers?.[0];
    if (!cheapest) continue;
    const price = Number(cheapest.total_price);
    const belowMarket = Number(cheapest.discount_pct) >= DISCOUNT_FLOOR;

    for (const a of group) {
      const matches = a.target_price != null ? price <= Number(a.target_price) : belowMarket;
      if (!matches) continue;
      if (a.last_notified_deal_id === cheapest.id) continue;
      if (a.last_notified_at && now - new Date(a.last_notified_at).getTime() < RENOTIFY_COOLDOWN_MS) continue;

      const unsub = `${SITE_URL}/api/alerts?token=${a.token}&action=unsubscribe`;
      const cardUrl = `${SITE_URL}/cards/${slug}`;
      const res = await sendEmail({
        to: a.email,
        subject: `${a.card_name} is now $${price.toFixed(2)}`,
        text: `${a.card_name} has a listing at $${price.toFixed(2)} (${Math.round(cheapest.discount_pct * 100)}% below market).\n\nSee it: ${cardUrl}\n\nStop these emails: ${unsub}`,
        html: `<p><strong>${escapeHtml(a.card_name)}</strong> has a listing at <strong>$${price.toFixed(2)}</strong> (${Math.round(cheapest.discount_pct * 100)}% below market).</p>
<p><a href="${cardUrl}">See it on Pokemon Deal Finder</a></p>
<p style="color:#888;font-size:12px"><a href="${unsub}" style="color:#888">Stop these emails</a></p>`,
      });
      if (res.sent) {
        sent++;
        await db
          .from("price_alerts")
          .update({ last_notified_at: new Date().toISOString(), last_notified_deal_id: cheapest.id })
          .eq("id", a.id);
      }
    }
  }

  return Response.json({ ok: true, checked: alerts.length, cards: bySlug.size, sent, ms: Date.now() - started });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
