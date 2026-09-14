// graded-retention-r1 - runs the REAL app/api/verify-deals GET handler
// several times against one in-memory database (separate invocations, the
// same durable tables between them), offline. Provider verdicts come from
// snapshotFor. Synthetic, clearly-labelled rows - not production evidence.
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

let n = 0;
const row = (over) => {
  const id = over.id ?? ++n;
  const legacy = over.legacy ?? String(300000000000 + id);
  const { legacy: _l, ...rest } = over;
  return {
    id, watchlist_id: null, source: "ebay", listing_id: `v1|${legacy}|0`, marketplace: "EBAY_US",
    listing_type: "FIXED_PRICE", is_active: true, is_graded: true, grader: "PSA", grade: "10", condition: "Graded",
    card_language: "english", card_name: "Charizard GX", card_set: "SM - Hidden Fates", card_tcgplayer_id: "syn-42360",
    title: "Charizard GX 9/68 SM Hidden Fates Holo Rare PSA 10", market_price: 400, discount_pct: 0.3,
    auction_end_at: null, price: 280, shipping: 0, currency: "USD",
    listing_url: `https://www.ebay.com/itm/${legacy}?x=1`, affiliate_url: `https://www.ebay.com/itm/${legacy}?x=1&campid=5`,
    image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg", disqualified_reason: null,
    visual_authenticity_status: null, visual_authenticity_reason: null, seller_feedback_score: 5000,
    first_seen_at: iso(-40), last_seen_at: iso(-1), exact_verified_at: null, ...rest,
  };
};

// graded, aging (24h tier): A has two marketplace copies of ONE eBay item.
// Synthetic ids are not canonical art, so the BIN freshness reserve (which
// fills first) does not take them - the lane itself is what is exercised.
const A_US = row({ id: 1, legacy: "300000000001", last_seen_at: iso(-23) });
const A_GB = row({ id: 2, legacy: "300000000001", marketplace: "EBAY_GB", last_seen_at: iso(-22) });
const B = row({ id: 3, last_seen_at: iso(-20) });
const C = row({ id: 4, last_seen_at: iso(-14) });
const HELD = row({ id: 5, last_seen_at: iso(-21), disqualified_reason: "review:language_unverified" });
// raw, just added and never verified: they outrank graded rows in the
// general ranking (enough for every run), so the graded rows are reachable
// only via the lane. NOTE: without them the general ranking can pick an
// UNKNOWN row again on its own - pre-existing behaviour, outside this lane.
const raws = Array.from({ length: 120 }, (_, i) =>
  row({ id: 100 + i, card_tcgplayer_id: "42360", is_graded: false, grader: null, grade: null, condition: "Near Mint", title: "Charizard GX 9/68 SM Hidden Fates Holo Rare", first_seen_at: iso(-2 - i * 0.001), last_seen_at: iso(-1) })
);
const VERDICT = { "300000000001": "UNKNOWN", [String(300000000003)]: "UNKNOWN", [String(300000000004)]: "ACTIVE" };

const db = createMemoryDb({ deals: [A_US, A_GB, B, C, HELD, ...raws], catalog_snapshot: [], sealed_deals: [], ebay_job_runs: [] });
const harness = {
  calls: {},
  db,
  snapshotFor: (legacy) => ({ status: VERDICT[legacy] ?? "ACTIVE", calls: 1, evidence: "harness" }),
};
globalThis.__ingestHarness = harness;
const failingSnapshotDb = {
  ...db,
  from(name) {
    if (name !== "catalog_snapshot") return db.from(name);
    const chain = {};
    for (const m of ["select", "eq", "maybeSingle", "upsert"]) chain[m] = () => chain;
    chain.then = (resolve) => resolve({ data: null, error: { message: "harness: record unavailable" } });
    return chain;
  },
};

const mod = await import(pathToFileURL(join(REPO, "app", "api", "verify-deals", "route.js")).href);
const pick = (id) => {
  const r = db.tables.deals.find((x) => x.id === id);
  return { is_active: r.is_active, disqualified_reason: r.disqualified_reason, first_seen_at: r.first_seen_at, last_seen_at: r.last_seen_at, exact_verified_at: r.exact_verified_at };
};
async function run(label, atHours, { failRecord = false } = {}) {
  clock = T0 + atHours * 3.6e6;
  harness.calls = {};
  harness.db = failRecord ? failingSnapshotDb : db;
  const res = await mod.GET(new Request("http://harness/api/verify-deals", { headers: { authorization: "Bearer harness" } }));
  const body = await res.json();
  return {
    label,
    allocation: body.allocation,
    verified: body.verified,
    calls: harness.calls.getListingSnapshot ?? 0,
    checked: body.detail.map((d) => [d.id, d.status]),
    rows: { 1: pick(1), 2: pick(2), 3: pick(3), 4: pick(4), 5: pick(5) },
    record: db.tables.catalog_snapshot.find((r) => r.kind === "verify_graded_retention_attempts")?.data ?? null,
  };
}

const out = { T0: new Date(T0).toISOString(), seed: { 1: pick(1), 2: pick(2), 3: pick(3), 4: pick(4), 5: pick(5) }, runs: [] };
out.runs.push(await run("run1", 0));
out.runs.push(await run("run2 +30m", 0.5));
out.runs.push(await run("run3 +1h", 1));
out.runs.push(await run("run4 +2h05m", 2.08));
out.runs.push(await run("run5 +2h35m record unreadable", 2.58, { failRecord: true }));
process.stdout.write(JSON.stringify(out, null, 1));
