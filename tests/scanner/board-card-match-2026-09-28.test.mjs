// 28 Sep 2026 - imported board rows tied to a catalogue printing and shown
// on that card's page. Owner: "yes" to board rows on the individual card
// pages, after "It should feed all through the site".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const require = createRequire(import.meta.url);
const bcm = require("../../lib/boardCardMatch.js");
const bd = require("../../lib/boardDeals.js");

const CATALOG = [
  { tcgplayer_id: "1", name: "Togepi - 56/105", set: "Neo Destiny", card_number: "56/105", language: "english" },
  { tcgplayer_id: "2", name: "Umbreon V - 189/203", set: "SWSH07: Evolving Skies", card_number: "189/203", language: "english" },
  { tcgplayer_id: "3", name: "Regirock ex - 98/101", set: "EX Hidden Legends", card_number: "98/101", language: "english" },
  { tcgplayer_id: "4", name: "Charizard - 4/102", set: "Base Set", card_number: "4/102", language: "english" },
  { tcgplayer_id: "5", name: "Charizard - 4/102", set: "Base Set (Shadowless)", card_number: "4/102", language: "english" },
  { tcgplayer_id: "6", name: "Groudon - 17/25", set: "Celebrations", card_number: "17/25", language: "english" },
  { tcgplayer_id: "7", name: "Minccino - SV093/SV122", set: "SWSH: Shining Fates Shiny Vault", card_number: "SV093/SV122", language: "english" },
  { tcgplayer_id: "8", name: "Reshiram - 20/108", set: "SM - Cosmic Eclipse", card_number: "20/108", language: "english" },
  { tcgplayer_id: "9", name: "Pikachu - 25/102", set: "Base Set", card_number: "25/102", language: "japanese" },
];

test("BM-1 set keys: the era code, the dash prefix and a leading EX are dropped; the year the boards add is dropped", () => {
  assert.deepEqual(bcm.catalogSetKeys("SWSH07: Evolving Skies"), ["swsh07 evolving skies", "evolving skies"]);
  assert.ok(bcm.catalogSetKeys("EX Hidden Legends").includes("hidden legends"));
  assert.ok(bcm.catalogSetKeys("SM - Cosmic Eclipse").includes("cosmic eclipse"));
  assert.equal(bcm.normSet("Neo Destiny (2002)"), "neo destiny");
  assert.equal(bcm.normSet("Gym Heroes (Japanese)"), "gym heroes");
  assert.equal(bcm.boardLanguage("Gym Heroes (Japanese)"), "japanese");
  assert.equal(bcm.boardLanguage("Gym Heroes (2000)"), "english");
});

test("BM-2 the number comes from the board name first, then the title; letters kept, leading zeros dropped", () => {
  assert.equal(bcm.boardNumber("Togepi #56", "Togepi 56/105 Neo Destiny"), "56");
  assert.equal(bcm.boardNumber("Togepi", "Togepi 056/105 Neo Destiny"), "56");
  assert.equal(bcm.boardNumber("Minccino #SV093", ""), "SV93");
  assert.equal(bcm.boardNumber("Zygarde GX #SV65", ""), "SV65");
  assert.equal(bcm.boardNumber("Mimikyu VMAX #TG17", ""), "TG17");
  assert.equal(bcm.boardNumber("Charizard VMAX", "Charizard VMAX Champions Path Holo"), null);
});

test("BM-3 one printing survives set + number + name + language, or there is no match", () => {
  const index = bcm.buildCatalogMatchIndex(CATALOG);
  const m = (set, name, title = "") => bcm.matchBoardRecord({ set, name, title }, index)?.tcgplayerId ?? null;
  assert.equal(m("Neo Destiny (2002)", "Togepi #56", "Togepi 56/105 Neo Destiny Regular NM"), "1");
  assert.equal(m("Evolving Skies (2021)", "Umbreon V #189"), "2", "era code stripped from the catalogue set");
  assert.equal(m("Hidden Legends (2004)", "Regirock EX #98"), "3", "EX prefix stripped; ex/EX case ignored");
  assert.equal(m("Cosmic Eclipse (2019)", "Reshiram #20"), "8", "dash prefix stripped");
  assert.equal(m("Shining Fates (2021)", "Minccino #SV093"), null, "the Shiny Vault is its own catalogue set: no guess");
  assert.equal(m("Base Set (1999)", "Charizard #4"), "4", "'(Shadowless)' is part of the catalogue set key, so the plain Base Set row is the one match");
  assert.equal(m("Celebrations (2021)", "Umbreon #17"), null, "name guard: the boards' #17 is not the catalogue's Groudon");
  assert.equal(m("Base Set (Japanese)", "Pikachu #25"), "9", "a Japanese board set matches only a Japanese row");
  assert.equal(m("Base Set (1999)", "Pikachu #25"), null, "and an English one never takes the Japanese row");
  assert.equal(m("Nowhere Set", "Togepi #56"), null);
  assert.equal(m("Neo Destiny (2002)", "", ""), null);
});

test("BM-4 stampCatalogMatches: never-attempted rows only, sealed skipped, the overlay wins, result carries at", async () => {
  const fakeDb = {
    from: () => ({ select: () => ({ order: () => ({ range: async (from) => ({ data: from === 0 ? CATALOG : [], error: null }) }) }) }),
  };
  const records = new Map([
    ["EBAY_US:1", { marketplace: "EBAY_US", itemId: "1", set: "Neo Destiny (2002)", name: "Togepi #56", title: "", variant: "Raw" }],
    ["EBAY_US:2", { marketplace: "EBAY_US", itemId: "2", set: "Neo Destiny (2002)", name: "Togepi #56", title: "", variant: "Raw", card: { tcgplayerId: "1", at: "x" } }],
    ["EBAY_US:3", { marketplace: "EBAY_US", itemId: "3", set: "Neo Destiny (2002)", name: "Booster Box", title: "", variant: "Sealed" }],
    ["EBAY_US:4", { marketplace: "EBAY_US", itemId: "4", set: "Nowhere", name: "Togepi #56", title: "", variant: "Raw" }],
  ]);
  const overlay = new Map([["EBAY_US:4", { marketplace: "EBAY_US", itemId: "4", set: "Neo Destiny (2002)", name: "Togepi #56", title: "", variant: "Raw" }]]);
  const out = await bcm.stampCatalogMatches(fakeDb, records, { overlay, now: "2026-09-28T05:00:00.000Z" });
  assert.equal(out.attempted, 2, "row 2 already stamped, row 3 sealed");
  assert.equal(out.matched, 2, "row 4 matched through the overlay's corrected set");
  assert.deepEqual(out.changed.map((r) => [r.itemId, r.card.tcgplayerId, r.card.at]), [["1", "1", "2026-09-28T05:00:00.000Z"], ["4", "1", "2026-09-28T05:00:00.000Z"]]);
  const none = await bcm.stampCatalogMatches(fakeDb, new Map([["k", { card: { tcgplayerId: null, at: "x" } }]]), {});
  assert.equal(none.attempted, 0, "a tried-and-unmatched row is not retried");
});

test("BM-5 the render shape and the filter carry the catalogue id; unstamped rows never match a card", () => {
  const shape = bd.toRenderShape({ marketplace: "EBAY_US", itemId: "9", card: { tcgplayerId: "42", at: "x" }, captured: { discountPct: 0.2 } });
  assert.equal(shape.cardTcgplayerId, "42");
  assert.equal(bd.toRenderShape({ marketplace: "EBAY_US", itemId: "9", captured: { discountPct: 0.2 } }).cardTcgplayerId, null);
  const rows = [
    { id: "a", marketplace: "EBAY_US", variant: "Raw", format: "BIN", cardTcgplayerId: "42" },
    { id: "b", marketplace: "EBAY_GB", variant: "Raw", format: "BIN", cardTcgplayerId: 42 },
    { id: "c", marketplace: "EBAY_US", variant: "Raw", format: "BIN", cardTcgplayerId: null },
    { id: "d", marketplace: "EBAY_US", variant: "Raw", format: "BIN" },
  ];
  assert.deepEqual(bd.filterBoardDeals(rows, { card: "42" }).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(bd.filterBoardDeals(rows, { card: null }).map((r) => r.id), ["a", "b", "c", "d"]);
});

test("BM-6 wiring: capture stamps, index carries the id, both card views show the section without Offer schema or a source name", () => {
  const cap = read("scripts/boards/captureJimmy.mjs");
  assert.match(cap, /bcm\.stampCatalogMatches\(db, records, \{ overlay: changedAll, now: runNow \}\)/);
  assert.match(cap, /bd\.saveBoardDealRecords\(db, stamp\.changed\)/);
  const feed = read("lib/boardDealsFeed.js");
  assert.match(feed, /cardTcgplayerId: d\.cardTcgplayerId \?\? null/);
  assert.match(feed, /\["board-deals-index-v3"\]/);
  assert.match(feed, /filterBoardDeals\(index, \{ market, kind, format, maxPriceUsd, card \}\)/);
  const section = read("components/BoardDealsSection.js");
  assert.match(section, /card = null, id = "board-deals", headingStyle = "page", showSeeAll = true \}\)/);
  assert.match(section, /\{showSeeAll && total > items\.length \? \(/);
  const hub = read("app/cards/[slug]/page.js");
  assert.match(hub, /<BoardDealsSection page="card" card=\{hub\.tcgplayerId\} limit=\{8\} heading="More listings of this card on eBay" id="more-card-listings" headingStyle="sub" showSeeAll=\{false\} \/>/);
  assert.ok(hub.indexOf('id="card-offers"') < hub.indexOf('id="more-card-listings"'), "below our checked listings");
  const cat = read("components/CatalogCardView.js");
  assert.match(cat, /<BoardDealsSection page="card" card=\{card\.tcgplayerId\} limit=\{8\} heading="Listings of this card on eBay" id="more-card-listings" headingStyle="sub" showSeeAll=\{false\} \/>/);
  for (const [name, src] of [["hub", hub], ["catalogue view", cat], ["section", section]]) {
    assert.doesNotMatch(src, /pokedealfinder|jimmy/i, `the source is never named (${name})`);
  }
  // the section is a plain list: no JSON-LD is built from board rows anywhere
  assert.doesNotMatch(read("lib/jsonLd.js"), /boardDeal|BoardDeal/);
});
