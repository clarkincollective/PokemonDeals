// Audit finding 9 (2026-09-23) - "Recent eBay sales" was rendered in
// whatever order PokemonPriceTracker happened to return, then truncated to
// the first 8. Production census 2026-09-25: of 23 deal pages with an
// orderable list, 8 were oldest-first, 10 unordered and only 5 newest-first;
// the worst led with a sale 216 days older than the newest in the same list.
//
// These tests run against the REAL helper, not a copy of its logic, and
// assert the ordering a visitor actually sees - including the truncation
// case, which is where the defect does its damage.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sortSoldListingsByDate, soldDateValue } = require("../../lib/soldListingOrder.js");

const sale = (soldDate, price = 10, listingId = soldDate) => ({ listingId, soldDate, price });
const dates = (rows) => rows.map((r) => r.soldDate);

test("SO-1 an oldest-first provider list is reordered newest-first", () => {
  // The shape found on 8 of 23 census pages (e.g. deal 44624: Jul 30 -> Sep 20).
  const given = [sale("2026-07-30"), sale("2026-08-05"), sale("2026-09-20")];
  assert.deepEqual(dates(sortSoldListingsByDate(given)), ["2026-09-20", "2026-08-05", "2026-07-30"]);
});

test("SO-2 an unordered list is reordered newest-first", () => {
  // Deal 44620's shape: Jan 29, Dec 21, May 10, Sep 2.
  const given = [sale("2026-01-29"), sale("2025-12-21"), sale("2026-05-10"), sale("2026-09-02")];
  assert.deepEqual(dates(sortSoldListingsByDate(given)), [
    "2026-09-02",
    "2026-05-10",
    "2026-01-29",
    "2025-12-21",
  ]);
});

test("SO-3 an already newest-first list is unchanged (idempotent)", () => {
  const given = [sale("2026-03-10"), sale("2026-03-09"), sale("2026-02-25")];
  const once = sortSoldListingsByDate(given);
  assert.deepEqual(dates(once), ["2026-03-10", "2026-03-09", "2026-02-25"]);
  assert.deepEqual(dates(sortSoldListingsByDate(once)), dates(once));
});

test("SO-4 THE DEFECT: truncating to 8 now keeps the eight MOST RECENT sales", () => {
  // 12 sales oldest-first, as the provider supplied them. Slicing the raw
  // array kept the eight oldest and discarded the four newest - under a
  // heading that says "Recent".
  const given = Array.from({ length: 12 }, (_, i) => sale(`2026-0${1 + Math.floor(i / 3)}-0${(i % 3) + 1}`, 10, `s${i}`));
  const rawFirstEight = dates(given.slice(0, 8));
  const sortedFirstEight = dates(sortSoldListingsByDate(given).slice(0, 8));

  // the newest sale present must now be shown, and must lead the list
  const newest = dates(given).slice().sort().at(-1);
  assert.equal(sortedFirstEight[0], newest, "list must lead with the newest sale");
  assert.ok(!rawFirstEight.includes(newest), "pre-fix slice really did drop the newest sale");

  // and every shown sale must be at least as recent as every hidden one
  const shown = sortedFirstEight;
  const hidden = dates(sortSoldListingsByDate(given).slice(8));
  for (const h of hidden) for (const s of shown) assert.ok(s >= h, `${s} shown but older than hidden ${h}`);
});

test("SO-5 an undated sale is never presented as the most recent", () => {
  const given = [sale(null, 10, "undated"), sale("2026-04-01"), sale("2026-06-01")];
  const out = sortSoldListingsByDate(given);
  assert.equal(out[0].soldDate, "2026-06-01");
  assert.equal(out.at(-1).listingId, "undated", "undated sorts after every dated sale");
});

test("SO-6 an unparseable date is treated as undated, not as epoch or NaN", () => {
  assert.equal(soldDateValue("not a date"), null);
  const given = [sale("not a date", 10, "junk"), sale("2026-04-01")];
  const out = sortSoldListingsByDate(given);
  assert.equal(out[0].soldDate, "2026-04-01");
  assert.equal(out.at(-1).listingId, "junk");
});

test("SO-7 equal dates keep their original relative order (stable, deterministic)", () => {
  const given = [
    sale("2026-03-09", 10, "a"),
    sale("2026-03-09", 20, "b"),
    sale("2026-03-09", 30, "c"),
    sale("2026-03-10", 40, "newer"),
  ];
  const out = sortSoldListingsByDate(given);
  assert.deepEqual(
    out.map((r) => r.listingId),
    ["newer", "a", "b", "c"]
  );
});

test("SO-8 no sale is invented, dropped or rewritten - ordering only", () => {
  const given = [sale("2026-01-05", 11, "x"), sale("2026-07-07", 22, "y"), sale(null, 33, "z")];
  const out = sortSoldListingsByDate(given);
  assert.equal(out.length, given.length);
  for (const row of given) assert.ok(out.includes(row), "the same row objects come back, unmodified");
});

test("SO-9 the input array is not mutated (callers pass cached payloads they do not own)", () => {
  const given = [sale("2026-01-05"), sale("2026-07-07")];
  const before = dates(given);
  sortSoldListingsByDate(given);
  assert.deepEqual(dates(given), before);
});

test("SO-10 non-array and empty input degrade to an empty list, never a throw", () => {
  assert.deepEqual(sortSoldListingsByDate(null), []);
  assert.deepEqual(sortSoldListingsByDate(undefined), []);
  assert.deepEqual(sortSoldListingsByDate([]), []);
  assert.deepEqual(sortSoldListingsByDate("nope"), []);
});

test("SO-11 the provider adapter applies the rule at its own chokepoint", () => {
  // Guards the wiring, not the helper: normalizeSoldListings is the single
  // place every sold-listing list is built, so if this regresses, every
  // consumer silently returns to provider order.
  const src = require("node:fs").readFileSync(new URL("../../lib/pokemonPriceTracker.js", import.meta.url), "utf8");
  assert.match(src, /require\("\.\/soldListingOrder"\)/, "adapter must import the shared rule");
  assert.match(
    src,
    /function normalizeSoldListings[\s\S]{0,400}?sortSoldListingsByDate\(/,
    "normalizeSoldListings must order its output"
  );
});

test("SO-12 the display component sorts BEFORE it slices", () => {
  // RecentSales writes the word "Recent" and applies `limit`. If it sliced
  // first, a correctly ordered upstream would still be truncated wrongly by
  // any caller that assembled a list some other way.
  const src = require("node:fs").readFileSync(new URL("../../components/RecentSales.js", import.meta.url), "utf8");
  const sortAt = src.indexOf("sortSoldListingsByDate((sales");
  const sliceAt = src.indexOf("rows.slice(0, limit)");
  assert.ok(sortAt > 0, "RecentSales must apply the shared ordering rule");
  assert.ok(sliceAt > sortAt, "the sort must happen before the slice");
});
