// SEO/affiliate audit 2026-09-23, FINDING 1: graded single cards rendered
// as sealed Elite Trainer Boxes.
//
// Two confirmed cases, both verified against the listing photograph:
//   /sealed-deals/2435  a PSA 9 slab of "N's Zekrom #031" from the
//                       Ascended Heroes ETB, rendered as that ETB and
//                       priced against its $147.89 reference. Sold at $43.
//   /sealed-deals/961   a PSA 9 slab of "Shining Ho-Oh SM70", rendered as
//                       the Shining Legends ETB.
//
// The identity architecture was already right - lib/sealedProductMatch
// .sealedListingDecision runs at BOTH ingestion (lib/sealedIngest) and
// display (lib/dealQuality.isDisplayableSealedDeal), so one decision covers
// new candidates and stored rows. What was wrong was the evidence it read:
// its single-card markers required a digit IMMEDIATELY after the grader
// ("PSA 10"), which real slab titles rarely write.
//
// These exercise the REAL decision, the REAL write path and the REAL
// display gate over the exact titles involved, and - just as importantly -
// over the genuine sealed listings that must survive, including boxes that
// legitimately advertise the promo card inside them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { loadRoute } from "../helpers/r3RouteHarness.mjs";
import { sealedListingDecision, productKindOfTitle, NOT_A_SEALED_PRODUCT } from "../../lib/sealedProductMatch.js";
import { ingestSealedListings } from "../../lib/sealedIngest.js";
import {
  isDisplayableSealedDeal,
  listingPresentation,
  savingsClaimTrusted,
  sealedRowMatchesItsProduct,
  sealedProductIdentity,
} from "../../lib/dealQuality.js";

// --- the real catalogue products these titles were bound to -------------
const ASCENDED_ETB = { id: 131, name: "Ascended Heroes Elite Trainer Box", set: "ME: Ascended Heroes", product_type: "Elite Trainer Box" };
const SHINING_LEGENDS_ETB = { id: 206, name: "Shining Legends Elite Trainer Box", set: "Shining Legends", product_type: "Elite Trainer Box" };
const CHAMPIONS_PATH_ETB = { id: 999, name: "Champion's Path Elite Trainer Box", set: "Champion's Path", product_type: "Elite Trainer Box" };
const CHAOS_RISING_ETB = { id: 998, name: "Chaos Rising Elite Trainer Box", set: "ME: Chaos Rising", product_type: "Elite Trainer Box" };
const DESTINED_RIVALS_BB = { id: 997, name: "Destined Rivals Booster Box", set: "SV10: Destined Rivals", product_type: "Booster Box" };
const POKEMON_GO_ETB = { id: 996, name: "Pokemon GO Elite Trainer Box", set: "Pokemon GO", product_type: "Elite Trainer Box" };
const CELEBRATIONS_2021_ETB = { id: 76, name: "Celebrations Elite Trainer Box", set: "Celebrations", product_type: "Elite Trainer Box" };

const decide = (title, product) =>
  sealedListingDecision(title, { name: product.name, set: product.set, productType: product.product_type });

// --- titles, exactly as stored on the live rows -------------------------
const T = {
  // the two reported cases
  zekrom2435: "N's Zekrom Ascended Heroes Elite Trainer Box (031) 2026 Pokemon Mep EN-Me Black",
  hoOh961: "Pokemon Shining Legends Elite Trainer Box Promos Shining Ho Oh & Lugia PSA",
  // other graded singles found in the same cohort
  charizardCgc: "Pokemon 2020 Champion's Path Elite Trainer Box Charizard v CGC Mint 9",
  charizardCgcItalian: "Pokemon 2020 Champion's Path Elite Trainer Box Charizard v CGC come nuovo 9",
  mewtwoPsa: "2022 Pokemon Go Elite Trainer Box Mewtwo v SWSH #229 PSA Grade 4 LOW POP",
  eeveeVmax: "Full Art/Eevee Vmax Shining Fates Elite Trainer Box (087) 2021 Pokemon Swsh Blac",
  birdsSm210: "Moltres & Zapdos & Articuno GX SM210 Hidden Fates Elite Trainer Box Pokemon LP",
  // accessories
  protectorsFor: "Protectors for POKEMON TCG Crown Zenith/Pokemon GO Elite Trainer Box",
  acrylicFits: "Acrylic Case fits Pokemon Go Center ETB Elite Trainer Box plus",
  deckSleeves: "Pokemon Champion's Path Elite Trainer Box Deck Shield Sleeves",
  // empty box
  noCards: "Elite Trainer Box Chaos Rising ME04 Pokemon TCG-no Cards. All Extras! ",
  // GENUINE sealed product that must survive
  genuineEtbWithPromo: "Pokémon TCG Champion's Path Elite Trainer Box ETB Sealed Charizard Promo",
  genuineEtbWithAcrylic: "Pokemon TCG Champion's Path Elite Trainer Box SEALED ETB WITH ACRYLIC",
  genuineBoosterBox: "Pokemon TCG Destined Rivals Booster Box SV10 |BRAND NEW FACTORY SEALED",
  genuineGoEtb: "Pokemon TCG Pokémon GO Elite Trainer Box Sealed 10 Packs Mewtwo V Promo - READ",
  // an SM SET code, which must NOT be read as an SM promo number
  genuineSm6: "[Sealed] Pokemon 2018 SM Forbidden Light SM6 Booster Box Rare Korean",
  // ambiguous: "Celebrations ETB" names no edition, and two releases share
  // the words - it must stay unresolved, not be guessed either way
  ambiguousCelebrations: "Pokemon TCG Celebrations Elite Trainer Box Sealed",
};

// === 1. the two reported cases ==========================================

test("SI-1. /sealed-deals/2435 - a graded N's Zekrom promo is not an Ascended Heroes ETB", () => {
  assert.equal(productKindOfTitle(T.zekrom2435), "single_card");
  assert.deepEqual(decide(T.zekrom2435, ASCENDED_ETB), { ok: false, reason: "kind_mismatch:single_card" });
});

test("SI-2. /sealed-deals/961 - graded Shining Legends promos are not a Shining Legends ETB", () => {
  assert.equal(productKindOfTitle(T.hoOh961), "single_card");
  assert.deepEqual(decide(T.hoOh961, SHINING_LEGENDS_ETB), { ok: false, reason: "kind_mismatch:single_card" });
});

test("SI-3. the rest of the same cohort: a grade written in words, a promo code, a bracketed promo number", () => {
  // "CGC Mint 9" / "CGC come nuovo 9" - the grade is words-first, which is
  // precisely what the old `psa|cgc|bgs\s*\d` marker could not see.
  for (const t of [T.charizardCgc, T.charizardCgcItalian, T.mewtwoPsa]) {
    assert.equal(decide(t, CHAMPIONS_PATH_ETB).reason, "kind_mismatch:single_card", t);
  }
  // "(087)" - a leading-zero bracketed collector number
  assert.equal(decide(T.eeveeVmax, CHAMPIONS_PATH_ETB).reason, "kind_mismatch:single_card");
  // SM210 - a three-digit SM promo code
  assert.equal(decide(T.birdsSm210, CHAMPIONS_PATH_ETB).reason, "kind_mismatch:single_card");
});

// === 2. accessories and empty boxes =====================================

test("SI-4. an accessory sold FOR the box is not the box", () => {
  for (const t of [T.protectorsFor, T.acrylicFits, T.deckSleeves]) {
    assert.equal(decide(t, POKEMON_GO_ETB).reason, "kind_mismatch:accessory", t);
  }
});

test("SI-5. an empty box is not the sealed product", () => {
  assert.equal(decide(T.noCards, CHAOS_RISING_ETB).reason, "kind_mismatch:empty_box");
});

// === 3. what must NOT be rejected =======================================

test("SI-6. a genuine ETB that advertises its own promo card is still that ETB", () => {
  // This is the case a keyword blacklist would have broken: the box really
  // does contain a Charizard promo, and the seller really does say so.
  assert.deepEqual(decide(T.genuineEtbWithPromo, CHAMPIONS_PATH_ETB), { ok: true });
  assert.deepEqual(decide(T.genuineGoEtb, POKEMON_GO_ETB), { ok: true });
});

test("SI-7. a genuine box sold WITH a protector is not an accessory listing", () => {
  // The accessory rule needs the accessory to be the subject ("... for X",
  // "... fits X"). "ETB SEALED WITH ACRYLIC" is a box, with an extra.
  assert.deepEqual(decide(T.genuineEtbWithAcrylic, CHAMPIONS_PATH_ETB), { ok: true });
});

test("SI-8. a genuine booster box is unaffected, and an SM SET code is not a promo number", () => {
  assert.deepEqual(decide(T.genuineBoosterBox, DESTINED_RIVALS_BB), { ok: true });
  // SM6 is the Forbidden Light SET code. Only THREE digits is a promo.
  assert.equal(productKindOfTitle(T.genuineSm6), "booster_box");
});

test("SI-9. an ambiguous listing stays unresolved rather than being guessed", () => {
  // "Celebrations Elite Trainer Box" fits the 2021 25th product and the
  // 2026 30th one. Identity is refused, not assigned to the nearer price.
  assert.equal(decide(T.ambiguousCelebrations, CELEBRATIONS_2021_ETB).reason, "edition_unstated:25th");
});

// === 4. NEWLY INGESTED candidates - the real write path =================

// Minimal fake of the two query shapes lib/sealedIngest uses.
function fakeDb() {
  const upserts = [];
  return {
    upserts,
    from() {
      const q = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: null, error: null });
      q.upsert = async (row) => { upserts.push(row); return { error: null }; };
      return q;
    },
  };
}
const asListing = (title, over = {}) => ({
  listingId: `v1|${title.slice(0, 12)}|0`,
  marketplace: "EBAY_US",
  title,
  price: 43,
  shipping: 0,
  currency: "USD",
  listingType: "FIXED_PRICE",
  ...over,
});
const ingest = async (titles, product) => {
  const db = fakeDb();
  const stats = await ingestSealedListings({
    db,
    product,
    listings: titles.map((t) => asListing(t)),
    marketPrice: 147.89,
    discountThreshold: 0.1,
    floorUsd: null,
    isTrustworthy: () => true,
    // the token stage is not what this is about; let every title through it
    // so the IDENTITY decision is the only thing that can reject.
    matchesName: () => true,
    priceListing: () => ({ totalLocal: 43, totalUsd: 43, discountPct: 0.709 }),
    buildRow: ({ productId, listing }) => ({
      source: "ebay",
      marketplace: listing.marketplace,
      listing_id: listing.listingId,
      sealed_watchlist_id: productId,
      title: listing.title,
    }),
  });
  return { stats, upserts: db.upserts };
};

test("SI-10. a newly discovered graded promo is rejected at ingestion and never written", async () => {
  const { stats, upserts } = await ingest([T.zekrom2435, T.hoOh961], ASCENDED_ETB);
  assert.equal(stats.written, 0);
  assert.equal(upserts.length, 0);
  assert.equal(stats.rejected["kind_mismatch:single_card"], 2);
});

test("SI-11. accessories and empty boxes are rejected at ingestion, by their own reasons", async () => {
  const { stats, upserts } = await ingest([T.protectorsFor, T.deckSleeves, T.noCards], POKEMON_GO_ETB);
  assert.equal(upserts.length, 0);
  assert.equal(stats.rejected["kind_mismatch:accessory"], 2);
  assert.equal(stats.rejected["kind_mismatch:empty_box"], 1);
});

test("SI-12. a genuine sealed listing is still ingested and written", async () => {
  const { stats, upserts } = await ingest([T.genuineEtbWithPromo, T.genuineEtbWithAcrylic], CHAMPIONS_PATH_ETB);
  assert.equal(stats.written, 2);
  assert.equal(upserts.length, 2);
  assert.deepEqual(Object.keys(stats.rejected), []);
  assert.equal(upserts[0].sealed_watchlist_id, CHAMPIONS_PATH_ETB.id);
});

// === 5. PERSISTED rows - the display gate ===============================

// A stored sealed row shaped like the live ones, including the embedded
// sealed_watchlist every sealed read path selects (name + set only - the
// table has no product_type column, which is why rule 4 must decide on the
// title's own evidence).
const storedRow = (title, product, over = {}) => ({
  id: 1,
  is_active: true,
  title,
  source: "ebay",
  marketplace: "EBAY_US",
  listing_id: "v1|x|0",
  listing_url: "https://www.ebay.com/itm/137746114155",
  affiliate_url: "https://www.ebay.com/itm/137746114155?mkevt=1",
  listing_type: "FIXED_PRICE",
  price: 37,
  shipping: 6,
  total_price: 43,
  total_price_usd: 43,
  currency: "USD",
  market_price: 147.89,
  discount_pct: 0.709,
  first_seen_at: "2026-09-19T07:20:48.953Z",
  last_seen_at: "2026-09-23T07:20:49.057Z",
  sealed_watchlist: { id: product.id, name: product.name, set: product.set, tcgplayer_id: 668496 },
  ...over,
});

test("SI-13. the STORED rows stop being displayable - ingestion alone would only protect new ones", () => {
  assert.equal(isDisplayableSealedDeal(storedRow(T.zekrom2435, ASCENDED_ETB)), false);
  assert.equal(isDisplayableSealedDeal(storedRow(T.hoOh961, SHINING_LEGENDS_ETB)), false);
  assert.equal(isDisplayableSealedDeal(storedRow(T.charizardCgc, CHAMPIONS_PATH_ETB)), false);
  assert.equal(isDisplayableSealedDeal(storedRow(T.protectorsFor, POKEMON_GO_ETB)), false);
  assert.equal(isDisplayableSealedDeal(storedRow(T.noCards, CHAOS_RISING_ETB)), false);
});

test("SI-14. a genuine stored sealed row stays displayable and KEEPS its supported comparison", () => {
  // Evidence for the comparison this row stores, in the sealed shape
  // (identity + amount + a provider observation time). Nothing here is
  // loosened by the identity fix - the point is that it still holds.
  const row = storedRow(T.genuineEtbWithPromo, CHAMPIONS_PATH_ETB, {
    sealed_watchlist: { id: CHAMPIONS_PATH_ETB.id, name: CHAMPIONS_PATH_ETB.name, set: CHAMPIONS_PATH_ETB.set, tcgplayer_id: 210311 },
    reference_source: "sealed_catalog",
    reference_product_id: "210311",
    reference_amount: 147.89,
    reference_currency: "USD",
    reference_observed_at: "2026-09-15T00:00:00.000Z",
  });
  assert.equal(isDisplayableSealedDeal(row), true);
  assert.equal(savingsClaimTrusted(row), true);
  assert.equal(listingPresentation(row).savings, "trusted");
});

// === 6. the customer-facing page ========================================

const renderDetail = async (deal) => {
  const { route } = loadRoute("app/sealed-deals/[id]/page.js", { deal, renderComponents: true });
  const props = { params: Promise.resolve({ id: String(deal.id) }) };
  return { html: renderToStaticMarkup(await route.default(props)), meta: await route.generateMetadata(props) };
};

test("SI-15. the detail page for a rejected row never calls the card an Elite Trainer Box", async () => {
  // Removing the savings claim or adding noindex would NOT have been
  // enough: the H1, the <title> and the breadcrumb all named the product,
  // so the page still asserted that this graded card is that box.
  for (const [deal, productName] of [
    [storedRow(T.zekrom2435, ASCENDED_ETB, { id: 2435 }), "Ascended Heroes Elite Trainer Box"],
    [storedRow(T.hoOh961, SHINING_LEGENDS_ETB, { id: 961 }), "Shining Legends Elite Trainer Box"],
  ]) {
    const { html, meta } = await renderDetail(deal);
    assert.doesNotMatch(html, new RegExp(productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), productName);
    assert.doesNotMatch(JSON.stringify(meta), new RegExp(productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), productName);
    assert.match(html, /This listing is unavailable here/);
    assert.doesNotMatch(html, /% below market|You save|View listing on eBay/);
    assert.equal(meta.robots.index, false);
  }
});

test("SI-15b. a genuine sealed listing's detail page is unchanged", async () => {
  const deal = storedRow(T.genuineEtbWithPromo, CHAMPIONS_PATH_ETB, { id: 777 });
  const { html } = await renderDetail(deal);
  assert.match(html, /Champion&#x27;s Path Elite Trainer Box|Champion's Path Elite Trainer Box/);
  assert.doesNotMatch(html, /This listing is unavailable here/);
});

test("SI-16. NOT_A_SEALED_PRODUCT is the single list both the product reader and rule 4 use", () => {
  assert.deepEqual([...NOT_A_SEALED_PRODUCT], ["single_card", "accessory", "empty_box"]);
});

// === 7. the gate needs the product NAME on every read path =============

// SI-17 previously asserted the OPPOSITE of this - that a nameless product
// was accepted - as a characterisation of the fail-open hazard. Finding 1a
// closed the hazard, so the assertion is inverted here in the same commit
// as the implementation. The old behaviour is not preserved anywhere: it
// was unsafe, and these cases prove it is gone.
//
// This is the PRIMARY safety boundary. It is a runtime property of the
// validator, so it holds regardless of which file produced the row, how the
// query was spelled, what embed syntax was used, or whether the object was
// assembled in code rather than read from the database.
test("SI-17. missing product identity FAILS CLOSED, at the validator and at the display gate", () => {
  const good = storedRow(T.genuineEtbWithPromo, CHAMPIONS_PATH_ETB);
  const withProduct = (p) => ({ ...good, sealed_watchlist: p });
  const bare = { ...good };
  delete bare.sealed_watchlist;

  const rejected = [
    ["product key absent entirely", bare],
    ["product null", withProduct(null)],
    ["product undefined", withProduct(undefined)],
    ["name null", withProduct({ id: 1, name: null, set: CHAMPIONS_PATH_ETB.set })],
    ["name empty string", withProduct({ id: 1, name: "", set: CHAMPIONS_PATH_ETB.set })],
    ["name whitespace only", withProduct({ id: 1, name: "   \t\n ", set: CHAMPIONS_PATH_ETB.set })],
    ["name non-string (number)", withProduct({ id: 1, name: 12345, set: CHAMPIONS_PATH_ETB.set })],
    ["name non-string (object)", withProduct({ id: 1, name: { toString: () => "ETB" }, set: CHAMPIONS_PATH_ETB.set })],
    ["product is not an object", withProduct("Champion's Path Elite Trainer Box")],
    ["product is an array", withProduct([{ name: CHAMPIONS_PATH_ETB.name }])],
    // identity is never inferred from a neighbouring field
    ["only set and tcgplayer_id present", withProduct({ id: 1, set: CHAMPIONS_PATH_ETB.set, tcgplayer_id: 210311 })],
  ];
  for (const [label, row] of rejected) {
    assert.equal(sealedRowMatchesItsProduct(row), false, `validator accepted: ${label}`);
    assert.equal(isDisplayableSealedDeal(row), false, `display gate accepted: ${label}`);
    assert.equal(sealedProductIdentity(row.sealed_watchlist), null, `identity extracted from: ${label}`);
  }

  // A properly populated product is unaffected: still accepted when the
  // title matches, still refused when it does not.
  assert.equal(sealedRowMatchesItsProduct(good), true);
  assert.equal(isDisplayableSealedDeal(good), true);
  const mismatched = storedRow(T.zekrom2435, ASCENDED_ETB);
  assert.equal(sealedRowMatchesItsProduct(mismatched), false);
  assert.equal(isDisplayableSealedDeal(mismatched), false);
  // a name that only needs trimming is still usable identity evidence
  assert.deepEqual(sealedProductIdentity({ name: "  Champion's Path Elite Trainer Box  ", set: "  Champion's Path  " }), {
    name: "Champion's Path Elite Trainer Box",
    set: "Champion's Path",
    productType: null,
  });
});

test("SI-17b. the fail-closed boundary does not depend on where the row came from", () => {
  // Three rows for the SAME listing, built three different ways: a database
  // shape, a hand-assembled object, and one round-tripped through JSON.
  // None of them carries a product name; all three must be refused.
  const base = storedRow(T.genuineEtbWithPromo, CHAMPIONS_PATH_ETB);
  const dbShape = { ...base, sealed_watchlist: { id: 1, set: "Champion's Path", tcgplayer_id: 210311 } };
  const handBuilt = { title: base.title, is_active: true, listing_url: base.listing_url, affiliate_url: base.affiliate_url, listing_id: base.listing_id, listing_type: "FIXED_PRICE", sealed_watchlist: {} };
  const roundTripped = JSON.parse(JSON.stringify({ ...base, sealed_watchlist: { id: 1, name: undefined, set: "Champion's Path" } }));
  for (const [label, row] of [["db shape", dbShape], ["hand built", handBuilt], ["json round trip", roundTripped]]) {
    assert.equal(isDisplayableSealedDeal(row), false, label);
  }
});

test("SI-17c. a nameless product reaches the customer-facing page as 'unavailable', not as the product", async () => {
  // The same malformed fixture driven through the real detail route, so the
  // fail-closed decision is proven on the display path, not only in the
  // predicate. It must not name a product it cannot evidence.
  const malformed = { ...storedRow(T.genuineEtbWithPromo, CHAMPIONS_PATH_ETB, { id: 90001 }), sealed_watchlist: { id: 999, set: "Champion's Path", tcgplayer_id: 210311 } };
  const { html, meta } = await renderDetail(malformed);
  assert.match(html, /This listing is unavailable here/);
  assert.doesNotMatch(html, /Champion&#x27;s Path Elite Trainer Box|Champion's Path Elite Trainer Box/);
  assert.equal(meta.robots.index, false);
});

test("SI-18. projection hygiene: read paths still embed name AND set (defence in depth)", () => {
  // NOT the correctness boundary - SI-17 is. This is a static text scan and
  // it can only see the embeds it matches, in the files it is given: it
  // says nothing about other files, other query spellings, rows built in
  // code or partial objects. It is kept because a caller that drops `name`
  // now hides rows rather than showing wrong ones, which is safe but still
  // a bug worth catching early.
  for (const file of ["lib/deals.js", "app/sealed-deals/[id]/page.js", "lib/sealedVerifyLane.mjs", "lib/sitemap.js"]) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/sealed_watchlist:sealed_watchlist_id!?(?:inner)?\s*\(([^)]*)\)/g)) {
      const fields = m[1].split(",").map((s) => s.trim());
      assert.ok(fields.includes("name"), `${file}: embedded sealed_watchlist is missing \`name\` -> ${m[1]}`);
      assert.ok(fields.includes("set"), `${file}: embedded sealed_watchlist is missing \`set\` -> ${m[1]}`);
    }
  }
});
