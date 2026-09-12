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
  for (const shipping of [5, '5.25']) {
    test('recorded charge retained, auction=' + auction + ', charge=' + shipping, () => {
      const result = schema({shipping}, auction);
      assert.equal(result.offers.shippingDetails.shippingRate.value, Number(shipping).toFixed(2));
      assert.equal(result.offers.shippingDetails.shippingRate.currency, 'GBP');
      assert.equal(result.offers.shippingDetails.shippingDestination.addressCountry, 'GB');
    });
  }
}
