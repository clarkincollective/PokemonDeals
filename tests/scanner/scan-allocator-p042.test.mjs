// P0.4.2 - the evidence-based scan-target allocator (lib/scanAllocator),
// the adaptive external-feed cooldown + lot prefilter
// (lib/ingestFeedQueue), and their wiring into the scanner route.
//
// Synthetic fixtures only - never touches the DB, eBay, or live inventory.
// The allocator is a PURE deterministic function; these tests prove it
// never starves a target, keeps productive targets on a fast cadence,
// decays an unproductive one, protects the Browse quota floor, and does
// NOT touch deal qualification or the homepage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STATE,
  MARKETPLACE_WEIGHT,
  MIN_TARGETS_PER_RUN,
  EXPIRED_BOOST_DAYS,
  LONG_TAIL_DAYS,
  DECAY_NO_NEW,
  DECAY_NO_DEAL,
  TARGET_BUDGET_BASE,
  RUN_HARD_CAP,
  classifyState,
  overdueScore,
  priorityScore,
  budgetForRun,
  allocateScanTargets,
  nextTargetState,
} from "../../lib/scanAllocator.js";
import {
  cooldownHoursFor,
  prefilterBoardCandidate,
  partitionCandidates,
  BASE_RECENT_VERIFY_HOURS,
  STABLE_REJECT_COOLDOWN_HOURS,
} from "../../lib/ingestFeedQueue.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const DAY = 86_400_000;
const NOW = Date.parse("2026-09-10T00:00:00Z");
const ago = (d) => new Date(NOW - d * DAY).toISOString();

let _n = 0;
const target = (o = {}) => ({
  card_tcgplayer_id: String(o.id ?? ++_n),
  language: o.language ?? "english",
  last_known_price: o.price ?? 40,
  tier: o.tier ?? "extended",
  last_searched_at: o.searchedDaysAgo == null ? null : ago(o.searchedDaysAgo),
  last_deal_at: o.dealDaysAgo == null ? null : ago(o.dealDaysAgo),
  searches_total: o.searchesTotal ?? 0,
  searches_since_deal: o.sinceDeal ?? 0,
  consecutive_no_new: o.noNew ?? 0,
  last_unique_listings: o.unique ?? 1,
  expired_deal_boost_until: o.boostUntil ?? null,
  ...o._raw,
});
const many = (n, o = {}) => Array.from({ length: n }, (_, i) => target({ ...o, id: (o.idBase ?? 1000) + i }));

// ===========================================================================
// 1. DETERMINISM
// ===========================================================================

test("1. allocateScanTargets is deterministic - same inputs -> same selection & order", () => {
  const targets = [
    ...many(50, { idBase: 1, searchedDaysAgo: 20 }),
    ...many(20, { idBase: 200, searchedDaysAgo: 2, dealDaysAgo: 1, unique: 10 }),
  ];
  const a = allocateScanTargets({ targets, marketplace: "EBAY_US", now: NOW, budget: 30 });
  const b = allocateScanTargets({ targets: [...targets].reverse(), marketplace: "EBAY_US", now: NOW, budget: 30 });
  assert.deepEqual(a.selected.map((s) => s.card_tcgplayer_id), b.selected.map((s) => s.card_tcgplayer_id));
});

// ===========================================================================
// 2. LONG-TAIL FAIRNESS - overdue rises, nothing starves
// ===========================================================================

test("2. a never-searched target is maximally overdue and is picked in the explore lane", () => {
  const targets = [target({ id: "never", searchedDaysAgo: null }), ...many(20, { idBase: 1, searchedDaysAgo: 3 })];
  const { selected } = allocateScanTargets({ targets, marketplace: "EBAY_US", now: NOW, budget: 5 });
  const picked = selected.find((s) => s.card_tcgplayer_id === "never");
  assert.ok(picked, "never-searched target was not selected");
  assert.equal(picked.reason.lane, "explore");
});

test("3. no target starves: repeated runs eventually search every target under budget", () => {
  // 300 targets, budget 40/run -> everything reached well within ~10 runs.
  let state = new Map(many(300, { idBase: 1, searchedDaysAgo: null }).map((t) => [t.card_tcgplayer_id, t]));
  const everSearched = new Set();
  let now = NOW;
  for (let run = 0; run < 12; run++) {
    const targets = [...state.values()];
    const { selected } = allocateScanTargets({ targets, marketplace: "EBAY_AU", now, budget: 40 });
    for (const s of selected) {
      everSearched.add(s.card_tcgplayer_id);
      state.set(s.card_tcgplayer_id, nextTargetState(state.get(s.card_tcgplayer_id), { cardTcgplayerId: s.card_tcgplayer_id, marketplace: "EBAY_AU", uniqueListings: 1, dealsFound: 0, now }));
    }
    now += DAY / 2;
  }
  assert.equal(everSearched.size, 300, `only ${everSearched.size}/300 targets ever searched`);
});

test("3b. the least-recently-searched target is never overtaken forever by a slightly newer one", () => {
  const targets = [
    target({ id: "oldest", searchedDaysAgo: 40 }),
    target({ id: "old", searchedDaysAgo: 39 }),
    ...many(30, { idBase: 1, searchedDaysAgo: 5 }),
  ];
  const { selected } = allocateScanTargets({ targets, marketplace: "EBAY_US", now: NOW, budget: 3 });
  assert.equal(selected[0].card_tcgplayer_id, "oldest");
  assert.ok(selected.some((s) => s.card_tcgplayer_id === "old"));
});

// ===========================================================================
// 4. PRODUCTIVE TARGETS - fast revisit reserve
// ===========================================================================

test("4. a HOT target that is DUE on its fast cadence gets the hot-reserve lane", () => {
  const hot = target({ id: "hot", dealDaysAgo: 1, unique: 12, searchedDaysAgo: 3 }); // deal 1d ago, not searched 3d -> due
  const targets = [hot, ...many(60, { idBase: 1, searchedDaysAgo: 4 })];
  const { selected } = allocateScanTargets({ targets, marketplace: "EBAY_US", now: NOW, budget: 40 });
  const picked = selected.find((s) => s.card_tcgplayer_id === "hot");
  assert.ok(picked);
  assert.equal(picked.reason.state, STATE.HOT);
  assert.ok(picked.reason.lane === "hot" || picked.reason.lane === "explore", `hot card landed in ${picked.reason.lane}`);
});

test("4b. classifyState: recent deal -> HOT, older deal -> WARM, nothing -> NORMAL, overdue -> LONG_TAIL", () => {
  assert.equal(classifyState({ last_searched_at: ago(1), last_deal_at: ago(2), last_unique_listings: 2 }, NOW), STATE.HOT);
  assert.equal(classifyState({ last_searched_at: ago(1), last_deal_at: ago(14), last_unique_listings: 1 }, NOW), STATE.WARM);
  assert.equal(classifyState({ last_searched_at: ago(1), last_deal_at: null, last_unique_listings: 1 }, NOW), STATE.NORMAL);
  assert.equal(classifyState({ last_searched_at: ago(LONG_TAIL_DAYS + 1), last_deal_at: ago(2) }, NOW), STATE.LONG_TAIL);
  assert.equal(classifyState({ last_searched_at: null }, NOW), STATE.LONG_TAIL);
});

// ===========================================================================
// 5. DECAY - an unproductive HOT target backs off
// ===========================================================================

test("5. a HOT-by-history target that keeps coming back empty decays to NORMAL", () => {
  const stuck = {
    last_searched_at: ago(1),
    last_deal_at: ago(3), // would be HOT on recency...
    consecutive_no_new: DECAY_NO_NEW, // ...but it has produced nothing new
    searches_since_deal: DECAY_NO_DEAL, // ...and no deal for many searches
    last_unique_listings: 1,
  };
  assert.equal(classifyState(stuck, NOW), STATE.NORMAL, "an exhausted HOT target did not decay");
  // one short of the decay thresholds -> still HOT
  assert.equal(
    classifyState({ ...stuck, consecutive_no_new: DECAY_NO_NEW - 1 }, NOW),
    STATE.HOT
  );
});

test("5b. nextTargetState advances the decay counters correctly", () => {
  const prev = { last_searched_at: ago(2), last_deal_at: ago(10), searches_total: 3, searches_since_deal: 3, consecutive_no_new: 1, last_unique_listings: 4 };
  // a search that returns fewer/equal listings and no deal
  const a = nextTargetState(prev, { cardTcgplayerId: "x", marketplace: "EBAY_US", uniqueListings: 4, dealsFound: 0, now: NOW });
  assert.equal(a.searches_total, 4);
  assert.equal(a.searches_since_deal, 4);
  assert.equal(a.consecutive_no_new, 2, "no new listings -> counter should increment");
  // a search that finds a deal resets both
  const b = nextTargetState(prev, { cardTcgplayerId: "x", marketplace: "EBAY_US", uniqueListings: 9, dealsFound: 1, now: NOW });
  assert.equal(b.searches_since_deal, 0);
  assert.equal(b.consecutive_no_new, 0);
  assert.ok(b.last_deal_at);
});

// ===========================================================================
// 6. RECENTLY-EXPIRED BOOST (§7)
// ===========================================================================

test("6. an in-window expired-deal boost raises the score; an expired boost does not", () => {
  const boosted = target({ id: "b", searchedDaysAgo: 5, boostUntil: ago(-3) }); // until = 3d in the future
  const notBoosted = target({ id: "n", searchedDaysAgo: 5, boostUntil: ago(3) }); // until = 3d in the past
  const sb = priorityScore(boosted, classifyState(boosted, NOW), NOW);
  const sn = priorityScore(notBoosted, classifyState(notBoosted, NOW), NOW);
  assert.ok(sb > sn + 0.4, `boost did not materially raise the score (${sb} vs ${sn})`);

  // in the EXPLOIT lane (score-ranked), a boosted target outranks an
  // otherwise-identical non-boosted peer.
  const peers = [boosted, target({ id: "peer", searchedDaysAgo: 5 }), ...many(30, { idBase: 1, searchedDaysAgo: 1 })];
  const { selected } = allocateScanTargets({ targets: peers, marketplace: "EBAY_US", now: NOW, budget: 12 });
  const pb = selected.find((s) => s.card_tcgplayer_id === "b");
  assert.ok(pb, "boosted target was not selected");
  assert.equal(pb.reason.boosted, true);
  const ib = selected.findIndex((s) => s.card_tcgplayer_id === "b");
  const ip = selected.findIndex((s) => s.card_tcgplayer_id === "peer");
  assert.ok(ib >= 0 && (ip < 0 || ib < ip), "boosted target should be selected before its non-boosted peer");
});

test("6b. EXPIRED_BOOST_DAYS is a bounded, small window (a boost cannot become a permanent tier)", () => {
  assert.ok(EXPIRED_BOOST_DAYS >= 5 && EXPIRED_BOOST_DAYS <= 21);
});

// ===========================================================================
// 7. EXPLORE / EXPLOIT / HOT RESERVE all preserved every run (§11)
// ===========================================================================

test("7. every run keeps a real exploration slice AND a real exploitation slice", () => {
  const targets = [
    ...many(200, { idBase: 1, searchedDaysAgo: 25 }), // long tail
    ...many(60, { idBase: 500, searchedDaysAgo: 1, dealDaysAgo: 1, unique: 10 }), // hot/productive
  ];
  const { selected, summary } = allocateScanTargets({ targets, marketplace: "EBAY_US", now: NOW, budget: 100 });
  assert.equal(selected.length, 100);
  assert.ok(summary.explore_count >= 30, `explore slice too small: ${summary.explore_count}`);
  assert.ok(summary.exploit_count >= 10, `exploit slice too small: ${summary.exploit_count}`);
  assert.ok(summary.by_lane.hot + summary.by_lane.explore + summary.by_lane.exploit === selected.length);
  // a "newly hot" card that historically produced nothing is still discoverable
  // because the explore lane ignores yield entirely.
  const targets2 = [target({ id: "coldbutnew", searchedDaysAgo: 30 }), ...many(50, { idBase: 1, searchedDaysAgo: 3 })];
  const r2 = allocateScanTargets({ targets: targets2, marketplace: "EBAY_US", now: NOW, budget: 5 });
  assert.ok(r2.selected.some((s) => s.card_tcgplayer_id === "coldbutnew"));
});

// ===========================================================================
// 8. QUOTA SAFETY (§13)
// ===========================================================================

test("8. budgetForRun never spends past (remaining - floor) and is 0 when there is no headroom", () => {
  // ample headroom -> the marketplace-weighted base
  assert.equal(budgetForRun({ marketplace: "EBAY_US", rateLimitRemaining: 4000, floor: 1200 }), Math.round(TARGET_BUDGET_BASE * MARKETPLACE_WEIGHT.EBAY_US));
  // tight headroom clamps the run
  assert.equal(budgetForRun({ marketplace: "EBAY_US", rateLimitRemaining: 1250, floor: 1200 }), 50);
  // at/below the floor -> nothing
  assert.equal(budgetForRun({ marketplace: "EBAY_US", rateLimitRemaining: 1200, floor: 1200 }), 0);
  assert.equal(budgetForRun({ marketplace: "EBAY_US", rateLimitRemaining: 800, floor: 1200 }), 0);
  // meta-call failed (null) -> trust the base, still capped
  assert.ok(budgetForRun({ marketplace: "EBAY_US", rateLimitRemaining: null, floor: 1200 }) <= RUN_HARD_CAP);
});

test("8b. a zero budget yields an empty selection (the run does nothing, no crash)", () => {
  const { selected, summary } = allocateScanTargets({ targets: many(100), marketplace: "EBAY_US", now: NOW, budget: 0 });
  assert.deepEqual(selected, []);
  assert.equal(summary.targets_selected, 0);
});

test("8c. the run never grows just because more targets exist", () => {
  const small = allocateScanTargets({ targets: many(60), marketplace: "EBAY_US", now: NOW, budget: 25 });
  const big = allocateScanTargets({ targets: many(6000), marketplace: "EBAY_US", now: NOW, budget: 25 });
  assert.equal(small.selected.length, 25);
  assert.equal(big.selected.length, 25);
});

// ===========================================================================
// 9. MARKETPLACE ALLOCATION (§8)
// ===========================================================================

test("9. every supported marketplace has a weight and a non-zero run budget when quota allows", () => {
  const MKTS = ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE", "EBAY_IT"];
  for (const m of MKTS) {
    assert.ok(MARKETPLACE_WEIGHT[m] > 0, `${m} has no weight`);
    const b = budgetForRun({ marketplace: m, rateLimitRemaining: 4000, floor: 1200 });
    assert.ok(b >= MIN_TARGETS_PER_RUN, `${m} run budget ${b} below the exploration floor ${MIN_TARGETS_PER_RUN}`);
  }
  // US carries the most (measured yield), IT the least; spread is modest.
  assert.ok(MARKETPLACE_WEIGHT.EBAY_US >= MARKETPLACE_WEIGHT.EBAY_IT);
  assert.ok(MARKETPLACE_WEIGHT.EBAY_US / MARKETPLACE_WEIGHT.EBAY_IT <= 2.2, "marketplace weighting spread is too aggressive");
});

test("9b. marketplace weights are frozen constants (deterministic)", () => {
  assert.ok(Object.isFrozen(MARKETPLACE_WEIGHT));
});

// ===========================================================================
// 10. NO DUPLICATE WASTE / IDENTITY PRESERVED
// ===========================================================================

test("10. a selection never contains the same exact printing twice", () => {
  const dupes = [target({ id: "5" }), target({ id: "5" }), target({ id: "5" }), ...many(20, { idBase: 1 })];
  const { selected } = allocateScanTargets({ targets: dupes, marketplace: "EBAY_US", now: NOW, budget: 10 });
  const ids = selected.map((s) => s.card_tcgplayer_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of selected) assert.equal(typeof s.card_tcgplayer_id, "string");
});

// ===========================================================================
// 11. ADAPTIVE REJECT COOLDOWN + LOT PREFILTER (§9, §10)
// ===========================================================================

test("11. cooldownHoursFor: seen-once -> base window; twice-failed no-deal -> long window; ever-a-deal -> base", () => {
  assert.equal(cooldownHoursFor(null), 0);
  assert.equal(cooldownHoursFor({ lastMs: NOW, count: 1, becameDeal: false }), BASE_RECENT_VERIFY_HOURS);
  assert.equal(cooldownHoursFor({ lastMs: NOW, count: 3, becameDeal: false }), STABLE_REJECT_COOLDOWN_HOURS);
  assert.equal(cooldownHoursFor({ lastMs: NOW, count: 5, becameDeal: true }), BASE_RECENT_VERIFY_HOURS);
  assert.ok(STABLE_REJECT_COOLDOWN_HOURS > BASE_RECENT_VERIFY_HOURS);
});

test("12. partitionCandidates skips a stable twice-failed reject inside its long cooldown, allows it after", () => {
  const it = { marketplace: "EBAY_GB", ebayItemId: "111222333", feedTitle: "Charizard Base Set Holo" };
  const key = "EBAY_GB:111222333";
  const within = new Map([[key, { lastMs: NOW - 30 * 3600 * 1000, count: 3, becameDeal: false }]]); // 30h ago, cooldown 84h
  const after = new Map([[key, { lastMs: NOW - 90 * 3600 * 1000, count: 3, becameDeal: false }]]); // 90h ago
  const a = partitionCandidates({ feedItems: [it], externalHistory: within, now: NOW });
  assert.equal(a.neverSeen.length + a.dueRecheck.length, 0);
  assert.equal(a.skippedStableReject, 1);
  const b = partitionCandidates({ feedItems: [it], externalHistory: after, now: NOW });
  assert.equal(b.dueRecheck.length, 1, "a stable reject past its cooldown should be re-checkable");
});

test("12b. a listing that once became a deal keeps the SHORT window (state changes must not be missed)", () => {
  const it = { marketplace: "EBAY_US", ebayItemId: "999888777", feedTitle: "Pikachu VMAX" };
  const key = "EBAY_US:999888777";
  const hist = new Map([[key, { lastMs: NOW - 25 * 3600 * 1000, count: 4, becameDeal: true }]]); // 25h ago > 20h base
  const r = partitionCandidates({ feedItems: [it], externalHistory: hist, now: NOW });
  assert.equal(r.dueRecheck.length, 1, "an ever-a-deal listing past the base window should be re-checkable");
});

test("13. prefilterBoardCandidate skips obvious lot / bundle / multi listings before any Browse call", () => {
  for (const t of ["Pokemon Card LOT of 50", "Charizard bundle x25", "Base Set near complete set", "100 cards mystery repack", "Job Lot Vintage WOTC"]) {
    assert.equal(prefilterBoardCandidate({ feedTitle: t }).skip, true, `did not skip: ${t}`);
  }
  for (const t of ["Charizard 4/102 Base Set Holo PSA 9", "Umbreon VMAX Alt Art Evolving Skies", "Blastoise Base Set Shadowless"]) {
    assert.equal(prefilterBoardCandidate({ feedTitle: t }).skip, false, `wrongly skipped: ${t}`);
  }
  // no title available -> never skip (fail open, the Browse call decides)
  assert.equal(prefilterBoardCandidate({}).skip, false);
});

test("13b. partitionCandidates counts and drops a prefiltered lot before it can consume a verify slot", () => {
  const items = [
    { marketplace: "EBAY_US", ebayItemId: "1", feedTitle: "Charizard Base Set Holo" },
    { marketplace: "EBAY_US", ebayItemId: "2", feedTitle: "Pokemon LOT 200 cards" },
  ];
  const r = partitionCandidates({ feedItems: items, externalHistory: new Map(), now: NOW });
  assert.equal(r.skippedPrefilter, 1);
  assert.equal(r.neverSeen.length, 1);
  assert.equal(r.neverSeen[0].ebayItemId, "1");
});

// ===========================================================================
// 14. SOURCE GUARDS - no quality / integrity / homepage coupling
// ===========================================================================

test("14. lib/scanAllocator is pure: no I/O, no eBay, no deal-quality gate, no homepage/deals import", () => {
  const src = read("lib/scanAllocator.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /\bfetch\s*\(|\bimport\b|createClient|next\/cache|@\/lib\/(ebay|deals|dealQuality|dealMatching|homepageVariety|flagshipRanking)/);
  assert.doesNotMatch(src, /\brequire\s*\(/, "scanAllocator must have no dependencies at all");
  // it decides WHICH cards, never the deal bar
  assert.doesNotMatch(src, /discount|DISCOUNT_THRESHOLD|SANITY_FLOOR|market_price|reference|counterfeit|grade|multi-?card/i);
});

test("15. the scanner's tier=allocated branch changes only target SELECTION, not the deal pipeline", () => {
  const src = read("app/api/refresh-deals/route.js");
  // discount threshold + the whole scanCardInMarketplace gate chain are untouched
  assert.match(src, /const DISCOUNT_THRESHOLD = 0\.1;/);
  assert.match(src, /scanCardInMarketplace\(/);
  // the allocated branch reuses the SAME scanOneCard / scanCardInMarketplace path
  assert.match(src, /const allocatedMode = tier === "allocated";/);
  assert.match(src, /allocateScanTargets\(/);
  assert.match(src, /process\.env\.SCAN_ALLOCATOR !== "off"/);
  // fail-safe fallback to the old extended-chunk behaviour
  assert.match(src, /FALLBACK: the old extended-chunk behaviour/);
  // quota-safe budget
  assert.match(src, /budgetForRun\(\{[\s\S]*?floor: RATE_LIMIT_FLOORS\.allocated/);
  // best-effort state write - never fails the scan
  assert.match(src, /scan_target_state\/allocation_runs write skipped/);
  // NO P0.3.1 / matching / reference guard edited here
  assert.doesNotMatch(src, /P0\.4\.2[\s\S]{0,400}(gradedReferenceAllowed|listingMatchesCard|isHighRiskBelowMarket|REF_SANITY|admitsProxyOrCounterfeit)/);
});

test("16. no deal-integrity module carries a P0.4.2 edit", () => {
  for (const f of ["lib/dealQuality.js", "lib/dealMatching.js", "lib/flagshipRanking.js", "lib/priceHistory.js", "lib/homepageVariety.js"]) {
    assert.doesNotMatch(read(f), /P0\.4\.2/, `${f} was touched by P0.4.2`);
  }
});

test("17. vercel.json: the static priority tier + the 30 extended-chunk crons are gone, replaced by allocated runs (every marketplace twice a day)", () => {
  const cron = JSON.parse(read("vercel.json"));
  const paths = cron.crons.map((c) => c.path);
  assert.ok(!paths.some((p) => p.startsWith("/api/refresh-deals?tier=priority")), "static priority cron still present");
  assert.ok(!paths.some((p) => p.includes("tier=extended")), "extended-chunk crons still present");
  const allocated = cron.crons.filter((c) => c.path.includes("tier=allocated"));
  assert.equal(allocated.length, 6, "expected one allocated cron entry per marketplace");
  for (const m of ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE", "EBAY_IT"]) {
    const entry = allocated.find((c) => c.path.includes(m));
    assert.ok(entry, `${m} has no allocated cron`);
    // each entry fires twice a day (a comma-separated hour field)
    const hourField = entry.schedule.split(" ")[1];
    assert.equal(hourField.split(",").length, 2, `${m} allocated cron should fire twice a day (schedule "${entry.schedule}")`);
  }
  // the sweep + local-only crons are untouched
  assert.ok(paths.some((p) => p.includes("mode=sweep&country=EBAY_US")));
  assert.ok(paths.includes("/api/sweep-stale-deals"));
});

test("18. sweep-stale-deals sets a BOUNDED recently-expired boost and never fails the sweep on a write error", () => {
  const src = read("app/api/sweep-stale-deals/route.js");
  assert.match(src, /EXPIRE_BOOST_MIN_DISCOUNT/);
  assert.match(src, /EXPIRE_BOOST_CAP/);
  assert.match(src, /expired_deal_boost_until/);
  assert.match(src, /scan_target_state not migrated yet - silently skip/);
  // NO eBay call added
  assert.doesNotMatch(src, /searchListings|getItem|api\.ebay|getBrowseRateLimit/);
});

test("19. ingest-feed still verifies through the identical pipeline - the P0.4.2 additions are cheap PRE-filters only", () => {
  const q = read("lib/ingestFeedQueue.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(q, /\bfetch\s*\(|createClient|next\/cache/);
  const route = read("app/api/ingest-feed/route.js");
  assert.match(route, /partitionCandidates\(\{[\s\S]*?now: Date\.now\(\)/);
  assert.match(route, /became_deal/); // richer history for the adaptive cooldown
  // the flat RECENT_VERIFY_HOURS base is unchanged (adaptive only lengthens it)
  assert.match(route, /const RECENT_VERIFY_HOURS = 20;/);
});
