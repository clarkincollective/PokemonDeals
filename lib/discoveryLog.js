// Best-effort discovery-event logging, shared by the eBay scanner
// (app/api/refresh-deals) and the external-feed ingestion
// (app/api/ingest-feed). Writes go to `discovery_events` (append-only,
// see supabase/discovery_analytics_migration.sql).
//
// EVERY call is best-effort: a logging failure (table missing because the
// migration hasn't run, transient DB error, ...) is swallowed. Discovery
// analytics are never allowed to break a scan or an ingest cycle.

// eBay's RESTful listing id is `v1|<legacy>|<variation>`. The board and the
// Browse-by-legacy lookup both key on the bare legacy number, so that's the
// stable cross-pipeline id.
function legacyIdFromListingId(listingId) {
  if (!listingId) return null;
  const s = String(listingId);
  if (s.startsWith("v1|")) return s.split("|")[1] || null;
  return /^\d{6,}$/.test(s) ? s : null;
}

function discoveryListingKey(marketplace, legacyOrListingId) {
  const legacy = legacyIdFromListingId(legacyOrListingId) ?? legacyOrListingId;
  return `${marketplace}:${legacy}`;
}

// db: a supabaseAdmin() client. Fire-and-forget - callers do not await the
// DB round-trip on the hot path beyond what they already do.
async function logDiscoveryEvent(db, event) {
  try {
    const row = {
      listing_key:
        event.listingKey ??
        discoveryListingKey(event.marketplace, event.legacyId ?? event.listingId),
      marketplace: event.marketplace,
      source: event.source, // 'scan' | 'external'
      search_type: event.searchType ?? null,
      card_tcgplayer_id: event.cardTcgplayerId ?? null,
      became_deal: Boolean(event.becameDeal),
      discount_pct: event.discountPct ?? null,
      external_discount_hint: event.externalDiscountHint ?? null,
      external_source_url: event.externalSourceUrl ?? null,
    };
    await db.from("discovery_events").insert(row);
  } catch {
    /* analytics must never break discovery */
  }
}

module.exports = { logDiscoveryEvent, legacyIdFromListingId, discoveryListingKey };
