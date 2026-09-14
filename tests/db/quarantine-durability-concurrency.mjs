// Integrity follow-up r2 - quarantine / review-hold durability under REAL
// concurrency, against a DISPOSABLE local Postgres (never production).
//
// Scope and method (same as tests/db/sold-freshness-concurrency.mjs):
//  - the repo's deals schema + triggers are loaded into a throwaway database;
//  - the CONDITIONAL WRITES are run as the exact SQL PostgREST executes for
//    the unmodified r2 code, on separate concurrent connections, with one
//    transaction held open so the other statement genuinely waits on the row
//    lock and Postgres re-checks its WHERE after the commit (READ COMMITTED);
//  - the translation from the real code to those SQL predicates is captured,
//    not assumed: the r2 helper and the remediation scripts are run against a
//    recording PostgREST client and their request filters are asserted
//    against the predicates used below.
// Not in the loop: a running PostgREST server (none available locally). The
// filter shapes were validated read-only against production PostgREST.
//
//   TEST_DATABASE_URL=postgres://user:pw@localhost:PORT/db PG_MODULE_BASE=<dir with node_modules/pg> \
//     node tests/db/quarantine-durability-concurrency.mjs
// Refuses any non-localhost URL (never production).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("SKIP: TEST_DATABASE_URL not set (needs a disposable local Postgres)");
  process.exit(0);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`REFUSING: ${host} is not local`);
  process.exit(2);
}
const ROOT = process.env.REPO ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const requirePg = createRequire(join(process.env.PG_MODULE_BASE, "x.js"));
const requireRepo = createRequire(join(ROOT, "x.js"));
const { Client } = requirePg("pg");
const LA = requireRepo("./lib/listingAvailability.js");
const { PostgrestClient } = requireRepo("@supabase/postgrest-js");
const QScript = await import(pathToFileURL(join(ROOT, "scripts/remediation/languageMismatchQuarantine.mjs")).href);
const HScript = await import(pathToFileURL(join(ROOT, "scripts/remediation/languageReviewHold.mjs")).href);

const SOLD = LA.AVAILABILITY_RETIREMENT.SOLD;
const NOT_FOUND = LA.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE;
const IDENTITY = QScript.QUARANTINE_REASON; // identity:language_conflict
const COLLECTOR = "identity:collector_number_conflict";
const HOLD = HScript.HOLD_REASON; // review:language_unverified

// ---------------------------------------------------------------------------
// 1. Capture the real code's PostgREST requests (the translation contract)
const captured = [];
const capture = new PostgrestClient("http://capture.local", {
  fetch: async (u, init) => {
    captured.push({ method: init.method, url: decodeURIComponent(String(u)), body: JSON.parse(init.body ?? "null") });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  },
});
await LA.retireForAvailability(capture, { key: { source: "ebay", marketplace: "EBAY_IT", listing_id: "L" }, reason: SOLD, patch: { exact_verified_at: "T" }, onlyActive: true });
await LA.retireForAvailability(capture, { key: { id: 7 }, reason: SOLD, patch: { exact_verified_at: "T" } });
const holdPlan = [{ decision: "hold", dealId: 9, ebayListingId: "L9", current: { disqualifiedReason: null, isActive: true }, mutation: { guard: { id: 9, is_active: true, disqualified_reason: null, listing_id: "L9", marketplace: "EBAY_IT", card_tcgplayer_id: "87552", card_language: "english" } } }];
await HScript.applyHold(capture, holdPlan, { confirm: 1 });
await HScript.releaseHold(capture, { reason: HOLD, rows: [{ dealId: 9, prior_disqualified_reason: null }] }, { confirm: 1 });
const q = (c) => c.url.split("?")[1];
assert.equal(q(captured[0]), 'source=eq.ebay&marketplace=eq.EBAY_IT&listing_id=eq.L&is_active=eq.true&or=(disqualified_reason.is.null,disqualified_reason.like."availability:*")&select=id,watchlist_id,card_tcgplayer_id,disqualified_reason');
assert.deepEqual(captured[0].body, { exact_verified_at: "T", is_active: false, disqualified_reason: SOLD });
assert.equal(q(captured[1]), "source=eq.ebay&marketplace=eq.EBAY_IT&listing_id=eq.L&is_active=eq.true&disqualified_reason=not.is.null&disqualified_reason=not.like.availability:*&select=id,watchlist_id,card_tcgplayer_id,disqualified_reason");
assert.deepEqual(captured[1].body, { exact_verified_at: "T", is_active: false });
assert.equal(q(captured[2]), 'id=eq.7&or=(disqualified_reason.is.null,disqualified_reason.like."availability:*")&select=id,watchlist_id,card_tcgplayer_id,disqualified_reason');
assert.equal(q(captured[3]), "id=eq.7&disqualified_reason=not.is.null&disqualified_reason=not.like.availability:*&select=id,watchlist_id,card_tcgplayer_id,disqualified_reason");
assert.equal(q(captured[4]), "id=eq.9&is_active=eq.true&disqualified_reason=is.null&listing_id=eq.L9&marketplace=eq.EBAY_IT&card_tcgplayer_id=eq.87552&card_language=eq.english&select=id");
assert.deepEqual(captured[4].body, { disqualified_reason: HOLD });
assert.equal(q(captured[5]), `id=eq.9&disqualified_reason=eq.${HOLD}&select=id`);
assert.deepEqual(captured[5].body, { disqualified_reason: null });
// the feed and verifier call sites pass exactly these arguments
const feedSrc = readFileSync(join(ROOT, "app/api/ingest-feed/route.js"), "utf8");
const verifySrc = readFileSync(join(ROOT, "app/api/verify-deals/route.js"), "utf8");
assert.match(feedSrc, /retireForAvailability\(db, \{\s*key: \{ source: "ebay", marketplace: listing\.marketplace, listing_id: listing\.listingId \},\s*reason: AVAILABILITY_RETIREMENT\.SOLD,\s*patch: \{ exact_verified_at: new Date\(\)\.toISOString\(\) \},\s*onlyActive: true,/);
assert.match(verifySrc, /retireForAvailability\(db, \{ key: \{ id: r\.id \}, reason, patch \}\)/);
console.log(`translation: ${captured.length} captured requests match the SQL predicates below`);

// ---------------------------------------------------------------------------
// 2. The SQL PostgREST runs for those requests (one statement per request)
const KEY = "source = $1 AND marketplace = $2 AND listing_id = $3";
const RET = "RETURNING id, watchlist_id, card_tcgplayer_id, disqualified_reason";
const SQL = {
  // feed: retireForAvailability(onlyActive) statement 1 / 2
  feedReplace: `UPDATE deals SET exact_verified_at = $4, is_active = false, disqualified_reason = $5
                WHERE ${KEY} AND is_active = true AND (disqualified_reason IS NULL OR disqualified_reason LIKE 'availability:%') ${RET}`,
  feedKeep: `UPDATE deals SET exact_verified_at = $4, is_active = false
             WHERE ${KEY} AND is_active = true AND disqualified_reason IS NOT NULL AND NOT disqualified_reason LIKE 'availability:%' ${RET}`,
  // verifier: retireForAvailability({ key: { id } }) statement 1 / 2
  idReplace: `UPDATE deals SET exact_verified_at = $2, is_active = false, disqualified_reason = $3
              WHERE id = $1 AND (disqualified_reason IS NULL OR disqualified_reason LIKE 'availability:%') ${RET}`,
  idKeep: `UPDATE deals SET exact_verified_at = $2, is_active = false
           WHERE id = $1 AND disqualified_reason IS NOT NULL AND NOT disqualified_reason LIKE 'availability:%' ${RET}`,
  // pre-r2 feed write, for contrast
  oldFeed: `UPDATE deals SET is_active = false, disqualified_reason = $5, exact_verified_at = $4 WHERE ${KEY} AND is_active = true RETURNING id`,
  // remediation scripts' guarded writes (quarantine / hold / release)
  reasonGuarded: `UPDATE deals SET disqualified_reason = $2 WHERE id = $1 AND is_active = true AND disqualified_reason IS NULL
                  AND listing_id = $3 AND marketplace = $4 AND card_tcgplayer_id = $5 AND card_language = $6 RETURNING id`,
  release: `UPDATE deals SET disqualified_reason = NULL WHERE id = $1 AND disqualified_reason = $2 RETURNING id`,
  // writeDiscoverySighting (unchanged) + recovery (unchanged)
  sighting: `UPDATE deals SET title = $4, price = $5, is_active = true, last_seen_at = $6
             WHERE ${KEY} AND (disqualified_reason IS NULL OR disqualified_reason NOT LIKE 'availability:%') RETURNING id`,
  markSeenAgain: `UPDATE deals SET disqualified_reason = $5 WHERE ${KEY} AND disqualified_reason = $4 RETURNING id`,
  recoveryCandidates: `SELECT id FROM deals WHERE is_active = false AND listing_type = 'FIXED_PRICE' AND disqualified_reason IN ($1, $2)`,
  recoverReactivate: `UPDATE deals SET is_active = true, disqualified_reason = NULL, last_seen_at = $2, exact_verified_at = $2
                      WHERE id = $1 AND is_active = false AND disqualified_reason = $3 RETURNING id`,
};
// the recovery / sighting predicates really are the unchanged library contract
assert.equal(LA.SIGHTING_WRITABLE_OR, 'disqualified_reason.is.null,disqualified_reason.not.like."availability:*"');
assert.equal(LA.REASON_REPLACEABLE_OR, 'disqualified_reason.is.null,disqualified_reason.like."availability:*"');

// ---------------------------------------------------------------------------
const connect = async (name) => {
  const c = new Client({ connectionString: url, application_name: name });
  await c.connect();
  return c;
};
const [A, B, OBS] = [await connect("conn_A"), await connect("conn_B"), await connect("observer")];

await OBS.query("DROP TABLE IF EXISTS deals CASCADE; DROP TABLE IF EXISTS watchlist CASCADE; DROP TABLE IF EXISTS card_catalog CASCADE;");
await OBS.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;`);
for (const f of ["supabase/deals_schema.sql", "supabase/sealed_schema.sql", "supabase/watchlist_language_migration.sql", "supabase/card_catalog_migration.sql", "supabase/currency_migration.sql", "supabase/local_first_migration.sql", "supabase/deal_availability_migration.sql", "supabase/deals_feed_discovery_migration.sql"]) {
  await OBS.query(readFileSync(join(ROOT, f), "utf8"));
}
await OBS.query("ALTER TABLE deals ADD COLUMN IF NOT EXISTS disqualified_reason text");
const trig = (await OBS.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'deals'::regclass AND NOT tgisinternal ORDER BY 1")).rows.map((r) => r.tgname);
const iso = (await OBS.query("SHOW default_transaction_isolation")).rows[0].default_transaction_isolation;
const ver = (await OBS.query("SHOW server_version")).rows[0].server_version;
console.log(`postgres ${ver} | triggers on deals: ${trig.join(", ")} | isolation: ${iso}`);
assert.ok(trig.includes("deals_resolve_card_trg") && trig.includes("deals_merge_discovery_source_trg"));
assert.equal(iso, "read committed");

let seq = 0;
async function freshRow({ reason = null, active = true, marketplace = "EBAY_IT", tcg = "87552", language = "english" } = {}) {
  const w = await OBS.query(`INSERT INTO watchlist (name, "set", justtcg_tcgplayer_id) VALUES ($1, 'Gym Heroes', $2) RETURNING id`, [`Card ${++seq}`, tcg]);
  const lid = `v1|40720${String(seq).padStart(7, "0")}|0`;
  const r = await OBS.query(
    `INSERT INTO deals (watchlist_id, source, marketplace, listing_id, title, listing_url, affiliate_url, price, total_price,
                        market_price, discount_pct, is_active, last_seen_at, disqualified_reason, listing_type)
     VALUES ($1, 'ebay', $2, $3, 'Card giapponese', 'u', 'a', 20, 20, 30, 0.3, $4, '2026-09-14T00:00:00Z', $5, 'FIXED_PRICE') RETURNING id`,
    [w.rows[0].id, marketplace, lid, active, reason]
  );
  // resolve trigger fills card_* from the watchlist; pin the identity the guards check
  await OBS.query("UPDATE deals SET card_tcgplayer_id = $2, card_language = $3 WHERE id = $1", [r.rows[0].id, tcg, language]);
  return { id: r.rows[0].id, key: ["ebay", marketplace, lid], lid, marketplace, tcg };
}
const row = async (id) => (await OBS.query("SELECT * FROM deals WHERE id = $1", [id])).rows[0];
async function waitUntilBlocked(client, label) {
  for (let i = 0; i < 150; i++) {
    const r = await OBS.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [client.processID]);
    if (r.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`${label}: expected the second connection to block on the row lock`);
}
const T = "2026-09-14T05:00:00Z";
const feedRetire = async (c, r) => {
  const a = await c.query(SQL.feedReplace, [...r.key, T, SOLD]);
  const b = await c.query(SQL.feedKeep, [...r.key, T]);
  return { replaced: a.rowCount, kept: b.rowCount };
};
const verifierRetire = async (c, id, reason = SOLD) => {
  const a = await c.query(SQL.idReplace, [id, T, reason]);
  const b = await c.query(SQL.idKeep, [id, T]);
  return { replaced: a.rowCount, kept: b.rowCount };
};
const guardedReason = (c, r, reason) => c.query(SQL.reasonGuarded, [r.id, reason, r.lid, r.marketplace, r.tcg, "english"]);
const recoveryIds = async () => (await OBS.query(SQL.recoveryCandidates, [LA.SEEN_AGAIN.SOLD, LA.SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE])).rows.map((x) => x.id);

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message]);
    await A.query("ROLLBACK").catch(() => {});
    await B.query("ROLLBACK").catch(() => {});
  }
}

await scenario("D1 verifier read the row (no reason), a quarantine COMMITS before the retirement write -> retired, quarantine survives", async () => {
  const r = await freshRow();
  assert.equal((await row(r.id)).disqualified_reason, null, "candidate read with no reason");
  assert.equal((await guardedReason(A, r, IDENTITY)).rowCount, 1);
  assert.deepEqual(await verifierRetire(B, r.id), { replaced: 0, kept: 1 });
  const x = await row(r.id);
  assert.equal(x.disqualified_reason, IDENTITY);
  assert.equal(x.is_active, false);
});

await scenario("D2 quarantine transaction IN FLIGHT: the verifier's replace statement waits on the row lock, re-checks after commit, writes nothing; keep statement retires with the quarantine intact", async () => {
  const r = await freshRow();
  await A.query("BEGIN");
  assert.equal((await guardedReason(A, r, IDENTITY)).rowCount, 1);
  const pending = B.query(SQL.idReplace, [r.id, T, SOLD]);
  await waitUntilBlocked(B, "D2");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0, "re-checked WHERE excludes the now-quarantined row");
  assert.equal((await B.query(SQL.idKeep, [r.id, T])).rowCount, 1);
  const x = await row(r.id);
  assert.equal(x.disqualified_reason, IDENTITY);
  assert.equal(x.is_active, false);
  assert.equal(new Date(x.exact_verified_at).toISOString(), new Date(T).toISOString());
});

await scenario("D3 verifier retirement IN FLIGHT first: the quarantine's guarded write waits, re-checks, writes nothing (never overwrites the newer availability reason)", async () => {
  const r = await freshRow();
  await A.query("BEGIN");
  assert.equal((await A.query(SQL.idReplace, [r.id, T, SOLD])).rowCount, 1);
  const pending = guardedReason(B, r, IDENTITY);
  await waitUntilBlocked(B, "D3");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0, "the script would report written 0 and stop");
  assert.equal((await row(r.id)).disqualified_reason, SOLD);
});

await scenario("D4 feed sold-on-lookup on an identity-quarantined row (both families) and a review-held row: retired, every reason kept; sighting keeps it; never a recovery candidate", async () => {
  for (const reason of [COLLECTOR, IDENTITY, HOLD]) {
    const r = await freshRow({ reason });
    assert.deepEqual(await feedRetire(B, r), { replaced: 0, kept: 1 }, reason);
    assert.equal((await B.query(SQL.sighting, [...r.key, "Card giapponese", 19, T])).rowCount, 1, `${reason}: sighting refreshes (pre-existing semantics)`);
    const x = await row(r.id);
    assert.equal(x.disqualified_reason, reason, `${reason} survives`);
    assert.ok(!(await recoveryIds()).includes(r.id), `${reason}: not a recovery candidate`);
  }
});

await scenario("D5 review hold IN FLIGHT: the feed's replace statement waits, writes nothing after commit; keep statement retires with the hold intact", async () => {
  const r = await freshRow();
  await A.query("BEGIN");
  assert.equal((await guardedReason(A, r, HOLD)).rowCount, 1);
  const pending = B.query(SQL.feedReplace, [...r.key, T, SOLD]);
  await waitUntilBlocked(B, "D5");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0);
  assert.equal((await B.query(SQL.feedKeep, [...r.key, T])).rowCount, 1);
  const x = await row(r.id);
  assert.equal(x.disqualified_reason, HOLD);
  assert.equal(x.is_active, false);
});

await scenario("D6 contrast (pre-r2 statement): the old feed write REPLACES the quarantine, a sighting marks it seen-again, recovery reactivates it with a NULL reason", async () => {
  const r = await freshRow({ reason: IDENTITY });
  assert.equal((await B.query(SQL.oldFeed, [...r.key, T, SOLD])).rowCount, 1);
  assert.equal((await B.query(SQL.sighting, [...r.key, "Card giapponese", 19, T])).rowCount, 0, "blocked");
  assert.equal((await B.query(SQL.markSeenAgain, [...r.key, SOLD, LA.SEEN_AGAIN.SOLD])).rowCount, 1);
  assert.ok((await recoveryIds()).includes(r.id));
  assert.equal((await A.query(SQL.recoverReactivate, [r.id, T, LA.SEEN_AGAIN.SOLD])).rowCount, 1);
  const x = await row(r.id);
  assert.equal(x.disqualified_reason, null, "quarantine lost - the defect r2 fixes");
  assert.equal(x.is_active, true);
});

await scenario("D7 ordinary availability retirement + recovery still work: NULL -> availability:sold (feed and verifier), sighting blocked + marked, recovery reactivates; not-found is replaceable", async () => {
  const f = await freshRow();
  assert.deepEqual(await feedRetire(B, f), { replaced: 1, kept: 0 });
  assert.equal((await row(f.id)).disqualified_reason, SOLD);
  assert.equal((await B.query(SQL.sighting, [...f.key, "Card", 19, T])).rowCount, 0);
  assert.equal((await B.query(SQL.markSeenAgain, [...f.key, SOLD, LA.SEEN_AGAIN.SOLD])).rowCount, 1);
  assert.ok((await recoveryIds()).includes(f.id));
  assert.equal((await A.query(SQL.recoverReactivate, [f.id, T, LA.SEEN_AGAIN.SOLD])).rowCount, 1);
  const x = await row(f.id);
  assert.equal(x.is_active, true);
  assert.equal(x.disqualified_reason, null);
  const v = await freshRow();
  assert.deepEqual(await verifierRetire(A, v.id, NOT_FOUND), { replaced: 1, kept: 0 });
  assert.deepEqual(await verifierRetire(A, v.id, SOLD), { replaced: 1, kept: 0 }, "availability reason replaceable");
  assert.equal((await row(v.id)).disqualified_reason, SOLD);
});

// (Corrected on first run: the replace statement cannot contend here - the
// row's committed version already fails its WHERE, so Postgres returns 0
// rows without taking or waiting on the lock. The contending statements are
// the two KEEP statements, which both match.)
await scenario("D8 two concurrent retirements of the same quarantined row (feed + verifier): the verifier's keep statement waits on the feed's, both serialize, the reason is never replaced", async () => {
  const r = await freshRow({ reason: COLLECTOR });
  assert.equal((await B.query(SQL.idReplace, [r.id, T, SOLD])).rowCount, 0, "replace never matches a quarantined row (no lock needed)");
  await A.query("BEGIN");
  assert.equal((await A.query(SQL.feedKeep, [...r.key, T])).rowCount, 1);
  const pending = B.query(SQL.idKeep, [r.id, "2026-09-14T05:01:00Z"]);
  await waitUntilBlocked(B, "D8");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 1, "re-checked after commit: still carries a non-availability reason -> keep applies");
  assert.equal((await B.query(SQL.idReplace, [r.id, T, SOLD])).rowCount, 0);
  const x = await row(r.id);
  assert.equal(x.disqualified_reason, COLLECTOR);
  assert.equal(x.is_active, false);
});

await scenario("D9 review hold apply / release through the guarded statements: guards hold under a concurrent retirement; release restores NULL only where the hold remains", async () => {
  const held = await freshRow();
  const retiredFirst = await freshRow();
  assert.equal((await guardedReason(A, held, HOLD)).rowCount, 1);
  await B.query(SQL.idReplace, [retiredFirst.id, T, SOLD]);
  assert.equal((await guardedReason(A, retiredFirst, HOLD)).rowCount, 0, "a row retired since review is not held (script: written < expected, stop)");
  await OBS.query("UPDATE deals SET disqualified_reason = $2 WHERE id = $1", [retiredFirst.id, SOLD]);
  assert.equal((await A.query(SQL.release, [held.id, HOLD])).rowCount, 1);
  assert.equal((await A.query(SQL.release, [retiredFirst.id, HOLD])).rowCount, 0);
  assert.equal((await row(held.id)).disqualified_reason, null);
  assert.equal((await row(retiredFirst.id)).disqualified_reason, SOLD);
});

for (const c of [A, B, OBS]) await c.end();
for (const [s, n, m] of results) console.log(`${s} ${n}${m ? `\n     ${m}` : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(failed ? `\nFAIL: ${failed} of ${results.length}` : `\nPASS: ${results.length} of ${results.length} durability concurrency scenarios`);
process.exit(failed ? 1 : 0);
