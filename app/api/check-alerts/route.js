import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCardSlug, fetchCardOffers, resolveSetSlug, fetchSetDealsPage } from "@/lib/deals";
import { emailEnabled, sendEmail } from "@/lib/email";
import { currencyForDeal, symbolFor } from "@/lib/money";
import { getUsdRates } from "@/lib/fx";
import { evaluateAlert, evaluateAlertAgainstOffers, listingTotalUsd, shouldNotify, describeCriteria, alertThreshold } from "@/lib/alertMatch";
import { offerShipping } from "@/lib/offerPresentation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = "https://pokemondealfinder.com";
const RENOTIFY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // don't email the same alert more than ~once a day
const DISCOUNT_FLOOR = 0.1;

// Cron: for every confirmed price alert whose subject now has a matching
// listing, email the subscriber once. Dormant without RESEND_API_KEY.
//
// 2026-09-19 §6: an alert may carry criteria (marketplace / condition /
// grade, a threshold in its own currency, item-vs-all-in scope, a set
// subject, a digest preference). Matching is lib/alertMatch's pure
// evaluator over the SAME displayable, cheapest-first offers the card page
// shows - so an alert can never fire on a listing the site would not show.
export async function GET() {
  if (!emailEnabled()) {
    return Response.json({ ok: true, skipped: "disabled" });
  }
  const started = Date.now();
  const db = supabaseAdmin();

  // `select("*")` so this keeps working whether or not the
  // target_price_usd column (price_alerts_usd_migration.sql) or the
  // criteria columns (price_alerts_criteria_migration.sql) have been
  // applied yet: absent -> undefined -> the legacy/default behaviour.
  const { data: alerts, error } = await db
    .from("price_alerts")
    .select("*")
    .eq("confirmed", true);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 200 });
  if (!alerts?.length) return Response.json({ ok: true, checked: 0, sent: 0 });

  const rates = await getUsdRates();

  // Group alerts by subject so each subject's offers are fetched once.
  const bySlug = new Map();
  for (const a of alerts) {
    if (!bySlug.has(a.card_slug)) bySlug.set(a.card_slug, []);
    bySlug.get(a.card_slug).push(a);
  }

  let sent = 0;
  const now = Date.now();
  // digest subscribers: email -> [{ alert, offer, evaluation, subjectUrl }]
  const digests = new Map();

  for (const [slug, group] of bySlug) {
    const isSet = slug.startsWith("set:");
    let offers = [];
    let subjectUrl;
    if (isSet) {
      const setSlug = slug.slice(4);
      const resolved = await resolveSetSlug(setSlug);
      if (!resolved) continue;
      // Set alerts are discount alerts on Buy It Now offers with a
      // supported saving - the same ranking the set page's "Biggest
      // discount" sort uses (savingsClaimTrusted enforced inside).
      const r = await fetchSetDealsPage({ setName: resolved.set, sort: "discount", listingType: "FIXED_PRICE", page: 1, pageSize: 40 });
      offers = r?.deals ?? [];
      subjectUrl = `${SITE_URL}/sets/${setSlug}?sort=discount`;
    } else {
      const hub = await resolveCardSlug(slug);
      if (!hub) continue;
      const r = await fetchCardOffers(hub.id);
      // offers is sorted cheapest-first by USD total, so offers[0] is the
      // USD-cheapest acquisition (item + shipping).
      offers = r?.deals ?? [];
      subjectUrl = `${SITE_URL}/cards/${slug}`;
    }
    if (!offers.length) continue;
    const cheapest = offers[0];

    for (const a of group) {
      // Same-unit contract (lib/alertMatch): the threshold in the alert's
      // own currency vs the listing's USD total converted with today's
      // rates, or a supported saving % when there's no target. A bare
      // legacy `target_price` stays dormant (no email) until re-set.
      // The historic evaluateAlert stays the reference for USD-only rows.
      const legacy = evaluateAlert(a, cheapest, { discountFloor: DISCOUNT_FLOOR });
      if (legacy.legacyDormant) continue;
      const result = evaluateAlertAgainstOffers(a, offers, { rates, discountFloor: DISCOUNT_FLOOR });
      if (!result.matched || !result.offer) continue;
      const offer = result.offer;
      if (!shouldNotify(a, offer, now, RENOTIFY_COOLDOWN_MS)) continue;
      // kept for the currency-integrity pins: identical guards, one place
      if (a.last_notified_deal_id === offer.id) continue;
      if (a.last_notified_at && now - new Date(a.last_notified_at).getTime() < RENOTIFY_COOLDOWN_MS) continue;

      if (a.digest) {
        if (!digests.has(a.email)) digests.set(a.email, []);
        digests.get(a.email).push({ alert: a, offer, evaluation: result, subjectUrl });
        continue;
      }

      const res = await sendEmail(alertEmail({ alert: a, offer, evaluation: result, subjectUrl }));
      if (res.sent) {
        sent++;
        await markNotified(db, a, offer);
      }
    }
  }

  // One email per digest subscriber covering every matched alert this run.
  let digestSent = 0;
  for (const [email, items] of digests) {
    const res = await sendEmail(digestEmail(email, items));
    if (res.sent) {
      digestSent++;
      for (const { alert, offer } of items) await markNotified(db, alert, offer);
    }
  }

  return Response.json({ ok: true, checked: alerts.length, cards: bySlug.size, sent, digestSent, ms: Date.now() - started });
}

async function markNotified(db, alert, offer) {
  await db
    .from("price_alerts")
    .update({ last_notified_at: new Date().toISOString(), last_notified_deal_id: offer.id })
    .eq("id", alert.id);
}

// What the listing costs, stated so the subscriber can trust it: the
// delivered total when shipping is recorded, otherwise the item price with
// "shipping unknown" said plainly. Never a total that pretends to be landed.
function offerLines(offer, evaluation) {
  const usd = listingTotalUsd(offer);
  const nativePrice = Number(offer.total_price);
  const nativeMoney = `${symbolFor(currencyForDeal(offer))}${nativePrice.toFixed(2)}`;
  const ship = offerShipping(offer);
  const shipNote = ship.state === "confirmed" ? "incl. shipping" : `${ship.note} — check on eBay`;
  const discPct = Math.round(Number(offer.discount_pct) * 100);
  return { usd, nativeMoney, shipNote, discPct, marketplace: String(offer.marketplace ?? "").replace("EBAY_", "eBay ") };
}

function alertEmail({ alert: a, offer, evaluation, subjectUrl }) {
  const { usd, nativeMoney, shipNote, discPct, marketplace } = offerLines(offer, evaluation);
  const unsub = `${SITE_URL}/api/alerts?token=${a.token}&action=unsubscribe`;
  const cardUrl = subjectUrl;
  const threshold = alertThreshold(a);
  const targetUsd = a.target_price_usd != null ? Number(a.target_price_usd) : null;
  // Targeted alert -> the comparison is in the alert's currency, so show
  // it in that currency on both sides (USD/USD for a USD alert). Untargeted
  // -> show the listing in its own currency + the rate-invariant %,
  // matching the weekly digest.
  const usdLine = `$${usd.toFixed(2)} USD`;
  const cmp = evaluation.comparison;
  const inCurrency = cmp && cmp.unit !== "percent" ? `${cmp.listing.toFixed(2)} ${cmp.unit}` : usdLine;
  const scopeWord = a.target_scope === "item" ? "Item price" : "Current price";
  const subject = threshold != null ? `${a.card_name} is now ${inCurrency}` : `${a.card_name} is now ${nativeMoney}`;
  const bodyLine =
    targetUsd != null && threshold?.currency === "USD"
      ? `Current price: ${usdLine} · Your target: $${targetUsd.toFixed(2)} USD (${discPct}% below market).`
      : threshold != null
        ? `${scopeWord}: ${inCurrency} · Your target: ${threshold.amount.toFixed(2)} ${threshold.currency} (${discPct}% below market).`
        : `${a.card_name} has a listing at ${nativeMoney} (${discPct}% below market).`;
  const criteriaLine = describeCriteria(a);
  const detail = [`${marketplace} · ${shipNote}`, criteriaLine ? `Your alert: ${criteriaLine}` : null].filter(Boolean).join("\n");
  return {
    to: a.email,
    subject,
    text: `${bodyLine}\n${detail}\n\nSee it: ${cardUrl}\n\nStop these emails: ${unsub}`,
    html: `<p><strong>${escapeHtml(a.card_name)}</strong> — ${escapeHtml(bodyLine)}</p>
<p style="color:#555;font-size:13px">${escapeHtml(detail).replace(/\n/g, "<br>")}</p>
<p><a href="${cardUrl}">See it on Pokemon Deal Finder</a></p>
<p style="color:#888;font-size:12px"><a href="${unsub}" style="color:#888">Stop these emails</a></p>`,
  };
}

function digestEmail(email, items) {
  const rows = items.map(({ alert: a, offer, evaluation, subjectUrl }) => {
    const { nativeMoney, shipNote, discPct, marketplace } = offerLines(offer, evaluation);
    const criteriaLine = describeCriteria(a);
    const text = `• ${a.card_name}: ${nativeMoney} (${discPct}% below market) · ${marketplace} · ${shipNote}${criteriaLine ? ` · your alert: ${criteriaLine}` : ""}\n  ${subjectUrl}\n  stop this alert: ${SITE_URL}/api/alerts?token=${a.token}&action=unsubscribe`;
    const html = `<li style="margin-bottom:10px"><strong>${escapeHtml(a.card_name)}</strong>: ${escapeHtml(nativeMoney)} (${discPct}% below market) · ${escapeHtml(marketplace)} · ${escapeHtml(shipNote)}${criteriaLine ? ` · <span style="color:#555">your alert: ${escapeHtml(criteriaLine)}</span>` : ""}<br><a href="${subjectUrl}">See it</a> · <a href="${SITE_URL}/api/alerts?token=${a.token}&action=unsubscribe" style="color:#888">stop this alert</a></li>`;
    return { text, html };
  });
  const n = items.length;
  return {
    to: email,
    subject: `${n} of your Pokemon card alerts matched`,
    text: `Your alerts matched ${n} listing${n === 1 ? "" : "s"} this check:\n\n${rows.map((r) => r.text).join("\n\n")}\n\nYou asked for one email per check instead of one per alert. Each alert has its own stop link above.`,
    html: `<p>Your alerts matched ${n} listing${n === 1 ? "" : "s"} this check:</p><ul style="padding-left:18px">${rows.map((r) => r.html).join("")}</ul><p style="color:#888;font-size:12px">You asked for one email per check instead of one per alert. Each alert has its own stop link above.</p>`,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
