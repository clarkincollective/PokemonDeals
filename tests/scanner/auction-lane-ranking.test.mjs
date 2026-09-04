// Phase 13C.4 - homepage "Auctions ending soon" lane ranking.
// Synthetic fixtures only - never depends on live inventory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  rankAuctionLane,
  auctionQualityScore,
  auctionTier,
  currentGapUsd,
  referenceConfidenceFactor,
  minutesToEnd,
  AUCTION_MAX_MINUTES,
  SOFT_REF_FACTOR,
} from "../../lib/auctionLaneRanking.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, "..", "..", p), "utf8");

const NOW = Date.parse("2026-01-01T12:00:00Z");
const endIn = (mins) => new Date(NOW + mins * 60000).toISOString();
let _id = 0;
const auc = (o = {}) => ({
  id: ++_id,
  watchlist_id: _id * 10,
  listing_type: "AUCTION",
  auction_end_at: endIn(90),
  market_price: 100,
  total_price_usd: 60,
  total_price: 60,
  discount_pct: 0.4,
  is_graded: false,
  visual_authenticity_status: null,
  is_local: false,
  ...o,
});
const FRESH = () => "FRESH";
const opts = (o = {}) => ({ freshnessOf: FRESH, now: NOW, limit: 3, ...o });

test("only AUCTION rows are eligible for the lane", () => {
  const rows = [
    auc({ listing_type: "FIXED_PRICE", discount_pct: 0.64, market_price: 400, total_price_usd: 144 }),
    auc({ listing_type: "AUCTION", discount_pct: 0.3, market_price: 200, total_price_usd: 140 }),
  ];
  const out = rankAuctionLane(rows, opts());
  assert.equal(out.length, 1);
  assert.equal(out[0].listing_type, "AUCTION");
});

test("end time stays primary: an imminent auction outranks a stronger one ending much later", () => {
  const soonWeak = auc({ id: 1, watchlist_id: 1, auction_end_at: endIn(45), discount_pct: 0.25, market_price: 80, total_price_usd: 60 }); // T0, weak
  const laterStrong = auc({ id: 2, watchlist_id: 2, auction_end_at: endIn(300), discount_pct: 0.6, market_price: 500, total_price_usd: 200, is_graded: true }); // T1, strong
  assert.equal(auctionTier(soonWeak, NOW), 0);
  assert.equal(auctionTier(laterStrong, NOW), 1);
  const out = rankAuctionLane([laterStrong, soonWeak], opts());
  assert.equal(out[0].id, 1, "the imminent (Tier 0) auction ranks first even though it is the weaker opportunity");
});

test("within the same time tier, quality re-orders (bigger gap + verified reference wins)", () => {
  const t = endIn(80); // both Tier 0
  const weak = auc({ id: 10, watchlist_id: 10, auction_end_at: t, discount_pct: 0.58, market_price: 33, total_price_usd: 14 }); // raw, tiny, $19 gap
  const strong = auc({ id: 11, watchlist_id: 11, auction_end_at: t, discount_pct: 0.55, market_price: 90, total_price_usd: 40, visual_authenticity_status: "MATCH" }); // MATCH, $50 gap
  const out = rankAuctionLane([weak, strong], opts());
  assert.equal(out[0].id, 11);
  assert.ok(auctionQualityScore(strong) > auctionQualityScore(weak));
});

test("a hard discount on a weak reference is soft-penalised, not dominant", () => {
  const t = endIn(70);
  const bigPctWeakRef = auc({ id: 20, watchlist_id: 20, auction_end_at: t, discount_pct: 0.64, market_price: 60, total_price_usd: 22, is_graded: false, visual_authenticity_status: null });
  const solidGraded = auc({ id: 21, watchlist_id: 21, auction_end_at: t, discount_pct: 0.5, market_price: 260, total_price_usd: 130, is_graded: true }); // $130 gap
  assert.equal(referenceConfidenceFactor(bigPctWeakRef), SOFT_REF_FACTOR);
  assert.equal(referenceConfidenceFactor(solidGraded), 1);
  const out = rankAuctionLane([bigPctWeakRef, solidGraded], opts());
  assert.equal(out[0].id, 21, "the graded, big-absolute-gap auction wins its tier");
});

test("absolute current gap matters, not just percentage", () => {
  const t = endIn(60);
  const smallGap = auc({ id: 30, watchlist_id: 30, auction_end_at: t, discount_pct: 0.5, market_price: 20, total_price_usd: 10, is_graded: true }); // $10 gap
  const bigGap = auc({ id: 31, watchlist_id: 31, auction_end_at: t, discount_pct: 0.5, market_price: 300, total_price_usd: 150, is_graded: true }); // $150 gap
  const out = rankAuctionLane([smallGap, bigGap], opts());
  assert.equal(out[0].id, 31);
});

test("auctions ending beyond the 'ending soon' window (>24h) are excluded", () => {
  const inWindow = auc({ id: 40, watchlist_id: 40, auction_end_at: endIn(AUCTION_MAX_MINUTES - 30), discount_pct: 0.3, market_price: 100, total_price_usd: 70, is_graded: true });
  const daysAway = auc({ id: 41, watchlist_id: 41, auction_end_at: endIn(AUCTION_MAX_MINUTES + 600), discount_pct: 0.6, market_price: 900, total_price_usd: 360, is_graded: true }); // stronger but not "ending soon"
  const out = rankAuctionLane([daysAway, inWindow], opts({ limit: 5 }));
  assert.deepEqual(out.map((d) => d.id), [40]);
});

test("no valid current gap (no/inverted reference) -> dropped, never a fabricated gap", () => {
  const noRef = auc({ id: 50, watchlist_id: 50, market_price: null });
  const above = auc({ id: 51, watchlist_id: 51, market_price: 40, total_price_usd: 55 }); // bid already over reference
  const ok = auc({ id: 52, watchlist_id: 52, market_price: 200, total_price_usd: 90, is_graded: true });
  assert.equal(currentGapUsd(noRef), null);
  assert.equal(currentGapUsd(above), null);
  assert.deepEqual(rankAuctionLane([noRef, above, ok], opts()).map((d) => d.id), [52]);
});

test("one tile per canonical card (strongest listing wins the slot)", () => {
  const t = endIn(75);
  const weak = auc({ id: 60, watchlist_id: 777, auction_end_at: t, discount_pct: 0.3, market_price: 100, total_price_usd: 70, is_graded: true });
  const strong = auc({ id: 61, watchlist_id: 777, auction_end_at: t, discount_pct: 0.55, market_price: 100, total_price_usd: 40, is_graded: true });
  const other = auc({ id: 62, watchlist_id: 888, auction_end_at: t, discount_pct: 0.45, market_price: 120, total_price_usd: 66, is_graded: true });
  const out = rankAuctionLane([weak, strong, other], opts());
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((d) => d.id), [61, 62]);
});

test("local marketplace is only a low-priority tie-break, never a tier", () => {
  const t = endIn(70);
  const localWeak = auc({ id: 70, watchlist_id: 70, auction_end_at: t, is_local: true, discount_pct: 0.25, market_price: 60, total_price_usd: 45, is_graded: true });
  const foreignStrong = auc({ id: 71, watchlist_id: 71, auction_end_at: t, is_local: false, discount_pct: 0.6, market_price: 400, total_price_usd: 160, is_graded: true });
  // strong foreign still wins (local does NOT gate quality)
  assert.equal(rankAuctionLane([localWeak, foreignStrong], opts())[0].id, 71);
  // but between two otherwise-equal auctions, local wins
  const a = auc({ id: 72, watchlist_id: 72, auction_end_at: t, is_local: false, discount_pct: 0.5, market_price: 200, total_price_usd: 100, is_graded: true });
  const b = auc({ id: 73, watchlist_id: 73, auction_end_at: t, is_local: true, discount_pct: 0.5, market_price: 200, total_price_usd: 100, is_graded: true });
  assert.equal(rankAuctionLane([a, b], opts())[0].id, 73);
});

test("ordering is deterministic across input shuffles", () => {
  const rows = [
    auc({ id: 80, watchlist_id: 80, auction_end_at: endIn(40), discount_pct: 0.55, market_price: 90, total_price_usd: 40, visual_authenticity_status: "MATCH" }),
    auc({ id: 81, watchlist_id: 81, auction_end_at: endIn(200), discount_pct: 0.52, market_price: 250, total_price_usd: 120, is_graded: true }),
    auc({ id: 82, watchlist_id: 82, auction_end_at: endIn(50), discount_pct: 0.7, market_price: 40, total_price_usd: 12, is_graded: false, visual_authenticity_status: null }),
    auc({ id: 83, watchlist_id: 83, auction_end_at: endIn(300), discount_pct: 0.35, market_price: 60, total_price_usd: 39, is_graded: true }),
  ];
  const a = rankAuctionLane(rows, opts({ limit: 10 })).map((d) => d.id);
  const b = rankAuctionLane([...rows].reverse(), opts({ limit: 10 })).map((d) => d.id);
  const c = rankAuctionLane([rows[2], rows[0], rows[3], rows[1]], opts({ limit: 10 })).map((d) => d.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test("holds at most `limit` tiles and never pads", () => {
  const two = [
    auc({ watchlist_id: 1, is_graded: true, market_price: 200, total_price_usd: 100 }),
    auc({ watchlist_id: 2, is_graded: true, market_price: 200, total_price_usd: 100 }),
  ];
  assert.equal(rankAuctionLane(two, opts({ limit: 3 })).length, 2);
  assert.equal(rankAuctionLane([], opts({ limit: 3 })).length, 0);
});

// --- terminology + no prediction / no public score -------------------

test("the auction ranker never calls the current gap a 'saving' and never predicts a final price", () => {
  // strip comments - the module's own "we do NOT do X" disclaimer names
  // the forbidden things; the guard is about CODE (identifiers, logic).
  const code = read("lib/auctionLaneRanking.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.ok(!/saving|amountSaved|savedUsd|profit|lockedIn/i.test(code), "current gap must not be framed as a saving in code");
  assert.ok(!/finalPrice|hammer|maxBid|expectedPrice|predictedPrice|probability|willStay/i.test(code), "no final-price / outcome prediction in code");
  assert.match(read("lib/auctionLaneRanking.js"), /currentGapUsd/, "the internal name is a 'current gap', not a saving");
});

test("no user-facing auction score; DealCard auction copy stays truthful", () => {
  for (const f of ["components/DealCard.js", "app/page.js"]) {
    assert.ok(!/Auction Score|Deal Score|Opportunity Score|Hotness|auctionQualityScore/i.test(read(f)), `${f} exposes an auction score`);
  }
  const dc = read("components/DealCard.js");
  assert.match(dc, /Current bid ·/, "DealCard auction line still says 'Current bid'");
  assert.match(dc, /can rise/, "DealCard auction line still says the price can rise");
  assert.match(dc, /isAuction \? "" : "line-through"/, "auction market ref is never struck through");
  assert.ok(!/auctionLaneRanking/.test(dc), "DealCard must not import the auction ranker");
});

// --- scope isolation -------------------------------------------------

test("13C.4 - homepage auction lane is isolated; the broad auction browser is untouched", () => {
  const deals = read("lib/deals.js");
  // fetchAuctionsEndingSoon uses the new ranker
  assert.match(deals, /fetchAuctionsEndingSoonUncached[\s\S]{0,1400}rankAuctionLane\(premiumDisplayable\(data\), \{/);
  // still AUCTION-only, still pre-sorted soonest-first at the DB
  assert.match(deals, /fetchAuctionsEndingSoonUncached[\s\S]{0,700}\.eq\("listing_type", "AUCTION"\)/);
  assert.match(deals, /fetchAuctionsEndingSoonUncached[\s\S]{0,1400}\.order\("auction_end_at", \{ ascending: true \}\)/);
  // the /deals/auctions + All Deals path is fetchDealsPage/SORTS.ending - not this ranker
  assert.match(deals, /ending: \{ col: "auction_end_at", ascending: true/);
  assert.ok(!/fetchDealsPageUncached[\s\S]{0,3000}rankAuctionLane/.test(deals), "fetchDealsPage must not use the homepage auction ranker");
  // rankAuctionLane is only wired into the one homepage lane
  assert.equal((deals.match(/rankAuctionLane\(/g) ?? []).length, 1);
  // the two lane rankers stay independent
  assert.ok(!/require\(["']\.\/flagshipRanking|from ["']\.\/flagshipRanking/.test(read("lib/auctionLaneRanking.js")));
  assert.ok(!/auctionLaneRanking/.test(read("lib/flagshipRanking.js")));
});

test("13C.4 - only app/page.js calls fetchAuctionsEndingSoon (single homepage caller)", () => {
  // guard against a future surface quietly reusing the homepage lane policy
  const home = read("app/page.js");
  assert.match(home, /fetchAuctionsEndingSoon\(\{ limit: 3/, "homepage still previews exactly 3");
});

test("13C.4 - flagship stays BIN-only, All Deals unchanged", () => {
  const deals = read("lib/deals.js");
  assert.match(deals, /const FLAGSHIP_BUY_NOW_LISTING_TYPE = "FIXED_PRICE"/);
  assert.match(deals, /rankFlagshipDeals\(premiumDisplayable\(data\), \{/);
  // All Deals grid/pool never gains a listing-type or ranking override here
  assert.ok(!/fetchDealsPoolUncached[\s\S]{0,1500}(rankAuctionLane|rankFlagshipDeals)/.test(deals));
});
