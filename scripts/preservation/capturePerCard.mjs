#!/usr/bin/env node
// PRESERVATION - per-card raw capture from PokemonPriceTracker (2026-09-26).
//
//   node scripts/preservation/capturePerCard.mjs --out=<backup dir> [--limit=N] [--concurrency=3] [--min-daily-remaining=60000]
//
// WHAT: for every watchlist card (English and Japanese), one request of the
// SAME family the site already issues for its own pages
// (/cards?tcgPlayerId=..&includeEbay=true&includeHistory=true&days=730) -
// and the ENTIRE response body is written to disk, verbatim, before any
// field is read. This is the data the site fetches live and never stores:
// the eBay sold-comp and graded-sales buckets, the 730-day raw history and
// the per-printing variant prices. Once the subscription steps down these
// are the fields that stop being reachable, and nothing in our database
// reconstructs them.
//
// SCOPE is the watchlist - the products the site actually tracks and prices
// every day - not the provider's whole catalogue. That is deliberate.
//
// COST CONTROL, all enforced, none assumed:
//   - credits per request are read from the provider's own
//     x-api-calls-consumed header on every response; a request costing more
//     than --max-credits-per-card (default 4) stops the run
//   - the provider's x-ratelimit-daily-remaining is read on every response;
//     the run stops once it falls to --min-daily-remaining (default 60,000),
//     leaving the scheduled consumers (~8k/day) far more than they need
//   - a per-minute 429 is waited out ONCE using the provider's retryAfter,
//     as lib/pokemonPriceTracker.fetchPPTPaced does; a daily 429, a 401 or a
//     403 stops the run immediately - no loop, no second key, no bypass
//   - bounded concurrency (default 3) and a floor of ~200 req/min, under the
//     500/min shared with the site's crons and page renders
//
// RESUMABLE: ids already captured are listed in <out>/percard.done.json and
// skipped; raw responses append to a checkpointed NDJSON.gz part file per
// run. Re-running never re-fetches a captured id.
//
// TIME: each line carries retrieved_at (ours) separately from every
// provider date inside the body. Nothing here writes to the database.
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, readdirSync } from "node:fs";
import { createGzip } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const { recordPptAttempt, withPptConsumer } = require("../../lib/pptTelemetry.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const OUT = args.out;
if (!OUT) {
  console.error("  --out=<backup dir> is required");
  process.exit(2);
}
const LIMIT = args.limit ? Number(args.limit) : null;
const CONCURRENCY = Number(args.concurrency ?? 3);
const MIN_DAILY_REMAINING = Number(args["min-daily-remaining"] ?? 60000);
const MAX_CREDITS_PER_CARD = Number(args["max-credits-per-card"] ?? 4);
const MIN_INTERVAL_MS = 300; // per worker -> ~200/min total at concurrency 3
const key = process.env.POKEMONPRICETRACKER_API_KEY;
if (!key) {
  console.error("  Missing POKEMONPRICETRACKER_API_KEY");
  process.exit(2);
}
const BASE_URL = "https://www.pokemonpricetracker.com/api/v2";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

mkdirSync(OUT, { recursive: true });
const DONE_PATH = join(OUT, "percard.done.json");
const done = new Set(existsSync(DONE_PATH) ? JSON.parse(readFileSync(DONE_PATH, "utf8")).ids : []);
const saveDone = () => writeFileSync(DONE_PATH, JSON.stringify({ ids: [...done], updatedAt: new Date().toISOString() }));

// cohort: every watchlist row with a provider id, both languages
async function cohort() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("watchlist").select("justtcg_tcgplayer_id, language, name, set").not("justtcg_tcgplayer_id", "is", null).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = `${r.justtcg_tcgplayer_id}|${r.language || "english"}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: String(r.justtcg_tcgplayer_id), language: r.language || "english" });
  }
  return out;
}

const partNo = readdirSync(OUT).filter((f) => /^percard\.part\d+\.ndjson\.gz$/.test(f)).length + 1;
const partPath = join(OUT, `percard.part${partNo}.ndjson.gz`);
const gz = createGzip({ level: 6 });
const sink = createWriteStream(partPath);
gz.pipe(sink);
const writeLine = (obj) => new Promise((res) => (gz.write(JSON.stringify(obj) + "\n") ? res() : gz.once("drain", res)));

const stats = { attempted: 0, saved: 0, minute429: 0, stopped: null, creditsObserved: 0, lastDailyRemaining: null, failures: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stop = false;

async function one(card) {
  const u = new URL(`${BASE_URL}/cards`);
  u.searchParams.set("tcgPlayerId", card.id);
  u.searchParams.set("language", card.language);
  u.searchParams.set("includeEbay", "true");
  u.searchParams.set("includeHistory", "true");
  u.searchParams.set("days", "730");
  for (let attempt = 0; attempt < 2; attempt++) {
    const retrievedAt = new Date().toISOString();
    let res;
    try {
      res = await fetch(u, { headers: { Authorization: `Bearer ${key}` } });
    } catch (e) {
      await recordPptAttempt({ url: u, op: "preservationPerCard", error: e, attempt });
      stats.failures.push({ id: card.id, language: card.language, error: e.message });
      return;
    }
    const consumed = Number(res.headers.get("x-api-calls-consumed") ?? NaN);
    const dailyRemaining = Number(res.headers.get("x-ratelimit-daily-remaining") ?? NaN);
    if (Number.isFinite(dailyRemaining)) stats.lastDailyRemaining = dailyRemaining;
    const text = await res.text();
    if (res.ok) {
      await recordPptAttempt({ url: u, op: "preservationPerCard", res, attempt });
      if (Number.isFinite(consumed)) stats.creditsObserved += consumed;
      // RAW FIRST. The body is stored as text exactly as received.
      await writeLine({ tcgPlayerId: card.id, language: card.language, retrieved_at: retrievedAt, status: 200, credits: Number.isFinite(consumed) ? consumed : null, body: text });
      done.add(`${card.id}|${card.language}`);
      stats.saved++;
      if (Number.isFinite(consumed) && consumed > MAX_CREDITS_PER_CARD) {
        stats.stopped = `credits per card ${consumed} > ${MAX_CREDITS_PER_CARD}`;
        stop = true;
      }
      if (Number.isFinite(dailyRemaining) && dailyRemaining <= MIN_DAILY_REMAINING) {
        stats.stopped = `daily remaining ${dailyRemaining} reached floor ${MIN_DAILY_REMAINING}`;
        stop = true;
      }
      return;
    }
    await recordPptAttempt({ url: u, op: "preservationPerCard", res, attempt, bodyText: text });
    if (res.status === 401 || res.status === 403) {
      stats.stopped = `access denied HTTP ${res.status}`;
      stop = true;
      return;
    }
    if (res.status === 429) {
      const perMinute = /per.?minute|minute (?:rate )?limit|"limitType"\s*:\s*"per_minute"/i.test(text);
      if (perMinute && attempt === 0) {
        stats.minute429++;
        const m = text.match(/"retryAfter":\s*(\d+)/);
        await sleep(Math.min(((m ? Number(m[1]) : 10) + 2) * 1000, 65000));
        continue; // one retry only
      }
      stats.stopped = perMinute ? "per-minute 429 twice" : `daily/other 429: ${text.slice(0, 120)}`;
      stop = true;
      return;
    }
    // 404 / 5xx / anything else: record and move on; the raw is NOT written
    // (a failed response must never masquerade as data) but the failure is.
    stats.failures.push({ id: card.id, language: card.language, status: res.status, body: text.slice(0, 200) });
    return;
  }
}

await withPptConsumer("script:preservation-percard", async () => {
  const all = await cohort();
  const todo = all.filter((c) => !done.has(`${c.id}|${c.language}`));
  const batch = LIMIT ? todo.slice(0, LIMIT) : todo;
  console.log(`  cohort ${all.length} (done ${done.size}, todo ${todo.length}, this run ${batch.length})  concurrency ${CONCURRENCY}  floor daily-remaining ${MIN_DAILY_REMAINING}`);
  console.log(`  part file ${partPath}`);
  const queue = [...batch];
  const started = Date.now();
  const worker = async () => {
    while (queue.length && !stop) {
      const t0 = Date.now();
      const card = queue.shift();
      stats.attempted++;
      await one(card);
      if (stats.attempted % 100 === 0) {
        saveDone();
        const mins = (Date.now() - started) / 60000;
        console.log(`    ${stats.attempted}/${batch.length} saved ${stats.saved} minute429 ${stats.minute429} credits ${stats.creditsObserved} dailyRemaining ${stats.lastDailyRemaining} (${(stats.attempted / mins).toFixed(0)}/min)`);
      }
      const dt = Date.now() - t0;
      if (dt < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - dt);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await new Promise((res) => gz.end(res));
  await new Promise((res) => sink.on("finish", res));
  saveDone();
  const summary = { ...stats, partFile: partPath, cohort: all.length, doneTotal: done.size, finishedAt: new Date().toISOString(), durationS: Math.round((Date.now() - started) / 1000) };
  writeFileSync(join(OUT, `percard.part${partNo}.summary.json`), JSON.stringify(summary, null, 2));
  console.log(`\n  attempted ${stats.attempted}  saved ${stats.saved}  failures ${stats.failures.length}  minute429 ${stats.minute429}`);
  console.log(`  credits observed (provider header) ${stats.creditsObserved}  daily remaining now ${stats.lastDailyRemaining}`);
  console.log(`  stopped: ${stats.stopped ?? "no - queue exhausted"}`);
  console.log(`  done ids total ${done.size} / ${all.length}`);
});
