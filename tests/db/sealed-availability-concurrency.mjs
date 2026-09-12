// Phase 17C.9 - the SEALED guarded writes under REAL concurrency.
//
// Same method as tests/db/sold-freshness-concurrency.mjs: runs the exact
// SQL PostgREST generates for lib/listingAvailability.writeGuardedSighting
// (now table-agnostic) and the sealed verifier's retirement, on TWO
// concurrent connections against a DISPOSABLE local Postgres, in BOTH
// commit orders, with the repo's real sealed schema + the 17C.9 migration
// loaded.
//
//   TEST_DATABASE_URL=postgres://user:pw@localhost:PORT/db \
//   PG_MODULE_BASE=<dir containing node_modules/pg>/  \
//   node tests/db/sealed-availability-concurrency.mjs
//
// Refuses any non-localhost URL (never production). `pg` is not a project
// dependency; PG_MODULE_BASE points at a scratch install.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("SKIP: TEST_DATABASE_URL not set (needs a disposable local Postgres)");
  process.exit(0);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`REFUSING: ${host} is not local - this test DROPs and recreates tables`);
  process.exit(2);
}
const require = createRequire(process.env.PG_MODULE_BASE ? join(process.env.PG_MODULE_BASE, "x.js") : import.meta.url);
const { Client } = require("pg");
const la = require(join(ROOT, "lib", "listingAvailability.js"));

// ---------------------------------------------------------------------------
// Contract between the supabase-js calls and the SQL below. If these drift,
// the SQL no longer represents production and this test must change.
assert.equal(la.SIGHTING_WRITABLE_OR, 'disqualified_reason.is.null,disqualified_reason.not.like."availability:*"');
assert.deepEqual(la.SIGHTING_KEY_COLUMNS, ["source", "marketplace", "listing_id"]);
assert.equal(la.AVAILABILITY_RETIREMENT.SOLD, "availability:sold");
assert.equal(la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, "availability:not_found_in_marketplace");
assert.equal(la.SEEN_AGAIN.SOLD, "availability:sold:seen_again");

const KEY = "source = $1 AND marketplace = $2 AND listing_id = $3";
// The sealed scanner's write payload (lib/sealedIngest dealRow) - note it
// does NOT contain first_seen_at, which is why reassignment preserves it.
const SIGHTING_SET = `sealed_watchlist_id = $4, title = $5, price = $6, total_price = $7,
    total_price_usd = $7, market_price = $8, discount_pct = $9, is_active = true, last_seen_at = $10`;
const STATEMENTS = {
  // writeGuardedSighting step 1 / 3
  sighting: `UPDATE sealed_deals SET ${SIGHTING_SET}
             WHERE ${KEY} AND (disqualified_reason IS NULL OR disqualified_reason NOT LIKE 'availability:%')
             RETURNING id`,
  // step 2: upsert(core, { onConflict, ignoreDuplicates: true })
  insertIgnore: `INSERT INTO sealed_deals (source, marketplace, listing_id, sealed_watchlist_id, title,
                   listing_url, affiliate_url, price, total_price, total_price_usd, market_price, discount_pct,
                   is_active, last_seen_at)
                 VALUES ($1, $2, $3, $4, $5, 'u', 'a', $6, $7, $7, $8, $9, true, $10)
                 ON CONFLICT (source, marketplace, listing_id) DO NOTHING RETURNING id`,
  // step 4
  markSeenAgain: `UPDATE sealed_deals SET disqualified_reason = $5 WHERE ${KEY} AND disqualified_reason = $4 RETURNING id`,
  // sealed verifier retirement (mirrors verify-deals' write on `deals`)
  retire: `UPDATE sealed_deals SET is_active = false, exact_verified_at = $2, disqualified_reason = $3 WHERE id = $1`,
  // sealed verifier ACTIVE confirmation: both stamps, one instant
  confirmActive: `UPDATE sealed_deals SET last_seen_at = $2, exact_verified_at = $2 WHERE id = $1`,
  recoverReactivate: `UPDATE sealed_deals SET is_active = true, disqualified_reason = NULL, last_seen_at = $2, exact_verified_at = $2
                      WHERE id = $1 AND is_active = false AND disqualified_reason = $3 RETURNING id`,
};

const connect = async (name) => {
  const c = new Client({ connectionString: url, application_name: name });
  await c.connect();
  return c;
};
const [A, B, OBS] = [await connect("conn_A"), await connect("conn_B"), await connect("observer")];

async function loadSchema() {
  await OBS.query(
    "DROP TABLE IF EXISTS sealed_deals CASCADE; DROP TABLE IF EXISTS sealed_watchlist CASCADE;" +
      "DROP TABLE IF EXISTS deals CASCADE; DROP TABLE IF EXISTS watchlist CASCADE; DROP TABLE IF EXISTS card_catalog CASCADE;"
  );
  await OBS.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;`);
  // sealed_schema.sql alone is NOT the live table: four columns the sealed
  // scanner writes arrive from later shared migrations (verified against
  // the live schema read-only - the repo file is 22 columns, production has
  // 26). Those migrations also touch `deals`, so its schema loads first,
  // exactly as tests/db/sold-freshness-concurrency.mjs does.
  const files = [
    "supabase/deals_schema.sql",
    "supabase/sealed_schema.sql",
    "supabase/currency_migration.sql", //      currency, total_price_usd
    "supabase/local_first_migration.sql", //   item_location_country, is_local
    "supabase/sealed_availability_migration.sql", // exact_verified_at, disqualified_reason
  ];
  for (const f of files) {
    try {
      await OBS.query(readFileSync(join(ROOT, f), "utf8"));
    } catch (e) {
      throw new Error(`schema file ${f} failed: ${e.message}`);
    }
  }
  // Prove the migration is what supplies the two columns the guard needs.
  const cols = await OBS.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'sealed_deals'
       AND column_name IN ('exact_verified_at','disqualified_reason') ORDER BY 1`
  );
  const idx = await OBS.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'sealed_deals' ORDER BY 1`);
  // The loaded table must cover every column the sealed write path sends.
  const all = await OBS.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'sealed_deals'`);
  const have = new Set(all.rows.map((r) => r.column_name));
  for (const c of ["total_price_usd", "currency", "is_local", "item_location_country", "first_seen_at"]) {
    assert.ok(have.has(c), `loaded sealed_deals is missing ${c} - the schema file list is incomplete`);
  }
  return { files, columns: cols.rows.map((r) => r.column_name), indexes: idx.rows.map((r) => r.indexname), columnCount: have.size };
}

let seq = 0;
async function freshRow({ reason = null, active = true, lastSeen = "2026-09-11T08:00:00Z", exact = null, firstSeen = "2026-09-01T00:00:00Z", productId = null } = {}) {
  seq++;
  let pid = productId;
  if (pid == null) {
    const p = await OBS.query(
      `INSERT INTO sealed_watchlist (name, "set", tcgplayer_id) VALUES ($1, 'Celebrations', $2) RETURNING id`,
      [`Celebrations Elite Trainer Box ${seq}`, `2428${seq}`]
    );
    pid = p.rows[0].id;
  }
  const lid = `v1|30490${String(seq).padStart(4, "0")}|0`;
  const r = await OBS.query(
    `INSERT INTO sealed_deals (sealed_watchlist_id, source, marketplace, listing_id, title, listing_url, affiliate_url,
       price, shipping, total_price, total_price_usd, market_price, discount_pct, is_active, first_seen_at, last_seen_at,
       exact_verified_at, disqualified_reason)
     VALUES ($1,'ebay','EBAY_US',$2,'Celebrations Elite Trainer Box','u','a',150,0,150,150,361.84,0.59,$3,$4,$5,$6,$7) RETURNING id`,
    [pid, lid, active, firstSeen, lastSeen, exact, reason]
  );
  return { id: r.rows[0].id, key: ["ebay", "EBAY_US", lid], productId: pid };
}
const otherProduct = async (name, set) => {
  seq++;
  const p = await OBS.query(`INSERT INTO sealed_watchlist (name, "set", tcgplayer_id) VALUES ($1, $2, $3) RETURNING id`, [name, set, `7041${seq}`]);
  return p.rows[0].id;
};
const row = async (id) => (await OBS.query("SELECT * FROM sealed_deals WHERE id = $1", [id])).rows[0];
const sightingArgs = (key, pid, { t = "2026-09-11T09:05:00Z", price = 150, market = 361.84, discount = 0.59, title = "Celebrations Elite Trainer Box" } = {}) =>
  [...key, pid, title, price, price, market, discount, t];

async function waitUntilBlocked(client, label) {
  const pid = client.processID;
  for (let i = 0; i < 100; i++) {
    const r = await OBS.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [pid]);
    if (r.rows[0]?.wait_event_type === "Lock") return true;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`${label}: expected the second connection to block on a lock, it did not`);
}

// the full writeGuardedSighting helper, autocommit per statement
async function guardedSighting(client, key, pid, opts = {}) {
  const u1 = await client.query(STATEMENTS.sighting, sightingArgs(key, pid, opts));
  if (u1.rowCount > 0) return "updated";
  const ins = await client.query(STATEMENTS.insertIgnore, sightingArgs(key, pid, opts));
  if (ins.rowCount > 0) return "inserted";
  const u2 = await client.query(STATEMENTS.sighting, sightingArgs(key, pid, opts));
  if (u2.rowCount > 0) return "updated";
  for (const [base, marked] of [
    [la.AVAILABILITY_RETIREMENT.SOLD, la.SEEN_AGAIN.SOLD],
    [la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, la.SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE],
  ]) {
    const m = await client.query(STATEMENTS.markSeenAgain, [...key, base, marked]);
    if (m.rowCount > 0) break;
  }
  return "blocked";
}

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

const T_CHECK = "2026-09-11T09:00:00Z";
const ms = (x) => new Date(x).getTime();

const env = await loadSchema();
console.log(`schema: ${env.files.join(" + ")} | migration columns: ${env.columns.join(", ")} | indexes: ${env.indexes.length}`);
assert.deepEqual(env.columns, ["disqualified_reason", "exact_verified_at"], "the migration must supply exactly these two columns");

await scenario("SC1 verifier retires FIRST (uncommitted), sealed sighting waits on the row lock, then is blocked + marked", async () => {
  const { id, key, productId } = await freshRow();
  await A.query("BEGIN");
  await A.query(STATEMENTS.retire, [id, T_CHECK, la.AVAILABILITY_RETIREMENT.SOLD]);
  const pending = B.query(STATEMENTS.sighting, sightingArgs(key, productId));
  await waitUntilBlocked(B, "SC1");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0, "the re-checked WHERE must exclude the now-retired row");
  assert.equal((await B.query(STATEMENTS.insertIgnore, sightingArgs(key, productId))).rowCount, 0);
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, productId))).rowCount, 0);
  assert.equal((await B.query(STATEMENTS.markSeenAgain, [...key, la.AVAILABILITY_RETIREMENT.SOLD, la.SEEN_AGAIN.SOLD])).rowCount, 1);
  const r = await row(id);
  assert.equal(r.is_active, false, "a sighting never re-activates a sold sealed listing");
  assert.equal(r.disqualified_reason, la.SEEN_AGAIN.SOLD);
  assert.equal(ms(r.last_seen_at), ms("2026-09-11T08:00:00Z"), "last_seen_at untouched");
  assert.equal(ms(r.exact_verified_at), ms(T_CHECK));
  assert.equal(Number(r.price), 150, "no sighting column written");
});

await scenario("SC2 sealed sighting FIRST (uncommitted), verifier retirement waits, then retires -> stays retired", async () => {
  const { id, key, productId } = await freshRow();
  await B.query("BEGIN");
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, productId))).rowCount, 1);
  const pending = A.query(STATEMENTS.retire, [id, T_CHECK, la.AVAILABILITY_RETIREMENT.SOLD]);
  await waitUntilBlocked(A, "SC2");
  await B.query("COMMIT");
  assert.equal((await pending).rowCount, 1);
  const r = await row(id);
  assert.equal(r.is_active, false);
  assert.equal(r.disqualified_reason, la.AVAILABILITY_RETIREMENT.SOLD);
  assert.equal(ms(r.last_seen_at), ms("2026-09-11T09:05:00Z"), "the earlier sighting legitimately happened");
  // and the NEXT daily scan cannot undo it
  assert.equal(await guardedSighting(B, key, productId, { t: "2026-09-12T06:00:00Z" }), "blocked");
  assert.equal((await row(id)).is_active, false);
});

await scenario("SC3 not-found retirement, both orders: stays not-found, never merged into sold", async () => {
  const a = await freshRow();
  await A.query("BEGIN");
  await A.query(STATEMENTS.retire, [a.id, T_CHECK, la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE]);
  const pending = B.query(STATEMENTS.sighting, sightingArgs(a.key, a.productId));
  await waitUntilBlocked(B, "SC3a");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0);
  assert.equal(await guardedSighting(B, a.key, a.productId), "blocked");
  assert.equal((await row(a.id)).disqualified_reason, la.SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE);

  const b = await freshRow();
  await B.query("BEGIN");
  await B.query(STATEMENTS.sighting, sightingArgs(b.key, b.productId));
  const p2 = A.query(STATEMENTS.retire, [b.id, T_CHECK, la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE]);
  await waitUntilBlocked(A, "SC3b");
  await B.query("COMMIT");
  await p2;
  const r = await row(b.id);
  assert.equal(r.disqualified_reason, la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE);
  assert.equal(r.is_active, false);
});

await scenario("SC4 REASSIGNMENT to the correct product preserves first_seen_at and rewrites the comparison", async () => {
  const { id, key, productId } = await freshRow();
  const correct = await otherProduct("30th Celebration Elite Trainer Box", "ME: 30th Celebration");
  assert.notEqual(correct, productId);
  const before = await row(id);
  assert.equal(await guardedSighting(B, key, correct, {
    market: 177.39, discount: 0.1544, title: "Pokemon TCG 30th Anniversary Celebrations Elite Trainer Box ETB",
  }), "updated");
  const r = await row(id);
  assert.equal(Number(r.sealed_watchlist_id), Number(correct), "row moved to the correct product");
  assert.equal(ms(r.first_seen_at), ms(before.first_seen_at), "first_seen_at PRESERVED across reassignment");
  assert.equal(Number(r.market_price), 177.39, "the old product's $361.84 reference is gone");
  assert.notEqual(Number(r.discount_pct), 0.59, "the old saving never follows the listing");
  // the sighting moved last_seen_at, so any earlier confirmation has lapsed
  assert.equal(la.isPositiveActiveConfirmation(r), false, "availability evidence does not survive the change");
});

await scenario("SC5 a reassignment can NOT resurrect a sold row (identity change is not availability evidence)", async () => {
  const { id, key, productId } = await freshRow();
  const correct = await otherProduct("30th Celebration Pokemon Center Elite Trainer Box", "ME: 30th Celebration");
  await A.query(STATEMENTS.retire, [id, T_CHECK, la.AVAILABILITY_RETIREMENT.SOLD]);
  assert.equal(await guardedSighting(B, key, correct, { market: 493.92, discount: 0.2 }), "blocked");
  const r = await row(id);
  assert.equal(r.is_active, false, "still retired");
  assert.equal(Number(r.sealed_watchlist_id), Number(productId), "and not re-homed while retired");
  assert.equal(Number(r.market_price), 361.84, "no comparison rewritten on a blocked write");
  assert.equal(r.disqualified_reason, la.SEEN_AGAIN.SOLD, "only the marker was recorded");
});

await scenario("SC6 two concurrent sightings of a NEW sealed listing: one inserts, the other waits then updates", async () => {
  const pid = await otherProduct("Surging Sparks Booster Box", "Surging Sparks");
  const key = ["ebay", "EBAY_GB", "v1|555000222|0"];
  await A.query("BEGIN");
  assert.equal((await A.query(STATEMENTS.sighting, sightingArgs(key, pid, { price: 30 }))).rowCount, 0);
  assert.equal((await A.query(STATEMENTS.insertIgnore, sightingArgs(key, pid, { price: 30 }))).rowCount, 1);
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, pid, { price: 31 }))).rowCount, 0, "uncommitted insert invisible");
  const pending = B.query(STATEMENTS.insertIgnore, sightingArgs(key, pid, { price: 31 }));
  await waitUntilBlocked(B, "SC6");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0, "conflict -> DO NOTHING");
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, pid, { price: 31 }))).rowCount, 1, "retry updates the live row");
  const rows = (await OBS.query("SELECT * FROM sealed_deals WHERE listing_id = $1", [key[2]])).rows;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].price), 31);
});

await scenario("SC7 recovery reactivation in flight: the sighting's guarded UPDATE skips it, its INSERT waits, then the retry refreshes the now-live row", async () => {
  const { id, key, productId } = await freshRow({ active: false, reason: la.SEEN_AGAIN.SOLD, exact: "2026-09-09T09:00:00Z" });
  await A.query("BEGIN");
  assert.equal((await A.query(STATEMENTS.recoverReactivate, [id, T_CHECK, la.SEEN_AGAIN.SOLD])).rowCount, 1);
  const pending = guardedSighting(B, key, productId);
  await waitUntilBlocked(B, "SC7");
  await A.query("COMMIT");
  assert.equal(await pending, "updated", "conflict -> DO NOTHING -> guarded retry now matches the live row");
  const r = await row(id);
  assert.equal(r.is_active, true);
  assert.equal(r.disqualified_reason, null);
  assert.equal(la.isPositiveActiveConfirmation(r), false, "a later sighting ends the confirmation until the next check");
});

await scenario("SC8 a positive ACTIVE check stamps both timestamps as ONE instant (the only way a sealed row is confirmed)", async () => {
  const { id } = await freshRow();
  await A.query(STATEMENTS.confirmActive, [id, T_CHECK]);
  const r = await row(id);
  assert.equal(la.isPositiveActiveConfirmation(r), true, "exact_verified_at === last_seen_at on a non-retired row");
  assert.equal(la.listingAvailabilityEvidence(r).kind, "confirmed");
});

for (const c of [A, B, OBS]) await c.end();
for (const [s, n, m] of results) console.log(`${s} ${n}${m ? `\n     ${m}` : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(failed ? `\nFAIL: ${failed} of ${results.length}` : `\nPASS: ${results.length} of ${results.length} sealed concurrency scenarios`);
process.exit(failed ? 1 : 0);
