// ppt-telemetry-r1 - READ-ONLY daily PokemonPriceTracker request report.
//
//   node scripts/pptRequestReport.mjs                 # yesterday and today (UTC)
//   node scripts/pptRequestReport.mjs 2026-09-16      # one UTC day
//   node scripts/pptRequestReport.mjs 2026-09-16 --json
//
// Sums the insert-only catalog_snapshot rows written by lib/pptTelemetry for
// the day (kind "ppt_requests:<day>:..."). These are outbound REQUEST
// ATTEMPTS by consumer / endpoint / lib function and outcome - not credits
// or spending. Makes no PokemonPriceTracker request and writes nothing.
//
// Day boundary: a job run's row carries the day its run FINISHED, so
// attempts of a run spanning UTC midnight are counted on the later day.
// Requests from scripts that bypass lib/pokemonPriceTracker
// (scripts/ppt-history-backfill.mjs, scripts/auditMissingIds.js) are not
// in these rows.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
for (const line of readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const { aggregatePptRows, KIND_PREFIX } = require(join(REPO, "lib", "pptTelemetry.js"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dayArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const days = dayArg ? [dayArg] : [yesterday, today];

const out = {};
for (const day of days) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("catalog_snapshot").select("kind, data").like("kind", `${KIND_PREFIX}${day}:%`).order("kind").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const lines = aggregatePptRows(rows);
  const total = lines.reduce((t, l) => ({ attempts: t.attempts + l.attempts, ok: t.ok + l.ok, r429: t.r429 + l.r429, failed: t.failed + l.failed, network_error: t.network_error + l.network_error, retries: t.retries + l.retries }), { attempts: 0, ok: 0, r429: 0, failed: 0, network_error: 0, retries: 0 });
  out[day] = { rows: rows.length, total, byConsumerEndpointOp: lines, partialDay: day === today };
}

const LIMITATIONS = [
  "Totals are RECORDED attempts through lib/pokemonPriceTracker - not credits, cost or billing headroom.",
  "Excluded: scripts/ppt-history-backfill.mjs and scripts/auditMissingIds.js (direct fetch, bypass the shared client).",
  "Can under-count: a process that dies before its job-run row or after-response write persists, or a write that fails / exceeds 1.5 s, leaves no record.",
  "A job run spanning UTC midnight is assigned to the day it finished.",
  "Missing or zero telemetry does not prove that no provider requests occurred (including during builds).",
];

if (asJson) {
  console.log(JSON.stringify({ measure: "recorded PokemonPriceTracker request attempts", limitations: LIMITATIONS, days: out }, null, 1));
} else {
  console.log("Recorded PokemonPriceTracker request attempts (not credits or spending)");
  for (const l of LIMITATIONS) console.log(`  - ${l}`);
  for (const [day, r] of Object.entries(out)) {
    console.log(`\n${day}${r.partialDay ? " (partial, in progress)" : ""} - ${r.rows} rows - recorded attempts ${r.total.attempts} (ok ${r.total.ok}, 429 ${r.total.r429}, failed ${r.total.failed}, network ${r.total.network_error}, retries ${r.total.retries})`);
    for (const l of r.byConsumerEndpointOp) {
      console.log(`  ${String(l.attempts).padStart(6)}  ${l.consumer.padEnd(28)} ${l.endpoint.padEnd(20)} ${l.op.padEnd(26)} ok ${l.ok} 429 ${l.r429} failed ${l.failed} net ${l.network_error} retries ${l.retries}`);
    }
  }
}
