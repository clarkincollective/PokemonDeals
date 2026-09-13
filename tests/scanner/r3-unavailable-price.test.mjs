import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute,elements} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
for(const type of ['FIXED_PRICE','AUCTION']){
 for(const amount of [null,undefined,0,-1,'invalid']){
  test(`unsupported native price ${type}: ${amount}`,async()=>{
   const deal={...DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal,is_active:true,listing_type:type,price:null,total_price:amount,total_price_usd:null};
   const {route}=loadRoute('app/deals/[id]/page.js',{deal,renderComponents:'visual'});
   const params=Promise.resolve({id:String(deal.id)});
   const tree=await route.default({params});
   const html=renderToStaticMarkup(tree);
   assert.ok(html.includes('Price unavailable'),'explicit unavailable state');
   assert.doesNotMatch(html,/\$0\.00|\$-1\.00|You save|Below Market/);
   assert.ok(!elements(tree).some(e=>e.type==='script'&&e.props.dangerouslySetInnerHTML?.__html.includes('"@type":"Product"')));
   assert.match(html,/ebay\.com\/itm\//);
   const meta=await route.generateMetadata({params});
   assert.equal(meta.robots.index,false);
   assert.match(meta.description,/price.*unavailable/i);
  });
 }
}
test('missing auction bid cannot emit a fixed-price rich offer',async()=>{
 const deal={...DEAL_STATE_FIXTURES.find(f=>f.id==='auction_no_bid').deal,is_active:true};
 const {route}=loadRoute('app/deals/[id]/page.js',{deal});
 const tree=await route.default({params:Promise.resolve({id:String(deal.id)})});
 assert.ok(!elements(tree).some(e=>e.type==='script'&&e.props.dangerouslySetInnerHTML?.__html.includes('"@type":"Product"')));
});

test('shared auction fallback does not invent a zero price',()=>{
 const {components}=loadRoute('app/deals/[id]/page.js',{renderComponents:'visual'});
 const AuctionPrice=components.get('@/components/AuctionPrice');
 const html=renderToStaticMarkup(AuctionPrice({deal:{total_price:null,price:null}}));
 assert.ok(html.includes('Price unavailable'));
 assert.ok(!html.includes('$0.00'));
});
