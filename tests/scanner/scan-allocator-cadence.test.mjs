// THE SCAN ALLOCATOR'S LONG-TAIL CADENCE, pinned to what the code
// actually computes.
//
// WHY THIS FILE EXISTS. A comment beside MARKETPLACE_WEIGHT asserted that
// "every marketplace still rotates its whole eligible pool well inside
// the CURRENT ~30-day cadence", and a second comment in
// app/api/refresh-deals referred to "vercel.json's now-30 extended cron
// entries". Both were false: there are no tier=extended crons at all, and
// the measured rotation is 34-59 days. The figures were never wrong in
// the code - only in the prose describing it - so nothing failed, and a
// reader (me) quoted "~30 days" to someone making an operational
// decision on it.
//
// Comments cannot be tested, but the NUMBERS they describe can be. This
// file recomputes the cadence from the allocator's own budgetForRun() and
// fails if the documented table no longer matches, so the next change to
// TARGET_BUDGET_BASE, a marketplace weight, or the cron schedule has to
// update the prose with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const require_ = createRequire(import.meta.url);
const { budgetForRun } = require_("../../lib/scanAllocator.js");

const ALLOCATOR = "lib/scanAllocator.js";
const ROUTE = "app/api/refresh-deals/route.js";

// The explore lane's share and floor, mirrored from the allocator. If
// these change there, the documented cadence changes too - which is the
// point of pinning them.
const EXPLORE_RATIO = 0.62;
const MIN_EXPLORE = 40;

// Documented in the comment beside MARKETPLACE_WEIGHT. Measured
// 2026-09-23 against 8,430 active extended watchlist entries.
const DOCUMENTED = {
  EBAY_US: { budget: 200, explore: 124, days: 34 },
  EBAY_GB: { budget: 150, explore: 93, days: 45 },
  EBAY_AU: { budget: 131, explore: 82, days: 51 },
  EBAY_CA: { budget: 131, explore: 82, days: 51 },
  EBAY_DE: { budget: 119, explore: 74, days: 57 },
  EBAY_IT: { budget: 113, explore: 71, days: 59 },
};
const POOL = 8430;
const RUNS_PER_DAY = 2; // two tier=allocated crons per country in vercel.json

test("1. each marketplace's per-run budget still matches the documented table", () => {
  for (const [mkt, doc] of Object.entries(DOCUMENTED)) {
    assert.equal(budgetForRun({ marketplace: mkt }), doc.budget, `${mkt}: budget changed - update the table beside MARKETPLACE_WEIGHT`);
  }
});

test("2. the explore lane still reserves the documented number of slots", () => {
  for (const [mkt, doc] of Object.entries(DOCUMENTED)) {
    const B = budgetForRun({ marketplace: mkt });
    const explore = Math.min(B, Math.max(MIN_EXPLORE, Math.ceil(B * EXPLORE_RATIO)));
    assert.equal(explore, doc.explore, `${mkt}: explore slots changed`);
    assert.ok(explore > 0, `${mkt}: no explore lane - the long tail would be starved`);
  }
});

test("3. the documented full-rotation cadence matches what the numbers give", () => {
  for (const [mkt, doc] of Object.entries(DOCUMENTED)) {
    const B = budgetForRun({ marketplace: mkt });
    const perDay = Math.min(B, Math.max(MIN_EXPLORE, Math.ceil(B * EXPLORE_RATIO))) * RUNS_PER_DAY;
    const days = Math.round(POOL / perDay);
    assert.equal(days, doc.days, `${mkt}: rotation is now ~${days} days, documented as ~${doc.days}`);
  }
  // and the headline range in the prose
  const all = Object.values(DOCUMENTED).map((d) => d.days);
  assert.equal(Math.min(...all), 34);
  assert.equal(Math.max(...all), 59);
});

test("4. the cron schedule still matches the assumptions behind that cadence", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const crons = vercel.crons ?? [];
  const allocated = crons.filter((c) => c.path.includes("tier=allocated"));
  const extended = crons.filter((c) => c.path.includes("tier=extended"));

  // two allocated runs per country is what RUNS_PER_DAY above assumes
  assert.equal(allocated.length, 6, "expected one tier=allocated cron per marketplace");
  for (const c of allocated) {
    const hours = c.schedule.split(" ")[1];
    assert.equal(hours.split(",").length, RUNS_PER_DAY, `${c.path}: ${hours} is not ${RUNS_PER_DAY} runs a day - the documented cadence assumes it`);
  }
  // there are none, and the prose now says so; if someone adds them the
  // chunked rotation becomes live again and both comments need revisiting
  assert.equal(
    extended.length,
    0,
    "tier=extended crons now exist - the chunked rotation is live again, so the corrected comments in scanAllocator and refresh-deals must be revisited"
  );
});

test("5. the corrected prose is present and the withdrawn claims have not come back", () => {
  const alloc = read(ALLOCATOR);
  const route = read(ROUTE);
  // the measured table, not an asserted cadence
  assert.match(alloc, /MEASURED 2026-09-23 rather than asserted/, "the measured-cadence note is gone");
  assert.match(alloc, /34-59 days/, "the measured range is gone from the allocator comment");
  // The corrected comments QUOTE the withdrawn wording in order to say it
  // was wrong, so a bare doesNotMatch fires on the quotation itself. What
  // must not come back is the claim ASSERTED - i.e. the phrase appearing
  // outside quotation marks. (Learned the hard way: this exact assertion
  // shape has tripped on its own explanatory prose before.)
  const assertedOutsideQuotes = (src, phrase) => {
    const re = new RegExp(phrase, "g");
    for (const m of src.matchAll(re)) {
      const before = src.slice(Math.max(0, m.index - 220), m.index);
      const quotesBefore = (before.match(/"/g) ?? []).length;
      if (quotesBefore % 2 === 0) return true; // not inside a quotation
    }
    return false;
  };
  assert.equal(
    assertedOutsideQuotes(alloc, "well inside the CURRENT ~30-day cadence"),
    false,
    "the withdrawn ~30-day claim is asserted again (not merely quoted)"
  );
  assert.equal(
    assertedOutsideQuotes(route, "full rotation is packed into 30 daily cron slots"),
    false,
    "the withdrawn 'packed into 30 daily cron slots' claim is asserted again"
  );
  // but the correction must still explain what it replaced
  assert.match(alloc, /was wrong on/, "the allocator comment no longer says the old wording was wrong");
  assert.match(route, /There are NO\s*\n\/\/ tier=extended cron entries/, "the correction in refresh-deals is gone");
});
