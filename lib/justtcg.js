const JUSTTCG_BASE_URL = "https://api.justtcg.com/v1";
const REQUEST_TIMEOUT_MS = 15000;

function apiKey() {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error("Missing JUSTTCG_API_KEY");
  return key;
}

// A bare fetch() with no timeout will hang forever if JustTCG's server
// never responds - one stuck request would silently freeze the entire
// catalog sync. AbortSignal.timeout() guarantees every call fails fast
// instead.
function fetchJustTCG(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

// Used once per card, when adding it to the watchlist: turns a plain
// name (+ optional set) into the stable tcgplayerId that the cheap batch
// endpoint needs going forward.
async function searchCard(name, setSlug) {
  const url = new URL(`${JUSTTCG_BASE_URL}/cards`);
  url.searchParams.set("q", name);
  url.searchParams.set("game", "pokemon");
  if (setSlug) url.searchParams.set("set", setSlug);

  const res = await fetchJustTCG(url, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new Error(`JustTCG search failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  const card = body.data?.[0];
  if (!card) throw new Error(`No JustTCG results for "${name}"`);
  return card;
}

// The scheduled job's main price call: one request, price for every
// watched card, keyed by the tcgplayerId + condition stored on each
// watchlist row.
async function batchPrices(watchlistRows) {
  if (watchlistRows.length === 0) return new Map();

  const res = await fetchJustTCG(`${JUSTTCG_BASE_URL}/cards`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      watchlistRows.map((row) => ({
        tcgplayerId: row.justtcg_tcgplayer_id,
        condition: row.justtcg_condition,
      }))
    ),
  });

  if (!res.ok) throw new Error(`JustTCG batch request failed: ${res.status} ${await res.text()}`);

  const body = await res.json();

  // Match by the tcgplayerId JustTCG echoes back on each card, not by
  // array position - safer if the API ever reorders or skips an item.
  const cardsByTcgplayerId = new Map(body.data.map((card) => [String(card.tcgplayerId), card]));

  // Map watchlist_id -> { marketPrice, priceChange24hr, name, set }
  const byWatchlistId = new Map();
  for (const row of watchlistRows) {
    const card = cardsByTcgplayerId.get(String(row.justtcg_tcgplayer_id));
    if (!card) continue;

    const variant =
      card.variants.find((v) => v.condition === row.justtcg_condition) ?? card.variants[0];
    if (!variant) continue;

    byWatchlistId.set(row.id, {
      marketPrice: variant.price,
      priceChange24hr: variant.priceChange24hr ?? null,
      name: card.name,
      set: card.set_name ?? card.set,
    });
  }

  return byWatchlistId;
}

// On-demand only (a deal detail page a visitor actually opened) - never
// called from the bulk scheduled scan, so it doesn't multiply the
// watchlist-sized request budget.
async function getPriceHistory(tcgplayerId, condition, duration = "90d") {
  const url = new URL(`${JUSTTCG_BASE_URL}/cards`);
  url.searchParams.set("tcgplayerId", tcgplayerId);
  url.searchParams.set("condition", condition);
  url.searchParams.set("priceHistoryDuration", duration);

  const res = await fetchJustTCG(url, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new Error(`JustTCG history request failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  const card = body.data?.[0];
  const variant = card?.variants?.find((v) => v.condition === condition) ?? card?.variants?.[0];
  return (variant?.priceHistory ?? []).map((point) => ({ t: point.t * 1000, p: point.p }));
}

// All Pokemon sets JustTCG tracks - used by the catalog-sync job to know
// which sets to page through.
async function listSets() {
  const url = new URL(`${JUSTTCG_BASE_URL}/sets`);
  url.searchParams.set("game", "pokemon");

  const res = await fetchJustTCG(url, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new Error(`JustTCG sets request failed: ${res.status} ${await res.text()}`);

  const body = await res.json();
  return body.data ?? [];
}

// One page of every card in a set (no search query - just enumeration).
async function listSetCards(setId, offset, limit = 100) {
  const url = new URL(`${JUSTTCG_BASE_URL}/cards`);
  url.searchParams.set("game", "pokemon");
  url.searchParams.set("set", setId);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const res = await fetchJustTCG(url, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new Error(`JustTCG cards request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = { searchCard, batchPrices, getPriceHistory, listSets, listSetCards };
