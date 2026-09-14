// Language-mismatch quarantine - PROPOSED, exercised OFFLINE against the
// reviewed row snapshots (scripts/remediation/language-mismatch-quarantine-
// manifest.json) in the in-memory store. Nothing here touches production.
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
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { createMemoryDb } = await imp("tests/harness/ingestion/memoryDb.mjs");
const Q = await imp("scripts/remediation/languageMismatchQuarantine.mjs");
const inv = await imp("lib/allDealsInventory.js");
const { isDisplayableDeal } = require(join(REPO, "lib/dealQuality.js"));
const { classifyListingLanguage } = require(join(REPO, "lib/dealMatching.js"));
const { writeDiscoverySighting } = require(join(REPO, "lib/listingAvailability.js"));
const manifest = JSON.parse(readFileSync(join(REPO, "scripts/remediation/language-mismatch-quarantine-manifest.json"), "utf8"));

const HOOPA_LISTING = "v1|147570453677|0";
const HIGH = [37863, 34424, 37288];
const UNCERTAIN = [37466, 37973, 37974, 37975];

const hourAgo = () => new Date(Date.now() - 3600_000).toISOString();
function seed({ mutate } = {}) {
  const t = hourAgo();
  const fresh = (s) => ({ ...s, first_seen_at: t, last_seen_at: t, exact_verified_at: s.exact_verified_at ? t : null });
  const deals = [...manifest.candidates.map((c) => fresh(c.snapshot)), ...manifest.context.hoopaJapaneseCopies.map(fresh)];
  if (mutate) mutate(deals);
  return createMemoryDb({ deals });
}
const row = (db, id) => db.tables.deals.find((r) => Number(r.id) === Number(id));
const chunksOf = (db) => inv.ALL_DEALS_MARKETPLACES.map((m) => inv.encodeMarketplaceInventory(db.tables.deals, { marketplace: m }));
function allListings(db, params = {}) {
  const chunks = chunksOf(db);
  const first = inv.queryAllDeals(chunks, { ...params, page: 1 });
  const deals = [];
  for (let p = 1; p <= first.totalPages; p++) deals.push(...inv.queryAllDeals(chunks, { ...params, page: p }).deals);
  return { first, deals };
}

test("LMQ-1. manifest: 7 reviewed EBAY_IT candidates, 3 high-confidence with guarded mutation + prior values, 4 held for review", () => {
  assert.deepEqual(manifest.candidates.map((c) => c.dealId).sort(), [...HIGH, ...UNCERTAIN].sort());
  assert.deepEqual(manifest.candidates.filter((c) => c.confidence === "high").map((c) => c.dealId).sort(), [...HIGH].sort());
  assert.deepEqual([...manifest.excludedUncertain].sort(), [...UNCERTAIN].sort());
  assert.equal(manifest.expectedAffectedRows, 3);
  for (const c of manifest.candidates) {
    assert.equal(c.marketplace, "EBAY_IT");
    assert.equal(c.storedIdentity.cardLanguage, "english");
    assert.match(c.title, Q.STATED_JAPANESE_IT, `${c.dealId} title states Japanese`);
    assert.deepEqual(c.prior, { is_active: true, disqualified_reason: null });
    assert.ok(c.evidence && c.snapshot?.id === c.dealId);
    if (c.confidence === "high") {
      assert.ok(c.corroboration.length > 0, `${c.dealId} has corroborating evidence`);
      assert.deepEqual(c.proposedMutation.set, { disqualified_reason: "identity:language_conflict" });
      assert.deepEqual(Object.keys(c.proposedMutation.guard).sort(), ["card_language", "card_tcgplayer_id", "disqualified_reason", "id", "is_active", "listing_id", "marketplace"]);
    } else {
      assert.equal(c.proposedMutation, null);
      assert.ok(c.counterEvidence.length > 0, `${c.dealId} states why it is uncertain`);
    }
  }
});

test("LMQ-2. the gap: every candidate is displayable today because the classifier does not read 'giapponese'", () => {
  const db = seed();
  for (const c of manifest.candidates) {
    assert.equal(classifyListingLanguage({ title: c.title }), "unknown", `${c.dealId} classifier`);
    assert.equal(isDisplayableDeal(row(db, c.dealId)), true, `${c.dealId} displayable`);
  }
});

test("LMQ-3. dry-run plan: 3 quarantine, 4 review, 0 skip; planning writes nothing", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  assert.deepEqual(plan.filter((p) => p.decision === "quarantine").map((p) => p.dealId).sort(), [...HIGH].sort());
  assert.deepEqual(plan.filter((p) => p.decision === "review").map((p) => p.dealId).sort(), [...UNCERTAIN].sort());
  assert.equal(plan.filter((p) => p.decision === "skip").length, 0);
  assert.equal(db.writes.length, 0);
});

test("LMQ-4. apply refuses a wrong --confirm; the right count quarantines exactly the 3 confirmed rows and nothing else", async () => {
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  await assert.rejects(() => Q.applyQuarantine(db, plan, { confirm: 7 }), /does not match/);
  assert.equal(db.writes.length, 0);
  const dir = mkdtempSync(join(tmpdir(), "lmq-"));
  const out = await Q.applyQuarantine(db, plan, { confirm: 3, priorOut: join(dir, "prior.json") });
  assert.equal(out.written, 3);
  assert.ok(existsSync(join(dir, "prior.json")));
  assert.equal(db.writes.length, 3);
  for (const w of db.writes) assert.deepEqual(Object.keys(w.values), ["disqualified_reason"], "only the exclusion column changes");
  for (const id of HIGH) {
    const r = row(db, id);
    assert.equal(r.disqualified_reason, "identity:language_conflict");
    assert.equal(r.is_active, true, "is_active untouched");
    assert.equal(r.card_language, "english", "identity untouched");
    assert.equal(isDisplayableDeal(r), false, `${id} hidden`);
  }
  for (const id of [...UNCERTAIN, 37856, 37861]) assert.equal(isDisplayableDeal(row(db, id)), true, `${id} untouched`);
});

test("LMQ-5. a later scanner sighting of a quarantined listing does not re-publish it", async () => {
  const db = seed();
  await Q.applyQuarantine(db, await Q.planQuarantine(db, manifest), { confirm: 3 });
  const r = row(db, 37288);
  const { outcome } = await writeDiscoverySighting(db, {
    source: "ebay", marketplace: r.marketplace, listing_id: r.listing_id, title: r.title, watchlist_id: r.watchlist_id,
    market_price: r.market_price, discount_pct: r.discount_pct, is_active: true, last_seen_at: new Date().toISOString(),
  });
  assert.equal(outcome, "updated");
  assert.equal(row(db, 37288).disqualified_reason, "identity:language_conflict");
  assert.equal(isDisplayableDeal(row(db, 37288)), false);
});

test("LMQ-6. guards: a row whose identity changed since review is skipped; a row changed between plan and apply is not written", async () => {
  const relabelled = seed({ mutate: (deals) => { deals.find((d) => d.id === 34424).card_language = "japanese"; } });
  assert.match((await Q.planQuarantine(relabelled, manifest)).find((p) => p.dealId === 34424).why, /card_language/);
  const retitled = seed({ mutate: (deals) => { deals.find((d) => d.id === 37288).title = "Misty's Tentacruel Gym Heroes 10/132 Holo"; } });
  assert.match((await Q.planQuarantine(retitled, manifest)).find((p) => p.dealId === 37288).why, /title/);
  const db = seed();
  const plan = await Q.planQuarantine(db, manifest);
  row(db, 34424).disqualified_reason = "availability:sold"; // verifier retired it meanwhile
  const out = await Q.applyQuarantine(db, plan, { confirm: 3 });
  assert.equal(out.written, 2);
  assert.equal(row(db, 34424).disqualified_reason, "availability:sold", "never overwrites a newer reason");
});

test("LMQ-7. rollback restores the saved prior value only where the quarantine reason is still present; is_active untouched", async () => {
  const db = seed();
  const { prior } = await Q.applyQuarantine(db, await Q.planQuarantine(db, manifest), { confirm: 3 });
  row(db, 34424).disqualified_reason = "availability:sold"; // changed after quarantine
  await assert.rejects(() => Q.rollbackQuarantine(db, prior, { confirm: 1 }), /does not match/);
  const out = await Q.rollbackQuarantine(db, prior, { confirm: 3 });
  assert.equal(out.restored, 2);
  assert.equal(row(db, 34424).disqualified_reason, "availability:sold");
  for (const id of [37863, 37288]) {
    assert.equal(row(db, id).disqualified_reason, null);
    assert.equal(isDisplayableDeal(row(db, id)), true, `${id} back to its pre-quarantine state`);
  }
});

test("LMQ-8. All deals after the quarantine: the two valid Japanese Hoopa copies form ONE listing with the Japanese comparison, no English comparison anywhere", async () => {
  const db = seed();
  // before: the copies disagree on identity, so the safeguard withholds the listing everywhere
  for (const country of [undefined, "EBAY_US", "EBAY_GB", "EBAY_IT"]) {
    const { first, deals } = allListings(db, { country });
    assert.ok(!deals.some((d) => d.listing_id === HOOPA_LISTING), `before, ${country ?? "all"}: withheld`);
    assert.equal(first.identityConflictsWithheld, 1);
  }

  await Q.applyQuarantine(db, await Q.planQuarantine(db, manifest), { confirm: 3 });

  const { first, deals } = allListings(db);
  assert.equal(first.identityConflictsWithheld, 0, "no conflict remains once the English copy is excluded");
  const tiles = deals.filter((d) => d.listing_id === HOOPA_LISTING);
  assert.equal(tiles.length, 1, "one listing");
  const [hoopa] = tiles;
  assert.equal(hoopa.id, 37856, "the US copy (item located in JP, which is not a scanned marketplace, so the existing preference order applies between two identical identities)");
  assert.deepEqual(hoopa.also_on, ["EBAY_GB"]);
  assert.equal(hoopa.card_language, "japanese");
  assert.equal(hoopa.watchlist.language, "japanese");
  assert.equal(String(hoopa.card_tcgplayer_id), "602060");
  assert.equal(String(hoopa.reference_product_id), "602060");
  assert.equal(Number(hoopa.market_price), 186.44);
  // no English comparison on any tile, in any scope
  for (const country of [undefined, "EBAY_US", "EBAY_GB", "EBAY_IT"]) {
    for (const d of allListings(db, { country }).deals) {
      assert.notEqual(String(d.reference_product_id), "489917", `${country ?? "all"}: English Hoopa reference shown`);
      assert.ok(![37863, 34424, 37288].includes(d.id), `${country ?? "all"}: quarantined row ${d.id} shown`);
    }
  }
  assert.equal(allListings(db, { country: "EBAY_GB" }).deals.find((d) => d.listing_id === HOOPA_LISTING).id, 37861, "GB scope shows its own Japanese copy");
  assert.ok(!allListings(db, { country: "EBAY_IT" }).deals.some((d) => d.listing_id === HOOPA_LISTING), "IT scope: the English copy is gone, nothing replaces it");
  // the 4 uncertain rows are untouched and still listed
  for (const id of UNCERTAIN) assert.ok(deals.some((d) => d.id === id), `${id} still listed pending review`);
});
