// cache-retire-r1 - offline propagation scenario. The REAL verify-deals and
// sweep-stale-deals GET handlers, the REAL lib/deals.js loaders
// (fetchSetCatalog for /sets/[slug], fetchAllDealsPage for /deals) and the
// REAL invalidation helpers run against one in-memory database, with
// next/cache replaced by the tag-aware model (nextCacheModel.mjs) and every
// provider stubbed (fetch disabled). Synthetic rows, not production data.
//
//   node --import ./tests/harness/cache/register.mjs tests/harness/cache/retirementScenario.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
process.env.CRON_SECRET = "harness";
console.log = () => {}; // routes' structured completion lines would corrupt the JSON output

const { createMemoryDb } = await imp("tests/harness/ingestion/memoryDb.mjs");
const { allDealsRows, ALL_DEALS_ELIGIBLE_LISTING_IDS } = await imp("tests/browser/r3/runtime/allDealsRows.js");
const dq = require(join(REPO, "lib/dealQuality.js"));
const L = require(join(REPO, "lib/listingAvailability.js"));
const cache = await import(pathToFileURL(join(HERE, "nextCacheModel.mjs")).href);
const M = cache.model();

// real clock for the display gate's freshness; the cache model has its own clock
const template = allDealsRows.find((r) => ALL_DEALS_ELIGIBLE_LISTING_IDS.includes(r.listing_id) && r.listing_type !== "AUCTION" && dq.isDisplayableDeal(r));
const SET = "EX Unseen Forces";
const row = (id, over) => {
  const legacy = String(880000000000 + id);
  const set = over.card_set ?? SET;
  const base = {
    ...template,
    id,
    watchlist_id: 14000 + id,
    source: "ebay",
    listing_id: `v1|${legacy}|0`,
    listing_url: `https://www.ebay.com/itm/${legacy}`,
    affiliate_url: `https://www.ebay.com/itm/${legacy}?campid=5339197414`,
    disqualified_reason: null,
    visual_authenticity_status: null,
    exact_verified_at: null,
    ...over,
    card_set: set,
  };
  base.watchlist = { name: base.card_name, set, justtcg_tcgplayer_id: base.card_tcgplayer_id, language: "english" };
  base["watchlist.set"] = set;
  base["watchlist.language"] = "english";
  return base;
};
const ROWS = {
  sold: row(1, { marketplace: "EBAY_US", card_name: "Unown (M)", card_tcgplayer_id: "90180", title: "Unown M/28 Holo Rare EX Unseen Forces" }),
  sameSet: row(2, { marketplace: "EBAY_US", card_name: "Unown (R)", card_tcgplayer_id: "90185", title: "Unown R/28 Holo Rare EX Unseen Forces" }),
  quarantined: row(3, { marketplace: "EBAY_CA", card_name: "Unown (K)", card_tcgplayer_id: "90178", title: "Unown K/28 Holo Rare EX Unseen Forces" }),
  dbOnly: row(4, { marketplace: "EBAY_US", card_name: "Unown (Z)", card_tcgplayer_id: "90193", title: "Unown Z/28 Holo Rare EX Unseen Forces" }),
  unknown: row(5, { marketplace: "EBAY_US", card_name: "Unown (A)", card_tcgplayer_id: "90168", title: "Unown A/28 Holo Rare EX Unseen Forces" }),
  failedWrite: row(6, { marketplace: "EBAY_GB", card_name: "Unown (B)", card_tcgplayer_id: "90169", title: "Unown B/28 Holo Rare EX Unseen Forces" }),
  otherSet: { ...template, id: 7, watchlist_id: 14007, source: "ebay", disqualified_reason: null }, // the fixture's own card, another set
};
const idsOf = Object.fromEntries(Object.entries(ROWS).map(([k, r]) => [r.id, k]));
const catalog = Object.values(ROWS)
  .filter((r) => r.card_set === SET)
  .map((r) => ({ tcgplayer_id: r.card_tcgplayer_id, name: r.card_name, set: SET, card_number: `${r.card_name.match(/\((.)\)/)[1]}/28`, rarity: "Holo Rare", market_price: 50, language: "english", image_url: null }));

const baseDb = createMemoryDb({
  deals: Object.values(ROWS),
  watchlist: Object.values(ROWS).map((r) => ({ id: r.watchlist_id, name: r.card_name, set: r.card_set, language: "english", justtcg_tcgplayer_id: r.card_tcgplayer_id, active: true })),
  card_catalog: catalog,
  catalog_snapshot: [{ kind: "cardHubs", data: [], updated_at: new Date().toISOString() }],
  sealed_deals: [],
  ebay_job_runs: [],
  scan_target_state: [],
});

// eBay verdicts per legacy id; one retirement write fails at the database
const VERDICT = { "880000000001": "SOLD", "880000000005": "UNKNOWN", "880000000006": "SOLD" };
const FAIL_WRITE_ID = 6;
const db = {
  ...baseDb,
  from(name) {
    if (name !== "deals") return baseDb.from(name);
    const real = baseDb.from(name);
    const calls = [];
    const chain = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const isUpdate = calls.some((c) => c[0] === "update");
            const targetsFailing = calls.some((c) => (c[0] === "eq" && c[1][0] === "id" && Number(c[1][1]) === FAIL_WRITE_ID) || (c[0] === "match" && Number(c[1][0]?.id) === FAIL_WRITE_ID));
            if (isUpdate && targetsFailing) return (resolve) => resolve({ data: null, error: { message: "harness: write failed" } });
            let q = real;
            for (const [m, a] of calls) q = q[m](...a);
            return q.then.bind(q);
          }
          return (...a) => {
            calls.push([prop, a]);
            return chain;
          };
        },
      }
    );
    return chain;
  },
};
const harness = { calls: {}, db, gradedPriceRequests: [], snapshotFor: (legacy) => ({ status: VERDICT[legacy] ?? "ACTIVE", calls: 1, evidence: "harness" }), rateLimit: { remaining: 4000, limit: 5000, reset: null } };
globalThis.__ingestHarness = harness;

const deals = await imp("lib/deals.js");
const verify = await imp("app/api/verify-deals/route.js");
const sweep = await imp("app/api/sweep-stale-deals/route.js");

const SET_PAGE = "/sets/ex-unseen-forces";
const renderSetPage = () =>
  cache.renderIsrPage(SET_PAGE, 3600, async () => {
    const { cards } = await deals.fetchSetCatalog(SET, "english");
    return cards.filter((c) => c.deal).map((c) => c.name).sort();
  });
const renderAllDeals = () =>
  cache.renderIsrPage("/deals", 600, async () => {
    const r = await deals.fetchAllDealsPage({});
    return r.deals.map((d) => idsOf[d.id] ?? d.id).sort();
  });
const snapshot = async (label) => {
  const set = await renderSetPage();
  const all = await renderAllDeals();
  return { label, t: M.now / 1000, setPage: { offers: set.html, regenerated: set.regenerated }, allDeals: { offers: all.html, regenerated: all.regenerated } };
};
const rowState = (key) => {
  const r = baseDb.tables.deals.find((x) => x.id === ROWS[key].id);
  return { is_active: r.is_active, disqualified_reason: r.disqualified_reason };
};
const call = async (mod, url) => (await mod.GET(new Request(url, { headers: { authorization: "Bearer harness" } }))).json();

const steps = [];
M.now = 0;
steps.push(await snapshot("t0 first render"));

// A database change with NO invalidation (the 38057 situation): still served
M.now = 60_000;
baseDb.tables.deals.find((r) => r.id === ROWS.dbOnly.id).disqualified_reason = "identity:collector_number_conflict";
steps.push(await snapshot("t+60s db-only quarantine, no invalidation"));

// verify-deals: SOLD (write ok), UNKNOWN, SOLD with a failed write
M.now = 120_000;
M.calls.length = 0;
const verifyBody = await call(verify, "http://harness/api/verify-deals");
const verifyTags = M.calls.map((c) => c.tag);
steps.push({ ...(await snapshot("t+120s after verify-deals")), verify: { checked: verifyBody.detail?.map((d) => [idsOf[d.id] ?? d.id, d.status]), invalidation: verifyBody.invalidation, tags: verifyTags } });

// a remediation script quarantines a row and queues its surfaces; the cron drains the queue
M.now = 180_000;
const q = baseDb.tables.deals.find((r) => r.id === ROWS.quarantined.id);
q.disqualified_reason = "identity:collector_number_conflict";
const plan = L.surfaceInvalidationPlan([q], { dealPages: true });
const queued = await L.queueCacheInvalidation(baseDb, plan.tags, { source: "harness-quarantine" });
steps.push({ ...(await snapshot("t+180s quarantine queued, cron not yet run")), queued });
M.now = 240_000;
M.calls.length = 0;
const sweepBody = await call(sweep, "http://harness/api/sweep-stale-deals");
steps.push({ ...(await snapshot("t+240s after sweep-stale-deals drained the queue")), sweep: { invalidation: sweepBody.invalidation, queuedInvalidation: sweepBody.queuedInvalidation, tags: M.calls.map((c) => c.tag) } });

// sweep-stale-deals: a confirmed ended auction is propagated; a freshness-TTL
// expiry (no sale confirmation) keeps the normal cache windows
M.now = 300_000;
const past = new Date(Date.now() - 3600_000).toISOString();
baseDb.tables.deals.push(
  row(8, { marketplace: "EBAY_AU", card_name: "Unown (C)", card_tcgplayer_id: "90170", listing_type: "AUCTION", auction_end_at: past, card_set: "EX Unseen Forces" }),
  row(9, { marketplace: "EBAY_IT", card_name: "Snorlax", card_tcgplayer_id: "45122", card_set: "Jungle", market_price: 20, discount_pct: 0.2, last_seen_at: new Date(Date.now() - 400 * 3600_000).toISOString() })
);
M.calls.length = 0;
const sweep2 = await call(sweep, "http://harness/api/sweep-stale-deals");
steps.push({ label: "t+300s sweep: ended auction + freshness expiry", t: 300, sweep: { results: sweep2.results, invalidation: sweep2.invalidation, tags: M.calls.map((c) => c.tag) }, rows: { endedAuction: baseDb.tables.deals.find((r) => r.id === 8).is_active, freshnessExpired: baseDb.tables.deals.find((r) => r.id === 9).is_active } });

const rows = Object.fromEntries(Object.keys(ROWS).map((k) => [k, rowState(k)]));
process.stdout.write(JSON.stringify({ steps, rows, queueLeft: baseDb.tables.catalog_snapshot.filter((r) => String(r.kind).startsWith(L.CACHE_INVALIDATION_KIND_PREFIX)).length, providerCalls: harness.calls }, null, 1));
