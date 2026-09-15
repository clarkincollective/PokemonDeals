// crossmatch-shadow-r1 - runs the REAL tier=allocated route offline over one
// synthetic fixture (clearly labelled, not production evidence).
//   node --import ./tests/harness/ingestion/register.mjs tests/harness/ingestion/crossmatch.mjs <on|off|fail-internal|fail-hard>
// Prints one JSON document: provider calls, every database write (observation
// rows separated), the response, and the observation record.
//
// Fixture: two never-searched targets the allocator must pick (Charizard,
// Venusaur) and watched cards it must not (recently searched). Every search
// returns the same result page, so the second search repeats the first.
// The Charizard target has a raw listing and a PSA 8 slab (normal graded
// lookup + reference); the Venusaur target's listing is stored
// availability:sold, so normal processing blocks it. The page also holds:
//   - Blastoise, never stored                        -> unique, never stored
//   - Machamp, stored ACTIVE on EBAY_US               -> unique, active
//   - Ninetales, stored with identity:* reason under
//     a different printing                             -> unique, quarantined/held
//   - Gyarados PSA 8 slab, never stored               -> unique graded, needs a grading lookup
//   - Raichu, stored availability:sold                -> unique, availability-retired
//   - Zapdos, stored on EBAY_GB only                  -> unique, never stored on EBAY_US (not new)
//   - Clefairy 5/102 slab matching two printings     -> ambiguous (graded)
//   - Chansey variation 0 and variation 7 (same item) -> two distinct item/marketplace keys
//   - a keychain naming Charizard                      -> rejected before identity
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createMemoryDb } from "./memoryDb.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const mode = process.argv[2] ?? "on";
process.env.CRON_SECRET = "harness";
if (mode === "off") process.env.CROSSMATCH_OBSERVE = "off";
else delete process.env.CROSSMATCH_OBSERVE;

// Failure injection happens by wrapping the observer module's export before
// the route is imported (same CommonJS instance); production code is untouched.
if (mode === "fail-internal" || mode === "fail-hard") {
  const obsModule = require(join(REPO, "lib", "crossMatchObservation.js"));
  const realCreate = obsModule.createCrossMatchObserver;
  obsModule.createCrossMatchObserver = (args) => {
    const o = realCreate(args);
    if (mode === "fail-internal") {
      // the index lookup throws part-way through the first search
      const realSetIndex = o.setIndex;
      let n = 0;
      o.setIndex = (fn) => realSetIndex((l) => { if (++n > 3) throw new Error("injected index failure"); return fn(l); });
      return o;
    }
    return {
      ...o,
      observe: () => { throw new Error("injected observe throw"); },
      finalize: async () => { throw new Error("injected finalize rejection"); },
    };
  };
}

const W = (id, name, set, extra = {}) => ({ id, name, set, justtcg_tcgplayer_id: `x-${id}`, active: true, language: "english", tier: "extended", last_known_price: null, ...extra });
const watchlist = [
  W("char", "Charizard", "Base Set"),
  W("venu", "Venusaur", "Base Set"),
  W("blast", "Blastoise", "Base Set"),
  W("mach", "Machamp", "Base Set"),
  W("nine", "Ninetales", "Base Set"),
  W("rai", "Raichu", "Base Set"),
  W("zap", "Zapdos", "Base Set"),
  W("chan", "Chansey", "Base Set"),
  W("gyar", "Gyarados", "Base Set"),
  W("clef1", "Clefairy", "Base Set"),
  W("clef2", "Clefairy", "Base Set (Shadowless)"),
];
const numbers = { char: "004/102", venu: "015/102", blast: "002/102", mach: "008/102", nine: "012/102", rai: "014/102", zap: "016/102", chan: "003/102", gyar: "006/102", clef1: "005/102", clef2: "005/102" };
const catalog = watchlist.map((w) => ({ tcgplayer_id: w.justtcg_tcgplayer_id, name: w.name, set: w.set, card_number: numbers[w.id], market_price: 400, language: "english" }));

const L = (legacy, title, extra = {}) => {
  const url = `https://www.ebay.com/itm/${legacy}`;
  return {
    listingId: `v1|${legacy}|${extra.variation ?? 0}`,
    marketplace: "EBAY_US",
    title,
    imageUrl: "https://i.ebayimg.com/images/g/x/s-l1600.jpg",
    imageUrls: ["https://i.ebayimg.com/images/g/x/s-l1600.jpg"],
    listingUrl: url,
    affiliateUrl: url,
    listingType: "FIXED_PRICE",
    price: extra.price ?? 150,
    shipping: 0,
    currency: "USD",
    itemLocationCountry: "US",
    bidCount: 0,
    auctionEndAt: null,
    isGraded: Boolean(extra.grader),
    condition: extra.grader ? "Graded" : "Ungraded",
    conditionDescriptors: extra.grader
      ? [{ name: "Professional Grader", values: [{ content: extra.grader }] }, { name: "Grade", values: [{ content: extra.grade }] }]
      : [{ name: "Card Condition", values: [{ content: "Near mint or better" }] }],
    localizedAspects: [{ name: "Language", value: "English" }],
    soldOut: false,
    sellerUsername: "harness-seller",
    sellerFeedbackPct: 100,
    sellerFeedbackScore: 5000,
  };
};
const page = [
  L("810000000001", "Charizard 4/102 Base Set Holo Rare Pokemon Card"),
  L("810000000002", "Venusaur 15/102 Base Set Holo Rare Pokemon Card"),
  L("810000000003", "Blastoise 2/102 Base Set Holo Rare Pokemon Card"),
  L("810000000004", "Machamp 8/102 Base Set Holo Rare Pokemon Card"),
  L("810000000005", "Ninetales 12/102 Base Set Holo Rare Pokemon Card"),
  L("810000000006", "Raichu 14/102 Base Set Holo Rare Pokemon Card"),
  L("810000000007", "Zapdos 16/102 Base Set Holo Rare Pokemon Card"),
  L("810000000008", "Clefairy 5/102 Base Set (Shadowless) Holo - CGC 5.5 EX+", { grader: "CGC", grade: "5.5" }),
  L("810000000009", "Chansey 3/102 Base Set Holo Rare Pokemon Card"),
  L("810000000009", "Chansey 3/102 Base Set Holo Rare Pokemon Card", { variation: 7 }),
  L("810000000010", "Charizard Base Set Pokemon Novelty Keychain"),
  L("810000000011", "Gyarados 6/102 Base Set Holo PSA 8", { grader: "PSA", grade: "8" }),
  L("810000000012", "Charizard 4/102 Base Set Holo PSA 8", { grader: "PSA", grade: "8" }),
];
const stored = (id, legacy, marketplace, extra) => ({ id, source: "ebay", marketplace, listing_id: `v1|${legacy}|0`, title: "stored", is_active: false, disqualified_reason: null, last_seen_at: "2026-09-01T00:00:00Z", ...extra });
const deals = [
  stored(9001, "810000000004", "EBAY_US", { is_active: true, watchlist_id: "mach", card_tcgplayer_id: "x-mach" }),
  stored(9002, "810000000005", "EBAY_US", { disqualified_reason: "identity:collector_number_conflict", watchlist_id: "other", card_tcgplayer_id: "x-other-printing" }),
  stored(9003, "810000000006", "EBAY_US", { disqualified_reason: "availability:sold", watchlist_id: "rai", card_tcgplayer_id: "x-rai" }),
  stored(9004, "810000000007", "EBAY_GB", { is_active: true, watchlist_id: "zap", card_tcgplayer_id: "x-zap" }),
  // the Venusaur target's own listing was verifier-retired: normal processing blocks it
  stored(9005, "810000000002", "EBAY_US", { disqualified_reason: "availability:sold", watchlist_id: "venu", card_tcgplayer_id: "x-venu" }),
];
const recent = new Date(Date.now() - 3600_000).toISOString();
const scanTargetState = watchlist
  .filter((w) => w.id !== "char" && w.id !== "venu")
  .map((w) => ({ card_tcgplayer_id: w.justtcg_tcgplayer_id, marketplace: "EBAY_US", last_searched_at: recent, searches_total: 3, searches_since_deal: 3, consecutive_no_new: 0, last_unique_listings: 1 }));

const harness = {
  calls: {},
  gradedPriceRequests: [],
  db: createMemoryDb({ watchlist, card_catalog: catalog, deals, discovery_events: [], ebay_job_runs: [], scan_target_state: scanTargetState, scan_allocation_runs: [], catalog_snapshot: [], deal_images: [] }),
  feedItems: [],
  listingsFor: () => page.map((l) => ({ ...l })),
  gradingFor: (listingId) => {
    const l = page.find((x) => x.listingId === listingId);
    const d = Object.fromEntries((l?.conditionDescriptors ?? []).map((c) => [c.name, c.values[0].content]));
    return { grader: d["Professional Grader"] ?? null, grade: d.Grade ?? null };
  },
  rawReferenceFor: (id) => catalog.find((c) => c.tcgplayer_id === id)?.market_price ?? null,
  gradedReferenceFor: () => 300,
};
globalThis.__ingestHarness = harness;

const mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
const res = await mod.GET(new Request("http://harness/api/refresh-deals?tier=allocated&country=EBAY_US&targets=2", { headers: { authorization: "Bearer harness" } }));
const body = await res.json();
const isObservation = (w) => w.table === "catalog_snapshot" && String(w.row?.kind ?? "").startsWith("crossmatch_observation:");
process.stdout.write(
  JSON.stringify(
    {
      mode,
      status: res.status,
      response: body,
      calls: harness.calls,
      gradedPriceRequests: harness.gradedPriceRequests,
      writes: harness.db.writes.filter((w) => !isObservation(w)),
      observationWrites: harness.db.writes.filter(isObservation),
    },
    null,
    1
  )
);
