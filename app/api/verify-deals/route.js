import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getListingSnapshot, getBrowseRateLimit } from "@/lib/ebay";
import { isDisplayableDeal } from "@/lib/dealQuality";
import { getUsdRates } from "@/lib/fx";
import { repricedAuctionPatch } from "@/lib/auctionPricing";
import { allocateVerifyBatch } from "@/lib/verifyAllocator";
import { decideImageRecovery } from "@/lib/imageRecoveryPolicy";
import { IMAGE_VERDICT } from "@/lib/listingImage";
import { beginJobRun, finishJobRun, setQuotaSnapshot, markSkipped, markError, recordDedupeSavedImage } from "@/lib/ebayTelemetry";
import {
  SEEN_AGAIN,
  RECOVERY_SLOTS_PER_RUN,
  RECOVERY_MIN_HOURS_SINCE_CHECK,
  RECOVERY_MAX_AGE_DAYS,
  availabilityRetirementReason,
  recoveryDecision,
  retirementInvalidationPlan,
  expireTags,
} from "@/lib/listingAvailability";

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
// Batch composition (P0.4.3 - lib/verifyAllocator.allocateVerifyBatch):
//   1. CRITICAL auctions ending within ~90 min - always, ahead of all.
//   2. BIN FRESHNESS RESERVE - a bounded, quota-scaled slice (~35% of the
//      batch) for displayable BIN rows aging toward the freshness ceiling.
//      SOFT ordering signal only: no threshold / market-reference /
//      qualification / cooldown-safety change. Scales to 0 near the
//      Browse reserve floor (auction safety wins on a tight day).
//   3. GENERAL slots - the preserved P0.2 rank/tie-break, but auctions
//      NOT ending soon get a time-to-end reverify COOLDOWN so the ~20
//      soonest-ending ones aren't re-priced on every 30-minute run:
//        auction: soonest-ending first (still re-PRICED, not just
//                 re-confirmed - P0 auction-price-integrity), skipping
//                 any re-priced inside its cooldown window
//        justAdded (discovered <=48h, never verified): newest first, so
//                 lib/deals.js fetchFreshFinds can populate
//        high value / discount, then market_price >= 100, then the rest,
//                 oldest last_seen first
// ROOT CAUSE this fixed: rank(auction)=0 with NO cooldown meant the batch
// was always 100% auctions - production showed 0 BIN rows verified in 24h
// while 20 auctions sat at <=1h. See docs/verify-allocation-p043.md.
//
// Outcomes (provider verdict mapping: lib/listingAvailability):
//   SOLD         -> eBay says the item is sold out (item-level quantity).
//                   is_active=false, exact_verified_at=now (the check
//                   time, for observability), disqualified_reason=
//                   'availability:sold'.
//   ENDED        -> 404/410 for this item IN THIS ROW'S MARKETPLACE. Same
//                   write, reason 'availability:not_found_in_marketplace'.
//                   Written to this row only - never to the same item's
//                   rows in other marketplaces.
//   The availability reason is what stops a later search / feed sighting
//   reactivating the row (lib/listingAvailability.writeDiscoverySighting)
//   and keeps it hidden (any disqualified_reason fails isDisplayableDeal).
//   RECOVERY     -> at most RECOVERY_SLOTS_PER_RUN retired FIXED_PRICE row
//                   that a same-marketplace search sighting marked
//                   ":seen_again" is re-checked with the SAME one lookup,
//                   in a slot taken out of BATCH (never added to it). Only
//                   positive availability in this row's marketplace lifts
//                   the retirement (lib/listingAvailability.recoveryDecision).
//   RETIRED      -> (auction only) live re-price put the recomputed
//                   discount below the publish floor - is_active=false,
//                   with the truthful numbers written to the dead row
//   REPRICED     -> (auction only) still a deal at the live bid;
//                   price/shipping/total_price*/discount_pct/bid_count +
//                   last_seen_at + exact_verified_at all refreshed
//   ACTIVE       -> last_seen_at=now, exact_verified_at=now (re-verified;
//                   promotable again, including for premium placement)
//   UNKNOWN      -> untouched (never retire, and never stamp
//                   exact_verified_at, on an inconclusive call - UNKNOWN is
//                   not the same as LIVE - and for an auction this also
//                   covers a bid that read LOWER than stored: bids don't
//                   fall, so that is a bad response, not a price drop)

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 20;
const RESERVE = 800; // never let Browse quota fall to/below this
const SCAN_CAP = 6000; // rows examined to build the priority queue
const PAGE = 1000;
const H = 60 * 60 * 1000;

const COLS =
  "id, watchlist_id, listing_id, marketplace, market_price, discount_pct, first_seen_at, last_seen_at, is_active, is_graded, " +
  "condition, card_language, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, " +
  "auction_end_at, listing_type, listing_url, affiliate_url, card_name, card_set, title, card_tcgplayer_id, image_url";

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

  // EBAY-14R - job context begins before the pre-flight quota check so a
  // skip is itself an observed (and persisted) invocation, not a silent
  // no-op. db is constructed here (a sync, no-I/O client handle - see
  // lib/supabaseAdmin) purely so it is available to the finally block
  // below on every exit path, including the two early skips.
  const db = supabaseAdmin();
  const ctx = beginJobRun({ job: "verify-deals" });
  try {
    const rl = await getBrowseRateLimit();
    setQuotaSnapshot({ remainingStart: rl?.remaining ?? null, limit: rl?.limit ?? null, reserveFloor: RESERVE });
    if (!rl || rl.remaining == null) {
      markSkipped("rate_limit_unknown");
      return Response.json({ ok: true, skipped: "rate_limit_unknown" });
    }
    // Need headroom for the whole batch and still stay above the reserve.
    if (rl.remaining - BATCH < RESERVE) {
      markSkipped("quota_reserve");
      return Response.json({ ok: true, skipped: "quota_reserve", remaining: rl.remaining, reserve: RESERVE });
    }

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

  const isAuctionRow = (r) => r.listing_type === "AUCTION";

  // Scan-time FX for the auction re-price math (no per-row network call).
  const rates = await getUsdRates();

  // RECOVERY candidates (sold-item freshness): retired rows a later
  // same-marketplace search sighting marked seen-again, last checked
  // 24h-14d ago. Bounded to RECOVERY_SLOTS_PER_RUN and carved OUT of BATCH
  // below, so this route's per-run call ceiling is unchanged.
  let recoveryRows = [];
  if (exactColReady) {
    const { data: rec, error: recError } = await db
      .from("deals")
      .select(`${selectCols}, price, shipping, currency`)
      .eq("is_active", false)
      .eq("listing_type", "FIXED_PRICE")
      .in("disqualified_reason", [SEEN_AGAIN.SOLD, SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE])
      .lte("exact_verified_at", new Date(now - RECOVERY_MIN_HOURS_SINCE_CHECK * H).toISOString())
      .gte("exact_verified_at", new Date(now - RECOVERY_MAX_AGE_DAYS * 24 * H).toISOString())
      .order("exact_verified_at", { ascending: true })
      .limit(RECOVERY_SLOTS_PER_RUN);
    if (!recError) recoveryRows = (rec ?? []).filter((r) => legacyOf(r.listing_id)).slice(0, RECOVERY_SLOTS_PER_RUN);
  }
  const recoveryIds = new Set(recoveryRows.map((r) => r.id));

  // P0.4.3 - BATCH COMPOSITION via the pure allocator. It preserves the
  // P0.2 rank/tie-break for the "general" slots, but (a) applies a
  // time-to-end reverify COOLDOWN to auctions so the ~20 soonest-ending
  // ones aren't re-priced every 30-minute run, and (b) reserves a small,
  // quota-scaled slice of the batch for displayable BIN rows aging toward
  // the freshness ceiling - a SOFT ordering signal only. NOTHING about
  // deal qualification, thresholds, the market reference, cooldown safety,
  // or the auction re-price path changes. See lib/verifyAllocator.mjs.
  const { batch, allocation } = allocateVerifyBatch({
    pool,
    batch: BATCH - recoveryRows.length,
    now,
    quotaRemaining: rl.remaining,
    reserve: RESERVE,
  });
  // recovery rows ride in the same loop (same one-call lookup per row)
  batch.unshift(...recoveryRows);
  const out = { ACTIVE: 0, ENDED: 0, SOLD: 0, UNKNOWN: 0, RETIRED: 0, REPRICED: 0, IMAGE_RECOVERED: 0 };
  const recovery = { checked: 0, reactivate: 0, release: 0, retain: 0, writeSkipped: 0 };
  let calls = 0;
  const detail = [];
  // Rows whose visibility this run changed (any retirement verdict, or a
  // recovery reactivation) - their card offers, card page and deal page
  // caches are expired once, after the loop, deduplicated by card.
  const retiredRows = [];
  for (const r of batch) {
    const checkedAt = new Date().toISOString();
    // Extra fields folded into the ACTIVE / retire patch: for an auction
    // that got re-priced, the bid + shipping + landed total + recomputed
    // discount_pct + bid_count; for EITHER row type (EBAY-14Q), any
    // image-recovery/confirmation fields from lib/imageRecoveryPolicy.
    // Empty {} when neither applies - the ACTIVE / retire patch is then
    // exactly what it always was.
    let auctionActiveExtra = {};
    let auctionRetireExtra = {};
    let status;
    let evidence = null;
    let snapshot = null;

    if (isAuctionRow(r)) {
      // ONE get_item_by_legacy_id call: freshness status AND the live bid /
      // shipping, so the row is RE-PRICED, not just re-confirmed alive.
      // lib/auctionPricing.repricedAuctionPatch decides deterministically;
      // a below-floor recomputed discount -> RETIRED (never grandfathered),
      // an inconclusive read -> untouched (same as UNKNOWN).
      const snap = await getListingSnapshot(legacyOf(r.listing_id), r.marketplace);
      calls += snap.calls ?? 1;
      evidence = snap.evidence ?? null;
      snapshot = snap;
      const decision = repricedAuctionPatch({ row: r, snapshot: snap, rates, nowIso: checkedAt });
      if (decision.action === "retire") {
        status =
          decision.reason === "listing_ended"
            ? "ENDED"
            : decision.reason === "listing_sold"
              ? "SOLD"
              : "RETIRED";
        auctionRetireExtra = decision.patch ?? {};
      } else if (decision.action === "reprice") {
        status = "ACTIVE";
        auctionActiveExtra = decision.patch ?? {};
        out.REPRICED++;
      } else {
        status = "UNKNOWN";
      }
      // P0 image false-fallback, now via the SAME shared decision
      // app/api/screen-deal-images uses (lib/imageRecoveryPolicy) - `snap`
      // already carries the single-item endpoint's seller photos, so this
      // is a ZERO-extra-call recovery/confirmation, not a new request.
      if (status === "ACTIVE") {
        const decided = decideImageRecovery({ row: r, snapStatus: snap.status, snapPrimaryImage: snap.primaryImage, snapImageUrls: snap.imageUrls });
        if (decided.outcome === "RECOVERED") {
          auctionActiveExtra = {
            ...auctionActiveExtra,
            image_url: decided.imageUrl,
            image_urls: decided.imageUrls,
            image_verdict: null,
            display_image_url: null,
            image_checked_at: null, // queue for screen-deal-images classification ASAP
          };
          out.IMAGE_RECOVERED = (out.IMAGE_RECOVERED ?? 0) + 1;
          // EBAY-14R - this specific outcome is what removes the row from
          // screen-deal-images' own candidate query going forward (it now
          // has a stored image), so it is a real future call avoided, not
          // a generic NOOP.
          recordDedupeSavedImage();
        } else if (decided.outcome === "CONFIRMED_NO_IMAGE") {
          // EBAY-14Q - the SAME convention screen-deal-images already uses
          // for its own NO_TRUSTED_IMAGE outcome: stamping image_checked_at
          // now keeps this row out of that route's 14-day re-screen
          // candidate pool, so it never re-asks eBay the identical
          // question this run just answered live.
          auctionActiveExtra = { ...auctionActiveExtra, image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null, image_checked_at: checkedAt };
          recordDedupeSavedImage();
        }
      }
    } else {
      // EBAY-14Q - was getListingFreshness (status only). getListingSnapshot
      // hits the SAME get_item_by_legacy_id endpoint for the SAME cost (one
      // call) but also returns the seller-photo fields that endpoint always
      // carries - previously discarded here, forcing screen-deal-images to
      // make a SEPARATE later call for a fact this call already answered.
      // Price/status verification is completely unchanged: BIN rows are
      // never re-priced from this endpoint (repricedAuctionPatch is
      // auction-only), so `status` below means exactly what it always did.
      const snap = await getListingSnapshot(legacyOf(r.listing_id), r.marketplace);
      calls += snap.calls ?? 1;
      evidence = snap.evidence ?? null;
      snapshot = snap;
      status = snap.status;
      if (status === "ACTIVE") {
        const decided = decideImageRecovery({ row: r, snapStatus: snap.status, snapPrimaryImage: snap.primaryImage, snapImageUrls: snap.imageUrls });
        if (decided.outcome === "RECOVERED") {
          auctionActiveExtra = { image_url: decided.imageUrl, image_urls: decided.imageUrls, image_verdict: null, display_image_url: null, image_checked_at: null };
          out.IMAGE_RECOVERED = (out.IMAGE_RECOVERED ?? 0) + 1;
          recordDedupeSavedImage();
        } else if (decided.outcome === "CONFIRMED_NO_IMAGE") {
          auctionActiveExtra = { image_verdict: IMAGE_VERDICT.NO_TRUSTED_IMAGE, display_image_url: null, image_checked_at: checkedAt };
          recordDedupeSavedImage();
        }
      }
    }

    if (recoveryIds.has(r.id)) {
      // RECOVERY write: conditional on the row still being retired with the
      // exact marker we read, so a concurrent change is never clobbered.
      recovery.checked++;
      const decision = recoveryDecision({ row: r, snapshot, nowIso: checkedAt });
      const patch = decision.action === "reactivate" ? { ...auctionActiveExtra, ...decision.patch } : decision.patch;
      const { data: changed, error: recoveryError } = await db
        .from("deals")
        .update(patch)
        .eq("id", r.id)
        .eq("is_active", false)
        .eq("disqualified_reason", r.disqualified_reason)
        .select("id");
      if (recoveryError || !changed?.length) recovery.writeSkipped++;
      else {
        recovery[decision.action]++;
        if (decision.action === "reactivate") retiredRows.push(r);
      }
      detail.push({ id: r.id, status, type: r.listing_type, evidence, recovery: decision.action });
      continue;
    }

    out[status] = (out[status] ?? 0) + 1;
    detail.push({ id: r.id, status, type: r.listing_type, evidence });

    if (status === "ENDED" || status === "SOLD" || status === "RETIRED") {
      // RETIRED (auction re-priced below the floor) is a price outcome on
      // a live listing: no availability reason, so a genuine later
      // sighting can still re-publish it at its real price.
      const reason = availabilityRetirementReason(status);
      const patch = exactColReady
        ? { ...auctionRetireExtra, is_active: false, exact_verified_at: checkedAt }
        : { is_active: false };
      if (reason) patch.disqualified_reason = reason;
      const { error: retireError } = await db.from("deals").update(patch).eq("id", r.id);
      if (!retireError) retiredRows.push(r);
    } else if (status === "ACTIVE") {
      const patch = exactColReady
        ? { ...auctionActiveExtra, last_seen_at: checkedAt, exact_verified_at: checkedAt }
        : { last_seen_at: checkedAt };
      await db.from("deals").update(patch).eq("id", r.id);
    }
    // UNKNOWN: untouched - never retire, never stamp exact_verified_at, on
    // an inconclusive call.
  }

  // Targeted invalidation: only the cards whose offers just changed. No
  // provider call happens here - each expired card page re-renders lazily
  // on its next request (see lib/listingAvailability for the cost note).
  const plan = retirementInvalidationPlan(retiredRows);
  const invalidation = { cards: plan.cards, deals: plan.deals, ...expireTags(revalidateTag, plan.tags) };

  const after = await getBrowseRateLimit();
  setQuotaSnapshot({ remainingEnd: after?.remaining ?? null });
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
    // P0.4.3 batch-allocation observability
    allocation,
    detail,
    // sold-item freshness: targeted cache expiry for this run's retirements
    invalidation,
    recovery,
  });
  } catch (err) {
    markError(err);
    throw err;
  } finally {
    await finishJobRun(db, ctx);
  }
}
