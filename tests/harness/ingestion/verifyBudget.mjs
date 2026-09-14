// browse-budget-r1 - the REAL app/api/verify-deals GET handler under the
// Browse budget ledger, offline: in-memory database (catalog_snapshot with
// its primary key), stubbed eBay whose single-item lookup goes through the
// real per-attempt lease guard. Synthetic, clearly-labelled rows.
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMemoryDb } from "./memoryDb.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
process.env.CRON_SECRET = "harness";
console.log = () => {}; // keep stdout for the JSON result
const T0 = Date.now();
const iso = (h) => new Date(T0 + h * 3.6e6).toISOString();
const RESET = new Date(T0 + 0.5 * 3.6e6).toISOString(); // late window: pace allows the whole 720 cap, so the hard cap binds

const row = (over) => {
  const id = over.id;
  const legacy = String(400000000000 + id);
  return {
    id, watchlist_id: null, source: "ebay", listing_id: `v1|${legacy}|0`, marketplace: "EBAY_US",
    listing_type: "FIXED_PRICE", is_active: true, is_graded: false, grader: null, grade: null, condition: "Near Mint",
    card_language: "english", card_name: "Charizard GX", card_set: "SM - Hidden Fates", card_tcgplayer_id: "42360",
    title: "Charizard GX 9/68 SM Hidden Fates Holo Rare", market_price: 400, discount_pct: 0.4,
    auction_end_at: null, price: 240, shipping: 0, currency: "USD", bid_count: 0,
    listing_url: `https://www.ebay.com/itm/${legacy}?x=1`, affiliate_url: `https://www.ebay.com/itm/${legacy}?x=1&campid=5`,
    image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg", disqualified_reason: null,
    visual_authenticity_status: null, visual_authenticity_reason: null, seller_feedback_score: 5000,
    first_seen_at: iso(-30), last_seen_at: iso(-1), exact_verified_at: iso(-6), ...over,
  };
};
const critical = Array.from({ length: 5 }, (_, i) => row({ id: 1 + i, listing_type: "AUCTION", auction_end_at: iso(1), exact_verified_at: iso(-0.2) }));
const slabs = Array.from({ length: 3 }, (_, i) =>
  row({ id: 20 + i, is_graded: true, grader: "PSA", grade: "10", condition: "Graded", card_tcgplayer_id: "syn-slab", title: "Charizard GX 9/68 SM Hidden Fates Holo Rare PSA 10", last_seen_at: iso(-20 + i), exact_verified_at: null })
);
const raws = Array.from({ length: 80 }, (_, i) => row({ id: 100 + i, first_seen_at: iso(-2 - i * 0.001), exact_verified_at: null }));
const db = createMemoryDb({ deals: [...critical, ...slabs, ...raws], catalog_snapshot: [], sealed_deals: [], ebay_job_runs: [] }, { unique: { catalog_snapshot: ["kind"] } });

const harness = { calls: {}, db, rateLimit: { remaining: 3000, limit: 5000, reset: RESET }, snapshotFor: () => ({ status: "ACTIVE", calls: 1, evidence: "harness" }) };
globalThis.__ingestHarness = harness;
const mod = await import(pathToFileURL(join(REPO, "app", "api", "verify-deals", "route.js")).href);
const budgetLib = await import(pathToFileURL(join(REPO, "lib", "browseBudget.js")).href);

const ledgerRow = (mode = "enforce") => db.tables.catalog_snapshot.find((r) => r.kind.startsWith(budgetLib.LEDGER_KIND_PREFIX[mode]));
const setUsed = (n) => {
  const r = ledgerRow();
  r.data.used.verify = n;
  r.updated_at = new Date(Date.parse(r.updated_at) + 1).toISOString();
};
async function run(label, mode = "enforce") {
  process.env.BROWSE_BUDGET_MODE = mode;
  harness.calls = {};
  const res = await mod.GET(new Request("http://harness/api/verify-deals", { headers: { authorization: "Bearer harness" } }));
  const body = await res.json();
  const l = ledgerRow(mode)?.data ?? null;
  return {
    label,
    skipped: body.skipped ?? null,
    budget: body.budget ?? null,
    calls: harness.calls.getListingSnapshot ?? 0,
    verified: body.verified ?? 0,
    checkedIds: (body.detail ?? []).map((d) => d.id),
    allocation: body.allocation ?? null,
    ledger: l ? structuredClone({ used: l.used, open: Object.keys(l.open).length, counters: l.counters }) : null,
  };
}

const out = { runs: [] };
out.runs.push(await run("fresh window"));
setUsed(700);
out.runs.push(await run("700 of 720 used"));
setUsed(715);
out.runs.push(await run("715 of 720 used"));
setUsed(718);
out.runs.push(await run("718 of 720 used"));
// crash: a lease taken and never settled, then a later run after its expiry
setUsed(100);
const crash = await budgetLib.acquireBrowseLease(db, { key: "verify", requested: 20, observation: harness.rateLimit, now: T0 - 10 * 60_000, ttlMs: 60_000, mode: "enforce" });
out.crashGranted = crash.granted;
out.runs.push(await run("after a crashed lease expired"));
// observe: never blocks, separate ledger row
out.runs.push(await run("observe mode", "observe"));
process.stdout.write(JSON.stringify(out, null, 1));
