// Phase 17C.9 - the REAL sealed write path: repair, ordering, overlap and
// the rule that an ambiguous match never overwrites a valid assignment.
// A fake db implements the same conflict semantics as PostgREST upsert on
// sealed_deals' unique (source, marketplace, listing_id): the conflicting
// row is REPLACED, so the LAST writer wins - the unique key alone proves
// nothing, which is why this exercises the path rather than asserting it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ingestSealedListings, reassignmentReset, COMPARISON_PROVENANCE_COLUMNS } from "../../lib/sealedIngest.js";

// --- the products in play (real catalogue rows) ----------------------
const ETB_2021 = { id: 76, name: "Celebrations Elite Trainer Box", set: "Celebrations", product_type: "Elite Trainer Box", price: 361.84 };
const ETB_30TH = { id: 123, name: "30th Celebration Elite Trainer Box", set: "ME: 30th Celebration", product_type: "Elite Trainer Box", price: 177.39 };
const PC_30TH = { id: 122, name: "30th Celebration Pokemon Center Elite Trainer Box", set: "ME: 30th Celebration", product_type: "Elite Trainer Box", price: 493.92 };

const listing = (over = {}) => ({
  listingId: "v1|30thETB|0",
  marketplace: "EBAY_US",
  title: "Pokemon TCG 30th Anniversary Celebrations Elite Trainer Box ETB PRESALE Ships 9/16",
  price: 150,
  shipping: 0,
  currency: "USD",
  listingType: "FIXED_PRICE",
  ...over,
});

// --- a fake sealed_deals table with the real unique-key behaviour ----
function fakeDb(seed = []) {
  const rows = seed.map((r) => ({ ...r }));
  const keyOf = (r) => `${r.source ?? "ebay"}|${r.marketplace}|${r.listing_id}`;
  return {
    rows,
    upserts: [],
    from() {
      const q = { _filters: {} };
      q.select = () => q;
      q.eq = (col, val) => {
        q._filters[col] = val;
        return q;
      };
      q.maybeSingle = async () => {
        const hit = rows.find(
          (r) => (r.source ?? "ebay") === (q._filters.source ?? "ebay") && r.marketplace === q._filters.marketplace && r.listing_id === q._filters.listing_id
        );
        return { data: hit ? { ...hit } : null, error: null };
      };
      q.upsert = async (row) => {
        this_upsert: {
          const i = rows.findIndex((r) => keyOf(r) === keyOf(row));
          if (i >= 0) rows[i] = { ...rows[i], ...row }; // conflict -> replace provided columns
          else rows.push({ id: rows.length + 1, ...row });
        }
        return { error: null };
      };
      return q;
    },
  };
}

const deps = (product) => ({
  product,
  marketPrice: product.price,
  discountThreshold: 0.1,
  floorUsd: product.price * 0.25,
  isTrustworthy: () => true,
  matchesName: () => true, // the name-token matcher is exercised elsewhere
  priceListing: (l, mp) => {
    const total = l.price + l.shipping;
    return { totalLocal: total, totalUsd: total, discountPct: (mp - total) / mp };
  },
  buildRow: ({ productId, listing: l, totalPrice, totalPriceUsd, marketPrice, discountPct }) => ({
    sealed_watchlist_id: productId,
    source: "ebay",
    marketplace: l.marketplace,
    listing_id: l.listingId,
    title: l.title,
    total_price: totalPrice,
    total_price_usd: totalPriceUsd,
    market_price: marketPrice,
    discount_pct: discountPct,
    is_active: true,
    last_seen_at: "2026-09-12T12:00:00Z",
  }),
});

const row = (db) => db.rows[0];

test("W-1. wrong product first: the correct product's next scan REPAIRS the row", async () => {
  const db = fakeDb();
  // the 2021 ETB scans first and (pre-17C.9) would have claimed it; the
  // identity decision now rejects it outright
  const first = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_2021) });
  assert.equal(first.written, 0, "a 30th listing is never written against the 2021 product");
  assert.equal(db.rows.length, 0);
  assert.ok(first.rejected["edition_mismatch:30th_vs_25th"], JSON.stringify(first.rejected));

  // now the correct product scans
  const second = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(second.written, 1);
  assert.equal(row(db).sealed_watchlist_id, 123);
  assert.equal(row(db).market_price, 177.39, "priced against the product it actually is");
});

test("W-2. a row ALREADY bound to the wrong product is repaired in place, on the same listing_id", async () => {
  // the stored state today: a 30th listing sitting on the 2021 ETB with
  // that product's $361.84 comparison and a 59% 'discount'
  const db = fakeDb([
    {
      id: 1,
      sealed_watchlist_id: 76,
      source: "ebay",
      marketplace: "EBAY_US",
      listing_id: "v1|30thETB|0",
      title: listing().title,
      market_price: 361.84,
      discount_pct: 0.59,
      total_price: 150,
      reference_condition: "Near Mint",
      reference_printing: "Sealed",
      reference_captured_at: "2026-08-01T00:00:00Z",
      disqualified_reason: "identity:wrong_product",
      is_active: true,
    },
  ]);
  const res = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(res.written, 1);
  assert.equal(res.repaired, 1, "the move is counted as a repair");
  assert.equal(db.rows.length, 1, "same listing_id, same row - not a duplicate");
  const r = row(db);
  assert.equal(r.sealed_watchlist_id, 123, "now the 30th ETB");
  // item 3: the old product's comparison must not survive
  assert.equal(r.market_price, 177.39);
  assert.ok(Math.abs(r.discount_pct - (177.39 - 150) / 177.39) < 1e-9, "discount recomputed against the new product");
  assert.equal(r.disqualified_reason, null, "the old assignment's disqualification is cleared");
  for (const c of COMPARISON_PROVENANCE_COLUMNS) assert.equal(r[c], null, `${c} cleared on reassignment`);
});

test("W-3. correct product first: a later wrong-product scan cannot take the row", async () => {
  const db = fakeDb();
  await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(row(db).sealed_watchlist_id, 123);

  const intruder = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_2021) });
  assert.equal(intruder.written, 0);
  assert.equal(row(db).sealed_watchlist_id, 123, "valid assignment untouched");
  assert.equal(row(db).market_price, 177.39, "and its comparison untouched");
});

test("W-4. overlapping writes: whichever order the two products scan in, the row ends on the right one", async () => {
  for (const order of [[ETB_2021, ETB_30TH], [ETB_30TH, ETB_2021]]) {
    const db = fakeDb();
    for (const p of order) await ingestSealedListings({ db, listings: [listing()], ...deps(p) });
    assert.equal(db.rows.length, 1, `one row for order ${order.map((p) => p.id)}`);
    assert.equal(row(db).sealed_watchlist_id, 123, `correct product wins for order ${order.map((p) => p.id)}`);
    assert.equal(row(db).market_price, 177.39);
  }
});

test("W-5. an AMBIGUOUS listing never overwrites a valid assignment, in either direction", async () => {
  // no edition marker: could be the 2021 or the 2026 box
  const ambiguous = listing({ title: "Pokemon Celebrations Elite Trainer Box Factory Sealed", listingId: "v1|ambig|0" });

  // (a) against an empty table it is simply not written
  const empty = fakeDb();
  for (const p of [ETB_2021, ETB_30TH]) {
    const res = await ingestSealedListings({ db: empty, listings: [ambiguous], ...deps(p) });
    assert.equal(res.written, 0);
    assert.ok(res.rejected["edition_unstated:25th"] || res.rejected["edition_unstated:30th"], JSON.stringify(res.rejected));
  }
  assert.equal(empty.rows.length, 0, "an ambiguous title creates nothing");

  // (b) against a row already validly assigned, it changes nothing
  const db = fakeDb([
    { id: 1, sealed_watchlist_id: 123, source: "ebay", marketplace: "EBAY_US", listing_id: "v1|ambig|0", title: ambiguous.title, market_price: 177.39, discount_pct: 0.2, is_active: true },
  ]);
  const before = JSON.stringify(db.rows);
  for (const p of [ETB_2021, ETB_30TH, PC_30TH]) {
    await ingestSealedListings({ db, listings: [ambiguous], ...deps(p) });
  }
  assert.equal(JSON.stringify(db.rows), before, "valid assignment is untouched by ambiguous scans");
});

test("W-6. a variant listing goes to its own product, not the sibling it shares words with", async () => {
  const pcListing = listing({ title: "Pokemon Center Elite Trainer Box 30th Celebrations PRESALE", listingId: "v1|pc|0" });
  const db = fakeDb();
  const wrong = await ingestSealedListings({ db, listings: [pcListing], ...deps(ETB_30TH) });
  assert.equal(wrong.written, 0, "the Pokemon Center box is not the standard ETB");
  const right = await ingestSealedListings({ db, listings: [pcListing], ...deps(PC_30TH) });
  assert.equal(right.written, 1);
  assert.equal(row(db).sealed_watchlist_id, 122);
  assert.equal(row(db).market_price, 493.92);
});

test("W-7. reassignmentReset is inert when the product is unchanged or the row is new", () => {
  assert.deepEqual(reassignmentReset(null, 123), {});
  assert.deepEqual(reassignmentReset({ sealed_watchlist_id: 123 }, 123), {});
  const moved = reassignmentReset({ sealed_watchlist_id: 76 }, 123);
  assert.equal(moved.disqualified_reason, null);
  for (const c of COMPARISON_PROVENANCE_COLUMNS) assert.ok(c in moved, c);
});
