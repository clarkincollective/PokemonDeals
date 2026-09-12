// Phase 17C.9 - the SEALED verification lane.
//
// Runs inside app/api/verify-deals, in slots carved OUT of that route's
// BATCH (never added to it), so the per-run call ceiling and the RESERVE
// guard are unchanged. EVERY sealed provider call and sealed write lives
// here rather than in the route, which keeps the card loop - and the
// source-scan tests that pin its two update sites and two snapshot calls -
// untouched.
//
// It reuses the card verifier's rules verbatim (lib/listingAvailability):
//   ACTIVE  -> last_seen_at = exact_verified_at = the SAME instant. That
//              equality IS the positive-confirmation rule
//              (isPositiveActiveConfirmation), so this is the only write
//              that can make an early sealed listing displayable.
//   SOLD    -> is_active=false, exact_verified_at, 'availability:sold'
//   ENDED   -> same, 'availability:not_found_in_marketplace'
//   UNKNOWN -> NOTHING. No retirement, no timestamp, no is_active change.
//              An inconclusive answer is not evidence, and a transient
//              failure must stay retryable.
//
// RECOVERY and the UNKNOWN marker. A retired row that a later sighting
// marked ':seen_again' gets at most RECOVERY_SLOTS_PER_RUN bounded
// re-check, taken out of the sealed slots. On UNKNOWN the recovery write
// consumes ONLY the marker (reason returns to its base family) - it
// advances neither exact_verified_at nor last_seen_at and never changes
// is_active. That is what bounds the retry: the row is not re-checked in a
// loop, it becomes eligible again after ANOTHER sighting re-marks it and
// the RECOVERY_MIN_HOURS_SINCE_CHECK window lapses. So "row untouched"
// describes a live row on UNKNOWN, and "marker consumed" describes a
// recovery row on UNKNOWN - two different paths, both retryable.

import {
  SEEN_AGAIN,
  RECOVERY_SLOTS_PER_RUN,
  RECOVERY_MIN_HOURS_SINCE_CHECK,
  RECOVERY_MAX_AGE_DAYS,
  availabilityRetirementReason,
  recoveryDecision,
} from "./listingAvailability.js";
import { isSealedVerificationCandidate } from "./dealQuality.js";

const H = 60 * 60 * 1000;
const SEALED_SELECT =
  "id, sealed_watchlist_id, listing_id, marketplace, title, market_price, discount_pct, " +
  "first_seen_at, last_seen_at, exact_verified_at, disqualified_reason, is_active, listing_type, " +
  "auction_end_at, listing_url, affiliate_url, " +
  "sealed_watchlist:sealed_watchlist_id!inner (name, set, tcgplayer_id)";

export const legacyOf = (listingId) => String(listingId ?? "").split("|")[1] || null;

// Never-verified first, then oldest exact_verified_at - the same ordering
// the card lane uses to keep confirmations spread evenly.
export function sealedVerifyOrder(a, b) {
  const av = Date.parse(a?.exact_verified_at ?? "");
  const bv = Date.parse(b?.exact_verified_at ?? "");
  const an = !Number.isFinite(av);
  const bn = !Number.isFinite(bv);
  if (an !== bn) return an ? -1 : 1;
  if (!an && !bn && av !== bv) return av - bv;
  return (a?.id ?? 0) - (b?.id ?? 0); // stable
}

// The due pool: active, displayable-except-early-availability, and
// addressable by an exact single-item lookup.
export function sealedVerifyPool(rows, now) {
  return (rows ?? [])
    .filter((r) => legacyOf(r.listing_id))
    .filter((r) => isSealedVerificationCandidate(r, now))
    .sort(sealedVerifyOrder);
}

// `db` and `getSnapshot` are injected so the real route path is testable
// with no network and no Supabase. `columnsReady` is the migration probe -
// without exact_verified_at there is nothing to write and the lane is a
// no-op that consumes zero slots (they return to the card lanes).
export async function runSealedVerifyLane({
  db,
  getSnapshot,
  maxSlots = 0,
  now = Date.now(),
  columnsReady = true,
} = {}) {
  const out = {
    used: 0,
    calls: 0,
    results: { ACTIVE: 0, SOLD: 0, ENDED: 0, UNKNOWN: 0 },
    recovery: { checked: 0, reactivate: 0, release: 0, retain: 0, writeSkipped: 0 },
    poolSize: 0,
    detail: [],
  };
  if (!(maxSlots > 0) || !columnsReady || !db || !getSnapshot) return out;

  // RECOVERY candidates first - bounded, and taken OUT of maxSlots.
  let recoveryRows = [];
  {
    const { data, error } = await db
      .from("sealed_deals")
      .select(SEALED_SELECT)
      .eq("is_active", false)
      .in("disqualified_reason", [SEEN_AGAIN.SOLD, SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE])
      .lte("exact_verified_at", new Date(now - RECOVERY_MIN_HOURS_SINCE_CHECK * H).toISOString())
      .gte("exact_verified_at", new Date(now - RECOVERY_MAX_AGE_DAYS * 24 * H).toISOString())
      .order("exact_verified_at", { ascending: true })
      .limit(RECOVERY_SLOTS_PER_RUN);
    if (!error) {
      recoveryRows = (data ?? []).filter((r) => legacyOf(r.listing_id)).slice(0, Math.min(RECOVERY_SLOTS_PER_RUN, maxSlots));
    }
  }

  // FRESH candidates for the remaining slots.
  let freshRows = [];
  const freshSlots = maxSlots - recoveryRows.length;
  if (freshSlots > 0) {
    const { data, error } = await db.from("sealed_deals").select(SEALED_SELECT).eq("is_active", true).limit(1000);
    if (!error) {
      const pool = sealedVerifyPool(data, now);
      out.poolSize = pool.length;
      freshRows = pool.slice(0, freshSlots);
    }
  }

  for (const r of [...recoveryRows, ...freshRows]) {
    const checkedAt = new Date().toISOString();
    const snap = await getSnapshot(legacyOf(r.listing_id), r.marketplace);
    out.calls += snap?.calls ?? 1;
    out.used += 1;
    const status = snap?.status ?? "UNKNOWN";

    if (recoveryRows.includes(r)) {
      out.recovery.checked += 1;
      const decision = recoveryDecision({ row: r, snapshot: snap, nowIso: checkedAt });
      // Conditional on the row still carrying the exact marker we read, so
      // a concurrent write is never clobbered.
      const { data: changed, error } = await db
        .from("sealed_deals")
        .update(decision.patch)
        .eq("id", r.id)
        .eq("is_active", false)
        .eq("disqualified_reason", r.disqualified_reason)
        .select("id");
      if (error || !(changed ?? []).length) out.recovery.writeSkipped += 1;
      else out.recovery[decision.action] += 1;
      out.detail.push({ id: r.id, status, recovery: decision.action });
      continue;
    }

    out.results[status] = (out.results[status] ?? 0) + 1;
    out.detail.push({ id: r.id, status, evidence: snap?.evidence ?? null });

    if (status === "SOLD" || status === "ENDED") {
      await db
        .from("sealed_deals")
        .update({
          is_active: false,
          exact_verified_at: checkedAt,
          disqualified_reason: availabilityRetirementReason(status),
        })
        .eq("id", r.id);
    } else if (status === "ACTIVE") {
      // ONE instant in both columns - this is the positive confirmation.
      await db.from("sealed_deals").update({ last_seen_at: checkedAt, exact_verified_at: checkedAt }).eq("id", r.id);
    }
    // UNKNOWN: no write of any kind. Never retire, never stamp, on an
    // inconclusive call - the row stays exactly as it was and is retried
    // on a later run.
  }

  return out;
}
