// browse-budget-r1 - bounded RETROSPECTIVE scheduling replay (read-only).
//
// Replays every logged invocation in ebay_job_runs for complete quota windows
// through the real grant policy (lib/browseBudget.js evaluateGrant) with the
// retained legacy floors, and reports what enforce mode would have granted.
// SELECT only; no provider call, no write.
//
// Assumptions (stated in the output):
//   demand     a run that executed would make the calls it actually made; a
//              skipped run would have made its consumer's median executed call
//              count (verify: 20)
//   duration   executed runs: their logged duration; skipped runs: the
//              consumer's median (min 30 s)
//   attempts   min(grant, demand), scaled for allocated target sizing
//   provider   remaining = 5,000 - attempts of settled runs - attempts of open
//              runs (open runs assumed to have spent everything at start) -
//              unaccounted drift
// Cases: expected | conservative (3x durations, 200 unaccounted calls at
// hour 6) | charged-in-full (every lease crashes: charged its whole grant at
// expiry, nothing released, plus the 200-call drift) | no-settle (no lease
// ever settles or expires: the strictest accounting bound).
//
// Usage: node scripts/browse-budget-replay.mjs [windowStart ...]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
require("dotenv").config({ path: join(ROOT, ".env.local"), quiet: true });
const { createClient } = require("@supabase/supabase-js");
const budget = require(join(ROOT, "lib/browseBudget.js"));

const H = 3.6e6;
const LEGACY_FLOORS = { sweep: 250, allocated: 1200, ingest: 800, images: 900 + 12, sealed: 250 };
const LEGACY_TARGETS = { EBAY_US: 200, EBAY_GB: 150, EBAY_AU: 131, EBAY_CA: 131, EBAY_DE: 119, EBAY_IT: 113 };
const PER_TARGET = { EBAY_US: 3.2, EBAY_GB: 2.9, EBAY_AU: 2.9, EBAY_CA: 3.4, EBAY_DE: 1.9, EBAY_IT: 3.5 };
const SWEEP_PAGES = (c) => (c === "EBAY_US" ? 5 : 8);

const windows = process.argv.slice(2).length ? process.argv.slice(2) : ["2026-09-11T07:00:00Z", "2026-09-12T07:00:00Z", "2026-09-13T07:00:00Z"];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function keyOf(r) {
  if (r.job === "refresh-deals:sweep") return `sweep:${r.country}`;
  if (r.job === "refresh-deals:allocated") return `allocated:${r.country}`;
  if (r.job === "verify-deals") return "verify";
  if (r.job === "ingest-feed") return "ingest";
  if (r.job === "screen-deal-images") return "images";
  if (r.job === "refresh-sealed-deals") return "sealed";
  return "manual";
}
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

function requestFor(key, demand) {
  const [group, country] = key.split(":");
  if (group === "sweep") return { requested: SWEEP_PAGES(country) + 18 + 2, minGrant: SWEEP_PAGES(country) + 1 };
  if (group === "allocated") return { requested: Math.ceil(LEGACY_TARGETS[country] * PER_TARGET[country]) + 2, minGrant: 20 };
  if (group === "verify") return { requested: 20, minGrant: 5 };
  if (group === "ingest") { const d = Math.min(40, Math.max(0, demand)); return { requested: d + (d >= 10 ? 2 : 0), minGrant: Math.min(5, d) }; }
  if (group === "images") return { requested: Math.min(12, Math.max(0, demand)), minGrant: 1 };
  return { requested: 1, minGrant: 1 };
}
function attemptsFor(key, granted, demand) {
  const [group, country] = key.split(":");
  if (group === "verify") return Math.min(granted - (granted >= 10 ? 1 : 0), demand);
  if (group === "allocated") {
    const targets = Math.floor((granted - 2) / PER_TARGET[country]);
    return Math.min(granted, Math.round(demand * Math.min(1, targets / LEGACY_TARGETS[country])));
  }
  if (group === "ingest") return Math.min(granted - (granted >= 10 ? 2 : 0), demand);
  return Math.min(granted, demand);
}

async function load(startIso) {
  const start = Date.parse(startIso);
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db.from("ebay_job_runs").select("job,country,started_at,completed_at,status,browse_calls").gte("started_at", new Date(start).toISOString()).lt("started_at", new Date(start + 24 * H).toISOString()).order("started_at").range(f, f + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { start, rows };
}

const TTL_MS = { verify: 180_000, sweep: 860_000, allocated: 860_000, ingest: 360_000, images: 180_000, sealed: 560_000, manual: 860_000 };
function simulate({ start, rows }, { name, durationScale = 1, drift = null, settle = true, chargeInFull = false }, medians) {
  const end = start + 24 * H;
  const win = { id: new Date(end).toISOString(), windowStart: start, windowEnd: end };
  const ledger = budget.emptyLedger(win);
  const spent = { settled: 0, open: 0 };
  const events = [];
  for (const r of rows) {
    const key = keyOf(r);
    const ran = r.status !== "skipped";
    const demand = key === "verify" ? 20 : ran ? r.browse_calls ?? 0 : medians.calls[key] ?? 0;
    const dur = Math.max(30_000, (ran && r.completed_at ? Date.parse(r.completed_at) - Date.parse(r.started_at) : medians.duration[key] ?? 30_000) * durationScale);
    events.push({ t: Date.parse(r.started_at), key, demand, dur });
  }
  events.sort((a, b) => a.t - b.t);
  const pending = []; // settle events
  const out = { name, byGroup: {}, byKey: {}, verifyBuckets: Array(8).fill(0), verifyCallsBuckets: Array(8).fill(0), skips: {}, minRemaining: { value: Infinity, at: null }, driftApplied: 0 };
  const bump = (o, k, f, n = 1) => { (o[k] ??= {})[f] = ((o[k] ?? {})[f] ?? 0) + n; };
  let driftDone = false;
  const remaining = () => 5000 - spent.settled - spent.open - out.driftApplied;
  const flush = (t) => {
    pending.sort((a, b) => a.t - b.t);
    while (pending.length && pending[0].t <= t) {
      const p = pending.shift();
      delete ledger.open[p.id];
      ledger.used[p.key] = (ledger.used[p.key] ?? 0) + p.attempts;
      spent.open -= p.attempts;
      spent.settled += p.attempts;
    }
  };
  let n = 0;
  for (const e of events) {
    if (settle) flush(e.t);
    if (drift && !driftDone && e.t >= start + drift.atHour * H) { out.driftApplied += drift.calls; driftDone = true; }
    const group = e.key.split(":")[0];
    bump(out.byKey, e.key, "scheduled");
    const rem = remaining();
    if (rem < out.minRemaining.value) out.minRemaining = { value: rem, at: ((e.t - start) / H).toFixed(1) + "h" };
    if (LEGACY_FLOORS[group] != null && rem < LEGACY_FLOORS[group]) { bump(out.skips, e.key, "legacy_floor"); continue; }
    const { requested, minGrant } = requestFor(e.key, e.demand);
    if (requested <= 0) { bump(out.skips, e.key, "no_demand"); continue; }
    budget.reconcile(ledger, { remaining: rem, limit: 5000 }, e.t);
    const d = budget.evaluateGrant(ledger, { key: e.key, requested, minGrant, observation: { remaining: rem }, now: e.t });
    if (!(d.granted > 0)) { bump(out.skips, e.key, `budget_${d.denied}`); continue; }
    const attempts = chargeInFull ? d.granted : Math.max(0, attemptsFor(e.key, d.granted, e.demand));
    const id = `r${n++}`;
    ledger.open[id] = { key: e.key, granted: d.granted, expiresAt: new Date(e.t + e.dur).toISOString() };
    spent.open += attempts;
    pending.push({ t: e.t + (chargeInFull ? TTL_MS[group] : e.dur), id, key: e.key, attempts, granted: d.granted });
    bump(out.byKey, e.key, "ran");
    bump(out.byKey, e.key, "granted", d.granted);
    bump(out.byKey, e.key, "attempts", attempts);
    bump(out.byGroup, group, "granted", d.granted);
    bump(out.byGroup, group, "attempts", attempts);
    if (group === "verify") {
      const b = Math.min(7, Math.floor((e.t - start) / (3 * H)));
      out.verifyBuckets[b]++;
      out.verifyCallsBuckets[b] += attempts;
    }
    if (group === "allocated") bump(out.byKey, e.key, (e.t - start) / H < 12 ? "firstPassAttempts" : "secondPassAttempts", attempts);
    const after = remaining();
    if (after < out.minRemaining.value) out.minRemaining = { value: after, at: ((e.t - start) / H).toFixed(1) + "h" };
  }
  if (settle) flush(Infinity);
  const openGranted = Object.values(ledger.open).reduce((t, l) => t + l.granted, 0);
  out.totals = { attempts: spent.settled + spent.open, grantedOutstandingAtEnd: openGranted, providerRemainingEnd: remaining() };
  return out;
}

const report = { assumptions: "see header", windows: [] };
const loaded = [];
for (const w of windows) loaded.push([w, await load(w)]);
// medians across ALL replayed windows (a consumer skipped in one window still has a demand)
const allRan = loaded.flatMap(([, d]) => d.rows).filter((r) => r.status !== "skipped");
const medians = { calls: {}, duration: {} };
for (const k of new Set(allRan.map(keyOf))) {
  const rs = allRan.filter((r) => keyOf(r) === k);
  medians.calls[k] = median(rs.map((r) => r.browse_calls ?? 0));
  medians.duration[k] = median(rs.map((r) => Date.parse(r.completed_at) - Date.parse(r.started_at)).filter(Number.isFinite));
}
for (const [w, data] of loaded) {
  const ran = data.rows.filter((r) => r.status !== "skipped");
  const actual = { byGroup: {}, verifyRuns: Array(8).fill(0) };
  for (const r of ran) {
    const g = keyOf(r).split(":")[0];
    actual.byGroup[g] = (actual.byGroup[g] ?? 0) + (r.browse_calls ?? 0);
    if (g === "verify") actual.verifyRuns[Math.min(7, Math.floor((Date.parse(r.started_at) - data.start) / (3 * H)))]++;
  }
  report.windows.push({
    window: w,
    invocations: data.rows.length,
    actual,
    expected: simulate(data, { name: "expected" }, medians),
    conservative: simulate(data, { name: "conservative", durationScale: 3, drift: { atHour: 6, calls: 200 } }, medians),
    chargedInFull: simulate(data, { name: "charged-in-full", chargeInFull: true, drift: { atHour: 6, calls: 200 } }, medians),
    noSettle: simulate(data, { name: "no-settle", settle: false }, medians),
  });
}
process.stdout.write(JSON.stringify(report, null, 1));
