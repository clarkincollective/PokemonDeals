// browse-budget-r1 - the ledger's atomic operations against REAL PostgreSQL
// (PGlite: PostgreSQL 18 compiled to WASM, in-process, no server, no
// production data). The table is created with the production DDL
// (supabase/catalog_snapshot_migration.sql). A thin adapter turns the exact
// supabase-js calls lib/browseBudget.mjs makes (select/eq/maybeSingle,
// insert, update/eq/eq/select) into the SQL PostgREST issues for them:
//   INSERT ... (a duplicate primary key -> SQLSTATE 23505)
//   UPDATE ... SET data, updated_at WHERE kind = $ AND updated_at = $::timestamptz RETURNING kind
// LIMITATION: PGlite has one backend, so statements from overlapping workers
// execute one at a time. What is exercised for real is the compare-and-set
// predicate (a stale version matches zero rows) and the primary-key
// conflict, under interleaving at every await between read and write. True
// multi-connection row locking is Postgres's documented READ COMMITTED
// behaviour for a single UPDATE (the WHERE clause is re-evaluated on the
// latest row version) and is not re-proven here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { acquireBrowseLease, settleBrowseLease, CONSUMER_CAPS, BROWSE_RESERVE } from "../../lib/browseBudget.js";

const H = 3.6e6;
const END = Date.parse("2026-09-16T07:00:00.000Z");
const at = (h) => END - 24 * H + h * H;
const obs = (remaining, end = END) => ({ remaining, limit: 5000, reset: new Date(end).toISOString() });

async function database() {
  const pg = new PGlite();
  await pg.exec(`create table if not exists catalog_snapshot (
    kind text primary key,
    data jsonb not null,
    updated_at timestamptz not null default now()
  );`);
  const stats = { casMisses: 0, casHits: 0, conflicts: 0 };
  // PostgREST renders timestamptz as e.g. 2026-09-15T07:00:00.123+00:00
  const ts = (d) => (d instanceof Date ? d.toISOString().replace("Z", "+00:00") : d);
  const db = {
    from(table) {
      if (table !== "catalog_snapshot") throw new Error(`adapter: unexpected table ${table}`);
      const st = { op: "select", cols: "*", filters: [], values: null, single: false };
      const chain = {
        select(cols) { if (st.op === "select") st.cols = cols; return chain; },
        insert(values) { st.op = "insert"; st.values = values; return chain; },
        update(values) { st.op = "update"; st.values = values; return chain; },
        eq(col, val) { st.filters.push([col, val]); return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      const where = (params) =>
        st.filters.map(([c, v]) => { params.push(v); return c === "updated_at" ? `updated_at = $${params.length}::timestamptz` : `${c} = $${params.length}`; }).join(" and ");
      async function run() {
        try {
          if (st.op === "select") {
            const params = [];
            const r = await pg.query(`select ${st.cols} from catalog_snapshot where ${where(params)}`, params);
            const rows = r.rows.map((x) => ({ ...x, updated_at: ts(x.updated_at) }));
            return { data: st.single ? rows[0] ?? null : rows, error: null };
          }
          if (st.op === "insert") {
            await pg.query(`insert into catalog_snapshot (kind, data, updated_at) values ($1, $2::jsonb, $3::timestamptz)`, [st.values.kind, JSON.stringify(st.values.data), st.values.updated_at]);
            return { data: null, error: null };
          }
          if (st.op === "update") {
            const params = [JSON.stringify(st.values.data), st.values.updated_at];
            const r = await pg.query(`update catalog_snapshot set data = $1::jsonb, updated_at = $2::timestamptz where ${where(params)} returning kind`, params);
            if (r.rows.length) stats.casHits++;
            else stats.casMisses++;
            return { data: r.rows, error: null };
          }
          throw new Error(`adapter: unsupported ${st.op}`);
        } catch (e) {
          if (e.code === "23505") stats.conflicts++;
          return { data: null, error: { code: e.code, message: e.message } };
        }
      }
      return chain;
    },
  };
  const ledger = async (kind) => (await pg.query("select data from catalog_snapshot where kind = $1", [kind])).rows[0]?.data ?? null;
  return { pg, db, stats, ledger };
}

const sumOpen = (l, key) => Object.values(l.open).filter((x) => !key || x.key === key).reduce((t, x) => t + x.granted, 0);

test("PG-1 overlapping acquisitions for one consumer never grant a call twice (real CAS misses and a real primary-key conflict occur)", async () => {
  const { db, stats, ledger } = await database();
  const now = at(23.5); // pace allows the whole 720-call verifier cap
  const wave = (n, offset) =>
    Promise.all(Array.from({ length: n }, (_, i) => acquireBrowseLease(db, { key: "verify", requested: 20, minGrant: 5, observation: obs(5000), now: now + offset + i, ttlMs: 600_000, mode: "enforce" })));
  // wave 1 races to create the window row; wave 2 races on the existing row
  const results = [...(await wave(8, 0)), ...(await wave(40, 100))];
  const granted = results.reduce((t, r) => t + r.granted, 0);
  const kind = results.find((r) => r.lease)?.lease.kind;
  const l = await ledger(kind);
  assert.ok(stats.conflicts >= 1, "several workers raced to create the window row");
  assert.ok(stats.casMisses >= 1, "stale compare-and-set writes matched zero rows");
  assert.ok(granted <= CONSUMER_CAPS.verify, `granted ${granted} <= 720`);
  assert.equal(sumOpen(l, "verify"), granted, "the durable ledger holds exactly the granted units");
  assert.equal(new Set(results.filter((r) => r.lease).map((r) => r.lease.id)).size, results.filter((r) => r.lease).length);
});

test("PG-2 mixed overlapping consumers: every consumer's cap and the provider balance (reserve + verifier commitment) hold together", async () => {
  const { db, ledger } = await database();
  const now = at(20);
  const remaining = 2000;
  const jobs = [];
  for (let i = 0; i < 12; i++) {
    jobs.push({ key: "sweep:EBAY_US", requested: 25, minGrant: 6 });
    jobs.push({ key: "allocated:EBAY_CA", requested: 400, minGrant: 20 });
    jobs.push({ key: "verify", requested: 20, minGrant: 5 });
    jobs.push({ key: "ingest", requested: 42, minGrant: 5 });
  }
  const results = await Promise.all(jobs.map((j, i) => acquireBrowseLease(db, { ...j, observation: obs(remaining), now: now + i, ttlMs: 900_000, mode: "enforce" })));
  const kind = results.find((r) => r.lease).lease.kind;
  const l = await ledger(kind);
  const byKey = {};
  for (const r of results) if (r.lease) byKey[r.lease.key] = (byKey[r.lease.key] ?? 0) + r.granted;
  for (const [k, g] of Object.entries(byKey)) assert.ok(g <= CONSUMER_CAPS[k], `${k}: ${g} <= ${CONSUMER_CAPS[k]}`);
  const discovery = Object.entries(byKey).filter(([k]) => k !== "verify").reduce((t, [, g]) => t + g, 0);
  const verify = byKey.verify ?? 0;
  // discovery never touches the reserve or the verifier's unspent cap
  assert.ok(discovery <= remaining - BROWSE_RESERVE - (CONSUMER_CAPS.verify - verify), `discovery ${discovery}`);
  assert.ok(discovery + verify <= remaining - BROWSE_RESERVE, "nothing granted from the reserve");
  assert.equal(sumOpen(l), discovery + verify);
});

test("PG-3 crash, timeout and late settlement: an unsettled lease is charged in full on expiry and a late settle restores nothing; a normal settle releases only unsent units", async () => {
  const { db, ledger } = await database();
  const now = at(12);
  const ok = await acquireBrowseLease(db, { key: "sweep:EBAY_GB", requested: 26, observation: obs(4000), now, ttlMs: 120_000, mode: "enforce" });
  ok.lease.attempts = 9;
  assert.deepEqual(await settleBrowseLease(db, ok.lease, { now: now + 30_000 }), { settled: true, charged: 9, released: 17 });
  const crashed = await acquireBrowseLease(db, { key: "sweep:EBAY_GB", requested: 26, observation: obs(4000), now: now + 60_000, ttlMs: 120_000, mode: "enforce" });
  assert.equal(crashed.granted, 26);
  // nobody settles it; after expiry the next acquisition charges it in full
  const later = await acquireBrowseLease(db, { key: "sweep:EBAY_GB", requested: 26, observation: obs(4000), now: now + 10 * 60_000, ttlMs: 120_000, mode: "enforce" });
  const l1 = await ledger(later.lease.kind);
  assert.equal(l1.used["sweep:EBAY_GB"], 9 + 26);
  crashed.lease.attempts = 2; // the worker comes back late claiming it only sent 2
  assert.equal((await settleBrowseLease(db, crashed.lease, { now: now + 11 * 60_000 })).reason, "expired_charged_in_full");
  const l2 = await ledger(later.lease.kind);
  assert.equal(l2.used["sweep:EBAY_GB"], 9 + 26, "nothing restored");
});

test("PG-4 reset boundary: an old window's worker cannot obtain or spend the new window's capacity; the new window row starts empty", async () => {
  const { db, ledger } = await database();
  const old = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(900), now: END - 10 * 60_000, ttlMs: 30 * 60_000, mode: "enforce" });
  assert.equal(old.lease.expiresAt, END - 2 * 60_000, "the lease ends at the guard instant, not after the reset");
  const inBand = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(880), now: END - 60_000, ttlMs: 60_000, mode: "enforce" });
  assert.equal(inBand.decision.denied, "window_boundary");
  const next = await acquireBrowseLease(db, { key: "verify", requested: 20, observation: obs(5000, END + 24 * H), now: END + 60_000, ttlMs: 60_000, mode: "enforce" });
  assert.notEqual(next.lease.kind, old.lease.kind);
  const fresh = await ledger(next.lease.kind);
  assert.deepEqual(fresh.used, {});
  assert.equal(sumOpen(fresh), 20);
  // settling the old lease touches only the old row
  old.lease.attempts = 20;
  await settleBrowseLease(db, old.lease, { now: END + 2 * 60_000 });
  assert.deepEqual((await ledger(next.lease.kind)).used, {});
});
