// Sealed-product helpers shared by the sync job (/api/sync-sealed-catalog
// + scripts/syncSealedCatalog.js) and the browse pages.

// PokemonPriceTracker's repdigit "no real comps" sentinels - kept in sync
// with SENTINEL_PRICES in lib/pokemonPriceTracker.js. Inlined (not
// imported) so this stays dependency-free for client bundling.
const SENTINEL_PRICES = new Set([999, 999.99, 9999, 9999.99, 99999, 99999.99]);
const isSentinelPrice = (n) => SENTINEL_PRICES.has(Number(n));
//
// PokemonPriceTracker's /sealed-products has no `type` field - the
// product category lives in the name ("Evolving Skies Booster Box",
// "... Elite Trainer Box [Set of 2]", "... Booster Bundle", ...). This
// derives a stable, filterable type from the name. Order matters: the
// more specific / compound categories are tested first so "Booster Box
// Case" -> Case, "Elite Trainer Box" -> Elite Trainer Box (not Box).

const TYPE_RULES = [
  ["Case", /\bcase\b/i],
  ["Elite Trainer Box", /elite trainer box|\betb\b/i],
  ["Build & Battle", /build\s*&?\s*battle/i],
  ["Booster Bundle", /booster bundle|pack bundle|booster pack art bundle|sleeved booster pack bundle/i],
  ["Booster Box", /booster box|half booster box/i],
  ["Hanger Box", /hanger box/i],
  ["Blister", /blister|checklane/i],
  ["Tin", /\btins?\b/i],
  ["Deck", /\b(battle|theme|league|starter|training) deck\b|battle decks|v battle deck/i],
  [
    "Collection Box",
    /collection|\b(v|gx|ex|vmax|vstar)\s+box\b|figure box|poster collection|binder|collector chest|premium collection|special collection|v-?union/i,
  ],
  ["Booster Pack", /booster pack|sleeved booster pack|booster packs/i],
];

function sealedProductType(name) {
  const s = String(name || "");
  for (const [label, re] of TYPE_RULES) {
    if (re.test(s)) return label;
  }
  return "Other";
}

// The set of type labels above, in a sensible display order - used for
// the standalone hub's filter chips.
const SEALED_PRODUCT_TYPES = [
  "Booster Box",
  "Elite Trainer Box",
  "Booster Bundle",
  "Blister",
  "Booster Pack",
  "Build & Battle",
  "Collection Box",
  "Tin",
  "Deck",
  "Hanger Box",
  "Case",
  "Other",
];

// One /sealed-products row -> a sealed_catalog record. `setNameOverride`
// lets the per-set sync pass the canonical set name it queried with
// (PPT's row.setName is already that, but keep it explicit).
function sealedCatalogRecord(p, { language = "english" } = {}) {
  const id = p.tcgPlayerId != null ? String(p.tcgPlayerId).trim() : null;
  if (!id) return null;
  const price = Number(p.unopenedPrice);
  return {
    tcgplayer_id: id,
    name: p.name ?? "",
    set: p.setName ?? "",
    set_id: p.setId != null ? String(p.setId) : null,
    product_type: sealedProductType(p.name),
    language,
    market_price: Number.isFinite(price) && price > 0 && !isSentinelPrice(price) ? price : null,
    image_url:
      p.imageCdnUrl200 ||
      p.imageUrl ||
      (id ? `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_200x200.jpg` : null),
    source: "pokemonpricetracker",
    synced_at: new Date().toISOString(),
  };
}

// Null out sealed reference prices that are logically impossible, so the
// tile shows "Price unavailable" instead of a misleading number (same
// posture as the card-side $0.00 / sentinel handling). PokemonPriceTracker
// has no real comps for ultra-rare vintage sealed product and sometimes
// emits a placeholder-ish figure - e.g. a Base Set (Shadowless) 1st
// Edition Booster Box (real value ~$300k+) came back at $499.99, cheaper
// than a single pack of the same set.
//
// Rules, applied over the whole record set (needs cross-row context):
//   * a Booster Box priced <= the set's most expensive Booster Pack
//     (a box contains ~36 packs - it can never be worth less than one)
//   * any Booster Box under an absolute floor ($40 - no real sealed
//     booster box, full or half, sells for less)
// Mutates `records` in place; returns the count nulled.
const SEALED_BOX_PRICE_FLOOR = 40;

function flagImplausibleSealedPrices(records) {
  const maxPackBySet = new Map();
  for (const r of records) {
    if (r.product_type === "Booster Pack" && r.market_price != null) {
      const cur = maxPackBySet.get(r.set) ?? 0;
      if (r.market_price > cur) maxPackBySet.set(r.set, r.market_price);
    }
  }
  let nulled = 0;
  for (const r of records) {
    if (r.product_type !== "Booster Box" || r.market_price == null) continue;
    const maxPack = maxPackBySet.get(r.set);
    if (r.market_price < SEALED_BOX_PRICE_FLOOR || (maxPack != null && r.market_price <= maxPack)) {
      r.market_price = null;
      nulled++;
    }
  }
  return nulled;
}

// Which `sealed_catalog` product types get auto-promoted into
// `sealed_watchlist` for active eBay deal scanning (`/api/sync-sealed-
// watchlist`). Booster Box + Elite Trainer Box only — the two types
// collectors actually hunt deals on, and the pair that keeps the added
// eBay Browse call volume (~200 products × 5 marketplaces ≈ 1k/day)
// inside the current 5,000/day budget. The other ~2,100 catalogued
// products (blisters, tins, packs, cases, …) stay browse-only with a
// reference price + "View on eBay" CTA. See docs/scanning-architecture.md
// §6 rec (b).
const SEALED_AUTO_SCAN_TYPES = ["Booster Box", "Elite Trainer Box"];

// Floor for auto-promotion. Below this a "deal" isn't worth a scan slot,
// and it filters out the odd mis-scraped low value (a real BB/ETB is
// ~$80+; anything under $25 is data noise). Rows with a null price are
// excluded regardless (no basis to compute a discount).
const SEALED_AUTO_MIN_PRICE = 25;

module.exports = {
  sealedProductType,
  SEALED_PRODUCT_TYPES,
  SEALED_AUTO_SCAN_TYPES,
  SEALED_AUTO_MIN_PRICE,
  sealedCatalogRecord,
  flagImplausibleSealedPrices,
};
