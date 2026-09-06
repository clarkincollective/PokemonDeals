// P0.4.1 - offline CURRENT vs P0.4.1 homepage comparison on live prod
// active-deal data. Read-only. Replicates the production queries + gates
// (lib/dealQuality, lib/flagshipRanking, lib/auctionLaneRanking) and the
// new lib/homepageVariety selector. No writes, no eBay calls.
//   node scripts/_p041compare.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { isDisplayableDeal, isPremiumDealEligible, dealFreshness } from "../lib/dealQuality.js";
import { rankFlagshipDeals } from "../lib/flagshipRanking.js";
import { rankAuctionLane } from "../lib/auctionLaneRanking.js";
import { buildHomepageLanes, rotationBucket, selectDiverseLane, rotateForBucket, printingKey, speciesKey, setKey } from "../lib/homepageVariety.js";
import sppkg from "../lib/pokemonSpecies.js";
const { extractSpecies } = sppkg;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SEL = "*, watchlist:watchlist_id!inner (name, set, justtcg_tcgplayer_id, language)";
const page = async (tw) => { const o = []; for (let f = 0; ; f += 1000) { const { data, error } = await tw().range(f, f + 999); if (error) throw new Error(error.message); if (!data.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const now = Date.now();
const FRESH_CUTOFF = new Date(now - 48 * 3600e3).toISOString();

// ---------- fetch every pool once ----------
const flagRaw = await page(() => db.from("deals").select(SEL).eq("is_active", true).eq("watchlist.language", "english").eq("listing_type", "FIXED_PRICE").gte("market_price", 75).lte("discount_pct", 0.65).order("discount_pct", { ascending: false }));
const freshRaw = await page(() => db.from("deals").select(SEL).eq("is_active", true).eq("watchlist.language", "english").gte("first_seen_at", FRESH_CUTOFF).order("first_seen_at", { ascending: false }));
const underRaw = await page(() => db.from("deals").select(SEL).eq("is_active", true).eq("watchlist.language", "english").eq("listing_type", "FIXED_PRICE").lte("total_price", 25).order("first_seen_at", { ascending: false }));
const auctRaw = await page(() => db.from("deals").select(SEL).eq("is_active", true).eq("watchlist.language", "english").eq("listing_type", "AUCTION").not("auction_end_at", "is", null).gt("auction_end_at", new Date().toISOString()).order("auction_end_at", { ascending: true }));
const gridRaw = await page(() => db.from("deals").select(SEL).eq("is_active", true).eq("watchlist.language", "english").order("first_seen_at", { ascending: false }));

const premium = (rows) => rows.filter(isPremiumDealEligible);
const disp = (rows) => rows.filter(isDisplayableDeal);
const freshRank = { FRESH: 0, AGING: 1, STALE: 2, ENDED: 3 };

// ---------- CURRENT homepage ----------
const cur = {};
cur.flagship = rankFlagshipDeals(premium(flagRaw), { freshnessOf: (r) => dealFreshness(r), limit: 4 });
{ const seen = new Set(), out = []; for (const d of premium(freshRaw).slice(0, 18)) { if (seen.has(d.watchlist_id)) continue; seen.add(d.watchlist_id); out.push(d); if (out.length >= 3) break; } cur.justAdded = out; }
cur.auctions = rankAuctionLane(premium(auctRaw.slice(0, 120)), { freshnessOf: (r) => dealFreshness(r), limit: 3 });
{ // grid: displayable -> dedup watchlist -> newest 400 -> shuffle -> 9  (Math.random, so sample once deterministically-ish by taking first 9 of newest-400 as an upper-bound "best case")
  const seen = new Set(), dd = []; for (const d of disp(gridRaw)) { if (seen.has(d.watchlist_id)) continue; seen.add(d.watchlist_id); dd.push(d); }
  const p400 = dd.slice(0, 400);
  // average a shuffled 9-draw over 200 trials for the metrics; also keep one draw for the "visible" set
  cur._grid400 = p400;
  const c = [...p400]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  cur.grid = c.slice(0, 9);
}

// ---------- P0.4.1 homepage ----------
const pools = {
  flagship: rankFlagshipDeals(premium(flagRaw), { freshnessOf: (r) => dealFreshness(r), limit: 60 }),
  justAdded: premium(freshRaw).slice(0, 250),
  underPrice: disp(underRaw).slice(0, 250).sort((a, b) => (freshRank[dealFreshness(a)] ?? 1) - (freshRank[dealFreshness(b)] ?? 1) || (Number(b.discount_pct) || 0) - (Number(a.discount_pct) || 0) || String(b.first_seen_at ?? "").localeCompare(String(a.first_seen_at ?? ""))),
  auctions: rankAuctionLane(premium(auctRaw.slice(0, 120)), { freshnessOf: (r) => dealFreshness(r), limit: 24 }),
  grid: disp(gridRaw),
};
const bucket = rotationBucket();
const p041 = buildHomepageLanes(pools, { bucket });

// ---------- metrics ----------
const spOf = (d) => extractSpecies(d.card_name ?? d.watchlist?.name ?? "") || "(none)";
const setOf = (d) => (d.card_set ?? d.watchlist?.set ?? "?");
const prOf = (d) => printingKey(d);
const savingPct = (d) => Number(d.discount_pct) || 0;
const savingUsd = (d) => { const m = Number(d.market_price), p = Number(d.total_price_usd ?? d.total_price); return Number.isFinite(m) && Number.isFinite(p) && m - p > 0 ? m - p : 0; };
const ageDays = (d) => (now - Date.parse(d.first_seen_at)) / 864e5;
const band = (d) => { const n = Number(d.total_price ?? d.total_price_usd); if (!Number.isFinite(n)) return "?"; if (n < 25) return "<$25"; if (n < 50) return "$25-50"; if (n < 100) return "$50-100"; if (n < 250) return "$100-250"; return "$250+"; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const tallyMax = (arr, f) => { const m = new Map(); for (const x of arr) m.set(f(x), (m.get(f(x)) || 0) + 1); return Math.max(0, ...m.values()); };
const repeats = (arr, f) => { const m = new Map(); for (const x of arr) m.set(f(x), (m.get(f(x)) || 0) + 1); return [...m.values()].filter((n) => n > 1).reduce((a, n) => a + (n - 1), 0); };

function metrics(name, lanesObj, order) {
  const visible = order.flatMap((k) => lanesObj[k] ?? []);
  const sp = new Set(visible.map(spOf)), pr = new Set(visible.map(prOf)), st = new Set(visible.map(setOf));
  const topSp = tallyMax(visible, spOf);
  const bands = {}; for (const d of visible) bands[band(d)] = (bands[band(d)] || 0) + 1;
  const ages = visible.map(ageDays);
  return {
    name,
    visible_cards: visible.length,
    distinct_species: sp.size,
    distinct_printings: pr.size,
    distinct_sets: st.size,
    top_species_share_pct: +(topSp / visible.length * 100).toFixed(1),
    repeated_printings: repeats(visible, prOf),
    repeated_species: repeats(visible, spOf),
    price_bands: bands,
    mean_saving_pct: +(visible.reduce((a, d) => a + savingPct(d), 0) / visible.length * 100).toFixed(1),
    median_saving_pct: +(median(visible.map(savingPct)) * 100).toFixed(1),
    mean_saving_usd: Math.round(visible.reduce((a, d) => a + savingUsd(d), 0) / visible.length),
    median_saving_usd: Math.round(median(visible.map(savingUsd))),
    mean_age_days: +(ages.reduce((a, x) => a + x, 0) / ages.length).toFixed(2),
    p90_age_days: +([...ages].sort((a, b) => a - b)[Math.floor(0.9 * ages.length)] ?? 0).toFixed(2),
    fresh_share_pct: +(visible.filter((d) => dealFreshness(d) === "FRESH").length / visible.length * 100).toFixed(1),
  };
}

const order = ["flagship", "underPrice", "justAdded", "auctions", "grid"];
const shared = ["flagship", "justAdded", "auctions", "grid"];

// CURRENT grid is Math.random-shuffled: average its metrics over trials.
function curMetricsAveraged(trials = 200) {
  const acc = [];
  for (let t = 0; t < trials; t++) {
    const c = [...cur._grid400]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    acc.push(metrics("CURRENT", { ...cur, grid: c.slice(0, 9) }, shared));
  }
  const avg = {}; for (const k of Object.keys(acc[0])) { if (typeof acc[0][k] === "number") avg[k] = +(acc.reduce((a, m) => a + m[k], 0) / trials).toFixed(2); }
  avg.name = "CURRENT (grid=mean of " + trials + " shuffles)";
  return avg;
}

console.log("=== SHARED LANES ONLY (flagship + Just Added + auctions + grid) - like-for-like ===");
console.log("CURRENT :", JSON.stringify(curMetricsAveraged(), null, 0));
console.log("P0.4.1  :", JSON.stringify(metrics("P0.4.1", p041, shared), null, 0));
console.log("\n=== FULL HOMEPAGE (P0.4.1 adds the Under $25 lane) ===");
console.log("P0.4.1 FULL:", JSON.stringify(metrics("P0.4.1 full", p041, order), null, 0));

console.log("\n=== PER-LANE (P0.4.1) ===");
for (const k of order) {
  const L = p041[k] ?? [];
  console.log(k.padEnd(11), "n=" + L.length, "species=" + new Set(L.map(spOf)).size, "printings=" + new Set(L.map(prOf)).size, "sets=" + new Set(L.map(setOf)).size,
    "meanSave%=" + (L.length ? +(L.reduce((a, d) => a + savingPct(d), 0) / L.length * 100).toFixed(1) : 0),
    "meanSave$=" + (L.length ? Math.round(L.reduce((a, d) => a + savingUsd(d), 0) / L.length) : 0),
    "species=[" + [...new Set(L.map(spOf))].slice(0, 6).join(",") + "]");
}
console.log("\npool sizes:", Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length])));

console.log("\n=== ROTATION: 6 consecutive 3h buckets (flagship + underPrice species) ===");
for (let b = bucket; b < bucket + 6; b++) {
  const L = buildHomepageLanes(pools, { bucket: b });
  console.log("bucket", b, " flagship:", L.flagship.map(spOf).join("/"), " | under25:", L.underPrice.map(spOf).join("/"), " | grid species#:", new Set(L.grid.map(spOf)).size);
}
// determinism check
const a1 = JSON.stringify(buildHomepageLanes(pools, { bucket }).flagship.map((d) => d.id));
const a2 = JSON.stringify(buildHomepageLanes(pools, { bucket }).flagship.map((d) => d.id));
console.log("\nsame bucket -> identical:", a1 === a2);

// cross-lane dedupe check
const all041 = order.flatMap((k) => p041[k]);
const prAll = all041.map(prOf);
console.log("cross-lane repeated printings across ALL P0.4.1 lanes:", prAll.length - new Set(prAll).size);
