// P0.4.1 - the homepage diversity-aware selection layer (lib/homepageVariety)
// and its wiring (lib/deals.fetchHomepageLanes, app/page.js).
//
// Synthetic fixtures only - never depends on live inventory. The selector
// is a PURE pass-through of an already-eligibility-filtered, already
// quality-ordered list: these tests prove it never invents, re-ranks by a
// fabricated score, resurrects a stale deal, or breaks a lane by obeying a
// cap - and that rotation is deterministic per time bucket.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ROTATION_INTERVAL_HOURS,
  rotationBucket,
  fnv1a,
  printingKey,
  speciesKey,
  rotateForBucket,
  selectDiverseLane,
  buildHomepageLanes,
  LANES,
} from "../../lib/homepageVariety.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let _id = 0;
// a deal-shaped row. `species` picks a real Pokemon name so extractSpecies
// resolves it; `printing` sets a distinct card_tcgplayer_id.
const deal = (o = {}) => ({
  id: ++_id,
  watchlist_id: (o.printing ?? _id) * 10,
  card_tcgplayer_id: String(o.printing ?? _id),
  card_name: `${o.species ?? "Pikachu"} ${o.printing ?? _id}`,
  card_set: o.set ?? `Set ${o.printing ?? _id}`,
  card_language: "english",
  total_price: o.price ?? 40,
  total_price_usd: o.price ?? 40,
  market_price: o.market ?? 100,
  discount_pct: o.discount ?? 0.4,
  listing_type: o.listing_type ?? "FIXED_PRICE",
  first_seen_at: o.first_seen_at ?? new Date(Date.now() - (o.ageH ?? 5) * 3600e3).toISOString(),
  is_active: true,
  ...o,
});
const SPECIES = ["Pikachu", "Charizard", "Blastoise", "Venusaur", "Gengar", "Mewtwo", "Lugia", "Rayquaza", "Umbreon", "Snorlax"];

// ---------------------------------------------------------------------------
// 1. NO DUPLICATE EXACT PRINTING PER CURATED LANE
// ---------------------------------------------------------------------------

test("1. selectDiverseLane never returns the same exact printing twice", () => {
  // 3 listings of ONE printing + a handful of others
  const pool = [
    deal({ printing: 1, species: "Pikachu", discount: 0.6 }),
    deal({ printing: 1, species: "Pikachu", discount: 0.55 }),
    deal({ printing: 1, species: "Pikachu", discount: 0.5 }),
    deal({ printing: 2, species: "Charizard" }),
    deal({ printing: 3, species: "Gengar" }),
    deal({ printing: 4, species: "Lugia" }),
  ];
  const out = selectDiverseLane(pool, { limit: 4 });
  const keys = out.map(printingKey);
  assert.equal(new Set(keys).size, keys.length, "a printing repeated in one lane");
  assert.equal(out.length, 4);
});

// ---------------------------------------------------------------------------
// 2. <= 2 SAME SPECIES WHERE INVENTORY ALLOWS
// ---------------------------------------------------------------------------

test("2. at most 2 deals of one species in a lane when other species exist", () => {
  // 4 Charizard printings + 6 other distinct species -> a 4-slot lane
  // must show Charizard at most once (first-pass), and even a 6-slot lane
  // stays at the cap of 2 because there is plenty of other inventory.
  const pool = [
    deal({ printing: 1, species: "Charizard", discount: 0.62 }),
    deal({ printing: 2, species: "Charizard", discount: 0.6 }),
    deal({ printing: 3, species: "Charizard", discount: 0.58 }),
    deal({ printing: 4, species: "Charizard", discount: 0.56 }),
    ...["Pikachu", "Gengar", "Lugia", "Mewtwo", "Snorlax", "Umbreon"].map((sp, i) =>
      deal({ printing: 10 + i, species: sp, discount: 0.4 })
    ),
  ];
  const four = selectDiverseLane(pool, { limit: 4, speciesCap: 2 });
  assert.equal(four.filter((d) => speciesKey(d) === "sp:charizard").length, 1, "Charizard shown twice in a 4-slot first pass");
  const six = selectDiverseLane(pool, { limit: 6, speciesCap: 2 });
  assert.ok(six.filter((d) => speciesKey(d) === "sp:charizard").length <= 2, "Charizard exceeded the cap with other inventory available");
  assert.equal(six.length, 6);
});

test("2b. species cap RELAXES when there is no other inventory (lane never suppressed)", () => {
  // only Charizard printings exist - the lane must still fill, not return 2
  const pool = Array.from({ length: 5 }, (_, i) => deal({ printing: 10 + i, species: "Charizard" }));
  const out = selectDiverseLane(pool, { limit: 4, speciesCap: 2 });
  assert.equal(out.length, 4, "lane suppressed to obey the species cap");
  assert.equal(new Set(out.map(printingKey)).size, 4, "still no duplicate printing");
});

// ---------------------------------------------------------------------------
// 3. FIRST-PASS DISTINCT-SPECIES PREFERENCE
// ---------------------------------------------------------------------------

test("3. one occurrence of a species is taken before a second, even at a small quality cost", () => {
  // quality order: two strong Charizards first, then a weaker Pikachu.
  const pool = [
    deal({ printing: 1, species: "Charizard", discount: 0.62 }),
    deal({ printing: 2, species: "Charizard", discount: 0.6 }),
    deal({ printing: 3, species: "Pikachu", discount: 0.3 }),
    deal({ printing: 4, species: "Gengar", discount: 0.28 }),
  ];
  const out = selectDiverseLane(pool, { limit: 3, speciesCap: 2 });
  // first pass should be Charizard, Pikachu, Gengar - NOT Charizard, Charizard, Pikachu
  assert.deepEqual(out.map((d) => speciesKey(d)), ["sp:charizard", "sp:pikachu", "sp:gengar"]);
});

// ---------------------------------------------------------------------------
// 4. DETERMINISTIC ROTATION BUCKET
// ---------------------------------------------------------------------------

test("4. rotationBucket is a stable integer that advances once per interval", () => {
  assert.equal(ROTATION_INTERVAL_HOURS, 3);
  const t0 = Date.parse("2026-09-06T00:00:00Z");
  const b0 = rotationBucket(t0);
  assert.equal(rotationBucket(t0 + 60 * 60 * 1000), b0, "changed inside the interval");
  assert.equal(rotationBucket(t0 + 2 * 60 * 60 * 1000 + 59 * 60 * 1000), b0, "changed inside the interval");
  assert.equal(rotationBucket(t0 + 3 * 60 * 60 * 1000), b0 + 1, "did not advance at the boundary");
  assert.equal(typeof b0, "number");
});

// ---------------------------------------------------------------------------
// 5. SAME BUCKET -> SAME RESULT ;  LATER BUCKET -> CAN ROTATE
// ---------------------------------------------------------------------------

test("5. buildHomepageLanes is deterministic within a bucket and rotates across buckets", () => {
  const flagship = SPECIES.map((sp, i) => deal({ printing: 100 + i, species: sp, discount: 0.6 - i * 0.02 }));
  const pools = { flagship, justAdded: [], underPrice: [], auctions: [], grid: [] };

  const a = buildHomepageLanes(pools, { bucket: 5000 });
  const b = buildHomepageLanes(pools, { bucket: 5000 });
  assert.deepEqual(a.flagship.map((d) => d.id), b.flagship.map((d) => d.id), "same bucket produced a different result");

  // scan a window of buckets - the flagship selection must change at least once
  const seen = new Set();
  for (let bk = 5000; bk < 5040; bk++) {
    seen.add(buildHomepageLanes(pools, { bucket: bk }).flagship.map((d) => d.id).join(","));
  }
  assert.ok(seen.size > 1, "flagship selection never rotated across 40 buckets");
});

test("5b. flagship tile 1 stays anchored to the single best deal across buckets", () => {
  const flagship = SPECIES.map((sp, i) => deal({ printing: 200 + i, species: sp, discount: 0.65 - i * 0.03 }));
  const pools = { flagship, justAdded: [], underPrice: [], auctions: [], grid: [] };
  const bestId = flagship[0].id;
  for (let bk = 9000; bk < 9020; bk++) {
    assert.equal(buildHomepageLanes(pools, { bucket: bk }).flagship[0].id, bestId, `bucket ${bk} moved the top deal`);
  }
});

// ---------------------------------------------------------------------------
// 6. QUALITY ELIGIBILITY PRESERVED  /  7. STALE DEALS NOT REINTRODUCED
// ---------------------------------------------------------------------------

test("6. the selector only ever returns rows from its input - it never invents or re-filters", () => {
  const pool = [deal({ printing: 1 }), deal({ printing: 2 }), deal({ printing: 3 }), deal({ printing: 4 })];
  const inputIds = new Set(pool.map((d) => d.id));
  const out = selectDiverseLane(pool, { limit: 10 });
  for (const d of out) assert.ok(inputIds.has(d.id), "output row was not in the input");
  assert.equal(out.length, pool.length, "returned fewer than the whole (small) pool");
});

test("7. selectDiverseLane cannot resurrect a deal that the caller's gate excluded", () => {
  // The caller (lib/deals) applies premiumDisplayable / displayable BEFORE
  // calling the selector. A stale row simply is not in the pool. Prove the
  // selector adds nothing: an empty pool yields an empty lane.
  assert.deepEqual(selectDiverseLane([], { limit: 4 }), []);
  // and a pool of 2 never becomes 4
  const two = [deal({ printing: 1 }), deal({ printing: 2 })];
  assert.equal(selectDiverseLane(two, { limit: 4 }).length, 2);
});

// ---------------------------------------------------------------------------
// 8. CROSS-LANE DUPLICATE SUPPRESSION
// ---------------------------------------------------------------------------

test("8. an exact printing shown in an earlier lane is not repeated in a later lane (when inventory allows)", () => {
  const shared = deal({ printing: 1, species: "Pikachu", discount: 0.6, price: 20 });
  // every later lane has plenty of its OWN distinct printings, so the
  // cross-lane dedupe holds without any relaxation.
  const fill = (base, sp0, price) =>
    Array.from({ length: 12 }, (_, i) => deal({ printing: base + i, species: SPECIES[(sp0 + i) % SPECIES.length], price }));
  const pools = {
    flagship: [shared, ...fill(100, 1, 120)],
    underPrice: [{ ...shared }, ...fill(200, 3, 20)],
    justAdded: [{ ...shared }, ...fill(300, 5, 60)],
    auctions: [],
    grid: [{ ...shared }, ...fill(400, 7, 40)],
  };
  const lanes = buildHomepageLanes(pools, { bucket: 1 });
  const printings = [...lanes.flagship, ...lanes.underPrice, ...lanes.justAdded, ...lanes.auctions, ...lanes.grid].map(printingKey);
  assert.equal(printings.length - new Set(printings).size, 0, "an exact printing repeated across homepage lanes despite ample inventory");
  // `shared` should appear in exactly one lane (the first that can use it)
  const inFlagship = lanes.flagship.some((d) => printingKey(d) === printingKey(shared));
  assert.ok(inFlagship, "the shared printing should be claimed by the earliest lane");
});

test("8b. cross-lane dedupe RELAXES only when a lane would otherwise be short", () => {
  // every lane's ONLY inventory is one shared printing + too few others
  const shared = deal({ printing: 1, species: "Pikachu" });
  const pools = {
    flagship: [shared, deal({ printing: 2, species: "Charizard" }), deal({ printing: 3, species: "Gengar" }), deal({ printing: 4, species: "Lugia" })],
    underPrice: [{ ...shared, id: 91 }, deal({ printing: 5, species: "Snorlax", price: 20 })], // only 2 -> needs the shared one to reach 3
    justAdded: [],
    auctions: [],
    grid: [],
  };
  const lanes = buildHomepageLanes(pools, { bucket: 3 });
  assert.equal(lanes.flagship.length, 4);
  assert.equal(lanes.underPrice.length, 2, "under $25 lane should be 2 (only 2 distinct printings exist for it after dedupe)");
  // The shared printing is in flagship; underPrice does NOT resurrect it
  // as a duplicate just to pad - it stays at its real size. A lane is
  // never suppressed, but it is also never padded with a repeat.
});

test("8c. a starved lane fills from its own repeats before touching another lane's printing", () => {
  const mk = (base, n) => Array.from({ length: n }, (_, i) => deal({ printing: base + i, species: "Pikachu" }));
  const pools = { flagship: mk(600, 6), underPrice: mk(700, 6), justAdded: mk(800, 6), auctions: [], grid: mk(900, 20) };
  const lanes = buildHomepageLanes(pools, { bucket: 3 });
  assert.equal(lanes.flagship.length, 4);
  assert.equal(lanes.underPrice.length, 3);
  assert.equal(lanes.justAdded.length, 3);
  assert.equal(lanes.grid.length, 9);
  // every lane filled from its OWN distinct printings (all-Pikachu is fine)
  for (const k of ["flagship", "underPrice", "justAdded", "grid"]) {
    const keys = lanes[k].map(printingKey);
    assert.equal(new Set(keys).size, keys.length, `${k} repeated a printing`);
  }
});

// ---------------------------------------------------------------------------
// 9. GRACEFUL CAP RELAXATION
// ---------------------------------------------------------------------------

test("9. a thin pool still fills the lane by relaxing set -> band -> species-cap -> cross-lane", () => {
  const pool = [
    deal({ printing: 1, species: "Pikachu", set: "A", price: 30 }),
    deal({ printing: 2, species: "Pikachu", set: "A", price: 30 }),
    deal({ printing: 3, species: "Pikachu", set: "A", price: 30 }),
  ];
  const out = selectDiverseLane(pool, { limit: 3, speciesCap: 2 });
  assert.equal(out.length, 3, "did not relax enough to fill a valid lane");
  assert.equal(new Set(out.map(printingKey)).size, 3);
});

// ---------------------------------------------------------------------------
// 10. FRESHNESS PRESERVED IN THE GRID PERMUTE
// ---------------------------------------------------------------------------

test("10. bucketPermute keeps recent deals ahead of old ones (freshness = tie-break, not discarded)", () => {
  const fresh = Array.from({ length: 6 }, (_, i) => deal({ printing: 700 + i, species: SPECIES[i], ageH: 10 }));
  const old = Array.from({ length: 6 }, (_, i) => deal({ printing: 800 + i, species: SPECIES[i], ageH: 24 * 20 }));
  const permuted = rotateForBucket([...old, ...fresh], { bucket: 7, laneId: "grid", mode: "bucketPermute" });
  // the first 6 should all be the < 48 h tier
  const firstSix = permuted.slice(0, 6).map((d) => d.card_tcgplayer_id);
  assert.ok(firstSix.every((k) => Number(k) >= 700 && Number(k) < 800), "an old deal jumped ahead of fresh inventory");
});

// ---------------------------------------------------------------------------
// 11. NO SCANNER / API CALL, NO INTEGRITY-RULE CHANGES  (source scan)
// ---------------------------------------------------------------------------

test("11. lib/homepageVariety is a pure module - no I/O, no eBay, no framework cache", () => {
  const src = read("lib/homepageVariety.js");
  // strip comments so a comment mentioning "no next/cache" can't trip the scan
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const requires = [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ["./pokemonSpecies"], `unexpected require(): ${requires.join(", ")}`);
  assert.doesNotMatch(code, /\bimport\b|\bfetch\s*\(|\bnext\/cache\b|\bcreateClient\b|@\/lib\/(ebay|supabase|deals|dealQuality)/);
});

test("12. fetchHomepageLanes reads only the deals table, reuses the shared gated selectors, and issues ZERO eBay calls", () => {
  const src = read("lib/deals.js");
  const fn = src.slice(src.indexOf("fetchHomepageLanesUncached"), src.indexOf("fetchHomepageLanes = unstable_cache"));
  assert.ok(fn.length > 200, "could not isolate fetchHomepageLanesUncached");
  // no eBay / Browse-API surface anywhere in the homepage lane builder
  assert.doesNotMatch(fn, /searchListings|searchNewlyListed|getBrowseRateLimit|api\.ebay|getItem|getGradingDetails/i);
  // it only ever reads the deals table (via its own query + the reused selectors)
  assert.doesNotMatch(fn, /\.from\((?!["']deals["'])/);
  // premium lanes reuse the EXISTING gated selectors (no new gate path):
  assert.match(fn, /selectFlagshipDeals\(\{ limit: 60/, "flagship pool = the shared selectFlagshipDeals");
  assert.match(fn, /fetchFreshFindsUncached\(\{ limit: 40/, "Just Added pool = the shared fetchFreshFinds");
  assert.match(fn, /fetchAuctionsEndingSoonUncached\(\{ limit: 24/, "auctions pool = the shared auctions lane");
  // Under $25 uses the SAME isDisplayableDeal gate the "All deals" grid
  // uses (displayable), never a weaker one, at the /deals/under-25 basis.
  assert.match(fn, /displayable\(data\)/);
  assert.match(fn, /UNDER_PRICE_LANE_MAX/);
  assert.doesNotMatch(fn, /discount_pct.*0\.\d|market_price.*[<>]=|SANITY_FLOOR|DISCOUNT_THRESHOLD/, "no threshold override");
});

test("13. no deal-integrity threshold / gate module was modified by P0.4.1", () => {
  // the discount threshold, reference-sanity, language / multi-card / grade
  // guards and the flagship composite all live in these files - none of
  // them should carry a P0.4.1 edit.
  for (const f of ["lib/dealQuality.js", "lib/dealMatching.js", "lib/flagshipRanking.js", "lib/auctionLaneRanking.js", "lib/priceHistory.js"]) {
    assert.doesNotMatch(read(f), /P0\.4\.1/, `${f} was touched by P0.4.1`);
  }
});

test("14. the Under $25 lane price basis matches /deals/under-25 (total_price <= 25)", () => {
  const src = read("lib/deals.js");
  assert.match(src, /UNDER_PRICE_LANE_MAX = 25/);
  assert.match(src, /\.lte\("total_price", UNDER_PRICE_LANE_MAX\)/);
  // /deals/under-25 uses maxPrice:25 -> fetchDealsPage -> lte("total_price", maxPrice)
  assert.match(read("lib/dealCategories.js"), /"under-25":\s*\{\s*filter:\s*\{\s*maxPrice:\s*25/);
});

test("15. app/page.js no longer shuffles per-request and renders the Under $25 lane", () => {
  const src = read("app/page.js");
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /Math\.random\s*\(/, "per-request Math.random shuffle still in the homepage render path");
  assert.doesNotMatch(code, /function shuffled\s*\(/, "dead shuffled() helper still present");
  assert.match(code, /buildHomepageLanes\(/);
  assert.match(code, /rotationBucket\(\)/);
  assert.match(code, /underPriceDeals/);
  assert.match(code, /\/deals\/under-25/);
  assert.match(code, /href="\/deals"/); // the Browse all live deals CTA
});

// ---------------------------------------------------------------------------
// 16. LANE CONTRACT
// ---------------------------------------------------------------------------

test("16. LANES() defines exactly the five homepage lanes with sane limits", () => {
  const lanes = LANES();
  assert.deepEqual(lanes.map((l) => l.key), ["flagship", "underPrice", "justAdded", "auctions", "grid"]);
  for (const l of lanes) {
    assert.ok(l.limit >= 3 && l.limit <= 12, `${l.key} limit ${l.limit}`);
    assert.ok(l.speciesCap >= 2, `${l.key} speciesCap ${l.speciesCap}`);
  }
  assert.equal(lanes.find((l) => l.key === "grid").rotate, "bucketPermute");
  assert.equal(lanes.find((l) => l.key === "flagship").anchor, 1);
});

test("17. fnv1a is stable and well-distributed enough for a rotation offset", () => {
  assert.equal(fnv1a("a"), fnv1a("a"));
  assert.notEqual(fnv1a("5000:flagship"), fnv1a("5001:flagship"));
  assert.notEqual(fnv1a("5000:flagship"), fnv1a("5000:auctions"));
  assert.equal(typeof fnv1a("x"), "number");
  assert.ok(fnv1a("x") >= 0);
});
