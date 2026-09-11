// Phase 17C.9 - sealed product discrimination, on the STORED listings.
// Fixtures: tests/scanner/fixtures/sealed-30th-17c9.json (rows read from
// sealed_deals / sealed_catalog / sealed_watchlist; no provider calls).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sealedListingDecision,
  listingIsThisSealedProduct,
  editionOfTitle,
  editionOfSet,
  productKindOfTitle,
  productKindOfProduct,
} from "../../lib/sealedProductMatch.js";
import { isDisplayableSealedDeal, listingPresentation } from "../../lib/dealQuality.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = JSON.parse(readFileSync(new URL("./fixtures/sealed-30th-17c9.json", import.meta.url), "utf8"));
const product = (id) => {
  const p = F.products.find((x) => String(x.tcgplayer_id) === String(id));
  return { name: p.name, set: p.set, productType: p.product_type, market_price: p.market_price };
};
const ETB_2021 = product("242811"); // Celebrations Elite Trainer Box          $361.84
const PC_2021 = product("251199"); // Celebrations Pokemon Center ETB          $552.57
const ETB_30TH = product("704143"); // 30th Celebration Elite Trainer Box      $177.39
const PC_30TH = product("704144"); // 30th Celebration Pokemon Center ETB      $493.92
const CASE_30TH = product("709036"); // 30th Celebration ETB Case             $1643.31

const titles = F.listings.map((l) => l.title);
const is30th = (t) => /\b30th\b/i.test(t);
const isCard = (t) => /#\s?swsh\d+|\bgold star\b|\bholo\b/i.test(t);

test("S-1. no 2026 listing is ever priced against the 2021 Celebrations ETB", () => {
  const thirtieth = titles.filter(is30th);
  assert.ok(thirtieth.length >= 100, `fixture carries the real volume (${thirtieth.length})`);
  for (const t of thirtieth) {
    const d = sealedListingDecision(t, ETB_2021);
    assert.equal(d.ok, false, t.slice(0, 70));
    assert.match(d.reason, /^edition_(mismatch|absent_from_product)/, `${t.slice(0, 60)} -> ${d.reason}`);
  }
  // and the reverse direction: a 2021 listing never prices against a 2026 product
  const twentyFifth = titles.filter((t) => /\b25th\b/i.test(t));
  for (const t of twentyFifth) assert.equal(listingIsThisSealedProduct(t, ETB_30TH), false, t.slice(0, 70));
});

test("S-2. the three 30th products are told apart from each other", () => {
  const etb = "Pokemon TCG 30th Anniversary Celebrations Elite Trainer Box ETB PRESALE Ships 9/16";
  const pc = "Pokemon Center Elite Trainer Box 30th Celebrations PRESALE";
  const kase = "Pokemon 30th Celebration Elite Trainer Box Case (Sealed Case of 4)";
  assert.equal(listingIsThisSealedProduct(etb, ETB_30TH), true, "standard ETB -> 704143");
  assert.equal(listingIsThisSealedProduct(etb, PC_30TH), false, "standard ETB is not the Pokemon Center box");
  assert.equal(listingIsThisSealedProduct(etb, CASE_30TH), false, "standard ETB is not the case");
  assert.equal(listingIsThisSealedProduct(pc, PC_30TH), true, "Pokemon Center ETB -> 704144");
  assert.equal(listingIsThisSealedProduct(pc, ETB_30TH), false, "Pokemon Center box is not the standard ETB");
  assert.equal(listingIsThisSealedProduct(kase, CASE_30TH), true, "case -> 709036");
  assert.equal(listingIsThisSealedProduct(kase, ETB_30TH), false, "a case of ETBs is not one ETB");
  // kinds are read from the product too, so this is not title-only
  assert.equal(productKindOfProduct(ETB_30TH), "etb");
  assert.equal(productKindOfProduct(PC_30TH), "pokemon_center_etb");
  assert.equal(productKindOfProduct(CASE_30TH), "case");
});

test("S-3. an ambiguous title is rejected rather than guessed", () => {
  // no edition marker: could be either release - never priced against either
  for (const p of [ETB_2021, ETB_30TH]) {
    const d = sealedListingDecision("Pokemon Celebrations Elite Trainer Box Factory Sealed", p);
    assert.equal(d.ok, false);
    assert.equal(d.reason, `edition_unstated:${editionOfSet(p.set)}`);
  }
  // contradictory markers are not an edition either
  assert.equal(editionOfTitle("Celebrations 25th and 30th anniversary bundle"), null);
  // kind unreadable -> not priced
  assert.equal(sealedListingDecision("Pokemon 30th Celebration sealed lot", ETB_30TH).reason, "kind_unstated");
});

test("S-4. a single card that merely names a product is never that product", () => {
  // the stored card rows, by the matcher's own card markers
  // 13 of the stored rows are genuinely single cards. (An earlier count of
  // ~29 was inflated by the ship-date bug above, which read real ETB
  // listings - "... ETB PRESALE 9/16" - as collector numbers.)
  const cards = titles.filter((t) => productKindOfTitle(t) === "single_card");
  assert.ok(cards.length >= 10, `fixture carries the real card rows (${cards.length})`);
  for (const t of cards) {
    for (const p of [ETB_2021, ETB_30TH, PC_30TH, CASE_30TH]) {
      assert.equal(listingIsThisSealedProduct(t, p), false, t.slice(0, 70));
    }
  }
  // both promo-code spellings, with and without the "#"
  assert.equal(productKindOfTitle("Greninja - Gold Star (Celebrations Elite Trainer Box) Holo #SWSH144"), "single_card");
  assert.equal(productKindOfTitle("GRENINJA POKEMON 2021 BLACK STAR PROMOS-SWSH144 CELEBRATIONS ELITE TRAINER BOX"), "single_card");
  // a ship date is not a collector number - the real ETB stays an ETB
  assert.equal(productKindOfTitle("Pokemon 30th Anniversary Celebrations ETB PRESALE 9/16"), "etb");
  assert.equal(productKindOfTitle("Pokemon 30th Celebrations Elite Trainer Box (Release 9/16)"), "etb");
  // a SET code (two digits) is not a promo card code (three digits).
  // Build & Battle resolves to the STADIUM variant here - it is a separate
  // catalogue SKU from the plain box (see S-8).
  assert.equal(productKindOfTitle("Pokemon TCG Brilliant Stars Build & Battle Stadium Sealed Box SWSH09 1"), "build_battle_stadium");
  assert.equal(productKindOfTitle("Pokemon SHINING FATES EeveeVmax Black Star Promo Swsh087 aus Elite Trainer Box"), "single_card");
  assert.equal(productKindOfTitle("Pokemon SWSH12 Silver Tempest Booster Box"), "booster_box");
});

test("S-5. protective packaging is not a case SKU", () => {
  const t = "Pokemon 30th Celebrations Elite Trainer Box English 2026 Acrylic Case";
  assert.equal(productKindOfTitle(t), "etb", "an acrylic case around an ETB is still an ETB");
  assert.equal(listingIsThisSealedProduct(t, ETB_30TH), true);
  assert.equal(listingIsThisSealedProduct(t, CASE_30TH), false);
});

test("S-6. the whole stored set re-attributes correctly, and nothing stays on the 2021 ETB by accident", () => {
  const acceptedBy = { "242811": 0, "704143": 0, "704144": 0, "709036": 0, unmatched: 0 };
  for (const t of titles) {
    const hit = [["242811", ETB_2021], ["704143", ETB_30TH], ["704144", PC_30TH], ["709036", CASE_30TH]]
      .filter(([, p]) => listingIsThisSealedProduct(t, p));
    assert.ok(hit.length <= 1, `a title never matches two products: ${t.slice(0, 60)} -> ${hit.map((h) => h[0])}`);
    if (hit.length === 1) acceptedBy[hit[0][0]] += 1;
    else acceptedBy.unmatched += 1;
  }
  assert.ok(acceptedBy["704143"] >= 100, `30th ETBs re-attributed: ${acceptedBy["704143"]}`);
  // the 2021 ETB keeps ONLY listings that actually say 25th - every one of
  // them is a genuine 2021 ETB, and nothing 2026 or ambiguous remains
  const keptOn2021 = titles.filter((t) => listingIsThisSealedProduct(t, ETB_2021));
  assert.equal(keptOn2021.length, acceptedBy["242811"]);
  for (const t of keptOn2021) {
    assert.equal(editionOfTitle(t), "25th", t.slice(0, 70));
    assert.equal(productKindOfTitle(t), "etb", t.slice(0, 70));
  }
  console.log("      re-attribution:", JSON.stringify(acceptedBy));
});

test("S-7. an early sealed listing needs eBay's own confirmation before it is shown", () => {
  const early = {
    id: 1,
    title: "Pokemon TCG 30th Anniversary Celebrations Elite Trainer Box ETB PRESALE Ships 9/16",
    sealed_watchlist: { set: "ME: 30th Celebration" },
    listing_id: "v1|123|0",
    listing_url: "https://www.ebay.com/itm/123",
    affiliate_url: "https://www.ebay.com/itm/123?mkevt=1",
    listing_type: "FIXED_PRICE",
    is_active: true,
    first_seen_at: "2026-09-05T00:00:00Z", // before the 16 Sep release
    last_seen_at: "2026-09-12T11:00:00Z",
    exact_verified_at: null,
  };
  const at = (iso, fn) => {
    mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
    try { return fn(); } finally { mock.timers.reset(); }
  };
  at("2026-09-12T12:00:00Z", () => {
    assert.equal(isDisplayableSealedDeal(early), false, "no confirmation -> not shown");
    const confirmed = { ...early, exact_verified_at: early.last_seen_at };
    assert.equal(isDisplayableSealedDeal(confirmed), true, "confirmed -> shown");
    const p = listingPresentation(confirmed);
    assert.equal(p.savings, null, "…and shown plainly, with no savings claim");
    assert.ok(p.notes.some((n) => /Preorder — seller states it ships 9\/16/.test(n)), p.notes.join(" | "));
  });
  // the column the confirmation lives in has to exist
  const sql = readFileSync(join(ROOT, "supabase/sealed_availability_migration.sql"), "utf8");
  assert.match(sql, /alter table sealed_deals add column if not exists exact_verified_at timestamptz;/);
  assert.match(sql, /create index if not exists sealed_deals_exact_verified_at/);
});

// --- S-8 -------------------------------------------------------------
// PINNED expectations. Every representative listing resolves either to
// exactly ONE catalogue product id, or to an explicit rejection reason.
// Ids are the real tcgplayer_ids in the fixture, so a future matcher
// change that silently re-homes a listing fails here rather than in
// production pricing.
const CANDIDATES = F.products.map((p) => ({
  id: String(p.tcgplayer_id),
  name: p.name,
  set: p.set,
  productType: p.product_type,
}));
const byId = (id) => CANDIDATES.find((p) => p.id === id);
const acceptedIds = (title, pool = CANDIDATES) =>
  pool.filter((p) => listingIsThisSealedProduct(title, p)).map((p) => p.id).sort();

test("S-8. representative listings are pinned to one product id, or to a stated reason", () => {
  const PINNED = [
    // --- accepted: exactly one product each -------------------------
    { t: "Pokemon TCG 30th Anniversary Celebrations Elite Trainer Box ETB PRESALE Ships 9/16", ids: ["704143"] },
    { t: "Pokemon Center Elite Trainer Box 30th Celebrations PRESALE", ids: ["704144"] },
    { t: "Pokemon 30th Celebration Elite Trainer Box Case (Sealed Case of 4)", ids: ["709036"] },
    { t: "Pokémon TCG: 25th Anniversary Celebrations Elite Trainer Box (2021)", ids: ["242811"] },
    // a factory CASE is a multi-unit SKU: its own count is not a lot
    { t: "Pokemon Center 25th Celebrations Elite Trainer Box (Sealed Case of 4 ETBs)", ids: ["261802"] },
    // protective packaging is not the case SKU - still the plain 30th ETB
    { t: "Pokémon 30th Celebrations Elite Trainer Box English 2026 Acrylic Case", ids: ["704143"] },

    // --- rejected: stated reason, against its nearest product --------
    // a seller's 13-box lot must never price against ONE ETB
    { t: "Pokemon Celebrations 25th Elite Trainer Box ETB Black Card Sleeves New (13) LOT", ids: [], against: "242811", reason: "quantity_lot" },
    { t: "Pokemon Celebrations Elite Trainer Box Factory Sealed", ids: [], against: "242811", reason: "edition_unstated:25th" },
    // Edition is checked BEFORE kind, so this card - which names no
    // anniversary - is rejected as unstated rather than as a card. Both
    // rejections are correct; pinning the real one documents the order.
    { t: "Greninja - Gold Star (Celebrations Elite Trainer Box) Holo #SWSH144", ids: [], against: "242811", reason: "edition_unstated:25th" },
    // a card that DOES state its edition reaches the kind check
    { t: "Pokemon 30th Anniversary Celebrations Elite Trainer Box Promo #SWSH144 Holo", ids: [], against: "704143", reason: "kind_mismatch:single_card" },
    { t: "Pokemon TCG 30th Anniversary Celebrations Elite Trainer Box ETB", ids: ["704143"], against: "242811", reason: "edition_mismatch:30th_vs_25th" },
  ];

  for (const row of PINNED) {
    assert.deepEqual(acceptedIds(row.t), [...row.ids].sort(), `accepted ids for: ${row.t.slice(0, 64)}`);
    if (row.reason) {
      assert.equal(
        sealedListingDecision(row.t, byId(row.against)).reason,
        row.reason,
        `rejection reason vs ${row.against} for: ${row.t.slice(0, 60)}`
      );
    }
  }
});

test("S-9. Build & Battle box, stadium and display are three different SKUs", () => {
  // Real catalogue rows (sealed_catalog) - three separate products at very
  // different prices, all satisfying each other's name tokens.
  const BB = [
    { id: "672400", name: "Perfect Order Build & Battle Box", set: "Perfect Order", productType: "Build & Battle Box" }, //      $37.62
    { id: "690172", name: "Perfect Order Build & Battle Box Display", set: "Perfect Order", productType: "Build & Battle Box Display" }, // $315.37
    { id: "514070", name: "Paradox Rift Build & Battle Stadium", set: "Paradox Rift", productType: "Build & Battle Stadium" }, //  $94.51
  ];
  const bbId = (id) => BB.find((p) => p.id === id);

  assert.equal(productKindOfProduct(bbId("672400")), "build_battle_box");
  assert.equal(productKindOfProduct(bbId("690172")), "build_battle_display");
  assert.equal(productKindOfProduct(bbId("514070")), "build_battle_stadium");

  // each listing lands on its own SKU and on no other
  assert.deepEqual(acceptedIds("Pokemon Perfect Order Build & Battle Box Sealed", BB), ["672400"]);
  assert.deepEqual(acceptedIds("Pokemon Perfect Order Build & Battle Box Display Sealed", BB), ["690172"]);
  assert.deepEqual(acceptedIds("Pokemon Paradox Rift Build & Battle Stadium Factory Sealed", BB), ["514070"]);
  assert.deepEqual(acceptedIds("Pokemon Paradox Rift Build and Battle Stadium", BB), ["514070"]);

  // and the mismatches are stated, not silent
  assert.equal(
    sealedListingDecision("Pokemon Paradox Rift Build & Battle Stadium Factory Sealed", bbId("672400")).reason,
    "kind_mismatch:build_battle_stadium_vs_build_battle_box"
  );
  assert.equal(
    sealedListingDecision("Pokemon Perfect Order Build & Battle Box Display Sealed", bbId("672400")).reason,
    "kind_mismatch:build_battle_display_vs_build_battle_box"
  );
  // a 4-box lot is not the single Build & Battle box
  assert.equal(sealedListingDecision("Pokemon * Paradox Rift * SV04 Build and Battle Box (x4)", bbId("672400")).reason, "quantity_lot");
});
