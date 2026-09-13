import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
const fixture=id=>({...DEAL_STATE_FIXTURES.find(f=>f.id===id).deal,is_active:true});
async function metadata(deal){
 const {route}=loadRoute('app/deals/[id]/page.js',{deal});
 return route.generateMetadata({params:Promise.resolve({id:String(deal.id)})});
}
for(const id of ['auction','auction_shipping_unconfirmed','auction_shipping_unknown','auction_no_bid']){
 test('auction previews explain bidding: '+id,async()=>{
  const deal=fixture(id),meta=await metadata(deal);
  assert.match(meta.title,/auction/i);
  assert.match(meta.description,/final price may rise/i);
  assert.doesNotMatch(meta.title+' '+meta.description,/% below|you save/i);
  assert.equal(meta.alternates.canonical,'/deals/'+deal.id);
  assert.equal(meta.openGraph.description,meta.description);
  assert.equal(meta.twitter.description,meta.description);
  if(id==='auction_no_bid')assert.match(meta.description,/current bid not recorded/i);
  if(id==='auction_shipping_unconfirmed')assert.match(meta.description,/shipping not confirmed/i);
  if(id==='auction_shipping_unknown')assert.match(meta.description,/shipping breakdown not recorded/i);
 });
}
test('graded preview retains grader and grade',async()=>{
 const meta=await metadata(fixture('graded'));
 assert.match(meta.title,/PSA 9/);assert.match(meta.description,/PSA 9/);
});
test('plain auction keeps noindex and no reference claim',async()=>{
 const meta=await metadata({...fixture('bin_plain'),listing_type:'AUCTION'});
 assert.match(meta.title,/auction/i);assert.equal(meta.robots.index,false);
 assert.doesNotMatch(meta.description,/% below|you save/i);
});
test('expired auction preview cannot advertise an active bid',async()=>{
 const meta=await metadata({...fixture('auction'),is_active:false});
 assert.equal(meta.robots.index,false);assert.equal(meta.title,'Deal not found');
});
test('foreign auction uses native bid even without a stored USD total',async()=>{
 const meta=await metadata({...fixture('auction'),currency:'GBP',marketplace:'EBAY_GB',price:100,shipping:5,total_price:105,total_price_usd:null});
 assert.match(meta.description,/100\.00 GBP/);assert.doesNotMatch(meta.description,/105\.00|\$100/);
});
test('foreign fixed listing metadata compares canonical USD values',async()=>{
 const deal=fixture('non_usd'),meta=await metadata(deal);
 assert.ok(meta.description.includes('$'+deal.total_price_usd.toFixed(2)));
 assert.ok(meta.description.includes('$'+deal.market_price.toFixed(2)));
});
