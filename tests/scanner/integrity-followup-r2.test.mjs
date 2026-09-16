// Integrity follow-up r2 (2026-09-14), offline:
//   A. availability retirements must never replace (and so let recovery
//      later clear) an identity quarantine, review hold or quality reason -
//      including the applied 23-row collector-number quarantine and the
//      3-row language quarantine;
//   B. a reversible review hold for the 4 uncertain "giapponese" listings
//      that asserts no language and rewrites no identity.
// In-memory store (tests/harness/ingestion/memoryDb) running the exact
// PostgREST statement shapes the writers use. Nothing touches production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { withReferenceEvidence } from "../helpers/referenceEvidence.mjs";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const read = (p) => readFileSync(join(REPO, p), "utf8");
const { createMemoryDb } = await imp("tests/harness/ingestion/memoryDb.mjs");
const H = await imp("scripts/remediation/languageReviewHold.mjs");
const inv = await imp("lib/allDealsInventory.js");
const LA = require(join(REPO, "lib/listingAvailability.js"));
const { isDisplayableDeal } = require(join(REPO, "lib/dealQuality.js"));

const collectorManifest = JSON.parse(read("scripts/remediation/integrity-r1-quarantine-manifest.json"));
const collectorPrior = JSON.parse(read("scripts/remediation/applied/integrity-r1-quarantine-prior-2026-09-14T02-54-06Z.json"));
const languageManifest = JSON.parse(read("scripts/remediation/language-mismatch-quarantine-manifest.json"));
const languagePrior = JSON.parse(read("scripts/remediation/applied/language-mismatch-quarantine-prior-2026-09-14T04-32-02Z.json"));
const holdManifest = JSON.parse(read("scripts/remediation/language-review-hold-manifest.json"));

const hourAgo = () => new Date(Date.now() - 3600_000).toISOString();
const fresh = (s) => {
  const t = hourAgo();
  return { source: "ebay", ...s, first_seen_at: t, last_seen_at: t, exact_verified_at: s.exact_verified_at ? t : null };
};
const row = (db, id) => db.tables.deals.find((r) => Number(r.id) === Number(id));
const SOLD = LA.AVAILABILITY_RETIREMENT.SOLD;
const nowIso = () => new Date().toISOString();

// The applied quarantine state: 23 collector-number rows + 3 language rows,
// each carrying the reason that was written in production.
function quarantinedDb(extra = []) {
  const applied23 = new Set(collectorPrior.rows.map((r) => r.dealId));
  const applied3 = new Set(languagePrior.rows.map((r) => r.dealId));
  const deals = [
    ...collectorManifest.candidates.filter((c) => applied23.has(c.dealId)).map((c) => ({ ...fresh(c.snapshot), disqualified_reason: collectorPrior.reason })),
    ...languageManifest.candidates.filter((c) => applied3.has(c.dealId)).map((c) => ({ ...fresh(c.snapshot), disqualified_reason: languagePrior.reason })),
    ...extra,
  ];
  return createMemoryDb({ deals });
}
const APPLIED_IDS = [...collectorPrior.rows.map((r) => r.dealId), ...languagePrior.rows.map((r) => r.dealId)];

// verify-deals' recovery candidate filter (is_active=false + a seen-again marker)
const recoveryCandidates = (db) => db.tables.deals.filter((r) => r.is_active === false && [LA.SEEN_AGAIN.SOLD, LA.SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE].includes(r.disqualified_reason));
const sightingOf = (r) => withReferenceEvidence({ source: "ebay", marketplace: r.marketplace, listing_id: r.listing_id, title: r.title, watchlist_id: r.watchlist_id, market_price: r.market_price, discount_pct: r.discount_pct, is_active: true, last_seen_at: nowIso() });
// the exact pre-r2 feed sold-on-lookup statement, for contrast
const oldFeedSold = (db, r) =>
  db.from("deals").update({ is_active: false, disqualified_reason: SOLD, exact_verified_at: nowIso() }).match({ source: "ebay", marketplace: r.marketplace, listing_id: r.listing_id }).eq("is_active", true).select("id");
// the r2 feed sold-on-lookup call
const newFeedSold = (db, r) => LA.retireForAvailability(db, { key: { source: "ebay", marketplace: r.marketplace, listing_id: r.listing_id }, reason: SOLD, patch: { exact_verified_at: nowIso() }, onlyActive: true });

// ---- A. availability retirements vs identity quarantines --------------------

test("IF2-1. contrast (pre-r2): a sold lookup REPLACED the identity quarantine, and seen-again recovery then cleared it - the wrong identity was re-published", async () => {
  const db = quarantinedDb();
  const r = row(db, 37357); // applied collector-number quarantine
  assert.equal(isDisplayableDeal(r), false);
  await oldFeedSold(db, r);
  assert.equal(row(db, 37357).disqualified_reason, SOLD, "quarantine reason overwritten");
  assert.equal((await LA.writeDiscoverySighting(db, sightingOf(r))).outcome, "blocked");
  assert.equal(row(db, 37357).disqualified_reason, LA.SEEN_AGAIN.SOLD, "now an ordinary recovery candidate");
  assert.ok(recoveryCandidates(db).some((c) => c.id === 37357));
  const candidate = { ...row(db, 37357), currency: row(db, 37357).currency ?? "USD" };
  const decision = LA.recoveryDecision({ row: candidate, snapshot: { status: "ACTIVE", listingType: "FIXED_PRICE", price: candidate.price, shipping: candidate.shipping ?? 0, currency: candidate.currency }, nowIso: nowIso() });
  assert.equal(decision.action, "reactivate");
  await db.from("deals").update(decision.patch).eq("id", 37357).eq("is_active", false).eq("disqualified_reason", candidate.disqualified_reason).select("id");
  assert.equal(row(db, 37357).disqualified_reason, null, "identity quarantine lost");
  assert.equal(isDisplayableDeal(row(db, 37357)), true, "the wrong-card listing is displayable again");
});

test("IF2-2. r2: the same sequence keeps every applied quarantine (23 collector-number + 3 language rows): retired, reason intact, never a recovery candidate, never displayable", async () => {
  const db = quarantinedDb();
  assert.equal(APPLIED_IDS.length, 26);
  for (const id of APPLIED_IDS) {
    const before = row(db, id).disqualified_reason;
    const out = await newFeedSold(db, row(db, id));
    assert.equal(out.error, null);
    assert.deepEqual(out.preserved.map((p) => Number(p.id)), [id], `${id}: preserved, not replaced`);
    assert.equal(row(db, id).is_active, false, `${id}: retired`);
    assert.equal(row(db, id).disqualified_reason, before, `${id}: reason intact after sold`);
    const s = await LA.writeDiscoverySighting(db, sightingOf(row(db, id)));
    assert.equal(s.outcome, "updated", `${id}: a sighting may refresh the row (pre-existing semantics)...`);
    assert.equal(row(db, id).disqualified_reason, before, `${id}: ...but the reason survives`);
    assert.equal(isDisplayableDeal(row(db, id)), false, `${id}: still hidden`);
  }
  assert.deepEqual(recoveryCandidates(db), [], "no quarantined row can enter recovery");
  // the verifier's retirement (key { id }) behaves the same
  for (const id of APPLIED_IDS) {
    const before = row(db, id).disqualified_reason;
    await LA.retireForAvailability(db, { key: { id }, reason: LA.availabilityRetirementReason("ENDED"), patch: { exact_verified_at: nowIso() } });
    assert.equal(row(db, id).disqualified_reason, before);
  }
});

test("IF2-3. verifier race: a row read with no reason and quarantined before the SOLD write keeps the quarantine", async () => {
  const live = fresh(languageManifest.context.hoopaJapaneseCopies[0]); // 37856, reason NULL
  const db = createMemoryDb({ deals: [live] });
  const readRow = { ...row(db, 37856) };
  assert.equal(readRow.disqualified_reason, null);
  row(db, 37856).disqualified_reason = "identity:language_conflict"; // applied between read and write
  const out = await LA.retireForAvailability(db, { key: { id: readRow.id }, reason: SOLD, patch: { exact_verified_at: nowIso() } });
  assert.equal(out.preserved.length, 1);
  assert.equal(row(db, 37856).disqualified_reason, "identity:language_conflict");
  assert.equal(row(db, 37856).is_active, false);
});

test("IF2-4. unchanged for ordinary rows: a reason-free row gets the availability reason, an availability-retired row is updated, and seen-again recovery still works", async () => {
  const base = fresh(languageManifest.context.hoopaJapaneseCopies[1]); // 37861, reason NULL
  const other = { ...base, id: 99001, listing_id: "v1|990010000001|0", disqualified_reason: LA.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, is_active: false };
  const db = createMemoryDb({ deals: [base, other] });
  const a = await newFeedSold(db, base);
  assert.equal(a.preserved.length, 0);
  assert.equal(row(db, 37861).disqualified_reason, SOLD);
  assert.equal(row(db, 37861).is_active, false);
  await LA.retireForAvailability(db, { key: { id: 99001 }, reason: SOLD, patch: {} });
  assert.equal(row(db, 99001).disqualified_reason, SOLD, "an availability reason is replaceable (sold / not-found stay distinct by last verdict)");
  // recovery for the ordinary row is intact
  assert.equal((await LA.writeDiscoverySighting(db, sightingOf(base))).outcome, "blocked");
  assert.equal(row(db, 37861).disqualified_reason, LA.SEEN_AGAIN.SOLD);
  assert.ok(recoveryCandidates(db).some((c) => c.id === 37861));
});

test("IF2-5. quality exclusions and review holds are preserved the same way; the helper refuses a non-availability reason", async () => {
  const s = fresh(languageManifest.context.hoopaJapaneseCopies[1]);
  const db = createMemoryDb({ deals: [{ ...s, id: 1, listing_id: "v1|1|0", disqualified_reason: "condition:damaged" }, { ...s, id: 2, listing_id: "v1|2|0", disqualified_reason: H.HOLD_REASON }] });
  for (const id of [1, 2]) {
    const before = row(db, id).disqualified_reason;
    await LA.retireForAvailability(db, { key: { id }, reason: SOLD, patch: {} });
    assert.equal(row(db, id).disqualified_reason, before);
  }
  await assert.rejects(() => LA.retireForAvailability(db, { key: { id: 1 }, reason: "identity:card_mismatch" }), /not an availability reason/);
  await assert.rejects(() => LA.retireForAvailability(db, { key: { id: 1 }, reason: null }), /not an availability reason/);
});

test("IF2-6. wiring: both card availability writers use the guarded helper; no unguarded availability-reason write remains in them", () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const feed = strip(read("app/api/ingest-feed/route.js"));
  const verify = strip(read("app/api/verify-deals/route.js"));
  assert.match(feed, /await retireForAvailability\(db, \{\s*key: \{ source: "ebay", marketplace: listing\.marketplace, listing_id: listing\.listingId \},\s*reason: AVAILABILITY_RETIREMENT\.SOLD,/);
  assert.doesNotMatch(feed, /disqualified_reason: AVAILABILITY_RETIREMENT/);
  assert.match(verify, /await retireForAvailability\(db, \{ key: \{ id: r\.id \}, reason, patch \}\)/);
  assert.doesNotMatch(verify, /patch\.disqualified_reason = reason/);
  // recovery still only ever touches rows carrying the exact seen-again marker it read
  assert.match(verify, /\.in\("disqualified_reason", \[SEEN_AGAIN\.SOLD, SEEN_AGAIN\.NOT_FOUND_IN_MARKETPLACE\]\)/);
  assert.match(verify, /\.eq\("disqualified_reason", r\.disqualified_reason\)/);
  // the guard shapes (validated read-only against production on 2026-09-14)
  assert.equal(LA.REASON_REPLACEABLE_OR, 'disqualified_reason.is.null,disqualified_reason.like."availability:*"');
  const lib = read("lib/listingAvailability.js");
  assert.match(lib, /\.not\("disqualified_reason", "is", null\)\s*\.not\("disqualified_reason", "like", `\$\{AVAILABILITY_REASON_PREFIX\}\*`\)/);
});

// ---- B. review hold for the 4 uncertain listings ---------------------------

const UNCERTAIN = [37466, 37973, 37974, 37975];
const holdDb = () =>
  createMemoryDb({
    deals: [
      ...holdManifest.candidates.map((c) => fresh(c.snapshot)),
      ...languageManifest.context.hoopaJapaneseCopies.map(fresh),
    ],
  });

test("IRH-1. manifest: exactly the 4 uncertain rows, a review hold that asserts no language and changes only the exclusion column", () => {
  assert.deepEqual(holdManifest.candidates.map((c) => c.dealId).sort(), UNCERTAIN);
  assert.deepEqual([...languageManifest.excludedUncertain].sort(), UNCERTAIN, "the same rows the quarantine review held back");
  assert.equal(holdManifest.expectedAffectedRows, 4);
  assert.equal(holdManifest.reason, "review:language_unverified");
  for (const c of holdManifest.candidates) {
    assert.deepEqual(c.proposedMutation.set, { disqualified_reason: "review:language_unverified" });
    assert.deepEqual(Object.keys(c.proposedMutation.guard).sort(), ["card_language", "card_tcgplayer_id", "disqualified_reason", "id", "is_active", "listing_id", "marketplace"]);
    assert.deepEqual(c.prior, { is_active: true, disqualified_reason: null });
    assert.equal(c.storedIdentity.cardLanguage, "english", "stored identity recorded as-is");
    assert.equal(c.confidence, undefined, "no confidence claim");
    assert.equal(c.statedLanguage, undefined, "no language asserted");
    assert.match(c.unresolvedQuestion, /not established/);
  }
});

test("IRH-2. dry-run plan: 4 hold, 0 skip; planning writes nothing", async () => {
  const db = holdDb();
  const plan = await H.planHold(db, holdManifest);
  assert.deepEqual(plan.filter((p) => p.decision === "hold").map((p) => p.dealId).sort(), UNCERTAIN);
  assert.equal(plan.filter((p) => p.decision === "skip").length, 0);
  assert.equal(db.writes.length, 0);
});

test("IRH-3. apply refuses a wrong --confirm; the right count holds exactly the 4 rows, changing only disqualified_reason", async () => {
  const db = holdDb();
  const plan = await H.planHold(db, holdManifest);
  await assert.rejects(() => H.applyHold(db, plan, { confirm: 3 }), /does not match/);
  assert.equal(db.writes.length, 0);
  const dir = mkdtempSync(join(tmpdir(), "irh-"));
  const out = await H.applyHold(db, plan, { confirm: 4, priorOut: join(dir, "prior.json") });
  assert.equal(out.written, 4);
  assert.ok(existsSync(join(dir, "prior.json")));
  for (const w of db.writes) assert.deepEqual(Object.keys(w.values), ["disqualified_reason"]);
  for (const c of holdManifest.candidates) {
    const r = row(db, c.dealId);
    assert.equal(r.disqualified_reason, "review:language_unverified");
    assert.equal(r.is_active, true);
    assert.equal(r.card_language, "english", "identity not rewritten");
    assert.equal(String(r.card_tcgplayer_id), String(c.storedIdentity.cardTcgplayerId));
    assert.equal(r.market_price, c.snapshot.market_price, "reference untouched");
    assert.equal(isDisplayableDeal(r), false, `${c.dealId} hidden while held`);
  }
  for (const id of [37856, 37861]) assert.equal(isDisplayableDeal(row(db, id)), true, "unrelated rows untouched");
});

test("IRH-4. guards: a row changed since review is skipped; a newer reason set between plan and apply is never overwritten", async () => {
  const changed = holdDb();
  row(changed, 37973).card_language = "japanese";
  assert.match((await H.planHold(changed, holdManifest)).find((p) => p.dealId === 37973).why, /card_language/);
  const db = holdDb();
  const plan = await H.planHold(db, holdManifest);
  row(db, 37974).disqualified_reason = SOLD; // verifier retired it meanwhile
  const out = await H.applyHold(db, plan, { confirm: 4 });
  assert.equal(out.written, 3);
  assert.equal(row(db, 37974).disqualified_reason, SOLD);
});

test("IRH-5. release (rollback) restores NULL only where the hold is still present; is_active untouched", async () => {
  const db = holdDb();
  const { prior } = await H.applyHold(db, await H.planHold(db, holdManifest), { confirm: 4 });
  row(db, 37975).disqualified_reason = "identity:language_conflict"; // resolved by a later reviewed quarantine
  await assert.rejects(() => H.releaseHold(db, prior, { confirm: 1 }), /does not match/);
  const out = await H.releaseHold(db, prior, { confirm: 4 });
  assert.equal(out.restored, 3);
  assert.equal(row(db, 37975).disqualified_reason, "identity:language_conflict", "a later decision is not undone");
  for (const id of [37466, 37973, 37974]) {
    assert.equal(row(db, id).disqualified_reason, null);
    assert.equal(isDisplayableDeal(row(db, id)), true, `${id} back to its pre-hold state`);
  }
});

test("IRH-6. with r2, a held listing that sells keeps its hold and never enters recovery", async () => {
  const db = holdDb();
  await H.applyHold(db, await H.planHold(db, holdManifest), { confirm: 4 });
  for (const id of UNCERTAIN) {
    await newFeedSold(db, row(db, id));
    await LA.writeDiscoverySighting(db, sightingOf(row(db, id)));
    assert.equal(row(db, id).disqualified_reason, "review:language_unverified");
    assert.equal(isDisplayableDeal(row(db, id)), false);
  }
  assert.deepEqual(recoveryCandidates(db), []);
});

test("IRH-7. All deals after the hold: the 4 listings leave every scope and count; nothing else changes", async () => {
  const db = holdDb();
  const chunks = () => inv.ALL_DEALS_MARKETPLACES.map((m) => inv.encodeMarketplaceInventory(db.tables.deals, { marketplace: m }));
  const before = inv.queryAllDeals(chunks(), {});
  assert.ok(UNCERTAIN.every((id) => before.deals.some((d) => d.id === id)));
  await H.applyHold(db, await H.planHold(db, holdManifest), { confirm: 4 });
  for (const country of [undefined, "EBAY_IT"]) {
    const after = inv.queryAllDeals(chunks(), { country });
    assert.ok(!after.deals.some((d) => UNCERTAIN.includes(d.id)), `${country ?? "all"}: held rows gone`);
  }
  const after = inv.queryAllDeals(chunks(), {});
  assert.equal(after.totalCount, before.totalCount - 4);
  assert.ok(after.deals.some((d) => d.id === 37856), "the Hoopa listing is unaffected");
});
