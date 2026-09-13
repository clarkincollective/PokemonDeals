import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {loadRoute,elements} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
const base=DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
async function schema(overrides){
 const offers=overrides.map(row=>({...base,...row}));
 const {route}=loadRoute('app/cards/[slug]/page.js',{
  hub:{id:'fixture-hub',slug:'fixture-clefable',name:'Clefable',set:'Jungle',tcgplayerId:'45120'},offers,
 });
 const tree=await route.default({params:Promise.resolve({slug:'fixture-clefable'})});
 return elements(tree).filter(e=>e.type==='script'&&e.props.type==='application/ld+json')
  .map(e=>JSON.parse(e.props.dangerouslySetInnerHTML.__html)).find(s=>s['@type']==='Product');
}
test('card schema uses actual listing currency and preserves fixed price destination',async()=>{
 const product=await schema([{currency:'AUD',marketplace:'EBAY_US',total_price:42}]);
 assert.equal(product.offers[0].priceCurrency,'AUD');
 assert.equal(product.offers[0].price,'42.00');
 assert.equal(product.offers[0].url,base.listing_url);
 assert.equal(product.offers[0].shippingDetails,undefined);
});
test('card auction schema matches the displayed current bid',async()=>{
 const product=await schema([{listing_type:'AUCTION',currency:'USD',price:20,shipping:5,total_price:25,total_price_usd:25}]);
 assert.equal(product.offers[0].price,'20.00');
});
for(const total_price of [null,0,-1,'invalid']){
 test('invalid card offer price is omitted: '+total_price,async()=>{
  assert.equal(await schema([{total_price}]),undefined);
 });
}
test('missing auction bid is not promoted as a priced offer',async()=>{
 assert.equal(await schema([{listing_type:'AUCTION',price:null,total_price:25}]),undefined);
});
test('mixed rows retain valid offer and do not claim universal comparisons',async()=>{
 const product=await schema([{total_price:null},{total_price:30,listing_type:'FIXED_PRICE'}]);
 assert.equal(product.offers.length,1);
 assert.equal(product.offers[0].price,'30.00');
 assert.doesNotMatch(product.description,/compared against real market pricing/);
});
