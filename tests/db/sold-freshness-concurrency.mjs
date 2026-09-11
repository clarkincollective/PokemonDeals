// Sold-item freshness - the guarded writes under REAL concurrency.
//
// Runs the exact SQL PostgREST generates for lib/listingAvailability's
// calls (see STATEMENTS below) on TWO concurrent connections against a
// DISPOSABLE local Postgres, in both commit orders, with the repo's own
// deals schema + BEFORE INSERT/UPDATE triggers loaded.
//
//   TEST_DATABASE_URL=postgres://user:pw@localhost:PORT/db \
//   PG_MODULE_BASE=<dir containing node_modules/pg>/  \
//   node tests/db/sold-freshness-concurrency.mjs
//
// Refuses any non-localhost URL (never production). `pg` is not a project
// dependency; PG_MODULE_BASE points at a scratch install.
//
// What it does NOT cover: PostgREST itself (the translation of the
// supabase-js filters into this SQL is asserted below as a string contract,
// and the or() clause was validated read-only against production), and any
// production trigger/policy not present in supabase/*.sql.

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
// The contract between supabase-js calls and SQL. If these constants drift,
// the SQL below no longer represents production and the test must change.
assert.equal(la.SIGHTING_WRITABLE_OR, 'disqualified_reason.is.null,disqualified_reason.not.like."availability:*"');
assert.equal(la.AVAILABILITY_RETIREMENT.SOLD, "availability:sold");
assert.equal(la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, "availability:not_found_in_marketplace");
assert.equal(la.SEEN_AGAIN.SOLD, "availability:sold:seen_again");

const KEY = "source = $1 AND marketplace = $2 AND listing_id = $3";
const STATEMENTS = {
  // writeDiscoverySighting step 1 / 3:
  //   update(core).match(key).or(SIGHTING_WRITABLE_OR).select("id")
  sighting: `UPDATE deals SET watchlist_id = $4, title = $5, price = $6, total_price = $7, discount_pct = $8,
               is_active = true, last_seen_at = $9, discovery_source = COALESCE($10, discovery_source)
             WHERE ${KEY} AND (disqualified_reason IS NULL OR disqualified_reason NOT LIKE 'availability:%')
             RETURNING id`,
  // step 2: upsert(core, { onConflict, ignoreDuplicates: true }).select("id")
  insertIgnore: `INSERT INTO deals (source, marketplace, listing_id, watchlist_id, title, listing_url, affiliate_url,
                   price, total_price, market_price, discount_pct, is_active, last_seen_at, discovery_source, card_catalog_id)
                 VALUES ($1, $2, $3, $4, $5, 'u', 'a', $6, $7, 100, $8, true, $9, COALESCE($10, 'scan'), $11)
                 ON CONFLICT (source, marketplace, listing_id) DO NOTHING RETURNING id`,
  // step 4: update({ disqualified_reason: marked }).match(key).eq("disqualified_reason", base).select("id")
  markSeenAgain: `UPDATE deals SET disqualified_reason = $5 WHERE ${KEY} AND disqualified_reason = $4 RETURNING id`,
  // verify-deals retirement: update(patch).eq("id", r.id)
  retire: `UPDATE deals SET is_active = false, exact_verified_at = $2, disqualified_reason = $3 WHERE id = $1`,
  // verify-deals recovery: update(patch).eq("id").eq("is_active", false).eq("disqualified_reason", marker).select("id")
  recoverReactivate: `UPDATE deals SET is_active = true, disqualified_reason = NULL, last_seen_at = $2, exact_verified_at = $2
                      WHERE id = $1 AND is_active = false AND disqualified_reason = $3 RETURNING id`,
  recoverRetain: `UPDATE deals SET disqualified_reason = $2 WHERE id = $1 AND is_active = false AND disqualified_reason = $3 RETURNING id`,
};

// ---------------------------------------------------------------------------
const connect = async (name) => {
  const c = new Client({ connectionString: url, application_name: name });
  await c.connect();
  return c;
};
const [A, B, OBS] = [await connect("conn_A"), await connect("conn_B"), await connect("observer")];

async function loadSchema() {
  await OBS.query("DROP TABLE IF EXISTS deals CASCADE; DROP TABLE IF EXISTS watchlist CASCADE; DROP TABLE IF EXISTS card_catalog CASCADE;");
  // Supabase roles the schema files grant to / reference
  await OBS.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;`);
  const files = [
    "supabase/deals_schema.sql",
    "supabase/sealed_schema.sql",
    "supabase/watchlist_language_migration.sql",
    "supabase/card_catalog_migration.sql",
    "supabase/currency_migration.sql",
    "supabase/local_first_migration.sql",
    "supabase/deal_availability_migration.sql",
    "supabase/deals_feed_discovery_migration.sql",
  ];
  const loaded = [];
  for (const f of files) {
    try {
      await OBS.query(readFileSync(join(ROOT, f), "utf8"));
      loaded.push(f);
    } catch (e) {
      throw new Error(`schema file ${f} failed: ${e.message}`);
    }
  }
  // disqualified_reason exists in production as nullable text (checked
  // read-only via the PostgREST OpenAPI schema); no repo migration adds it.
  await OBS.query("ALTER TABLE deals ADD COLUMN IF NOT EXISTS disqualified_reason text");
  const trig = await OBS.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'deals'::regclass AND NOT tgisinternal ORDER BY 1");
  const iso = await OBS.query("SHOW default_transaction_isolation");
  return { loaded, triggers: trig.rows.map((r) => r.tgname), isolation: iso.rows[0].default_transaction_isolation };
}

let listingSeq = 0;
async function freshRow({ reason = null, active = true, lastSeen = "2026-09-11T08:00:00Z", exact = null } = {}) {
  const w = await OBS.query(
    `INSERT INTO watchlist (name, "set", justtcg_tcgplayer_id) VALUES ($1, 'Base Set', '4242') RETURNING id`,
    [`Pikachu ${++listingSeq}`]
  );
  const lid = `v1|39820490${String(listingSeq).padStart(4, "0")}|0`;
  const r = await OBS.query(
    `INSERT INTO deals (watchlist_id, source, marketplace, listing_id, title, listing_url, affiliate_url, price, total_price,
                        market_price, discount_pct, is_active, last_seen_at, exact_verified_at, disqualified_reason)
     VALUES ($1, 'ebay', 'EBAY_US', $2, 'Pikachu 58/102', 'u', 'a', 26, 28, 40, 0.3, $3, $4, $5, $6) RETURNING id`,
    [w.rows[0].id, lid, active, lastSeen, exact, reason]
  );
  return { id: r.rows[0].id, key: ["ebay", "EBAY_US", lid], watchlistId: w.rows[0].id };
}
const row = async (id) => (await OBS.query("SELECT * FROM deals WHERE id = $1", [id])).rows[0];
const sightingArgs = (key, wid, { t = "2026-09-11T09:05:00Z", price = 25, discoverySource = null } = {}) => [...key, wid, "Pikachu 58/102", price, price + 2, 0.33, t, discoverySource];
const insertArgs = (key, wid, { t = "2026-09-11T09:05:00Z", price = 25 } = {}) => [...key, wid, "Pikachu 58/102", price, price + 2, 0.33, t, null, null];

// Is `client` currently blocked on a row/tuple lock?
async function waitUntilBlocked(client, label) {
  const pid = client.processID;
  for (let i = 0; i < 100; i++) {
    const r = await OBS.query("SELECT wait_event_type, state FROM pg_stat_activity WHERE pid = $1", [pid]);
    if (r.rows[0]?.wait_event_type === "Lock") return true;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`${label}: expected the second connection to block on a lock, it did not`);
}

// writeDiscoverySighting, step by step, on one connection (autocommit per
// statement, exactly like one PostgREST request per call)
async function discoverySighting(client, key, wid, opts = {}) {
  const u1 = await client.query(STATEMENTS.sighting, sightingArgs(key, wid, opts));
  if (u1.rowCount > 0) return "updated";
  const ins = await client.query(STATEMENTS.insertIgnore, insertArgs(key, wid, opts));
  if (ins.rowCount > 0) return "inserted";
  const u2 = await client.query(STATEMENTS.sighting, sightingArgs(key, wid, opts));
  if (u2.rowCount > 0) return "updated";
  for (const [base, marked] of [[la.AVAILABILITY_RETIREMENT.SOLD, la.SEEN_AGAIN.SOLD], [la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, la.SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE]]) {
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
console.log(`schema: ${env.loaded.length} repo files | triggers on deals: ${env.triggers.join(", ")} | isolation: ${env.isolation}`);
assert.ok(env.triggers.includes("deals_resolve_card_trg") && env.triggers.includes("deals_merge_discovery_source_trg"));

await scenario("C1 verifier retires FIRST (uncommitted), sighting waits on the row lock, then finds nothing to update -> blocked + marked", async () => {
  const { id, key, watchlistId } = await freshRow();
  await A.query("BEGIN");
  await A.query(STATEMENTS.retire, [id, T_CHECK, la.AVAILABILITY_RETIREMENT.SOLD]);
  const pending = B.query(STATEMENTS.sighting, sightingArgs(key, watchlistId));
  await waitUntilBlocked(B, "C1");
  await A.query("COMMIT");
  const u1 = await pending;
  assert.equal(u1.rowCount, 0, "the re-checked WHERE must exclude the now-retired row");
  // the rest of writeDiscoverySighting
  assert.equal((await B.query(STATEMENTS.insertIgnore, insertArgs(key, watchlistId))).rowCount, 0);
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, watchlistId))).rowCount, 0);
  assert.equal((await B.query(STATEMENTS.markSeenAgain, [...key, la.AVAILABILITY_RETIREMENT.SOLD, la.SEEN_AGAIN.SOLD])).rowCount, 1);
  const r = await row(id);
  assert.equal(r.is_active, false);
  assert.equal(r.disqualified_reason, la.SEEN_AGAIN.SOLD);
  assert.equal(ms(r.last_seen_at), ms("2026-09-11T08:00:00Z"), "last_seen_at untouched");
  assert.equal(ms(r.exact_verified_at), ms(T_CHECK));
  assert.equal(Number(r.price), 26, "no sighting column written");
  assert.equal((await OBS.query("SELECT count(*)::int n FROM deals WHERE listing_id = $1", [key[2]])).rows[0].n, 1);
});

await scenario("C2 sighting FIRST (uncommitted), verifier retirement waits, then retires -> retired as sold", async () => {
  const { id, key, watchlistId } = await freshRow();
  await B.query("BEGIN");
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, watchlistId))).rowCount, 1);
  const pending = A.query(STATEMENTS.retire, [id, T_CHECK, la.AVAILABILITY_RETIREMENT.SOLD]);
  await waitUntilBlocked(A, "C2");
  await B.query("COMMIT");
  assert.equal((await pending).rowCount, 1);
  const r = await row(id);
  assert.equal(r.is_active, false);
  assert.equal(r.disqualified_reason, la.AVAILABILITY_RETIREMENT.SOLD);
  assert.equal(ms(r.last_seen_at), ms("2026-09-11T09:05:00Z"), "the earlier sighting legitimately happened");
  // and the NEXT sighting is blocked (autocommit, full helper)
  assert.equal(await discoverySighting(B, key, watchlistId, { t: "2026-09-11T09:10:00Z" }), "blocked");
  assert.equal((await row(id)).is_active, false);
});

await scenario("C3 not-found retirement, both orders: stays not-found (never merged into sold), marker keeps the family", async () => {
  const a = await freshRow();
  await A.query("BEGIN");
  await A.query(STATEMENTS.retire, [a.id, T_CHECK, la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE]);
  const pending = B.query(STATEMENTS.sighting, sightingArgs(a.key, a.watchlistId));
  await waitUntilBlocked(B, "C3a");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0);
  assert.equal(await discoverySighting(B, a.key, a.watchlistId), "blocked");
  assert.equal((await row(a.id)).disqualified_reason, la.SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE);

  const b = await freshRow();
  await B.query("BEGIN");
  await B.query(STATEMENTS.sighting, sightingArgs(b.key, b.watchlistId));
  const p2 = A.query(STATEMENTS.retire, [b.id, T_CHECK, la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE]);
  await waitUntilBlocked(A, "C3b");
  await B.query("COMMIT");
  await p2;
  const r = await row(b.id);
  assert.equal(r.disqualified_reason, la.AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE);
  assert.equal(r.is_active, false);
});

await scenario("C4 feed payload (discovery_source 'external') against a retired row: blocked, triggers do not rewrite anything", async () => {
  const { id, key, watchlistId } = await freshRow();
  await A.query(STATEMENTS.retire, [id, T_CHECK, la.AVAILABILITY_RETIREMENT.SOLD]);
  assert.equal(await discoverySighting(B, key, watchlistId, { discoverySource: "external" }), "blocked");
  const r = await row(id);
  assert.equal(r.discovery_source, "scan", "merge trigger never ran - no UPDATE touched the row except the marker");
  assert.equal(r.disqualified_reason, la.SEEN_AGAIN.SOLD);
});

await scenario("C5 two concurrent sightings of a NEW listing: one inserts, the other waits on the unique index, then updates via the retry", async () => {
  const w = await OBS.query(`INSERT INTO watchlist (name, "set", justtcg_tcgplayer_id) VALUES ('Mew C5', 'Promo', '9001') RETURNING id`);
  const wid = w.rows[0].id;
  const key = ["ebay", "EBAY_GB", "v1|555000111|0"];
  await A.query("BEGIN");
  assert.equal((await A.query(STATEMENTS.sighting, sightingArgs(key, wid, { price: 30 }))).rowCount, 0);
  assert.equal((await A.query(STATEMENTS.insertIgnore, insertArgs(key, wid, { price: 30 }))).rowCount, 1);
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, wid, { price: 31 }))).rowCount, 0, "uncommitted insert invisible");
  const pending = B.query(STATEMENTS.insertIgnore, insertArgs(key, wid, { price: 31 }));
  await waitUntilBlocked(B, "C5");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0, "conflict -> DO NOTHING");
  assert.equal((await B.query(STATEMENTS.sighting, sightingArgs(key, wid, { price: 31 }))).rowCount, 1, "retry updates the live row");
  const rows = (await OBS.query("SELECT * FROM deals WHERE listing_id = $1", [key[2]])).rows;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].price), 31);
  assert.equal(rows[0].card_name, "Mew C5", "resolve-card trigger ran on insert");
});

await scenario("C6 recovery reactivation in flight: the sighting's guarded UPDATE skips the (still retired) row, its INSERT waits on the recovery transaction, then the retry refreshes the now-live row", async () => {
  const { id, key, watchlistId } = await freshRow({ active: false, reason: la.SEEN_AGAIN.SOLD, exact: "2026-09-09T09:00:00Z" });
  await A.query("BEGIN");
  assert.equal((await A.query(STATEMENTS.recoverReactivate, [id, T_CHECK, la.SEEN_AGAIN.SOLD])).rowCount, 1);
  // B's UPDATE sees the committed retired row, which fails its WHERE (no
  // lock taken); B's INSERT ... ON CONFLICT then has to wait for A to
  // decide the conflicting row.
  const pending = discoverySighting(B, key, watchlistId);
  await waitUntilBlocked(B, "C6");
  await A.query("COMMIT");
  assert.equal(await pending, "updated", "conflict -> DO NOTHING -> guarded retry now matches the live row");
  const r = await row(id);
  assert.equal(r.is_active, true);
  assert.equal(r.disqualified_reason, null);
  assert.equal(ms(r.exact_verified_at), ms(T_CHECK));
  assert.equal(ms(r.last_seen_at), ms("2026-09-11T09:05:00Z"), "the sighting after the check moved last_seen_at");
  assert.equal(la.listingAvailabilityEvidence(r).kind, "seen", "and the page stops claiming a confirmation");
  assert.equal((await OBS.query("SELECT count(*)::int n FROM deals WHERE listing_id = $1", [key[2]])).rows[0].n, 1);
});

await scenario("C7 sighting FIRST on a seen-again row (blocked, nothing locked), then recovery: exactly one recovery write applies", async () => {
  const { id, key, watchlistId } = await freshRow({ active: false, reason: la.SEEN_AGAIN.SOLD, exact: "2026-09-09T09:00:00Z" });
  assert.equal(await discoverySighting(B, key, watchlistId), "blocked");
  assert.equal((await row(id)).disqualified_reason, la.SEEN_AGAIN.SOLD, "an already-marked row is not re-marked");
  // two overlapping recovery writes conditioned on the same marker
  await A.query("BEGIN");
  assert.equal((await A.query(STATEMENTS.recoverRetain, [id, la.AVAILABILITY_RETIREMENT.SOLD, la.SEEN_AGAIN.SOLD])).rowCount, 1);
  const pending = B.query(STATEMENTS.recoverReactivate, [id, T_CHECK, la.SEEN_AGAIN.SOLD]);
  await waitUntilBlocked(B, "C7");
  await A.query("COMMIT");
  assert.equal((await pending).rowCount, 0, "marker already consumed -> second write skipped");
  const r = await row(id);
  assert.equal(r.is_active, false);
  assert.equal(r.disqualified_reason, la.AVAILABILITY_RETIREMENT.SOLD);
});

await scenario("C8 a quality-disqualified row is still refreshable (pre-existing semantics) and keeps its reason", async () => {
  const { id, key, watchlistId } = await freshRow({ active: false, reason: "condition:damaged" });
  assert.equal(await discoverySighting(B, key, watchlistId), "updated");
  const r = await row(id);
  assert.equal(r.disqualified_reason, "condition:damaged");
});

for (const c of [A, B, OBS]) await c.end();
for (const [s, n, m] of results) console.log(`${s} ${n}${m ? `\n     ${m}` : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(failed ? `\nFAIL: ${failed} of ${results.length}` : `\nPASS: ${results.length} of ${results.length} concurrency scenarios`);
process.exit(failed ? 1 : 0);
