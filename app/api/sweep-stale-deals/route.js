import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FRESHNESS_TTL_HOURS } from "@/lib/dealQuality";

// LOCAL-ONLY deal-freshness sweep. NO eBay Browse calls. Runs often and
// cheaply off stored timestamps:
//
//   1. Known-ended auctions  (auction_end_at <= now)          -> is_active=false
//   2. Stale listings, value/discount tiered by last_seen_at  -> is_active=false
//        high  (market_price>=300 OR discount_pct>=0.70)   : > 72h
//        mid   (market_price>=100 OR discount_pct>=0.55)   : > 120h
//        low   (everything else)                           : > 168h
//      Future-dated auctions get the same value tier - a stored end time
//      is a signal, not a guarantee.
//
// This is the same retirement rule scanCardInMarketplace applies per
// card, run GLOBALLY so a listing's freshness no longer depends on when
// its watchlist card next happens to be scanned (extended tier: ~monthly).
//
// Not a delete: the row stays for history / price pages. A later scan
// that re-sees the listing upserts last_seen_at + is_active=true, so a
// wrongly-retired-but-still-live deal self-heals on the next sweep pass
// that includes it. lib/dealQuality.isStale() also hides a row the moment
// it crosses its TTL, so display is correct even between sweeps.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const H = 60 * 60 * 1000;

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const cut = (h) => new Date(Date.now() - h * H).toISOString();
  const results = {};

  async function deactivate(label, applyFilters) {
    let q = db.from("deals").update({ is_active: false }).eq("is_active", true);
    q = applyFilters(q);
    const { data, error } = await q.select("id");
    if (error) return { label, error: error.message };
    return { label, count: data?.length ?? 0 };
  }

  // 1. ended auctions - zero ambiguity, retire immediately.
  results.endedAuctions = await deactivate("endedAuctions", (q) =>
    q.eq("listing_type", "AUCTION").not("auction_end_at", "is", null).lt("auction_end_at", nowIso)
  );

  // 2a. high tier: market_price>=300 OR discount_pct>=0.70, last_seen_at > 72h
  results.staleHigh = await deactivate("staleHigh", (q) =>
    q.or("market_price.gte.300,discount_pct.gte.0.70").lt("last_seen_at", cut(FRESHNESS_TTL_HOURS.high))
  );

  // 2b. mid tier: (market_price>=100 OR discount_pct>=0.55) AND NOT high, > 120h
  results.staleMid = await deactivate("staleMid", (q) =>
    q
      .lt("market_price", 300)
      .lt("discount_pct", 0.7)
      .or("market_price.gte.100,discount_pct.gte.0.55")
      .lt("last_seen_at", cut(FRESHNESS_TTL_HOURS.mid))
  );

  // 2c. low tier / long-tail net: everything else, > 168h.
  results.staleLow = await deactivate("staleLow", (q) =>
    q.lt("market_price", 100).lt("discount_pct", 0.55).lt("last_seen_at", cut(FRESHNESS_TTL_HOURS.low))
  );

  const total = Object.values(results).reduce((s, r) => s + (r.count ?? 0), 0);
  return Response.json({ ok: true, sweptAt: nowIso, total, results });
}
