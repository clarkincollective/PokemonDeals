// SEO Phase 11B - one-time PokemonPriceTracker raw-history backfill.
//
//   npm run history:backfill -- --dry-run
//   npm run history:backfill -- --limit 3
//   npm run history:backfill -- --resume --limit 500 --credit-budget 1200
//
// Bounded, resumable, idempotent. Pulls raw Near Mint daily
// market-reference history for a bounded cohort and stores it in
// price_history with source='ppt_backfill'. NEVER runs the whole
// catalogue automatically. No graded history, no eBay Browse, no eBay
// sold-list history. The 11 WOTC dual-printing sets are EXCLUDED (their
// PPT history is a 1st-Ed/Unlimited blend - it grows from first-party
// catalogue snapshots instead).
//
// Cost: 2 PPT credits per card (includeHistory, days=730 - NOT
// maxDataPoints, which costs 3 and buys nothing, verified: no card has
// >~350 real points and none go older than ~19 months regardless).

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ph from "../lib/priceHistory.js";

const { HISTORY_SOURCES, isValidHistoryPrice, isWotcDualPrintingSet } = ph;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CURSOR_PATH = join(ROOT, ".secrets", "ppt-history-cursor.json"); // .secrets/ is git-ignored
const PPT_BASE = "https://www.pokemonpricetracker.com/api/v2";
const CREDITS_PER_CARD = 2; // includeHistory + days, verified via apiCallsConsumed
const HISTORY_DAYS = 730;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const val = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};

const OPTS = {
  dryRun: flag("dry-run"),
  resume: flag("resume"),
  limit: val("limit") ? Number(val("limit")) : null, // max cards THIS run
  creditBudget: val("credit-budget") ? Number(val("credit-budget")) : null,
  cohort: val("cohort", "watchlist"), // watchlist | deals | catalog
};

function die(msg) {
  console.error(`\n  x ${msg}\n`);
  process.exit(1);
}

const key = process.env.POKEMONPRICETRACKER_API_KEY;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  die("missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) in .env.local");
}
if (!OPTS.dryRun && !key) die("missing POKEMONPRICETRACKER_API_KEY in .env.local");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paced PPT GET with 429 backoff (bulk-only pattern, never a request path).
async function pptGet(url, { maxRetries = 6 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    if (res.status !== 429 || attempt >= maxRetries) {
      throw new Error(`PPT ${res.status} ${text.slice(0, 180)}`);
    }
    const m = text.match(/"retryAfter":\s*(\d+)/);
    await sleep(Math.min(((m ? Number(m[1]) : 8) + 2) * 1000, 65000));
  }
}

async function scanAll(table, cols, filter = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    q = filter(q);
    const { data, error } = await q;
    if (error) die(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// --- cohort selection ---------------------------------------------
async function buildCohort() {
  // Canonical price + identity come from card_catalog (kept current by
  // the free /export daily sync). WOTC dual-printing sets are dropped.
  const cat = await scanAll(
    "card_catalog",
    "tcgplayer_id, name, set, card_number, market_price, language",
    (q) => q.eq("language", "english").not("market_price", "is", null).gt("market_price", 0)
  );
  const priced = new Map();
  for (const r of cat) {
    if (!isValidHistoryPrice(r.market_price)) continue;
    if (isWotcDualPrintingSet(r.set)) continue;
    priced.set(String(r.tcgplayer_id), r);
  }

  let ids;
  if (OPTS.cohort === "catalog") {
    ids = [...priced.keys()];
  } else if (OPTS.cohort === "deals") {
    const deals = await scanAll(
      "deals",
      "watchlist:watchlist_id!inner (justtcg_tcgplayer_id, language)",
      (q) => q.eq("is_active", true).eq("watchlist.language", "english")
    );
    ids = [...new Set(deals.map((d) => d.watchlist?.justtcg_tcgplayer_id).filter(Boolean).map(String))];
  } else {
    // default: priced English watchlist (the exact set already getting
    // first-party forward snapshots - a clean 1:1 prefix)
    const wl = await scanAll("watchlist", "justtcg_tcgplayer_id, language", (q) =>
      q.eq("language", "english").not("justtcg_tcgplayer_id", "is", null)
    );
    ids = [...new Set(wl.map((r) => String(r.justtcg_tcgplayer_id)))];
  }

  // keep only cards we have a clean catalog record for (drops WOTC + unpriced)
  const cards = ids.map((id) => priced.get(id)).filter(Boolean);
  // high market_price first (high-interest / high-traffic pages first).
  // A GSC priority list can be layered on later; not required.
  cards.sort((a, b) => Number(b.market_price) - Number(a.market_price));
  return cards;
}

// Fail fast BEFORE spending a single credit if the hybrid schema
// extension has not been applied yet - otherwise every card fetches
// (2 credits) and then fails the write on the missing columns.
async function preflightSchema() {
  const { error } = await db.from("price_history").select("source_observed_at, card_number").limit(1);
  if (error) {
    die(
      `price_history is missing the Phase 11B columns (${error.message}).\n` +
        `  Apply supabase/price_history_hybrid_migration.sql in the Supabase SQL editor first, then re-run.`
    );
  }
}

function loadCursor() {
  if (!OPTS.resume) return { doneIds: [] };
  try {
    return JSON.parse(readFileSync(CURSOR_PATH, "utf8"));
  } catch {
    return { doneIds: [] };
  }
}
function saveCursor(state) {
  mkdirSync(join(ROOT, ".secrets"), { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
}

async function main() {
  const started = Date.now();
  const all = await buildCohort();
  const cursor = loadCursor();
  const done = new Set(cursor.doneIds ?? []);
  const remaining = all.filter((c) => !done.has(String(c.tcgplayer_id)));

  const batch = OPTS.limit ? remaining.slice(0, OPTS.limit) : remaining;
  const creditsEstimate = batch.length * CREDITS_PER_CARD;

  console.log("\n  PPT raw-history backfill");
  console.log("  cohort           : " + OPTS.cohort);
  console.log("  eligible (clean, non-WOTC, priced): " + all.length);
  console.log("  already done (cursor)             : " + done.size);
  console.log("  remaining                        : " + remaining.length);
  console.log("  this run (after --limit)         : " + batch.length);
  console.log("  estimated credits this run       : ~" + creditsEstimate + "  (2/card)");
  console.log("  budget cap                       : " + (OPTS.creditBudget ?? "none"));
  console.log("  mode                             : " + (OPTS.dryRun ? "DRY RUN (no API, no writes)" : "LIVE"));

  if (OPTS.creditBudget && creditsEstimate > OPTS.creditBudget) {
    die(
      `estimated ${creditsEstimate} credits exceeds --credit-budget ${OPTS.creditBudget}. ` +
        `Add --limit ${Math.floor(OPTS.creditBudget / CREDITS_PER_CARD)} or raise the budget.`
    );
  }
  if (!OPTS.dryRun) await preflightSchema();

  if (OPTS.dryRun) {
    console.log("\n  first 5 cards that WOULD be fetched:");
    for (const c of batch.slice(0, 5)) {
      console.log(`    ${c.tcgplayer_id.padEnd(9)} $${String(c.market_price).padEnd(9)} ${c.name} [${c.set}]`);
    }
    console.log("\n  dry run complete - nothing fetched, nothing written.\n");
    return;
  }

  const stats = {
    selected: all.length,
    attempted: 0,
    creditsSpentApprox: 0,
    pointsReceived: 0,
    rowsUpserted: 0,
    sentinelRejected: 0,
    invalidRejected: 0,
    wotcSkipped: all.length === 0 ? 0 : undefined, // filtered out of the cohort already
    apiFailures: 0,
    failedIds: [],
  };

  for (const card of batch) {
    const id = String(card.tcgplayer_id);
    stats.attempted += 1;
    stats.creditsSpentApprox += CREDITS_PER_CARD;

    const u = new URL(`${PPT_BASE}/cards`);
    u.searchParams.set("tcgPlayerId", id);
    u.searchParams.set("language", "english");
    u.searchParams.set("includeHistory", "true");
    u.searchParams.set("days", String(HISTORY_DAYS));

    let body;
    try {
      body = await pptGet(u);
    } catch (err) {
      stats.apiFailures += 1;
      stats.failedIds.push(id);
      console.log(`    ! ${id} ${card.name}: ${err.message}`);
      await sleep(150);
      continue;
    }

    const points = body?.data?.priceHistory?.conditions?.["Near Mint"]?.history ?? [];
    stats.pointsReceived += points.length;

    const rows = [];
    for (const p of points) {
      if (!isValidHistoryPrice(p?.market)) {
        if (Number.isFinite(Number(p?.market)) && Number(p.market) > 0) stats.sentinelRejected += 1;
        else stats.invalidRejected += 1;
        continue;
      }
      const day = String(p.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        stats.invalidRejected += 1;
        continue;
      }
      rows.push({
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
    }

    if (rows.length) {
      const { error } = await db
        .from("price_history")
        .upsert(rows, { onConflict: "tcgplayer_id,condition,source,observed_on" });
      if (error) {
        stats.apiFailures += 1;
        stats.failedIds.push(id);
        console.log(`    ! ${id} upsert: ${error.message}`);
      } else {
        stats.rowsUpserted += rows.length;
        done.add(id);
      }
    } else {
      done.add(id); // no usable history - counts as processed, don't retry forever
    }

    if (stats.attempted % 50 === 0) {
      saveCursor({ doneIds: [...done], updatedAt: new Date().toISOString() });
      console.log(`    ... ${stats.attempted}/${batch.length}  rows=${stats.rowsUpserted}  fails=${stats.apiFailures}`);
    }
    await sleep(150); // ~400/min, well under PPT's 500/min
  }

  saveCursor({ doneIds: [...done], updatedAt: new Date().toISOString() });

  console.log("\n  === run summary ===");
  console.log("  cohort size (eligible)   : " + stats.selected);
  console.log("  attempted this run       : " + stats.attempted);
  console.log("  credits spent (approx)   : ~" + stats.creditsSpentApprox);
  console.log("  history points received  : " + stats.pointsReceived);
  console.log("  rows upserted            : " + stats.rowsUpserted + "  (idempotent - re-runs no-op)");
  console.log("  sentinel points rejected : " + stats.sentinelRejected);
  console.log("  invalid points rejected  : " + stats.invalidRejected);
  console.log("  WOTC cards               : 0 (excluded from the cohort)");
  console.log("  API / upsert failures    : " + stats.apiFailures + (stats.failedIds.length ? `  ${stats.failedIds.slice(0, 10).join(",")}` : ""));
  console.log("  duration                 : " + Math.round((Date.now() - started) / 1000) + "s");
  console.log("  cursor                   : .secrets/ppt-history-cursor.json  (" + done.size + " done; --resume to continue)\n");
}

main().catch((err) => die(err?.message ?? String(err)));
