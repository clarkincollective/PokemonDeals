// Phase 13B.3.1 - species deal scope is CARD-IDENTITY based, not
// ingestion-source based.
//
// A deal belongs on /pokemon/<species> when its canonical card identity
// resolves to that species, regardless of which legitimate ingestion path
// discovered it. Before 13B.3.1 the scope came only from
// speciesHubs[].watchlistIds, which computeAggregates() builds from an
// `!inner` watchlist join - so an active deal with `watchlist_id IS NULL`
// (feed-discovered, `discovery_source = 'external'`) was structurally
// invisible to its species page even when its `card_tcgplayer_id`
// canonically belongs to that species in card_catalog.
//
// Fix: scope by card_tcgplayer_id IN (the species' card_catalog ids),
// UNION the legacy watchlist-id list (so nothing shown today regresses).

// A PostgREST `.or()` argument scoping `deals` to one species by EITHER
// canonical card id OR the legacy precomputed watchlist-id list. Returns
// null when neither list has any members (caller should then short-circuit
// to an empty result rather than emit a filter that matches everything).
export function speciesScopeOrClause({ catalogTcgIds = [], watchlistIds = [] } = {}) {
  const cats = [
    ...new Set((catalogTcgIds ?? []).map((v) => String(v ?? "").trim()).filter(Boolean)),
  ];
  const wls = [...new Set((watchlistIds ?? []).filter((v) => v != null))];
  const parts = [];
  if (cats.length) parts.push(`card_tcgplayer_id.in.(${cats.join(",")})`);
  if (wls.length) parts.push(`watchlist_id.in.(${wls.join(",")})`);
  return parts.length ? parts.join(",") : null;
}

// Canonical per-print dedupe key for the species deal grid: collapse
// multiple listings of the same card to one tile.
//
// Keyed on card_tcgplayer_id FIRST (the true "one canonical card = one
// tile" identity, 100% populated on active deals), then watchlist_id,
// then the row id. This is deliberately card-identity-first rather than
// fetchDealsPage's watchlist-first order, because species scope now mixes
// ingestion paths: a feed-discovered listing (watchlist_id NULL) and a
// watchlist-linked listing of the SAME card must collapse to one tile,
// which a watchlist-first key can't do. A deal that qualifies via both
// the card-id and the watchlist path is still one row and one key.
export function speciesDealKey(deal) {
  if (!deal) return null;
  if (deal.card_tcgplayer_id != null && String(deal.card_tcgplayer_id).trim() !== "")
    return `c:${String(deal.card_tcgplayer_id).trim()}`;
  if (deal.watchlist_id != null) return `w:${deal.watchlist_id}`;
  return `d:${deal.id}`;
}
