// SEO-4 freshness: a refresh that writes rows must hand them to the next
// visitor, not to the next cache window.
//
// The lag was structural, not a bug in any one file. /api/refresh-catalog
// rewrote catalog_snapshot every 30 minutes, but the read path caches that
// snapshot (fetchSets, unstable_cache 900s) and the set / species pages are
// ISR on top again - so a set that became deal-backed could take ~75
// minutes to appear on a site whose whole pitch is live deals. The same
// applied to /api/refresh-deals: a freshly scanned listing waited out the
// pool revalidate window.
//
// Both now expire the shared list tag after writing. The other write paths
// (ingest-feed, sweep-stale-deals, verify-deals) already did.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const ROUTES = ["app/api/refresh-catalog/route.js", "app/api/refresh-deals/route.js"];

test("1. both refresh routes expire the shared deal-lists tag", () => {
  for (const r of ROUTES) {
    const src = read(r);
    assert.match(src, /import \{ revalidateTag \} from "next\/cache";/, `${r}: imports revalidateTag`);
    assert.match(src, /DEAL_LISTS_TAG/, `${r}: uses the shared list tag`);
    assert.match(src, /revalidateTag\(DEAL_LISTS_TAG, \{ expire: 0 \}\)/, `${r}: expires now, not stale-while-revalidate`);
  }
});

test("2. a failed invalidation never fails the refresh", () => {
  // the rows are already written by this point; throwing here would turn a
  // successful scan into a 500 and, on a cron, into a retry that rescans
  for (const r of ROUTES) {
    const src = read(r);
    const idx = src.indexOf("revalidateTag(DEAL_LISTS_TAG");
    assert.ok(idx > 0, `${r}: no invalidation`);
    const around = src.slice(Math.max(0, idx - 400), idx + 400);
    assert.match(around, /try \{/, `${r}: invalidation must be guarded`);
    assert.match(around, /catch \(e\)/, `${r}: invalidation must be guarded`);
  }
});

test("3. the outcome is reported, so a run that stopped invalidating is visible", () => {
  for (const r of ROUTES) {
    const src = read(r);
    assert.match(src, /invalidated,/, `${r}: reports whether it invalidated`);
    assert.match(src, /invalidationErrors,/, `${r}: reports why it did not`);
  }
});

test("4. the deal scan only invalidates when it actually stored something", () => {
  // an empty scan changes nothing, and expiring the tag would throw away a
  // warm pool for no reason on every quiet cycle
  const src = read("app/api/refresh-deals/route.js");
  const idx = src.indexOf("revalidateTag(DEAL_LISTS_TAG");
  const before = src.slice(Math.max(0, idx - 500), idx);
  assert.match(before, /if \(dealsFound > 0\)/);
});

test("5. scanner budgets, cadence and enforcement are untouched by this", () => {
  // the owner's standing constraint: keep scanner settings, budgets,
  // enforcement, incident holds and social schedules unchanged
  const src = read("app/api/refresh-deals/route.js");
  const idx = src.indexOf("let invalidated = 0;");
  const block = src.slice(idx, src.indexOf("return Response.json", idx));
  assert.doesNotMatch(block, /searchListings|getBrowseRateLimit|budget|quota|disqualified_reason|is_active/i);
});

test("6. the catalogue refresh stays DB-only - no provider calls were added", () => {
  const src = read("app/api/refresh-catalog/route.js");
  assert.doesNotMatch(src, /searchListings|getSealedPrice|getCardPrice|fetch\(/);
});
