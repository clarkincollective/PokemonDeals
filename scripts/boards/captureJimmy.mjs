#!/usr/bin/env node
// SECOND BOARD CAPTURE, run from a machine the site allows (2026-09-27).
//
//   node scripts/boards/captureJimmy.mjs            # the Today lists (24 requests)
//   node scripts/boards/captureJimmy.mjs --full     # every list x sort (144 requests)
//   node scripts/boards/captureJimmy.mjs --dry      # capture + report, write nothing
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
// Schedule it on this machine (Task Scheduler): every 30 minutes for the
// Today lists and once a day with --full. Both boards' records share the
// store, so nothing else changes.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const { fetchJimmyFeed } = require("../../lib/jimmyFeed.js");
const bd = require("../../lib/boardDeals.js");

const args = new Set(process.argv.slice(2));
const FULL = args.has("--full");
const DRY = args.has("--dry");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("  Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(2);
}
if (!process.env.EBAY_CAMPAIGN_ID) console.warn("  EBAY_CAMPAIGN_ID is not set here: wrapped links will carry customid only (the production lookup replaces them with eBay's own affiliate URL when it verifies)");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const runNow = new Date().toISOString();
const started = Date.now();
const got = await fetchJimmyFeed({ full: FULL });
const summary = { at: runNow, full: FULL, lists: got.pages, listErrors: got.pageErrors.length, rows: got.listings.length, withDiscount: 0, unverifiedShown: 0, duplicatesTouched: 0, queuedPending: 0, expired: 0, saved: 0, saveErrors: [] };
const byStatus = (statuses) => Object.entries(statuses).map(([k, v]) => `${k}=${v}`).join(" ");
const errStatuses = {};
for (const e of got.pageErrors) { const m = /HTTP (\d+)/.exec(e); errStatuses[m ? m[1] : "other"] = (errStatuses[m ? m[1] : "other"] ?? 0) + 1; }

if (got.error && got.listings.length === 0) {
  console.error(`  every list failed (${byStatus(errStatuses)}); nothing written`);
  process.exit(1);
}

// one run at a time with the production route (same lock)
const lock = await bd.acquireRunLock(db, { ttlMs: 10 * 60_000, owner: "captureJimmy" });
if (!lock.acquired) {
  console.error(`  another run holds the lock until ${lock.heldUntil ?? "?"}; try again later`);
  process.exit(3);
}
try {
  const records = await bd.loadBoardDealRecords(db);
  const changed = new Map();
  for (const it of got.listings) {
    const captured = bd.capturedFromFeedItem(it, runNow);
    if (!captured) continue;
    summary.withDiscount++;
    const kind = bd.boardDealKind(it.marketplace, it.ebayItemId);
    const prev = records.get(kind) ?? null;
    if (prev && prev.status !== "pending") {
      changed.set(kind, bd.touchBoardDealRecord(prev, { now: runNow, source: it.source }));
      summary.duplicatesTouched++;
    } else if (bd.isFreshCapture(captured, { lastSeenOnBoardAt: runNow })) {
      changed.set(kind, bd.unverifiedBoardDealRecord({ feedItem: it, captured, prev, now: runNow }));
      summary.unverifiedShown++;
    } else {
      changed.set(kind, bd.pendingBoardDealRecord({ feedItem: it, captured, prev, now: runNow }));
      summary.queuedPending++;
    }
  }
  const untouched = [...records.entries()].filter(([k]) => !changed.has(k)).map(([, r]) => r);
  const { records: aged, expired } = bd.expireAbsentRecords(untouched, { now: Date.now() });
  for (const r of aged) {
    const k = bd.boardDealKind(r.marketplace, r.itemId);
    if (r.status === "expired" && records.get(k)?.status !== "expired") changed.set(k, r);
  }
  summary.expired = expired;
  if (!DRY && changed.size) {
    const { written, errors } = await bd.saveBoardDealRecords(db, [...changed.values()]);
    summary.saved = written;
    summary.saveErrors = errors;
  }
  if (!DRY) await bd.recordBoardRun(db, { ...summary, source: "captureJimmy", listErrorStatuses: errStatuses });
} finally {
  await bd.releaseRunLock(db);
}
summary.tookMs = Date.now() - started;
console.log(JSON.stringify({ ...summary, listErrorStatuses: errStatuses, dry: DRY }, null, 1));
process.exit(summary.saveErrors.length ? 1 : 0);
