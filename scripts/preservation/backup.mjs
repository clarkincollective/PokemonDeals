#!/usr/bin/env node
// PRICING-DATA BACKUP (2026-09-22). READ-ONLY on the database. Makes NO
// provider request of any kind.
//
//   node scripts/preservation/backup.mjs            # dry run: plan only
//   node scripts/preservation/backup.mjs --write    # write the backup
//   node scripts/preservation/backup.mjs --write --resume=<dir>
//   node scripts/preservation/backup.mjs --verify=<dir>
//
// WHY THIS EXISTS: to preserve what we have ALREADY retrieved, so the
// PokemonPriceTracker subscription can later be paused without losing the
// catalogue, the references or - most importantly - the 20 months of
// price history, which is the one thing no future sync could rebuild.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not call the provider, widen
// any sync, or fetch a single row we do not already hold. The provider's
// terms (read 2026-09-22) permit retaining data "retrieved while holding
// an active subscription" indefinitely, but explicitly exclude "a bulk
// retrieval of the catalogue undertaken in anticipation of cancellation".
// Reading our OWN database is squarely on the permitted side of that
// line, and this script cannot cross it - it has no provider client.
//
// Output: one gzipped NDJSON file per table plus a manifest with row
// counts, column lists and SHA-256 digests. NDJSON because it streams,
// so a 1.8M-row table never has to fit in memory, and because it restores
// line by line without a bespoke parser.
//
// Storage: .local/backups/<cutoff>/ - git-ignored, not served by the
// website, not in any public bucket. No credential is read into the
// output, printed, or written to the manifest.
import { existsSync, mkdirSync, createWriteStream, createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { createGzip, createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const WRITE = "write" in args;
const VERIFY_DIR = args.verify;
// Resume into an existing directory: any table whose file is already there
// and non-empty is adopted as-is (digested and line-counted from disk)
// instead of being re-streamed. price_history alone is ~18 minutes of
// paging; losing that to a failure on an unrelated table at the end of the
// run is exactly what happened on the first attempt.
const RESUME_DIR = args.resume;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Every table that carries pricing, identity, history or the derived data
// built from them. Ordered by how irreplaceable it is.
//
//   orderBy must be a STABLE, UNIQUE key, given as an array when one
//   column is not unique on its own. Paging here is offset-based
//   (PostgREST .range), and offset paging over a non-unique sort can
//   silently skip or duplicate rows between pages - a corruption that
//   would pass every digest check, because the file would be a perfect
//   copy of the wrong thing.
const TABLES = [
  { name: "price_history", orderBy: ["id"], why: "20 months of observations - a pause can never rebuild this" },
  { name: "card_catalog", orderBy: ["tcgplayer_id"], why: "identities, numbers, images, references by condition and printing" },
  { name: "sealed_catalog", orderBy: ["tcgplayer_id"], why: "sealed-product references" },
  { name: "watchlist", orderBy: ["id"], why: "which cards we track, and the identity we match against" },
  { name: "sealed_watchlist", orderBy: ["id"], why: "sealed tracking list" },
  { name: "deals", orderBy: ["id"], why: "listing observations incl. graded grader/grade references" },
  { name: "sealed_deals", orderBy: ["id"], why: "sealed listing observations" },
  { name: "integrity_snapshots", orderBy: ["day"], why: "our own first-party integrity series" },
  // Second tier, added 22 Sep after grepping every .from() in the
  // codebase rather than trusting the first list. Each of these is
  // pricing-derived or is the record of how the pricing data was
  // obtained, and none of it is reconstructible from the tables above.
  {
    name: "catalog_snapshot",
    orderBy: ["kind"],
    why: "derived aggregates (cardHubs, catalogSets, setVocabulary) the pages render from, the browse-budget ledger, and the ppt_requests telemetry that is the only record of what we retrieved and when - and which has a retention sweep that deletes it",
  },
  { name: "listing_observations", orderBy: ["id"], why: "per-observation pricing history WITH reference provenance - the audit trail behind every stored comparison" },
  { name: "discovery_events", orderBy: ["id"], why: "how each listing was found, and whether it became a deal" },
  { name: "scan_target_state", orderBy: ["card_tcgplayer_id", "marketplace"], why: "per-target scanner state; composite key because neither column is unique alone" },
  { name: "ebay_job_runs", orderBy: ["id"], why: "quota and call-volume history - the baseline any pause decision is measured against" },
  { name: "scan_allocation_runs", orderBy: ["id"], why: "allocator decisions per run" },
];

// DELIBERATELY EXCLUDED, and why - an omission nobody wrote down is
// indistinguishable from an oversight:
//   newsletter_subscribers, price_alerts   personal data (email addresses).
//     Not pricing data, not needed to survive a provider pause, and
//     copying subscriber emails onto a laptop is a privacy cost with no
//     preservation benefit. If they are ever to be backed up that is a
//     separate decision with its own handling rules.
//   social_*                               publishing records, unrelated
//     to pricing and regenerable.
//   cards                                  1 row, legacy.

const PAGE = 1000; // PostgREST hard-caps a response at 1000 rows

async function rowCount(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

// Streams every row of one table as NDJSON, paging by a stable key.
async function* rows(table, orderBy) {
  const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select("*");
    for (const k of keys) q = q.order(k, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} @${from}: ${error.message}`);
    if (!data || data.length === 0) return;
    for (const r of data) yield JSON.stringify(r) + "\n";
    if (data.length < PAGE) return;
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// Reads one .ndjson.gz back a LINE AT A TIME.
//
// The obvious implementation - gunzip the whole file and split it - works
// on thirteen of the fourteen tables and throws on the fourteenth:
// price_history decompresses to well past V8's ~512 MB string cap
// ("Cannot create a string longer than 0x1fffffe8 characters"). That is
// precisely the table the entire backup exists for, so a verifier that
// cannot read it is not a verifier. Streaming costs nothing here and has
// no size ceiling.
//
// `onRow` receives each parsed object; a corrupt line throws out of
// JSON.parse, which is the intended behaviour - that is the check.
async function readNdjsonGz(path, onRow) {
  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let n = 0;
  let firstKeys = null;
  for await (const line of rl) {
    if (!line) continue;
    const obj = JSON.parse(line);
    if (!firstKeys) firstKeys = Object.keys(obj);
    n++;
    if (onRow) onRow(obj, n);
  }
  return { rows: n, columns: firstKeys ?? [] };
}

// ---------------------------------------------------------------- verify
if (VERIFY_DIR) {
  const manifestPath = join(VERIFY_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`  x no manifest at ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log(`Verifying backup ${manifest.cutoff}\n`);
  let bad = 0;
  for (const t of manifest.tables) {
    const file = join(VERIFY_DIR, t.file);
    if (!existsSync(file)) {
      console.log(`  x ${t.name}: FILE MISSING`);
      bad++;
      continue;
    }
    const digest = sha256File(file);
    let parsed = 0;
    let cols = "";
    let readError = null;
    try {
      // Every line is re-parsed, not just counted - a file can be the
      // right length and still hold truncated JSON.
      const r = await readNdjsonGz(file);
      parsed = r.rows;
      cols = r.columns.slice().sort().join(",");
    } catch (e) {
      readError = e.message;
    }
    const okDigest = digest === t.sha256;
    const okRows = !readError && parsed === t.rows;
    const okCols = !readError && cols === t.columns.slice().sort().join(",");
    if (readError || !okDigest || !okRows || !okCols) bad++;
    console.log(
      readError
        ? `  FAIL ${t.name.padEnd(20)} unreadable: ${readError.slice(0, 70)}`
        : `  ${okDigest && okRows && okCols ? "ok  " : "FAIL"} ${t.name.padEnd(20)} rows ${String(parsed).padStart(8)}/${String(t.rows).padStart(8)}  digest ${okDigest ? "match" : "MISMATCH"}  columns ${okCols ? "match" : "MISMATCH"}`
    );
  }
  if (manifest.failed?.length) {
    console.log(`\n  NOTE: the manifest records ${manifest.failed.length} table(s) that never completed:`);
    for (const f of manifest.failed) console.log(`    ${f.name}: ${f.error}`);
    bad += manifest.failed.length;
  }
  console.log(bad ? `\n  ${bad} table(s) FAILED verification` : "\n  all tables verified: digest, row count and column set");
  process.exit(bad ? 1 : 0);
}

// ----------------------------------------------------------------- plan
const cutoff = new Date().toISOString();
const dir = RESUME_DIR ?? join(".local", "backups", cutoff.replace(/[:.]/g, "-"));

console.log("PRICING-DATA BACKUP\n");
console.log(`  cutoff (UTC)      ${cutoff}`);
console.log(`  destination       ${dir}  (git-ignored, not web-served)`);
console.log(`  provider requests 0 - this script has no provider client\n`);

const plan = [];
for (const t of TABLES) {
  try {
    const n = await rowCount(t.name);
    plan.push({ ...t, rows: n });
    console.log(`  ${t.name.padEnd(20)} ${String(n).padStart(9)} rows   ${t.why}`);
  } catch (e) {
    console.log(`  ${t.name.padEnd(20)} SKIPPED - ${e.message.slice(0, 60)}`);
  }
}
const total = plan.reduce((s, t) => s + t.rows, 0);
console.log(`\n  total ${total.toLocaleString("en-US")} rows across ${plan.length} tables`);

if (!WRITE) {
  console.log("\n  (dry run - pass --write to produce the backup)");
  process.exit(0);
}

// ---------------------------------------------------------------- write
mkdirSync(dir, { recursive: true });
const manifest = { cutoff, generatedBy: "scripts/preservation/backup.mjs", providerRequests: 0, tables: [] };

// Reads back a file already on disk so it can be adopted into the
// manifest without re-fetching: same row count and column set the writer
// would have recorded, derived from the bytes themselves.
async function adopt(path) {
  return readNdjsonGz(path);
}

// PER-TABLE FAILURE IS NOT RUN FAILURE. The first run of this script threw
// on the very last table (a sort column that did not exist) and exited
// before writing the manifest - discarding, in effect, eighteen minutes of
// streaming and leaving eight good files that nothing could verify. A
// backup tool whose failure mode is "lose the work that succeeded" is
// worse than no tool, so a bad table is now recorded and stepped over.
const failed = [];

for (const t of plan) {
  const file = `${t.name}.ndjson.gz`;
  const path = join(dir, file);
  let written = 0;
  let columns = [];
  let resumed = false;
  try {
    if (RESUME_DIR && existsSync(path) && statSync(path).size > 0) {
      const a = await adopt(path);
      written = a.rows;
      columns = a.columns;
      resumed = true;
    } else {
      const src = Readable.from(
        (async function* () {
          for await (const line of rows(t.name, t.orderBy)) {
            if (!columns.length) columns = Object.keys(JSON.parse(line));
            written++;
            if (written % 100000 === 0) process.stdout.write(`    ${t.name}: ${written.toLocaleString("en-US")} rows\r`);
            yield line;
          }
        })()
      );
      await pipeline(src, createGzip({ level: 9 }), createWriteStream(path));
    }
  } catch (e) {
    failed.push({ name: t.name, error: e.message });
    console.log(`  FAILED ${t.name.padEnd(19)} ${e.message.slice(0, 80)}`);
    continue;
  }
  const size = statSync(path).size;
  const digest = sha256File(path);
  manifest.tables.push({ name: t.name, file, rows: written, expected: t.rows, columns, bytes: size, sha256: digest, why: t.why, ...(resumed ? { resumed: true } : {}) });
  console.log(
    `  ${resumed ? "kept " : "wrote"} ${t.name.padEnd(20)} ${String(written).padStart(9)} rows  ${(size / 1048576).toFixed(1)} MB  sha256 ${digest.slice(0, 12)}…${
      written !== t.rows ? `  (count moved from ${t.rows} while reading - live table)` : ""
    }`
  );
}

const { writeFileSync } = await import("node:fs");
if (failed.length) manifest.failed = failed;
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n  manifest: ${join(dir, "manifest.json")}`);
console.log(`  verify with: node scripts/preservation/backup.mjs --verify=${dir}`);
if (failed.length) {
  console.log(`\n  ${failed.length} table(s) FAILED and are recorded in the manifest as incomplete:`);
  for (const f of failed) console.log(`    ${f.name}: ${f.error}`);
  process.exit(1);
}
