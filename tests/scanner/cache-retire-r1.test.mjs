// cache-retire-r1 - propagation of confirmed retirements and quarantines to
// the cached list, All deals, set and species surfaces. Unit rules for the
// tag plan and the remediation queue, plus the offline scenario
// (tests/harness/cache/retirementScenario.mjs): the real verify-deals and
// sweep-stale-deals handlers and real lib/deals.js loaders against an
// in-memory database and a tag-aware model of Next's cache.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const L = require(join(REPO, "lib/listingAvailability.js"));
const { createMemoryDb } = await import(pathToFileURL(join(REPO, "tests/harness/ingestion/memoryDb.mjs")).href);
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\/[^\n]*/g, "");

test("CR-1. surface plan: lists, the row's All deals chunk, set and species, deduplicated per invocation", () => {
  const rows = [
    { id: 38057, marketplace: "EBAY_US", card_name: "Unown (M)", card_set: "EX Unseen Forces" },
    { id: 38058, marketplace: "EBAY_US", card_name: "Unown (R)", card_set: "EX Unseen Forces" },
    { id: 9, marketplace: "EBAY_GB", card_name: "Charizard ex", card_set: "SV: Obsidian Flames" },
  ];
  const plan = L.surfaceInvalidationPlan(rows);
  assert.deepEqual(plan.tags, ["deal-lists", "all-deals:EBAY_US", "set-deals:ex-unseen-forces", "species-deals:unown", "all-deals:EBAY_GB", "set-deals:sv-obsidian-flames", "species-deals:charizard"]);
  assert.deepEqual([plan.sets, plan.species, plan.marketplaces, plan.deals], [2, 2, 2, 0]);
  assert.deepEqual(L.surfaceInvalidationPlan(rows, { dealPages: true }).tags.filter((t) => t.startsWith("deal-detail:")), ["deal-detail:38057", "deal-detail:38058", "deal-detail:9"]);
  assert.deepEqual(L.surfaceInvalidationPlan([]).tags, [], "nothing changed -> nothing expired");
  assert.ok(!L.surfaceInvalidationPlan(rows, { dealPages: true }).tags.some((t) => t.startsWith("card-offers:")), "card pages are not part of the surface plan");
  // the same normalisation as the loaders' own tags
  assert.equal(L.setDealsTag("EX Unseen Forces"), "set-deals:ex-unseen-forces");
  assert.equal(L.speciesDealsTag("Unown"), "species-deals:unown");
  assert.equal(L.setDealsTag(""), null);
  assert.equal(L.allDealsTag(null), null);
  // the existing card / deal plan is unchanged
  assert.deepEqual(L.retirementInvalidationPlan([{ id: 1, watchlist_id: 7, card_tcgplayer_id: "9" }]).tags, ["card-offers:w:7", "card-offers:t:9", "deal-detail:1"]);
  assert.match(L.RETIRE_RETURN_COLS ?? read("lib/listingAvailability.js"), /marketplace, card_name, card_set/);
});

test("CR-2. remediation queue: insert-only rows, drained once by the cron, only queue rows deleted, never throws", async () => {
  const db = createMemoryDb({ catalog_snapshot: [{ kind: "digest_state", data: {}, updated_at: "2026-09-01T00:00:00Z" }] });
  assert.deepEqual(await L.queueCacheInvalidation(db, ["deal-lists", "deal-lists", "set-deals:x", null], { source: "t" }), { queued: 2, error: null });
  await L.queueCacheInvalidation(db, ["set-deals:x", "deal-detail:5"], { source: "t" });
  assert.deepEqual(await L.queueCacheInvalidation(db, []), { queued: 0, error: null });
  const expired = [];
  const out = await L.drainCacheInvalidationQueue(db, (t, p) => expired.push([t, p]));
  assert.deepEqual(expired.map((e) => e[0]).sort(), ["deal-detail:5", "deal-lists", "set-deals:x"], "each queued tag expired once");
  for (const [, p] of expired) assert.deepEqual(p, { expire: 0 });
  assert.deepEqual([out.rows, out.expired, out.acknowledged, out.retained, out.errors], [2, 3, 2, 0, []]);
  assert.deepEqual(db.tables.catalog_snapshot.map((r) => r.kind), ["digest_state"], "only queue rows removed");
  assert.deepEqual(await L.drainCacheInvalidationQueue(db, () => {}), { rows: 0, expired: 0, acknowledged: 0, retained: 0, errors: [] });
  const broken = { from: () => { throw new Error("db down"); } };
  assert.deepEqual(await L.queueCacheInvalidation(broken, ["a"]), { queued: 0, error: "db down" });
  assert.deepEqual((await L.drainCacheInvalidationQueue(broken, () => {})).errors, ["db down"]);
});

let scenario = null;
function runScenario() {
  if (scenario) return scenario;
  const r = spawnSync(process.execPath, ["--no-warnings", "--import", "./tests/harness/cache/register.mjs", "tests/harness/cache/retirementScenario.mjs"], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `scenario failed: ${r.stderr}`);
  scenario = JSON.parse(r.stdout);
  return scenario;
}

test("CR-3. a database change alone does not reach cached pages (the 38057 gap)", () => {
  const [t0, dbOnly] = runScenario().steps;
  assert.ok(t0.setPage.offers.includes("Unown (Z)") && t0.allDeals.offers.includes("dbOnly"));
  assert.equal(dbOnly.setPage.regenerated, false);
  assert.ok(dbOnly.setPage.offers.includes("Unown (Z)"), "set page still serves the hidden row");
  assert.ok(dbOnly.allDeals.offers.includes("dbOnly"), "All deals still serves the hidden row");
});

test("CR-4. a confirmed SOLD retirement removes the offer from the set page and All deals; UNKNOWN and a failed write change nothing", () => {
  const s = runScenario();
  const v = s.steps[2];
  assert.deepEqual(v.verify.checked.find((c) => c[0] === "sold"), ["sold", "SOLD"]);
  assert.deepEqual(v.verify.checked.find((c) => c[0] === "unknown"), ["unknown", "UNKNOWN"]);
  assert.deepEqual(v.verify.checked.find((c) => c[0] === "failedWrite"), ["failedWrite", "SOLD"]);
  assert.equal(v.setPage.regenerated, true);
  assert.ok(!v.setPage.offers.includes("Unown (M)") && !v.allDeals.offers.includes("sold"), "sold offer gone");
  for (const [setName, key] of [["Unown (A)", "unknown"], ["Unown (B)", "failedWrite"], ["Unown (R)", "sameSet"], ["Unown (K)", "quarantined"]]) {
    assert.ok(v.setPage.offers.includes(setName), `${key} still on the set page`);
    assert.ok(v.allDeals.offers.includes(key), `${key} still in All deals`);
  }
  assert.ok(v.allDeals.offers.includes("otherSet"), "unrelated listing present");
  assert.deepEqual(v.verify.tags, ["card-offers:w:14001", "card-offers:t:90180", "deal-detail:1", "deal-lists", "all-deals:EBAY_US", "set-deals:ex-unseen-forces", "species-deals:unown"]);
  assert.ok(!v.verify.tags.some((t) => /:(5|6)$|14005|14006|90168|90169|EBAY_GB/.test(t)), "no tags from the UNKNOWN or failed-write rows");
  assert.deepEqual(s.rows.unknown, { is_active: true, disqualified_reason: null });
  assert.deepEqual(s.rows.failedWrite, { is_active: true, disqualified_reason: null });
  assert.deepEqual(s.rows.sold, { is_active: false, disqualified_reason: "availability:sold" });
});

test("CR-5. a script quarantine is queued, stays visible until the cron drains it, then disappears; unrelated listings stay", () => {
  const s = runScenario();
  const [, , , queued, drained] = s.steps;
  assert.deepEqual(queued.queued, { queued: 5, error: null });
  assert.ok(queued.setPage.offers.includes("Unown (K)") && queued.allDeals.offers.includes("quarantined"), "no instant effect from a script");
  assert.deepEqual(drained.sweep.queuedInvalidation, { rows: 1, expired: 5, acknowledged: 1, retained: 0, errors: [] });
  assert.equal(drained.sweep.invalidation.expired, 0, "no ended auctions in this run - the drain still ran");
  assert.deepEqual(drained.sweep.tags, ["deal-lists", "all-deals:EBAY_CA", "set-deals:ex-unseen-forces", "species-deals:unown", "deal-detail:3"]);
  assert.ok(!drained.setPage.offers.includes("Unown (K)") && !drained.allDeals.offers.includes("quarantined"));
  assert.deepEqual(drained.setPage.offers, ["Unown (A)", "Unown (B)", "Unown (R)"]);
  assert.deepEqual(drained.allDeals.offers, ["failedWrite", "otherSet", "sameSet", "unknown"]);
  assert.equal(s.queueLeft, 0);
  assert.equal(s.rows.quarantined.disqualified_reason, "identity:collector_number_conflict", "the quarantine reason is preserved");
});

test("CR-6. sweep-stale-deals propagates a confirmed ended auction but not a freshness-TTL expiry; invalidation makes no provider request", () => {
  const s = runScenario();
  const step = s.steps[5];
  assert.equal(step.sweep.results.endedAuctions.count, 1);
  assert.ok(step.sweep.results.staleMid.count + step.sweep.results.staleHigh.count + step.sweep.results.staleLow.count >= 1);
  assert.deepEqual(step.sweep.tags, ["deal-lists", "all-deals:EBAY_AU", "set-deals:ex-unseen-forces", "species-deals:unown", "deal-detail:8"]);
  assert.ok(!step.sweep.tags.some((t) => t.includes("jungle") || t.includes("EBAY_IT") || t.includes("snorlax")), "no tags for the freshness expiry");
  assert.deepEqual(s.providerCalls, { getListingSnapshot: 6 }, "only verify-deals' own eBay checks; no pricing or other provider call");
});

test("CR-7. wiring: tagged loaders, one merged expiry per route, no deal-page pools, no purge endpoint", () => {
  const deals = code("lib/deals.js");
  for (const [loader, tag] of [
    ['\\["homepage-flagship"\\]', "DEAL_LISTS_TAG"],
    ['\\["best-finds"\\]', "DEAL_LISTS_TAG"],
    ['\\["auctions-ending-soon"\\]', "DEAL_LISTS_TAG"],
    ['\\["deals-pool-v4"\\]', "DEAL_LISTS_TAG"],
    ['\\["fresh-finds"\\]', "DEAL_LISTS_TAG"],
    ['\\["homepage-lanes-v4"\\]', "DEAL_LISTS_TAG"],
    ['\\["all-deals-inventory-v2"\\]', "allDealsTag\\(marketplace\\)"],
    ['\\["species-catalog-v3"\\]', "speciesDealsTag\\(speciesName\\)"],
    ['\\["set-catalog-v3"\\]', "setDealsTag\\(setName\\)"],
    ['\\["species-deal-stats"\\]', "speciesDealsTag\\(speciesName\\)"],
    ['\\["species-deals-page"\\]', "speciesDealsTag\\(params\\?\\.speciesName\\)"],
    ['\\["set-deals-page"\\]', "setDealsTag\\(params\\?\\.setName\\)"],
  ]) {
    assert.match(deals, new RegExp(`${loader}[\\s\\S]{0,160}${tag}`), loader);
  }
  assert.match(deals, /\["deals-page"\], \{\s*revalidate: POOL_REVALIDATE_SECONDS,\s*tags,/);
  // related deals on deal pages stay off the shared list tag (an active deal page re-render requests pricing)
  const related = deals.slice(deals.indexOf("export const fetchRelatedActiveDeals"), deals.indexOf("export const fetchRelatedActiveDeals") + 300);
  assert.doesNotMatch(related, /DEAL_LISTS_TAG|tags:/);
  // cache windows unchanged
  assert.match(deals, /const POOL_REVALIDATE_SECONDS = 180;/);
  assert.match(deals, /const CARD_HUB_REVALIDATE_SECONDS = 900;/);
  for (const f of ["app/api/verify-deals/route.js", "app/api/ingest-feed/route.js"]) {
    const src = code(f);
    assert.equal((src.match(/expireTags\(revalidateTag,/g) ?? []).length, 1, f);
    assert.match(src, /surfaceInvalidationPlan\(retiredRows\)/, f);
  }
  const sweep = code("app/api/sweep-stale-deals/route.js");
  assert.match(sweep, /"endedAuctions",[\s\S]{0,200}\{ confirmed: true \}/);
  assert.equal((sweep.match(/confirmed: true/g) ?? []).length, 1, "only ended auctions are confirmed");
  assert.match(sweep, /surfaceInvalidationPlan\(confirmedRetired, \{ dealPages: true \}\)/);
  assert.match(sweep, /drainCacheInvalidationQueue\(db, revalidateTag\)/);
  for (const f of ["lib/deals.js", "app/api/verify-deals/route.js", "app/api/ingest-feed/route.js", "app/api/sweep-stale-deals/route.js", "lib/listingAvailability.js"]) {
    assert.doesNotMatch(code(f), /revalidatePath\(/, `${f}: no path purge`);
  }
  const script = code("scripts/remediation/unownIdentityQuarantine.mjs");
  assert.match(script, /const writtenIds = out\.results\.filter\(\(r\) => r\.updated > 0\)/);
  assert.match(script, /queueSurfaceInvalidation\(db, manifest, writtenIds, "unown-identity-quarantine:apply"\)/);
});

test("CR-8. queue acknowledgement: failed expiry keeps the row; rows queued during a drain survive; a failed delete keeps the row", async () => {
  // a failed expiry for one tag keeps every row carrying that tag, and only those
  const db = createMemoryDb({ catalog_snapshot: [] });
  await L.queueCacheInvalidation(db, ["deal-lists", "set-deals:a"], { source: "t", now: "2026-09-15T05:00:00.000Z" });
  await L.queueCacheInvalidation(db, ["set-deals:b"], { source: "t", now: "2026-09-15T05:00:01.000Z" });
  const first = await L.drainCacheInvalidationQueue(db, (t) => { if (t === "set-deals:a") throw new Error("expire failed"); });
  assert.deepEqual([first.rows, first.expired, first.acknowledged, first.retained], [2, 2, 1, 1]);
  assert.match(first.errors.join(" "), /set-deals:a: expire failed/);
  const left = db.tables.catalog_snapshot.map((r) => r.data.tags);
  assert.deepEqual(left, [["deal-lists", "set-deals:a"]], "the row with the failed tag is retained for the next run");
  const retry = [];
  const second = await L.drainCacheInvalidationQueue(db, (t) => retry.push(t));
  assert.deepEqual(retry.sort(), ["deal-lists", "set-deals:a"]);
  assert.deepEqual([second.acknowledged, second.retained], [1, 0]);

  // a row inserted after the drain read the queue is not deleted by that drain
  const db2 = createMemoryDb({ catalog_snapshot: [] });
  await L.queueCacheInvalidation(db2, ["set-deals:c"], { source: "t", now: "2026-09-15T05:01:00.000Z" });
  const racing = {
    from(name) {
      const chain = db2.from(name);
      const realDelete = chain.delete.bind(chain);
      chain.delete = () => {
        // another script enqueues between the drain's read and its delete
        db2.tables.catalog_snapshot.push({ kind: "cache_invalidation:2026-09-15T05:01:30.000Z:late", data: { v: 1, tags: ["set-deals:late"] }, updated_at: "2026-09-15T05:01:30.000Z" });
        return realDelete();
      };
      return chain;
    },
  };
  const expired = [];
  const out = await L.drainCacheInvalidationQueue(racing, (t) => expired.push(t));
  assert.deepEqual(expired, ["set-deals:c"]);
  assert.equal(out.acknowledged, 1);
  assert.deepEqual(db2.tables.catalog_snapshot.map((r) => r.data.tags), [["set-deals:late"]], "the late row survives for the next run");

  // a failed delete keeps the rows (their tags are expired again next run)
  const db3 = createMemoryDb({ catalog_snapshot: [] });
  await L.queueCacheInvalidation(db3, ["set-deals:d"], { source: "t" });
  const noDelete = { from(name) { const c = db3.from(name); c.delete = () => ({ in: async () => ({ error: { message: "delete failed" } }) }); return c; } };
  const out3 = await L.drainCacheInvalidationQueue(noDelete, () => {});
  assert.deepEqual([out3.expired, out3.acknowledged, out3.retained], [1, 0, 1]);
  assert.equal(db3.tables.catalog_snapshot.length, 1);
});

test("CR-9. the drain runs on every sweep, and a failed enqueue is reported by the script, not presented as queued", async () => {
  // top level of the handler (two-space indent), after the retirement steps, not inside any condition
  const sweep = read("app/api/sweep-stale-deals/route.js").split("\r\n").join("\n");
  assert.match(sweep, /\n  const queued = await drainCacheInvalidationQueue\(db, revalidateTag\);\n/);
  assert.ok(sweep.indexOf("const queued = await drainCacheInvalidationQueue") > sweep.indexOf("results.staleLow = await deactivate"));
  const Q = await import(pathToFileURL(join(REPO, "scripts/remediation/unownIdentityQuarantine.mjs")).href);
  const manifest = JSON.parse(read("scripts/remediation/unown-identity-quarantine-manifest.json"));
  const broken = { from: () => ({ insert: async () => ({ error: { message: "insert denied" } }) }) };
  assert.deepEqual(await Q.queueSurfaceInvalidation(broken, manifest, [38057], "t"), { queued: 0, error: "insert denied" });
  const script = code("scripts/remediation/unownIdentityQuarantine.mjs");
  assert.match(script, /if \(writtenIds\.length && !cacheInvalidation\?\.queued\) \{\s*console\.error\(CACHE_NOT_QUEUED\(cacheInvalidation\?\.error\)\);\s*process\.exit\(3\);/);
  assert.match(script, /if \(restoredIds\.length && !out\.cacheInvalidation\?\.queued\) \{\s*console\.error\(CACHE_NOT_QUEUED\(out\.cacheInvalidation\?\.error\)\);\s*process\.exit\(3\);/);
  assert.match(read("scripts/remediation/unownIdentityQuarantine.mjs"), /cache invalidation was NOT queued/);
});
