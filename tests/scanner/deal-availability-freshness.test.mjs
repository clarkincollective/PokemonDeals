// P0.2 - Deal availability, freshness & new-deal discovery integrity.
//
// Incident: a card discovered ~4-5 days earlier was still shown as a live,
// buyable deal on prominent surfaces after the underlying eBay listing had
// actually sold. Root cause (confirmed live against production, see
// docs/p02-availability-incident.md): `last_seen_at` was the ONLY
// freshness timestamp, written both by an authoritative single-item
// verification (app/api/verify-deals) AND by a non-authoritative broad
// discovery/search re-scan (app/api/refresh-deals) - so a listing that was
// discovered once and never independently re-confirmed could still read as
// "recently seen" for its entire TTL window even though it had sold hours
// after being found. A random production sample of such never-re-confirmed
// rows found roughly 1 in 3 already sold.
//
// Fix: a new `exact_verified_at` timestamp, written ONLY by a positive
// single-item eBay response, required (in addition to the existing
// last_seen_at-based isDisplayableDeal gate) for premium/flagship
// placement (isPremiumDealEligible) - plus a much shorter last_seen_at TTL
// for ordinary display, and a real maximum-discovery-age ceiling for the
// "Just Added" lane.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isDisplayableDeal,
  isPremiumDealEligible,
  hoursSinceExactVerification,
  isExactVerifiedFresh,
  discoveryAgeHours,
  PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS,
  JUST_ADDED_MAX_DISCOVERY_AGE_HOURS,
  FRESHNESS_TTL_HOURS,
  auctionEnded,
} from "../../lib/dealQuality.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const inFuture = (h) => new Date(Date.now() + h * HOUR).toISOString();

const deal = (over = {}) => ({
  id: 1,
  is_active: true,
  is_graded: false,
  title: "Charizard GX 9/68 SM Hidden Fates Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  card_name: "Charizard GX",
  card_set: "SM - Hidden Fates",
  card_tcgplayer_id: "191319",
  market_price: 40,
  discount_pct: 0.3,
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  first_seen_at: ago(1),
  last_seen_at: ago(1),
  exact_verified_at: ago(1),
  listing_id: "v1|123456789012|0",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  disqualified_reason: null,
  visual_authenticity_status: null,
  ...over,
});

// --- 1: the exact bug class - recent last_seen_at, no/old exact verification

test("1. recent last_seen_at WITHOUT recent exact verification is NOT premium-eligible (the P0.2 bug)", () => {
  // last_seen_at is fresh (1h ago), but exact_verified_at was never set -
  // this is precisely the reproduced production failure shape: discovered
  // once, never independently re-confirmed, still reads as "seen recently".
  const r = deal({ last_seen_at: ago(1), exact_verified_at: null });
  assert.equal(isDisplayableDeal(r), true); // ordinary display still shows it (shorter TTL, but 1h is fresh)
  assert.equal(isPremiumDealEligible(r), false); // premium/flagship/Just Added must not
});

test("1b. a NULL exact_verified_at reads as infinitely stale, never as 'assume live'", () => {
  assert.equal(hoursSinceExactVerification(deal({ exact_verified_at: null })), Infinity);
  assert.equal(isExactVerifiedFresh(deal({ exact_verified_at: null })), false);
});

test("1c. an old exact_verified_at (past the bound) is not fresh", () => {
  const r = deal({ exact_verified_at: ago(PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS + 1) });
  assert.equal(isExactVerifiedFresh(r), false);
  assert.equal(isPremiumDealEligible(r), false);
});

test("1d. a recent exact_verified_at (within the bound) IS fresh, and the deal remains eligible", () => {
  const r = deal({ exact_verified_at: ago(PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS - 1) });
  assert.equal(isExactVerifiedFresh(r), true);
  assert.equal(isPremiumDealEligible(r), true);
});

// --- 1e: verify-deals' Just Added priority tier must not lose its tie-break to highValue

test("1e. verify-deals: the Just-Added-candidate priority rank is distinct from highValue, not tied", () => {
  // Found live post-migration: a brand-new discovery has near-zero
  // staleness by definition, so if it shared a rank with highValue (whose
  // rows accumulate staleness over days) the staleness-descending
  // tie-break always picked highValue first, starving Just Added.
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  const rankFn = src.slice(src.indexOf("const rank = (r)"), src.indexOf("pool.sort("));
  const justAddedRank = Number(rankFn.match(/if \(justAddedCandidate\(r\)\) return (\d+);/)?.[1]);
  const highValueRank = Number(rankFn.match(/if \(highValue\(r\)\) return (\d+);/)?.[1]);
  assert.ok(Number.isFinite(justAddedRank) && Number.isFinite(highValueRank));
  assert.notEqual(justAddedRank, highValueRank, "justAddedCandidate must not share a rank tier with highValue");
});

test("1f. verify-deals: within the Just-Added tier, the tie-break favors the NEWEST discovery, not the oldest", () => {
  // Found live post-migration: fetchFreshFinds queries the newest N rows
  // (ORDER BY first_seen_at DESC). A staleness-descending tie-break favors
  // the OLDEST candidate within the 48h window (closest to falling out of
  // its own freshness TTL) - the opposite of what that query needs
  // verified first. Confirmed live: 299/470 rows in the 48h window were
  // verified, but 0 of the newest 72 fetchFreshFinds actually reads.
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  const tieBreakSrc = src.slice(src.indexOf("const tieBreak = (r)"), src.indexOf("pool.sort("));
  assert.match(tieBreakSrc, /justAddedCandidate\(r\)\s*\?\s*discoveryAgeHours\(r,\s*now\)/, "justAddedCandidate rows must tie-break on discoveryAgeHours ascending (newest first)");
});

// --- 2: a sold/ended listing cannot be premium-eligible regardless of score

test("2. is_active=false (the outcome of a definitive SOLD/ENDED verification) can never be premium-eligible", () => {
  const r = deal({ is_active: false, exact_verified_at: ago(0.1) });
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(isPremiumDealEligible(r), false);
});

// --- 3: an ended auction cannot be premium-eligible even with a fresh exact verification

test("3. an ended auction cannot be premium-eligible even with a perfectly fresh exact verification", () => {
  const r = deal({
    listing_type: "AUCTION",
    auction_end_at: ago(0.5), // ended 30 min ago
    exact_verified_at: ago(0.01), // "verified" moments ago
  });
  assert.equal(auctionEnded(r), true);
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(isPremiumDealEligible(r), false);
});

test("3b. a live auction with a fresh exact verification remains eligible", () => {
  const r = deal({ listing_type: "AUCTION", auction_end_at: inFuture(20), exact_verified_at: ago(1) });
  assert.equal(auctionEnded(r), false);
  assert.equal(isPremiumDealEligible(r), true);
});

// --- 4: availability is an eligibility gate, checked before any ranking score

test("4. isPremiumDealEligible rejects on availability BEFORE any score/ranking concept applies", () => {
  // A spectacular discount + high value (the shape that would otherwise
  // dominate a ranking) must still be rejected purely on staleness.
  const spectacularButUnverified = deal({
    market_price: 900,
    discount_pct: 0.8,
    exact_verified_at: null,
  });
  assert.equal(isPremiumDealEligible(spectacularButUnverified), false);
});

// --- 5: ordinary display TTL was tightened, and is evidence-based, not arbitrary

test("5. FRESHNESS_TTL_HOURS was tightened from the pre-P0.2 72h/120h/168h tiers", () => {
  assert.equal(FRESHNESS_TTL_HOURS.high, 24);
  assert.equal(FRESHNESS_TTL_HOURS.mid, 36);
  assert.equal(FRESHNESS_TTL_HOURS.low, 48);
  // still ordered high < mid < low, and all well under a week
  assert.ok(FRESHNESS_TTL_HOURS.high < FRESHNESS_TTL_HOURS.mid);
  assert.ok(FRESHNESS_TTL_HOURS.mid < FRESHNESS_TTL_HOURS.low);
  assert.ok(FRESHNESS_TTL_HOURS.low <= 72);
});

test("5b. a deal untouched since discovery for exactly its tier TTL is stale (ordinary display too)", () => {
  const r = deal({ market_price: 400, discount_pct: 0.75, last_seen_at: ago(FRESHNESS_TTL_HOURS.high + 1), exact_verified_at: null });
  assert.equal(isDisplayableDeal(r), false);
});

// --- 6: Just Added discovery-age ceiling

test("6. discoveryAgeHours + JUST_ADDED_MAX_DISCOVERY_AGE_HOURS reject an old discovery", () => {
  const fourDaysOld = deal({ first_seen_at: ago(96), exact_verified_at: ago(1) });
  assert.ok(discoveryAgeHours(fourDaysOld) > JUST_ADDED_MAX_DISCOVERY_AGE_HOURS);
  assert.equal(JUST_ADDED_MAX_DISCOVERY_AGE_HOURS, 48);
});

test("6b. fetchFreshFinds enforces a real first_seen_at ceiling and never backfills with older rows", () => {
  const src = readFileSync(join(HERE, "..", "..", "lib", "deals.js"), "utf8");
  const fn = src.slice(src.indexOf("async function fetchFreshFindsUncached"), src.indexOf("export const fetchFreshFinds"));
  assert.match(fn, /JUST_ADDED_MAX_DISCOVERY_AGE_HOURS/);
  assert.match(fn, /\.gte\("first_seen_at",\s*cutoff\)/);
  // still the premium gate (exact-verification requirement included)
  assert.match(fn, /premiumDisplayable\(data\)/);
  // no padding: the loop only ever pushes real qualifying rows and stops
  // at `limit` - it must not reach back into a wider/older query on a
  // short result.
  assert.doesNotMatch(fn, /\.limit\(limit \* 6\)[\s\S]*(fetchDealsPool|fallback)/i);
});

// --- 7: fallback ("variety pool") cannot resurrect stale/inactive inventory

test("7. the fallback variety pool (fetchDealsPool) still filters through the ordinary display gate", () => {
  const src = readFileSync(join(HERE, "..", "..", "lib", "deals.js"), "utf8");
  const fn = src.slice(src.indexOf("async function fetchDealsPoolUncached"), src.indexOf("export const fetchDealsPool"));
  assert.match(fn, /\.eq\("is_active",\s*true\)/);
  assert.match(fn, /displayable\(data\)/); // isDisplayableDeal-backed, never an unfiltered pass-through
});

// --- 8: the verify-deals route's outcome handling (structural - no live network/DB) ---

test("8. verify-deals: a definitive SOLD/ENDED result deactivates and stamps the check time", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  assert.match(src, /status === "ENDED" \|\| status === "SOLD"/);
  const branch = src.slice(src.indexOf('status === "ENDED" || status === "SOLD"'));
  const patchLine = branch.slice(0, branch.indexOf("} else if"));
  assert.match(patchLine, /is_active:\s*false/);
});

test("9. verify-deals: an UNKNOWN (transient failure) result never writes to the database", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  // the only two branches that call db.from("deals").update(...) are the
  // ENDED/SOLD and ACTIVE branches; there must be no update call reachable
  // when status is UNKNOWN.
  const loopStart = src.indexOf("for (const r of batch)");
  const loopBody = src.slice(loopStart, src.indexOf("\n  }\n", loopStart));
  const updateCalls = (loopBody.match(/db\.from\("deals"\)\.update/g) ?? []).length;
  assert.equal(updateCalls, 2, "exactly two update sites: SOLD/ENDED and ACTIVE - none for UNKNOWN");
  assert.match(loopBody, /UNKNOWN: untouched|never retire, never stamp/i);
});

test("10. verify-deals: the reserve guard runs before any listing calls, and protects the documented floor", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  assert.match(src, /const RESERVE = 800/);
  assert.match(src, /rl\.remaining - BATCH < RESERVE/);
  const guardIdx = src.indexOf("rl.remaining - BATCH < RESERVE");
  const loopIdx = src.indexOf("for (const r of batch)");
  assert.ok(guardIdx > 0 && guardIdx < loopIdx, "the quota guard must run before any getListingFreshness calls");
  // the batch size increase is real but bounded - not an unbounded/greedy read
  const batchMatch = src.match(/const BATCH = (\d+)/);
  assert.ok(batchMatch);
  const batch = Number(batchMatch[1]);
  assert.ok(batch > 12 && batch <= 40, "BATCH raised from the old 12, but still conservatively bounded");
});

test("11. verify-deals: exact_verified_at is only ever written after a real getListingFreshness call, never fabricated", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "api", "verify-deals", "route.js"), "utf8");
  const loopStart = src.indexOf("for (const r of batch)");
  const loopBody = src.slice(loopStart, src.indexOf("\n  }\n", loopStart));
  const getCallIdx = loopBody.indexOf("getListingFreshness(");
  const firstWriteIdx = loopBody.indexOf("exact_verified_at:");
  assert.ok(getCallIdx >= 0 && firstWriteIdx > getCallIdx, "exact_verified_at is written only after the eBay call resolves");
});

// --- 12: no synchronous eBay verification was added to page rendering ---

test("12. no deal-detail/homepage render path calls eBay verification directly", () => {
  const files = [
    "app/deals/[id]/page.js",
    "app/page.js",
  ];
  for (const f of files) {
    const src = readFileSync(join(HERE, "..", "..", f), "utf8");
    assert.doesNotMatch(src, /getListingFreshness/, `${f} must not call eBay verification synchronously at render time`);
  }
});

// --- 13: expired deal page is truthful, no old live CTA, no auto-redirect ---

test("13. the expired-deal branch never renders an active-purchase CTA for the old listing", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "deals", "[id]", "page.js"), "utf8");
  // Two occurrences of this condition exist (generateMetadata's early
  // return, and the page component's rendered branch below it) - the
  // rendered branch is the second one.
  const first = src.indexOf("if (!shouldIndexDeal(deal) || !isDisplayableDeal(deal))");
  const branchStart = src.indexOf("if (!shouldIndexDeal(deal) || !isDisplayableDeal(deal))", first + 1);
  assert.ok(branchStart > first, "expected a second occurrence (the rendered page branch)");
  // Anchor on the next distinctive comment AFTER the branch, rather than
  // counting braces (the branch's own JSX contains several "\n  }\n"-shaped
  // lines that would false-match a naive search).
  const branchEnd = src.indexOf("// cardHub is only non-null when", branchStart);
  assert.ok(branchEnd > branchStart);
  const branch = src.slice(branchStart, branchEnd);
  assert.doesNotMatch(branch, /href=\{deal\.affiliate_url\}/, "must not link the old listing as if still buyable");
  assert.doesNotMatch(branch, /View Deal|Bid Now/i, "must not reuse the live-deal CTA copy");
  assert.doesNotMatch(branch, /redirect\(/i, "must not auto-redirect");
  assert.match(branch, /ended|expired|not found/i);
  // a truthful path forward is offered
  assert.match(branch, /current listings|Back to all deals/i);
});

// --- 13b: the deal-detail loader can actually see a deactivated deal -----

test("13b. loadDeal uses the admin client, not the RLS-limited public client, so a deactivated deal is fetchable", () => {
  // RLS only grants public SELECT on is_active=true rows
  // (supabase/deals_schema.sql) - the public `supabase` client used here
  // would make a deactivated deal invisible entirely (data: null),
  // collapsing test 13's "This deal has ended" branch back into the
  // generic "Deal not found" text with no card context, for the single
  // most common real case (an actually sold/deactivated deal).
  const src = readFileSync(join(HERE, "..", "..", "app", "deals", "[id]", "page.js"), "utf8");
  const fnStart = src.indexOf("const loadDealUncached");
  const fnEnd = src.indexOf("\n};", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /supabaseAdmin\(\)/);
  assert.doesNotMatch(fn, /\bsupabase\s*\n?\s*\.from\("deals"\)/, "must not use the RLS-limited public client");
});

// --- 14: 13C ranking/section/layout contract untouched by this phase ---

test("14. this phase does not touch flagship/auction ranking score weights", () => {
  const flagship = readFileSync(join(HERE, "..", "..", "lib", "flagshipRanking.js"), "utf8");
  const auction = readFileSync(join(HERE, "..", "..", "lib", "auctionLaneRanking.js"), "utf8");
  assert.match(flagship, /DISCOUNT_WEIGHT\s*=\s*0\.5/);
  assert.match(flagship, /SAVING_WEIGHT\s*=\s*0\.5/);
  assert.match(auction, /DISCOUNT_WEIGHT\s*=\s*0\.5/);
  assert.match(auction, /GAP_WEIGHT\s*=\s*0\.5/);
});
