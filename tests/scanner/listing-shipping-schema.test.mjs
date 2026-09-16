// Evaluate the actual route's pure Product JSON-LD expression. Never import
// the route or invoke its database/provider functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { offerShipping } from '../../lib/offerPresentation.js';
import { slimPoolRow } from '../../lib/dealPoolShape.mjs';
const source = readFileSync(new URL('../../app/deals/[id]/page.js', import.meta.url), 'utf8');
const expression = source.match(/const productJsonLd = ([\s\S]*?);\s*\/\/ Real 3-level breadcrumb/)[1];
function schema(row, auction) {
  const deal = slimPoolRow({id: 'fixture', title: 'Simulated listing', price: 20,
    total_price: 25, currency: 'GBP', marketplace: 'EBAY_GB', is_active: true,
    listing_url: 'https://example.invalid/listing', ...row});
  return JSON.parse(JSON.stringify(runInNewContext('(' + expression + ')', {
    deal, offerShipping, cardName: 'Fixture', cardSet: 'Fixture set',
    nativeCurrency: 'GBP', auctionParts: auction ? {bid: {native: 20}} : null,
    trustedDealImageUrl: () => undefined, normalizePublicText: value => value,
  })));
}
for (const auction of [false, true]) {
  for (const shipping of [undefined, null, 0, '0', '', -1, 'invalid', NaN, Infinity]) {
    test('no shipping claim for ' + String(shipping) + ', auction=' + auction, () => {
      const result = schema({shipping}, auction);
      assert.equal(Object.hasOwn(result.offers, 'shippingDetails'), false);
      assert.equal(result.offers.priceCurrency, 'GBP');
      assert.equal(result.offers.price, auction ? '20.00' : '25.00');
    });
  }
  // SEO-2.6.1: a recorded charge used to emit OfferShippingDetails with
  // shippingRate + shippingDestination but no deliveryTime, which Google's
  // Merchant Listing enhancement reports as incomplete. We hold no delivery
  // time and must not invent one, so the block is withheld entirely; the
  // charge is still shown on the visible page (offerShipping).
  for (const shipping of [5, '5.25']) {
    test('recorded charge is NOT emitted as incomplete shippingDetails, auction=' + auction + ', charge=' + shipping, () => {
      const result = schema({shipping}, auction);
      assert.equal(Object.hasOwn(result.offers, 'shippingDetails'), false);
      assert.equal(offerShipping({shipping}).state, 'confirmed', 'the charge itself is still a confirmed visible fact');
      assert.equal(result.offers.priceCurrency, 'GBP');
      assert.equal(result.offers.price, auction ? '20.00' : '25.00');
      // (slimPoolRow strips listing_url from this fixture; the Offer URL is
      // proven at route level in seo-2-6-1-merchant-listing.test.mjs)
    });
  }
}
