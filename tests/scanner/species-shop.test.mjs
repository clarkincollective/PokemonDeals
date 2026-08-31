// Species-page shopping UX: marketplace-aware eBay search URLs + the pure
// catalogue view helpers (filter / sort / group / progressive disclosure).

import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeEbaySearchUrl, EBAY_DOMAIN } from "../../lib/ebaySearch.js";
import {
  filterCards,
  sortCards,
  groupBySet,
  visibleCount,
  distinctSorted,
  DEFAULT_SORT,
  INITIAL_PER_LARGE_GROUP,
  ALWAYS_FULL_UP_TO,
} from "../../lib/catalogueView.js";
import ebay from "../../lib/ebay.js";

const US =
  "https://www.ebay.com/sch/i.html?_nkw=Charizard+Base+Set&_sacat=183454&mkevt=1&mkcid=1&campid=5339197414";

// ---------- marketplace-aware search URL ----------
test("localizeEbaySearchUrl repoints ONLY the host, keeps every tracking param", () => {
  const au = localizeEbaySearchUrl(US, "EBAY_AU");
  const u = new URL(au);
  assert.equal(u.hostname, "www.ebay.com.au");
  assert.equal(u.searchParams.get("_nkw"), "Charizard Base Set");
  assert.equal(u.searchParams.get("_sacat"), "183454");
  assert.equal(u.searchParams.get("campid"), "5339197414"); // affiliate campaign preserved
  assert.equal(u.searchParams.get("mkevt"), "1");
});

test("localizeEbaySearchUrl covers every scanned marketplace", () => {
  assert.equal(new URL(localizeEbaySearchUrl(US, "EBAY_GB")).hostname, "www.ebay.co.uk");
  assert.equal(new URL(localizeEbaySearchUrl(US, "EBAY_DE")).hostname, "www.ebay.de");
  assert.equal(new URL(localizeEbaySearchUrl(US, "EBAY_CA")).hostname, "www.ebay.ca");
  assert.equal(new URL(localizeEbaySearchUrl(US, "EBAY_IT")).hostname, "www.ebay.it");
  assert.equal(Object.keys(EBAY_DOMAIN).length, 6);
});

test("localizeEbaySearchUrl leaves an unknown/empty region and non-eBay urls untouched", () => {
  assert.equal(localizeEbaySearchUrl(US, ""), US);
  assert.equal(localizeEbaySearchUrl(US, "EBAY_ZZ"), US);
  assert.equal(localizeEbaySearchUrl("https://tcgplayer.com/x", "EBAY_AU"), "https://tcgplayer.com/x");
  assert.equal(localizeEbaySearchUrl(null, "EBAY_AU"), null);
});

test("buildEbaySearchLink(query, marketplace) targets the right eBay site", () => {
  assert.match(ebay.buildEbaySearchLink("Charizard", "EBAY_AU"), /^https:\/\/www\.ebay\.com\.au\/sch/);
  assert.match(ebay.buildEbaySearchLink("Charizard", "EBAY_GB"), /^https:\/\/www\.ebay\.co\.uk\/sch/);
  assert.match(ebay.buildEbaySearchLink("Charizard"), /^https:\/\/www\.ebay\.com\/sch/); // default US
  assert.match(ebay.buildEbaySearchLink("Blaine's Charizard", "EBAY_AU"), /_nkw=Blaine/);
});

// ---------- catalogue view helpers ----------
const cards = [
  { name: "Charizard", set: "Base Set", cardNumber: "4/102", rarity: "Holo Rare", refPrice: 900 },
  { name: "Charizard ex", set: "Obsidian Flames", cardNumber: "125/197", rarity: "Double Rare", refPrice: 40 },
  { name: "Charizard V", set: "Brilliant Stars", cardNumber: "17/172", rarity: "Ultra Rare", refPrice: 12 },
  { name: "Charizard VMAX", set: "Brilliant Stars", cardNumber: "18/172", rarity: "Ultra Rare", refPrice: 55 },
  { name: "Dark Charizard", set: "Team Rocket", cardNumber: "4/82", rarity: "Holo Rare", refPrice: null },
];

test("filterCards matches name / number / set / rarity, case-insensitive", () => {
  assert.equal(filterCards(cards, { q: "vmax" }).length, 1);
  assert.equal(filterCards(cards, { q: "125" }).length, 1);
  assert.equal(filterCards(cards, { q: "brilliant" }).length, 2);
  assert.equal(filterCards(cards, { q: "holo rare" }).length, 2);
  assert.equal(filterCards(cards, { set: "Brilliant Stars" }).length, 2);
  assert.equal(filterCards(cards, { rarity: "Ultra Rare", q: "vmax" }).length, 1);
  assert.equal(filterCards(cards, { q: "pikachu" }).length, 0);
});

test("default sort is Highest price; price-unavailable sinks to the bottom", () => {
  assert.equal(DEFAULT_SORT, "value_desc");
  const s = sortCards(cards, DEFAULT_SORT).map((c) => c.name);
  assert.equal(s[0], "Charizard"); // $900
  assert.equal(s.at(-1), "Dark Charizard"); // no price
  const asc = sortCards(cards, "value_asc").map((c) => c.name);
  assert.equal(asc[0], "Dark Charizard"); // -1 sorts first ascending
  assert.deepEqual(sortCards(cards, "name").map((c) => c.name)[0], "Charizard");
  assert.equal(sortCards(cards, "number").map((c) => c.name)[0], "Charizard"); // 4/102 -> 4
});

test("groupBySet: sets richest-first, cards value-first within", () => {
  const g = groupBySet(cards);
  assert.equal(g[0].set, "Brilliant Stars"); // 2 cards -> first
  assert.equal(g[0].list[0].name, "Charizard VMAX"); // $55 before $12
});

test("progressive disclosure: small groups show in full, large groups collapse to 4", () => {
  assert.equal(visibleCount(3), 3);
  assert.equal(visibleCount(ALWAYS_FULL_UP_TO), ALWAYS_FULL_UP_TO); // 6 -> full
  assert.equal(visibleCount(13), INITIAL_PER_LARGE_GROUP); // 13 -> 4
  assert.equal(visibleCount(13, { open: true }), 13);
  assert.equal(visibleCount(13, { expandAll: true }), 13);
});

test("distinctSorted builds clean filter options from real data only", () => {
  assert.deepEqual(distinctSorted(cards, "set"), ["Base Set", "Brilliant Stars", "Obsidian Flames", "Team Rocket"]);
  assert.deepEqual(distinctSorted(cards, "rarity"), ["Double Rare", "Holo Rare", "Ultra Rare"]);
});
