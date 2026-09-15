// crossmatch-price-pilot-r1 - the REAL tier=allocated route offline over one
// synthetic fixture (not production evidence), pilot off vs on.
//   node --import ./tests/harness/ingestion/register.mjs tests/harness/ingestion/crossmatchPilot.mjs <off|on|insufficient|fail|fail-mid>
//
// Fixture: 71 English Base Set cards. ?targets=60: the allocator puts the 50
// most overdue cards (0-49) in the least-recently-searched lane and the next
// 10 (50-59) in the exploit lane (card 50 = lowest score); cards 60-70 were
// searched yesterday and are not targeted. Every search returns the same page:
//   card 0 new listing, card 1 stored active (re-sighting), card 50 (exploit tail) new listing
//   card 55 listing (a target's identity: never a pilot candidate)
//   card 60 two unstored listings + an old active stored listing of card 60 (must never be expired by the pilot)
//   cards 61, 62 one unstored listing each
//   card 63 unstored, but a concurrent writer inserts it just before the pilot's insert
//   card 64 stored on EBAY_GB only                -> excluded (stored on another marketplace)
//   card 65 stored EBAY_US identity quarantine    -> excluded (held, never revived)
//   card 66 graded slab                            -> excluded (raw only)
//   card 67 priced above its catalogue price       -> not worth a substitution
//   card 68 title matching two printings (68, 70)  -> ambiguous, excluded
//   card 69 unstored listing, no provider price    -> substitution attempted, no usable reference
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createMemoryDb } from "./memoryDb.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const mode = process.argv[2] ?? "off";
process.env.CRON_SECRET = "harness";
delete process.env.BROWSE_BUDGET_MODE;
process.env.CROSSMATCH_OBSERVE = "on";
if (mode === "off") delete process.env.CROSSMATCH_PRICE_PILOT;
else process.env.CROSSMATCH_PRICE_PILOT = "on";

const pilotModule = require(join(REPO, "lib", "crossMatchPricingPilot.js"));
if (mode === "fail") {
  pilotModule.rankPilotCards = () => {
    throw new Error("injected ranking failure");
  };
}
if (mode === "fail-mid") {
  const realRank = pilotModule.rankPilotCards;
  pilotModule.rankPilotCards = (...args) => {
    const r = realRank(...args);
    let reads = 0;
    const poisoned = { ...r.ranked[1], identity: r.ranked[1].identity, row: r.ranked[1].row };
    Object.defineProperty(poisoned, "listings", { get() { if (++reads > 0) throw new Error("injected mid-pilot failure"); return []; } });
    return { ...r, ranked: [r.ranked[0], poisoned, ...r.ranked.slice(2)] };
  };
}

const NAMES = ["Alakazam", "Blastoise", "Chansey", "Charizard", "Clefairy", "Gyarados", "Hitmonchan", "Machamp", "Magneton", "Mewtwo", "Nidoking", "Ninetales", "Poliwrath", "Raichu", "Venusaur", "Zapdos", "Beedrill", "Dragonair", "Dugtrio", "Electabuzz", "Electrode", "Pidgeotto", "Arcanine", "Charmeleon", "Dewgong", "Dratini", "Growlithe", "Haunter", "Ivysaur", "Jynx", "Kadabra", "Kakuna", "Machoke", "Magikarp", "Magmar", "Nidorino", "Poliwhirl", "Porygon", "Raticate", "Seel", "Wartortle", "Abra", "Bulbasaur", "Caterpie", "Charmander", "Diglett", "Doduo", "Drowzee", "Gastly", "Koffing", "Machop", "Magnemite", "Metapod", "Onix", "Pidgey", "Pikachu", "Ponyta", "Rattata", "Sandshrew", "Squirtle", "Weedle", "Starmie", "Staryu", "Tangela", "Voltorb", "Seaking", "Goldeen", "Horsea", "Vulpix", "Grimer", "Tentacool"];
const DAY = 86_400_000;
const NOW = Date.now();
const cardId = (i) => `x-${String(i).padStart(2, "0")}`;
const watchlist = NAMES.map((name, i) => ({ id: `w${i}`, name, set: "Base Set", justtcg_tcgplayer_id: cardId(i), active: true, language: "english", tier: "extended", last_known_price: 400 }));
// card 68 and 70: one card name, two printings (Base Set / Base Set (Shadowless)) sharing a number -> ambiguous title
watchlist[70] = { ...watchlist[70], name: "Vulpix", set: "Base Set (Shadowless)" };
const numberOf = (i) => (i === 70 ? "069/102" : `${String(i + 1).padStart(3, "0")}/102`);
const catalog = watchlist.map((w, i) => ({ tcgplayer_id: w.justtcg_tcgplayer_id, name: w.name, set: w.set, card_number: numberOf(i), market_price: i === 69 ? null : 400, language: "english" }));

const state = watchlist.map((w, i) => {
  const daysAgo = i < 50 ? 60 + (49 - i) : i < 60 ? 20 + (i - 50) : 1;
  return { card_tcgplayer_id: w.justtcg_tcgplayer_id, marketplace: "EBAY_US", last_searched_at: new Date(NOW - daysAgo * DAY).toISOString(), searches_total: 5, searches_since_deal: 5, consecutive_no_new: 0, last_unique_listings: 1 };
});

const L = (legacy, title, extra = {}) => {
  const url = `https://www.ebay.com/itm/${legacy}`;
  return {
    listingId: `v1|${legacy}|${extra.variation ?? 0}`, marketplace: "EBAY_US", title,
    imageUrl: "https://i.ebayimg.com/images/g/x/s-l1600.jpg", imageUrls: ["https://i.ebayimg.com/images/g/x/s-l1600.jpg"],
    listingUrl: url, affiliateUrl: url, listingType: "FIXED_PRICE", price: extra.price ?? 150, shipping: 0, currency: "USD",
    itemLocationCountry: "US", bidCount: 0, auctionEndAt: null, isGraded: Boolean(extra.grader),
    condition: extra.grader ? "Graded" : "Ungraded",
    conditionDescriptors: extra.grader ? [{ name: "Professional Grader", values: [{ content: extra.grader }] }, { name: "Grade", values: [{ content: extra.grade }] }] : [{ name: "Card Condition", values: [{ content: "Near mint or better" }] }],
    localizedAspects: [{ name: "Language", value: "English" }], soldOut: false, sellerUsername: "harness-seller", sellerFeedbackPct: 100, sellerFeedbackScore: 5000,
  };
};
const t = (i, extra = "") => `${watchlist[i].name} ${i + 1}/102 Base Set Holo Rare Pokemon Card${extra}`;
const full = [
  L("820000000000", t(0)),
  L("820000000001", t(1)),
  L("820000000050", t(50)),
  L("820000000055", t(55)),
  L("820000000060", t(60)),
  L("820000000160", `${watchlist[60].name} 61/102 Base Set Holo Pokemon Card Near Mint`),
  L("820000000061", t(61)),
  L("820000000062", t(62)),
  L("820000000063", t(63)),
  L("820000000064", t(64)),
  L("820000000065", t(65)),
  L("820000000066", `${watchlist[66].name} 67/102 Base Set Holo PSA 9`, { grader: "PSA", grade: "9" }),
  L("820000000067", t(67), { price: 390 }),
  L("820000000068", "Vulpix 69/102 Base Set Shadowless Holo Rare Pokemon Card"),
  L("820000000069", t(69)),
];
const insufficient = full.filter((l) => !/82000000006[0-3]|820000000160|820000000069/.test(l.listingId));
const page = mode === "insufficient" ? insufficient : full;
const CONCURRENT = "v1|820000000063|0";

const stored = (id, legacy, marketplace, extra) => ({ id, source: "ebay", marketplace, listing_id: `v1|${legacy}|0`, title: "stored", is_active: false, disqualified_reason: null, first_seen_at: "2026-09-01T00:00:00.000Z", last_seen_at: new Date(NOW - 3 * 3600_000).toISOString(), ...extra });
const deals = [
  stored(9101, "820000000001", "EBAY_US", { is_active: true, watchlist_id: "w1", card_tcgplayer_id: cardId(1) }),
  stored(9160, "820000009960", "EBAY_US", { is_active: true, watchlist_id: "w60", card_tcgplayer_id: cardId(60), last_seen_at: new Date(NOW - 5 * DAY).toISOString(), title: "old card 60 listing" }),
  stored(9164, "820000000064", "EBAY_GB", { is_active: true, watchlist_id: "w64", card_tcgplayer_id: cardId(64) }),
  stored(9165, "820000000065", "EBAY_US", { disqualified_reason: "identity:collector_number_conflict", watchlist_id: "w-other", card_tcgplayer_id: "x-other" }),
];

const db = createMemoryDb({ watchlist, card_catalog: catalog, deals, discovery_events: [], ebay_job_runs: [], scan_target_state: state, scan_allocation_runs: [], catalog_snapshot: [], deal_images: [] }, { unique: { catalog_snapshot: ["kind"] } });
const realFrom = db.from.bind(db);
const concurrent = { inserted: false };
db.from = (table) => {
  const chain = realFrom(table);
  if (table !== "deals") return chain;
  const upsert = chain.upsert;
  chain.upsert = (values, opts) => {
    // a concurrent sweep creates the same listing between the pilot's recheck and its insert
    if (mode !== "off" && opts?.ignoreDuplicates && values?.listing_id === CONCURRENT && !concurrent.inserted) {
      concurrent.inserted = true;
      db.tables.deals.push({ id: 9999, source: "ebay", marketplace: "EBAY_US", listing_id: CONCURRENT, watchlist_id: "sweep-writer", card_tcgplayer_id: cardId(63), is_active: true, disqualified_reason: null, first_seen_at: "2026-09-15T08:00:00.000Z", market_price: 777, title: "written by the concurrent sweep" });
    }
    return upsert(values, opts);
  };
  return chain;
};

const harness = {
  calls: {},
  calledFor: { getConditionPrices: [], searchListings: [] },
  gradedPriceRequests: [],
  db,
  feedItems: [],
  listingsFor: ({ query }) => { harness.calledFor.searchListings.push(query); return page.map((l) => ({ ...l })); },
  gradingFor: () => ({ grader: "PSA", grade: "9" }),
  rawReferenceFor: (id) => { harness.calledFor.getConditionPrices.push(id); return catalog.find((c) => c.tcgplayer_id === id)?.market_price ?? null; },
  gradedReferenceFor: () => 300,
};
globalThis.__ingestHarness = harness;

const stateBefore = JSON.parse(JSON.stringify(db.tables.scan_target_state));
const mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
const res = await mod.GET(new Request("http://harness/api/refresh-deals?tier=allocated&country=EBAY_US&targets=60", { headers: { authorization: "Bearer harness" } }));
const body = await res.json();
const byCard = (rows) => Object.fromEntries(rows.map((r) => [r.card_tcgplayer_id, r]));
const before = byCard(stateBefore);
const after = byCard(db.tables.scan_target_state);
process.stdout.write(JSON.stringify({
  mode,
  status: res.status,
  response: body,
  calls: harness.calls,
  priceLookupsFor: harness.calledFor.getConditionPrices,
  searchesFor: harness.calledFor.searchListings,
  dealsAfter: db.tables.deals.map((d) => ({ id: d.id, listing_id: d.listing_id, marketplace: d.marketplace, watchlist_id: d.watchlist_id, card: d.card_tcgplayer_id, is_active: d.is_active, reason: d.disqualified_reason, first_seen_at: d.first_seen_at ?? null, market_price: d.market_price, title: d.title })),
  dealWrites: db.writes.filter((w) => w.table === "deals").map((w) => ({ op: w.op, listing_id: w.row.listing_id, watchlist_id: w.row.watchlist_id, values: w.values ?? null })),
  discoveryEvents: db.tables.discovery_events.map((e) => ({ listing: e.listing_key ?? e.listing_id, search_type: e.search_type, card: e.card_tcgplayer_id })),
  stateChanged: Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort(),
  jobRuns: db.tables.ebay_job_runs.length,
  allocationRuns: db.tables.scan_allocation_runs.length,
  observationRecords: db.tables.catalog_snapshot.filter((r) => String(r.kind).startsWith("crossmatch_observation:")).map((r) => ({ pilot: r.data.pilot ?? null })),
}, null, 1));
