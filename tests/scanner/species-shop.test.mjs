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
  flatVisible,
  distinctSorted,
  isSpecialtyCard,
  cardTier,
  DEFAULT_SORT,
  INITIAL_PER_LARGE_GROUP,
  INITIAL_FLAT,
  FLAT_STEP,
  ALWAYS_FULL_UP_TO,
  SORTS,
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

// ---------- set-page (flat, single-set) progressive disclosure ----------
test("flatVisible: a small set shows everything; a large set shows INITIAL_FLAT then grows", () => {
  assert.equal(flatVisible(10), 10); // under the threshold -> all
  assert.equal(flatVisible(INITIAL_FLAT), INITIAL_FLAT);
  assert.equal(flatVisible(567), INITIAL_FLAT); // 567-card set: NOT a dump
  assert.equal(flatVisible(567, INITIAL_FLAT + FLAT_STEP), INITIAL_FLAT + FLAT_STEP); // after "Show more"
  assert.equal(flatVisible(567, 999), 567); // "Show all" clamps to total
  assert.equal(flatVisible(567, 5), INITIAL_FLAT); // never below the initial window
  assert.ok(INITIAL_FLAT < 60, "initial window is a scannable first screen, not hundreds");
});

test("set toolbar exposes exactly the four required sorts, Highest price default", () => {
  assert.deepEqual(Object.keys(SORTS), ["value_desc", "value_asc", "number", "name"]);
  assert.deepEqual(
    Object.values(SORTS).map((s) => s.label),
    ["Highest price", "Lowest price", "Card number", "Name A–Z"]
  );
  assert.equal(DEFAULT_SORT, "value_desc"); // large catalogue -> value-first discovery
});

test("card-number order is preserved as an explicit sort option", () => {
  const s = sortCards(cards, "number").map((c) => c.cardNumber);
  assert.equal(s[0], "4/102"); // 4
  assert.equal(s[1], "4/82"); // 4 (tie -> name)
});

// ---------- relevance tier (Jumbo / oversized / WCD specialty) ----------
const jumboCz = { name: "Charizard EX - XY121", set: "Jumbo Cards", cardNumber: "XY121", rarity: "Promo", refPrice: 210 };
const wcdCz = { name: "Charizard - 2016 (Some Player)", set: "World Championship Decks", cardNumber: "11/108", rarity: "Rare", refPrice: 40 };
const boxTopper = { name: "Charizard - S1/S4 (Box Topper)", set: "Jumbo Cards", cardNumber: "S1/S4", rarity: "Promo", refPrice: 500 };
const stdLow = { name: "Charizard", set: "XY - Evolutions", cardNumber: "11/108", rarity: "Rare Holo", refPrice: 8 };
const stdHigh = { name: "Charizard", set: "Base Set (Shadowless)", cardNumber: "4/102", rarity: "Holo Rare", refPrice: 2000 };
// a normal Trainer named "Jumbo Ice Cream" must NOT be classified specialty
const jumboIceCream = { name: "Jumbo Ice Cream", set: "ME04: Chaos Rising", cardNumber: "109/086", rarity: "Ultra Rare", refPrice: 4 };

test("isSpecialtyCard: Jumbo / WCD sets + parenthetical size markers -> true; normal cards -> false", () => {
  assert.equal(isSpecialtyCard(jumboCz), true);
  assert.equal(isSpecialtyCard(wcdCz), true);
  assert.equal(isSpecialtyCard(boxTopper), true);
  assert.equal(isSpecialtyCard(stdHigh), false);
  assert.equal(isSpecialtyCard({ name: "Charizard V", set: "Champions Path", rarity: "Gold Secret Rare", refPrice: 300 }), false); // Gold != specialty
  assert.equal(isSpecialtyCard({ name: "Charizard ex - 199/165", set: "SV: 151", rarity: "Special Illustration Rare", refPrice: 400 }), false); // SIR != specialty
  assert.equal(isSpecialtyCard(jumboIceCream), false); // a normal Trainer that merely contains "jumbo" in its name
});

test("1. default sort: a normal card outranks a Jumbo even when the Jumbo is worth more", () => {
  const cards = [jumboCz, stdLow]; // jumbo $210 vs standard $8
  const ranked = sortCards(cards, DEFAULT_SORT, { relevanceTier: true }).map((c) => c.name);
  assert.deepEqual(ranked, ["Charizard", "Charizard EX - XY121"]); // standard first
});

test("4. an EXPLICIT sort is honoured literally - no tier reshuffle", () => {
  const cards = [jumboCz, stdLow, boxTopper];
  // Highest price WITHOUT relevanceTier (i.e. user picked it explicitly): pure price
  assert.deepEqual(
    sortCards(cards, "value_desc", { relevanceTier: false }).map((c) => c.name),
    ["Charizard - S1/S4 (Box Topper)", "Charizard EX - XY121", "Charizard"]
  );
  // Card number / Name A-Z never tier-split (CatalogueBrowser passes relevanceTier:false for them)
  assert.equal(sortCards(cards, "name").map((c) => c.name)[0], "Charizard"); // alphabetical, jumbo not demoted
});

test("5. featured-value ordering puts standard collectible cards first", () => {
  const pool = [jumboCz, wcdCz, boxTopper, stdHigh, stdLow];
  const featured = [...pool]
    .filter((c) => c.refPrice > 0)
    .sort((a, b) => cardTier(a) - cardTier(b) || Number(b.refPrice) - Number(a.refPrice))
    .slice(0, 12)
    .map((c) => c.name);
  // both standard cards, high then low, THEN the specialty ones by price
  assert.deepEqual(featured, [
    "Charizard", // $2000 Shadowless
    "Charizard", // $8 Evolutions
    "Charizard - S1/S4 (Box Topper)", // $500
    "Charizard EX - XY121", // $210
    "Charizard - 2016 (Some Player)", // $40
  ]);
});

test("6. a species with NO specialty cards sorts/groups exactly as before", () => {
  const normal = [
    { name: "Houndoom", set: "Skyridge", cardNumber: "H11", rarity: "Holo Rare", refPrice: 1000 },
    { name: "Houndoom", set: "Neo Revelation", cardNumber: "10/64", rarity: "Holo Rare", refPrice: 336 },
    { name: "Houndoom (Prime)", set: "Undaunted", cardNumber: "87/90", rarity: "Prime", refPrice: 243 },
  ];
  assert.deepEqual(
    sortCards(normal, DEFAULT_SORT, { relevanceTier: true }).map((c) => c.refPrice),
    sortCards(normal, DEFAULT_SORT, { relevanceTier: false }).map((c) => c.refPrice)
  );
  const groups = groupBySet(normal);
  assert.ok(groups.every((g) => g.specialtyOnly === false));
});

test("2/3. specialty cards remain in the data set and are searchable", () => {
  const all = [stdHigh, jumboCz, boxTopper, wcdCz];
  // groupBySet keeps every group, just sinks the specialty-only ones
  const groups = groupBySet(all);
  assert.equal(groups.length, 3); // Base Set (Shadowless), Jumbo Cards, World Championship Decks
  assert.equal(groups[0].set, "Base Set (Shadowless)"); // standard first
  assert.equal(groups[groups.length - 1].specialtyOnly, true); // a specialty group is last
  // search still finds them
  assert.equal(filterCards(all, { q: "jumbo" }).length, 2); // both "Jumbo Cards" set cards
  assert.equal(filterCards(all, { q: "box topper" }).length, 1);
  assert.equal(filterCards(all, { q: "championship" }).length, 1);
});
