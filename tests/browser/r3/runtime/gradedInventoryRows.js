// graded-inventory-r1 fixture: SIMULATED graded `deals` rows added to the All
// deals fixture inventory, so /deals/graded and /deals?type=graded can be
// compared over ONE snapshot (gradedInventorySnapshot). Built with the same
// row builder as allDealsRows.js. Prices, ids, dates and links are
// placeholders, not live offers.
//
// Covers, beyond the three graded listings already in allDealsRows:
//   - 3+ pages of eligible English graded listings (24 per page)
//   - several graders and grades, and distinct listings of the SAME card and
//     grade (the old page deduplicated those by card + grade)
//   - local and non-local listings within one marketplace
//   - plain listings (no comparison) and listings priced above their comparison
//   - one graded listing stored on two marketplaces with different prices
//   - Japanese-catalogue slabs (All deals shows them; the English graded page
//     does not)
//   - live graded auctions, and rows that must never appear: quarantined,
//     inactive, stale, ended auction, and a listing whose copies disagree on
//     grade (identity conflict)
import { allDealsRows, fixtureRow } from "./allDealsRows.js";

const { copy, tpl, ago, ahead, japaneseCard } = fixtureRow;
const slab = tpl("graded");
const MARKETS = ["EBAY_US", "EBAY_GB", "EBAY_CA", "EBAY_AU"];
const GRADES = [
  ["PSA", "10"],
  ["PSA", "9"],
  ["CGC", "10"],
  ["CGC", "9.5"],
  ["BGS", "9.5"],
  ["SGC", "10"],
];
const money = (n) => Math.round(n * 100) / 100;

// 60 English slabs of one card. i % 6 picks the grade, so each grade has ten
// distinct listings. Every 4th is plain (no comparison); every 7th is priced
// above its comparison; every 5th is located abroad (not local).
const bulk = Array.from({ length: 60 }, (_, i) => {
  const [grader, grade] = GRADES[i % GRADES.length];
  const itemUsd = money(900 + ((i * 37) % 23) * 25);
  const plain = i % 4 === 3;
  const above = !plain && i % 7 === 6;
  return copy(slab, {
    id: 980000 + i,
    listingId: `v1|3800${String(i).padStart(6, "0")}|0`,
    marketplace: MARKETS[i % MARKETS.length],
    itemUsd,
    shipUsd: i % 3 === 0 ? 0 : 15,
    firstSeenH: 6 + i * 0.5,
    itemCountry: i % 5 === 4 ? "JP" : undefined,
    grader,
    grade,
    market_price: plain ? null : above ? money(itemUsd * 0.8) : money(itemUsd * 1.3),
    title: `Charizard Base Set 4/102 ${grader} ${grade}`,
  });
});

// One slab stored on US (home) and GB, disagreeing on price and shipping.
const crossListed = [
  copy(slab, { id: 981001, listingId: "v1|3810000001|0", marketplace: "EBAY_US", itemUsd: 2100, shipUsd: 0, firstSeenH: 5.2, grader: "PSA", grade: "10", market_price: 2600, title: "Charizard Base Set 4/102 PSA 10" }),
  copy(slab, { id: 981002, listingId: "v1|3810000001|0", marketplace: "EBAY_GB", itemUsd: 2180, shipUsd: 40, firstSeenH: 5.3, itemCountry: "US", grader: "PSA", grade: "10", market_price: 2600, title: "Charizard Base Set 4/102 PSA 10" }),
];

// Japanese-catalogue slabs: eligible for All deals, outside the English page.
const japaneseSlab = (over) =>
  japaneseCard({ is_graded: true, condition: null, title: "Pikachu 025/165 Japanese Pokemon Card 151 PSA 10", ...over });
const japanese = [
  copy(japaneseSlab({ grader: "PSA", grade: "10", market_price: 300 }), { id: 982001, listingId: "v1|3820000001|0", marketplace: "EBAY_US", itemUsd: 210, shipUsd: 10, firstSeenH: 5.4, itemCountry: "JP" }),
  copy(japaneseSlab({ grader: "CGC", grade: "10", market_price: 280, title: "Pikachu 025/165 Japanese Pokemon Card 151 CGC 10" }), { id: 982002, listingId: "v1|3820000002|0", marketplace: "EBAY_GB", itemUsd: 190, shipUsd: 12, firstSeenH: 5.5, itemCountry: "JP" }),
];

// Live graded auctions (0 bids).
const auctions = [3, 20, 50].map((endH, i) =>
  copy(slab, {
    id: 983001 + i,
    listingId: `v1|383000000${i}|0`,
    marketplace: MARKETS[i],
    itemUsd: 700 + i * 50,
    shipUsd: 15,
    firstSeenH: 5.6 + i * 0.1,
    grader: "PSA",
    grade: "9",
    market_price: 1400,
    listing_type: "AUCTION",
    bid_count: 0,
    auction_end_at: ahead(endH),
    title: "Charizard Base Set 4/102 PSA 9",
  })
);

export const GRADED_EXTRA_EXCLUDED_ROW_IDS = [984001, 984002, 984003, 984004, 984005, 984006];
const excluded = [
  copy(slab, { id: 984001, listingId: "v1|3840000001|0", marketplace: "EBAY_US", itemUsd: 500, shipUsd: 0, firstSeenH: 0.2, grader: "PSA", grade: "10", disqualified_reason: "identity:collector_number_conflict", title: "Charizard Base Set 4/102 PSA 10" }),
  copy(slab, { id: 984002, listingId: "v1|3840000002|0", marketplace: "EBAY_US", itemUsd: 510, shipUsd: 0, firstSeenH: 0.3, grader: "PSA", grade: "10", is_active: false, title: "Charizard Base Set 4/102 PSA 10" }),
  copy(slab, { id: 984003, listingId: "v1|3840000003|0", marketplace: "EBAY_GB", itemUsd: 520, shipUsd: 0, firstSeenH: 900, grader: "CGC", grade: "9.5", last_seen_at: ago(24 * 60), exact_verified_at: ago(24 * 60), title: "Charizard Base Set 4/102 CGC 9.5" }),
  copy(slab, { id: 984004, listingId: "v1|3840000004|0", marketplace: "EBAY_US", itemUsd: 530, shipUsd: 15, firstSeenH: 0.4, grader: "PSA", grade: "9", listing_type: "AUCTION", bid_count: 0, auction_end_at: ago(1), title: "Charizard Base Set 4/102 PSA 9" }),
  // one listing, copies matched to different grades: withheld everywhere
  copy(slab, { id: 984005, listingId: "v1|3840000005|0", marketplace: "EBAY_US", itemUsd: 800, shipUsd: 0, firstSeenH: 0.5, grader: "PSA", grade: "10", title: "Charizard Base Set 4/102 PSA 10" }),
  copy(slab, { id: 984006, listingId: "v1|3840000005|0", marketplace: "EBAY_CA", itemUsd: 820, shipUsd: 0, firstSeenH: 0.6, grader: "PSA", grade: "9", title: "Charizard Base Set 4/102 PSA 10" }),
];

export const gradedExtraRows = [...bulk, ...crossListed, ...japanese, ...auctions, ...excluded];
export const gradedInventorySnapshot = [...allDealsRows, ...gradedExtraRows];
