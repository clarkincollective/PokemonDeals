import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
function render(amount,label,note,currency='USD'){
 const {components}=loadRoute('app/deals/[id]/page.js',{renderComponents:'visual'});
 return renderToStaticMarkup(React.createElement(components.get('@/components/StickyDealCta'),{
  href:'https://www.ebay.com/itm/000000000000?customid=deal_page',priceUsd:null,
  priceNative:{amount,currency},priceLabel:label,priceNote:note,ctaLabel:'View on eBay',
 }));
}
for(const amount of [null,undefined,0,-1,'invalid'])for(const label of ['Listing total','Recorded auction price']){
 test(`unavailable sticky copy: ${amount} / ${label}`,()=>{
  const html=render(amount,label,'Includes recorded shipping');
  assert.ok(html.includes('Price unavailable'));
  assert.ok(!html.includes(label));
  assert.ok(!html.includes('Includes recorded shipping'));
  assert.ok(html.includes('customid=deal_page'));
  assert.ok(html.includes('View on eBay'));
 });
}
for(const currency of ['USD','AUD'])for(const note of ['Includes recorded shipping','Shipping not confirmed']){
 test(`supported sticky preserves context: ${currency} / ${note}`,()=>{
  const html=render(25,'Listing price',note,currency);
  assert.ok(!html.includes('Price unavailable'));
  assert.ok(html.includes('Listing price'));
  assert.ok(html.includes(note));
  assert.ok(html.includes('25.00'));
 });
}
