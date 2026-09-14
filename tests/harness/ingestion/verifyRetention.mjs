// graded-retention-r1 - runs the REAL app/api/verify-deals GET handler as
// separate invocations against one in-memory database (catalog_snapshot
// with its real primary key on `kind`), offline. Provider verdicts come
// from snapshotFor. Synthetic, clearly-labelled rows - not production data.
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMemoryDb } from "./memoryDb.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
process.env.CRON_SECRET = "harness";
console.log = () => {}; // the route's structured completion line would corrupt the JSON output
const T0 = Date.now();
let clock = T0;
Date.now = () => clock;
const iso = (h) => new Date(T0 + h * 3.6e6).toISOString();

const row = (over) => {
  const id = over.id;
  const legacy = over.legacy ?? String(300000000000 + id);
  const { legacy: _l, ...rest } = over;
  return {
    id, watchlist_id: null, source: "ebay", listing_id: `v1|${legacy}|0`, marketplace: "EBAY_US",
    listing_type: "FIXED_PRICE", is_active: true, is_graded: true, grader: "PSA", grade: "10", condition: "Graded",
    // not canonical art, so the BIN freshness reserve (which fills first)
    // leaves these slabs to the lane
    card_language: "english", card_name: "Charizard GX", card_set: "SM - Hidden Fates", card_tcgplayer_id: "syn-42360",
    title: "Charizard GX 9/68 SM Hidden Fates Holo Rare PSA 10", market_price: 400, discount_pct: 0.3,
    auction_end_at: null, price: 280, shipping: 0, currency: "USD",
    listing_url: `https://www.ebay.com/itm/${legacy}?x=1`, affiliate_url: `https://www.ebay.com/itm/${legacy}?x=1&campid=5`,
    image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg", disqualified_reason: null,
    visual_authenticity_status: null, visual_authenticity_reason: null, seller_feedback_score: 5000,
    first_seen_at: iso(-40), last_seen_at: iso(-1), exact_verified_at: null, ...rest,
  };
};
// raw, just added and never verified: they outrank graded rows in the general
// ranking (enough for every run), so graded rows are reachable only via the
// lane. Without them the general ranking can pick an UNKNOWN row on its own -
// pre-existing behaviour, outside this lane.
const raws = () =>
  Array.from({ length: 160 }, (_, i) =>
    row({ id: 100 + i, card_tcgplayer_id: "42360", is_graded: false, grader: null, grade: null, condition: "Near Mint", title: "Charizard GX 9/68 SM Hidden Fates Holo Rare", first_seen_at: iso(-2 - i * 0.001), last_seen_at: iso(-1) })
  );
const VERDICT = { "300000000001": "UNKNOWN", "300000000003": "UNKNOWN", "300000000004": "ACTIVE" };

function makeDb(graded) {
  return createMemoryDb(
    { deals: [...graded, ...raws()], catalog_snapshot: [{ kind: "digest_state", data: { unrelated: true }, updated_at: iso(-100) }], sealed_deals: [], ebay_job_runs: [] },
    { unique: { catalog_snapshot: ["kind"] } }
  );
}
const harness = { calls: {}, db: null, snapshotFor: (legacy) => ({ status: VERDICT[legacy] ?? "ACTIVE", calls: 1, evidence: "harness" }) };
globalThis.__ingestHarness = harness;

// catalog_snapshot failure modes; every other table untouched
function withSnapshotFault(db, fault) {
  return {
    ...db,
    from(name) {
      if (name !== "catalog_snapshot") return db.from(name);
      const real = db.from(name);
      const chain = {};
      let op = "select";
      for (const m of ["select", "eq", "like", "gte", "lt", "limit", "maybeSingle"]) chain[m] = (...a) => { real[m](...a); return chain; };
      for (const m of ["insert", "update", "delete"]) chain[m] = (...a) => { op = m; real[m](...a); return chain; };
      chain.then = (resolve, reject) => {
        if (fault === "read" && op === "select") return resolve({ data: null, error: { message: "harness: read unavailable" } });
        if (fault === "write" && op !== "select") return resolve({ data: null, error: { code: "08006", message: "harness: write unavailable" } });
        return real.then(resolve, reject);
      };
      return chain;
    },
  };
}

const mod = await import(pathToFileURL(join(REPO, "app", "api", "verify-deals", "route.js")).href);
const snapRow = (db, id) => {
  const r = db.tables.deals.find((x) => x.id === id);
  if (!r) return null;
  return { is_active: r.is_active, disqualified_reason: r.disqualified_reason, first_seen_at: r.first_seen_at, last_seen_at: r.last_seen_at, exact_verified_at: r.exact_verified_at };
};
const record = (db) => Object.fromEntries(db.tables.catalog_snapshot.map((r) => [r.kind, { data: r.data, updated_at: r.updated_at }]));

async function invoke(db, label) {
  harness.calls = {};
  harness.db = db;
  const res = await mod.GET(new Request("http://harness/api/verify-deals", { headers: { authorization: "Bearer harness" } }));
  const body = await res.json();
  return { label, allocation: body.allocation, verified: body.verified, calls: body.calls, checked: body.detail.map((d) => [d.id, d.status]) };
}
async function run(db, label, atHours, { fault = null } = {}) {
  clock = T0 + atHours * 3.6e6;
  const out = await invoke(fault ? withSnapshotFault(db, fault) : db, label);
  return { ...out, rows: Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, snapRow(db, id)])), record: record(db) };
}

// ---- sequence: one database, separate invocations over time ----
const seqDb = makeDb([
  row({ id: 1, legacy: "300000000001", last_seen_at: iso(-23) }), // item A, US copy
  row({ id: 2, legacy: "300000000001", marketplace: "EBAY_GB", last_seen_at: iso(-22) }), // item A, GB copy
  row({ id: 3, last_seen_at: iso(-20) }), // B
  row({ id: 4, last_seen_at: iso(-14) }), // C
  row({ id: 5, last_seen_at: iso(-21), disqualified_reason: "review:language_unverified" }),
]);
const seed = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, snapRow(seqDb, id)]));
const sequence = [];
sequence.push(await run(seqDb, "run1", 0));
sequence.push(await run(seqDb, "run2 +30m", 0.5));
sequence.push(await run(seqDb, "run3 +1h", 1));
sequence.push(await run(seqDb, "run4 +2h05m", 2.08));

// ---- persistence faults on a fresh database with eligible slabs ----
const faultRows = () => [row({ id: 1, legacy: "300000000001", last_seen_at: iso(-23) }), row({ id: 3, last_seen_at: iso(-20) }), row({ id: 4, last_seen_at: iso(-14) })];
const writeDb = makeDb(faultRows());
const readDb = makeDb(faultRows());
const faults = [
  { ...(await run(writeDb, "reservation writes fail", 0, { fault: "write" })), dealsWrites: writeDb.writes.filter((w) => w.table === "deals" && [1, 3, 4].includes(w.row.id)).length },
  { ...(await run(readDb, "cooldown read fails", 0, { fault: "read" })), dealsWrites: readDb.writes.filter((w) => w.table === "deals" && [1, 3, 4].includes(w.row.id)).length },
];

// ---- concurrency: two overlapping invocations on one database ----
clock = T0;
const conDb = makeDb([1, 3, 4, 6].map((id, i) => row({ id, last_seen_at: iso(-23 + i) })));
const [ra, rb] = await Promise.all([invoke(conDb, "overlap-a"), invoke(conDb, "overlap-b")]);
const concurrent = { runs: [ra, rb], record: record(conDb) };

process.stdout.write(JSON.stringify({ T0: new Date(T0).toISOString(), seed, sequence, faults, concurrent }, null, 1));
