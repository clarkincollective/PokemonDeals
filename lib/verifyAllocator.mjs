// Phase P0.4.3 - VERIFY-DEALS BATCH ALLOCATOR (pure, deterministic).
//
// WHY: `app/api/verify-deals` ranked EVERY active auction (rank 0) ahead
// of every fixed-price (BIN) row, with NO cooldown - it re-sorted by
// `auction_end_at` each run and re-verified the ~20 soonest-ending
// auctions every cycle. With ~270 active auctions there were always >= 20
// at rank 0, so BIN rows (rank 2-4) were structurally unreachable:
// production showed 0 BIN rows verified within 24h while 20 auctions sat
// at <=1h. Strong BIN inventory (discount >= 30%, canonical art) was
// 100% stale for social / premium placement.
//
// THIS MODULE changes ONLY the batch composition:
//   1. an auction reverify COOLDOWN tiered by time-to-end - a 4-day-out
//      auction does not need repricing every 30 min; one ending in an
//      hour still does. This alone frees most of the batch.
//   2. a bounded BIN FRESHNESS RESERVE - a small, fixed slice of the
//      batch for displayable BIN rows aging toward the freshness ceiling.
//      It is a SOFT prioritisation signal: it changes NO threshold, NO
//      market reference, NO qualification, NO cooldown safety. It only
//      decides which already-eligible rows get a Browse slot first.
//   3. the reserve SCALES TO ZERO as Browse quota approaches the reserve
//      floor - auction safety is never traded for BIN freshness.
//
// It imports only pure helpers from lib/dealQuality.js. No network.

import {
  isDisplayableDeal,
  isVerificationCandidate,
  discoveryAgeHours,
  hoursSinceSeen,
  freshnessTierTtl,
  hoursSinceExactVerification,
  JUST_ADDED_MAX_DISCOVERY_AGE_HOURS,
} from "./dealQuality.js";

// --- constants (all derived from the current production picture) -----

// A never-changing safety window: an auction ending within this is ALWAYS
// eligible for a re-price, cooldown or not - its price is locking in.
export const AUCTION_CRITICAL_HOURS = 1.5;

// Reverify cooldown for an auction NOT in the critical window, by how
// long until it ends. An auction re-priced inside its window is skipped
// this run and picked up once the window lapses.
export function auctionReverifyCooldownHours(row, now = Date.now()) {
  if (row?.exact_verified_at == null) return 0; // never verified -> always due
  const endMs = Date.parse(row?.auction_end_at ?? "");
  const hoursToEnd = Number.isFinite(endMs) ? (endMs - now) / 3_600_000 : Infinity;
  if (hoursToEnd <= AUCTION_CRITICAL_HOURS) return 0;
  if (hoursToEnd <= 12) return 0.75;
  if (hoursToEnd <= 48) return 3;
  return 8;
}

export function auctionInCooldown(row, now = Date.now()) {
  const cd = auctionReverifyCooldownHours(row, now);
  if (cd === 0) return false;
  return hoursSinceExactVerification(row, now) < cd;
}

// The BIN freshness reserve: a fixed fraction of the batch, floored to an
// integer, that scales down to 0 near the quota reserve.
export const BIN_RESERVE_FRACTION = 0.35;
export const QUOTA_HEADROOM_FOR_BIN_RESERVE = 250; // extra headroom over `reserve` before the BIN reserve is allowed

export function binFreshnessReserveSize(batch, { quotaRemaining = Infinity, reserve = 0 } = {}) {
  if (!(batch > 0)) return 0;
  // quota near the floor -> auction safety only.
  if (Number.isFinite(quotaRemaining) && quotaRemaining - batch < reserve + QUOTA_HEADROOM_FOR_BIN_RESERVE) return 0;
  return Math.max(0, Math.round(batch * BIN_RESERVE_FRACTION));
}

// --- 17C.9: the SEALED slice ----------------------------------------
//
// Sealed rows live in their own table and are not in `pool`, so without an
// explicit carve-out they would either never be verified or would be added
// ON TOP of BATCH and break the per-run call ceiling. This takes sealed
// slots OUT of the same BATCH (never added to it), so the route's ceiling
// stays 20 calls/run and the RESERVE guard is untouched.
//
// SIZING (measured, not guessed). An early sealed listing needs one
// positive exact check per refresh cycle: the daily sealed scan rewrites
// last_seen_at on every row it still sees, which breaks the
// exact_verified_at === last_seen_at equality isPositiveActiveConfirmation
// requires - so a confirmation survives at most until the next daily scan.
// Demand is therefore (early sealed rows) per day, not per run:
//   today                     0 rows  (no active sealed row is early - the
//                                     138 30th listings sit on a 2021
//                                     product whose set has no release
//                                     record, so they are not early AS
//                                     BOUND; see the readiness report)
//   after the catalogue fix   138 rows (all 138 become early once re-homed
//                                     to "ME: 30th Celebration", 2026-09-16)
// 3 slots x 48 runs/day = 144/day covers 138 with headroom, and costs 144
// of the 960 daily card-verification calls (15%), i.e. 3 of every 20 slots.
export const SEALED_MAX_PER_RUN = 3;

// Sealed slots for this run. Zero when nothing is due, and zero when quota
// is near the floor - card auction safety is never traded for sealed
// freshness, the same rule the BIN reserve already follows.
export function sealedVerifySlots({ batch = 20, sealedDue = 0, quotaRemaining = Infinity, reserve = 0 } = {}) {
  if (!(batch > 0) || !(sealedDue > 0)) return 0;
  if (Number.isFinite(quotaRemaining) && quotaRemaining - batch < reserve + QUOTA_HEADROOM_FOR_BIN_RESERVE) return 0;
  return Math.max(0, Math.min(SEALED_MAX_PER_RUN, Math.floor(sealedDue), batch));
}

// What the card lanes are left with once sealed has taken its slice. The
// total is ALWAYS `batch` - this is a split, never an increase.
export function cardSlotsAfterSealed(batch = 20, sealedSlots = 0) {
  return Math.max(0, batch - sealedSlots);
}

// The threshold at which a still-valid BIN row is "aging toward stale for
// social/premium" - half the 6h social ceiling. This is a SOFT signal for
// ordering only; it is NOT a qualification rule.
export const BIN_AGING_HOURS = 3;
export const BIN_MIN_DISCOUNT = 0.15; // same "real deal, not shallow" bar the tier model already uses - NOT new

const hasCanonicalArt = (r) => /^\d+$/.test(String(r?.card_tcgplayer_id ?? "").trim());
const isBin = (r) => r?.listing_type !== "AUCTION";

// A row eligible for the BIN freshness reserve. Uses ONLY existing facts;
// invents no candidate and relaxes nothing.
export function binReserveCandidate(row, now = Date.now(), { agingHours = BIN_AGING_HOURS } = {}) {
  if (!isBin(row)) return false;
  // the shared display/quality gate, minus the early-availability rule the
  // verifier itself exists to satisfy (17C.7) - no quota change
  if (!isVerificationCandidate(row)) return false;
  if (!hasCanonicalArt(row)) return false; // no exact-printing art to composite for social
  if (!(Number(row.discount_pct) >= BIN_MIN_DISCOUNT)) return false;
  const age = hoursSinceExactVerification(row, now);
  return age == null || !Number.isFinite(age) || age > agingHours; // never verified, or aging
}

// Ordering inside the BIN reserve sub-pool: never-verified first, then
// oldest exact_verified_at, then strongest discount as a stable tiebreak.
function binReserveSort(a, b, now) {
  const aa = hoursSinceExactVerification(a, now);
  const ab = hoursSinceExactVerification(b, now);
  const an = aa == null || !Number.isFinite(aa);
  const bn = ab == null || !Number.isFinite(ab);
  if (an !== bn) return an ? -1 : 1;
  if (!an && !bn && aa !== ab) return ab - aa; // older (larger age) first
  return Number(b.discount_pct) - Number(a.discount_pct);
}

// --- the existing rank/tieBreak (preserved verbatim in intent) -------
// so the "general" slots after critical-auctions + BIN-reserve keep the
// exact P0.2 behaviour.
function generalRank(r, now) {
  const isAuction = r.listing_type === "AUCTION";
  const justAdded = discoveryAgeHours(r, now) <= JUST_ADDED_MAX_DISCOVERY_AGE_HOURS && r.exact_verified_at == null;
  const highValue = Number(r.market_price) >= 300 || Number(r.discount_pct) >= 0.7;
  const midValue = Number(r.market_price) >= 100;
  if (isAuction) return 0;
  if (justAdded) return 1;
  if (highValue) return 2;
  if (midValue) return 3;
  return 4;
}
function generalTieBreak(r, now) {
  const isAuction = r.listing_type === "AUCTION";
  const justAdded = discoveryAgeHours(r, now) <= JUST_ADDED_MAX_DISCOVERY_AGE_HOURS && r.exact_verified_at == null;
  if (isAuction) return Date.parse(r.auction_end_at ?? "") || Number.MAX_SAFE_INTEGER;
  if (justAdded) return discoveryAgeHours(r, now);
  return -(hoursSinceSeen(r, now) / freshnessTierTtl(r)); // -staleness
}

// --- THE ALLOCATOR --------------------------------------------------
//
// `pool` is the already-filtered displayable+legacy-id candidate list.
// Returns { batch:[rows], allocation:{...observability...} }. Deterministic
// for a fixed (pool, batch, now, quota).
export function allocateVerifyBatch({ pool = [], batch = 20, now = Date.now(), quotaRemaining = Infinity, reserve = 0 } = {}) {
  const seen = new Set();
  const take = (rows, cap) => {
    const out = [];
    for (const r of rows) {
      if (out.length >= cap) break;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  };

  const auctions = pool.filter((r) => r.listing_type === "AUCTION");
  const bins = pool.filter((r) => r.listing_type !== "AUCTION");

  // 1) critical auctions (ending very soon) - always, ahead of everything.
  const critical = auctions
    .filter((r) => {
      const endMs = Date.parse(r.auction_end_at ?? "");
      const h = Number.isFinite(endMs) ? (endMs - now) / 3_600_000 : Infinity;
      return h <= AUCTION_CRITICAL_HOURS;
    })
    .sort((a, b) => (Date.parse(a.auction_end_at ?? "") || 0) - (Date.parse(b.auction_end_at ?? "") || 0));
  const criticalPicked = take(critical, batch);

  // 2) BIN freshness reserve.
  const reserveSize = binFreshnessReserveSize(batch, { quotaRemaining, reserve });
  const binSubpool = bins.filter((r) => binReserveCandidate(r, now)).sort((a, b) => binReserveSort(a, b, now));
  const binPicked = take(binSubpool, Math.max(0, Math.min(reserveSize, batch - criticalPicked.length)));

  // 3) everything else, by the preserved P0.2 rank/tie-break, but with
  //    cooldown'd auctions dropped from the auction tier.
  const remainingSlots = batch - criticalPicked.length - binPicked.length;
  const general = pool
    .filter((r) => !seen.has(r.id))
    .filter((r) => !(r.listing_type === "AUCTION" && auctionInCooldown(r, now)))
    .sort((a, b) => generalRank(a, now) - generalRank(b, now) || generalTieBreak(a, now) - generalTieBreak(b, now));
  const generalPicked = take(general, remainingSlots);

  const finalBatch = [...criticalPicked, ...binPicked, ...generalPicked];
  const auctionsSkippedCooldown = auctions.filter((r) => auctionInCooldown(r, now) && !seen.has(r.id)).length;

  return {
    batch: finalBatch,
    allocation: {
      batch_size: batch,
      critical_auctions: criticalPicked.length,
      bin_reserve_size: reserveSize,
      bin_reserve_used: binPicked.length,
      bin_subpool_size: binSubpool.length,
      general_slots: generalPicked.length,
      auctions_skipped_cooldown: auctionsSkippedCooldown,
      verify_mix_bin: finalBatch.filter((r) => r.listing_type !== "AUCTION").length,
      verify_mix_auction: finalBatch.filter((r) => r.listing_type === "AUCTION").length,
      quota_remaining: Number.isFinite(quotaRemaining) ? quotaRemaining : null,
    },
  };
}

// --- observability over the whole active pool (for the dashboard) ----
export function verifyHealthMetrics(rows = [], now = Date.now(), { socialCeilingHours = 6 } = {}) {
  const age = (r) => hoursSinceExactVerification(r, now);
  const fresh = (r, h) => Number.isFinite(age(r)) && age(r) <= h;
  const bin = rows.filter(isBin);
  const auc = rows.filter((r) => !isBin(r));
  const strongBin = (r) => isBin(r) && isDisplayableDeal(r) && hasCanonicalArt(r) && Number(r.discount_pct) >= 0.3;
  return {
    active_bin: bin.length,
    active_auction: auc.length,
    fresh_bin_1h: bin.filter((r) => fresh(r, 1)).length,
    fresh_bin_3h: bin.filter((r) => fresh(r, 3)).length,
    fresh_bin_6h: bin.filter((r) => fresh(r, socialCeilingHours)).length,
    fresh_auction_6h: auc.filter((r) => fresh(r, socialCeilingHours)).length,
    strong_bin_total: rows.filter(strongBin).length,
    strong_bin_fresh_6h: rows.filter((r) => strongBin(r) && fresh(r, socialCeilingHours)).length,
    strong_bin_aging_3_6h: rows.filter((r) => strongBin(r) && Number.isFinite(age(r)) && age(r) > 3 && age(r) <= socialCeilingHours).length,
    strong_bin_stale: rows.filter((r) => strongBin(r) && (age(r) == null || !Number.isFinite(age(r)) || age(r) > socialCeilingHours)).length,
    social_eligible_bin_count: rows.filter((r) => strongBin(r) && fresh(r, socialCeilingHours)).length,
    bin_never_verified: bin.filter((r) => r.exact_verified_at == null).length,
    auction_never_verified: auc.filter((r) => r.exact_verified_at == null).length,
  };
}
