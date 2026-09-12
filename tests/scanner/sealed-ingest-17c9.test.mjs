// Phase 17C.9 - the REAL sealed write path: repair, ordering, overlap and
// the rule that an ambiguous match never overwrites a valid assignment.
// A fake db implements the same conflict semantics as PostgREST upsert on
// sealed_deals' unique (source, marketplace, listing_id): the conflicting
// row is REPLACED, so the LAST writer wins - the unique key alone proves
// nothing, which is why this exercises the path rather than asserting it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ingestSealedListings, reassignmentReset, RECOMPUTED_ON_REASSIGNMENT } from "../../lib/sealedIngest.js";

// The REAL sealed_deals columns, read from the live schema (read-only,
// 2026-09-12). The write path must never send a column outside this set:
// PostgREST rejects the whole upsert with 42703, so one phantom column
// silently kills every sealed write. `disqualified_reason` and
// `exact_verified_at` are deliberately absent - they arrive with
// supabase/sealed_availability_migration.sql, which is not applied.
const COLUMNS_TODAY = new Set([
  "affiliate_url", "auction_end_at", "bid_count", "currency", "discount_pct",
  "first_seen_at", "id", "image_url", "is_active", "is_local",
  "item_location_country", "last_seen_at", "listing_id", "listing_type",
  "listing_url", "market_price", "marketplace", "price", "sealed_watchlist_id",
  "seller_feedback_pct", "seller_username", "shipping", "source", "title",
  "total_price", "total_price_usd",
]);

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
function fakeDb(seed = [], { extraColumns = [] } = {}) {
  const rows = seed.map((r) => ({ ...r }));
  const upserts = [];
  const keyOf = (r) => `${r.source ?? "ebay"}|${r.marketplace}|${r.listing_id}`;
  const SEALED_DEALS_COLUMNS = new Set([...COLUMNS_TODAY, ...extraColumns]);
  return {
    rows,
    upserts,
    from() {
      // A thenable query builder covering the two shapes the ingest path
      // uses: the existence read (.select().eq()...maybeSingle()) and the
      // guarded sighting (.update().match().or().select() /
      // .upsert(..., { ignoreDuplicates }).select()). The `.or()` guard
      // reproduces the real SQL predicate - a row carrying an
      // `availability:` reason is NOT matched by the UPDATE.
      const q = { _f: {}, _mode: null, _patch: null, _guard: false, _ignoreDup: false };
      const matchesFilters = (r) =>
        Object.entries(q._f).every(([c, v]) => (c === "source" ? (r.source ?? "ebay") === v : r[c] === v));
      const retired = (r) => typeof r.disqualified_reason === "string" && r.disqualified_reason.startsWith("availability:");

      q.select = () => q;
      q.eq = (col, val) => { q._f[col] = val; return q; };
      q.match = (obj) => { Object.assign(q._f, obj); return q; };
      q.or = () => { q._guard = true; return q; };
      q.update = (patch) => { q._mode = "update"; q._patch = patch; return q; };
      q.upsert = (row, opts = {}) => {
        q._mode = "upsert";
        q._patch = row;
        q._ignoreDup = Boolean(opts.ignoreDuplicates);
        upserts.push({ ...row });
        return q;
      };
      q.maybeSingle = async () => {
        const hit = rows.find(matchesFilters);
        return { data: hit ? { ...hit } : null, error: null };
      };

      const run = async () => {
        // PostgREST rejects the WHOLE statement if any column is unknown.
        for (const col of Object.keys(q._patch ?? {})) {
          if (!SEALED_DEALS_COLUMNS.has(col)) {
            return { data: null, error: { code: "42703", message: `column sealed_deals.${col} does not exist` } };
          }
        }
        if (q._mode === "update") {
          const i = rows.findIndex((r) => matchesFilters(r) && !(q._guard && retired(r)));
          if (i < 0) return { data: [], error: null };
          rows[i] = { ...rows[i], ...q._patch };
          return { data: [{ id: rows[i].id }], error: null };
        }
        if (q._mode === "upsert") {
          const i = rows.findIndex((r) => keyOf(r) === keyOf(q._patch));
          if (i >= 0) {
            if (q._ignoreDup) return { data: [], error: null }; // ON CONFLICT DO NOTHING
            rows[i] = { ...rows[i], ...q._patch };
            return { data: [{ id: rows[i].id }], error: null };
          }
          const inserted = { id: rows.length + 1, ...q._patch };
          rows.push(inserted);
          return { data: [{ id: inserted.id }], error: null };
        }
        return { data: [], error: null };
      };
      q.then = (resolve, reject) => run().then(resolve, reject);
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
      is_active: true,
    },
  ]);
  const res = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(res.written, 1);
  assert.equal(res.repaired, 1, "the move is counted as a repair");
  assert.equal(db.rows.length, 1, "same listing_id, same row - not a duplicate");
  const r = row(db);
  assert.equal(r.sealed_watchlist_id, 123, "now the 30th ETB");
  // item 3: the old product's comparison must not survive. On the real
  // schema the comparison IS market_price + discount_pct - both rewritten
  // from the new product's reference price.
  // 17C.10 - the comparison is market_price + discount_pct PLUS the
  // reference columns that describe where that figure came from; all of
  // them are recomputed or cleared when a row moves product.
  assert.equal(RECOMPUTED_ON_REASSIGNMENT[0], "market_price");
  assert.equal(RECOMPUTED_ON_REASSIGNMENT[1], "discount_pct");
  assert.ok(RECOMPUTED_ON_REASSIGNMENT.includes("reference_product_id"));
  assert.ok(RECOMPUTED_ON_REASSIGNMENT.includes("reference_amount"));
  assert.equal(r.market_price, 177.39, "the 2021 product's $361.84 reference is gone");
  assert.ok(Math.abs(r.discount_pct - (177.39 - 150) / 177.39) < 1e-9, "discount recomputed against the new product");
  assert.notEqual(r.discount_pct, 0.59, "the old 59% saving never follows the listing");
});

test("W-2b. an IDENTITY disqualification clears on reassignment; an AVAILABILITY retirement is never touched", async () => {
  const seed = (reason) => [
    {
      id: 1, sealed_watchlist_id: 76, source: "ebay", marketplace: "EBAY_US",
      listing_id: "v1|30thETB|0", title: listing().title, market_price: 361.84,
      discount_pct: 0.59, total_price: 150, disqualified_reason: reason, is_active: true,
    },
  ];
  // pre-migration (today): the column does not exist, so it is never written
  const before = fakeDb(seed("identity:wrong_product"));
  await ingestSealedListings({ db: before, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(before.upserts.at(-1) && "disqualified_reason" in before.upserts.at(-1), false,
    "a column sealed_deals does not have yet is never sent (42703 would fail the whole upsert)");

  // post-migration, IDENTITY reason: belonged to the old assignment -> cleared
  const identity = fakeDb(seed("identity:wrong_product"), { extraColumns: ["disqualified_reason"] });
  await ingestSealedListings({ db: identity, listings: [listing()], ...deps(ETB_30TH), supportsDisqualifiedReason: true });
  assert.equal(row(identity).sealed_watchlist_id, 123, "row re-homed");
  assert.equal(row(identity).disqualified_reason, null, "the old assignment's disqualification is cleared");

  // post-migration, AVAILABILITY retirement: the guarded write refuses the
  // row entirely. A re-attribution is NOT evidence the listing is back, so
  // it must not resurrect a sold listing - only the marker is recorded.
  const sold = fakeDb(seed("availability:sold"), { extraColumns: ["disqualified_reason"] });
  const res = await ingestSealedListings({ db: sold, listings: [listing()], ...deps(ETB_30TH), supportsDisqualifiedReason: true });
  assert.equal(res.written, 0, "a retired row is not written");
  assert.equal(res.rejected.availability_retired, 1);
  assert.equal(row(sold).sealed_watchlist_id, 76, "not re-homed while retired");
  assert.equal(row(sold).market_price, 361.84, "and no comparison rewritten");
  assert.equal(row(sold).disqualified_reason, "availability:sold:seen_again", "only the seen-again marker");
});

test("W-2c. every written column actually exists on sealed_deals", async () => {
  // The guard that would have caught the five reference_* columns this
  // patch originally invented: they exist on neither table.
  const db = fakeDb();
  await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  const repair = fakeDb([{ id: 1, sealed_watchlist_id: 76, source: "ebay", marketplace: "EBAY_US", listing_id: "v1|30thETB|0", title: listing().title, market_price: 361.84, is_active: true }]);
  await ingestSealedListings({ db: repair, listings: [listing()], ...deps(ETB_30TH) });

  for (const written of [...db.upserts, ...repair.upserts]) {
    for (const col of Object.keys(written)) {
      assert.ok(COLUMNS_TODAY.has(col), `write sends a column sealed_deals does not have: ${col}`);
    }
  }
  assert.ok(db.upserts.length > 0 && repair.upserts.length > 0, "both an insert and a repair were exercised");
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
  const opts = { supportsDisqualifiedReason: true };
  assert.deepEqual(reassignmentReset(null, 123, opts), {});
  assert.deepEqual(reassignmentReset({ sealed_watchlist_id: 123 }, 123, opts), {});
  // a genuine move, post-migration
  assert.deepEqual(reassignmentReset({ sealed_watchlist_id: 76 }, 123, opts), { disqualified_reason: null });
  // ...and pre-migration it adds nothing at all
  assert.deepEqual(reassignmentReset({ sealed_watchlist_id: 76 }, 123), {});
});
