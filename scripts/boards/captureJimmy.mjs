#!/usr/bin/env node
// SECOND BOARD CAPTURE, run from a machine the site allows (2026-09-27).
//
//   node scripts/boards/captureJimmy.mjs                 # quick: the Today lists, first 3 pages (12 lists)
//   node scripts/boards/captureJimmy.mjs --full          # every list, every page up to 50 (24 lists)
//   node scripts/boards/captureJimmy.mjs --backfill      # the graded view + sealed searches of every list
//   node scripts/boards/captureJimmy.mjs --dry ...       # capture + report, write nothing
//
// WHY A SCRIPT. The site sits behind Cloudflare, which answers HTTP 403 to
// every request from Vercel's address range (measured 27 Sep 04:18Z: 144 of
// 144 lists refused; the same pages answer 200 from this machine with any
// User-Agent, so it is the address, not our identification). The production
// route (app/api/ingest-feed) therefore cannot read this board. This script
// reads it with the SAME parser and writes the SAME records
// (catalog_snapshot board_deal:<MARKETPLACE>:<itemId>) with the SAME rules
// (lib/boardDeals): a row the board lists is shown unverified at once on our
// wrapped eBay link; a record that already exists is touched, never
// re-imported; records absent from every board for 12 h expire. The
// production run then verifies these rows through eBay as quota allows,
// exactly as it does the first board's, and the page cache picks them up
// within its 15-minute revalidate.
//
// PAGES. The site paginates on page_num (lib/jimmyFeed.js): a list is walked
// page by page. Records are saved AFTER EACH LIST, under the shared run lock
// taken only for that save, so a long walk keeps its progress if it is cut
// short and the site's own half-hourly job is never held off for long.
//
// PACE. 2.5 s between requests (the host rate-limited a faster pass).
// Scheduled on this machine (Task Scheduler): quick every 30 minutes, --full
// daily. --backfill is a one-off for graded and sealed depth.
import "../crons/dnsFix.mjs";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const jimmy = require("../../lib/jimmyFeed.js");
const bd = require("../../lib/boardDeals.js");
const bcm = require("../../lib/boardCardMatch.js");
const fx = require("../../lib/fx.js");

const args = new Set(process.argv.slice(2));
const MODE = args.has("--backfill") ? "backfill" : args.has("--sealed") ? "sealed" : args.has("--full") ? "full" : "quick";
const DRY = args.has("--dry");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("  Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(2);
}
if (!process.env.EBAY_CAMPAIGN_ID) console.warn("  EBAY_CAMPAIGN_ID is not set here: wrapped links will carry customid only (the production lookup replaces them with eBay's own affiliate URL when it verifies)");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const LOCK_WAIT_MAX_MS = 8 * 60_000;
const LOCK_POLL_MS = 15_000;
async function withLock(fn) {
  let lock = await bd.acquireRunLock(db, { ttlMs: 5 * 60_000, owner: `captureJimmy:${MODE}` });
  const waitStart = Date.now();
  while (!lock.acquired && !lock.error && Date.now() - waitStart < LOCK_WAIT_MAX_MS) {
    const untilMs = Date.parse(lock.heldUntil ?? "");
    const wait = Math.min(LOCK_POLL_MS, Math.max(2_000, (Number.isFinite(untilMs) ? untilMs - Date.now() : LOCK_POLL_MS) + 500));
    await new Promise((r) => setTimeout(r, wait));
    lock = await bd.acquireRunLock(db, { ttlMs: 5 * 60_000, owner: `captureJimmy:${MODE}` });
  }
  if (!lock.acquired) throw new Error(`could not take the lock after ${Math.round((Date.now() - waitStart) / 1000)}s (${lock.error ?? `held until ${lock.heldUntil ?? "?"}`})`);
  try {
    return await fn();
  } finally {
    await bd.releaseRunLock(db);
  }
}

const runNow = new Date().toISOString();
const started = Date.now();
const specs = jimmy.jimmyListSpecs({ mode: MODE });
const summary = { at: runNow, mode: MODE, specs: specs.length, specsDone: 0, pages: 0, listErrors: 0, rows: 0, withDiscount: 0, unverifiedShown: 0, duplicatesTouched: 0, queuedPending: 0, expired: 0, saved: 0, saveErrors: [], perSpec: [] };
const seen = new Set();
const records = await bd.loadBoardDealRecords(db);
const changedAll = new Map();

for (const spec of specs) {
  const got = await jimmy.fetchJimmyListPages(spec, { seen });
  summary.specsDone++;
  summary.pages += got.pages;
  summary.listErrors += got.errors.length;
  summary.rows += got.listings.length;
  const changed = new Map();
  for (const it of got.listings) {
    const captured = bd.capturedFromFeedItem(it, runNow);
    if (!captured) continue;
    summary.withDiscount++;
    const kind = bd.boardDealKind(it.marketplace, it.ebayItemId);
    const prev = changedAll.get(kind) ?? records.get(kind) ?? null;
    let rec;
    if (prev && prev.status !== "pending") {
      rec = bd.touchBoardDealRecord(prev, { now: runNow, source: it.source });
      summary.duplicatesTouched++;
    } else if (bd.isFreshCapture(captured, { lastSeenOnBoardAt: runNow })) {
      rec = bd.unverifiedBoardDealRecord({ feedItem: it, captured, prev, now: runNow });
      summary.unverifiedShown++;
    } else {
      rec = bd.pendingBoardDealRecord({ feedItem: it, captured, prev, now: runNow });
      summary.queuedPending++;
    }
    changed.set(kind, rec);
    changedAll.set(kind, rec);
  }
  summary.perSpec.push({ list: `${spec.slug}/${spec.format}/${spec.window}`, label: spec.label, pages: got.pages, maxPage: got.maxPage, rows: got.listings.length, stopped: got.stoppedBecause, errors: got.errors.length });
  if (!DRY && changed.size) {
    try {
      const { written, errors } = await withLock(() => bd.saveBoardDealRecords(db, [...changed.values()]));
      summary.saved += written;
      summary.saveErrors.push(...errors);
    } catch (e) {
      summary.saveErrors.push(e?.message ?? String(e));
    }
  }
  console.error(`  ${summary.specsDone}/${specs.length} ${spec.slug}/${spec.format}/${spec.window} ${spec.label}: pages ${got.pages}/${got.maxPage} rows ${got.listings.length} (${got.stoppedBecause})`);
}

// 28 Sep 2026: tie every never-attempted record to a catalogue printing
// (lib/boardCardMatch) so the card pages can show it. In-memory; the
// catalogue read is one paginated select per run; only stamped records are
// saved. Runs before expiry so an expiring record is stamped too (harmless).
if (!DRY) {
  try {
    const stamp = await bcm.stampCatalogMatches(db, records, { overlay: changedAll, now: runNow });
    summary.cardMatch = { attempted: stamp.attempted, matched: stamp.matched, catalog: stamp.catalog };
    if (stamp.changed.length) {
      const { written, errors } = await withLock(() => bd.saveBoardDealRecords(db, stamp.changed));
      summary.saved += written;
      summary.saveErrors.push(...errors);
      for (const r of stamp.changed) changedAll.set(bd.boardDealKind(r.marketplace, r.itemId), r);
    }
  } catch (e) {
    summary.saveErrors.push(`cardMatch: ${e?.message ?? String(e)}`);
  }
}

// expiry of records absent from every board (only a full or quick pass says
// what the board currently lists; a backfill reads filtered views only)
if (MODE !== "backfill") {
  const untouched = [...records.entries()].filter(([k]) => !changedAll.has(k)).map(([, r]) => r);
  const { records: aged, expired } = bd.expireAbsentRecords(untouched, { now: Date.now() });
  const toExpire = aged.filter((r) => r.status === "expired" && records.get(bd.boardDealKind(r.marketplace, r.itemId))?.status !== "expired");
  summary.expired = expired;
  if (!DRY && toExpire.length) {
    try {
      const { written, errors } = await withLock(() => bd.saveBoardDealRecords(db, toExpire));
      summary.saved += written;
      summary.saveErrors.push(...errors);
    } catch (e) {
      summary.saveErrors.push(e?.message ?? String(e));
    }
  }
}
// 28 Sep 2026: the stored web index (lib/boardDeals.saveBoardIndex) - the
// site reads this one row instead of rebuilding from the whole store.
if (!DRY) {
  try {
    const merged = new Map(records);
    for (const [k, r] of changedAll) merged.set(k, r);
    let rates = null;
    try {
      rates = await fx.getUsdRates();
    } catch {
      rates = null;
    }
    const idx = await bd.saveBoardIndex(db, merged, { now: Date.now(), rates });
    summary.index = idx;
    if (idx.error) summary.saveErrors.push(`index: ${idx.error}`);
  } catch (e) {
    summary.saveErrors.push(`index: ${e?.message ?? String(e)}`);
  }
}
if (!DRY) await bd.recordBoardRun(db, { ...summary, perSpec: undefined, source: "captureJimmy" });
summary.tookMs = Date.now() - started;
console.log(JSON.stringify({ ...summary, dry: DRY }, null, 1));
process.exit(summary.saveErrors.length ? 1 : 0);
