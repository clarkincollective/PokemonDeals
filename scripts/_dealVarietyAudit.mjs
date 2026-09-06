// P0.4 — DEAL VARIETY / DISCOVERY COVERAGE / HOMEPAGE SURFACING AUDIT
// READ-ONLY. No writes, no scanner calls, no production behaviour change.
// Pulls current production state (service-role read) + the append-only
// discovery_events log and computes the diversity / coverage / surfacing
// metrics the P0.4 brief asks for. Prints a JSON blob that
// docs/deal-variety-audit-p04.md is written from.
//
//   node scripts/_dealVarietyAudit.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import pkg from "../lib/pokemonSpecies.js";
const { extractSpecies } = pkg;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const HOUR = 3600_000;
const nowMs = Date.now();
const sinceIso = (h) => new Date(nowMs - h * HOUR).toISOString();

async function pageAll(table, sel, tweak = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tweak(db.from(table).select(sel)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const count = async (table, tweak = (q) => q) =>
  (await tweak(db.from(table).select("*", { count: "exact", head: true }))).count ?? 0;

const tally = (arr, keyFn) => {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (k == null || k === "") continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
};
const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const distinct = (arr, keyFn) => new Set(arr.map(keyFn).filter((v) => v != null && v !== "")).size;
const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : null);

// coarse era from a catalogue set_id prefix / set name
const ERA_BY_PREFIX = [
  [/^sv|^svp/i, "SV (2023+)"],
  [/^swsh|^cel|^pgo|^crz/i, "SWSH (2020-22)"],
  [/^sm|^smp|^det|^dragma|^hif|^sma/i, "SM (2017-19)"],
  [/^xy|^xyp|^g1|^dc1|^bp/i, "XY (2014-16)"],
  [/^bw|^bwp|^dv1|^lds/i, "BW (2011-13)"],
  [/^dp|^pl|^hgss|^col|^ru1/i, "DP/HGSS (2007-11)"],
  [/^ex|^np|^pop/i, "EX (2003-07)"],
  [/^base|^bs|^ju|^fo|^b2|^tr|^g1?h|^g2|^n[1-4]|^lc|^ecard|^exp|^aq|^sk|^wotc/i, "WOTC (1999-03)"],
];
const WOTC_NAMES = /base set|jungle|fossil|team rocket|gym (heroes|challenge)|neo (genesis|discovery|revelation|destiny)|legendary collection|expedition|aquapolis|skyridge/i;
function eraOf(setId, setName) {
  for (const [re, label] of ERA_BY_PREFIX) if (setId && re.test(setId)) return label;
  if (setName && WOTC_NAMES.test(setName)) return "WOTC (1999-03)";
  return "other/unknown";
}
const RARITY_SEG = (r) => {
  const s = (r || "").toLowerCase();
  if (/illustration rare|special illustration/.test(s)) return "illustration_rare";
  if (/trainer gallery|character rare/.test(s)) return "trainer_gallery";
  if (/promo/.test(s)) return "promo";
  if (/hyper|rainbow|secret/.test(s)) return "secret/rainbow";
  if (/ultra|full art|\bex\b|\bgx\b|\bv\b|vmax|vstar/.test(s)) return "ultra (EX/GX/V/VMAX)";
  if (/holo|rare holo/.test(s)) return "holo rare";
  if (/^rare$|double rare/.test(s)) return "rare";
  if (/uncommon/.test(s)) return "uncommon";
  if (/common/.test(s)) return "common";
  return r ? "other" : "unknown";
};
const priceBand = (p) => {
  const n = Number(p);
  if (!Number.isFinite(n)) return "unknown";
  if (n < 25) return "<$25";
  if (n < 50) return "$25-50";
  if (n < 100) return "$50-100";
  if (n < 250) return "$100-250";
  return "$250+";
};
const BANDS = ["<$25", "$25-50", "$50-100", "$100-250", "$250+", "unknown"];

async function main() {
  const R = {};

  // ---------------------------------------------------------------- inventory
  const deals = await pageAll(
    "deals",
    "id,watchlist_id,card_catalog_id,card_tcgplayer_id,card_name,card_set,card_language,marketplace,item_location_country,listing_type,is_graded,grader,grade,total_price,total_price_usd,market_price,discount_pct,discovery_source,first_seen_at,exact_verified_at,visual_authenticity_status",
    (q) => q.eq("is_active", true)
  );
  R.activeDeals = deals.length;

  // catalogue join for clean set_id / rarity / species / era
  const catIds = [...new Set(deals.map((d) => d.card_tcgplayer_id).filter(Boolean).map(String))];
  const catById = new Map();
  for (let i = 0; i < catIds.length; i += 800) {
    const { data } = await db
      .from("card_catalog")
      .select("tcgplayer_id,set,set_id,rarity,species,card_type,language,market_price")
      .in("tcgplayer_id", catIds.slice(i, i + 800));
    for (const c of data ?? []) catById.set(String(c.tcgplayer_id), c);
  }
  const speciesOf = (d) => {
    const c = catById.get(String(d.card_tcgplayer_id));
    return (c?.species || extractSpecies(d.card_name || "") || "").trim() || null;
  };
  const setOf = (d) => catById.get(String(d.card_tcgplayer_id))?.set || d.card_set || null;
  const printOf = (d) => d.card_tcgplayer_id || d.card_catalog_id || `${d.card_name}|${d.card_set}`;

  R.inventory = {
    distinct_species: distinct(deals, speciesOf),
    distinct_printings_tcgId: distinct(deals, (d) => d.card_tcgplayer_id),
    distinct_printings_any: distinct(deals, printOf),
    distinct_catalog_ids: distinct(deals, (d) => d.card_catalog_id),
    distinct_sets: distinct(deals, setOf),
    distinct_eras: distinct(deals, (d) => {
      const c = catById.get(String(d.card_tcgplayer_id));
      return eraOf(c?.set_id, setOf(d));
    }),
    raw_vs_graded: { raw: deals.filter((d) => !d.is_graded).length, graded: deals.filter((d) => d.is_graded).length },
    grades: Object.fromEntries(topN(tally(deals.filter((d) => d.is_graded), (d) => `${d.grader || "?"} ${d.grade || "?"}`), 20)),
    listing_type: Object.fromEntries(tally(deals, (d) => d.listing_type || "?")),
    marketplaces: Object.fromEntries(tally(deals, (d) => d.marketplace || "?")),
    item_location_country: Object.fromEntries(topN(tally(deals, (d) => d.item_location_country || "?"), 15)),
    price_bands_paid: Object.fromEntries(BANDS.map((b) => [b, 0]).concat([])),
    price_bands_ref: Object.fromEntries(BANDS.map((b) => [b, 0])),
    discovery_source: Object.fromEntries(tally(deals, (d) => d.discovery_source || "null")),
    visual_status: Object.fromEntries(tally(deals, (d) => d.visual_authenticity_status || "null")),
    language: Object.fromEntries(tally(deals, (d) => d.card_language || "?")),
  };
  for (const d of deals) {
    R.inventory.price_bands_paid[priceBand(d.total_price_usd ?? d.total_price)]++;
    R.inventory.price_bands_ref[priceBand(d.market_price)]++;
  }
  R.inventory.era_breakdown = Object.fromEntries(
    topN(tally(deals, (d) => eraOf(catById.get(String(d.card_tcgplayer_id))?.set_id, setOf(d))), 12)
  );
  R.inventory.rarity_segment = Object.fromEntries(
    topN(tally(deals, (d) => RARITY_SEG(catById.get(String(d.card_tcgplayer_id))?.rarity)), 15)
  );

  const spTally = tally(deals, speciesOf);
  const printTally = tally(deals, printOf);
  const setTally = tally(deals, setOf);
  R.concentration = {
    species_count: spTally.size,
    deals_per_species_mean: +(deals.length / spTally.size).toFixed(2),
    deals_per_printing_mean: +(deals.length / printTally.size).toFixed(2),
    deals_per_set_mean: +(deals.length / setTally.size).toFixed(2),
    top5_species_share_pct: pct(topN(spTally, 5).reduce((a, [, n]) => a + n, 0), deals.length),
    top10_species_share_pct: pct(topN(spTally, 10).reduce((a, [, n]) => a + n, 0), deals.length),
    top20_species_share_pct: pct(topN(spTally, 20).reduce((a, [, n]) => a + n, 0), deals.length),
    top10_printing_share_pct: pct(topN(printTally, 10).reduce((a, [, n]) => a + n, 0), deals.length),
    top10_species: topN(spTally, 10),
    top20_species: topN(spTally, 20),
    top10_printings: topN(printTally, 10).map(([k, n]) => {
      const c = catById.get(String(k));
      const d = deals.find((x) => printOf(x) === k);
      return [`${d?.card_name ?? k} (${c?.set ?? d?.card_set ?? "?"})`, n];
    }),
    top20_sets: topN(setTally, 20),
    species_with_1_deal: [...spTally.values()].filter((n) => n === 1).length,
    printings_with_1_deal: [...printTally.values()].filter((n) => n === 1).length,
  };

  // ---------------------------------------------------------------- watchlist
  const wl = await pageAll("watchlist", "id,justtcg_tcgplayer_id,tier,language,active,last_known_price");
  const wlActive = wl.filter((w) => w.active);
  R.watchlist = {
    total: wl.length,
    active: wlActive.length,
    by_tier: Object.fromEntries(tally(wlActive, (w) => w.tier || "null")),
    by_language: Object.fromEntries(tally(wlActive, (w) => w.language || "null")),
  };
  const wlActiveIds = new Set(wlActive.map((w) => String(w.justtcg_tcgplayer_id)).filter(Boolean));

  // ---------------------------------------------------------------- catalogue
  const catAgg = { species: new Set(), sets: new Set(), printings: 0, byLang: {}, bySeg: {}, byEra: {} };
  const catSpeciesActive = new Set();
  await (async () => {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("card_catalog")
        .select("tcgplayer_id,species,set,set_id,rarity,card_type,language")
        .range(from, from + 999);
      if (error) throw new Error("card_catalog: " + error.message);
      if (!data?.length) break;
      for (const c of data) {
        catAgg.printings++;
        if (c.species) catAgg.species.add(c.species);
        if (c.set) catAgg.sets.add(c.set);
        catAgg.byLang[c.language || "?"] = (catAgg.byLang[c.language || "?"] || 0) + 1;
        const seg = RARITY_SEG(c.rarity);
        catAgg.bySeg[seg] = (catAgg.bySeg[seg] || 0) + 1;
        const era = eraOf(c.set_id, c.set);
        catAgg.byEra[era] = (catAgg.byEra[era] || 0) + 1;
      }
      if (data.length < 1000) break;
    }
  })();
  R.catalogue = {
    printings: catAgg.printings,
    distinct_species: catAgg.species.size,
    distinct_sets: catAgg.sets.size,
    by_language: catAgg.byLang,
    by_rarity_segment: catAgg.bySeg,
    by_era: catAgg.byEra,
  };
  const dealSpeciesSet = new Set(deals.map(speciesOf).filter(Boolean));
  const dealSetSet = new Set(deals.map(setOf).filter(Boolean));
  const dealPrintSet = new Set(deals.map((d) => String(d.card_tcgplayer_id)).filter((v) => v && v !== "null"));
  R.coverage_active = {
    species_pct: pct(dealSpeciesSet.size, catAgg.species.size),
    sets_pct: pct(dealSetSet.size, catAgg.sets.size),
    printings_pct: pct(dealPrintSet.size, catAgg.printings),
    watchlist_printings_pct: pct(dealPrintSet.size, wlActiveIds.size),
  };

  // ---------------------------------------------------------- discovery_events
  const evAll = await pageAll("discovery_events", "listing_key,marketplace,source,search_type,card_tcgplayer_id,became_deal,discount_pct,occurred_at");
  const evSpan = { first: evAll.reduce((a, e) => (a && a < e.occurred_at ? a : e.occurred_at), null), last: evAll.reduce((a, e) => (a && a > e.occurred_at ? a : e.occurred_at), null), rows: evAll.length };
  const win = (h) => evAll.filter((e) => e.occurred_at >= sinceIso(h));
  const laneStats = (evs) => {
    const byLane = {};
    for (const e of evs) {
      const L = e.search_type || (e.source === "external" ? "external" : "unknown");
      (byLane[L] ||= { events: 0, becameDeal: 0, distinctPrintings: new Set(), distinctListings: new Set() });
      byLane[L].events++;
      if (e.became_deal) byLane[L].becameDeal++;
      if (e.card_tcgplayer_id) byLane[L].distinctPrintings.add(String(e.card_tcgplayer_id));
      byLane[L].distinctListings.add(e.listing_key);
    }
    for (const L of Object.keys(byLane)) {
      byLane[L].distinctPrintings = byLane[L].distinctPrintings.size;
      byLane[L].distinctListings = byLane[L].distinctListings.size;
    }
    return byLane;
  };
  const winSummary = (h) => {
    const evs = win(h);
    return {
      events: evs.length,
      became_deal: evs.filter((e) => e.became_deal).length,
      distinct_listings: distinct(evs, (e) => e.listing_key),
      distinct_printings: distinct(evs, (e) => e.card_tcgplayer_id),
      distinct_printings_became_deal: distinct(evs.filter((e) => e.became_deal), (e) => e.card_tcgplayer_id),
      by_marketplace: Object.fromEntries(tally(evs, (e) => e.marketplace || "?")),
      by_source: Object.fromEntries(tally(evs, (e) => e.source || "?")),
      by_lane: laneStats(evs),
      search_coverage_pct_of_active_watchlist: pct(
        new Set(evs.map((e) => String(e.card_tcgplayer_id)).filter((v) => wlActiveIds.has(v))).size,
        wlActiveIds.size
      ),
    };
  };
  R.discovery_events = { span: evSpan, w24h: winSummary(24), w7d: winSummary(24 * 7), w30d_note: "table only spans ~7d; 30d window not available" };

  // deals first_seen windows (discovery of NEW deals, independent of the log)
  const fsWin = (h) => {
    const s = sinceIso(h);
    const arr = deals.filter((d) => d.first_seen_at >= s);
    return {
      new_active_deals: arr.length,
      distinct_species: distinct(arr, speciesOf),
      distinct_printings: distinct(arr, (d) => d.card_tcgplayer_id),
      distinct_sets: distinct(arr, setOf),
      by_marketplace: Object.fromEntries(tally(arr, (d) => d.marketplace || "?")),
      by_era: Object.fromEntries(topN(tally(arr, (d) => eraOf(catById.get(String(d.card_tcgplayer_id))?.set_id, setOf(d))), 10)),
      by_price_band_paid: (() => { const o = Object.fromEntries(BANDS.map((b) => [b, 0])); for (const d of arr) o[priceBand(d.total_price_usd ?? d.total_price)]++; return o; })(),
      raw_graded: { raw: arr.filter((d) => !d.is_graded).length, graded: arr.filter((d) => d.is_graded).length },
    };
  };
  R.new_deal_discovery = { w24h: fsWin(24), w7d: fsWin(24 * 7), w30d: fsWin(24 * 30), w90d: fsWin(24 * 90) };

  // ---------------------------------------------------------- HOMEPAGE SIM
  // flagship candidate pool (mirrors flagshipCandidateQuery constants)
  const flagPool = deals.filter(
    (d) =>
      d.card_language === "english" &&
      d.listing_type === "FIXED_PRICE" &&
      Number(d.market_price) >= 75 &&
      Number(d.discount_pct) <= 0.65
  );
  const savingUsd = (d) => {
    const m = Number(d.market_price), p = Number(d.total_price_usd ?? d.total_price);
    return Number.isFinite(m) && Number.isFinite(p) && m - p > 0 ? m - p : null;
  };
  const flagScore = (d) => {
    const disc = Math.max(0, Math.min(Number(d.discount_pct) || 0, 0.65)) / 0.65;
    const s = savingUsd(d);
    const sav = s == null ? 0 : Math.min(Math.log10(1 + s) / Math.log10(1 + 300), 1);
    const softRef = (Number(d.discount_pct) || 0) > 0.55 && !(d.is_graded || d.visual_authenticity_status === "MATCH") ? 0.85 : 1;
    return (0.5 * disc + 0.5 * sav) * softRef;
  };
  const flagRanked = flagPool.filter((d) => savingUsd(d) != null).sort((a, b) => flagScore(b) - flagScore(a));
  // current: one tile per canonical card, top 4
  const dedupPrint = (rows, n) => {
    const seen = new Set(), out = [];
    for (const r of rows) { const k = printOf(r); if (seen.has(k)) continue; seen.add(k); out.push(r); if (out.length >= n) break; }
    return out;
  };
  const diversityOf = (rows) => ({
    n: rows.length,
    distinct_species: distinct(rows, speciesOf),
    distinct_printings: distinct(rows, printOf),
    distinct_sets: distinct(rows, setOf),
    distinct_price_bands: distinct(rows, (d) => priceBand(d.total_price_usd ?? d.total_price)),
    repeated_species_max: Math.max(0, ...[...tally(rows, speciesOf).values()]),
    avg_discount_pct: +(rows.reduce((a, d) => a + (Number(d.discount_pct) || 0), 0) / rows.length * 100).toFixed(1),
    avg_saving_usd: +(rows.reduce((a, d) => a + (savingUsd(d) || 0), 0) / rows.length).toFixed(0),
    species_list: [...new Set(rows.map(speciesOf))].slice(0, 12),
  });

  const CUR4 = dedupPrint(flagRanked, 4);
  const CUR12 = dedupPrint(flagRanked, 12);
  // grid preview pool: newest-first english active, dedup watchlist, first 400
  const gridPool = [...deals].filter((d) => d.card_language === "english").sort((a, b) => (a.first_seen_at < b.first_seen_at ? 1 : -1));
  const gridSeen = new Set(), gridDedup = [];
  for (const d of gridPool) { if (gridSeen.has(d.watchlist_id)) continue; gridSeen.add(d.watchlist_id); gridDedup.push(d); }
  const grid400 = gridDedup.slice(0, 400);

  // model simulations on the flagship-ranked pool, n=12 (a "best finds" lane)
  const modelA = (() => { // max 1 printing per lane (== current dedup)
    return dedupPrint(flagRanked, 12);
  })();
  const modelB = (() => { // max 2 deals per species
    const perSp = new Map(), out = [];
    for (const r of flagRanked) { const s = speciesOf(r) || r.id; const c = perSp.get(s) || 0; if (c >= 2) continue; perSp.set(s, c + 1); out.push(r); if (out.length >= 12) break; }
    return out;
  })();
  const modelC = (() => { // quality first + no dup printing + soft species diversity (penalise 2nd+ of a species)
    const scored = flagRanked.map((r) => ({ r, s: flagScore(r) }));
    const seenP = new Set(), spCount = new Map(), out = [];
    // greedy: iterate by score, skip dup printing, apply a decaying species bonus by re-sorting once
    for (const { r } of scored) {
      const p = printOf(r); if (seenP.has(p)) continue;
      const sc = spCount.get(speciesOf(r)) || 0;
      // soft: allow but stop a species after 3
      if (sc >= 3) continue;
      seenP.add(p); spCount.set(speciesOf(r), sc + 1); out.push(r);
      if (out.length >= 12) break;
    }
    return out;
  })();
  const modelD = (() => { // quality + freshness + species + set + price-band diversity (round-robin fill)
    const buckets = new Map();
    for (const r of flagRanked) { const b = priceBand(r.total_price_usd ?? r.total_price); (buckets.get(b) || buckets.set(b, []).get(b)).push(r); }
    const seenP = new Set(), seenSp = new Map(), seenSet = new Map(), out = [];
    const order = [...buckets.keys()];
    let idx = 0;
    while (out.length < 12) {
      let placed = false;
      for (let k = 0; k < order.length; k++) {
        const arr = buckets.get(order[(idx + k) % order.length]);
        while (arr && arr.length) {
          const r = arr.shift();
          const p = printOf(r); if (seenP.has(p)) continue;
          const sc = seenSp.get(speciesOf(r)) || 0; if (sc >= 2) continue;
          const stc = seenSet.get(setOf(r)) || 0; if (stc >= 3) continue;
          seenP.add(p); seenSp.set(speciesOf(r), sc + 1); seenSet.set(setOf(r), stc + 1); out.push(r); placed = true; break;
        }
        if (placed) break;
      }
      idx++;
      if (!placed) break;
    }
    return out;
  })();

  R.homepage_sim = {
    flagship_candidate_pool_size: flagPool.length,
    flagship_pool_diversity: diversityOf(flagPool),
    grid_preview_pool_400_diversity: diversityOf(grid400),
    CURRENT_flagship_top4: diversityOf(CUR4),
    CURRENT_bestfinds_top12: diversityOf(CUR12),
    MODEL_A_1printing_per_lane_n12: diversityOf(modelA),
    MODEL_B_max2_per_species_n12: diversityOf(modelB),
    MODEL_C_quality_plus_soft_species_n12: diversityOf(modelC),
    MODEL_D_quality_fresh_species_set_priceband_n12: diversityOf(modelD),
    note: "avg_discount_pct / avg_saving_usd show whether a diversity model suppresses strong deals vs CURRENT.",
  };

  // ---------------------------------------------------------- long-tail segments
  // which catalogue rarity-segments / eras have produced ANY active deal
  const segActive = {};
  for (const seg of Object.keys(catAgg.bySeg)) segActive[seg] = 0;
  for (const d of deals) { const seg = RARITY_SEG(catById.get(String(d.card_tcgplayer_id))?.rarity); segActive[seg] = (segActive[seg] || 0) + 1; }
  const eraActive = {};
  for (const d of deals) { const e = eraOf(catById.get(String(d.card_tcgplayer_id))?.set_id, setOf(d)); eraActive[e] = (eraActive[e] || 0) + 1; }
  R.longtail_segments = {
    catalogue_by_rarity_segment: catAgg.bySeg,
    active_deals_by_rarity_segment: segActive,
    catalogue_by_era: catAgg.byEra,
    active_deals_by_era: eraActive,
    catalogue_by_language: catAgg.byLang,
    active_deals_by_language: R.inventory.language,
    catalogue_species_with_zero_active_deal: catAgg.species.size - dealSpeciesSet.size,
    catalogue_sets_with_zero_active_deal: catAgg.sets.size - dealSetSet.size,
  };

  console.log(JSON.stringify(R, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
