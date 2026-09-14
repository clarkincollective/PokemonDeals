// Runs the REAL ingestion route handlers against saved evidence, offline.
//   node --import ./tests/harness/ingestion/register.mjs tests/harness/ingestion/driver.mjs <sweep|percard|feed|stored>
// Prints one JSON document: what each listing was written as (card identity,
// reference, savings), the display gate's verdict on every written row, and
// the provider calls the run would have made.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createMemoryDb } from "./memoryDb.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const dq = require(join(REPO, "lib", "dealQuality.js"));
const ev = JSON.parse(readFileSync(join(HERE, "evidence", "integrity-r1.json"), "utf8"));
const scenario = process.argv[2];
process.env.CRON_SECRET = "harness";

// Synthetic, clearly-labelled legitimate-ambiguity case (not production
// evidence): one graded listing that honestly matches two printings sharing
// a collector number, used to show graded lookups are reused per LISTING
// while references are still requested per CARD.
const SYN = {
  watchlist: [
    { id: "syn-wl-1", name: "Clefairy", set: "Base Set", justtcg_tcgplayer_id: "syn-clefairy-bs", active: true, language: "english" },
    { id: "syn-wl-2", name: "Clefairy", set: "Base Set (Shadowless)", justtcg_tcgplayer_id: "syn-clefairy-sl", active: true, language: "english" },
  ],
  card_catalog: [
    { tcgplayer_id: "syn-clefairy-bs", name: "Clefairy", set: "Base Set", card_number: "005/102", market_price: 60, language: "english" },
    { tcgplayer_id: "syn-clefairy-sl", name: "Clefairy", set: "Base Set (Shadowless)", card_number: "005/102", market_price: 140, language: "english" },
  ],
  deals: [
    { id: "syn-1", listing_id: "v1|900000000001|0", title: "Clefairy 5/102 Base Set (Shadowless) Holo - CGC 5.5 EX+", listing_type: "FIXED_PRICE", total_price_usd: 50, grader: "CGC", grade: "5.5" },
  ],
  graded: { "syn-clefairy-bs|CGC|5.5": 90, "syn-clefairy-sl|CGC|5.5": 210 },
};

const deals = [...ev.deals, ...SYN.deals];
const watchlist = [...ev.watchlist, ...SYN.watchlist];
const catalog = [...ev.card_catalog, ...SYN.card_catalog];
const catalogById = new Map(catalog.map((c) => [String(c.tcgplayer_id), c]));
const legacy = (id) => String(id).split("|")[1];

function toListing(d) {
  const url = `https://www.ebay.com/itm/${legacy(d.listing_id)}`;
  return {
    listingId: d.listing_id,
    marketplace: "EBAY_US",
    title: d.title,
    imageUrl: d.image_url ?? "https://i.ebayimg.com/images/g/x/s-l1600.jpg",
    imageUrls: [d.image_url ?? "https://i.ebayimg.com/images/g/x/s-l1600.jpg"],
    listingUrl: url,
    affiliateUrl: url,
    listingType: "FIXED_PRICE",
    price: Number(d.total_price_usd),
    shipping: 0,
    currency: "USD",
    itemLocationCountry: "US",
    bidCount: 0,
    auctionEndAt: null,
    isGraded: Boolean(d.grader),
    condition: d.grader ? "Graded" : "Ungraded",
    conditionDescriptors: d.grader
      ? [{ name: "Professional Grader", values: [{ content: d.grader }] }, { name: "Grade", values: [{ content: String(d.grade) }] }]
      : [{ name: "Card Condition", values: [{ content: "Near mint or better" }] }],
    localizedAspects: [{ name: "Language", value: "English" }],
    soldOut: false,
    sellerUsername: "harness-seller",
    sellerFeedbackPct: 100,
    sellerFeedbackScore: 5000,
  };
}

const gradedRefs = new Map(Object.entries(SYN.graded));
for (const d of ev.deals) if (d.grader) gradedRefs.set(`${d.card_tcgplayer_id}|${d.grader}|${d.grade}`, Number(d.market_price));

// "memo" narrows the sweep to two graded listings: the synthetic two-printing
// Clefairy slab and the saved CGC 10 SM210 promo (deal 37520).
const scenarioDeals = scenario === "memo" ? deals.filter((d) => d.id === "syn-1" || d.id === 37520) : deals;
const listings = scenarioDeals.map(toListing);
const harness = {
  calls: {},
  gradedPriceRequests: [],
  db: null,
  feedItems: [],
  listingsFor: () => listings.map((l) => ({ ...l })),
  gradingFor: (listingId) => {
    const d = deals.find((x) => x.listing_id === listingId);
    return { grader: d?.grader ?? null, grade: d?.grade != null ? String(d.grade) : null };
  },
  rawReferenceFor: (id) => {
    const p = Number(catalogById.get(id)?.market_price);
    return Number.isFinite(p) && p > 0 ? p : null;
  },
  gradedReferenceFor: (id, grader, grade) => gradedRefs.get(`${id}|${grader}|${grade}`) ?? null,
};
globalThis.__ingestHarness = harness;

function seedDb({ priority = false } = {}) {
  return createMemoryDb({
    watchlist: watchlist.map((w) => ({ ...w, tier: priority ? "priority" : "extended", last_known_price: null })),
    card_catalog: catalog,
    deals: [],
    discovery_events: [],
    ebay_job_runs: [],
    scan_target_state: [],
    catalog_snapshot: [],
  });
}

// What the DB triggers would attach to a written row, then the real gate.
function describeWrittenRows(db) {
  const wlById = new Map(watchlist.map((w) => [String(w.id), w]));
  return db.tables.deals.map((r) => {
    const wl = r.watchlist_id != null ? wlById.get(String(r.watchlist_id)) : null;
    const cardId = String(wl?.justtcg_tcgplayer_id ?? r.card_catalog_id ?? "");
    const cat = catalogById.get(cardId);
    const row = {
      ...r,
      card_tcgplayer_id: cardId || null,
      card_name: wl?.name ?? cat?.name ?? null,
      card_set: wl?.set ?? cat?.set ?? null,
      card_language: wl?.language ?? cat?.language ?? "english",
      first_seen_at: r.first_seen_at ?? new Date().toISOString(),
      last_seen_at: r.last_seen_at ?? new Date().toISOString(),
    };
    return {
      listingId: r.listing_id,
      title: r.title,
      writtenAs: `${row.card_name} | ${row.card_set} | #${cat?.card_number ?? "?"}`,
      cardId,
      graded: Boolean(r.is_graded),
      grader: r.grader ?? null,
      grade: r.grade ?? null,
      marketPrice: r.market_price,
      discountPct: Math.round(Number(r.discount_pct) * 1000) / 1000,
      displayable: dq.isDisplayableDeal(row),
      disqualificationReason: dq.disqualificationReason(row),
    };
  });
}

async function run() {
  if (scenario === "stored") {
    // the display gate over the saved production rows, exactly as stored
    return ev.deals.filter((d) => d.is_active).map((d) => ({
      id: d.id,
      listingId: d.listing_id,
      title: d.title,
      storedAs: `${d.card_name} | ${d.card_set}`,
      discountPct: d.discount_pct,
      displayable: dq.isDisplayableDeal(d),
      disqualificationReason: dq.disqualificationReason(d),
    }));
  }
  let url, mod;
  if (scenario === "sweep" || scenario === "memo") {
    harness.db = seedDb();
    mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
    url = "http://harness/api/refresh-deals?mode=sweep&country=EBAY_US&pages=1";
  } else if (scenario === "percard") {
    harness.db = seedDb({ priority: true });
    mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
    url = "http://harness/api/refresh-deals?tier=priority&country=EBAY_US";
  } else if (scenario === "feed") {
    harness.db = seedDb();
    harness.feedItems = deals.map((d) => ({ marketplace: "EBAY_US", ebayItemId: legacy(d.listing_id), sourceUrl: "https://example.invalid/board", feedTitle: d.title }));
    mod = await import(pathToFileURL(join(REPO, "app", "api", "ingest-feed", "route.js")).href);
    url = "http://harness/api/ingest-feed";
  } else {
    throw new Error(`unknown scenario ${scenario}`);
  }
  const res = await mod.GET(new Request(url, { headers: { authorization: "Bearer harness" } }));
  const body = await res.json();
  return {
    status: res.status,
    response: body,
    calls: harness.calls,
    gradedPriceRequests: harness.gradedPriceRequests,
    written: describeWrittenRows(harness.db),
  };
}

const out = await run();
process.stdout.write(JSON.stringify({ scenario, ...(Array.isArray(out) ? { rows: out } : out) }, null, 1));
