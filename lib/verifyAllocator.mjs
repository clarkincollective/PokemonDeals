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
  dealFreshness,
  hoursSinceExactVerification,
  JUST_ADDED_MAX_DISCOVERY_AGE_HOURS,
} from "./dealQuality.js";
import { identityConflictKeys } from "./allDealsInventory.js";

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

// --- graded-retention-r1: GRADED FIXED-PRICE RETENTION SLOTS ---------
//
// WHY (production, read-only, 2026-09-14): of 61 graded rows first seen in
// 7 days, 45 went inactive with no sold/ended evidence - they aged past the
// freshness TTL (last_seen_at) before any exact check reached them; 572 of
// 654 graded rows were never checked. Graded inventory is small (14
// displayable), so a listing that times out while still live is a large
// share of it.
//
// WHAT: up to GRADED_RETENTION_SLOTS of the SAME batch go to active,
// display-eligible graded FIXED-PRICE rows in the AGING half of their real
// freshness window (dealFreshness: last_seen_at against freshnessTierTtl),
// soonest cutoff first. A successful ACTIVE check writes last_seen_at =
// exact_verified_at = now (verify-deals), which is the evidence that
// freshness policy and /api/sweep-stale-deals read, so a confirmed row
// leaves the AGING window instead of being picked again. UNKNOWN writes
// nothing and SOLD / ENDED retire through the existing guarded helper.
//
// ATTEMPT COOLDOWN: an UNKNOWN verdict writes nothing to the row, so without
// a record the same aging row would win the lane every run until it timed
// out. Every retention attempt is recorded, keyed by the exact eBay item
// (legacy id - every marketplace copy of one listing shares it), in the
// existing catalog_snapshot(kind) blob table - separate from availability
// evidence (last_seen_at / exact_verified_at are never touched by it). An
// item attempted within GRADED_RETENTION_RECHECK_HOURS is skipped by this
// lane only; the general ranking can still pick it. If the record cannot be
// read the lane takes 0 slots that run.
//
// COST: slots are taken OUT of the batch, never added, and only AFTER
// critical auctions and the BIN freshness reserve have been filled exactly
// as before; unused slots return to the general ranking. When used, they
// displace up to two general (lowest-ranked) verifications per run.
// Scales to 0 near the quota floor, same rule as the BIN reserve.
// Set GRADED_RETENTION_SLOTS = 0 to disable (selection identical to before).
export const GRADED_RETENTION_SLOTS = 2;
// A listing exactly checked, or attempted by this lane, this recently is not
// re-picked by this lane.
export const GRADED_RETENTION_RECHECK_HOURS = 2;
export const GRADED_RETENTION_ATTEMPTS_KIND = "verify_graded_retention_attempts";
const ATTEMPT_KEEP_HOURS = 24; // pruning horizon for the record (observability only)
const ATTEMPT_MAX_ENTRIES = 200;

export function gradedRetentionSlots(batch, { slots = GRADED_RETENTION_SLOTS, quotaRemaining = Infinity, reserve = 0 } = {}) {
  if (!(batch > 0) || !(slots > 0)) return 0;
  if (Number.isFinite(quotaRemaining) && quotaRemaining - batch < reserve + QUOTA_HEADROOM_FOR_BIN_RESERVE) return 0;
  return Math.min(Math.floor(slots), batch);
}

// The exact eBay item a row is a copy of ("v1|<legacy>|0" -> "<legacy>").
export function retentionAttemptKey(row) {
  const legacy = String(row?.listing_id ?? "").split("|")[1];
  return legacy ? legacy : row?.listing_id ? String(row.listing_id) : null;
}

// Stored blob -> { attempts: { [itemKey]: { at, status } } }; anything
// unrecognisable becomes an empty record.
export function normalizeRetentionAttempts(data) {
  const attempts = {};
  const src = data && typeof data === "object" && data.attempts && typeof data.attempts === "object" ? data.attempts : {};
  for (const [k, v] of Object.entries(src)) {
    if (v && Number.isFinite(Date.parse(v.at))) attempts[k] = { at: v.at, status: typeof v.status === "string" ? v.status : null };
  }
  return { attempts };
}

export function retentionAttemptedRecently(state, row, now = Date.now()) {
  const k = retentionAttemptKey(row);
  const at = k ? Date.parse(state?.attempts?.[k]?.at ?? "") : NaN;
  return Number.isFinite(at) && now - at < GRADED_RETENTION_RECHECK_HOURS * 3_600_000;
}

// Record (or update the status of) attempts for `rows`; prunes old entries.
export function withRetentionAttempts(state, rows, { now = Date.now(), statusById = null } = {}) {
  const attempts = { ...(state?.attempts ?? {}) };
  for (const r of rows) {
    const k = retentionAttemptKey(r);
    if (!k) continue;
    const status = statusById?.get(r.id) ?? null;
    const prev = attempts[k];
    attempts[k] = statusById && prev ? { ...prev, status } : { at: new Date(now).toISOString(), status };
  }
  const kept = Object.entries(attempts)
    .filter(([, v]) => now - Date.parse(v.at) < ATTEMPT_KEEP_HOURS * 3_600_000)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, ATTEMPT_MAX_ENTRIES);
  return { attempts: Object.fromEntries(kept) };
}

// Eligible for a graded retention slot. Uses only the existing gates;
// relaxes nothing. `conflicts` = listing keys whose stored copies disagree
// on catalogue identity (lib/allDealsInventory.identityConflictKeys);
// `attempts` = the durable retention attempt record.
export function gradedRetentionCandidate(row, now = Date.now(), { conflicts = new Set(), attempts = null } = {}) {
  if (!row?.is_graded) return false;
  if (row.listing_type === "AUCTION") return false;
  if (row.is_active === false) return false;
  if (row.disqualified_reason) return false; // quarantine / review hold / availability
  if (!isDisplayableDeal(row)) return false; // the full display gate (identity, language, early, stale)
  if (conflicts.has(String(row.listing_id ?? `row:${row.id}`))) return false;
  if (dealFreshness(row, now) !== "AGING") return false; // approaching the actual cutoff, not yet past it
  const checked = hoursSinceExactVerification(row, now);
  if (checked != null && Number.isFinite(checked) && checked < GRADED_RETENTION_RECHECK_HOURS) return false;
  if (retentionAttemptedRecently(attempts, row, now)) return false; // UNKNOWN cooldown, per exact item
  return true;
}

const hoursToFreshnessCutoff = (r, now) => freshnessTierTtl(r) - (hoursSinceSeen(r, now) ?? 0);

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
export function allocateVerifyBatch({ pool = [], batch = 20, now = Date.now(), quotaRemaining = Infinity, reserve = 0, gradedSlots = GRADED_RETENTION_SLOTS, retentionAttempts = null } = {}) {
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

  // 2b) graded-retention-r1: graded fixed-price rows nearest their real
  //     freshness cutoff - only from what critical auctions and the BIN
  //     reserve left, so both protected lanes fill exactly as before.
  const gradedSize = gradedRetentionSlots(batch, { slots: gradedSlots, quotaRemaining, reserve });
  let gradedSubpool = [];
  if (gradedSize > 0) {
    const conflicts = identityConflictKeys(pool);
    gradedSubpool = bins
      .filter((r) => !seen.has(r.id) && gradedRetentionCandidate(r, now, { conflicts, attempts: retentionAttempts }))
      .sort((a, b) => hoursToFreshnessCutoff(a, now) - hoursToFreshnessCutoff(b, now) || Number(b.market_price) - Number(a.market_price) || Number(a.id) - Number(b.id));
  }
  // one slot per exact eBay item, never an item already in this batch, so
  // marketplace copies of one listing cannot take extra slots
  const gradedItems = new Set([...criticalPicked, ...binPicked].map(retentionAttemptKey).filter(Boolean));
  const gradedPicked = [];
  for (const r of gradedSubpool) {
    if (gradedPicked.length >= Math.max(0, Math.min(gradedSize, batch - criticalPicked.length - binPicked.length))) break;
    const k = retentionAttemptKey(r);
    if (k && gradedItems.has(k)) continue;
    if (k) gradedItems.add(k);
    gradedPicked.push(...take([r], 1));
  }

  // 3) everything else, by the preserved P0.2 rank/tie-break, but with
  //    cooldown'd auctions dropped from the auction tier.
  const remainingSlots = batch - criticalPicked.length - binPicked.length - gradedPicked.length;
  const general = pool
    .filter((r) => !seen.has(r.id))
    .filter((r) => !(r.listing_type === "AUCTION" && auctionInCooldown(r, now)))
    .sort((a, b) => generalRank(a, now) - generalRank(b, now) || generalTieBreak(a, now) - generalTieBreak(b, now));
  const generalPicked = take(general, remainingSlots);

  const finalBatch = [...criticalPicked, ...binPicked, ...gradedPicked, ...generalPicked];
  const auctionsSkippedCooldown = auctions.filter((r) => auctionInCooldown(r, now) && !seen.has(r.id)).length;

  return {
    batch: finalBatch,
    // graded-retention-r1: the rows the lane picked, so the route can record
    // the attempt durably (the cooldown record)
    gradedRetention: gradedPicked,
    allocation: {
      batch_size: batch,
      critical_auctions: criticalPicked.length,
      graded_retention_slots: gradedSize,
      graded_retention_used: gradedPicked.length,
      graded_retention_ids: gradedPicked.map((r) => r.id),
      graded_retention_subpool_size: gradedSubpool.length,
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
