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
test('card hub does not call a native GBP value USD',async()=>{
 const deal={...DEAL_STATE_FIXTURES.find(f=>f.id==='non_usd').deal,total_price_usd:null};
 const {route,components}=loadRoute('app/cards/[slug]/page.js',{hub:{id:'fixture',name:'Light Dragonite',set:'Neo Destiny',tcgplayerId:'86738'},offers:[deal]});
 const tree=await route.default({params:Promise.resolve({slug:'fixture-dragonite'})});
 const nodes=elements(tree);
 assert.equal(nodes.find(e=>e.type===components.get('@/components/StickyDealCta')).props.priceUsd,null);
 assert.equal(nodes.find(e=>e.type===components.get('@/components/CardPriceSummary')).props.listingsLowUsd,null);
});
