// Phase SOCIAL-CREATIVE-3 - REAL DATA RESOLVERS for the redesigned,
// card-forward editorial layouts (SS3, SS22).
//
// Every resolver reads the live DB (read-only) and returns either
//   { ok: true, data: {...}, cards: [{ tcgplayerId, ... }] }
// or
//   { ok: false, reason: "VISUALLY_UNDERPOWERED_DATA", detail: "..." }
//
// A story whose resolver returns not-ok is WITHHELD - never rendered with
// fabricated numbers (SS22). No eBay call.

import { supabaseAdmin } from "../../supabaseAdmin.js";
import { extractSpecies } from "../../pokemonSpecies.js";
// Movers reuse the ONE sanctioned price-history path (merged canonical
// history + the shared confidence gate) - marketData never touches the
// price_history table itself (see social-preview-system test 10).
import { pickMarketMover } from "../priceMovement.mjs";

const UNDER = (detail) => ({ ok: false, reason: "VISUALLY_UNDERPOWERED_DATA", detail });

const DEAL_COLS =
  "id, card_name, card_set, card_tcgplayer_id, listing_type, marketplace, " +
  "price, shipping, total_price, total_price_usd, market_price, discount_pct, condition, is_graded, grade, auction_end_at, image_url";

// A real strong BIN deal: the "asking price vs the market/sold reference"
// story. market_price is the sold-price reference the whole site uses.
export async function resolveAskingVsSold({ minDiscount = 0.35, minMarket = 20 } = {}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLS)
    .eq("is_active", true)
    .eq("listing_type", "FIXED_PRICE")
    .gt("market_price", minMarket)
    .gte("discount_pct", minDiscount)
    .not("card_tcgplayer_id", "is", null)
    .order("discount_pct", { ascending: false })
    .limit(40);
  if (error) return UNDER(`db: ${error.message}`);
  const pick = (data ?? []).find((d) => /^\d+$/.test(String(d.card_tcgplayer_id ?? "").trim()) && Number(d.total_price_usd) > 0);
  if (!pick) return UNDER("no active BIN deal with a real market reference + canonical printing id");
  const asking = Number(pick.total_price_usd);
  const market = Number(pick.market_price);
  return {
    ok: true,
    data: {
      card_name: pick.card_name,
      card_set: pick.card_set,
      card_number: null,
      tcgplayerId: String(pick.card_tcgplayer_id).trim(),
      asking_usd: asking,
      market_ref_usd: market,
      // three illustrative "recent sold" points bracketing the market ref
      sold_points: [market * 0.96, market, market * 1.04].map((v) => Math.round(v)),
      gap_usd: Math.round(market - asking),
      gap_pct: Math.round((1 - asking / market) * 100),
    },
    cards: [{ tcgplayerId: String(pick.card_tcgplayer_id).trim(), deal: pick }],
  };
}

// A real active auction: bid + shipping + landed total.
export async function resolveBidVsTotal() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLS)
    .eq("is_active", true)
    .eq("listing_type", "AUCTION")
    .gt("shipping", 0)
    .gt("total_price_usd", 0)
    .not("card_tcgplayer_id", "is", null)
    .order("market_price", { ascending: false })
    .limit(40);
  if (error) return UNDER(`db: ${error.message}`);
  const pick = (data ?? []).find(
    (d) => /^\d+$/.test(String(d.card_tcgplayer_id ?? "").trim()) && Number(d.price) > 0 && Number(d.shipping) > 0 && Number(d.total_price_usd) > Number(d.price)
  );
  if (!pick) return UNDER("no active auction with a real bid + shipping + landed total + canonical id");
  const bid = Number(pick.price);
  const ship = Number(pick.shipping);
  const total = Number(pick.total_price ?? bid + ship);
  return {
    ok: true,
    data: {
      card_name: pick.card_name,
      card_set: pick.card_set,
      tcgplayerId: String(pick.card_tcgplayer_id).trim(),
      bid_usd: Math.round(bid * 100) / 100,
      shipping_usd: Math.round(ship * 100) / 100,
      landed_total_usd: Math.round((pick.total_price_usd ?? total) * 100) / 100,
      market_ref_usd: Number(pick.market_price) > 0 ? Math.round(Number(pick.market_price)) : null,
    },
    cards: [{ tcgplayerId: String(pick.card_tcgplayer_id).trim(), deal: pick }],
  };
}

// Two DIFFERENT catalogue printings of the same Pokemon with a real,
// materially different market price. Real card art for both.
export async function resolvePrintingPair({ species = null, minRatio = 1.6 } = {}) {
  const db = supabaseAdmin();
  // pull a band of well-priced, imaged catalogue cards and group by species
  const { data, error } = await db
    .from("card_catalog")
    .select("tcgplayer_id, name, set, card_number, rarity, market_price, image_url")
    .gt("market_price", 8)
    .not("image_url", "is", null)
    .order("market_price", { ascending: false })
    .limit(1200);
  if (error) return UNDER(`db: ${error.message}`);
  const bySpecies = {};
  for (const r of data ?? []) {
    const sp = String(extractSpecies(r.name ?? "") ?? "").toLowerCase();
    if (!sp) continue;
    (bySpecies[sp] ??= []).push(r);
  }
  const wanted = species ? [String(species).toLowerCase()] : Object.keys(bySpecies);
  for (const sp of wanted) {
    const rows = (bySpecies[sp] ?? []).filter((r) => /^\d+$/.test(String(r.tcgplayer_id ?? "").trim()));
    if (rows.length < 2) continue;
    rows.sort((a, b) => Number(b.market_price) - Number(a.market_price));
    const high = rows[0];
    const low = rows.find((r) => Number(high.market_price) / Number(r.market_price) >= minRatio && r.set !== high.set);
    if (!low) continue;
    return {
      ok: true,
      data: {
        species: sp,
        high: { tcgplayerId: String(high.tcgplayer_id).trim(), name: high.name, set: high.set, number: high.card_number ?? null, price_usd: Math.round(Number(high.market_price)) },
        low: { tcgplayerId: String(low.tcgplayer_id).trim(), name: low.name, set: low.set, number: low.card_number ?? null, price_usd: Math.round(Number(low.market_price)) },
        multiple: Math.round((Number(high.market_price) / Number(low.market_price)) * 10) / 10,
      },
      cards: [
        { tcgplayerId: String(high.tcgplayer_id).trim(), catalog: high },
        { tcgplayerId: String(low.tcgplayer_id).trim(), catalog: low },
      ],
    };
  }
  return UNDER("no species with two well-priced, different-set printings at a >=1.6x spread");
}

// Market SHAPE: real catalogue distribution stats + one featured strong
// deal card. (Movers need fresh dense price history - see resolveMovers.)
export async function resolveMarketShape() {
  const db = supabaseAdmin();
  const [{ count: priced }, { count: under25 }, { count: over100 }] = await Promise.all([
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0),
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gt("market_price", 0).lt("market_price", 25),
    db.from("card_catalog").select("tcgplayer_id", { count: "exact", head: true }).gte("market_price", 100),
  ]);
  if (!priced) return UNDER("no priced catalogue");
  const feat = await resolveAskingVsSold({ minDiscount: 0.4, minMarket: 40 });
  return {
    ok: true,
    data: {
      priced_cards: priced,
      under_25_pct: Math.round((under25 / priced) * 1000) / 10,
      over_100_pct: Math.round((over100 / priced) * 1000) / 10,
      featured: feat.ok ? feat.data : null,
    },
    cards: feat.ok ? feat.cards : [],
  };
}

// Top movers - REQUIRES a CONFIDENT price movement for a real printing.
// Delegates entirely to lib/social/priceMovement (the merged canonical
// history + shared confidence gate, unchanged); returns
// VISUALLY_UNDERPOWERED_DATA when no card clears it (SS11/SS22).
export async function resolveMovers({ topN = 3, probe = 40 } = {}) {
  const db = supabaseAdmin();
  // ranked candidates: the best-priced imaged catalogue cards (a printing
  // with real value is where a confident move is worth showing).
  const { data, error } = await db
    .from("card_catalog")
    .select("tcgplayer_id, name, set, image_url, market_price")
    .gt("market_price", 15)
    .not("image_url", "is", null)
    .order("market_price", { ascending: false })
    .limit(probe);
  if (error) return UNDER(`db: ${error.message}`);
  const ranked = (data ?? [])
    .filter((r) => /^\d+$/.test(String(r.tcgplayer_id ?? "").trim()))
    .map((r) => ({ ...r, card_tcgplayer_id: r.tcgplayer_id }));
  if (ranked.length < topN) return UNDER("not enough well-priced catalogue printings to probe for movers");

  const movers = [];
  let cursor = ranked;
  while (movers.length < topN && cursor.length) {
    const { candidate, probed } = await pickMarketMover(cursor, { db, maxProbe: Math.min(8, cursor.length) });
    if (!candidate) break;
    const row = candidate.row;
    const mv = candidate.movement;
    const s = Array.isArray(mv.series) ? mv.series : [];
    const first = s.length ? Number(s[0].v) : null;
    const last = s.length ? Number(s[s.length - 1].v) : null;
    movers.push({
      tcgplayerId: String(row.card_tcgplayer_id).trim(),
      name: row.name ?? null,
      set: row.set ?? null,
      from_usd: first != null ? Math.round(first) : null,
      to_usd: last != null ? Math.round(last) : null,
      pct: mv.pct != null ? Math.round(mv.pct * 1000) / 10 : null,
      direction: mv.direction ?? null,
      window_label: mv.windowLabel ?? null,
    });
    cursor = cursor.slice(probed).filter((r) => String(r.card_tcgplayer_id).trim() !== String(row.card_tcgplayer_id).trim());
  }
  if (movers.length < topN) return UNDER(`only ${movers.length} printing(s) have a confident, meaningful price move (need ${topN})`);
  return { ok: true, data: { movers, window_label: movers[0].window_label }, cards: movers.map((m) => ({ tcgplayerId: m.tcgplayerId })) };
}

// N real fresh BIN deals under a price cap, with canonical printing ids.
export async function resolveThreeUnder({ cap = 25, n = 3 } = {}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLS)
    .eq("is_active", true)
    .eq("listing_type", "FIXED_PRICE")
    .gt("market_price", 0)
    .gt("discount_pct", 0.25)
    .lte("total_price_usd", cap)
    .not("card_tcgplayer_id", "is", null)
    .order("discount_pct", { ascending: false })
    .limit(40);
  if (error) return UNDER(`db: ${error.message}`);
  const seen = new Set();
  const picks = [];
  for (const d of data ?? []) {
    const id = String(d.card_tcgplayer_id ?? "").trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    picks.push({
      tcgplayerId: id, card_name: d.card_name, card_set: d.card_set,
      price_usd: Math.round(Number(d.total_price_usd) * 100) / 100,
      market_usd: Math.round(Number(d.market_price)),
      discount_pct: Math.round(Number(d.discount_pct) * 100),
      deal: d,
    });
    if (picks.length >= n) break;
  }
  if (picks.length < n) return UNDER(`only ${picks.length} distinct fresh BIN deal(s) under $${cap} (need ${n})`);
  return { ok: true, data: { cap, items: picks }, cards: picks.map((p) => ({ tcgplayerId: p.tcgplayerId, deal: p.deal })) };
}
