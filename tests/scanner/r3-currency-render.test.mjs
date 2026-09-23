import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute,elements} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
for(const type of ['FIXED_PRICE','AUCTION']){
 for(const usd of [null,0,125]){
  test(`foreign listing conversion ${type}, USD=${usd}`,async()=>{
   const deal={...DEAL_STATE_FIXTURES.find(f=>f.id==='non_usd').deal,is_active:true,listing_type:type,price:95,shipping:5,total_price:100,total_price_usd:usd};
   const {route,components}=loadRoute('app/deals/[id]/page.js',{deal,renderComponents:true,currency:{viewer:'USD',rates:{USD:1,GBP:0.8}}});
   const tree=await route.default({params:Promise.resolve({id:String(deal.id)})});
   const sticky=elements(tree).find(e=>e.type===components.get('@/components/StickyDealCta'));
   assert.equal(sticky.props.priceUsd,usd>0?(type==='AUCTION'?118.75:125):null);
   const html=renderToStaticMarkup(tree);
   if(!(usd>0))assert.match(html,/£100\.00/);
  });
 }
}
// The rule: when a listing's USD total is not trustworthy, nothing on the
// page may hand the NATIVE figure to something that labels it USD.
//
// The second assertion used to read CardPriceSummary's `listingsLowUsd`.
// That page no longer renders CardPriceSummary directly (it sits behind
// CardMarketPanel / CatalogCardView, which the harness stubs as opaque
// default exports) and no longer passes `listingsLowUsd` at all, so the
// assertion was reaching for an undefined component and throwing
// "Cannot read properties of undefined". Quarantined 2026-09-16 as a
// result - a structural drift, not a currency bug.
//
// Re-pointed 2026-09-23 at the rule rather than at one component: EVERY
// prop ending in "Usd", on every element the page renders, must not carry
// the native amount. That survives components moving around, and it
// covers props the original pair never looked at.
test('card hub does not call a native GBP value USD',async()=>{
 const deal={...DEAL_STATE_FIXTURES.find(f=>f.id==='non_usd').deal,total_price_usd:null};
 const native=Number(deal.total_price);
 const {route,components}=loadRoute('app/cards/[slug]/page.js',{hub:{id:'fixture',name:'Light Dragonite',set:'Neo Destiny',tcgplayerId:'86738'},offers:[deal]});
 const tree=await route.default({params:Promise.resolve({slug:'fixture-dragonite'})});
 const nodes=elements(tree);
 // the sticky CTA is still rendered directly and still the primary carrier
 const sticky=nodes.find(e=>e.type===components.get('@/components/StickyDealCta'));
 assert.ok(sticky,'the card hub no longer renders StickyDealCta - re-point this test');
 assert.equal(sticky.props.priceUsd,null);
 // and no USD-named prop anywhere may hold the native figure
 assert.ok(Number.isFinite(native)&&native>0,'fixture must have a native amount to test against');
 for(const node of nodes){
  for(const [k,v] of Object.entries(node.props??{})){
   if(!/Usd$/.test(k))continue;
   assert.notEqual(v,native,`${k} carries the native ${deal.currency??'non-USD'} amount ${native} under a USD name`);
  }
 }
});
