import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getListingFreshness, getBrowseRateLimit } from "@/lib/ebay";
import { isDisplayableDeal, freshnessTierTtl, hoursSinceSeen } from "@/lib/dealQuality";

// BOUNDED, RESERVE-GUARDED exact-listing re-verification. One Browse call
// per row, hard-capped at BATCH per run, and it runs ONLY when the daily
// Browse budget is comfortably above the protected reserve. Its job is to
// re-confirm (or retire) the deals that matter most to a visitor before
// the local stale sweep would blindly retire them.
//
// Priority (visitor value):
//   1. displayable auctions ending within 2h  (highest urgency)
//   2. displayable, high value / high discount, oldest last_seen first
//   3. displayable, market_price >= 100, oldest last_seen first
// Placement/popularity is not tracked; "displayable + value + discount +
// age" is the cheap proxy for "prominently promoted".
//
// Outcomes:
//   ENDED / SOLD -> is_active=false (retired; row kept for history)
//   ACTIVE       -> last_seen_at=now (re-verified; promotable again)
//   UNKNOWN      -> untouched (never retire on an inconclusive call)

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 12;
const RESERVE = 800; // never let Browse quota fall to/below this
const SCAN_CAP = 6000; // rows examined to build the priority queue
const PAGE = 1000;
const H = 60 * 60 * 1000;

const COLS =
  "id, listing_id, marketplace, market_price, discount_pct, last_seen_at, is_active, is_graded, " +
  "condition, card_language, disqualified_reason, visual_authenticity_status, visual_authenticity_reason, " +
  "auction_end_at, listing_type, listing_url, affiliate_url, card_name, card_set, title, card_tcgplayer_id";

const legacyOf = (listingId) => String(listingId ?? "").split("|")[1] || null;

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

  // Build the candidate pool from active rows (bounded scan).
  const pool = [];
  for (let from = 0; from < SCAN_CAP; from += PAGE) {
    const { data, error } = await db.from("deals").select(COLS).eq("is_active", true).range(from, from + PAGE - 1);
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
  const highValue = (r) => Number(r.market_price) >= 300 || Number(r.discount_pct) >= 0.7;
  const midValue = (r) => Number(r.market_price) >= 100;
  // how close a row is to its stale TTL (>=1 means already stale)
  const staleness = (r) => hoursSinceSeen(r, now) / freshnessTierTtl(r);

  const rank = (r) => {
    if (endsSoon(r)) return 0;
    if (highValue(r)) return 1;
    if (midValue(r)) return 2;
    return 3;
  };
  pool.sort((a, b) => rank(a) - rank(b) || staleness(b) - staleness(a));

  const batch = pool.slice(0, BATCH);
  const out = { ACTIVE: 0, ENDED: 0, SOLD: 0, UNKNOWN: 0 };
  let calls = 0;
  const detail = [];
  for (const r of batch) {
    const { status, calls: c } = await getListingFreshness(legacyOf(r.listing_id), r.marketplace);
    calls += c;
    out[status] = (out[status] ?? 0) + 1;
    detail.push({ id: r.id, status });
    if (status === "ENDED" || status === "SOLD") {
      await db.from("deals").update({ is_active: false }).eq("id", r.id);
    } else if (status === "ACTIVE") {
      await db.from("deals").update({ last_seen_at: new Date().toISOString() }).eq("id", r.id);
    }
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
    detail,
  });
}
