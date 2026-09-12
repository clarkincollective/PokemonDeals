// Phase 17C.9 - the SCOPED seller-title alias, exercised through the REAL
// scanner path: lib/dealMatching.listingMatchesSealedProduct (the original
// token check the route injects) -> alias fallback -> sealedListingDecision
// -> the real write path. Not sealedListingDecision in isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  SELLER_TITLE_ALIASES,
  aliasedProductForTitle,
  sealedNameMatch,
  sealedListingDecision,
} from "../../lib/sealedProductMatch.js";
import { ingestSealedListings } from "../../lib/sealedIngest.js";

// THE REAL matcher the scanner injects (app/api/refresh-sealed-deals).
const require = createRequire(import.meta.url);
const { listingMatchesSealedProduct } = require("../../lib/dealMatching.js");

// The live catalogue rows, names EXACTLY as stored (singular "Celebration").
const ETB_30TH = { id: 123, name: "30th Celebration Elite Trainer Box", set: "ME: 30th Celebration", price: 177.39 };
const PC_30TH = { id: 122, name: "30th Celebration Pokemon Center Elite Trainer Box", set: "ME: 30th Celebration", price: 493.92 };
const ETB_2021 = { id: 76, name: "Celebrations Elite Trainer Box", set: "Celebrations", price: 361.84 };

const asProduct = (p) => ({ name: p.name, set: p.set, productType: null });
// the two matching stages exactly as ingestSealedListings runs them
function scannerAccepts(title, p) {
  const nm = sealedNameMatch({ title }, asProduct(p), listingMatchesSealedProduct);
  if (!nm.ok) return { ok: false, reason: "name_tokens", viaAlias: false };
  const d = sealedListingDecision(title, asProduct(p));
  return { ok: d.ok, reason: d.ok ? null : d.reason, viaAlias: nm.viaAlias };
}

const REAL_30TH_TITLES = [
  "Pokémon TCG 30th Anniversary Celebrations ETB  Elite Trainer Box Presale",
  "Pokémon TCG 30th Celebrations Elite Trainer Box ETB",
  "Pokémon 30th Anniversary Celebrations Elite Trainer Box ETB pre-sale Rel. 16sep",
  "Pokémon 30th Anniversary Celebrations Elite Trainer Box ETB PRESALE Ships 9/16",
];

test("A-1. the catalogue name is untouched and the alias is scoped to ONE set", () => {
  assert.equal(ETB_30TH.name, "30th Celebration Elite Trainer Box", "official singular name unchanged");
  assert.equal(SELLER_TITLE_ALIASES.length, 1, "exactly one scoped alias, not a general rule");
  assert.equal(SELLER_TITLE_ALIASES[0].set, "ME: 30th Celebration");
  // no alias exists for the 2021 set, in either direction
  assert.equal(aliasedProductForTitle("Pokemon 30th Celebrations Elite Trainer Box", asProduct(ETB_2021)), null);
});

test("A-2. the alias requires explicit 30th/2026 evidence in the title", () => {
  // no marker -> no alias offered at all
  assert.equal(aliasedProductForTitle("Pokemon Celebrations Elite Trainer Box Sealed", asProduct(ETB_30TH)), null);
  // and the row is still rejected by the real scanner path
  assert.equal(scannerAccepts("Pokemon Celebrations Elite Trainer Box Sealed", ETB_30TH).ok, false);
  // with the marker, an alias identity is produced (name/set only)
  const alias = aliasedProductForTitle("Pokemon 30th Anniversary Celebrations Elite Trainer Box", asProduct(ETB_30TH));
  assert.equal(alias.name, "30th Celebrations Elite Trainer Box");
  assert.equal(alias.set, "ME: 30th Celebrations");
  // A 2026-only title opens the alias, but the alias identity still
  // contains the literal "30th" token, so the ORIGINAL token matcher
  // refuses it one stage earlier than the identity decision would.
  const d = scannerAccepts("Pokemon 2026 Celebrations Elite Trainer Box", ETB_30TH);
  assert.equal(d.ok, false);
  assert.equal(d.reason, "name_tokens", "refused at the token stage");
  // defence in depth: even had it passed, the identity decision refuses it
  assert.equal(
    sealedListingDecision("Pokemon 2026 Celebrations Elite Trainer Box", asProduct(ETB_30TH)).reason,
    "edition_unstated:30th"
  );
});

test("A-3. real stored 30th titles now reach the 30th ETB, through the original token check", () => {
  for (const t of REAL_30TH_TITLES) {
    // the ORIGINAL matcher alone still fails - this is what the alias fixes
    assert.equal(listingMatchesSealedProduct({ title: t }, { name: ETB_30TH.name, set: ETB_30TH.set }), false, t.slice(0, 50));
    const got = scannerAccepts(t, ETB_30TH);
    assert.equal(got.ok, true, `${t.slice(0, 60)} -> ${got.reason}`);
    assert.equal(got.viaAlias, true, "accepted via the scoped alias");
  }
});

test("A-4. 2021 protection is not weakened in either direction", () => {
  for (const t of REAL_30TH_TITLES) {
    const got = scannerAccepts(t, ETB_2021);
    assert.equal(got.ok, false, `a 2026 listing must never price against the 2021 ETB: ${t.slice(0, 50)}`);
  }
  // and a genuine 2021 listing still matches its own product exactly as before
  const t21 = "Pokemon Celebrations 25th Anniversary Elite Trainer Box Factory Sealed";
  assert.equal(listingMatchesSealedProduct({ title: t21 }, { name: ETB_2021.name, set: ETB_2021.set }), true);
  const got21 = scannerAccepts(t21, ETB_2021);
  assert.equal(got21.ok, true);
  assert.equal(got21.viaAlias, false, "the 2021 product never needs, or uses, an alias");
  // a 2021 listing still cannot reach the 2026 product
  assert.equal(scannerAccepts(t21, ETB_30TH).ok, false);
});

test("A-5. Pokemon Center, product-kind and quantity distinctions all survive the alias", () => {
  // standard ETB title: the standard product only
  const plain = "Pokémon TCG 30th Anniversary Celebrations Elite Trainer Box ETB";
  assert.equal(scannerAccepts(plain, ETB_30TH).ok, true);
  assert.equal(scannerAccepts(plain, PC_30TH).ok, false, "not the Pokemon Center box");

  // Pokemon Center title: the PC product only, never the standard box.
  const pc = "Pokemon Center 30th Anniversary Celebrations Elite Trainer Box ETB";
  assert.equal(scannerAccepts(pc, PC_30TH).ok, true, "PC listing reaches the PC product via the alias");
  assert.equal(scannerAccepts(pc, ETB_30TH).reason, "kind_mismatch:pokemon_center_etb_vs_etb");

  // PRE-EXISTING, not introduced here: lib/dealMatching's token matcher does
  // not fold diacritics, so a product whose NAME contains "Pokemon" cannot
  // match a title spelling it "Pokémon". Product 122's name carries that
  // token; product 123's does not, which is why 123 matches both spellings
  // and 122 only the unaccented one. Verified pre-existing: the 2021 Pokemon
  // Center product matches NEITHER spelling, for its own separate naming
  // reason. The outcome is conservative - such a listing is withheld, never
  // priced against the wrong product - so it is recorded here rather than
  // papered over by loosening the shared matcher.
  const pcAccented = "Pokémon Center 30th Anniversary Celebrations Elite Trainer Box ETB";
  assert.equal(scannerAccepts(pcAccented, PC_30TH).reason, "name_tokens", "accented title is withheld, not mis-homed");
  assert.equal(scannerAccepts(pcAccented, ETB_30TH).ok, false, "and it never falls through to the standard box");

  // quantity: a multi-unit lot is never the single unit
  assert.equal(scannerAccepts("Pokémon 30th Celebrations Elite Trainer Box ETB x4 Lot of 4", ETB_30TH).reason, "quantity_lot");
  // kind: a case is not an ETB
  assert.equal(scannerAccepts("Pokémon 30th Celebrations Elite Trainer Box Case (Sealed Case of 4)", ETB_30TH).reason, "quantity_lot");
  // kind: a single card naming the product is not the product
  assert.equal(scannerAccepts("Pokémon 30th Celebrations Elite Trainer Box Promo #SWSH144 Holo", ETB_30TH).reason, "kind_mismatch:single_card");
});

// --- end to end, through ingestSealedListings with the REAL matcher -----
function fakeDb(seed = []) {
  const rows = seed.map((r) => ({ ...r }));
  const keyOf = (r) => `${r.source ?? "ebay"}|${r.marketplace}|${r.listing_id}`;
  return {
    rows,
    from() {
      const q = { _f: {}, _mode: null, _patch: null };
      const hit = () => rows.find((r) => Object.entries(q._f).every(([c, v]) => (c === "source" ? (r.source ?? "ebay") === v : r[c] === v)));
      q.select = () => q;
      q.eq = (c, v) => { q._f[c] = v; return q; };
      q.maybeSingle = async () => ({ data: hit() ? { ...hit() } : null, error: null });
      q.upsert = (rowIn) => { q._mode = "upsert"; q._patch = rowIn; return q; };
      q.then = (res, rej) =>
        (async () => {
          const i = rows.findIndex((r) => keyOf(r) === keyOf(q._patch));
          if (i >= 0) rows[i] = { ...rows[i], ...q._patch };
          else rows.push({ id: rows.length + 1, ...q._patch });
          return { data: null, error: null };
        })().then(res, rej);
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
  matchesName: listingMatchesSealedProduct, // THE REAL ONE, as the route injects it
  priceListing: (l, mp) => ({ totalLocal: l.price, totalUsd: l.price, discountPct: (mp - l.price) / mp }),
  buildRow: ({ productId, listing, totalPrice, marketPrice, discountPct }) => ({
    sealed_watchlist_id: productId, source: "ebay", marketplace: listing.marketplace,
    listing_id: listing.listingId, title: listing.title, total_price: totalPrice,
    market_price: marketPrice, discount_pct: discountPct, is_active: true,
  }),
});
const listing = (over = {}) => ({
  listingId: "v1|30th|0", marketplace: "EBAY_US", listingType: "FIXED_PRICE",
  title: "Pokémon TCG 30th Anniversary Celebrations Elite Trainer Box ETB PRESALE", price: 150, ...over,
});

test("A-6. end to end: the real write path now re-homes a 30th listing, and only to the right product", async () => {
  // the wrong (2021) product still refuses it
  const wrong = fakeDb();
  const rejected = await ingestSealedListings({ db: wrong, listings: [listing()], ...deps(ETB_2021) });
  assert.equal(rejected.written, 0);
  assert.equal(wrong.rows.length, 0);

  // the correct product now accepts it, via the alias, and prices it right
  const db = fakeDb();
  const res = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(res.written, 1);
  assert.equal(res.aliasMatched, 1, "the alias is what let the real matcher through");
  assert.equal(db.rows[0].sealed_watchlist_id, 123);
  assert.equal(db.rows[0].market_price, 177.39, "priced against the product it actually is");
});

test("A-7. end to end: a row stored against the 2021 product is REPAIRED onto the 30th product", async () => {
  const db = fakeDb([
    {
      id: 1, sealed_watchlist_id: 76, source: "ebay", marketplace: "EBAY_US", listing_id: "v1|30th|0",
      title: listing().title, market_price: 361.84, discount_pct: 0.59, is_active: true,
    },
  ]);
  const res = await ingestSealedListings({ db, listings: [listing()], ...deps(ETB_30TH) });
  assert.equal(res.repaired, 1, "the repair the alias unblocks");
  assert.equal(db.rows.length, 1, "same listing_id, same row");
  assert.equal(db.rows[0].sealed_watchlist_id, 123);
  assert.equal(db.rows[0].market_price, 177.39);
  assert.notEqual(db.rows[0].discount_pct, 0.59, "the old product's saving never follows it");
});
