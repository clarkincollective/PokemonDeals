#!/usr/bin/env node
// PRESERVATION - capture PokemonPriceTracker's printings export RAW (2026-09-26).
//
//   node scripts/preservation/captureExport.mjs --out=<backup dir>
//
// Why: /api/sync-card-catalog downloads this export nightly, parses it in
// memory and persists ONE figure per card - the rest of the response (four
// more condition tiers and every non-chosen printing, per card) is
// discarded every night and has never been written to disk. This script
// saves the bytes themselves, before any parsing, so a downgrade cannot
// take with it data we have already been served.
//
// Cost and coordination: the export is ZERO API credits and capped at 2
// downloads per UTC day (lib/pokemonPriceTracker.js:577). The 02:00 cron
// takes one; this takes the other. It must therefore run at most once per
// day, after the cron, and never be scheduled.
//
// Order of operations is the point:
//   1. fetch  -> 2. write raw .csv.gz to disk  -> 3. sha256 + size recorded
//   -> 4. only then gunzip + parse  -> 5. stage NDJSON (one row per
//   card x printing, full ladder, provider columns verbatim)  -> 6. manifest.
// A parse failure after step 3 still leaves the raw bytes preserved.
//
// Telemetry: recorded through the same lib/pptTelemetry path as the site's
// own requests, tagged consumer "script:preservation-export". Retrieval
// time is recorded as retrieved_at; the provider's own Date header is kept
// separately. Nothing here writes to the database.
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { parse as parseCsv } from "csv-parse/sync";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const { recordPptAttempt, withPptConsumer } = require("../../lib/pptTelemetry.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const OUT = args.out;
if (!OUT) {
  console.error("  --out=<backup dir> is required");
  process.exit(2);
}
const key = process.env.POKEMONPRICETRACKER_API_KEY;
if (!key) {
  console.error("  Missing POKEMONPRICETRACKER_API_KEY");
  process.exit(2);
}

const BASE_URL = "https://www.pokemonpricetracker.com/api/v2";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const RATE = ["x-ratelimit-daily-limit", "x-ratelimit-daily-remaining", "x-ratelimit-daily-reset", "x-ratelimit-minute-limit", "x-ratelimit-minute-remaining", "x-ratelimit-purchased-remaining", "x-ratelimit-total-remaining", "x-api-calls-consumed"];
const rateOf = (res) => Object.fromEntries(RATE.map((h) => [h, res.headers.get(h)]).filter(([, v]) => v != null));

await withPptConsumer("script:preservation-export", async () => {
  mkdirSync(OUT, { recursive: true });
  const url = new URL(`${BASE_URL}/export`);
  url.searchParams.set("type", "printings");

  const retrievedAt = new Date().toISOString();
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  } catch (e) {
    await recordPptAttempt({ url, op: "downloadPrintingsExport", error: e });
    throw e;
  }
  if (!res.ok) {
    const text = await res.text();
    await recordPptAttempt({ url, op: "downloadPrintingsExport", res, bodyText: text });
    // Do NOT retry: a 429 here means today's 2-download cap is spent.
    console.error(`  export refused: HTTP ${res.status} ${text.slice(0, 200)}`);
    writeFileSync(join(OUT, "printings-export.REFUSED.json"), JSON.stringify({ retrievedAt, status: res.status, body: text.slice(0, 2000), rate: rateOf(res) }, null, 2));
    process.exit(1);
  }
  await recordPptAttempt({ url, op: "downloadPrintingsExport", res });
  const rate = rateOf(res);
  const providerDate = res.headers.get("date");

  // 2-3. raw bytes to disk FIRST, then hash them from disk.
  const raw = Buffer.from(await res.arrayBuffer());
  const rawPath = join(OUT, "printings-export.csv.gz");
  writeFileSync(rawPath, raw);
  const rawDigest = sha256(readFileSync(rawPath));
  console.log(`  raw saved     ${rawPath}  ${(raw.length / 1048576).toFixed(2)} MB  sha256 ${rawDigest.slice(0, 12)}…`);

  // 4-5. parse and stage. Provider columns are kept VERBATIM (no renaming,
  // no coercion) so nothing about identity, printing, language or a price
  // is reinterpreted at this stage; retrieval time is added as its own
  // field, never confused with any provider date.
  let records;
  try {
    const csv = gunzipSync(raw).toString("utf-8");
    records = parseCsv(csv, { columns: true, skip_empty_lines: true });
  } catch (e) {
    console.error(`  parse failed AFTER raw was saved: ${e.message}`);
    writeFileSync(join(OUT, "printings-export.manifest.json"), JSON.stringify({ retrievedAt, providerDate, raw: { file: "printings-export.csv.gz", bytes: raw.length, sha256: rawDigest }, parse: { ok: false, error: e.message }, rate }, null, 2));
    process.exit(1);
  }
  const columns = records.length ? Object.keys(records[0]) : [];
  const stagedPath = join(OUT, "printings-export.staged.ndjson.gz");
  let n = 0;
  const ids = new Set();
  const langs = {};
  const printings = {};
  await pipeline(
    Readable.from(
      (function* () {
        for (const r of records) {
          n++;
          if (r.tcgPlayerId) ids.add(String(r.tcgPlayerId));
          langs[r.language || "?"] = (langs[r.language || "?"] ?? 0) + 1;
          printings[r.printing || "?"] = (printings[r.printing || "?"] ?? 0) + 1;
          yield JSON.stringify({ retrieved_at: retrievedAt, ...r }) + "\n";
        }
      })()
    ),
    createGzip({ level: 9 }),
    createWriteStream(stagedPath)
  );
  const stagedDigest = sha256(readFileSync(stagedPath));

  const manifest = {
    generatedBy: "scripts/preservation/captureExport.mjs",
    retrievedAt,
    providerDate,
    endpoint: "/api/v2/export?type=printings",
    creditsCharged: 0,
    raw: { file: "printings-export.csv.gz", bytes: raw.length, sha256: rawDigest },
    staged: { file: "printings-export.staged.ndjson.gz", rows: n, bytes: statSync(stagedPath).size, sha256: stagedDigest, columns },
    distinctTcgPlayerIds: ids.size,
    rowsByLanguage: langs,
    rowsByPrinting: printings,
    providerRateHeaders: rate,
  };
  writeFileSync(join(OUT, "printings-export.manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`  staged        ${stagedPath}  rows ${n.toLocaleString("en-US")}  distinct ids ${ids.size.toLocaleString("en-US")}`);
  console.log(`  columns       ${columns.join(", ")}`);
  console.log(`  languages     ${JSON.stringify(langs)}`);
  console.log(`  provider rate ${JSON.stringify(rate)}`);
  console.log(`  manifest      ${join(OUT, "printings-export.manifest.json")}`);
});
