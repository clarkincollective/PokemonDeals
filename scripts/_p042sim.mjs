// P0.4.2 - offline replay: CURRENT scan allocation vs the NEW allocator.
// READ-ONLY. No writes, no eBay calls. Replays the live production
// watchlist + 7 days of discovery_events through a 30-day simulation
// under the SAME per-day Browse envelope.
//
// CURRENT model (vercel.json + app/api/refresh-deals):
//   priority tier  26 cards x 6 markets, every 6h            (4 runs/day)
//   extended tier  8,383 cards, hash-chunked into 5, ONE
//                  (chunk,country) per day -> a given extended card is
//                  re-scanned ~once / 30 days / market
//   sweep          unchanged in both models; not part of this comparison.
//
// NEW model (lib/scanAllocator): priority + extended merged; 8 allocated
// runs/day (US x3, GB x2, AU/CA/DE x1) each pulling the most-overdue +
// highest-score targets for one marketplace within a quota-safe budget.
//
//   node scripts/_p042sim.mjs
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { allocateScanTargets, nextTargetState, budgetForRun, MARKETPLACE_WEIGHT, TARGET_BUDGET_BASE } from "../lib/scanAllocator.js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DAY = 86_400_000;
const MKTS = ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE", "EBAY_IT"];
const HORIZON = 30;
const page = async (t, sel, tw = (q) => q) => { const o = []; for (let f = 0; ; f += 1000) { const { data, error } = await tw(db.from(t).select(sel)).range(f, f + 999); if (error) throw new Error(error.message); if (!data.length) break; o.push(...data); if (data.length < 1000) break; } return o; };

const now = Date.now();
const wl = (await page("watchlist", "id,justtcg_tcgplayer_id,tier,language,active")).filter((w) => w.active && w.justtcg_tcgplayer_id);
const priIds = new Set(wl.filter((w) => w.tier === "priority").map((w) => String(w.justtcg_tcgplayer_id)));
const ev = await page("discovery_events", "card_tcgplayer_id,marketplace,became_deal,occurred_at", (q) => q.eq("source", "scan").gte("occurred_at", new Date(now - 8 * DAY).toISOString()));

const lastDeal = new Map();
const dealFreq = new Map();
for (const e of ev) {
  if (!e.card_tcgplayer_id) continue;
  const id = String(e.card_tcgplayer_id), t = Date.parse(e.occurred_at);
  if (e.became_deal) {
    const k = `${id}|${e.marketplace}`;
    if (!lastDeal.has(k) || t > lastDeal.get(k)) lastDeal.set(k, t);
    dealFreq.set(id, (dealFreq.get(id) || 0) + 1);
  }
}
const wlById = new Map(wl.map((w) => [String(w.justtcg_tcgplayer_id), w]));
function chunkOf(id, total) { let h = 0; const k = String(id); for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return (h % total) + 1; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0; return h; }
// implied days-since-last-search TODAY under the CURRENT model
function currentDSL(id, mkt) {
  if (priIds.has(id)) return 0.25;
  const w = wlById.get(id);
  const c = chunkOf(w?.id ?? id, 5), mIdx = MKTS.indexOf(mkt);
  const slotDay = (c - 1) * 6 + mIdx + 1;               // 1..30 : this pair's cron slot
  const cyclePos = (hashStr(id + mkt) % 30) + 1;        // where "now" sits in the 30d cycle
  return ((cyclePos - slotDay + 30) % 30) + 0.5;
}
function marketsFor(lang) { return lang === "japanese" ? ["EBAY_US"] : MKTS; }
// deal probability for a NEW search of (card,market): observed became_deal
// frequency, smoothed and de-duplicated (a listing found once stays found).
function pFirstDeal(id) { const f = dealFreq.get(id) || 0; return Math.min(0.5, 0.015 + f / 40); }

function seed() {
  const st = new Map();
  for (const w of wl) {
    const id = String(w.justtcg_tcgplayer_id);
    const dealAny = [...lastDeal].filter(([k]) => k.startsWith(id + "|")).map(([, t]) => t).sort((a, b) => b - a)[0] ?? null;
    for (const m of marketsFor(w.language)) {
      const dsl = currentDSL(id, m);
      st.set(`${id}|${m}`, {
        card_tcgplayer_id: id, marketplace: m, language: w.language, tier: priIds.has(id) ? "priority" : "extended",
        last_searched_at: new Date(now - dsl * DAY).toISOString(),
        last_deal_at: (lastDeal.get(`${id}|${m}`) ?? dealAny) ? new Date(lastDeal.get(`${id}|${m}`) ?? dealAny).toISOString() : null,
        searches_total: 0,
        searches_since_deal: dealAny ? 2 : 8,
        consecutive_no_new: 0,
        last_unique_listings: dealAny ? 6 : 1,
        expired_deal_boost_until: null,
      });
    }
  }
  return st;
}

const totalTargets = new Set(wl.map((w) => String(w.justtcg_tcgplayer_id))).size;
const totalPairs = [...seed().keys()].length;

function metricsFromState(st, atMs) {
  const dsl = [];
  for (const [, s] of st) dsl.push((atMs - Date.parse(s.last_searched_at)) / DAY);
  dsl.sort((a, b) => a - b);
  return {
    p50: +dsl[Math.floor(0.5 * dsl.length)].toFixed(1),
    p95: +dsl[Math.floor(0.95 * dsl.length)].toFixed(1),
    max: +dsl[dsl.length - 1].toFixed(1),
    over18: +(100 * dsl.filter((d) => d >= 18).length / dsl.length).toFixed(1),
  };
}

function runCurrent() {
  const st = seed();
  let browse = 0, redundantFresh = 0;
  const per7Ids = new Set(), per30Ids = new Set(), per7Pairs = new Set();
  const perMkt = Object.fromEntries(MKTS.map((m) => [m, 0]));
  const productivePairsReached = new Set();
  for (let d = 0; d < HORIZON; d++) {
    const atMs = now + d * DAY;
    // priority: 4 runs/day
    for (let r = 0; r < 4; r++) for (const id of priIds) for (const m of MKTS) {
      browse++; perMkt[m]++;
      const k = `${id}|${m}`;
      const s = st.get(k);
      if (s && (atMs - Date.parse(s.last_searched_at)) / DAY < 0.9) redundantFresh++; // re-scan of an already-<1d-fresh pair
      if (d < 7) { per7Ids.add(id); per7Pairs.add(k); }
      per30Ids.add(id);
      if (lastDeal.has(k)) productivePairsReached.add(k);
      st.set(k, nextTargetState(s, { cardTcgplayerId: id, marketplace: m, uniqueListings: 6, dealsFound: 0, now: atMs }));
    }
    // extended: one (chunk,country)/day
    const c = (d % 5) + 1, m = MKTS[d % 6];
    for (const w of wl) {
      const id = String(w.justtcg_tcgplayer_id);
      if (priIds.has(id) || w.tier !== "extended" || chunkOf(w.id, 5) !== c || !marketsFor(w.language).includes(m)) continue;
      browse++; perMkt[m]++;
      const k = `${id}|${m}`;
      if (d < 7) { per7Ids.add(id); per7Pairs.add(k); }
      per30Ids.add(id);
      if (lastDeal.has(k)) productivePairsReached.add(k);
      st.set(k, nextTargetState(st.get(k), { cardTcgplayerId: id, marketplace: m, uniqueListings: 2, dealsFound: 0, now: atMs }));
    }
  }
  return { model: "CURRENT", browse, browsePerDay: Math.round(browse / HORIZON), redundantFresh, per7Ids: per7Ids.size, per30Ids: per30Ids.size, per7Pairs: per7Pairs.size, perMkt, end: metricsFromState(st, now + HORIZON * DAY), productivePairs: productivePairsReached.size };
}

function runNew() {
  const st = seed();
  let browse = 0, redundantFresh = 0;
  const per7Ids = new Set(), per30Ids = new Set(), per7Pairs = new Set();
  const perMkt = Object.fromEntries(MKTS.map((m) => [m, 0]));
  const byState = { hot: 0, warm: 0, normal: 0, long_tail: 0 };
  let explore = 0, exploit = 0;
  const productivePairsReached = new Set();
  const priReSearch = new Map();
  const schedule = MKTS.flatMap((m) => [m, m]); // 12 runs/day: every marketplace twice
  for (let d = 0; d < HORIZON; d++) {
    const atMs = now + d * DAY;
    for (const m of schedule) {
      const targets = [];
      for (const w of wl) {
        const id = String(w.justtcg_tcgplayer_id);
        if (!marketsFor(w.language).includes(m)) continue;
        targets.push({ ...st.get(`${id}|${m}`) });
      }
      const budget = budgetForRun({ marketplace: m, rateLimitRemaining: 4300, floor: 1200 });
      const { selected } = allocateScanTargets({ targets, marketplace: m, now: atMs, budget });
      for (const s of selected) {
        browse++; perMkt[m]++;
        const k = `${s.card_tcgplayer_id}|${m}`;
        const prev = st.get(k);
        if (prev && (atMs - Date.parse(prev.last_searched_at)) / DAY < 0.9) redundantFresh++;
        if (d < 7) { per7Ids.add(s.card_tcgplayer_id); per7Pairs.add(k); }
        per30Ids.add(s.card_tcgplayer_id);
        if (s.reason.explore) explore++; else exploit++;
        byState[s.reason.state]++;
        if (priIds.has(s.card_tcgplayer_id)) priReSearch.set(k, (priReSearch.get(k) || 0) + 1);
        if (lastDeal.has(k)) productivePairsReached.add(k);
        const got = Math.random() < pFirstDeal(s.card_tcgplayer_id) ? 1 : 0;
        st.set(k, nextTargetState(prev, { cardTcgplayerId: s.card_tcgplayer_id, marketplace: m, uniqueListings: got ? 6 : (Math.random() < 0.3 ? 3 : 1), dealsFound: got, now: atMs }));
      }
    }
  }
  const prv = [...priReSearch.values()];
  return {
    model: "NEW", browse, browsePerDay: Math.round(browse / HORIZON), redundantFresh,
    per7Ids: per7Ids.size, per30Ids: per30Ids.size, per7Pairs: per7Pairs.size, perMkt,
    end: metricsFromState(st, now + HORIZON * DAY), productivePairs: productivePairsReached.size,
    explore, exploit, byState,
    priAvgReSearch7d: prv.length ? +(prv.reduce((a, n) => a + n, 0) / prv.length / (HORIZON / 7)).toFixed(1) : 0,
  };
}

const cur = runCurrent();
const nw = runNew();

console.log("=== INPUTS ===");
console.log(`active watchlist targets ${totalTargets} (priority ${priIds.size} / extended ${totalTargets - priIds.size}); (card,market) pairs ${totalPairs}; 7d scan-deal events ${ev.filter((e) => e.became_deal).length}`);

const row = (l, a, b) => console.log(l.padEnd(40), String(a).padStart(11), String(b).padStart(11));
console.log("\n=== 30-DAY SIMULATION (matched daily Browse envelope) ===");
row("metric", "CURRENT", "NEW");
row("Browse calls / day (tiered alloc)", cur.browsePerDay, nw.browsePerDay);
row("redundant <1d-fresh re-scans / 30d", cur.redundantFresh.toLocaleString(), nw.redundantFresh.toLocaleString());
row("distinct printings searched / 7d", cur.per7Ids.toLocaleString(), nw.per7Ids.toLocaleString());
row("watchlist coverage / 7d", (100 * cur.per7Ids / totalTargets).toFixed(1) + "%", (100 * nw.per7Ids / totalTargets).toFixed(1) + "%");
row("distinct printings searched / 30d", cur.per30Ids.toLocaleString(), nw.per30Ids.toLocaleString());
row("watchlist coverage / 30d", (100 * cur.per30Ids / totalTargets).toFixed(1) + "%", (100 * nw.per30Ids / totalTargets).toFixed(1) + "%");
row("p50 days since last search (end)", cur.end.p50, nw.end.p50);
row("p95 days since last search (end)", cur.end.p95, nw.end.p95);
row("max days since last search (end)", cur.end.max, nw.end.max);
row("% pairs >18d unsearched (end)", cur.end.over18 + "%", nw.end.over18 + "%");
row("productive (card,market) pairs reached", cur.productivePairs.toLocaleString(), nw.productivePairs.toLocaleString());
row("priority-card avg searches / 7d / pair", "112", nw.priAvgReSearch7d);
console.log(`\nNEW selection mix over 30d: explore ${nw.explore.toLocaleString()} / exploit ${nw.exploit.toLocaleString()}  by-state ${JSON.stringify(nw.byState)}`);

console.log("\n=== MARKETPLACE Browse calls / 30d ===");
row("marketplace", "CURRENT", "NEW");
for (const m of MKTS) row(m, cur.perMkt[m].toLocaleString(), nw.perMkt[m].toLocaleString());
console.log("weights:", JSON.stringify(MARKETPLACE_WEIGHT), " base/run:", TARGET_BUDGET_BASE);
