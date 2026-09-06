// P0.3.2 - external feed quota efficiency + redundant re-verification.
//
// Root cause (proven from production): ingest-feed only skipped a board
// candidate before its Browse item lookup if that candidate already had a
// FRESH `deals` row. ~99% of external candidates are rejected and never
// write a `deals` row, so the RECENT_VERIFY_HOURS protection never
// applied to them - the same rejected GB/US listings were re-Browsed
// every hourly cycle, hit the per-cycle cap of 40, and starved
// genuinely-new candidates.
//
// Fix: lib/ingestFeedQueue.js also consults discovery_events
// (source='external', logs EVERY verified candidate whatever the
// outcome). These tests exercise that pure logic with fixtures.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { candidateKey, partitionCandidates, allocateVerifyBudget } from "../../lib/ingestFeedQueue.js";
import { discoveryListingKey } from "../../lib/discoveryLog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const H = 3600 * 1000;
const NOW = Date.now();
const CUT = NOW - 20 * H; // RECENT_VERIFY_HOURS = 20

const item = (marketplace, ebayItemId) => ({ marketplace, ebayItemId, sourceUrl: "x" });
const part = (feedItems, externalHistory = new Map(), freshDealKeys = new Set()) =>
  partitionCandidates({ feedItems, externalHistory, freshDealKeys, recentCutoffMs: CUT });

// ===== 1. recently REJECTED external listing is skipped =====
test("1. a candidate rejected 2h ago (inside the window) is skipped before Browse", () => {
  const p = part([item("EBAY_GB", "111")], new Map([["EBAY_GB:111", NOW - 2 * H]]));
  assert.equal(p.skippedRecentlyVerified, 1);
  assert.equal(p.neverSeen.length + p.dueRecheck.length, 0);
});

// ===== 2. recently ACCEPTED external listing is skipped =====
test("2. a candidate accepted 5h ago is skipped the same way (history is outcome-agnostic)", () => {
  // accepted candidates ALSO get a discovery_events row (became_deal=true);
  // and a fresh deals row - either path skips it.
  const byEvent = part([item("EBAY_US", "222")], new Map([["EBAY_US:222", NOW - 5 * H]]));
  assert.equal(byEvent.skippedRecentlyVerified, 1);
  const byDeal = part([item("EBAY_US", "222")], new Map(), new Set(["EBAY_US:222"]));
  assert.equal(byDeal.skippedFreshDeal, 1);
});

// ===== 3. a never-before-seen listing IS verified =====
test("3. a never-seen candidate goes to the neverSeen verify tier", () => {
  const p = part([item("EBAY_GB", "333")]);
  assert.deepEqual(p.neverSeen.map((x) => x._key), ["EBAY_GB:333"]);
  assert.equal(p.dueRecheck.length, 0);
  assert.equal(p.skippedRecentlyVerified, 0);
});

// ===== 4. eligible again after RECENT_VERIFY_HOURS (no blacklist) =====
test("4. a candidate last verified 21h ago (outside the window) becomes a due-recheck, not a permanent skip", () => {
  const p = part([item("EBAY_GB", "444")], new Map([["EBAY_GB:444", NOW - 21 * H]]));
  assert.equal(p.skippedRecentlyVerified, 0);
  assert.deepEqual(p.dueRecheck.map((x) => x._key), ["EBAY_GB:444"]);
});

test("4b. exactly at the boundary is treated as expired (re-eligible)", () => {
  const p = part([item("EBAY_GB", "445")], new Map([["EBAY_GB:445", CUT]])); // not strictly > cutoff
  assert.equal(p.skippedRecentlyVerified, 0);
  assert.equal(p.dueRecheck.length, 1);
});

// ===== 5. alternate key formatting deduplicates =====
test("5. raw legacy id, v1|<id>|0, and MKT:<id> all resolve to ONE canonical key", () => {
  assert.equal(candidateKey(item("EBAY_GB", "377442529729")), "EBAY_GB:377442529729");
  assert.equal(candidateKey(item("EBAY_GB", "v1|377442529729|0")), "EBAY_GB:377442529729");
  assert.equal(discoveryListingKey("EBAY_GB", "v1|377442529729|0"), "EBAY_GB:377442529729");
  // a scanner-format history key still matches a bare-legacy feed candidate
  const p = part(
    [item("EBAY_GB", "377442529729")],
    new Map([[discoveryListingKey("EBAY_GB", "v1|377442529729|0"), NOW - 1 * H]])
  );
  assert.equal(p.skippedRecentlyVerified, 1);
});

// ===== 6. same listing / same marketplace can't occupy the queue twice =====
test("6. the same canonical listing appearing twice in one board is deduped in-batch", () => {
  const p = part([item("EBAY_US", "999"), item("EBAY_US", "v1|999|0"), item("EBAY_US", "999")]);
  assert.equal(p.dedupedInBatch, 2);
  assert.equal(p.neverSeen.length, 1);
});

// ===== 7. distinct listings stay distinct =====
test("7. two different item ids (and the same id on two marketplaces) stay separate", () => {
  const p = part([item("EBAY_GB", "1"), item("EBAY_US", "2"), item("EBAY_GB", "3"), item("EBAY_US", "1")]);
  assert.equal(p.dedupedInBatch, 0);
  assert.equal(p.neverSeen.length, 4);
});

// ===== 8. cap applies AFTER cheap dedupe / recent-verify filtering =====
test("8. the cap is applied to the SURVIVORS, not the raw board", () => {
  const feed = [];
  for (let i = 0; i < 20; i++) feed.push(item("EBAY_GB", "r" + i)); // recently rejected
  for (let i = 0; i < 25; i++) feed.push(item("EBAY_GB", "n" + i)); // never seen
  const hist = new Map(feed.slice(0, 20).map((it) => [candidateKey(it), NOW - 1 * H]));
  const p = part(feed, hist);
  assert.equal(p.skippedRecentlyVerified, 20);
  assert.equal(p.neverSeen.length, 25);
  const alloc = allocateVerifyBudget({ neverSeen: p.neverSeen, dueRecheck: p.dueRecheck, budget: 40 });
  const queued = [...alloc.values()].reduce((s, a) => s + a.length, 0);
  assert.equal(queued, 25, "all 25 fresh candidates fit - the 20 recent rejects never consumed a slot");
});

// ===== 9/10. quota floor protects the primary scanner & does zero Browse work =====
test("9. ingest-feed's quota floor is HIGHER than the recurring scanner floors, so external yields FIRST", () => {
  const ingest = read("app/api/ingest-feed/route.js");
  assert.match(ingest, /RATE_LIMIT_FLOOR\s*=\s*800/);
  assert.match(ingest, /rl\.remaining\s*<\s*RATE_LIMIT_FLOOR/);
  const refresh = read("app/api/refresh-deals/route.js");
  const m = refresh.match(/RATE_LIMIT_FLOORS\s*=\s*\{([^}]+)\}/);
  assert.ok(m, "refresh-deals must have tier-aware RATE_LIMIT_FLOORS");
  const floors = Object.fromEntries(
    [...m[1].matchAll(/(\w+)\s*:\s*(\d+)/g)].map((x) => [x[1], Number(x[2])])
  );
  // the two frequent scanner lanes back off only well below ingest-feed's 800
  assert.ok(floors.sweep < 800, `sweep floor ${floors.sweep} must be < ingest 800`);
  assert.ok(floors.priority < 800, `priority floor ${floors.priority} must be < ingest 800`);
});

test("10. the quota-floor skip returns before any Browse item lookup and touches no timestamps", () => {
  const ingest = read("app/api/ingest-feed/route.js");
  const floorBlock = ingest.slice(
    ingest.indexOf("rl.remaining < RATE_LIMIT_FLOOR"),
    ingest.indexOf("const db = supabaseAdmin();")
  );
  assert.doesNotMatch(floorBlock, /getItemsByLegacyIds|\.update\(|last_seen_at|exact_verified_at/);
  assert.match(floorBlock, /return Response\.json\(\{\s*\n?\s*skipped: "ebay_rate_limited"/);
  // and it still records the skip for observability
  assert.match(floorBlock, /recordIngestRun\(.*quotaFloorSkipped: true/s);
});

// ===== 11. fresh candidates are not starved behind recent rejects =====
test("11. fresh never-seen candidates jump AHEAD of due-rechecks and recent rejects", () => {
  const feed = [
    ...Array.from({ length: 5 }, (_, i) => item("EBAY_GB", "old" + i)), // due recheck
    ...Array.from({ length: 5 }, (_, i) => item("EBAY_GB", "new" + i)), // never seen
  ];
  const hist = new Map(feed.slice(0, 5).map((it) => [candidateKey(it), NOW - 40 * H]));
  const p = part(feed, hist);
  const alloc = allocateVerifyBudget({ neverSeen: p.neverSeen, dueRecheck: p.dueRecheck, budget: 6 });
  const queued = [...alloc.values()].flat().map((x) => x._key);
  // all 5 never-seen first, then 1 recheck
  assert.equal(queued.filter((k) => k.includes("new")).length, 5);
  assert.equal(queued.filter((k) => k.includes("old")).length, 1);
});

test("11b. one marketplace cannot monopolise the cap (round-robin allocation)", () => {
  const feed = [
    ...Array.from({ length: 60 }, (_, i) => item("EBAY_GB", "g" + i)),
    ...Array.from({ length: 15 }, (_, i) => item("EBAY_US", "u" + i)),
    ...Array.from({ length: 8 }, (_, i) => item("EBAY_CA", "c" + i)),
  ];
  const p = part(feed);
  const alloc = allocateVerifyBudget({ neverSeen: p.neverSeen, dueRecheck: p.dueRecheck, budget: 40 });
  assert.ok(alloc.get("EBAY_US").length >= 12, `US should get a fair share, got ${alloc.get("EBAY_US").length}`);
  assert.ok(alloc.get("EBAY_CA").length === 8, `CA (only 8 available) should get all 8, got ${alloc.get("EBAY_CA").length}`);
  assert.ok(alloc.get("EBAY_GB").length <= 20, `GB should not monopolise, got ${alloc.get("EBAY_GB").length}`);
  const total = [...alloc.values()].reduce((s, a) => s + a.length, 0);
  assert.equal(total, 40);
});

// ===== 12. valid external deals still ingest =====
test("12. a genuinely-new, never-verified candidate is queued for verification (ingest path intact)", () => {
  const p = part([item("EBAY_GB", "brandnew1"), item("EBAY_AU", "brandnew2")]);
  const alloc = allocateVerifyBudget({ neverSeen: p.neverSeen, dueRecheck: p.dueRecheck, budget: 40 });
  assert.equal([...alloc.values()].flat().length, 2);
  assert.equal(p.skippedRecentlyVerified, 0);
  assert.equal(p.skippedFreshDeal, 0);
});

test("12b. the route still runs the full verify+match+upsert pipeline for queued items", () => {
  const ingest = read("app/api/ingest-feed/route.js");
  // the pipeline the queued candidates flow through is unchanged
  for (const gate of ["qualifiesAsTradingCard(listing)", "isTrustworthyListing(listing)", "matchCatalog(listing, catalogIndex)", "languageCompatible(listingLang, match.language)", "db.from(\"deals\").upsert("]) {
    assert.ok(ingest.includes(gate), `pipeline gate missing: ${gate}`);
  }
  assert.match(ingest, /partitionCandidates\(/);
  assert.match(ingest, /allocateVerifyBudget\(/);
  assert.match(ingest, /from\("discovery_events"\)[\s\S]{0,120}\.eq\("source", "external"\)/);
});
