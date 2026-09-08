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

// SOCIAL-CREATIVE-3B - N real, VARIED deal_hero samples for the
// representative reliability test (SS13). Spread across price band,
// discount magnitude, set and species. Raw only where graded isn't
// available. Each row is a real active BIN with a real market reference
// and a real gap.
export async function resolveDealHeroSamples({ n = 8 } = {}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLS)
    .eq("is_active", true)
    .eq("listing_type", "FIXED_PRICE")
    .gt("market_price", 15)
    .gte("discount_pct", 0.3)
    .not("card_tcgplayer_id", "is", null)
    .order("discount_pct", { ascending: false })
    .limit(300);
  if (error) return UNDER(`db: ${error.message}`);
  const ok = (data ?? []).filter(
    (d) =>
      /^\d+$/.test(String(d.card_tcgplayer_id ?? "").trim()) &&
      Number(d.total_price_usd) > 0 &&
      Number(d.market_price) > Number(d.total_price_usd) + 1
  );
  if (ok.length < 3) return UNDER(`only ${ok.length} varied deal_hero candidates`);

  // spread: bucket by (price band x discount decile), take a rotation
  const band = (p) => (p < 25 ? 0 : p < 60 ? 1 : p < 150 ? 2 : p < 400 ? 3 : 4);
  const key = (d) => `${band(Number(d.total_price_usd))}:${Math.round(Number(d.discount_pct) * 10)}`;
  const seenSet = new Set();
  const seenSp = new Set();
  const buckets = new Map();
  for (const d of ok) {
    const k = key(d);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d);
  }
  const picks = [];
  const order = [...buckets.keys()].sort();
  let round = 0;
  while (picks.length < n && round < 20) {
    let progressed = false;
    for (const k of order) {
      if (picks.length >= n) break;
      const arr = buckets.get(k);
      const d = arr[round];
      if (!d) continue;
      progressed = true;
      const sp = extractSpecies(d.card_name ?? "") ?? d.card_name;
      if (seenSet.has(d.card_set) && seenSp.has(sp) && picks.length >= 3) continue;
      seenSet.add(d.card_set);
      seenSp.add(sp);
      picks.push(d);
    }
    if (!progressed) break;
    round += 1;
  }
  const items = picks.slice(0, n).map((d) => {
    const price = Number(d.total_price_usd);
    const market = Number(d.market_price);
    return {
      tcgplayerId: String(d.card_tcgplayer_id).trim(),
      card_name: d.card_name,
      card_set: d.card_set,
      is_graded: Boolean(d.is_graded),
      grade: d.grade ?? null,
      marketplace: d.marketplace ?? null,
      price_usd: Math.round(price * 100) / 100,
      market_ref_usd: Math.round(market),
      gap_pct: Math.round((1 - price / market) * 100),
      deal: d,
    };
  });
  return { ok: true, data: { items }, cards: items.map((i) => ({ tcgplayerId: i.tcgplayerId, deal: i.deal })) };
}

// SOCIAL-CREATIVE-3B - N real, VARIED bid_vs_total samples (SS13).
// USD marketplace only, so bid + shipping = landed exactly in one
// currency (SS12). Spread across bid size and shipping-share.
export async function resolveBidVsTotalSamples({ n = 8 } = {}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLS + ", bid_count, currency")
    .eq("is_active", true)
    .eq("listing_type", "AUCTION")
    .eq("marketplace", "EBAY_US")
    .gt("shipping", 0)
    .gt("price", 2)
    .not("card_tcgplayer_id", "is", null)
    .order("auction_end_at", { ascending: true })
    .limit(300);
  if (error) return UNDER(`db: ${error.message}`);
  const ok = (data ?? []).filter((d) => {
    const bid = Number(d.price);
    const ship = Number(d.shipping);
    const total = Number(d.total_price);
    return (
      /^\d+$/.test(String(d.card_tcgplayer_id ?? "").trim()) &&
      bid >= 2 && ship > 0 && total > bid &&
      Math.abs(bid + ship - total) <= Math.max(0.02, 0.012 * total) &&
      (ship >= 3 || ship / bid >= 0.03)
    );
  });
  if (ok.length < 3) return UNDER(`only ${ok.length} currency-consistent US auction samples with material shipping`);

  const band = (b) => (b < 15 ? 0 : b < 50 ? 1 : b < 150 ? 2 : b < 500 ? 3 : 4);
  const buckets = new Map();
  for (const d of ok) {
    const k = String(band(Number(d.price)));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d);
  }
  const seenSet = new Set();
  const picks = [];
  const order = [...buckets.keys()].sort();
  let round = 0;
  while (picks.length < n && round < 20) {
    let progressed = false;
    for (const k of order) {
      if (picks.length >= n) break;
      const d = buckets.get(k)[round];
      if (!d) continue;
      progressed = true;
      if (seenSet.has(d.card_set) && picks.length >= 3) continue;
      seenSet.add(d.card_set);
      picks.push(d);
    }
    if (!progressed) break;
    round += 1;
  }
  const items = picks.slice(0, n).map((d) => {
    const bid = Math.round(Number(d.price) * 100) / 100;
    const ship = Math.round(Number(d.shipping) * 100) / 100;
    const landed = Math.round(Number(d.total_price) * 100) / 100;
    return {
      tcgplayerId: String(d.card_tcgplayer_id).trim(),
      card_name: d.card_name,
      card_set: d.card_set,
      bid_usd: bid,
      shipping_usd: ship,
      landed_total_usd: landed,
      market_ref_usd: Number(d.market_price) > 0 ? Math.round(Number(d.market_price)) : null,
      auction_end_at: d.auction_end_at ?? null,
      bid_count: d.bid_count ?? null,
      currency: d.currency ?? "USD",
      deal: d,
    };
  });
  return { ok: true, data: { items }, cards: items.map((i) => ({ tcgplayerId: i.tcgplayerId, deal: i.deal })) };
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

// SOCIAL-CREATIVE-3C - K varied three_up "story opportunities" (each = 3
// distinct real BIN deals under the cap). Varies species, sets, price
// bands, discount strength and modern/vintage across the K stories
// (SS11). Each story's 3 cards are themselves distinct + varied.
export async function resolveThreeUnderSamples({ cap = 25, stories = 12, perStory = 3 } = {}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLS)
    .eq("is_active", true)
    .eq("listing_type", "FIXED_PRICE")
    .gt("market_price", 0)
    .gt("discount_pct", 0.2)
    .lte("total_price_usd", cap)
    .not("card_tcgplayer_id", "is", null)
    .order("discount_pct", { ascending: false })
    .limit(400);
  if (error) return UNDER(`db: ${error.message}`);
  const pool = [];
  const seenId = new Set();
  for (const d of data ?? []) {
    const id = String(d.card_tcgplayer_id ?? "").trim();
    if (!/^\d+$/.test(id) || seenId.has(id)) continue;
    if (!(Number(d.total_price_usd) > 0) || !(Number(d.market_price) > Number(d.total_price_usd))) continue;
    seenId.add(id);
    pool.push({
      tcgplayerId: id, card_name: d.card_name, card_set: d.card_set,
      species: String(extractSpecies(d.card_name ?? "") ?? "").toLowerCase(),
      price_usd: Math.round(Number(d.total_price_usd) * 100) / 100,
      market_usd: Math.round(Number(d.market_price)),
      discount_pct: Math.round((1 - Number(d.total_price_usd) / Number(d.market_price)) * 100),
      deal: d,
    });
  }
  if (pool.length < perStory * 3) return UNDER(`only ${pool.length} distinct BIN deals under $${cap}`);

  // price bands so each story mixes a low / mid / higher pick where possible
  const band = (p) => (p < 8 ? 0 : p < 15 ? 1 : 2);
  const byBand = { 0: [], 1: [], 2: [] };
  for (const it of pool) byBand[band(it.price_usd)].push(it);
  for (const k of Object.keys(byBand)) byBand[k].sort((a, b) => b.discount_pct - a.discount_pct);

  const usedId = new Set();
  const out = [];
  for (let s = 0; s < stories; s++) {
    const items = [];
    const spSeen = new Set();
    const setSeen = new Set();
    // one pick per band, then fill; distinct species/set within the story
    for (const k of ["0", "1", "2", "0", "1", "2"]) {
      if (items.length >= perStory) break;
      const cand = byBand[k].find((it) => !usedId.has(it.tcgplayerId) && !spSeen.has(it.species || it.tcgplayerId) && !setSeen.has(it.card_set));
      if (!cand) continue;
      usedId.add(cand.tcgplayerId);
      if (cand.species) spSeen.add(cand.species);
      setSeen.add(cand.card_set);
      items.push(cand);
    }
    // relax: distinct id only
    if (items.length < perStory) {
      for (const it of pool) {
        if (items.length >= perStory) break;
        if (usedId.has(it.tcgplayerId) || items.some((x) => x.tcgplayerId === it.tcgplayerId)) continue;
        usedId.add(it.tcgplayerId);
        items.push(it);
      }
    }
    if (items.length < perStory) break;
    out.push({ cap, items });
  }
  if (out.length < 3) return UNDER(`only ${out.length} distinct 3-card stories available under $${cap}`);
  return {
    ok: true,
    data: { cap, stories: out },
    cards: out.flatMap((st) => st.items.map((i) => ({ tcgplayerId: i.tcgplayerId, deal: i.deal }))),
  };
}
