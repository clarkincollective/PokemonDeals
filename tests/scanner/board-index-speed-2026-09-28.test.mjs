// 28 Sep 2026 - owner: "Website page speeds seems a little slow". The board
// index is written by the PC jobs as one stored row; the web reads it and
// expires its cache stale-while-revalidate. See lib/boardDeals (stored index).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const require = createRequire(import.meta.url);
const bd = require("../../lib/boardDeals.js");

const NOW = Date.parse("2026-09-28T06:00:00.000Z");
const rec = (o) => ({
  marketplace: "EBAY_US",
  itemId: "1",
  status: "unverified",
  affiliateUrl: "https://www.ebay.com/itm/1",
  price: 10,
  currency: "USD",
  variant: "Raw",
  format: "BIN",
  firstSeenAt: "2026-09-28T05:00:00.000Z",
  lastSeenOnBoardAt: "2026-09-28T05:50:00.000Z",
  captured: { at: "2026-09-28T05:00:00.000Z", foundAt: "2026-09-28T05:00:00.000Z", discountPct: 0.3, source: "x", kind: "single" },
  ...o,
});

test("BI-1 boardIndexRows: publishable rows only, newest first, compact fields, USD via rates, card id carried", () => {
  const records = new Map([
    ["a", rec({ itemId: "a", price: 100, currency: "GBP", card: { tcgplayerId: "42", at: "x" } })],
    ["b", rec({ itemId: "b", captured: { at: "2026-09-28T05:30:00.000Z", foundAt: "2026-09-28T05:30:00.000Z", discountPct: 0.5, source: "x", kind: "single" } })],
    ["c", rec({ itemId: "c", status: "expired" })],
    ["d", rec({ itemId: "d", status: "unverified", captured: { at: "2026-09-20T05:00:00.000Z", foundAt: "2026-09-20T05:00:00.000Z", discountPct: 0.5, source: "x", kind: "single" }, lastSeenOnBoardAt: "2026-09-20T05:00:00.000Z" })],
  ]);
  const rows = bd.boardIndexRows(records, { now: NOW, rates: { GBP: 0.8 } });
  assert.deepEqual(rows.map((r) => r.id), ["EBAY_US:b", "EBAY_US:a"], "expired and stale rows are out; newest found-at first");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["cardTcgplayerId", "format", "id", "marketplace", "priceUsd", "variant"]);
  assert.equal(rows[1].priceUsd, 125, "GBP 100 at 0.8 per USD");
  assert.equal(rows[1].cardTcgplayerId, "42");
  assert.equal(rows[0].cardTcgplayerId, null);
  assert.equal(bd.boardIndexRows(records, { now: NOW, rates: null })[1].priceUsd, 100, "no rates: the price is taken as-is (USD or not), never dropped");
  assert.equal(bd.BOARD_INDEX_KIND, "board_deals_index");
});

test("BI-2 saveBoardIndex writes ONE catalog_snapshot row; loadBoardIndex reads it; missing -> null", async () => {
  const store = new Map();
  const fakeDb = {
    from: () => ({
      upsert: async (row) => { store.set(row.kind, row); return { error: null }; },
      select: () => ({ eq: (_, kind) => ({ maybeSingle: async () => ({ data: store.get(kind) ?? null, error: null }) }) }),
    }),
  };
  const records = new Map([["a", rec({ itemId: "a" })]]);
  const out = await bd.saveBoardIndex(fakeDb, records, { now: NOW });
  assert.equal(out.rows, 1);
  assert.equal(out.error, null);
  const stored = store.get("board_deals_index");
  assert.equal(stored.data.v, 1);
  assert.equal(stored.data.rows[0].id, "EBAY_US:a");
  const loaded = await bd.loadBoardIndex(fakeDb);
  assert.deepEqual(loaded.rows, stored.data.rows);
  assert.equal(await bd.loadBoardIndex({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }), null);
});

test("BI-3 wiring: both PC writers save the index, the web reads it first, and the tag expiry is stale-while-revalidate", () => {
  const cap = read("scripts/boards/captureJimmy.mjs");
  assert.match(cap, /await bd\.saveBoardIndex\(db, merged, \{ now: Date\.now\(\), rates \}\)/);
  assert.ok(cap.indexOf("bd.saveBoardIndex(") < cap.indexOf("bd.recordBoardRun("), "the index is written before the run is recorded");
  const ingest = read("app/api/ingest-feed/route.js");
  assert.match(ingest, /board\.index = await saveBoardIndex\(db, merged, /);
  assert.match(ingest, /revalidateTag\(BOARD_DEALS_TAG, "max"\)/);
  assert.doesNotMatch(ingest, /revalidateTag\(BOARD_DEALS_TAG, \{ expire: 0 \}\)/, "no hard expiry a visitor has to wait on");
  const rv = read("app/api/revalidate/route.js");
  assert.match(rv, /revalidateTag\(t, t === BOARD_DEALS_TAG \? "max" : \{ expire: 0 \}\)/, "the PC shim posts tag names here; the board tag must be soft here too");
  const feed = read("lib/boardDealsFeed.js");
  assert.match(feed, /const stored = await loadBoardIndex\(db\);\s*if \(stored\?\.rows\?\.length\) return stored\.rows;/);
  assert.match(feed, /fetchPublishedBoardDeals\(db, \{ limit: 20000 \}\)/, "the full rebuild remains as the fallback");
});
