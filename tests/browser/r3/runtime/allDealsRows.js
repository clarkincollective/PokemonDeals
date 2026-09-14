// "All deals" fixture inventory: SIMULATED stored `deals` rows spanning
// several 24-row pages, built from the labelled DEAL_STATE_FIXTURES
// templates so every tile renders through the real display rules. Shared by
// the R3 fixture runtime (data.js) and tests/scanner/all-deals-r1.test.mjs,
// so browser checks and unit checks run against the same rows.
//
// Deliberately includes, besides ordinary eligible listings:
//   - one eBay listing stored for several marketplaces whose copies disagree
//     on price, currency and shipping (home-market and preference cases)
//   - distinct listings of the same card, and distinct grades of one card
//   - live auctions with 0 bids, and an ended auction
//   - unknown shipping (0 recorded, and no breakdown recorded)
//   - plain listings without a trusted comparison
//   - Japanese-catalogue listings (eligible under the same gate)
//   - rows that must NEVER appear or count: quarantined, slab-titled raw,
//     inactive, stale, language-mismatched
// Prices, ids, dates and links are placeholders, not live offers.
import { DEAL_STATE_FIXTURES } from "../../../../lib/dev/dealStateFixtures.js";

const HOUR = 3600 * 1000;
const NOW = Date.now();
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const ahead = (h) => new Date(NOW + h * HOUR).toISOString();
const tpl = (id) => {
  const f = DEAL_STATE_FIXTURES.find((x) => x.id === id);
  if (!f) throw Error(`UNKNOWN_TEMPLATE ${id}`);
  return { ...f.deal, is_active: true, card_language: "english" };
};

// Per-marketplace scan currency and a fixed simulated rate (1 USD = n).
const MARKET = {
  EBAY_US: { currency: "USD", rate: 1, country: "US" },
  EBAY_GB: { currency: "GBP", rate: 0.8, country: "GB" },
  EBAY_CA: { currency: "CAD", rate: 1.35, country: "CA" },
  EBAY_AU: { currency: "AUD", rate: 1.5, country: "AU" },
  EBAY_DE: { currency: "EUR", rate: 0.9, country: "DE" },
  EBAY_IT: { currency: "EUR", rate: 0.9, country: "IT" },
};
const MARKETS = Object.keys(MARKET);
const money = (n) => Math.round(n * 100) / 100;

// One stored copy of a listing on `marketplace`, priced in that
// marketplace's currency. itemUsd/shipUsd are the USD figures; a shipping
// of 0 stays 0 (unconfirmed), `undefined` removes the field (not recorded).
function copy(base, { id, listingId, marketplace, itemUsd, shipUsd, firstSeenH, itemCountry, ...over }) {
  const m = MARKET[marketplace];
  const legacyId = String(listingId).split("|")[1];
  const totalUsd = money(itemUsd + (shipUsd ?? 0));
  const marketUsd = over.market_price !== undefined ? over.market_price : base.market_price;
  const row = {
    ...base,
    id,
    listing_id: listingId,
    affiliate_url: `https://www.ebay.com/itm/${legacyId}`,
    listing_url: `https://www.ebay.com/itm/${legacyId}`,
    marketplace,
    currency: m.currency,
    item_location_country: itemCountry ?? m.country,
    is_local: (itemCountry ?? m.country) === m.country,
    price: money(itemUsd * m.rate),
    total_price: money((itemUsd + (shipUsd ?? 0)) * m.rate),
    total_price_usd: totalUsd,
    // derived the way the scanner does: a saving only below the reference
    discount_pct: marketUsd > 0 ? Math.max(0, money(1 - totalUsd / marketUsd)) : null,
    first_seen_at: ago(firstSeenH),
    last_seen_at: ago(0.5),
    exact_verified_at: ago(0.5),
    ...over,
  };
  if (shipUsd === undefined) delete row.shipping;
  else row.shipping = money(shipUsd * m.rate);
  return row;
}

// Ordinary eligible listings: 84 distinct listings over 6 raw templates,
// rotating marketplaces. Several are the same card (distinct listings of one
// card must all show). first_seen_at strictly increases with i so "newest"
// order is fully determined.
const BULK_TEMPLATES = [
  { t: "bin_compared", usd: 26.5, ship: 4.25 },
  { t: "bin_shipping_unconfirmed", usd: 118, ship: 0 },
  { t: "bin_plain", usd: 180, ship: 0 },
  { t: "unverified_condition", usd: 40, ship: 3.5, over: { condition: "Lightly Played", title: "Scyther Jungle 10/64 Holo Lightly Played" } },
  { t: "non_usd", usd: 390, ship: 15 },
  { t: "bin_shipping_unknown", usd: 22, ship: undefined },
];
const bulk = Array.from({ length: 84 }, (_, i) => {
  const b = BULK_TEMPLATES[i % BULK_TEMPLATES.length];
  const marketplace = MARKETS[i % MARKETS.length];
  const itemUsd = money(b.usd * (1 + ((i * 7) % 11) / 20));
  return copy(tpl(b.t), {
    id: 970000 + i,
    listingId: `v1|3100${String(i).padStart(4, "0")}|0`,
    marketplace,
    itemUsd,
    shipUsd: b.ship,
    firstSeenH: 2 + i * 0.75,
    market_price: tpl(b.t).market_price == null ? null : money(tpl(b.t).market_price * (1 + ((i * 7) % 11) / 20)),
    ...b.over,
  });
});

// One listing, several stored copies that disagree.
//   DUP_HOME: item located in GB; copies on US, GB and AU -> the GB copy
//     (home market) wins even though US is earlier in the preference order.
//   DUP_PREF: item located in JP (no scanned home); copies on AU and CA ->
//     CA (preference order US, GB, CA, AU, DE, IT).
//   DUP_US:   item located in US; copies on US and DE -> US.
const clef = tpl("bin_compared");
const dups = [
  copy(clef, { id: 971001, listingId: "v1|3200000001|0", marketplace: "EBAY_US", itemUsd: 24, shipUsd: 8, firstSeenH: 1, itemCountry: "GB" }),
  copy(clef, { id: 971002, listingId: "v1|3200000001|0", marketplace: "EBAY_GB", itemUsd: 24, shipUsd: 3, firstSeenH: 1.1, itemCountry: "GB" }),
  copy(clef, { id: 971003, listingId: "v1|3200000001|0", marketplace: "EBAY_AU", itemUsd: 26, shipUsd: 6, firstSeenH: 1.2, itemCountry: "GB" }),
  copy(tpl("bin_shipping_unconfirmed"), { id: 971011, listingId: "v1|3200000002|0", marketplace: "EBAY_AU", itemUsd: 120, shipUsd: 0, firstSeenH: 1.3, itemCountry: "JP" }),
  copy(tpl("bin_shipping_unconfirmed"), { id: 971012, listingId: "v1|3200000002|0", marketplace: "EBAY_CA", itemUsd: 121, shipUsd: 10, firstSeenH: 1.4, itemCountry: "JP" }),
  copy(tpl("non_usd"), { id: 971021, listingId: "v1|3200000003|0", marketplace: "EBAY_DE", itemUsd: 400, shipUsd: 25, firstSeenH: 1.5, itemCountry: "US" }),
  copy(tpl("non_usd"), { id: 971022, listingId: "v1|3200000003|0", marketplace: "EBAY_US", itemUsd: 395, shipUsd: 6, firstSeenH: 1.6, itemCountry: "US" }),
];

// Distinct grades of one card: three separate listings, never collapsed.
const zard = tpl("graded");
const grades = [
  copy(zard, { id: 972001, listingId: "v1|3300000001|0", marketplace: "EBAY_US", itemUsd: 5200, shipUsd: 0, firstSeenH: 3.1, grader: "PSA", grade: "10", market_price: 6500, title: "Charizard Base Set 4/102 PSA 10" }),
  copy(zard, { id: 972002, listingId: "v1|3300000002|0", marketplace: "EBAY_US", itemUsd: 1450, shipUsd: 0, firstSeenH: 3.2, grader: "PSA", grade: "9", title: "Charizard Base Set 4/102 PSA 9" }),
  copy(zard, { id: 972003, listingId: "v1|3300000003|0", marketplace: "EBAY_GB", itemUsd: 980, shipUsd: 12, firstSeenH: 3.3, grader: "CGC", grade: "9", market_price: 1300, title: "Charizard Base Set 4/102 CGC 9" }),
];

// Live auctions with no bids, ending at different times.
const auctions = [
  ["auction", 9, 5],
  ["auction_shipping_unconfirmed", 0.6, 1.5],
  ["auction_shipping_unknown", 40, 30],
  ["auction", 8, 60],
].map(([t, usd, endH], i) =>
  copy(tpl(t), {
    id: 973001 + i,
    listingId: `v1|3400000${i}|0`,
    marketplace: MARKETS[i % 3],
    itemUsd: usd,
    shipUsd: t === "auction_shipping_unknown" ? undefined : t === "auction_shipping_unconfirmed" ? 0 : 6,
    firstSeenH: 4 + i * 0.1,
    bid_count: 0,
    auction_end_at: ahead(endH),
  })
);

// Japanese-catalogue listings: the same display gate applies (the listing's
// stated language must match the card's catalogue language), and the
// comparison is the Japanese-catalogue reference, never an English one.
const japaneseCard = (over) => ({
  ...tpl("bin_compared"),
  card_name: "Pikachu",
  card_set: "Pokemon Card 151",
  card_language: "japanese",
  card_tcgplayer_id: null,
  image_verdict: "NO_TRUSTED_IMAGE",
  title: "Pikachu 025/165 Japanese Pokemon Card 151 Near Mint",
  watchlist: { name: "Pikachu", set: "Pokemon Card 151", language: "japanese", justtcg_tcgplayer_id: null },
  ...over,
});
const japanese = [
  copy(japaneseCard({ market_price: 30 }), { id: 975001, listingId: "v1|3600000001|0", marketplace: "EBAY_AU", itemUsd: 18, shipUsd: 4, firstSeenH: 5.5, itemCountry: "JP" }),
  copy(japaneseCard({ market_price: 40 }), { id: 975002, listingId: "v1|3600000002|0", marketplace: "EBAY_US", itemUsd: 25, shipUsd: 0, firstSeenH: 5.6, itemCountry: "JP" }),
];

export const ALL_DEALS_ELIGIBLE_LISTING_IDS = [...bulk, ...dups, ...grades, ...auctions, ...japanese]
  .map((r) => r.listing_id)
  .filter((v, i, a) => a.indexOf(v) === i);

// Must never appear or count.
export const ALL_DEALS_EXCLUDED_ROW_IDS = [974001, 974002, 974003, 974004, 974005, 974006];
const excluded = [
  copy(clef, { id: 974001, listingId: "v1|3500000001|0", marketplace: "EBAY_US", itemUsd: 5, shipUsd: 1, firstSeenH: 0.2, disqualified_reason: "identity:collector_number_conflict" }),
  copy(clef, { id: 974002, listingId: "v1|3500000002|0", marketplace: "EBAY_GB", itemUsd: 6, shipUsd: 1, firstSeenH: 0.3, title: "Clefable Jungle 1/64 Holo Rare PSA 10 Gem Mint" }),
  copy(clef, { id: 974003, listingId: "v1|3500000003|0", marketplace: "EBAY_US", itemUsd: 7, shipUsd: 1, firstSeenH: 0.4, is_active: false }),
  copy(clef, { id: 974004, listingId: "v1|3500000004|0", marketplace: "EBAY_CA", itemUsd: 8, shipUsd: 1, firstSeenH: 900, last_seen_at: ago(24 * 60), exact_verified_at: ago(24 * 60) }),
  // a Japanese-catalogue identity whose listing title states English: the
  // real gate hides it (identity:card_mismatch; its language rule would
  // also refuse it), so it is never priced against the wrong catalogue
  copy(japaneseCard(), { id: 974005, listingId: "v1|3500000005|0", marketplace: "EBAY_AU", itemUsd: 9, shipUsd: 1, firstSeenH: 0.5, title: "Pikachu 025/165 Pokemon Card 151 English Near Mint" }),
  copy(tpl("auction"), { id: 974006, listingId: "v1|3500000006|0", marketplace: "EBAY_US", itemUsd: 10, shipUsd: 6, firstSeenH: 0.6, bid_count: 3, auction_end_at: ago(2) }),
];

export const allDealsRows = [...bulk, ...dups, ...grades, ...auctions, ...japanese, ...excluded];
