// sealed-rev1 (16 Sep 2026) - the sealed listing scan can actually run.
//
// refresh-sealed-deals was skipped on EVERY attempt for five consecutive days
// (12-16 Sep), always "ebay_rate_limited", with 200-240 Browse calls left
// against its own floor of 250. Two independent reasons, both fixed here:
//
//   1. SCHEDULE. It fired at 06:00 UTC. The eBay Browse quota resets at 07:00
//      UTC and is observed full (5,000) by 07:15, so 06:00 is the emptiest
//      moment of the day - roughly an hour before refill. The route's own
//      comment had said so for months.
//   2. BUDGET. lib/browseBudget capped sealed at 0 ("explicitly unfunded"),
//      and the route hard-skipped whenever enforce mode was on, so it could
//      not have run even with a full tank.
//
// Consequences, invisible from the site: sealed inventory went 43h+ stale
// (median last-seen 12 days), and no sealed row had ever been written with
// the reference provenance added at 17C.10 - which is why no sealed product
// could evidence a saving under the rule tightened in 78f121d.
//
// Sealed PRICES were never the problem: sync-sealed-catalog runs daily at
// 05:00 off the pricing provider and costs no eBay quota at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const crons = JSON.parse(read("vercel.json")).crons ?? [];
const sealed = crons.filter((c) => c.path.startsWith("/api/refresh-sealed-deals"));

test("1. the sealed scan runs AFTER the daily quota reset, not before it", () => {
  assert.equal(sealed.length, 1, "exactly one sealed listing cron");
  const [min, hour] = sealed[0].schedule.split(" ");
  const minutesAfterMidnightUtc = Number(hour) * 60 + Number(min);
  // reset is 07:00 UTC, observed full by 07:15
  assert.ok(minutesAfterMidnightUtc >= 7 * 60 + 15, `runs at ${sealed[0].schedule}, which is before the 07:15 refill`);
  assert.ok(minutesAfterMidnightUtc <= 9 * 60, "should run soon after the refill, while the tank is still full");
});

test("2. it is scoped to one marketplace, so a pass fits inside its funding", () => {
  // unscoped it walks all six marketplaces: ~195 products x 6 = ~1,170 calls,
  // which cannot fit a 200/day cap
  assert.match(sealed[0].path, /\?country=EBAY_[A-Z]{2}$/);
});

test("3. sealed is funded, and funded from the most redundant consumer", () => {
  const src = read("lib/browseBudget.js");
  assert.match(src, /sealed: 200/, "sealed has real capacity");
  assert.doesNotMatch(src, /sealed: 0,\s*\n\s*manual: 0,/, "the unfunded placeholder is gone");
  // the envelope is zero-sum; the US sweep gave up the 200
  assert.match(src, /SWEEP_COUNTRY_CAPS = Object\.freeze\(\{ EBAY_US: 790/);
  assert.match(src, /allocated: 2350/, "allocated discovery passes were not touched");
  assert.match(src, /verify: 450/, "verification capacity was not touched");
});

test("4. the module's own envelope assertions still hold", async () => {
  // lib/browseBudget throws on import if the caps do not add up; this proves
  // the funding change kept the envelope exact rather than just looking right
  const mod = await import("../../lib/browseBudget.js");
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(sum(mod.CONSUMER_CAPS) + 420, 5000);
  assert.equal(mod.CONSUMER_CAPS.sealed, 200);
});

test("5. the route asks for a lease sized to the run, and stops if refused", () => {
  const src = read("app/api/refresh-sealed-deals/route.js");
  // it must no longer skip merely because enforce mode is on
  assert.doesNotMatch(src, /markSkipped\("budget_unfunded"\)/);
  assert.match(src, /key: "sealed"/);
  assert.match(src, /const plannedCalls = \(watchlistRows\?\.length \?\? 0\) \* marketplaceIds\.length;/);
  assert.match(src, /if \(sealedBudget\.granted <= 0\)/, "a refused lease skips the run");
  // and the lease is taken AFTER the watchlist is known, or it could not be sized
  assert.ok(
    src.indexOf("const plannedCalls") > src.indexOf("from(\"sealed_watchlist\")"),
    "the lease must be sized from the real watchlist"
  );
});

test("6. a once-daily batch is not paced like a continuous consumer", () => {
  const src = read("lib/browseBudget.js");
  assert.match(src, /PACE_BURST = Object\.freeze\(\{[^}]*sealed: 200/);
});

test("7. sealed prices remain provider-sourced and free of the eBay quota", () => {
  // the price sync is a separate daily cron and must stay that way - it is
  // why sealed PRICES were current all along while listings were frozen
  const priceCron = crons.find((c) => c.path.startsWith("/api/sync-sealed-catalog"));
  assert.ok(priceCron, "sealed catalogue price sync still scheduled");
  const src = read("app/api/sync-sealed-catalog/route.js");
  assert.doesNotMatch(src, /searchListings|getBrowseRateLimit|acquireBrowseLease/, "price sync must not spend eBay Browse quota");
});
