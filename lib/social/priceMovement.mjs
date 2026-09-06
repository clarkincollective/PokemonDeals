// Phase 13E.3 - MARKET MOVER data: the real, confident price movement of
// ONE real card over a stated period, or nothing.
//
// This is the fail-closed gate for the Market Mover creative family. It
// reuses lib/priceHistory.js UNCHANGED - the same merged canonical
// history + anomaly-confidence checks the site's own card pages use - and
// never fabricates a movement:
//   * < MOVER_MIN_POINTS real observations           -> no chart
//   * no confident trend window                       -> no chart
//   * a confident window but the change is tiny       -> no chart
//   * source disagreement / endpoint anomaly          -> withheld
// Only a real, corroborated, meaningful change produces { ok:true }. The
// caller (socialDaily / a test) that gets { ok:false } simply does not
// build a Market Mover creative for that card.
//
// No eBay call, no PPT API call. One read of the local `price_history`
// table via supabaseAdmin(), the same client every scripts/ tool uses.

import { supabaseAdmin } from "../supabaseAdmin.js";
import priceHistory from "../priceHistory.js";

const { getCanonicalPriceHistory, confidentTrendWindows, downsampleSeries } = priceHistory;

// A movement worth putting in a shareable post. `changePct` from
// lib/priceHistory is in PERCENT units (12.3 = 12.3%); this threshold is
// the same units.
export const MOVER_MIN_ABS_CHANGE_PCT = 8;
export const MOVER_MIN_POINTS = 6;
export const MOVER_CHART_POINTS = 60;

// Which confident window to headline, in preference order. 30d is the
// same basis the site's own market-signal badge uses; 90d / 7d / 12m are
// fallbacks so a card with a real but longer-horizon move still qualifies.
const WINDOW_PREF = [
  { key: "d30", label: "30 days" },
  { key: "d90", label: "90 days" },
  { key: "d7", label: "7 days" },
  { key: "d365", label: "12 months" },
];

// PURE. Given an already-fetched merged series + raw rows, decide the
// movement. `series` is [{ date, price, ... }] from mergeHistoryRows;
// `rows` is the pre-merge per-source observations (for source-disagreement
// confidence). Returns { ok:true, pct (fraction), direction, windowLabel,
// comparedOn, series:[{t,v}], confidence } or { ok:false, reason }.
export function resolveMovement({ series, rows } = {}) {
  const pts = Array.isArray(series) ? series.filter((p) => p && Number.isFinite(Number(p.price)) && Number(p.price) > 0) : [];
  if (pts.length < MOVER_MIN_POINTS) {
    return { ok: false, reason: `only ${pts.length} usable history point(s) (need >=${MOVER_MIN_POINTS}) - no chart` };
  }
  const { windows, confidence } = confidentTrendWindows(pts, { rawRows: rows ?? null });
  for (const w of WINDOW_PREF) {
    const t = windows[w.key];
    if (t && Number.isFinite(t.changePct) && Math.abs(t.changePct) >= MOVER_MIN_ABS_CHANGE_PCT) {
      const frac = t.changePct / 100;
      const chart = downsampleSeries(pts, MOVER_CHART_POINTS).map((p) => ({ t: p.date, v: Number(p.price) }));
      if (chart.length < 2) return { ok: false, reason: "downsampled series collapsed below 2 points" };
      return {
        ok: true,
        pct: frac,
        direction: frac > 0 ? "up" : "down",
        windowLabel: w.label,
        comparedOn: t.comparedOn ?? null,
        series: chart,
        confidence: confidence?.level ?? "ok",
      };
    }
  }
  return {
    ok: false,
    reason:
      confidence?.level === "low"
        ? `trend withheld (${confidence.reason ?? "low confidence"}) - fail closed`
        : "no confident window with a meaningful change - fail closed",
  };
}

// I/O wrapper: one price_history read for a single card, then resolveMovement.
export async function fetchMovementForCard(tcgplayerId, { db, sinceDays = 400 } = {}) {
  const id = tcgplayerId != null ? String(tcgplayerId).trim() : "";
  if (!/^\d+$/.test(id)) return { ok: false, reason: "no numeric tcgplayer id - Market Mover needs the exact printing" };
  const client = db ?? supabaseAdmin();
  let res;
  try {
    res = await getCanonicalPriceHistory(client, id, { sinceDays, maxPoints: 400 });
  } catch (e) {
    return { ok: false, reason: `history read threw: ${e && e.message ? e.message : e}` };
  }
  if (res.error) return { ok: false, reason: `history read failed: ${res.error}` };
  return resolveMovement({ series: res.series, rows: res.rows });
}

// Bounded scan: given a ranked list of already-eligible deal rows, return
// the first whose exact printing has a confident, meaningful movement.
// Caps the number of history reads so the daily run stays bounded.
export async function pickMarketMover(rankedRows, { db, maxProbe = 8 } = {}) {
  const rows = (rankedRows ?? []).filter((r) => r && /^\d+$/.test(String(r.card_tcgplayer_id ?? "").trim()));
  const client = db ?? supabaseAdmin();
  for (const row of rows.slice(0, maxProbe)) {
    const mv = await fetchMovementForCard(row.card_tcgplayer_id, { db: client });
    if (mv.ok) return { candidate: { row, movement: mv }, probed: rows.slice(0, maxProbe).length };
  }
  return { candidate: null, probed: Math.min(rows.length, maxProbe) };
}
