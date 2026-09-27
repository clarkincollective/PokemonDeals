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

// "refcap" (graded-supply-r1): seven more synthetic rows the same Clefairy
// slab matches (nine in all), each with its own graded reference - the
// shape of the stored Unown slabs that match 28 rows. Proves graded
// reference requests stay within GRADED_LOOKUP_CAP per sweep.
if (scenario === "refcap") {
  for (let i = 1; i <= 7; i++) {
    SYN.watchlist.push({ id: `syn-wl-c${i}`, name: "Clefairy", set: "Base Set", justtcg_tcgplayer_id: `syn-clefairy-c${i}`, active: true, language: "english" });
    SYN.card_catalog.push({ tcgplayer_id: `syn-clefairy-c${i}`, name: "Clefairy", set: "Base Set", card_number: "005/102", market_price: 60, language: "english" });
    SYN.graded[`syn-clefairy-c${i}|CGC|5.5`] = 90;
  }
}
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
const scenarioDeals = scenario === "memo" ? deals.filter((d) => d.id === "syn-1" || d.id === 37520) : scenario === "refcap" ? deals.filter((d) => d.id === "syn-1") : deals;
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
      // 2026-09-26 saved references: the provenance the writer stored and
      // the display gate's verdict on the SAVINGS claim (not just visibility)
      referenceSource: r.reference_source ?? null,
      referenceObservedAt: r.reference_observed_at ?? null,
      referenceCondition: r.reference_condition ?? null,
      referencePrinting: r.reference_printing ?? null,
      referenceGrader: r.reference_grader ?? null,
      referenceGrade: r.reference_grade ?? null,
      savingsTrusted: dq.savingsClaimTrusted(row),
    };
  });
}

async function run() {
  if (scenario === "stored") {
    // The display gate over the saved production rows.
    //
    // TIME IS NEUTRALISED, 2026-09-23. These rows were captured on
    // 2026-09-12/13 and disqualificationReason() evaluates freshness (and
    // auction end) BEFORE identity. Once the capture aged past those
    // windows every row returned "freshness:stale" or "auction_ended",
    // so this scenario stopped exercising the identity gate it exists to
    // test and the assertion was quarantined on 09-16. Running them
    // "exactly as stored" now means running them always-stale, which
    // proves nothing.
    //
    // The evidence file is left untouched - it is a real capture. Only
    // the two decaying fields are refreshed here, and only for rows that
    // carried them, so identity is the dimension under test.
    const fresh = (d) => ({
      ...d,
      last_seen_at: new Date().toISOString(),
      ...(d.auction_end_at ? { auction_end_at: new Date(Date.now() + 36e5).toISOString() } : {}),
    });
    return ev.deals.filter((d) => d.is_active).map((d0) => {
      const d = fresh(d0);
      return {
        id: d.id,
        listingId: d.listing_id,
        title: d.title,
        storedAs: `${d.card_name} | ${d.card_set}`,
        discountPct: d.discount_pct,
        displayable: dq.isDisplayableDeal(d),
        disqualificationReason: dq.disqualificationReason(d),
      };
    });
  }
  let url, mod;
  if (scenario === "sweep" || scenario === "memo" || scenario === "refcap") {
    harness.db = seedDb();
    mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
    url = "http://harness/api/refresh-deals?mode=sweep&country=EBAY_US&pages=1";
  } else if (scenario === "sweepgrant") {
    // alloc-rev2: the real US sweep (5 pages) under an ACTIVE enforce window
    // whose sweep:EBAY_US cap has exactly <grant> attempts left (late window,
    // so pace = cap), or in observe mode ("observe"). argv[4] "retry": the
    // first graded lookup takes two attempts (a 5xx retry).
    const grantArg = process.argv[3] ?? "11";
    // SYNTHETIC: two extra copies (new listing ids) of every raw evidence
    // listing, so the sweep's full demand (5 pages + 3 graded + ~6 raw
    // condition checks = 14) exceeds a 10-11 attempt grant, like the measured
    // typical US sweep (~13.3 attempts after the 3-lookup graded cap)
    for (const d of ev.deals.filter((x) => !x.grader)) {
      for (const k of [1, 2]) listings.push(toListing({ ...d, listing_id: `v1|9${k}${legacy(d.listing_id).slice(2)}|0` }));
    }
    const T0 = Date.now();
    harness.rateLimit = { remaining: 3000, limit: 5000, reset: new Date(T0 + 0.5 * 3.6e6).toISOString(), timeWindow: 86400, readAt: new Date(T0).toISOString() };
    const base = seedDb();
    harness.db = createMemoryDb({ ...base.tables, catalog_snapshot: [] }, { unique: { catalog_snapshot: ["kind"] } });
    if (process.argv[4] === "retry") {
      let first = true;
      harness.retryGradingFor = () => {
        const r = first;
        first = false;
        return r;
      };
    }
    const budgetLib = require(join(REPO, "lib", "browseBudget.js"));
    if (grantArg === "observe") {
      process.env.BROWSE_BUDGET_MODE = "observe";
    } else {
      process.env.BROWSE_BUDGET_MODE = "enforce";
      const win = budgetLib.windowFromObservation(harness.rateLimit, T0);
      const ledger = { ...budgetLib.emptyLedger(win), state: "active", stateReason: "harness_seed", enforceSeenAt: new Date(win.windowStart).toISOString() };
      ledger.used["sweep:EBAY_US"] = budgetLib.CONSUMER_CAPS["sweep:EBAY_US"] - Number(grantArg);
      harness.db.tables.catalog_snapshot.push({ kind: `${budgetLib.LEDGER_KIND_PREFIX.enforce}${win.id}`, data: ledger, updated_at: new Date(win.windowStart).toISOString() });
    }
    mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
    url = "http://harness/api/refresh-deals?mode=sweep&country=EBAY_US&pages=5";
  } else if (scenario === "percard") {
    harness.db = seedDb({ priority: true });
    mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
    url = "http://harness/api/refresh-deals?tier=priority&country=EBAY_US";
  } else if (scenario === "saved-percard" || scenario === "saved-sweep") {
    // 2026-09-26 SAVED REFERENCES - the provider is EXHAUSTED (free tier,
    // credits gone: every billed lookup throws PptExhaustedError) and the
    // scanner must price from what we hold. Seeds one saved_ref row per
    // evidence card, in the shape scripts/preservation/importSavedReferences
    // writes: ONE printing ("Normal") carrying a Near Mint figure equal to
    // the catalogue's market_price, a Lightly Played figure below it, and
    // the provider's own as-of (SAVED_AS_OF) - never today's date. One
    // card ("wrongprint") holds ONLY a Reverse Holofoil printing, so a
    // listing that does not evidence that finish must get no comparison.
    // Graded: the stub refuses too, and no saved_graded rows are seeded, so
    // graded listings must NOT be written with any raw reference.
    harness.pptExhausted = true;
    const SAVED_AS_OF = "2026-09-25T00:00:00.000Z";
    // One synthetic RAW Clefairy listing (no finish stated) at $30 against a
    // $60 Near Mint saved reference: a 50% saved-reference discount for the
    // Base Set row, and the wrong-printing row's test subject.
    listings.push(toListing({ listing_id: "v1|900000000002|0", title: "Clefairy 5/102 Base Set", listing_type: "FIXED_PRICE", total_price_usd: 30 }));
    // A SECOND synthetic card whose only saved printing is a parallel
    // (Reverse Holofoil) and whose listing states no finish: the scanner may
    // store the catalogue printing, but the display gate must withhold the
    // savings claim (deal 42127's rule) - no substituted comparison shown.
    // Its own name, so it shares no listing with the Clefairy rows.
    listings.push(toListing({ listing_id: "v1|900000000003|0", title: "Clefable 6/102 Base Set", listing_type: "FIXED_PRICE", total_price_usd: 30 }));
    const wrongPrintId = "syn-wrongprint";
    const catalogWithPrinting = catalog.map((c) => ({ ...c, market_condition: "Near Mint", market_printing: "Normal" }));
    catalogWithPrinting.push({ tcgplayer_id: wrongPrintId, name: "Clefable", set: "Base Set", card_number: "006/102", market_price: 60, language: "english", market_condition: "Near Mint", market_printing: "Reverse Holofoil" });
    const savedRows = [];
    for (const c of catalogWithPrinting) {
      const nm = Number(c.market_price);
      if (!(nm > 0)) continue;
      const printing = c.tcgplayer_id === wrongPrintId ? "Reverse Holofoil" : "Normal";
      savedRows.push({
        kind: `saved_ref:${c.tcgplayer_id}:${c.language ?? "english"}`,
        data: {
          v: 1,
          tcgplayerId: String(c.tcgplayer_id),
          language: c.language ?? "english",
          retrievedAt: "2026-09-26T10:30:00.000Z",
          source: "ppt_export",
          printings: { [printing]: { nm, lp: Math.round(nm * 0.85 * 100) / 100, mp: null, hp: null, dmg: null, market: nm, marketCondition: "Near Mint", low: null, sellers: 5, lastPriceUpdate: SAVED_AS_OF } },
        },
        updated_at: "2026-09-26T10:30:00.000Z",
      });
    }
    // 2026-09-27: the Clefairy card ALSO holds a fresh tcgcsv_ref row (Near
    // Mint only, same $60, TCGCSV's own file date). The written Near Mint
    // comparison must carry THAT date, while a ladder-only card keeps
    // SAVED_AS_OF - the cell-level provenance the merge promises.
    const FRESH_AS_OF = "2026-09-26T20:02:58.000Z";
    savedRows.push({
      kind: "tcgcsv_ref:syn-clefairy-bs:english",
      data: { v: 1, tcgplayerId: "syn-clefairy-bs", language: "english", name: "Clefairy", setName: "Base Set", cardNumber: "005/102", retrievedAt: "2026-09-27T02:00:00.000Z", source: "tcgcsv", printings: { Normal: { nm: 60, lp: null, mp: null, hp: null, dmg: null, market: 60, marketCondition: "Near Mint", low: 55, mid: null, high: null, lastPriceUpdate: FRESH_AS_OF } } },
      updated_at: "2026-09-27T02:00:00.000Z",
    });
    const priority = scenario === "saved-percard";
    const wl = watchlist.map((w) => ({ ...w, tier: priority ? "priority" : "extended", last_known_price: null }));
    wl.push({ id: "syn-wl-wrongprint", name: "Clefable", set: "Base Set", justtcg_tcgplayer_id: wrongPrintId, active: true, language: "english", tier: priority ? "priority" : "extended", last_known_price: null });
    harness.db = createMemoryDb({ watchlist: wl, card_catalog: catalogWithPrinting, deals: [], discovery_events: [], ebay_job_runs: [], scan_target_state: [], catalog_snapshot: savedRows });
    mod = await import(pathToFileURL(join(REPO, "app", "api", "refresh-deals", "route.js")).href);
    url = priority ? "http://harness/api/refresh-deals?tier=priority&country=EBAY_US" : "http://harness/api/refresh-deals?mode=sweep&country=EBAY_US&pages=1";
  } else if (scenario === "feed") {
    harness.db = seedDb();
    // 2026-09-27 board deals: the first two board rows carry a published
    // discount figure - the first at the listing's LIVE price (must publish),
    // the second at a stale price (must be recorded as price_changed, never
    // shown). Every other row is identity-only, as before.
    harness.feedItems = deals.map((d, i) => ({
      marketplace: "EBAY_US",
      ebayItemId: legacy(d.listing_id),
      sourceUrl: "https://example.invalid/board",
      feedTitle: d.title,
      ...(i === 0 || i === 1
        ? {
            capturedDiscountPct: i === 0 ? 0.3 : 0.2,
            capturedDiscountText: i === 0 ? "30% off" : "20% off",
            feedPrice: i === 0 ? Number(d.total_price_usd) : Math.round(Number(d.total_price_usd) * 2 * 100) / 100,
            feedMarket: "US",
            boardListingPriceText: `$${Number(d.total_price_usd).toFixed(2)}`,
            boardMarketPriceText: "$99.00",
            boardName: d.title,
            boardSet: null,
            boardVariant: "Raw",
            boardFormat: "BIN",
            boardImage: null,
            plainEbayUrl: `https://www.ebay.com/itm/${legacy(d.listing_id)}`,
          }
        : {}),
    }));
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
    // 2026-09-26: reusing a saved reference must never manufacture history
    priceHistoryWrites: harness.db.writes.filter((w) => w.table === "price_history").length,
    // 2026-09-27 board deals: the records and run summaries the ingest wrote
    boardDeals: harness.db.tables.catalog_snapshot.filter((r) => String(r.kind).startsWith("board_deal:")).map((r) => r.data),
    boardRuns: harness.db.tables.catalog_snapshot.find((r) => r.kind === "board_ingest_runs")?.data ?? [],
    boardLock: harness.db.tables.catalog_snapshot.find((r) => r.kind === "board_ingest:lock") ?? null,
    ...(scenario === "sweepgrant"
      ? {
          ledger: (() => {
            const row = harness.db.tables.catalog_snapshot.find((r) => r.kind.startsWith("browse_budget"));
            return row ? { kind: row.kind.split(":")[0], used: row.data.used, open: Object.keys(row.data.open ?? {}).length, counters: row.data.counters } : null;
          })(),
          jobRuns: harness.db.tables.ebay_job_runs,
        }
      : {}),
  };
}

const out = await run();
process.stdout.write(JSON.stringify({ scenario, ...(Array.isArray(out) ? { rows: out } : out) }, null, 1));
