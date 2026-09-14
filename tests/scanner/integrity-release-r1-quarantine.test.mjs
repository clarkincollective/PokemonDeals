// Integrity release r1 - the proposed quarantine of the 24 displayable
// collector-number conflicts, exercised OFFLINE against the reviewed row
// snapshots (scripts/remediation/integrity-r1-quarantine-manifest.json) in
// the in-memory store. Nothing here touches production.
//
// Snapshot timestamps are shifted to "one hour ago" so the freshness TTL
// does not decide the outcome; every other stored field is as reviewed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createMemoryDb } = await import(pathToFileURL(join(REPO, "tests/harness/ingestion/memoryDb.mjs")).href);
const Q = await import(pathToFileURL(join(REPO, "scripts/remediation/integrityR1Quarantine.mjs")).href);
const { isDisplayableDeal } = require(join(REPO, "lib/dealQuality.js"));
const { writeDiscoverySighting } = require(join(REPO, "lib/listingAvailability.js"));
const manifest = JSON.parse(readFileSync(join(REPO, "scripts/remediation/integrity-r1-quarantine-manifest.json"), "utf8"));

const hourAgo = () => new Date(Date.now() - 3600_000).toISOString();
function seed({ mutate } = {}) {
  const t = hourAgo();
  const deals = manifest.candidates.map((c) => ({ ...c.snapshot, source: c.snapshot.source ?? "ebay", first_seen_at: t, last_seen_at: t, exact_verified_at: c.snapshot.exact_verified_at ? t : null }));
  // an unrelated, correctly matched active deal that must never be touched
  deals.push({ ...deals[0], id: 999001, listing_id: "v1|999001|0", title: "Deoxys VMAX GG45/GG70 SWSH: Crown Zenith: Galarian Gallery Holo", listing_url: "https://www.ebay.com/itm/999001", affiliate_url: "https://www.ebay.com/itm/999001" });
  const card_catalog = [...new Map(manifest.candidates.map((c) => [c.storedIdentity.cardTcgplayerId, { tcgplayer_id: c.storedIdentity.cardTcgplayerId, card_number: c.storedIdentity.catalogueNumber }])).values()];
  if (mutate) mutate(deals);
  return createMemoryDb({ deals, card_catalog });
}
const row = (db, id) => db.tables.deals.find((r) => Number(r.id) === Number(id));
const HIGH = manifest.candidates.filter((c) => c.confidence === "high").map((c) => c.dealId);

test("IRQ-1. manifest: 24 reviewed candidates, 23 high-confidence with guarded mutation + prior values, 37907 held for review", () => {
  assert.equal(manifest.candidates.length, 24);
  assert.equal(HIGH.length, 23);
  assert.equal(manifest.expectedAffectedRows, 23);
  assert.deepEqual(manifest.excludedUncertain, [37907]);
  for (const c of manifest.candidates) {
    assert.ok(c.dealId && c.ebayListingId && c.marketplace && c.title && c.storedIdentity.catalogueNumber && c.evidence, `candidate ${c.dealId} complete`);
    assert.equal(c.prior.is_active, true);
    assert.equal(c.prior.disqualified_reason, null);
    if (c.confidence === "high") {
      assert.deepEqual(c.proposedMutation.set, { disqualified_reason: "identity:collector_number_conflict" });
      assert.equal(c.proposedMutation.guard.id, c.dealId);
    } else assert.equal(c.proposedMutation, null);
  }
});

test("IRQ-2. before quarantine every candidate is displayable under the release gate (the new guards alone do not hide them)", () => {
  const db = seed();
  for (const c of manifest.candidates) assert.equal(isDisplayableDeal(row(db, c.dealId)), true, `deal ${c.dealId}`);
});

test("IRQ-3. dry-run plan: 23 quarantine, 1 review, 0 skip; planning writes nothing", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  assert.equal(plan.filter((p) => p.decision === "quarantine").length, 23);
  assert.deepEqual(plan.filter((p) => p.decision === "review").map((p) => p.dealId), [37907]);
  assert.equal(plan.filter((p) => p.decision === "skip").length, 0);
  assert.equal(db.writes.length, 0);
});

test("IRQ-4. apply refuses a wrong --confirm and writes nothing; the right count quarantines exactly 23 rows and nothing else", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  await assert.rejects(() => Q.applyQuarantine(db, plan, { confirm: 24 }), /does not match/);
  assert.equal(db.writes.length, 0);
  const dir = mkdtempSync(join(tmpdir(), "irq-"));
  const out = await Q.applyQuarantine(db, plan, { confirm: 23, priorOut: join(dir, "prior.json") });
  assert.equal(out.written, 23);
  assert.ok(existsSync(join(dir, "prior.json")));
  assert.equal(db.writes.length, 23);
  for (const w of db.writes) assert.deepEqual(Object.keys(w.values), ["disqualified_reason"], "only the exclusion column changes");
  for (const id of HIGH) {
    const r = row(db, id);
    assert.equal(r.disqualified_reason, "identity:collector_number_conflict");
    assert.equal(r.is_active, true, "is_active untouched");
    assert.equal(isDisplayableDeal(r), false, `deal ${id} hidden`);
  }
  assert.equal(isDisplayableDeal(row(db, 37907)), true, "uncertain row untouched (owner review)");
  assert.equal(row(db, 999001).disqualified_reason ?? null, null, "unrelated row untouched");
});

test("IRQ-5. a later scanner sighting of a quarantined listing does not re-publish it", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  await Q.applyQuarantine(db, plan, { confirm: 23 });
  const r = row(db, 37357);
  const { outcome } = await writeDiscoverySighting(db, {
    source: "ebay", marketplace: r.marketplace, listing_id: r.listing_id, title: r.title, watchlist_id: r.watchlist_id,
    market_price: r.market_price, discount_pct: r.discount_pct, is_active: true, last_seen_at: new Date().toISOString(),
  });
  assert.equal(outcome, "updated");
  assert.equal(row(db, 37357).disqualified_reason, "identity:collector_number_conflict");
  assert.equal(isDisplayableDeal(row(db, 37357)), false);
});

test("IRQ-6. guards: a row that changed since review is skipped at plan time, and a row changed between plan and apply is not written", async () => {
  const changed = seed({ mutate: (deals) => { deals.find((d) => d.id === 33696).card_tcgplayer_id = "someone-fixed-it"; } });
  const plan = await Q.planQuarantine(changed, manifest);
  assert.match(plan.find((p) => p.dealId === 33696).why, /card_tcgplayer_id/);
  const db = seed();
  const plan2 = await Q.planQuarantine(db, manifest);
  row(db, 34031).disqualified_reason = "availability:sold"; // verifier retired it meanwhile
  const out = await Q.applyQuarantine(db, plan2, { confirm: 23 });
  assert.equal(out.written, 22);
  assert.equal(row(db, 34031).disqualified_reason, "availability:sold", "never overwrites a newer reason");
});

test("IRQ-7. rollback restores the saved prior value only where the quarantine reason is still present; is_active untouched", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  const { prior } = await Q.applyQuarantine(db, plan, { confirm: 23 });
  row(db, 37743).disqualified_reason = "availability:sold"; // changed after quarantine
  row(db, 37752).is_active = false; // freshness TTL retired it after quarantine
  await assert.rejects(() => Q.rollbackQuarantine(db, prior, { confirm: 1 }), /does not match/);
  const out = await Q.rollbackQuarantine(db, prior, { confirm: 23 });
  assert.equal(out.restored, 22);
  assert.equal(row(db, 37743).disqualified_reason, "availability:sold");
  assert.equal(row(db, 37752).disqualified_reason, null);
  assert.equal(row(db, 37752).is_active, false, "rollback never reactivates");
  assert.equal(isDisplayableDeal(row(db, 37357)), true, "a still-active row returns to its pre-quarantine state");
});
