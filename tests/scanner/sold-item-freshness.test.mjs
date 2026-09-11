// Sold-item freshness (2026-09-11).
//
//   1. provider verdict mapping (lib/listingAvailability.classifyItemLookup,
//      exercised directly AND through lib/ebay with a mocked fetch)
//   2. confirmed retirements are persisted and survive overlapping search /
//      feed sightings (in-memory model of the deals table + the exact
//      PostgREST calls writeDiscoverySighting makes)
//   3. third-party board sightings no longer refresh eBay freshness
//   4. the deal page's freshness wording only claims a confirmation when
//      exact_verified_at was one
//   5. targeted, per-card-deduplicated cache invalidation
//
// Unchanged by design (asserted): verify BATCH / RESERVE, ingest caps and
// floor, the expired-deal redirect contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  AVAILABILITY_RETIREMENT,
  SEEN_AGAIN,
  SIGHTING_WRITABLE_OR,
  RECOVERY_SLOTS_PER_RUN,
  RECOVERY_MIN_HOURS_SINCE_CHECK,
  RECOVERY_MAX_AGE_DAYS,
  recoveryDecision,
  baseAvailabilityReason,
  isPositiveActiveConfirmation,
  classifyItemLookup,
  soldOutFromItemBody,
  availabilityRetirementReason,
  isAvailabilityRetired,
  writeDiscoverySighting,
  listingAvailabilityEvidence,
  cardOffersTags,
  dealDetailTag,
  retirementInvalidationPlan,
  expireTags,
} from "../../lib/listingAvailability.js";
import {
  isDisplayableDeal,
  isPremiumDealEligible,
  isExactVerifiedFresh,
  isPositiveActiveConfirmation as isPositiveActiveConfirmationDQ,
  PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS,
} from "../../lib/dealQuality.js";
import { isSociallyEligible } from "../../lib/social/eligibility.mjs";
import { expiredDealDestination } from "../../lib/dealPage.js";
import { repricedAuctionPatch } from "../../lib/auctionPricing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. provider verdict mapping
// ---------------------------------------------------------------------------

// The exact shape every one of the 25 genuine verifier retirements re-read
// as on 2026-09-11 (HTTP 200, sold out, past end date).
const SOLD_BODY = {
  itemId: "v1|123|0",
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK", estimatedRemainingQuantity: 0, estimatedSoldQuantity: 1 }],
  itemEndDate: "2026-09-10T08:00:00.000Z",
  buyingOptions: ["FIXED_PRICE"],
  price: { value: "12.00", currency: "USD" },
};
const LIVE_BODY = {
  itemId: "v1|456|0",
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK", estimatedRemainingQuantity: 1 }],
  buyingOptions: ["FIXED_PRICE"],
  price: { value: "20.00", currency: "USD" },
};

test("SIF-1. verdict mapping: SOLD and ACTIVE both need explicit availability evidence; 404/410 is ENDED (marketplace-scoped); everything else is UNKNOWN", () => {
  const cases = [
    [{ httpStatus: 200, body: SOLD_BODY }, "SOLD", "item", "out_of_stock"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedRemainingQuantity: 0 }] } }, "SOLD", "item", "out_of_stock"],
    [{ httpStatus: 200, body: LIVE_BODY }, "ACTIVE", "item", "in_stock"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "LIMITED_STOCK", estimatedRemainingQuantity: 2 }] } }, "ACTIVE", "item", "in_stock"],
    // positive evidence is REQUIRED for ACTIVE - a bare 200 is not a confirmation
    [{ httpStatus: 200, body: { itemId: "x" } }, "UNKNOWN", null, "no_availability_data"],
    [{ httpStatus: 200, body: { itemId: "x", estimatedAvailabilities: [] } }, "UNKNOWN", null, "no_availability_data"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedRemainingQuantity: 3 }] } }, "UNKNOWN", null, "unrecognised_availability"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "SOMETHING_NEW" }] } }, "UNKNOWN", null, "unrecognised_availability"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }, { estimatedAvailabilityStatus: "OUT_OF_STOCK" }] } }, "UNKNOWN", null, "mixed_availability"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }, {}] } }, "UNKNOWN", null, "mixed_availability"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK", estimatedRemainingQuantity: 0 }] } }, "SOLD", "item", "out_of_stock"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }, { estimatedAvailabilityStatus: "LIMITED_STOCK", estimatedRemainingQuantity: 2 }] } }, "ACTIVE", "item", "in_stock"],
    [{ httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "OUT_OF_STOCK" }, { estimatedRemainingQuantity: 0 }] } }, "SOLD", "item", "out_of_stock"],
    [{ httpStatus: 404 }, "ENDED", "marketplace", "not_found_in_marketplace"],
    [{ httpStatus: 410 }, "ENDED", "marketplace", "not_found_in_marketplace"],
    [{ httpStatus: 429 }, "UNKNOWN", null, "rate_limited"],
    [{ httpStatus: 401 }, "UNKNOWN", null, "auth_error"],
    [{ httpStatus: 403 }, "UNKNOWN", null, "auth_error"],
    [{ httpStatus: 500 }, "UNKNOWN", null, "server_error"],
    [{ httpStatus: 503 }, "UNKNOWN", null, "server_error"],
    [{ httpStatus: 400 }, "UNKNOWN", null, "http_400"],
    [{ fetchFailed: true }, "UNKNOWN", null, "network_error"],
    [{ httpStatus: 200, parseFailed: true }, "UNKNOWN", null, "unparseable"],
    [{ httpStatus: 200, body: null }, "UNKNOWN", null, "unparseable"],
  ];
  for (const [input, status, scope, evidence] of cases) {
    assert.deepEqual(classifyItemLookup(input), { status, scope, evidence }, JSON.stringify(input));
  }
});

test("SIF-2. only SOLD and ENDED persist an availability reason; price retirements, UNKNOWN and ACTIVE never do", () => {
  assert.equal(availabilityRetirementReason("SOLD"), "availability:sold");
  assert.equal(availabilityRetirementReason("ENDED"), "availability:not_found_in_marketplace");
  for (const s of ["ACTIVE", "UNKNOWN", "RETIRED", "REPRICED", undefined]) assert.equal(availabilityRetirementReason(s), null, String(s));
  // the auction path maps eBay's own verdicts to the same two statuses
  const row = { price: 10, marketplace: "EBAY_US", market_price: 100 };
  assert.equal(repricedAuctionPatch({ row, snapshot: { status: "SOLD" } }).reason, "listing_sold");
  assert.equal(repricedAuctionPatch({ row, snapshot: { status: "ENDED" } }).reason, "listing_ended");
  assert.equal(repricedAuctionPatch({ row, snapshot: { status: "UNKNOWN" } }).action, "none");
});

test("SIF-3. soldOutFromItemBody: true / false from a single-item body, null when the body has no availability block (search results)", () => {
  assert.equal(soldOutFromItemBody(SOLD_BODY), true);
  assert.equal(soldOutFromItemBody(LIVE_BODY), false);
  assert.equal(soldOutFromItemBody({ itemId: "summary-only" }), null);
  assert.equal(soldOutFromItemBody({ estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }, { estimatedAvailabilityStatus: "OUT_OF_STOCK" }] }), null);
  assert.equal(soldOutFromItemBody(null), null);
});

// lib/ebay end-to-end with a mocked fetch: token + one item response.
const require = createRequire(import.meta.url);
async function withMockedEbay(itemResponse, fn) {
  const realFetch = globalThis.fetch;
  process.env.EBAY_CLIENT_ID ||= "test-id";
  process.env.EBAY_CLIENT_SECRET ||= "test-secret";
  const seen = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }), { status: 200 });
    }
    seen.push({ url: u, marketplace: opts.headers?.["X-EBAY-C-MARKETPLACE-ID"] });
    return itemResponse();
  };
  try {
    return await fn(require("../../lib/ebay.js"), seen);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("SIF-4. getListingSnapshot / getListingFreshness return the mapped status + evidence for each traced response class", async () => {
  const json = (status, body) => () => new Response(JSON.stringify(body ?? {}), { status });
  const expectations = [
    [json(200, SOLD_BODY), "SOLD", "out_of_stock"],
    [json(200, LIVE_BODY), "ACTIVE", "in_stock"],
    [json(404, { errors: [{ errorId: 11001 }] }), "ENDED", "not_found_in_marketplace"],
    [json(429, { errors: [{ errorId: 2001 }] }), "UNKNOWN", "rate_limited"],
    [() => new Response("not json", { status: 200 }), "UNKNOWN", "unparseable"],
    [json(200, { itemId: "v1|1|0", price: { value: "5.00", currency: "USD" } }), "UNKNOWN", "no_availability_data"],
  ];
  for (const [resp, status, evidence] of expectations) {
    await withMockedEbay(resp, async (ebay, seen) => {
      const snap = await ebay.getListingSnapshot("123", "EBAY_GB");
      assert.equal(snap.status, status);
      assert.equal(snap.evidence, evidence);
      assert.equal(snap.calls, 1);
      assert.equal(seen.at(-1).marketplace, "EBAY_GB", "the row's own marketplace is the lookup context");
      const fr = await ebay.getListingFreshness("123", "EBAY_GB");
      assert.equal(fr.status, status);
    });
  }
  // a SOLD snapshot still carries the price fields the auction path reads
  await withMockedEbay(json(200, SOLD_BODY), async (ebay) => {
    const snap = await ebay.getListingSnapshot("123", "EBAY_US");
    assert.equal(snap.price, 12);
    assert.equal(snap.listingType, "FIXED_PRICE");
  });
});

test("SIF-5. getItemsByLegacyIds (the feed's re-fetch) now carries soldOut from the item body", async () => {
  await withMockedEbay(() => new Response(JSON.stringify(SOLD_BODY), { status: 200 }), async (ebay) => {
    const { listings } = await ebay.getItemsByLegacyIds(["123"], "EBAY_US");
    assert.equal(listings.length, 1);
    assert.equal(listings[0].soldOut, true);
  });
  await withMockedEbay(() => new Response(JSON.stringify(LIVE_BODY), { status: 200 }), async (ebay) => {
    const { listings } = await ebay.getItemsByLegacyIds(["456"], "EBAY_US");
    assert.equal(listings[0].soldOut, false);
  });
});

// ---------------------------------------------------------------------------
// 2. overlapping discovery + verification writes
// ---------------------------------------------------------------------------

// In-memory model of `deals` supporting exactly the PostgREST calls the
// writers make. Unique key (source, marketplace, listing_id). Each
// statement is applied atomically, which is what Postgres guarantees for a
// single UPDATE (its WHERE is re-checked after waiting on a concurrent
// writer's row lock) - so "the verifier committed first" and "the sighting
// committed first" are both modelled by statement order.
function fakeDb(initialRows = []) {
  const rows = initialRows.map((r) => ({ ...r }));
  let nextId = Math.max(0, ...rows.map((r) => r.id ?? 0)) + 1;
  const log = [];
  const sightingWritable = (r) => r.disqualified_reason == null || !String(r.disqualified_reason).startsWith("availability:");
  function builder(table) {
    assert.equal(table, "deals");
    const st = { op: null, patch: null, filters: [], upsertOpts: null, row: null };
    const api = {
      update(patch) { st.op = "update"; st.patch = patch; return api; },
      upsert(row, opts) { st.op = "upsert"; st.row = row; st.upsertOpts = opts; return api; },
      match(obj) { for (const [k, v] of Object.entries(obj)) st.filters.push((r) => r[k] === v); return api; },
      eq(k, v) { st.filters.push((r) => r[k] === v); return api; },
      or(clause) {
        assert.equal(clause, SIGHTING_WRITABLE_OR, "only the sighting guard clause is modelled");
        st.filters.push(sightingWritable);
        return api;
      },
      select() { return api; },
      then(resolve, reject) {
        try { resolve(run()); } catch (e) { reject(e); }
      },
    };
    function run() {
      log.push(st.op);
      if (st.op === "update") {
        const hit = rows.filter((r) => st.filters.every((f) => f(r)));
        for (const r of hit) Object.assign(r, st.patch);
        return { data: hit.map((r) => ({ id: r.id, watchlist_id: r.watchlist_id, card_tcgplayer_id: r.card_tcgplayer_id })), error: null };
      }
      if (st.op === "upsert") {
        assert.equal(st.upsertOpts?.onConflict, "source,marketplace,listing_id");
        const k = (r) => `${r.source}|${r.marketplace}|${r.listing_id}`;
        const existing = rows.find((r) => k(r) === k(st.row));
        if (existing) {
          if (st.upsertOpts.ignoreDuplicates) return { data: [], error: null };
          Object.assign(existing, st.row); // the OLD behaviour, for contrast
          return { data: [{ id: existing.id }], error: null };
        }
        const created = { id: nextId++, first_seen_at: st.row.last_seen_at, disqualified_reason: null, ...st.row };
        rows.push(created);
        return { data: [{ id: created.id }], error: null };
      }
      throw new Error(`unmodelled op ${st.op}`);
    }
    return api;
  }
  return { from: builder, rows, log };
}

const T0 = "2026-09-11T08:00:00.000Z";
const T_SALE_CHECK = "2026-09-11T09:00:00.000Z";
const T_SIGHT = "2026-09-11T09:05:00.000Z";

const liveRow = (over = {}) => ({
  id: 1,
  source: "ebay",
  marketplace: "EBAY_US",
  listing_id: "v1|398204902620|0",
  watchlist_id: 77,
  card_tcgplayer_id: "4242",
  title: "Pikachu 58/102 Base Set",
  is_active: true,
  is_graded: false,
  condition: "Near Mint",
  market_price: 40,
  discount_pct: 0.3,
  price: 26,
  total_price: 28,
  listing_type: "FIXED_PRICE",
  first_seen_at: T0,
  last_seen_at: T0,
  exact_verified_at: null,
  disqualified_reason: null,
  ...over,
});
// what refresh-deals' dealRow() / ingest-feed send (no disqualified_reason)
const sighting = (over = {}) => ({
  source: "ebay",
  marketplace: "EBAY_US",
  listing_id: "v1|398204902620|0",
  watchlist_id: 77,
  title: "Pikachu 58/102 Base Set",
  price: 25,
  total_price: 27,
  discount_pct: 0.33,
  is_active: true,
  last_seen_at: T_SIGHT,
  ...over,
});
// exactly the verify-deals retirement write for a SOLD / ENDED verdict
async function verifierRetire(db, id, status, checkedAt = T_SALE_CHECK) {
  const reason = availabilityRetirementReason(status);
  const patch = { is_active: false, exact_verified_at: checkedAt };
  if (reason) patch.disqualified_reason = reason;
  return db.from("deals").update(patch).eq("id", id);
}

test("SIF-6. contrast: the OLD upsert reactivated a sold row and gave it a fresh last_seen_at", async () => {
  const db = fakeDb([liveRow()]);
  await verifierRetire(db, 1, "SOLD");
  await db.from("deals").upsert(sighting(), { onConflict: "source,marketplace,listing_id" });
  assert.equal(db.rows[0].is_active, true, "old behaviour: reactivated");
  assert.equal(db.rows[0].last_seen_at, T_SIGHT);
});

test("SIF-7. verifier retires as SOLD, THEN a search sighting arrives: blocked - stays retired, reason and timestamps untouched, hidden", async () => {
  const db = fakeDb([liveRow()]);
  await verifierRetire(db, 1, "SOLD");
  const res = await writeDiscoverySighting(db, sighting());
  assert.equal(res.outcome, "blocked");
  const r = db.rows[0];
  assert.equal(r.is_active, false);
  assert.equal(r.disqualified_reason, SEEN_AGAIN.SOLD, "the sighting is recorded ONLY as the seen-again marker");
  assert.equal(res.markedSeenAgain, true);
  assert.equal(baseAvailabilityReason(r.disqualified_reason), AVAILABILITY_RETIREMENT.SOLD);
  assert.equal(r.last_seen_at, T0, "a sighting of a sold row must not refresh freshness");
  assert.equal(r.exact_verified_at, T_SALE_CHECK);
  assert.equal(r.price, 26, "no sighting column of the retired row is rewritten");
  assert.equal(isDisplayableDeal(r), false);
  assert.equal(db.rows.length, 1, "no duplicate row inserted");
});

test("SIF-8. a search sighting, THEN the verifier retires: the retirement wins (either commit order ends retired)", async () => {
  const db = fakeDb([liveRow()]);
  const res = await writeDiscoverySighting(db, sighting());
  assert.equal(res.outcome, "updated");
  assert.equal(db.rows[0].last_seen_at, T_SIGHT);
  await verifierRetire(db, 1, "SOLD", "2026-09-11T09:06:00.000Z");
  assert.equal(db.rows[0].is_active, false);
  assert.equal(db.rows[0].disqualified_reason, AVAILABILITY_RETIREMENT.SOLD);
  // and a further sighting in the same run is now blocked (and marks once)
  assert.equal((await writeDiscoverySighting(db, sighting({ last_seen_at: "2026-09-11T09:07:00.000Z" }))).outcome, "blocked");
  const again = await writeDiscoverySighting(db, sighting({ last_seen_at: "2026-09-11T09:08:00.000Z" }));
  assert.equal(again.outcome, "blocked");
  assert.equal(again.markedSeenAgain, false, "an already-marked row is not re-marked");
  assert.equal(db.rows[0].is_active, false);
  assert.equal(db.rows[0].disqualified_reason, SEEN_AGAIN.SOLD);
});

test("SIF-9. a feed re-fetch sighting (ingest payload) is blocked on a row retired as not found in that marketplace", async () => {
  const db = fakeDb([liveRow({ marketplace: "EBAY_GB" })]);
  await verifierRetire(db, 1, "ENDED");
  assert.equal(db.rows[0].disqualified_reason, "availability:not_found_in_marketplace");
  const feedPayload = sighting({ marketplace: "EBAY_GB", discovery_source: "external", card_catalog_id: "4242", condition: "Near Mint" });
  assert.equal((await writeDiscoverySighting(db, feedPayload)).outcome, "blocked");
  assert.equal(db.rows[0].is_active, false);
  assert.equal(db.rows[0].disqualified_reason, SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE, "not-found keeps its own family - never merged into sold");
  assert.equal(db.rows[0].discovery_source, undefined, "blocked write touched nothing");
});

test("SIF-10. no cross-market propagation: retiring the US row leaves the same item's GB row live and writable", async () => {
  const db = fakeDb([liveRow({ id: 1, marketplace: "EBAY_US" }), liveRow({ id: 2, marketplace: "EBAY_GB" })]);
  await verifierRetire(db, 1, "SOLD");
  assert.equal(db.rows[1].is_active, true);
  assert.equal(db.rows[1].disqualified_reason, null);
  assert.equal((await writeDiscoverySighting(db, sighting({ marketplace: "EBAY_GB" }))).outcome, "updated");
  assert.equal((await writeDiscoverySighting(db, sighting({ marketplace: "EBAY_US" }))).outcome, "blocked");
  assert.equal(db.rows[1].last_seen_at, T_SIGHT);
  assert.equal(db.rows[0].last_seen_at, T0);
});

test("SIF-11. new listing inserts; an ordinary live row updates (same columns as the old upsert)", async () => {
  const db = fakeDb([liveRow()]);
  assert.equal((await writeDiscoverySighting(db, sighting())).outcome, "updated");
  assert.equal(db.rows[0].price, 25);
  assert.equal(db.rows[0].discount_pct, 0.33);
  const res = await writeDiscoverySighting(db, sighting({ listing_id: "v1|999|0" }));
  assert.equal(res.outcome, "inserted");
  assert.equal(db.rows.length, 2);
  assert.equal(db.rows[1].is_active, true);
});

test("SIF-12. pre-existing semantics kept: a quality-disqualified row may be refreshed but its reason survives (still hidden)", async () => {
  const db = fakeDb([liveRow({ disqualified_reason: "condition:damaged", is_active: false })]);
  assert.equal((await writeDiscoverySighting(db, sighting())).outcome, "updated");
  assert.equal(db.rows[0].disqualified_reason, "condition:damaged");
  assert.equal(isDisplayableDeal(db.rows[0]), false);
});

test("SIF-13. an auction retired BELOW THRESHOLD (a price outcome) carries no availability reason, so a genuine later sighting may re-publish it", async () => {
  const db = fakeDb([liveRow({ listing_type: "AUCTION" })]);
  await verifierRetire(db, 1, "RETIRED");
  assert.equal(db.rows[0].disqualified_reason, null);
  assert.equal((await writeDiscoverySighting(db, sighting({ listing_type: "AUCTION" }))).outcome, "updated");
  assert.equal(db.rows[0].is_active, true);
});

test("SIF-14. a database error surfaces as outcome 'error' (never silently counted as blocked)", async () => {
  const db = { from: () => ({ update: () => ({ match: () => ({ or: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) }) }) }) };
  const res = await writeDiscoverySighting(db, sighting());
  assert.equal(res.outcome, "error");
  assert.equal(res.error.message, "boom");
});

// ---------------------------------------------------------------------------
// display paths
// ---------------------------------------------------------------------------

test("SIF-15. every display gate hides an availability-retired row, even if something set is_active back to true", () => {
  const legacyReactivated = liveRow({ disqualified_reason: AVAILABILITY_RETIREMENT.SOLD, is_active: true, last_seen_at: new Date().toISOString() });
  assert.equal(isAvailabilityRetired(legacyReactivated), true);
  assert.equal(isDisplayableDeal(legacyReactivated), false);
  // the read paths that decide what visitors see all route through that gate
  assert.match(read("lib/deals.js"), /function displayable\(rows\) \{\s*return \(rows \?\? \[\]\)\.filter\(isDisplayableDeal\)/);
  assert.match(read("lib/searchEngine.js"), /filter\(isDisplayableDeal\)/);
  assert.match(read("app/api/card-search/route.js"), /filter\(isDisplayableDeal\)/);
  assert.match(read("lib/sitemap.js"), /isDisplayableDeal/);
  // the pooled homepage / deals-page shape selects the column the gate reads
  assert.match(read("lib/dealPoolShape.mjs"), /"disqualified_reason"/);
  // card offers (hub + filtered) filter through displayable()
  const deals = read("lib/deals.js");
  const offers = deals.slice(deals.indexOf("async function fetchCardOffersUncached"), deals.indexOf("export function fetchCardOffers"));
  assert.match(offers, /displayable\(data\)/);
  const filtered = deals.slice(deals.indexOf("async function fetchCardDealsPageUncached"), deals.indexOf("export function fetchCardDealsPage"));
  assert.match(filtered, /displayable\(/);
});

test("SIF-16. the expired-deal redirect contract is unchanged for a retired row", () => {
  const retired = liveRow({ is_active: false, disqualified_reason: AVAILABILITY_RETIREMENT.SOLD });
  assert.deepEqual(expiredDealDestination({ deal: retired, hubSlug: "pikachu-base-set-58", catalogSlug: "pikachu-base-set-58" }), {
    action: "redirect", href: "/cards/pikachu-base-set-58", reason: "LIVE_HUB",
  });
  assert.deepEqual(expiredDealDestination({ deal: retired, hubSlug: null, catalogSlug: "pikachu-base-set-58" }), {
    action: "redirect", href: "/cards/pikachu-base-set-58", reason: "CATALOGUE_CARD",
  });
  assert.equal(expiredDealDestination({ deal: retired }).action, "gone");
  assert.equal(expiredDealDestination({ deal: null }).reason, "NO_ROW");
  const src = read("lib/dealPage.js");
  assert.match(src, /if \(deal\.is_active\) return \{ action: "render", reason: "ACTIVE_DISPLAY_GATED" \};/);
});

// ---------------------------------------------------------------------------
// 3. third-party board sightings
// ---------------------------------------------------------------------------

test("SIF-17. ingest-feed no longer bumps last_seen_at from board presence; only real item lookups write it", () => {
  const src = read("app/api/ingest-feed/route.js");
  const code = stripComments(src);
  assert.doesNotMatch(code, /stillListed/);
  // the only last_seen_at write left is inside the verified-listing sighting payload
  const writes = code.match(/last_seen_at:/g) ?? [];
  assert.equal(writes.length, 1, "exactly one last_seen_at write (the looked-up listing's sighting)");
  const sightingIdx = code.indexOf("writeDiscoverySighting(");
  const lastSeenIdx = code.indexOf("last_seen_at:");
  assert.ok(sightingIdx > 0 && lastSeenIdx > sightingIdx, "last_seen_at is written only as part of the looked-up sighting");
  assert.ok(lastSeenIdx > code.indexOf("getItemsByLegacyIds("), "and only after an eBay item lookup");
  // the board is still used as a discovery hint (candidates, cooldowns)
  assert.match(code, /partitionCandidates\(/);
  assert.match(code, /fetchFeed\(\)/);
});

test("SIF-18. ingest-feed: known-retired items skip the lookup; a sold-out lookup is never re-published and retires only that marketplace's row", () => {
  const code = stripComments(read("app/api/ingest-feed/route.js"));
  assert.match(code, /isAvailabilityRetired\(r\)/);
  assert.match(code, /skippedAvailabilityRetired/);
  const soldIdx = code.indexOf("listing.soldOut === true");
  assert.ok(soldIdx > 0 && soldIdx < code.indexOf("qualifiesAsTradingCard(listing)"), "sold-out check runs before any gate");
  const soldBlock = code.slice(soldIdx, code.indexOf("continue;", soldIdx));
  assert.match(soldBlock, /disqualified_reason: AVAILABILITY_RETIREMENT\.SOLD/);
  assert.match(soldBlock, /\.match\(\{ source: "ebay", marketplace: listing\.marketplace, listing_id: listing\.listingId \}\)/);
  assert.match(soldBlock, /\.eq\("is_active", true\)/);
  assert.doesNotMatch(code, /\.from\("deals"\)\.upsert\(/, "no unguarded deal upsert remains");
});

test("SIF-19. refresh-deals: both scan writers use the guarded sighting write; the sweep now honours soldOut like the per-card scan", () => {
  const code = stripComments(read("app/api/refresh-deals/route.js"));
  assert.doesNotMatch(code, /\.from\("deals"\)\s*\.upsert\(/);
  assert.equal((code.match(/await writeDiscoverySighting\(db, core\)/g) ?? []).length, 2);
  const sweep = code.slice(code.indexOf("async function runSweep"));
  assert.match(sweep, /if \(resolved\.hold\) continue;\s*if \(resolved\.soldOut\) continue;/);
  assert.match(code, /blockedRetired/);
});

test("SIF-20. verify-deals persists the reason on SOLD / ENDED only, per row, and keeps its quota controls", () => {
  const src = read("app/api/verify-deals/route.js");
  const code = stripComments(src);
  assert.match(code, /const reason = availabilityRetirementReason\(status\);/);
  assert.match(code, /if \(reason\) patch\.disqualified_reason = reason;/);
  assert.match(code, /await db\.from\("deals"\)\.update\(patch\)\.eq\("id", r\.id\)/);
  assert.doesNotMatch(code, /\.in\("listing_id"|\.eq\("listing_id"/, "no write keyed by listing id (would reach other marketplaces)");
  assert.match(code, /const BATCH = 20;/);
  assert.match(code, /const RESERVE = 800;/);
  const ingest = stripComments(read("app/api/ingest-feed/route.js"));
  assert.match(ingest, /const MAX_NEW_PER_CYCLE = 40;/);
  assert.match(ingest, /const RATE_LIMIT_FLOOR = 800;/);
  assert.match(ingest, /const RECENT_VERIFY_HOURS = 20;/);
});

// ---------------------------------------------------------------------------
// 4. deal page wording
// ---------------------------------------------------------------------------

test("SIF-21. evidence: exact_verified_at counts as a confirmation only when it was one", () => {
  // ACTIVE verification stamps both with the same instant
  assert.deepEqual(listingAvailabilityEvidence({ last_seen_at: T0, exact_verified_at: T0 }), { kind: "confirmed", at: T0 });
  // same instant, different serialisations (Postgres returns +00:00)
  assert.equal(listingAvailabilityEvidence({ last_seen_at: "2026-09-11T08:00:00.123+00:00", exact_verified_at: "2026-09-11T08:00:00.123Z" }).kind, "confirmed");
  // an earlier exact stamp is NOT evidence of a successful active verdict:
  // legacy rows the old code retired (stamp) and then revived (sighting)
  // look exactly like this, so it reads as "seen", never "confirmed"
  assert.deepEqual(listingAvailabilityEvidence({ last_seen_at: T_SIGHT, exact_verified_at: T0 }), { kind: "seen", at: T_SIGHT });
  // one millisecond apart is already not the same write
  assert.equal(listingAvailabilityEvidence({ last_seen_at: "2026-09-11T08:00:00.124Z", exact_verified_at: "2026-09-11T08:00:00.123Z" }).kind, "seen");
  // a retirement stamps exact_verified_at alone (later than last_seen_at)
  assert.deepEqual(listingAvailabilityEvidence({ last_seen_at: T0, exact_verified_at: T_SALE_CHECK }), { kind: "seen", at: T0 });
  // a row carrying an availability reason is never "confirmed"
  assert.deepEqual(
    listingAvailabilityEvidence({ last_seen_at: T0, exact_verified_at: T0, disqualified_reason: "availability:sold" }),
    { kind: "seen", at: T0 }
  );
  // never verified -> discovery evidence only
  assert.deepEqual(listingAvailabilityEvidence({ last_seen_at: T0, exact_verified_at: null }), { kind: "seen", at: T0 });
  assert.equal(listingAvailabilityEvidence({}), null);
  assert.equal(listingAvailabilityEvidence(null), null);
});

test("SIF-22. the deal page says 'Availability confirmed' only for a proven active verdict, otherwise 'Last seen in eBay listings'; no 'Listing checked'", () => {
  const src = read("app/deals/[id]/page.js");
  assert.doesNotMatch(src, /Listing checked/);
  assert.match(src, /const availabilityEvidence = listingAvailabilityEvidence\(deal\);/);
  assert.match(src, /availabilityEvidence\?\.kind === "confirmed"[\s\S]{0,200}Availability confirmed on eBay <RelativeTime date=\{availabilityEvidence\.at\} \/>/);
  assert.match(src, /availabilityEvidence\?\.kind === "seen"[\s\S]{0,200}Last seen in eBay listings <RelativeTime date=\{availabilityEvidence\.at\} \/> · not individually re-checked since/);
  // the confirmed line never reads last_seen_at
  const confirmedLine = src.slice(src.indexOf('availabilityEvidence?.kind === "confirmed"'), src.indexOf('availabilityEvidence?.kind === "seen"'));
  assert.doesNotMatch(confirmedLine, /last_seen_at/);
});

// ---------------------------------------------------------------------------
// 5. cache invalidation
// ---------------------------------------------------------------------------

test("SIF-23. card-offer tags per card identity; the invalidation plan deduplicates by card", () => {
  assert.deepEqual(cardOffersTags({ watchlistId: 77, tcgplayerId: "4242" }), ["card-offers:w:77", "card-offers:t:4242"]);
  assert.deepEqual(cardOffersTags({ watchlistId: 77 }), ["card-offers:w:77"]);
  assert.deepEqual(cardOffersTags({ watchlistId: null, tcgplayerId: "" }), []);
  assert.equal(dealDetailTag(12), "deal-detail:12");
  const plan = retirementInvalidationPlan([
    { id: 1, watchlist_id: 77, card_tcgplayer_id: "4242" },
    { id: 2, watchlist_id: 77, card_tcgplayer_id: "4242" }, // same card, other marketplace
    { id: 3, watchlist_id: 77, card_tcgplayer_id: "4242" },
    { id: 4, watchlist_id: null, card_tcgplayer_id: "9001" }, // feed-only card
  ]);
  assert.equal(plan.cards, 2);
  assert.equal(plan.deals, 4);
  assert.deepEqual(plan.tags, [
    "card-offers:w:77", "card-offers:t:4242", "card-offers:t:9001",
    "deal-detail:1", "deal-detail:2", "deal-detail:3", "deal-detail:4",
  ]);
  assert.deepEqual(retirementInvalidationPlan([]), { tags: [], cards: 0, deals: 0 });
});

test("SIF-24. expireTags expires immediately ({ expire: 0 }) and never throws", () => {
  const calls = [];
  const out = expireTags((t, p) => { calls.push([t, p]); if (t === "bad") throw new Error("no store"); }, ["a", "bad", "b"]);
  assert.deepEqual(calls.map((c) => c[0]), ["a", "bad", "b"]);
  for (const [, p] of calls) assert.deepEqual(p, { expire: 0 });
  assert.equal(out.expired, 2);
  assert.equal(out.errors.length, 1);
});

test("SIF-25. the cached offers, the filtered card view and the deal detail carry those tags; the windows are unchanged", () => {
  const deals = read("lib/deals.js");
  assert.match(deals, /unstable_cache\(fetchCardOffersUncached, \["card-offers-v2"\], \{\s*revalidate: POOL_REVALIDATE_SECONDS,\s*tags: cardOffersTags\(\{ watchlistId, tcgplayerId \}\),/);
  assert.match(deals, /unstable_cache\(fetchCardDealsPageUncached, \["card-deals-page"\], \{\s*revalidate: POOL_REVALIDATE_SECONDS,\s*tags: cardOffersTags\(/);
  assert.match(deals, /const POOL_REVALIDATE_SECONDS = 180;/);
  const page = read("app/deals/[id]/page.js");
  assert.match(page, /unstable_cache\(loadDealUncached, \["deal-detail"\], \{ revalidate: 60, tags: \[dealDetailTag\(id\)\] \}\)\(id\)/);
  assert.match(page, /export const revalidate = 600;/);
  assert.match(read("app/cards/[slug]/page.js"), /export const revalidate = 3600;/);
});

test("SIF-26. verify-deals and ingest-feed expire tags once per run, after the loop, from the deduplicated plan", () => {
  for (const f of ["app/api/verify-deals/route.js", "app/api/ingest-feed/route.js"]) {
    const code = stripComments(read(f));
    assert.equal((code.match(/expireTags\(revalidateTag,/g) ?? []).length, 1, f);
    assert.match(code, /retirementInvalidationPlan\(retiredRows\)/, f);
    assert.match(code, /import \{ revalidateTag \} from "next\/cache";/, f);
  }
  const verify = stripComments(read("app/api/verify-deals/route.js"));
  assert.ok(verify.indexOf("expireTags(revalidateTag") > verify.indexOf("for (const r of batch)"), "after the per-row loop");
  assert.match(verify, /"id, watchlist_id, listing_id, marketplace,/);
});

// ---------------------------------------------------------------------------
// tightening round: insert race, recovery path
// ---------------------------------------------------------------------------

test("SIF-27. insert race: another writer creates the row between our UPDATE and INSERT -> the guarded retry updates it (never reported as blocked)", async () => {
  const db = fakeDb([]);
  const realFrom = db.from;
  let injected = false;
  db.from = (t) => {
    const b = realFrom(t);
    const realUpsert = b.upsert;
    b.upsert = (row, opts) => {
      if (!injected) {
        injected = true;
        db.rows.push({ id: 900, disqualified_reason: null, ...row, price: 1 }); // the concurrent writer's committed insert
      }
      return realUpsert(row, opts);
    };
    return b;
  };
  const res = await writeDiscoverySighting(db, sighting({ listing_id: "v1|777|0" }));
  assert.equal(res.outcome, "updated");
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].price, 25, "our sighting's values applied by the retry");
});

test("SIF-28. recoveryDecision: only positive availability lifts a retirement; sold and not-found stay distinct; UNKNOWN only consumes the marker", () => {
  const retired = liveRow({ is_active: false, disqualified_reason: SEEN_AGAIN.SOLD, price: 26, shipping: 2, currency: "USD" });
  const live = { status: "ACTIVE", listingType: "FIXED_PRICE", price: 26, shipping: 2, currency: "USD" };
  const NOW = "2026-09-13T10:00:00.000Z";
  assert.deepEqual(recoveryDecision({ row: retired, snapshot: live, nowIso: NOW }), {
    action: "reactivate",
    patch: { is_active: true, disqualified_reason: null, last_seen_at: NOW, exact_verified_at: NOW },
  });
  // restocked at a different price -> retirement lifted, stays inactive, discovery re-qualifies it
  for (const moved of [{ price: 30 }, { shipping: 9 }, { currency: "GBP" }, { listingType: "AUCTION" }]) {
    assert.deepEqual(recoveryDecision({ row: retired, snapshot: { ...live, ...moved }, nowIso: NOW }), {
      action: "release",
      patch: { disqualified_reason: null, exact_verified_at: NOW },
    }, JSON.stringify(moved));
  }
  assert.equal(recoveryDecision({ row: retired, snapshot: { ...live, price: 26.2 }, nowIso: NOW }).action, "reactivate", "within 1%");
  // sold again / not found again: back to the base reason for THAT verdict
  assert.deepEqual(recoveryDecision({ row: retired, snapshot: { status: "SOLD" }, nowIso: NOW }).patch, { disqualified_reason: AVAILABILITY_RETIREMENT.SOLD, exact_verified_at: NOW });
  const nf = liveRow({ is_active: false, disqualified_reason: SEEN_AGAIN.NOT_FOUND_IN_MARKETPLACE });
  assert.deepEqual(recoveryDecision({ row: nf, snapshot: { status: "ENDED" }, nowIso: NOW }).patch, { disqualified_reason: AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE, exact_verified_at: NOW });
  assert.equal(recoveryDecision({ row: nf, snapshot: { status: "SOLD" }, nowIso: NOW }).patch.disqualified_reason, AVAILABILITY_RETIREMENT.SOLD, "a sold verdict is stronger evidence than not-found");
  // UNKNOWN (incl. a 200 without availability data): no verdict, no timestamp, marker consumed
  for (const snap of [{ status: "UNKNOWN" }, null]) {
    assert.deepEqual(recoveryDecision({ row: nf, snapshot: snap, nowIso: NOW }), { action: "retain", patch: { disqualified_reason: AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE } });
  }
});

test("SIF-29. recovery end to end on the table model: retire -> sighting marks -> exact re-check reactivates with a confirmed stamp; a stale marker write is skipped", async () => {
  const db = fakeDb([liveRow({ currency: "USD", shipping: 2 })]);
  await verifierRetire(db, 1, "SOLD");
  assert.equal((await writeDiscoverySighting(db, sighting())).outcome, "blocked");
  const candidate = { ...db.rows[0] };
  assert.equal(candidate.disqualified_reason, SEEN_AGAIN.SOLD);
  const NOW = "2026-09-13T10:00:00.000Z";
  const decision = recoveryDecision({ row: candidate, snapshot: { status: "ACTIVE", listingType: "FIXED_PRICE", price: 26, shipping: 2, currency: "USD" }, nowIso: NOW });
  // the verify-deals write, conditioned on the marker it read
  const w = await db.from("deals").update(decision.patch).eq("id", 1).eq("is_active", false).eq("disqualified_reason", candidate.disqualified_reason).select("id");
  assert.equal(w.data.length, 1);
  assert.equal(db.rows[0].is_active, true);
  assert.equal(db.rows[0].disqualified_reason, null, "retirement lifted - the display gate no longer rejects it for availability");
  assert.equal(isAvailabilityRetired(db.rows[0]), false);
  assert.equal(listingAvailabilityEvidence(db.rows[0]).kind, "confirmed");
  // a second (overlapping) recovery write with the same stale marker does nothing
  const w2 = await db.from("deals").update({ disqualified_reason: AVAILABILITY_RETIREMENT.SOLD }).eq("id", 1).eq("is_active", false).eq("disqualified_reason", candidate.disqualified_reason).select("id");
  assert.equal(w2.data.length, 0);
  assert.equal(db.rows[0].is_active, true);
});

test("SIF-30. verify-deals recovery is bounded: seen-again FIXED_PRICE rows only, 24h-14d since the last check, one slot carved out of BATCH, same single lookup", () => {
  assert.equal(RECOVERY_SLOTS_PER_RUN, 1);
  assert.equal(RECOVERY_MIN_HOURS_SINCE_CHECK, 24);
  assert.equal(RECOVERY_MAX_AGE_DAYS, 14);
  const code = stripComments(read("app/api/verify-deals/route.js"));
  const q = code.slice(code.indexOf("let recoveryRows = []"), code.indexOf("const recoveryIds"));
  assert.match(q, /\.eq\("is_active", false\)/);
  assert.match(q, /\.eq\("listing_type", "FIXED_PRICE"\)/);
  assert.match(q, /\.in\("disqualified_reason", \[SEEN_AGAIN\.SOLD, SEEN_AGAIN\.NOT_FOUND_IN_MARKETPLACE\]\)/);
  assert.match(q, /\.lte\("exact_verified_at", new Date\(now - RECOVERY_MIN_HOURS_SINCE_CHECK \* H\)/);
  assert.match(q, /\.gte\("exact_verified_at", new Date\(now - RECOVERY_MAX_AGE_DAYS \* 24 \* H\)/);
  assert.match(q, /\.limit\(RECOVERY_SLOTS_PER_RUN\)/);
  assert.match(code, /batch: BATCH - recoveryRows\.length,/, "the recovery slot is taken OUT of BATCH");
  assert.match(code, /batch\.unshift\(\.\.\.recoveryRows\)/);
  assert.equal((code.match(/await getListingSnapshot\(/g) ?? []).length, 2, "no new lookup call site");
  assert.match(code, /\.eq\("disqualified_reason", r\.disqualified_reason\)/, "conditional on the marker read");
  // the quota guard still reserves the full BATCH
  assert.match(code, /if \(rl\.remaining - BATCH < RESERVE\)/);
});

// ---------------------------------------------------------------------------
// premium placement uses the SAME positive-ACTIVE evidence rule
// (fixtures only - no eBay calls)
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000;
const hoursAgo = (h, base) => new Date(base - h * HOUR_MS).toISOString();
// A fully displayable, premium-shaped BIN row (same shape as the
// deal-availability-freshness fixture), with the timestamps supplied.
const premiumRow = ({ lastSeen, exact, reason = null, active = true }) => ({
  id: 4242,
  is_active: active,
  is_graded: false,
  title: "Charizard GX 9/68 SM Hidden Fates Holo Rare",
  condition: "Near Mint",
  card_language: "english",
  card_name: "Charizard GX",
  card_set: "SM - Hidden Fates",
  card_tcgplayer_id: "191319",
  market_price: 40,
  discount_pct: 0.3,
  listing_type: "FIXED_PRICE",
  auction_end_at: null,
  first_seen_at: lastSeen,
  last_seen_at: lastSeen,
  exact_verified_at: exact,
  listing_id: "v1|123456789012|0",
  listing_url: "https://www.ebay.com/itm/123456789012?x=1",
  affiliate_url: "https://www.ebay.com/itm/123456789012?x=1&campid=5",
  disqualified_reason: reason,
  visual_authenticity_status: null,
});

test("SIF-31. one rule: the deal page wording and premium eligibility share isPositiveActiveConfirmation", () => {
  assert.equal(isPositiveActiveConfirmationDQ, isPositiveActiveConfirmation, "dealQuality re-exports the same function");
  const src = stripComments(read("lib/dealQuality.js"));
  const fn = src.slice(src.indexOf("function isExactVerifiedFresh"), src.indexOf("}", src.indexOf("function isExactVerifiedFresh")) + 1);
  assert.match(fn, /if \(!isPositiveActiveConfirmation\(row\)\) return false;/);
  assert.match(fn, /PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS/, "the 12h window still applies on top");
  const la = stripComments(read("lib/listingAvailability.js"));
  assert.match(la, /if \(isPositiveActiveConfirmation\(deal\)\) return \{ kind: "confirmed"/);
});

test("SIF-32. a genuine fresh ACTIVE confirmation qualifies for premium placement (and only inside the 12h window)", () => {
  const now = Date.now();
  const t = hoursAgo(1, now);
  const r = premiumRow({ lastSeen: t, exact: t });
  assert.equal(isDisplayableDeal(r), true, "fixture sanity: displayable");
  assert.equal(isPositiveActiveConfirmation(r), true);
  assert.equal(isExactVerifiedFresh(r, now), true);
  assert.equal(isPremiumDealEligible(r, now), true);
  assert.equal(listingAvailabilityEvidence(r).kind, "confirmed");
  // same instant, Postgres serialisation vs JS serialisation
  const pg = t.replace("Z", "+00:00");
  assert.equal(isPremiumDealEligible(premiumRow({ lastSeen: pg, exact: t }), now), true);
  // a genuine confirmation older than the window does not
  const old = hoursAgo(PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS + 1, now);
  assert.equal(isPremiumDealEligible(premiumRow({ lastSeen: old, exact: old }), now), false);
});

test("SIF-33. a recent SOLD or NOT_FOUND retirement followed by a sighting can never qualify - with or without the reason surviving", () => {
  const now = Date.now();
  const retiredAt = hoursAgo(2, now); // the verifier's retirement stamp (exact_verified_at alone)
  const sightedAt = hoursAgo(1, now); // a later discovery sighting
  for (const reason of [AVAILABILITY_RETIREMENT.SOLD, AVAILABILITY_RETIREMENT.NOT_FOUND_IN_MARKETPLACE]) {
    // (a) the new code path: the reason is persisted, the sighting is blocked;
    //     even a row something forced back to is_active stays out
    const withReason = premiumRow({ lastSeen: sightedAt, exact: retiredAt, reason });
    assert.equal(isPremiumDealEligible(withReason, now), false, reason);
    assert.equal(isSociallyEligible(withReason, now), false, reason);
    // (b) the LEGACY shape: retired by the old code (no reason), then
    //     revived by a sighting - recent stamp, displayable row
    const legacy = premiumRow({ lastSeen: sightedAt, exact: retiredAt, reason: null });
    assert.equal(isDisplayableDeal(legacy), true, "fixture sanity: the legacy row IS displayable");
    assert.equal(isExactVerifiedFresh(legacy, now), false, "a recent retirement timestamp must never qualify");
    assert.equal(isPremiumDealEligible(legacy, now), false);
    assert.equal(isSociallyEligible(legacy, now), false);
    assert.equal(listingAvailabilityEvidence(legacy).kind, "seen");
    // (c) the retirement stamp with no later sighting (exact AFTER last seen)
    const stampOnly = premiumRow({ lastSeen: hoursAgo(3, now), exact: retiredAt, reason: null });
    assert.equal(isPremiumDealEligible(stampOnly, now), false);
  }
  // (d) through the real write sequence on the table model: retire, then a
  //     sighting tries to revive it
  return (async () => {
    const t = hoursAgo(1, now);
    const db = fakeDb([{ ...premiumRow({ lastSeen: t, exact: t }), source: "ebay", marketplace: "EBAY_US" }]);
    assert.equal(isPremiumDealEligible(db.rows[0], now), true, "confirmed and eligible before the sale");
    await db.from("deals").update({ is_active: false, exact_verified_at: hoursAgo(0.5, now), disqualified_reason: AVAILABILITY_RETIREMENT.SOLD }).eq("id", 4242);
    await writeDiscoverySighting(db, { source: "ebay", marketplace: "EBAY_US", listing_id: "v1|123456789012|0", is_active: true, last_seen_at: new Date(now).toISOString() });
    assert.equal(db.rows[0].is_active, false);
    assert.equal(isPremiumDealEligible(db.rows[0], now), false);
  })();
});

test("SIF-34. a later sighting conservatively ends premium eligibility until the verifier confirms again", () => {
  const now = Date.now();
  const confirmed = hoursAgo(3, now);
  const r = premiumRow({ lastSeen: hoursAgo(1, now), exact: confirmed });
  assert.equal(isPremiumDealEligible(r, now), false);
  const reconfirmed = hoursAgo(0.1, now);
  assert.equal(isPremiumDealEligible(premiumRow({ lastSeen: reconfirmed, exact: reconfirmed }), now), true);
});

test("SIF-35. UNKNOWN cannot create a confirmation: no availability data -> UNKNOWN -> no write, so nothing becomes eligible", () => {
  // every inconclusive response class maps to UNKNOWN
  for (const input of [
    { httpStatus: 200, body: { itemId: "x" } },
    { httpStatus: 200, body: { estimatedAvailabilities: [{ estimatedAvailabilityStatus: "IN_STOCK" }, {}] } },
    { httpStatus: 429 }, { httpStatus: 503 }, { fetchFailed: true }, { httpStatus: 200, parseFailed: true },
  ]) {
    assert.equal(classifyItemLookup(input).status, "UNKNOWN", JSON.stringify(input));
  }
  // verify-deals writes last_seen_at + exact_verified_at together ONLY in
  // the ACTIVE branch; UNKNOWN has no write at all
  const code = stripComments(read("app/api/verify-deals/route.js"));
  const writes = code.slice(code.indexOf('if (status === "ENDED" || status === "SOLD" || status === "RETIRED")'));
  assert.match(writes, /\} else if \(status === "ACTIVE"\) \{\s*const patch = exactColReady\s*\? \{ \.\.\.auctionActiveExtra, last_seen_at: checkedAt, exact_verified_at: checkedAt \}/);
  assert.doesNotMatch(writes.slice(0, writes.indexOf("const plan = retirementInvalidationPlan")), /status === "UNKNOWN"/);
  // an auction UNKNOWN is "none" - no re-price patch, no stamp
  assert.equal(repricedAuctionPatch({ row: { price: 5, marketplace: "EBAY_US", market_price: 40 }, snapshot: { status: "UNKNOWN" } }).action, "none");
  // so rows keep whatever they had: never verified stays ineligible, a
  // confirmation that has aged out stays ineligible
  const now = Date.now();
  const seen = hoursAgo(1, now);
  assert.equal(isPremiumDealEligible(premiumRow({ lastSeen: seen, exact: null }), now), false);
  const aged = hoursAgo(PREMIUM_EXACT_VERIFICATION_MAX_AGE_HOURS + 2, now);
  assert.equal(isPremiumDealEligible(premiumRow({ lastSeen: aged, exact: aged }), now), false);
  // a recovery UNKNOWN only consumes the marker - no timestamps
  assert.deepEqual(Object.keys(recoveryDecision({ row: { disqualified_reason: SEEN_AGAIN.SOLD }, snapshot: { status: "UNKNOWN" } }).patch), ["disqualified_reason"]);
});
