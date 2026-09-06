// Phase 13C.2 - deterministic flagship ("Best deals right now") ranking.
// Synthetic fixtures only - never depends on live inventory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  rankFlagshipDeals,
  flagshipScore,
  referenceConfidenceFactor,
  savingUsd,
  isFlagshipListingType,
  SOFT_REF_FACTOR,
} from "../../lib/flagshipRanking.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, "..", "..", p), "utf8");

// a fixed-price flagship-shaped row
let _id = 0;
const row = (o = {}) => ({
  id: ++_id,
  watchlist_id: _id * 100,
  listing_type: "FIXED_PRICE",
  market_price: 200,
  total_price_usd: 120,
  total_price: 120,
  discount_pct: 0.4,
  is_graded: false,
  visual_authenticity_status: null,
  is_local: false,
  ...o,
});
const FRESH = () => "FRESH";

test("auctions are excluded from the flagship lane; fixed-price is allowed", () => {
  assert.equal(isFlagshipListingType(row({ listing_type: "AUCTION" })), false);
  assert.equal(isFlagshipListingType(row({ listing_type: "FIXED_PRICE" })), true);
  assert.equal(isFlagshipListingType(row({ listing_type: null })), true); // buy-now default

  const out = rankFlagshipDeals(
    [
      row({ discount_pct: 0.64, listing_type: "AUCTION", market_price: 300, total_price_usd: 108 }),
      row({ discount_pct: 0.3, listing_type: "FIXED_PRICE", market_price: 300, total_price_usd: 210 }),
    ],
    { freshnessOf: FRESH, limit: 4 }
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].listing_type, "FIXED_PRICE");
});

test("a huge discount on a weak reference cannot dominate a solid discount on a strong one", () => {
  // A: 64% off, raw, no vision MATCH -> soft-penalised reference
  const A = row({ discount_pct: 0.64, market_price: 150, total_price_usd: 54, is_graded: false, visual_authenticity_status: null });
  // B: 52% off, graded (strong reference), bigger absolute saving
  const B = row({ discount_pct: 0.52, market_price: 400, total_price_usd: 192, is_graded: true });
  assert.equal(referenceConfidenceFactor(A), SOFT_REF_FACTOR);
  assert.equal(referenceConfidenceFactor(B), 1);
  const out = rankFlagshipDeals([A, B], { freshnessOf: FRESH, limit: 4 });
  assert.equal(out[0].id, B.id, "the strong-reference, bigger-dollar deal ranks first");
});

test("absolute dollar saving changes the order at equal discount", () => {
  const small = row({ discount_pct: 0.5, market_price: 100, total_price_usd: 50, is_graded: true }); // save $50
  const big = row({ discount_pct: 0.5, market_price: 800, total_price_usd: 400, is_graded: true }); // save $400
  const out = rankFlagshipDeals([small, big], { freshnessOf: FRESH, limit: 4 });
  assert.equal(out[0].id, big.id);
  assert.ok(flagshipScore(big) > flagshipScore(small));
});

test("discount is not the sole factor - a much bigger saving beats a slightly bigger discount", () => {
  const hiPct = row({ discount_pct: 0.63, market_price: 120, total_price_usd: 44, is_graded: true }); // save ~$76
  const hiSave = row({ discount_pct: 0.5, market_price: 600, total_price_usd: 300, is_graded: true }); // save $300
  const out = rankFlagshipDeals([hiPct, hiSave], { freshnessOf: FRESH, limit: 4 });
  assert.equal(out[0].id, hiSave.id);
});

test("freshness only breaks a tie - it never overturns a materially better deal", () => {
  const a = row({ id: 1001, watchlist_id: 1, discount_pct: 0.5, market_price: 300, total_price_usd: 150, is_graded: true });
  const b = row({ id: 1002, watchlist_id: 2, discount_pct: 0.5, market_price: 300, total_price_usd: 150, is_graded: true });
  const fresh = (r) => (r.id === 1002 ? "FRESH" : "AGING");
  // identical score -> the FRESH one wins the tie
  assert.equal(rankFlagshipDeals([a, b], { freshnessOf: fresh, limit: 4 })[0].id, 1002);
  // but a clearly better AGING deal still beats a FRESH weaker one
  const better = row({ id: 1003, watchlist_id: 3, discount_pct: 0.6, market_price: 900, total_price_usd: 360, is_graded: true });
  const freshWeak = (r) => (r.id === 1003 ? "AGING" : "FRESH");
  assert.equal(rankFlagshipDeals([a, better], { freshnessOf: freshWeak, limit: 4 })[0].id, 1003);
});

test("only one flagship tile per canonical card (strongest listing wins the slot)", () => {
  const weak = row({ id: 1, watchlist_id: 555, discount_pct: 0.4, market_price: 200, total_price_usd: 120, is_graded: true });
  const strong = row({ id: 2, watchlist_id: 555, discount_pct: 0.6, market_price: 200, total_price_usd: 80, is_graded: true });
  const other = row({ id: 3, watchlist_id: 999, discount_pct: 0.45, market_price: 250, total_price_usd: 137, is_graded: true });
  const out = rankFlagshipDeals([weak, strong, other], { freshnessOf: FRESH, limit: 4 });
  assert.equal(out.length, 2, "the duplicate canonical card is collapsed to one tile");
  assert.deepEqual(out.map((d) => d.id), [2, 3]);
});

test("rows with no valid positive saving are dropped (no fabricated saving)", () => {
  const noRef = row({ market_price: null, total_price_usd: 120 });
  const inverted = row({ market_price: 100, total_price_usd: 130 }); // 'saving' negative
  const ok = row({ market_price: 300, total_price_usd: 150, is_graded: true });
  assert.equal(savingUsd(noRef), null);
  assert.equal(savingUsd(inverted), null);
  const out = rankFlagshipDeals([noRef, inverted, ok], { freshnessOf: FRESH, limit: 4 });
  assert.deepEqual(out.map((d) => d.id), [ok.id]);
});

test("ordering is deterministic and stable across shuffles", () => {
  const rows = [
    row({ id: 10, watchlist_id: 10, discount_pct: 0.55, market_price: 500, total_price_usd: 225, is_graded: true }),
    row({ id: 11, watchlist_id: 11, discount_pct: 0.62, market_price: 150, total_price_usd: 57, visual_authenticity_status: "MATCH" }),
    row({ id: 12, watchlist_id: 12, discount_pct: 0.5, market_price: 900, total_price_usd: 450, is_graded: true }),
    row({ id: 13, watchlist_id: 13, discount_pct: 0.6, market_price: 120, total_price_usd: 48, is_graded: false, visual_authenticity_status: null }),
  ];
  const a = rankFlagshipDeals(rows, { freshnessOf: FRESH, limit: 10 }).map((d) => d.id);
  const b = rankFlagshipDeals([...rows].reverse(), { freshnessOf: FRESH, limit: 10 }).map((d) => d.id);
  const c = rankFlagshipDeals([rows[2], rows[0], rows[3], rows[1]], { freshnessOf: FRESH, limit: 10 }).map((d) => d.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test("preferLocal (country view) puts in-country listings first, then composite", () => {
  const localWeak = row({ id: 21, watchlist_id: 21, is_local: true, discount_pct: 0.35, market_price: 120, total_price_usd: 78, is_graded: true });
  const foreignStrong = row({ id: 22, watchlist_id: 22, is_local: false, discount_pct: 0.62, market_price: 700, total_price_usd: 266, is_graded: true });
  assert.equal(rankFlagshipDeals([localWeak, foreignStrong], { freshnessOf: FRESH, preferLocal: true, limit: 4 })[0].id, 21);
  assert.equal(rankFlagshipDeals([localWeak, foreignStrong], { freshnessOf: FRESH, preferLocal: false, limit: 4 })[0].id, 22);
});

test("the flagship lane holds at most `limit` tiles and never pads", () => {
  const two = [
    row({ watchlist_id: 1, is_graded: true, market_price: 300, total_price_usd: 150 }),
    row({ watchlist_id: 2, is_graded: true, market_price: 300, total_price_usd: 150 }),
  ];
  assert.equal(rankFlagshipDeals(two, { freshnessOf: FRESH, limit: 4 }).length, 2);
  assert.equal(rankFlagshipDeals([], { freshnessOf: FRESH, limit: 4 }).length, 0);
});

// --- integration-shape guards on lib/deals.js --------------------------

test("shared flagship selection is BIN-only + rankFlagshipDeals; auction lane stays auction-capable; All Deals untouched", () => {
  const src = read("lib/deals.js");
  // the Buy It Now contract is applied ONCE, in the shared candidate query
  assert.match(src, /const FLAGSHIP_BUY_NOW_LISTING_TYPE = "FIXED_PRICE"/);
  assert.match(src, /function flagshipCandidateQuery[\s\S]{0,700}\.eq\("listing_type", FLAGSHIP_BUY_NOW_LISTING_TYPE\)/);
  assert.match(src, /function selectFlagshipDeals[\s\S]{0,400}rankFlagshipDeals\(premiumDisplayable\(data\), \{/);
  // auction lane unchanged - still queries AUCTION and orders by end time
  assert.match(src, /fetchAuctionsEndingSoonUncached[\s\S]{0,600}\.eq\("listing_type", "AUCTION"\)/);
  assert.match(src, /fetchAuctionsEndingSoonUncached[\s\S]{0,1200}\.order\("auction_end_at", \{ ascending: true \}\)/);
  // All Deals / pool / pagination never touch the flagship ranker
  assert.ok(!/fetchDealsPoolUncached[\s\S]{0,1500}rankFlagshipDeals/.test(src));
  assert.ok(!/fetchDealsPageUncached[\s\S]{0,2500}rankFlagshipDeals/.test(src));
});

// --- 13C.2.1: each surface has its OWN explicit contract --------------

test("13C.2.1 - three distinct public selectors, one shared ranking primitive", () => {
  const src = read("lib/deals.js");
  for (const fn of ["fetchHomepageFlagshipDeals", "fetchBestFinds", "fetchDigestDeals"]) {
    assert.match(src, new RegExp(`export const ${fn} = unstable_cache\\(`), `${fn} must be its own public export`);
  }
  // distinct cache keys so one surface's revalidation can't touch another
  for (const key of ['"homepage-flagship"', '"best-finds"', '"digest-deals"']) {
    assert.ok(src.includes(key), `missing distinct cache key ${key}`);
  }
  // the ranking formula lives in exactly one place - lib/flagshipRanking,
  // via the single shared selectFlagshipDeals. No second rankFlagshipDeals
  // call, no re-implemented discount/saving math in lib/deals.js.
  assert.equal((src.match(/rankFlagshipDeals\(/g) ?? []).length, 1, "rankFlagshipDeals must be called from exactly one shared place");
  assert.ok(!/discountComponent|savingComponent|Math\.log10\(1 \+/.test(src), "ranking math must not be duplicated into lib/deals.js");
});

test("13C.2.1 - the digest pins 'no auctions' INDEPENDENTLY of the homepage flagship", () => {
  const src = read("lib/deals.js");
  // fetchDigestDeals re-asserts the buy-now listing type itself, so a
  // future change to selectFlagshipDeals / flagshipCandidateQuery cannot
  // silently let auctions into the email.
  const digest = src.match(/export const fetchDigestDeals = unstable_cache\([\s\S]*?\n\);/);
  assert.ok(digest, "fetchDigestDeals export not found");
  assert.match(
    digest[0],
    /\.filter\(\(d\) => d\.listing_type === FLAGSHIP_BUY_NOW_LISTING_TYPE\)/,
    "the digest must independently filter to the buy-now listing type"
  );
});

test("13C.2.1 - callers wired to their intended selector", () => {
  const home = read("app/page.js");
  // P0.4.1 - the homepage now gets its flagship tiles through the curated
  // lane builder, which internally uses the SAME shared selectFlagshipDeals
  // (asserted in lib/deals.js below). It must not call the generic
  // fetchBestFinds, and it must not re-implement flagship ranking.
  assert.match(home, /fetchHomepageLanes\(/);
  assert.ok(!/fetchBestFinds\b/.test(home), "homepage must not call the generic fetchBestFinds");
  const deals = read("lib/deals.js");
  assert.match(
    deals,
    /fetchHomepageLanesUncached[\s\S]*?selectFlagshipDeals\(\{ limit: 60/,
    "the homepage lane builder must reuse the shared selectFlagshipDeals, not a new ranking path"
  );

  const bf = read("app/best-finds/page.js");
  assert.match(bf, /fetchBestFinds\(\{ limit: 10/);

  const digest = read("app/api/send-digest/route.js");
  assert.match(digest, /import \{ fetchDigestDeals \} from "@\/lib\/deals"/);
  assert.match(digest, /fetchDigestDeals\(\{ limit: DEAL_COUNT \}\)/);
  assert.ok(!/fetchBestFinds\b/.test(digest), "digest must not call fetchBestFinds");
});

test("13C.2.1 - digest email renders a plain purchase price + '% below market', no auction-only framing", () => {
  // strip comments so the guard checks RENDERED strings, not prose
  const code = read("app/api/send-digest/route.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  // rows show total_price and "% below market" - fine for a fixed price
  assert.match(code, /% below market/);
  // must NOT carry auction-bid framing (would be a lie for a BIN row and
  // the digest is BIN-only anyway)
  assert.ok(!/current bid|can rise|Bid on eBay|ending in|auction ends/i.test(code), "digest email must not use auction-bid wording");
  // and it must not tell the reader to 'Buy now at $X' as if we sell it
  assert.ok(!/buy now at|purchase for \$|checkout/i.test(code));
});

test("no user-facing 'Deal Score' / ranking number is rendered", () => {
  // the render surfaces must not name or show an internal score
  for (const f of ["components/DealCard.js", "app/page.js", "app/best-finds/page.js"]) {
    const src = read(f);
    assert.ok(!/Deal Score|AI Score|Buy Score|Hotness Score|"?dealScore"?|flagshipScore/.test(src), `${f} references an internal score`);
  }
  // the ranker never sends the score into analytics either
  assert.ok(!/capture\([^)]*score|data-analytics[^"]*score|track\([^)]*[Ss]core/.test(read("lib/deals.js")), "lib/deals.js pipes a ranking score into analytics");
  // flagshipScore is exported for tests only - it must not be imported by any component
  const comp = read("components/DealCard.js");
  assert.ok(!/flagshipRanking|flagshipScore/.test(comp), "DealCard must not import the flagship ranker");
});
