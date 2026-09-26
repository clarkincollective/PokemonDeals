#!/usr/bin/env node
// PRESERVATION - import the raw Near Mint history already captured on disk
// into price_history, through the SAME rules as scripts/ppt-history-backfill.mjs.
//
//   node scripts/preservation/importCapturedHistory.mjs --in=<backup dir>            # dry run: stage + validate, no writes
//   node scripts/preservation/importCapturedHistory.mjs --in=<backup dir> --write    # merge
//
// NO PROVIDER REQUEST. Reads percard.part*.ndjson.gz written by
// capturePerCard.mjs (each line: one card's verbatim response) and feeds the
// history portion through the backfill's persistence contract:
//
//   - cohort:      English, priced, non-WOTC-dual-printing cards present in
//                  card_catalog - identical to buildCohort() in the backfill;
//                  name / set / card_number come from card_catalog, never
//                  from the response, exactly as the backfill does
//   - series:      data.priceHistory.conditions["Near Mint"].history[]
//   - validation:  lib/priceHistory.isValidHistoryPrice (sentinels rejected),
//                  a real YYYY-MM-DD point date
//   - row shape:   condition "Near Mint", source HISTORY_SOURCES.PPT_BACKFILL,
//                  observed_on = the PROVIDER's point date,
//                  source_observed_at = that same date as an instant.
//                  retrieved_at is deliberately NOT written anywhere: our
//                  download time is never a price observation time.
//   - conflict:    (tcgplayer_id, condition, source, observed_on) with
//                  ignoreDuplicates - an existing row is NEVER overwritten,
//                  only a missing point is added. So populated data cannot
//                  be replaced by this import, and re-runs are no-ops.
//
// Not imported, on purpose (preserved raw only):
//   - Japanese cards: the supported cohort is English and takes identity
//     from card_catalog, which is English-only. Merging Japanese rows would
//     need a different identity source and a language-aware series key.
//   - eBay sold comps / graded buckets / per-printing variants: no table
//     holds them and no supported writer exists.
//
// Backup of affected rows: price_history was streamed in full into the same
// backup directory minutes before this can run (manifest.json), and this
// import only ADDS rows, so every pre-existing row is both preserved and
// untouched.
import { existsSync, readdirSync, createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const { HISTORY_SOURCES, isValidHistoryPrice, isWotcDualPrintingSet } = require("../../lib/priceHistory.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const IN = args.in;
const WRITE = "write" in args;
if (!IN) {
  console.error("  --in=<backup dir> is required");
  process.exit(2);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// --- the supported cohort, exactly as the backfill builds it -------------
async function eligibleCards() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("card_catalog")
      .select("tcgplayer_id, name, set, card_number, market_price")
      .eq("language", "english")
      .not("market_price", "is", null)
      .gt("market_price", 0)
      .order("tcgplayer_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data) {
      if (!isValidHistoryPrice(r.market_price)) continue;
      if (isWotcDualPrintingSet(r.set)) continue;
      out.set(String(r.tcgplayer_id), r);
    }
    if (data.length < 1000) break;
  }
  return out;
}

// fail fast before staging anything if the hybrid columns are absent
const pre = await db.from("price_history").select("source_observed_at, card_number").limit(1);
if (pre.error) {
  console.error(`  price_history is missing the Phase 11B columns (${pre.error.message}); apply supabase/price_history_hybrid_migration.sql first.`);
  process.exit(1);
}

const cards = await eligibleCards();
const parts = readdirSync(IN).filter((f) => /^percard\.part\d+\.ndjson\.gz$/.test(f)).sort();
console.log(`  mode ${WRITE ? "WRITE" : "DRY RUN (stage + validate only)"}  eligible cards ${cards.size}  part files ${parts.length}`);

const stats = { lines: 0, japanese: 0, notEligible: 0, noSeries: 0, cardsStaged: 0, points: 0, rejectedSentinel: 0, rejectedInvalid: 0, rowsStaged: 0, rowsWritten: 0, batches: 0, errors: [] };
const seen = new Set();
let pending = [];
const minDay = { v: "9999-99-99" };
const maxDay = { v: "0000-00-00" };

async function flush() {
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  stats.batches++;
  if (!WRITE) return;
  const { error } = await db.from("price_history").upsert(batch, { onConflict: "tcgplayer_id,condition,source,observed_on", ignoreDuplicates: true });
  if (error) stats.errors.push(error.message);
  else stats.rowsWritten += batch.length;
}

for (const f of parts) {
  const rl = createInterface({ input: createReadStream(join(IN, f)).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    stats.lines++;
    const rec = JSON.parse(line);
    if (rec.language !== "english") {
      stats.japanese++;
      continue;
    }
    const id = String(rec.tcgPlayerId);
    if (seen.has(id)) continue; // a card captured twice (resumed run) is staged once
    seen.add(id);
    const card = cards.get(id);
    if (!card) {
      stats.notEligible++;
      continue;
    }
    let body;
    try {
      body = JSON.parse(rec.body);
    } catch {
      stats.rejectedInvalid++;
      continue;
    }
    const points = body?.data?.priceHistory?.conditions?.["Near Mint"]?.history ?? [];
    if (!points.length) {
      stats.noSeries++;
      continue;
    }
    stats.cardsStaged++;
    for (const p of points) {
      stats.points++;
      if (!isValidHistoryPrice(p?.market)) {
        if (Number.isFinite(Number(p?.market)) && Number(p.market) > 0) stats.rejectedSentinel++;
        else stats.rejectedInvalid++;
        continue;
      }
      const day = String(p.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        stats.rejectedInvalid++;
        continue;
      }
      if (day < minDay.v) minDay.v = day;
      if (day > maxDay.v) maxDay.v = day;
      pending.push({
        tcgplayer_id: id,
        name: card.name,
        set: card.set,
        card_number: card.card_number ?? null,
        language: "english",
        condition: "Near Mint",
        source: HISTORY_SOURCES.PPT_BACKFILL,
        price: Number(p.market),
        observed_on: day,
        source_observed_at: new Date(p.date).toISOString(),
      });
      stats.rowsStaged++;
      if (pending.length >= 500) await flush();
    }
  }
}
await flush();

const summary = { ...stats, pointDateRange: [minDay.v, maxDay.v], finishedAt: new Date().toISOString(), mode: WRITE ? "write" : "dry-run" };
writeFileSync(join(IN, `import-history.${WRITE ? "write" : "dryrun"}.summary.json`), JSON.stringify(summary, null, 2));
console.log(`  lines ${stats.lines}  japanese (raw only) ${stats.japanese}  not in supported cohort ${stats.notEligible}  no NM series ${stats.noSeries}`);
console.log(`  cards staged ${stats.cardsStaged}  points ${stats.points}  rejected sentinel ${stats.rejectedSentinel}  rejected invalid ${stats.rejectedInvalid}`);
console.log(`  rows staged ${stats.rowsStaged}  point dates ${minDay.v} -> ${maxDay.v}`);
console.log(WRITE ? `  rows sent ${stats.rowsWritten} in ${stats.batches} batches (existing rows never overwritten; the DB reports inserted vs skipped only in aggregate)` : `  (dry run - nothing written; add --write to merge)`);
if (stats.errors.length) console.log(`  ERRORS ${stats.errors.length}: ${stats.errors.slice(0, 3).join(" | ")}`);
