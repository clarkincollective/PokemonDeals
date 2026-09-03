import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCardSlug, fetchCardOffers } from "@/lib/deals";
import { emailEnabled, sendEmail } from "@/lib/email";
import { currencyForDeal, symbolFor } from "@/lib/money";
import { evaluateAlert, listingTotalUsd } from "@/lib/alertMatch";

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

  // `select("*")` so this keeps working whether or not the
  // target_price_usd column (price_alerts_usd_migration.sql) has been
  // applied yet: absent -> `a.target_price_usd` is undefined -> the
  // legacy-target rows below are treated as dormant, exactly as intended.
  const { data: alerts, error } = await db
    .from("price_alerts")
    .select("*")
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
    // offers is sorted cheapest-first by USD total, so offers[0] is the
    // USD-cheapest acquisition (item + shipping).
    const cheapest = offers?.[0];
    if (!cheapest) continue;
    const listingUsd = listingTotalUsd(cheapest);
    const nativePrice = Number(cheapest.total_price);
    const nativeMoney = `${symbolFor(currencyForDeal(cheapest))}${nativePrice.toFixed(2)}`;
    const discPct = Math.round(Number(cheapest.discount_pct) * 100);

    for (const a of group) {
      // Same-unit contract (lib/alertMatch): USD listing total vs USD
      // threshold, or discount % when there's no target. A bare legacy
      // `target_price` stays dormant (no email) until re-set.
      const { matched } = evaluateAlert(a, cheapest, { discountFloor: DISCOUNT_FLOOR });
      if (!matched) continue;
      if (a.last_notified_deal_id === cheapest.id) continue;
      if (a.last_notified_at && now - new Date(a.last_notified_at).getTime() < RENOTIFY_COOLDOWN_MS) continue;

      const targetUsd = a.target_price_usd != null ? Number(a.target_price_usd) : null;

      const unsub = `${SITE_URL}/api/alerts?token=${a.token}&action=unsubscribe`;
      const cardUrl = `${SITE_URL}/cards/${slug}`;
      // Targeted alert -> the comparison is USD, so show it in USD on both
      // sides. Untargeted -> show the listing in its own currency + the
      // rate-invariant %, matching the weekly digest.
      const usdLine = `$${listingUsd.toFixed(2)} USD`;
      const subject = targetUsd != null ? `${a.card_name} is now ${usdLine}` : `${a.card_name} is now ${nativeMoney}`;
      const bodyLine =
        targetUsd != null
          ? `Current price: ${usdLine} · Your target: $${targetUsd.toFixed(2)} USD (${discPct}% below market).`
          : `${a.card_name} has a listing at ${nativeMoney} (${discPct}% below market).`;
      const res = await sendEmail({
        to: a.email,
        subject,
        text: `${bodyLine}\n\nSee it: ${cardUrl}\n\nStop these emails: ${unsub}`,
        html: `<p><strong>${escapeHtml(a.card_name)}</strong> — ${escapeHtml(bodyLine)}</p>
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
