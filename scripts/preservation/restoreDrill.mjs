#!/usr/bin/env node
// RESTORE DRILL (2026-09-22). Reads a backup produced by backup.mjs and
// asks the only question that actually matters about it:
//
//   if we restored this, would the site still work?
//
//   node scripts/preservation/restoreDrill.mjs .local/backups/<cutoff>
//
// backup.mjs --verify already proves the bytes are intact: digests match,
// every line re-parses, the column set is the one recorded. That is
// necessary and not sufficient. A file can be byte-perfect and still be
// useless if the shape it holds is not the shape our code reads - a
// renamed column, a timestamp serialised differently, a numeric that came
// back as a string. Those are exactly the failures you discover at the
// worst possible moment.
//
// So this drill restores rows into memory and runs the REAL functions
// over them: the deal-quality gate that decides whether a listing is shown
// at all, the savings-claim gate that decides whether it may claim a
// discount, and the price-history merge/trend pipeline that draws every
// chart. Pure CommonJS modules, no database, no network, no provider.
//
// ISOLATION: this process opens no database connection and imports no
// module that can. It reads local files and calls pure functions. It
// cannot touch production, which is the point.
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dealQuality = require("../../lib/dealQuality.js");
const priceHistory = require("../../lib/priceHistory.js");
const provenance = require("../../lib/referenceProvenance.js");

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/preservation/restoreDrill.mjs <backup dir>");
  process.exit(1);
}
const manifestPath = join(dir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`no manifest at ${manifestPath} - is the backup finished?`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tableOf = (name) => manifest.tables.find((t) => t.name === name);

// Restores a table into memory, streaming (price_history decompresses to
// well past V8's ~512 MB string cap, so it can never be read whole).
//
// `where: "tail"` keeps the LAST n rows rather than the first. This is not
// cosmetic: every table here is ordered by ascending id, so the head is
// the oldest rows. Drilling the head of `deals` restores listings from
// months ago, essentially all of them long expired - it reported 0.1%
// displayable and looked like a broken restore when it was simply the
// wrong end of the table. What a restore has to prove is that TODAY'S
// listings still work.
async function restore(name, { limit = Infinity, where = "head" } = {}) {
  const t = tableOf(name);
  if (!t) return null;
  const rl = createInterface({
    input: createReadStream(join(dir, t.file)).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  if (where === "head") {
    const out = [];
    for await (const line of rl) {
      if (!line) continue;
      out.push(JSON.parse(line));
      if (out.length >= limit) {
        rl.close();
        break;
      }
    }
    return { meta: t, rows: out, where };
  }
  // Tail: a RING BUFFER, not a rolling array. The obvious `push` + `shift`
  // is O(n) per row once the window is full - over 1.8M price_history rows
  // with a 400k window that is quadratic, and the drill simply never
  // finished. Overwriting one slot is O(1).
  const ring = new Array(Math.min(limit, 1_000_000));
  let seen = 0;
  for await (const line of rl) {
    if (!line) continue;
    ring[seen % ring.length] = JSON.parse(line);
    seen++;
  }
  const kept = Math.min(seen, ring.length);
  const start = seen % ring.length;
  const out = new Array(kept);
  // Unwrap oldest-first so the restored rows stay in table order.
  for (let i = 0; i < kept; i++) out[i] = ring[(start + ring.length - kept + i) % ring.length];
  return { meta: t, rows: out, where, total: seen };
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "-");
let failures = 0;
const note = (ok, text) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${text}`);
};

console.log(`RESTORE DRILL - ${manifest.cutoff}`);
console.log(`  source ${dir}`);
console.log(`  no database connection, no provider client, no production write\n`);

// ---------------------------------------------------- 1. deal rows
console.log("DEAL ROWS -> the gates that decide what a visitor sees");
const deals = await restore("deals", { limit: 20000, where: "tail" });
if (!deals) {
  note(false, "deals table missing from the backup");
} else {
  const rows = deals.rows;
  // The columns the display path actually reads. If a restore lost one of
  // these the site would render, but silently wrong - a listing with no
  // reference_amount simply stops claiming a saving, which looks like a
  // business change rather than a broken restore.
  const cols = new Set(deals.meta.columns);
  const required = [
    "listing_id", "listing_url", "price", "total_price", "market_price", "discount_pct",
    "is_active", "last_seen_at", "title", "condition",
    ...provenance.CARD_REFERENCE_COLUMNS,
  ];
  const missing = required.filter((c) => !cols.has(c));
  note(missing.length === 0, `every column the display path reads survived${missing.length ? `: MISSING ${missing.join(", ")}` : ""}`);

  let displayable = 0;
  let claiming = 0;
  let evidenced = 0;
  let threw = null;
  for (const r of rows) {
    try {
      if (dealQuality.isDisplayableDeal(r)) displayable++;
      if (dealQuality.savingsClaimTrusted(r)) claiming++;
      if (dealQuality.storedReferenceEvidence(r)) evidenced++;
    } catch (e) {
      threw = threw ?? e;
    }
  }
  note(!threw, threw ? `a gate threw on a restored row: ${threw.message}` : "every gate ran on every restored row without throwing");
  console.log(`       ${rows.length} rows restored (the most recent - see the note in restore())`);
  console.log(`       displayable            ${String(displayable).padStart(6)}  ${pct(displayable, rows.length)}`);
  console.log(`       trusted savings claim  ${String(claiming).padStart(6)}  ${pct(claiming, rows.length)}`);
  console.log(`       reference evidenced    ${String(evidenced).padStart(6)}  ${pct(evidenced, rows.length)}`);
  // A restore that produced zero displayable rows would be intact and
  // worthless. This is the assertion that would catch it.
  note(displayable > 0, "the restore yields a non-empty set of displayable listings");
}

// ------------------------------------------- 2. price history pipeline
console.log("\nPRICE HISTORY -> the merge, trend and signal pipeline behind every chart");
const hist = await restore("price_history", { limit: 400000, where: "tail" });
if (!hist) {
  note(false, "price_history missing from the backup");
} else {
  const byCard = new Map();
  for (const r of hist.rows) {
    const k = String(r.tcgplayer_id);
    if (!byCard.has(k)) byCard.set(k, []);
    byCard.get(k).push(r);
  }
  // Drill the cards with the deepest restored series - those exercise the
  // 7/30/90-day windows, the confidence gate and the anomaly checks.
  const deepest = [...byCard.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 50);
  let charted = 0;
  let signalled = 0;
  let threw = null;
  let widestSpan = 0;
  for (const [, rows] of deepest) {
    try {
      const series = priceHistory.mergeHistoryRows(rows);
      if (series.length === 0) continue;
      charted++;
      const cov = priceHistory.historyCoverage(series);
      widestSpan = Math.max(widestSpan, cov.spanDays);
      // The real display path: confidence-gated windows, then the one
      // customer-facing signal derived from the 30-day window.
      const { windows, confidence } = priceHistory.confidentTrendWindows(series, { rawRows: rows });
      const sig = priceHistory.marketSignal(windows, confidence);
      if (sig && sig.status !== "limited") signalled++;
    } catch (e) {
      threw = threw ?? e;
    }
  }
  note(!threw, threw ? `the history pipeline threw on restored rows: ${threw.message}` : "merge, coverage, trend and signal all ran on restored rows");
  console.log(`       ${hist.rows.length} rows restored across ${byCard.size} cards (the most recent observations)`);
  console.log(`       deepest 50 series: ${charted} produced a chartable series, ${signalled} a confident market signal`);
  console.log(`       widest restored span: ${widestSpan} days`);
  note(charted > 0, "restored history still produces chartable series");

  // The tail sample above spans only the last couple of weeks, so the
  // 30-day window - the ONLY basis marketSignal will use - is unavailable
  // and every card reads "Limited history". That is a property of the
  // SAMPLE, not of the backup, and reporting it as a result would be
  // misleading. So: take a handful of cards and restore their COMPLETE
  // series by streaming the whole file again, keeping only those ids.
  // This is the assertion that the customer-facing signal survives.
  // Picking the probe cards from the tail sample would pick the wrong
  // ones: "most rows in the last 400,000" means "observed on most recent
  // days", not "longest history". Those 12 cards spanned 19 days. So
  // count rows per card across the WHOLE file first - a Map of ~29k
  // integers - and probe the genuinely deepest series.
  // Counted over CATALOG-SOURCE rows only, which is a deliberate choice
  // and was arrived at the hard way. Ranking by total rows picks the
  // cards with the longest history - which are exactly the ones whose
  // series mixes in the ppt_backfill import. Those backfilled points
  // carry no condition/printing provenance, so spanComparability withholds
  // every window and marketSignal correctly reports "Limited history"
  // (reason: provenance-unknown). All twelve probes came back that way.
  //
  // That is not a restore failure - it is the restored data reproducing
  // production's own refusal to compare two points it cannot prove are
  // the same printing. But it means those cards can never demonstrate the
  // signal path. Catalog-source cards can.
  const counts = new Map();
  const rl1 = createInterface({
    input: createReadStream(join(dir, hist.meta.file)).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl1) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.source !== priceHistory.HISTORY_SOURCES.CATALOG) continue;
    const k = String(r.tcgplayer_id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const probeIds = new Set(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
  );
  const full = new Map([...probeIds].map((id) => [id, []]));
  const rl2 = createInterface({
    input: createReadStream(join(dir, hist.meta.file)).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl2) {
    if (!line) continue;
    const r = JSON.parse(line);
    const k = String(r.tcgplayer_id);
    if (full.has(k)) full.get(k).push(r);
  }
  let deepSignals = 0;
  let deepSpan = 0;
  let decided = 0;
  const reasons = new Map();
  for (const [, rows] of full) {
    const series = priceHistory.mergeHistoryRows(rows);
    if (!series.length) continue;
    deepSpan = Math.max(deepSpan, priceHistory.historyCoverage(series).spanDays);
    const { windows, confidence } = priceHistory.confidentTrendWindows(series, { rawRows: rows });
    const sig = priceHistory.marketSignal(windows, confidence);
    if (!sig) continue;
    decided++;
    if (sig.status !== "limited") deepSignals++;
    else reasons.set(sig.reason ?? "no-30d-window", (reasons.get(sig.reason ?? "no-30d-window") ?? 0) + 1);
  }
  console.log(`       full series for ${full.size} probe cards: widest span ${deepSpan} days, ${deepSignals} produced a real market signal`);
  if (reasons.size) {
    console.log(`       withheld: ${[...reasons].map(([r, n]) => `${n}x ${r}`).join(", ")}`);
  }
  note(deepSpan >= 30, "a restored full series spans at least the 30 days marketSignal needs");
  note(decided === full.size, "the signal pipeline reached a definite verdict for every probe card");
  // There is deliberately NO assertion that a signal is produced.
  //
  // A broad unbiased sample (every card whose id % 97 === 0, full series,
  // 253 cards with a usable series) produced a real market signal for
  // ZERO of them: 219 had no 30-day window at all (median span across the
  // sample is 19 days), 33 were provenance-unknown, 1 source-disagreement.
  // So "0 signals" is what PRODUCTION does with this data too - the
  // restore reproduces it faithfully, which is exactly what this drill is
  // for. Asserting a signal here would only have been satisfiable by
  // hand-picking cards until one passed, which would test the probe
  // rather than the backup.
  //
  // That the feature is currently dark across the catalogue is a real
  // finding, but it is a finding about our history coverage, not about
  // this backup, and it is recorded in the handover rather than acted on
  // here.
  console.log(`       (no signal is asserted: production itself yields none on this data - see the comment above)`);
}

// ------------------------------------------------- 3. catalogue shape
console.log("\nCARD CATALOGUE -> the references a paused site would price against");
const cat = await restore("card_catalog", { limit: 30000 });
if (!cat) {
  note(false, "card_catalog missing from the backup");
} else {
  const cols = new Set(cat.meta.columns);
  for (const c of ["tcgplayer_id", "name", "set", "card_number", "market_price", "market_condition", "market_printing", "synced_at"]) {
    note(cols.has(c), `card_catalog.${c} survived`);
  }
  // The pause plan's Part B would read exactly these three together. A
  // price with no condition/printing label is a number without a meaning,
  // and must never be used as a reference.
  const priced = cat.rows.filter((r) => Number(r.market_price) > 0);
  const labelled = priced.filter((r) => r.market_condition && r.market_printing);
  console.log(`       ${cat.rows.length} rows restored, ${priced.length} priced (${pct(priced.length, cat.rows.length)})`);
  console.log(`       of those priced, ${labelled.length} carry BOTH condition and printing (${pct(labelled.length, priced.length)})`);
  console.log(`       - only these are usable as a saved-data reference (see the pause plan, §3 Part B)`);
  // card_catalog records synced_at (our copy time) and no provider as-of.
  // This is not a defect in the backup; it is a fact about what we hold,
  // and the reason a saved-data reference must carry a NULL observed_at.
  note(
    !cols.has("price_observed_at") && !cols.has("market_observed_at"),
    "card_catalog carries no provider as-of column - a saved-data reference must set reference_observed_at NULL"
  );
}

console.log(
  failures
    ? `\n  ${failures} check(s) FAILED - the backup is not safely restoreable as-is`
    : "\n  restoreable: the real display, savings and history code all run on restored rows"
);
console.log("\nLIMITATIONS, stated plainly:");
console.log("  - This drills SHAPE and LOGIC, not a database restore. Nothing was");
console.log("    written to any database, so constraints, indexes, RLS policies and");
console.log("    the card_reference_lastmod() SQL function are NOT exercised here.");
console.log("  - deals and price_history are drilled on their most recent rows and");
console.log("    card_catalog on its first 30,000, not the full tables. --verify");
console.log("    already re-parses every line of every table; this drill trades");
console.log("    completeness for running the real functions over what it reads.");
console.log("  - Rendering, routing and JSON-LD are not exercised: those need a");
console.log("    running app, and standing one up against restored data would mean");
console.log("    provisioning a database this drill deliberately does not have.");
process.exit(failures ? 1 : 0);
