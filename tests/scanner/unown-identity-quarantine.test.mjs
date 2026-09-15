// unown-identity-r1 - the owner-approved single-row quarantine of deal 38057
// ("Unown R/28" stored as Unown (M), catalogue M/28), exercised OFFLINE in
// the in-memory store. Nothing here touches production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createMemoryDb } = await import(pathToFileURL(join(REPO, "tests/harness/ingestion/memoryDb.mjs")).href);
const Q = await import(pathToFileURL(join(REPO, "scripts/remediation/unownIdentityQuarantine.mjs")).href);
const manifest = JSON.parse(readFileSync(join(REPO, "scripts/remediation/unown-identity-quarantine-manifest.json"), "utf8"));
const C = manifest.candidates[0];

const reviewed = () => ({
  id: 38057,
  listing_id: C.ebayListingId,
  marketplace: "EBAY_US",
  source: "ebay",
  title: C.title,
  is_active: true,
  disqualified_reason: null,
  watchlist_id: 14406,
  card_tcgplayer_id: "90180",
  card_name: "Unown (M)",
  card_set: "EX Unseen Forces",
  market_price: 56.99,
  discount_pct: 0.1198,
});
function seed(mutate) {
  const deals = [
    reviewed(),
    // a correctly matched Unown row that must never be touched
    { ...reviewed(), id: 999002, listing_id: "v1|999002|0", title: "Unown M/28 Holo Rare Unseen Forces NM" },
  ];
  if (mutate) mutate(deals[0]);
  return createMemoryDb({ deals, card_catalog: [{ tcgplayer_id: "90180", card_number: "M/28" }] });
}
const noDisplay = { isDisplayableDeal: () => true };

test("UIQ-1. manifest: exactly one approved row, reason and guard as reviewed", () => {
  assert.equal(manifest.candidates.length, 1);
  assert.equal(manifest.expectedAffectedRows, 1);
  assert.equal(C.dealId, 38057);
  assert.deepEqual(C.proposedMutation.set, { disqualified_reason: "identity:collector_number_conflict" });
  for (const k of ["id", "listing_id", "marketplace", "card_tcgplayer_id", "watchlist_id", "title"]) assert.ok(C.proposedMutation.guard[k] != null, k);
  assert.equal(C.proposedMutation.guard.disqualified_reason, null);
  assert.deepEqual(Q.titleLetterPairs(C.title, "28"), ["R"]);
});

test("UIQ-2. apply writes exactly one row, only disqualified_reason; prior values captured; rollback restores", async () => {
  const db = seed();
  const before = structuredClone(db.tables.deals);
  const plan = await Q.planQuarantine(db, manifest, noDisplay);
  assert.deepEqual(plan.map((p) => p.decision), ["quarantine"]);
  await assert.rejects(() => Q.applyQuarantine(db, plan, { confirm: 2 }), /does not match/);
  const out = await Q.applyQuarantine(db, plan, { confirm: 1 });
  assert.equal(out.written, 1);
  assert.deepEqual(out.prior.rows, [{ dealId: 38057, ebayListingId: C.ebayListingId, title: C.title, prior_disqualified_reason: null, prior_is_active: true }]);
  const row = db.tables.deals.find((r) => r.id === 38057);
  assert.deepEqual({ ...row, disqualified_reason: null }, before[0], "nothing else on the row changed");
  assert.equal(row.disqualified_reason, "identity:collector_number_conflict");
  assert.deepEqual(db.tables.deals.find((r) => r.id === 999002), before[1], "other rows untouched");
  const rb = await Q.rollbackQuarantine(db, out.prior, { confirm: 1 });
  assert.equal(rb.restored, 1);
  assert.deepEqual(db.tables.deals, before);
});

test("UIQ-3. any change since review skips the row and writes nothing", async () => {
  const cases = {
    title: (r) => (r.title = "Unown M/28 Holo Rare Unseen Forces Pokemon Near Mint/NM"),
    identity: (r) => (r.card_tcgplayer_id = "90185"),
    watchlist: (r) => (r.watchlist_id = 14401),
    retired: (r) => (r.is_active = false),
    alreadyQuarantined: (r) => (r.disqualified_reason = "identity:visual_mismatch"),
    listing: (r) => (r.listing_id = "v1|1|0"),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const db = seed(mutate);
    const before = structuredClone(db.tables.deals);
    const plan = await Q.planQuarantine(db, manifest, noDisplay);
    assert.equal(plan[0].decision, "skip", name);
    await assert.rejects(() => Q.applyQuarantine(db, plan, { confirm: 1 }), /does not match/, name);
    assert.deepEqual(db.tables.deals, before, name);
  }
});

test("UIQ-4. the write itself is guarded: a row changed between plan and apply is not written", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest, noDisplay);
  db.tables.deals[0].title = "Unown (M) M/28 relisted";
  const out = await Q.applyQuarantine(db, plan, { confirm: 1 });
  assert.equal(out.written, 0);
  assert.equal(db.tables.deals[0].disqualified_reason, null);
});
