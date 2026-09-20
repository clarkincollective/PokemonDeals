// SEO-2.6.1 - Merchant Listing structured-data correction.
//
// The external audit found deal pages with a recorded shipping charge
// emitting OfferShippingDetails (shippingRate + shippingDestination) with
// no deliveryTime, which Google's Merchant Listing enhancement reports as
// "A value for the shippingDetails.deliveryTime field is required". We hold
// no handling/transit/estimated-delivery data, are neither the seller nor
// the fulfiller, and must not invent a window - so the block is withheld.
//
// These tests render the REAL routes through the fixture harness (no
// network, no database) and pin: the charge stays visible, the schema no
// longer carries the incomplete block, and nothing else about the
// Product/Offer, the card-page schema, or who the seller is has moved.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { loadRoute, elements } from "../helpers/r3RouteHarness.mjs";
import { DEAL_STATE_FIXTURES } from "../../lib/dev/dealStateFixtures.js";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => { throw Error("NETWORK_FORBIDDEN"); }; });
afterEach(() => { globalThis.fetch = originalFetch; });

// The dev fixtures carry no is_active flag; a live, displayable deal is the
// case under test (a gone deal 308s/404s before any schema is emitted).
const fixture = (id) => ({ ...DEAL_STATE_FIXTURES.find((f) => f.id === id).deal, is_active: true });
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

async function renderDeal(deal) {
  const { route } = loadRoute("app/deals/[id]/page.js", { deal, renderComponents: true, currency: { viewer: "USD", rates: { USD: 1, GBP: 0.8 } } });
  const props = { params: Promise.resolve({ id: String(deal.id) }) };
  const tree = await route.default(props);
  const html = renderToStaticMarkup(tree);
  const schema = elements(tree)
    .filter((e) => e.type === "script" && e.props.type === "application/ld+json")
    .map((e) => JSON.parse(e.props.dangerouslySetInnerHTML.__html));
  return { html, schema, product: schema.find((s) => s["@type"] === "Product") };
}

function assertOfferIntegrity(product, deal, expectedPrice) {
  assert.ok(product, "a priced, active deal still emits a Product");
  const offer = product.offers;
  assert.equal(offer["@type"], "Offer");
  // brief 2026-09-20: the Offer URL is the deal page's own canonical URL - never eBay
  assert.equal(offer.url, `https://pokemondealfinder.com/deals/${deal.id}`, "the Offer URL is the page itself");
  assert.doesNotMatch(JSON.stringify(product), /ebay\.com/);
  assert.equal(offer.price, expectedPrice);
  assert.equal(offer.priceCurrency, "USD");
  assert.equal(offer.availability, "https://schema.org/InStock");
  assert.equal(offer.itemCondition, "https://schema.org/UsedCondition");
  assert.equal(product.brand.name, "Pokemon");
  // never an incomplete Merchant Listing block, and never one we cannot back
  assert.equal(Object.hasOwn(offer, "shippingDetails"), false);
  assert.equal(JSON.stringify(product).includes("deliveryTime"), false);
  assert.equal(JSON.stringify(product).includes("OfferShippingDetails"), false);
  // PokemonDealFinder is not the seller and never says so
  assert.equal(Object.hasOwn(offer, "seller"), false);
  assert.equal(Object.hasOwn(offer, "offeredBy"), false);
  assert.equal(Object.hasOwn(offer, "hasMerchantReturnPolicy"), false);
  // 2026-09-19 (GEO audit): the Product now carries an entity @id and an
  // isRelatedTo link to the card entity, both site URLs. Those identify
  // the ENTITY, not a merchant - the merchant guard is on the offer and on
  // the naming/brand/seller fields, never on identifiers.
  // brief 2026-09-20: the Offer's url is this page's own canonical URL (an
  // identifier of the page, not a merchant claim) - excluded the same way.
  const { "@id": _id, isRelatedTo: _rel, offers: { url: _offerUrl, ...offerRest }, ...productRest } = product;
  const merchantFacing = { ...productRest, offers: offerRest };
  assert.doesNotMatch(JSON.stringify(merchantFacing), /Pokemon Deal Finder|pokemondealfinder/i, "the Product never names us as merchant");
  if (product["@id"]) assert.match(product["@id"], /^https:\/\/pokemondealfinder\.com\/deals\/\d+#product$/);
}

test("1. paid shipping: the charge stays visible, the schema drops the incomplete shippingDetails", async () => {
  const deal = fixture("bin_compared"); // shipping 4.25, total 30.75
  assert.equal(Number(deal.shipping) > 0, true);
  const { html, product } = await renderDeal(deal);
  assertOfferIntegrity(product, deal, Number(deal.price).toFixed(2));
  // the visible page still presents the charge as a delivered total
  assert.match(html, /Listing total/);
  assert.match(html, /Includes recorded shipping/);
  assert.doesNotMatch(html, /Shipping not confirmed/);
});

test("2. free/unstated shipping remains correct", async () => {
  const deal = fixture("bin_shipping_unconfirmed"); // shipping 0
  const { html, product } = await renderDeal(deal);
  assertOfferIntegrity(product, deal, Number(deal.price).toFixed(2));
  assert.match(html, /Shipping not confirmed/);
});

test("3. auction: no Product node (brief 2026-09-20 - a bid is not a stable offer price); the bid stays visible", async () => {
  const deal = fixture("auction"); // shipping 8, current bid in price
  const { html, product } = await renderDeal(deal);
  assert.equal(product, undefined);
  assert.match(html, /Current bid/);
});

test("4. graded deal remains correct", async () => {
  const deal = fixture("graded"); // PSA 9
  const { html, product } = await renderDeal(deal);
  assertOfferIntegrity(product, deal, Number(deal.price).toFixed(2));
  assert.match(html, /PSA/);
  assert.match(html, /\b9\b/);
});

test("5. a paid-shipping auction gets the same treatment (the 38759 shape): no Product", async () => {
  const deal = { ...fixture("auction"), shipping: 31.13 };
  const { product } = await renderDeal(deal);
  assert.equal(product, undefined);
});

test("6. the correction is in both deal-page generators, and nowhere else", () => {
  for (const f of ["app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js"]) {
    const code = read(f).replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /shippingDetails/, `${f} must not emit shippingDetails`);
    assert.doesNotMatch(code, /OfferShippingDetails/, f);
    assert.doesNotMatch(code, /deliveryTime/, `${f} must not invent a delivery window`);
    assert.match(code, /"@type": "Offer"/, `${f} still emits the Offer`);
    assert.match(code, /url: `\$\{SITE_URL\}\/(deals|sealed-deals)\/\$\{deal\.id\}`/, `${f} points the Offer at its own page`);
    assert.doesNotMatch(code.slice(code.indexOf("const productJsonLd"), code.indexOf("offers:") + 600), /listing_url|affiliate_url/, `${f}: no eBay URL inside the Product`);
    assert.match(code, /availability: deal\.is_active \? "https:\/\/schema\.org\/InStock"/, f);
  }
  // the visible shipping contract is untouched: same helper, same states
  const shipping = read("lib/offerPresentation.js");
  assert.match(shipping, /return n > 0 \? "confirmed" : "unconfirmed";/);
  assert.match(shipping, /headline: "Listing total"/);
  // and the deal page still consumes it for what the visitor sees
  const dealPage = read("app/deals/[id]/page.js");
  assert.match(dealPage, /const shipping = offerShipping\(deal\);/);
  assert.match(dealPage, /shipping\.headline/);
  assert.match(dealPage, /shipping\.note \?\? "Includes recorded shipping"/);
});

test("7. card-page schema is unchanged", async () => {
  const base = fixture("bin_compared");
  const offers = [{ ...base, shipping: 9.99 }];
  const { route } = loadRoute("app/cards/[slug]/page.js", {
    hub: { id: "fixture-hub", slug: "fixture-clefable", name: "Clefable", set: "Jungle", tcgplayerId: "45120" },
    offers,
  });
  const tree = await route.default({ params: Promise.resolve({ slug: "fixture-clefable" }) });
  const product = elements(tree)
    .filter((e) => e.type === "script" && e.props.type === "application/ld+json")
    .map((e) => JSON.parse(e.props.dangerouslySetInnerHTML.__html))
    .find((s) => s["@type"] === "Product");
  assert.equal(product.offers.length, 1);
  assert.equal(product.offers[0].url, `https://pokemondealfinder.com/deals/${base.id}`);
  assert.equal(product.offers[0].price, "26.50"); // the item price, not the 30.75 total
  assert.equal(product.offers[0].shippingDetails, undefined);
  // and the source itself never grew a shippingDetails block
  const code = read("app/cards/[slug]/page.js").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /shippingDetails/);
});
