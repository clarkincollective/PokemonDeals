// Card printing/variant identity: a permanent /cards/[slug] must resolve
// to the SAME printing regardless of price moves or DB row order, and the
// catalogue market_price for a dual-printing card must be the Unlimited
// (unlabeled) printing, not the (much higher) 1st Edition.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCatalogMatch, catalogCardSlug } from "../../lib/cardSlug.js";
import { pickCatalogMarketPrice, catalogRawMarketPrice } from "../../lib/pokemonPriceTracker.js";

// --- pickCatalogMarketPrice: dual-printing WOTC cards + bad-data guard ---

test("pickCatalogMarketPrice: prefers the Unlimited (non-1st-Edition) printing", () => {
  // real shape from the printings export for Blaine's Charizard / Gym Challenge
  const entries = [
    { printing: "1st Edition Holofoil", nm: 699.99 },
    { printing: "Unlimited Holofoil", nm: 602.1 },
  ];
  assert.equal(pickCatalogMarketPrice(entries), 602.1);
  assert.equal(pickCatalogMarketPrice([...entries].reverse()), 602.1); // CSV order irrelevant
});

test("pickCatalogMarketPrice: 1st-Edition-only card keeps its only price", () => {
  assert.equal(pickCatalogMarketPrice([{ printing: "1st Edition Holofoil", nm: 400 }]), 400);
});

test("pickCatalogMarketPrice: single-printing modern card is unchanged", () => {
  assert.equal(pickCatalogMarketPrice([{ printing: "Holofoil", nm: 12.5 }]), 12.5);
  assert.equal(pickCatalogMarketPrice([{ printing: null, price: 3.25 }]), 3.25);
});

test("pickCatalogMarketPrice: impossible ladder (played > NM) -> null, not a false price", () => {
  // Skyridge Charizard 146/144: NM $249.95 (stale/garbage) vs LP $2400
  assert.equal(
    pickCatalogMarketPrice([{ printing: "Holofoil", nm: 249.95, lp: 2400 }]),
    null
  );
  // a normal descending ladder is fine
  assert.equal(
    pickCatalogMarketPrice([{ printing: "Holofoil", nm: 250, lp: 200, mp: 150, hp: 90 }]),
    250
  );
});

test("pickCatalogMarketPrice: skips null/empty/sentinel entries", () => {
  assert.equal(pickCatalogMarketPrice([{ printing: "Unlimited", nm: null }, { printing: "Normal", nm: 8 }]), 8);
  assert.equal(pickCatalogMarketPrice([{ printing: "X", nm: 999.99 }]), null); // sentinel
  assert.equal(pickCatalogMarketPrice([]), null);
  assert.equal(pickCatalogMarketPrice(null), null);
});

// --- catalogRawMarketPrice: the card-page headline (PPT `prices` shape) ---

test("catalogRawMarketPrice: 1st-Edition primary -> defers to Unlimited via pickMarketPrice", () => {
  const prices = {
    market: 699.99,
    primaryPrinting: "1st Edition Holofoil",
    variants: {
      "1st Edition Holofoil": { "Near Mint 1st Edition Holofoil": { price: 699.99 } },
      "Unlimited Holofoil": { "Near Mint Unlimited Holofoil": { price: 602.1 } },
    },
  };
  assert.equal(catalogRawMarketPrice(prices), 602.1);
});

test("catalogRawMarketPrice: impossible ladder -> null (Skyridge Charizard)", () => {
  const prices = {
    market: null,
    primaryPrinting: "Holofoil",
    conditions: { "Near Mint": { price: 249.95 }, "Lightly Played": { price: 2400 } },
  };
  assert.equal(catalogRawMarketPrice(prices), null);
});

test("catalogRawMarketPrice: normal modern card -> its Near Mint price", () => {
  assert.equal(
    catalogRawMarketPrice({ market: 14, primaryPrinting: "Holofoil", conditions: { "Near Mint": { price: 14 }, "Lightly Played": { price: 11 } } }),
    14
  );
  // no conditions, valid market
  assert.equal(catalogRawMarketPrice({ market: 9.5, primaryPrinting: "Normal" }), 9.5);
  // nothing usable
  assert.equal(catalogRawMarketPrice({ market: null, primaryPrinting: "Normal" }), null);
  assert.equal(catalogRawMarketPrice(null), null);
});

// --- pickCatalogMatch: identity is price-independent and order-independent ---

const SET_SLUG = "unseen-forces"; // -> "ex-unseen-forces" once prefixed, but the name-slug is what matters here
function row(id, name, price, extra = {}) {
  return { tcgplayer_id: id, name, set: "EX Unseen Forces", market_price: price, image_url: `${id}.jpg`, ...extra };
}

test("pickCatalogMatch: does NOT pick by highest price", () => {
  // two rows that slugify the same ("Unown (?)" / "Unown (!)" -> "unown")
  const rows = [row("90166", "Unown (!)", 45), row("90167", "Unown (?)", 139.99)];
  const pick = pickCatalogMatch(rows, "unown");
  // stable tie-break = lowest tcgplayer_id, NOT the $139.99 row
  assert.equal(pick.tcgplayer_id, "90166");
});

test("pickCatalogMatch: identity is stable when prices change", () => {
  const before = pickCatalogMatch([row("90166", "Unown (!)", 45), row("90167", "Unown (?)", 139.99)], "unown");
  const after = pickCatalogMatch([row("90166", "Unown (!)", 999.99 - 0.01 + 5000), row("90167", "Unown (?)", 1)], "unown");
  assert.equal(before.tcgplayer_id, after.tcgplayer_id, "price move must not change which row a URL resolves to");
});

test("pickCatalogMatch: identity is stable when DB row order changes", () => {
  const a = pickCatalogMatch([row("90166", "Unown (!)", 45), row("90167", "Unown (?)", 139.99)], "unown");
  const b = pickCatalogMatch([row("90167", "Unown (?)", 139.99), row("90166", "Unown (!)", 45)], "unown");
  assert.equal(a.tcgplayer_id, b.tcgplayer_id);
});

test("pickCatalogMatch: a unique card resolves to itself; image comes from that row", () => {
  const only = row("106999", "Charizard", 359.95);
  const pick = pickCatalogMatch([only, row("42382", "Charizard", 868.56, { set: "Base Set" })], catalogCardSlug("Charizard", "Base Set (Shadowless)").replace(/-base-set-shadowless$/, ""));
  assert.equal(pick.tcgplayer_id, "106999");
  assert.equal(pick.image_url, "106999.jpg"); // image is the selected row's, not the $868 row
});

test("pickCatalogMatch: real+imaged card resolves even with NO price (URL != price)", () => {
  // price unavailable upstream -> the permanent URL must NOT 404
  const priceless = pickCatalogMatch(
    [{ tcgplayer_id: "1", name: "Unown", set: "X", market_price: null, image_url: "x" }],
    "unown"
  );
  assert.equal(priceless?.tcgplayer_id, "1");
  // still needs an image and a genuine card name
  assert.equal(pickCatalogMatch([{ tcgplayer_id: "1", name: "Unown", set: "X", market_price: 5, image_url: null }], "unown"), null);
  assert.equal(pickCatalogMatch([{ tcgplayer_id: "1", name: "Code Card - Unown Tin", set: "X", market_price: 5, image_url: "x" }], "code-card-unown-tin"), null);
});

test("pickCatalogMatch: identity slug is unchanged by price loss OR price recovery", () => {
  const withPrice = pickCatalogMatch([row("84186", "Charizard", 249.95, { set: "Skyridge" })], "charizard");
  const priceGone = pickCatalogMatch([row("84186", "Charizard", null, { set: "Skyridge" })], "charizard");
  const priceBack = pickCatalogMatch([row("84186", "Charizard", 3200, { set: "Skyridge" })], "charizard");
  assert.equal(withPrice.tcgplayer_id, "84186");
  assert.equal(priceGone.tcgplayer_id, "84186");
  assert.equal(priceBack.tcgplayer_id, "84186"); // no 200 -> 404 -> 200 churn
});
