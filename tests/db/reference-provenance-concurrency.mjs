// Phase 17C.10 - comparison/provenance write consistency under REAL
// concurrency.
//
// The danger this exists to rule out: provenance written SEPARATELY from
// the comparison it certifies. If that second write fails, or another
// writer lands between the two, the row ends up carrying a NEW
// market_price with the OLD evidence attached - and stale evidence can
// pass every value check when the new reference happens to carry the SAME
// amount (same price, different printing). So every writer must send the
// comparison and its evidence in ONE statement.
//
//   TEST_DATABASE_URL=postgres://user:pw@localhost:PORT/db \
//   PG_MODULE_BASE=<dir containing node_modules/pg>/  \
//   node tests/db/reference-provenance-concurrency.mjs
//
// Refuses any non-localhost URL (never production).

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
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  console.error("REFUSING: not a local database - this test DROPs and recreates tables");
  process.exit(2);
}
const require = createRequire(process.env.PG_MODULE_BASE ? join(process.env.PG_MODULE_BASE, "x.js") : import.meta.url);
const { Client } = require("pg");
const RP = require(join(ROOT, "lib", "referenceProvenance.js"));
const dq = require(join(ROOT, "lib", "dealQuality.js"));

const connect = async (name) => {
  const c = new Client({ connectionString: url, application_name: name });
  await c.connect();
  return c;
};
const [A, B, OBS] = [await connect("conn_A"), await connect("conn_B"), await connect("observer")];

async function loadSchema() {
  await OBS.query("DROP TABLE IF EXISTS deals CASCADE; DROP TABLE IF EXISTS watchlist CASCADE; DROP TABLE IF EXISTS card_catalog CASCADE;");
  await OBS.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;`);
  // The same ordering tests/db/sold-freshness-concurrency.mjs proves loads
  // cleanly, plus this phase's migration last.
  for (const f of [
    "supabase/deals_schema.sql",
    "supabase/sealed_schema.sql",
    "supabase/watchlist_language_migration.sql",
    "supabase/card_catalog_migration.sql",
    "supabase/currency_migration.sql",
    "supabase/local_first_migration.sql",
    "supabase/deal_availability_migration.sql",
    "supabase/deals_feed_discovery_migration.sql",
    "supabase/reference_provenance_migration.sql",
  ]) {
    try {
      await OBS.query(readFileSync(join(ROOT, f), "utf8"));
    } catch (e) {
      throw new Error(`schema file ${f} failed: ${e.message}`);
    }
  }
  await OBS.query("ALTER TABLE deals ADD COLUMN IF NOT EXISTS disqualified_reason text");
  const cols = await OBS.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='deals' AND column_name LIKE 'reference%' ORDER BY 1`
  );
  return cols.rows.map((r) => r.column_name);
}

let seq = 0;
async function freshRow({ marketPrice = 73.99, printing = "Unlimited Holofoil" } = {}) {
  seq++;
  const w = await OBS.query(
    `INSERT INTO watchlist (name, "set", justtcg_tcgplayer_id) VALUES ($1,'Base Set (Shadowless)','107003') RETURNING id`,
    [`Magneton ${seq}`]
  );
  const lid = `v1|55500${String(seq).padStart(4, "0")}|0`;
  const r = await OBS.query(
    `INSERT INTO deals (watchlist_id, source, marketplace, listing_id, title, listing_url, affiliate_url,
       price, total_price, total_price_usd, market_price, discount_pct, condition, is_graded, is_active, last_seen_at,
       card_tcgplayer_id,
       reference_source, reference_product_id, reference_amount, reference_currency,
       reference_observed_at, reference_synced_at, reference_condition, reference_printing)
     VALUES ($1,'ebay','EBAY_US',$2,'Magneton 009/102','u','a',50,50,50,$3,0.32,'Lightly Played',false,true,'2026-09-11T08:00:00Z',
       '107003','ppt_live','107003',$3,'USD','2026-09-17T00:00:00Z','2026-09-18T00:00:00Z','Lightly Played',$4) RETURNING id`,
    [w.rows[0].id, lid, marketPrice, printing]
  );
  return { id: r.rows[0].id, key: ["ebay", "EBAY_US", lid], watchlistId: w.rows[0].id };
}
const row = async (id) => (await OBS.query("SELECT * FROM deals WHERE id = $1", [id])).rows[0];

// The scanner's write, ATOMIC: comparison + evidence in ONE statement.
const ATOMIC_WRITE = `UPDATE deals SET market_price=$4, discount_pct=$5,
    reference_source=$6, reference_product_id=$7, reference_amount=$8, reference_currency=$9,
    reference_observed_at=$10, reference_synced_at=$11, reference_condition=$12, reference_printing=$13
  WHERE source=$1 AND marketplace=$2 AND listing_id=$3 RETURNING id`;
// The REJECTED shape, kept only to demonstrate what it would allow.
const COMPARISON_ONLY = `UPDATE deals SET market_price=$4, discount_pct=$5
  WHERE source=$1 AND marketplace=$2 AND listing_id=$3 RETURNING id`;

const results = [];
const scenario = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message]);
    await A.query("ROLLBACK").catch(() => {});
    await B.query("ROLLBACK").catch(() => {});
  }
};

const cols = await loadSchema();
console.log(`migration columns on deals: ${cols.length} (${cols.join(", ")})`);
assert.ok(cols.includes("reference_observed_at") && cols.includes("reference_synced_at"));

await scenario("RC1 SAME PRICE, DIFFERENT PRINTING: the atomic write replaces the evidence, so amount equality cannot validate the stale reference", async () => {
  // stored: $73.99 for the Unlimited Holofoil printing
  const { id, key } = await freshRow({ marketPrice: 73.99, printing: "Unlimited Holofoil" });
  const before = await row(id);
  assert.equal(dq.storedReferenceEvidence(before).kind, "raw", "starts out evidenced");

  // the SAME figure is now sourced from a DIFFERENT printing
  await A.query(ATOMIC_WRITE, [...key, 73.99, 0.32, "ppt_live", "107003", 73.99, "USD", "2026-09-19T00:00:00Z", "2026-09-19T00:00:00Z", "Lightly Played", "1st Edition Holofoil"]);
  const after = await row(id);
  assert.equal(Number(after.market_price), 73.99, "the price is unchanged - amount equality proves nothing here");
  assert.equal(after.reference_printing, "1st Edition Holofoil", "the evidence moved WITH the comparison");
  assert.notEqual(after.reference_printing, before.reference_printing);
});

await scenario("RC2 a comparison-only write (the rejected non-atomic shape) is exactly what leaves stale evidence", async () => {
  const { id, key } = await freshRow({ marketPrice: 73.99, printing: "Unlimited Holofoil" });
  // simulate the failure mode: comparison updated, evidence write lost
  await A.query(COMPARISON_ONLY, [...key, 73.99, 0.40]);
  const after = await row(id);
  assert.equal(after.reference_printing, "Unlimited Holofoil", "stale printing survives");
  // and it still passes every VALUE check, which is why atomicity is the fix
  assert.ok(dq.storedReferenceEvidence(after), "stale evidence still validates on amount+identity+condition alone");
  assert.equal(RP.referenceAmountMatches(after), true, "amount equality alone cannot detect this");
});

await scenario("RC3 both write orders: whichever writer commits last, evidence and comparison always agree", async () => {
  for (const order of [["A", "B"], ["B", "A"]]) {
    const { id, key } = await freshRow({ marketPrice: 73.99, printing: "Unlimited Holofoil" });
    const first = order[0] === "A" ? A : B;
    const second = order[0] === "A" ? B : A;

    await first.query("BEGIN");
    await first.query(ATOMIC_WRITE, [...key, 80.0, 0.35, "ppt_live", "107003", 80.0, "USD", "2026-09-19T00:00:00Z", "2026-09-19T00:00:00Z", "Lightly Played", "Unlimited Holofoil"]);
    const pending = second.query(ATOMIC_WRITE, [...key, 91.5, 0.2, "ppt_live", "107003", 91.5, "USD", "2026-09-20T00:00:00Z", "2026-09-20T00:00:00Z", "Lightly Played", "1st Edition Holofoil"]);
    // the second writer blocks on the row lock until the first commits
    for (let i = 0; i < 100; i++) {
      const r = await OBS.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [second.processID]);
      if (r.rows[0]?.wait_event_type === "Lock") break;
      await new Promise((res) => setTimeout(res, 20));
    }
    await first.query("COMMIT");
    await pending;

    const r = await row(id);
    assert.equal(Number(r.market_price), Number(r.reference_amount), `[${order}] amount always describes the stored price`);
    assert.equal(Number(r.market_price), 91.5, `[${order}] last writer wins, wholly`);
    assert.equal(r.reference_printing, "1st Edition Holofoil", `[${order}] and its evidence came with it`);
    assert.ok(dq.storedReferenceEvidence(r), `[${order}] the surviving row is self-consistent`);
  }
});

await scenario("RC4 if the write fails, NOTHING changes - comparison and evidence stay in step", async () => {
  const { id, key } = await freshRow({ marketPrice: 73.99, printing: "Unlimited Holofoil" });
  const before = await row(id);
  // a failing atomic write (bad column value) must leave the row untouched
  await A.query("BEGIN");
  try {
    await A.query(
      `UPDATE deals SET market_price=$4, discount_pct=$5, reference_amount='not-a-number'
       WHERE source=$1 AND marketplace=$2 AND listing_id=$3`,
      [...key, 120.0, 0.5]
    );
    throw new Error("expected the invalid write to fail");
  } catch (e) {
    assert.match(e.message, /invalid input syntax|numeric/i);
  }
  await A.query("ROLLBACK");
  const after = await row(id);
  assert.equal(Number(after.market_price), Number(before.market_price), "price unchanged");
  assert.equal(after.reference_printing, before.reference_printing, "evidence unchanged");
  assert.equal(Number(after.reference_amount), Number(after.market_price), "still in step");
});

await scenario("RC5 a reassignment that cannot evidence the new comparison clears, atomically", async () => {
  const { id, key } = await freshRow({ marketPrice: 73.99, printing: "Unlimited Holofoil" });
  const cleared = RP.clearedReference(RP.CARD_REFERENCE_COLUMNS);
  const setSql = Object.keys(cleared).map((c, i) => `${c}=$${i + 6}`).join(", ");
  await A.query(
    `UPDATE deals SET market_price=$4, discount_pct=$5, ${setSql} WHERE source=$1 AND marketplace=$2 AND listing_id=$3`,
    [...key, 250.0, 0.6, ...Object.keys(cleared).map(() => null)]
  );
  const after = await row(id);
  assert.equal(Number(after.market_price), 250.0);
  for (const c of RP.CARD_REFERENCE_COLUMNS) assert.equal(after[c], null, `${c} cleared with the comparison`);
  assert.equal(dq.storedReferenceEvidence(after), null, "no evidence -> the row stays plain, never falsely certified");
});

for (const c of [A, B, OBS]) await c.end();
for (const [s, n, m] of results) console.log(`${s} ${n}${m ? `\n     ${m}` : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(failed ? `\nFAIL: ${failed} of ${results.length}` : `\nPASS: ${results.length} of ${results.length} provenance-consistency scenarios`);
process.exit(failed ? 1 : 0);
