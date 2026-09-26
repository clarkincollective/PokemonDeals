#!/usr/bin/env node
// SAVED REFERENCES IMPORT (2026-09-26) - load the captured provider data
// into the shapes lib/savedReference.js reads. NO PROVIDER REQUEST.
//
//   node scripts/preservation/importSavedReferences.mjs --in=<backup dir>            # dry run: build + validate, no writes
//   node scripts/preservation/importSavedReferences.mjs --in=<backup dir> --write    # upsert into catalog_snapshot
//
// Sources (both already verified on disk, see verifyCaptures.mjs):
//   printings-export.staged.ndjson.gz  -> saved_ref:<id>:<language>
//     one row per card+language; EVERY printing kept as its own entry with
//     its full condition ladder. Nothing is collapsed to one price per id.
//   percard.part*.ndjson.gz            -> saved_graded:<id>:<language>
//     the provider's ebay.salesByGrade buckets per card, verbatim figures,
//     plus the raw NM anchor / set / name the confidence gate needs.
//
// Dates: `lastPriceUpdate` is the PROVIDER's as-of and is stored as such;
// `retrievedAt` is our download time and is stored separately and never
// used as an observation date. Nothing here writes price_history.
//
// Writes go through the existing catalog_snapshot upsert path (kind is the
// primary key), so this needs no migration and is idempotent: re-running
// rewrites the same rows with the same content.
import { existsSync, readdirSync, createReadStream, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const { savedRefKind, savedGradedKind, buildSavedMarketData } = require("../../lib/savedReference.js");
const { isSentinelPrice, catalogRawMarketPrice } = require("../../lib/pokemonPriceTracker.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const IN = args.in;
const WRITE = "write" in args;
if (!IN) {
  console.error("  --in=<backup dir> is required");
  process.exit(2);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function eachLine(path, fn) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) if (line) fn(JSON.parse(line));
}
const num = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && !isSentinelPrice(n) ? n : null;
};
const isoOrNull = (v) => {
  const t = Date.parse(v ?? "");
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// ---------------------------------------------------------------- export
const manifest = JSON.parse(require("node:fs").readFileSync(join(IN, "printings-export.manifest.json"), "utf8"));
const byCard = new Map(); // `${id}|${lang}` -> row data
let exportLines = 0;
let printingRows = 0;
await eachLine(join(IN, manifest.staged.file), (r) => {
  exportLines++;
  const id = r.tcgPlayerId != null ? String(r.tcgPlayerId).trim() : "";
  if (!id) return;
  const lang = (r.language || "english").toLowerCase();
  const printing = (r.printing ?? "").trim();
  if (!printing) return;
  const key = `${id}|${lang}`;
  const row = byCard.get(key) ?? {
    v: 1,
    tcgplayerId: id,
    language: lang,
    name: r.name ?? null,
    setName: r.setName ?? null,
    cardNumber: r.cardNumber ?? null,
    retrievedAt: manifest.retrievedAt,
    source: "ppt_export",
    sourceSha256: manifest.raw.sha256,
    printings: {},
  };
  // A printing is one entry; a second row for the same printing (not
  // observed in the export, but guarded) keeps the later provider as-of.
  row.printings[printing] = {
    nm: num(r.marketNearMint),
    lp: num(r.marketLightlyPlayed),
    mp: num(r.marketModeratelyPlayed),
    hp: num(r.marketHeavilyPlayed),
    dmg: num(r.marketDamaged),
    market: num(r.marketPrice),
    marketCondition: r.marketPriceCondition && String(r.marketPriceCondition).trim() ? String(r.marketPriceCondition).trim() : null,
    low: num(r.lowPrice),
    sellers: Number.isFinite(Number(r.sellers)) ? Number(r.sellers) : null,
    lastPriceUpdate: isoOrNull(r.lastPriceUpdate),
  };
  printingRows++;
  byCard.set(key, row);
});

// validate: every row must build into usable market data, and the matrix
// must keep as many printings as were priced
const refRows = [];
let unbuildable = 0;
let multiPrinting = 0;
const langs = {};
for (const data of byCard.values()) {
  const built = buildSavedMarketData(data);
  if (!built) {
    unbuildable++;
    continue;
  }
  const pricedPrintings = Object.values(data.printings).filter((p) => p.nm != null || p.market != null || p.lp != null).length;
  if (pricedPrintings > 1) multiPrinting++;
  if (Object.keys(built.byPrintingCondition).length < Object.values(data.printings).filter((p) => p.nm != null || p.lp != null || p.mp != null || p.hp != null || p.dmg != null).length) {
    throw new Error(`printing collapsed for ${data.tcgplayerId}|${data.language} - refusing to import`);
  }
  langs[data.language] = (langs[data.language] ?? 0) + 1;
  refRows.push({ kind: savedRefKind(data.tcgplayerId, data.language), data, updated_at: new Date().toISOString() });
}

// ---------------------------------------------------------------- graded
const gradedRows = [];
let percardLines = 0;
let withBuckets = 0;
for (const f of readdirSync(IN).filter((x) => /^percard\.part\d+\.ndjson\.gz$/.test(x)).sort()) {
  await eachLine(join(IN, f), (rec) => {
    percardLines++;
    let body;
    try {
      body = JSON.parse(rec.body);
    } catch {
      return;
    }
    const d = body?.data;
    const sbg = d?.ebay?.salesByGrade;
    if (!d || !sbg || typeof sbg !== "object") return;
    const salesByGrade = {};
    for (const [k, s] of Object.entries(sbg)) {
      const price = num(s?.smartMarketPrice?.price ?? s?.medianPrice);
      if (price == null) continue;
      salesByGrade[k] = {
        price,
        count: Number(s?.count) || 0,
        minPrice: num(s?.minPrice),
        maxPrice: num(s?.maxPrice),
        lastSaleDate: isoOrNull(s?.lastSaleDate),
        providerLowConfidence: Boolean(d?.ebay?.smartPriceOutlierByGrade?.[k]) || s?.smartMarketPrice?.confidence === "low",
      };
    }
    if (!Object.keys(salesByGrade).length) return;
    withBuckets++;
    const rawNm = (() => {
      const v = catalogRawMarketPrice(d?.prices);
      return num(v);
    })();
    gradedRows.push({
      kind: savedGradedKind(rec.tcgPlayerId, rec.language),
      data: { v: 1, tcgplayerId: String(rec.tcgPlayerId), language: rec.language, capturedAt: rec.retrieved_at, setName: d.setName ?? null, cardName: d.name ?? null, rawNm, salesByGrade },
      updated_at: new Date().toISOString(),
    });
  });
}

console.log(`  mode ${WRITE ? "WRITE" : "DRY RUN"}`);
console.log(`  export: lines ${exportLines}  printing rows kept ${printingRows}  cards ${byCard.size}  unbuildable ${unbuildable}  multi-printing cards ${multiPrinting}  by language ${JSON.stringify(langs)}`);
console.log(`  graded: per-card lines ${percardLines}  cards with usable buckets ${withBuckets}`);
console.log(`  rows to upsert: saved_ref ${refRows.length}  saved_graded ${gradedRows.length}`);

let written = 0;
const errors = [];
if (WRITE) {
  for (const rows of [refRows, gradedRows]) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("catalog_snapshot").upsert(rows.slice(i, i + 200), { onConflict: "kind" });
      if (error) errors.push(error.message);
      else written += Math.min(200, rows.length - i);
      if ((i / 200) % 25 === 0) process.stdout.write(`    ${written} rows written\r`);
    }
  }
  console.log(`  written ${written}  errors ${errors.length}${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
}
writeFileSync(join(IN, `import-saved-references.${WRITE ? "write" : "dryrun"}.summary.json`), JSON.stringify({ mode: WRITE ? "write" : "dry-run", exportLines, printingRows, cards: byCard.size, unbuildable, multiPrinting, langs, percardLines, withBuckets, savedRef: refRows.length, savedGraded: gradedRows.length, written, errors, finishedAt: new Date().toISOString() }, null, 2));
process.exit(errors.length ? 1 : 0);
