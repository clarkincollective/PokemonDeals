#!/usr/bin/env node
// PRICING-DATA BACKUP (2026-09-22). READ-ONLY on the database. Makes NO
// provider request of any kind.
//
//   node scripts/preservation/backup.mjs            # dry run: plan only
//   node scripts/preservation/backup.mjs --write    # write the backup
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
import { existsSync, mkdirSync, createWriteStream, readFileSync, readdirSync, statSync } from "node:fs";
import { createGzip } from "node:zlib";
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

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Every table that carries pricing, identity or history we would want
// after a pause. Ordered by how irreplaceable it is.
//   orderBy must be a STABLE, unique-ish key or paging can skip/repeat.
const TABLES = [
  { name: "price_history", orderBy: "id", why: "20 months of observations - a pause can never rebuild this" },
  { name: "card_catalog", orderBy: "tcgplayer_id", why: "identities, numbers, images, references by condition and printing" },
  { name: "sealed_catalog", orderBy: "tcgplayer_id", why: "sealed-product references" },
  { name: "watchlist", orderBy: "id", why: "which cards we track, and the identity we match against" },
  { name: "sealed_watchlist", orderBy: "id", why: "sealed tracking list" },
  { name: "deals", orderBy: "id", why: "listing observations incl. graded grader/grade references" },
  { name: "sealed_deals", orderBy: "id", why: "sealed listing observations" },
  { name: "integrity_snapshots", orderBy: "id", why: "our own first-party integrity series" },
];

const PAGE = 1000; // PostgREST hard-caps a response at 1000 rows

async function rowCount(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

// Streams every row of one table as NDJSON, paging by a stable key.
async function* rows(table, orderBy) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} @${from}: ${error.message}`);
    if (!data || data.length === 0) return;
    for (const r of data) yield JSON.stringify(r) + "\n";
    if (data.length < PAGE) return;
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
  const { gunzipSync } = await import("node:zlib");
  for (const t of manifest.tables) {
    const file = join(VERIFY_DIR, t.file);
    if (!existsSync(file)) {
      console.log(`  x ${t.name}: FILE MISSING`);
      bad++;
      continue;
    }
    const digest = sha256File(file);
    const raw = gunzipSync(readFileSync(file)).toString("utf8");
    const lines = raw.split("\n").filter(Boolean);
    let parsed = 0;
    let firstKeys = null;
    for (const l of lines) {
      const o = JSON.parse(l); // throws on corruption - that is the point
      parsed++;
      if (!firstKeys) firstKeys = Object.keys(o).sort().join(",");
    }
    const okDigest = digest === t.sha256;
    const okRows = parsed === t.rows;
    const okCols = firstKeys === t.columns.slice().sort().join(",");
    if (!okDigest || !okRows || !okCols) bad++;
    console.log(
      `  ${okDigest && okRows && okCols ? "ok " : "FAIL"} ${t.name.padEnd(20)} rows ${String(parsed).padStart(8)}/${String(t.rows).padStart(8)}  digest ${okDigest ? "match" : "MISMATCH"}  columns ${okCols ? "match" : "MISMATCH"}`
    );
  }
  console.log(bad ? `\n  ${bad} table(s) FAILED verification` : "\n  all tables verified: digest, row count and column set");
  process.exit(bad ? 1 : 0);
}

// ----------------------------------------------------------------- plan
const cutoff = new Date().toISOString();
const dir = join(".local", "backups", cutoff.replace(/[:.]/g, "-"));

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

for (const t of plan) {
  const file = `${t.name}.ndjson.gz`;
  const path = join(dir, file);
  let written = 0;
  let columns = [];
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
  const size = statSync(path).size;
  const digest = sha256File(path);
  manifest.tables.push({ name: t.name, file, rows: written, expected: t.rows, columns, bytes: size, sha256: digest, why: t.why });
  console.log(`  wrote ${t.name.padEnd(20)} ${String(written).padStart(9)} rows  ${(size / 1048576).toFixed(1)} MB  sha256 ${digest.slice(0, 12)}…`);
}

const { writeFileSync } = await import("node:fs");
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n  manifest: ${join(dir, "manifest.json")}`);
console.log(`  verify with: node scripts/preservation/backup.mjs --verify=${dir}`);
