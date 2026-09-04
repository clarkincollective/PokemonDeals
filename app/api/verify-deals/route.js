import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getListingFreshness, getBrowseRateLimit } from "@/lib/ebay";
import { isDisplayableDeal, freshnessTierTtl, hoursSinceSeen, discoveryAgeHours, JUST_ADDED_MAX_DISCOVERY_AGE_HOURS } from "@/lib/dealQuality";

// BOUNDED, RESERVE-GUARDED exact-listing re-verification. One Browse call
// per row, hard-capped at BATCH per run, and it runs ONLY when the daily
// Browse budget is comfortably above the protected reserve. Its job is to
// re-confirm (or retire) the deals that matter most to a visitor before
// the local stale sweep would blindly retire them, AND to stamp
// exact_verified_at - the ONLY field that makes a row eligible for
// premium/flagship placement (see lib/dealQuality.isPremiumDealEligible).
//
// P0.2 (2026-09-05): raised from BATCH=12 on an hourly cron to BATCH=20 on
// a 30-minute cron (vercel.json) - 12/hour (288/day max) was nowhere near
// enough to keep exact_verified_at fresh across the active inventory
// (~2,500 rows). docs/ebay-rate-limits.md records the account already
// typically spends 4,150-5,400 of its 5,000/day Browse budget elsewhere
// (discovery sweeps + priority/extended tiers + ingest-feed), so this was
// deliberately NOT raised to a 15-minute/large-batch cadence - that could
// have starved the lower-priority discovery tiers of their own share on a
// tight day. 20 x 48 runs/day = 960/day max (+672/day over the old ceiling,
// not +2,000+), and the existing RESERVE guard below still applies on every
// run: on a day where quota is already tight, this route simply skips more
// often, exactly as designed - it can never itself cause a 429 or eat into
// the protected 800-call floor. See docs/p02-availability-incident.md for
// the full quota-allocation reasoning.
//
// Priority (visitor value, highest first):
//   1. displayable auctions ending within 2h
//   2. displayable "Just Added" candidates - discovered within the lane's
//      own max-discovery-age window and never yet exactly verified, so the
//      lane (lib/deals.js fetchFreshFinds) can actually populate instead
//      of requiring a completed verification pass on a deal barely old
//      enough to exist yet.
//   3. displayable, high value / high discount, oldest last_seen first
//   4. displayable, market_price >= 100, oldest last_seen first
// Placement/popularity is not tracked; "displayable + value + discount +
// age" is the cheap proxy for "prominently promoted".
//
// Outcomes:
//   ENDED / SOLD -> is_active=false, exact_verified_at=now (retired; row
//                   kept for history; the check-time is recorded too, for
//                   observability, even though is_active already hides it)
//   ACTIVE       -> last_seen_at=now, exact_verified_at=now (re-verified;
//                   promotable again, including for premium placement)
//   UNKNOWN      -> untouched (never retire, and never stamp
//                   exact_verified_at, on an inconclusive call - UNKNOWN is
//                   not the same as LIVE)

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 20;
const RESERVE = 800; // never let Browse quota fall to/below this
const SCAN_CAP = 6000; // rows examined to build the priority queue
const PAGE = 1000;
const H = 60 * 60 * 1000;

const COLS =
  "id, listing_id, marketplace, market_price, discount_pct, first_seen_at, last_seen_at, is_active, is_graded, " +
  "condition, card_language, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, " +
  "auction_end_at, listing_type, listing_url, affiliate_url, card_name, card_set, title, card_tcgplayer_id";

const legacyOf = (listingId) => String(listingId ?? "").split("|")[1] || null;

// Cheap, memoized-per-invocation probe for whether the P0.2 migration
// (supabase/deal_availability_migration.sql) has run yet - same pattern as
// lib/deals.js's cardColsReady(). Until it has, this route simply keeps its
// pre-P0.2 behavior (last_seen_at + is_active only); nothing errors, and
// premium eligibility elsewhere stays conservatively closed (a NULL/absent
// exact_verified_at reads as "never verified", never as "assume live").
async function exactVerifiedColReady(db) {
  const { error } = await db.from("deals").select("exact_verified_at").limit(1);
  return !error;
}

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await getBrowseRateLimit();
  if (!rl || rl.remaining == null) {
    return Response.json({ ok: true, skipped: "rate_limit_unknown" });
  }
  // Need headroom for the whole batch and still stay above the reserve.
  if (rl.remaining - BATCH < RESERVE) {
    return Response.json({ ok: true, skipped: "quota_reserve", remaining: rl.remaining, reserve: RESERVE });
  }

  const db = supabaseAdmin();
  const now = Date.now();
  const exactColReady = await exactVerifiedColReady(db);
  const selectCols = exactColReady ? `${COLS}, exact_verified_at` : COLS;

  // Build the candidate pool from active rows (bounded scan).
  const pool = [];
  for (let from = 0; from < SCAN_CAP; from += PAGE) {
    const { data, error } = await db.from("deals").select(selectCols).eq("is_active", true).range(from, from + PAGE - 1);
    if (error) return Response.json({ ok: false, stage: "select", error: error.message }, { status: 200 });
    if (!data?.length) break;
    for (const r of data) {
      if (!isDisplayableDeal(r)) continue;
      if (!legacyOf(r.listing_id)) continue;
      pool.push(r);
    }
    if (data.length < PAGE) break;
  }

  const endsSoon = (r) =>
    r.listing_type === "AUCTION" &&
    r.auction_end_at &&
    Date.parse(r.auction_end_at) > now &&
    Date.parse(r.auction_end_at) < now + 2 * H;
  // A candidate for the "Just Added" lane (lib/deals.js fetchFreshFinds):
  // discovered recently enough to still qualify, but never yet exactly
  // verified - without this priority tier, a brand-new discovery would
  // only get an exact_verified_at stamp by luck of the value/age ranking
  // below, and the lane would stay artificially empty.
  const justAddedCandidate = (r) =>
    discoveryAgeHours(r, now) <= JUST_ADDED_MAX_DISCOVERY_AGE_HOURS && r.exact_verified_at == null;
  const highValue = (r) => Number(r.market_price) >= 300 || Number(r.discount_pct) >= 0.7;
  const midValue = (r) => Number(r.market_price) >= 100;
  // how close a row is to its stale TTL (>=1 means already stale)
  const staleness = (r) => hoursSinceSeen(r, now) / freshnessTierTtl(r);

  const rank = (r) => {
    if (endsSoon(r)) return 0;
    // P0.2 fix (found live, post-migration): this MUST be its own tier,
    // never tied with highValue. A brand-new discovery has a near-zero
    // staleness ratio by definition, so sharing a tie-break sorted by
    // "closest to going stale" (below) meant highValue rows - which
    // accumulate staleness over days - always won the tie and starved
    // Just Added candidates out of every batch. Confirmed live: after 15
    // verification runs, isPremiumDealEligible had recovered site-wide,
    // but zero of the 72 candidates within fetchFreshFinds' own 48h/
    // English/watchlist-scoped query had been reached.
    if (justAddedCandidate(r)) return 1;
    if (highValue(r)) return 2;
    if (midValue(r)) return 3;
    return 4;
  };
  // P0.2 fix #2 (found live, same session): giving justAddedCandidate its
  // own tier (above) was necessary but not sufficient. fetchFreshFinds
  // queries the NEWEST N rows in the discovery window (ORDER BY
  // first_seen_at DESC) - but the staleness-descending tie-break used for
  // every other tier prioritizes candidates CLOSEST TO GOING STALE, which
  // for two rows both inside the 48h Just Added window means the OLDER one
  // (closer to falling out of its freshness TTL) wins, not the newer one
  // fetchFreshFinds actually wants verified first. Confirmed live: 299/470
  // rows in the 48h window got verified, but 0 of the newest 72 (exactly
  // what fetchFreshFinds queries) - verification was working backwards
  // from "about to expire", the opposite direction from "just discovered".
  // Within the Just-Added tier specifically, sort by discovery recency
  // (newest first) instead - that tier's whole purpose is getting brand-
  // new discoveries verified before a visitor ever sees the lane, not
  // protecting older rows from expiring (the other tiers already do that).
  const tieBreak = (r) => (justAddedCandidate(r) ? discoveryAgeHours(r, now) : -staleness(r));
  pool.sort((a, b) => rank(a) - rank(b) || tieBreak(a) - tieBreak(b));

  const batch = pool.slice(0, BATCH);
  const out = { ACTIVE: 0, ENDED: 0, SOLD: 0, UNKNOWN: 0 };
  let calls = 0;
  const detail = [];
  for (const r of batch) {
    const { status, calls: c } = await getListingFreshness(legacyOf(r.listing_id), r.marketplace);
    calls += c;
    out[status] = (out[status] ?? 0) + 1;
    detail.push({ id: r.id, status });
    const checkedAt = new Date().toISOString();
    if (status === "ENDED" || status === "SOLD") {
      const patch = exactColReady ? { is_active: false, exact_verified_at: checkedAt } : { is_active: false };
      await db.from("deals").update(patch).eq("id", r.id);
    } else if (status === "ACTIVE") {
      const patch = exactColReady
        ? { last_seen_at: checkedAt, exact_verified_at: checkedAt }
        : { last_seen_at: checkedAt };
      await db.from("deals").update(patch).eq("id", r.id);
    }
    // UNKNOWN: untouched - never retire, never stamp exact_verified_at, on
    // an inconclusive call.
  }

  const after = await getBrowseRateLimit();
  return Response.json({
    ok: true,
    poolSize: pool.length,
    verified: batch.length,
    results: out,
    calls,
    remainingBefore: rl.remaining,
    remainingAfter: after?.remaining ?? null,
    reserve: RESERVE,
    exactVerifiedColReady: exactColReady,
    detail,
  });
}
