// Read-only reconciliation of one Browse budget window across BOTH ledgers.
//
// SELECT-only: no writes, no provider call, no forced scan, no probe. It
// changes no budget, retry, enforcement, schedule or provider setting.
//
// WHY BOTH LEDGERS, COUNTED ONCE. Two ledger rows track the same window:
//   browse_budget:<reset>          - ENFORCE, keys the sealed lane
//   browse_budget_observe:<reset>  - OBSERVE, keys every other job
// Their `used` maps are DISJOINT, so real consumption is the sum of the two.
//
// The trap: each ledger compares eBay's GLOBAL remaining-quota reading
// against its OWN `used` total, so the sibling's real work shows up as
// "unexplained" drift and lands in `reserveAbsorbed`. On 2026-09-25 the
// observe ledger's reserveAbsorbed was 196 - exactly the sealed job's
// browse_calls - and the enforce ledger's was 10, being part of the 12 calls
// the observe side had booked. Those figures are the SAME consumption seen
// from the other side of the fence. Adding reserveAbsorbed to usage would
// count shared provider usage twice, so this script reports it separately
// and never in the total.
//
// Usage: node scripts/integrity/auditBudgetWindow.mjs [resetIso]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Windows reset at 07:00 UTC. The row key is the reset at the window's END.
function currentReset(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0, 0));
  if (now.getTime() >= d.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

const DAILY_LIMIT = Number(process.env.BROWSE_DAILY_LIMIT ?? 5000);
const RESERVE = Number(process.env.BROWSE_RESERVE ?? 420);

const reset = process.argv[2] ?? currentReset();
const windowEnd = new Date(reset);
const windowStart = new Date(windowEnd.getTime() - 24 * 3600 * 1000);
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
const pad = (s, n) => String(s).padEnd(n);

const ledger = async (kind) => {
  const { data } = await db.from("catalog_snapshot").select("data,updated_at").eq("kind", kind).maybeSingle();
  return data ? { ...data.data, _updatedAt: data.updated_at } : null;
};

const enforce = await ledger(`browse_budget:${reset}`);
const observe = await ledger(`browse_budget_observe:${reset}`);

const { data: runs } = await db
  .from("ebay_job_runs")
  .select("*")
  .gte("created_at", windowStart.toISOString())
  .lt("created_at", windowEnd.toISOString())
  .order("created_at");

const now = new Date();
const complete = now >= windowEnd;

console.log(`\nBrowse budget window  ${windowStart.toISOString()} -> ${windowEnd.toISOString()}`);
console.log(`Window is ${complete ? "COMPLETE" : `INCOMPLETE (${((windowEnd - now) / 3600000).toFixed(1)}h remaining)`}`);
console.log(`Read at ${now.toISOString()} (${now.toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })} Brisbane)\n`);

// --- measured external attempts, from telemetry -------------------------
const byJob = new Map();
for (const r of runs ?? []) {
  const k = r.job ?? "(unknown)";
  const a = byJob.get(k) ?? { runs: 0, skipped: 0, calls: 0, ok: 0, fail: 0, retryable: 0, graded: 0 };
  a.runs++;
  if (r.status === "skipped") a.skipped++;
  a.calls += r.browse_calls ?? 0;
  a.ok += r.browse_ok ?? 0;
  a.fail += (r.browse_401 ?? 0) + (r.browse_403 ?? 0) + (r.browse_429 ?? 0) + (r.browse_4xx ?? 0) + (r.browse_5xx ?? 0) + (r.browse_other_status ?? 0);
  // Retry is gated SOLELY on these two (lib/ebay.js fetchWithRetry): a 429
  // and every 4xx are never retried. Both zero => zero actual retries.
  a.retryable += (r.browse_5xx ?? 0) + (r.browse_transport_failures ?? 0);
  a.graded += r.graded_detail_calls ?? 0;
  byJob.set(k, a);
};

console.log("MEASURED EXTERNAL ATTEMPTS (ebay_job_runs)");
console.log(`  ${pad("job", 24)}${pad("runs", 6)}${pad("skip", 6)}${pad("calls", 7)}${pad("ok", 7)}${pad("failed", 8)}${pad("graded", 7)}`);
let totals = { runs: 0, skipped: 0, calls: 0, ok: 0, fail: 0, retryable: 0, graded: 0 };
for (const [job, a] of [...byJob].sort((x, y) => y[1].calls - x[1].calls)) {
  console.log(`  ${pad(job, 24)}${pad(a.runs, 6)}${pad(a.skipped, 6)}${pad(a.calls, 7)}${pad(a.ok, 7)}${pad(a.fail, 8)}${pad(a.graded, 7)}`);
  for (const k of Object.keys(totals)) totals[k] += a[k];
}
console.log(`  ${pad("TOTAL", 24)}${pad(totals.runs, 6)}${pad(totals.skipped, 6)}${pad(totals.calls, 7)}${pad(totals.ok, 7)}${pad(totals.fail, 8)}${pad(totals.graded, 7)}`);
console.log(`  actual retries: ${totals.retryable === 0 ? "0 (both gating counters are zero - exact, not inferred)" : `unknown; upper bound ${totals.retryable} (5xx + transport failures)`}`);

// --- ledgers, shared usage counted ONCE ---------------------------------
const eUsed = sum(enforce?.used);
const oUsed = sum(observe?.used);
const keyOverlap = Object.keys(enforce?.used ?? {}).filter((k) => k in (observe?.used ?? {}));

console.log("\nLEDGER USAGE (each key counted once)");
console.log(`  enforce  browse_budget:${reset}`);
console.log(`           used ${eUsed}  keys ${JSON.stringify(enforce?.used ?? {})}`);
console.log(`  observe  browse_budget_observe:${reset}`);
console.log(`           used ${oUsed}  keys ${Object.keys(observe?.used ?? {}).length} key(s)`);
console.log(`  key overlap between ledgers: ${keyOverlap.length === 0 ? "none - the maps are disjoint, so the sum is safe" : `** ${JSON.stringify(keyOverlap)} - DO NOT sum blindly **`}`);
console.log(`  COMBINED LEDGER USED: ${eUsed + oUsed}`);
console.log(`  telemetry browse_calls: ${totals.calls}`);
const gap = totals.calls - (eUsed + oUsed);
console.log(`  ledger vs telemetry: ${gap === 0 ? "MATCH" : `${gap > 0 ? "+" : ""}${gap} unreconciled`}`);

console.log("\nRESERVATIONS / SETTLEMENTS / EXPIRIES");
for (const [name, l] of [["enforce", enforce], ["observe", observe]]) {
  if (!l) { console.log(`  ${pad(name, 9)} (no row)`); continue; }
  const open = Object.keys(l.open ?? {}).length;
  console.log(`  ${pad(name, 9)} ${JSON.stringify(l.counters ?? {})}`);
  console.log(`  ${pad("", 9)} open now ${open}${open ? ` -> ${JSON.stringify(Object.values(l.open).map((v) => ({ key: v.key, granted: v.granted, expiresAt: v.expiresAt })))}` : ""}`);
  console.log(`  ${pad("", 9)} expired charged in full: ${l.counters?.expired ?? 0}`);
}

console.log("\nDRIFT - REPORTED, NOT ADDED TO USAGE");
for (const [name, l] of [["enforce", enforce], ["observe", observe]]) {
  if (!l) continue;
  console.log(`  ${pad(name, 9)} reserveAbsorbed ${l.reserveAbsorbed ?? 0}  lastDrift ${JSON.stringify(l.lastDrift ?? null)}`);
}
console.log("  Each ledger's reserveAbsorbed is largely the SIBLING ledger's real");
console.log("  work, already counted in COMBINED LEDGER USED above. It is a");
console.log("  bookkeeping artefact of two ledgers over one provider counter, not");
console.log("  extra consumption, and is deliberately excluded from the total.");

// --- remaining capacity -------------------------------------------------
const used = eUsed + oUsed;
console.log("\nREMAINING CAPACITY");
console.log(`  daily limit ${DAILY_LIMIT}   reserve ${RESERVE}   grantable ${DAILY_LIMIT - RESERVE}`);
console.log(`  used ${used}  ->  ${DAILY_LIMIT - used} left to the limit, ${DAILY_LIMIT - RESERVE - used} left of grantable`);
const lastQuota = [...(runs ?? [])].reverse().find((r) => r.quota_remaining_end != null || r.quota_remaining_start != null);
if (lastQuota) {
  const q = lastQuota.quota_remaining_end ?? lastQuota.quota_remaining_start;
  console.log(`  provider's own last reading: ${q} remaining, at ${lastQuota.created_at} (${lastQuota.job})`);
  console.log(`  our figure implies ${DAILY_LIMIT - used} - provider readings lag, so treat a small difference as lag, not loss`);
}
if (!complete) console.log("\n  NOTE: the window is still open; these are running figures, not a settled reconciliation.");
console.log("");
