import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute,elements} from '../helpers/r3RouteHarness.mjs';
import {sealedFixtures} from '../browser/r3/runtime/sealedFixtures.js';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
for(const {state,deal} of sealedFixtures){
 test('sealed detail state: '+state,async()=>{
  const {route}=loadRoute('app/sealed-deals/[id]/page.js',{deal,renderComponents:true,currency:{viewer:'AUD',rates:{USD:1,AUD:1.5,CAD:1.5}}});
  const props={params:Promise.resolve({id:String(deal.id)})};
  const tree=await route.default(props),html=renderToStaticMarkup(tree),meta=await route.generateMetadata(props);
  const schema=elements(tree).filter(e=>e.type==='script').map(e=>JSON.parse(e.props.dangerouslySetInnerHTML.__html));
  const product=schema.find(s=>s['@type']==='Product');
  assert.match(html,/id="main-content"/);assert.doesNotMatch(JSON.stringify(meta),/\{shipping\.savingQualifier\}/);
  if(state==='native_no_usd'){assert.match(html,/C\$75\.00/);assert.doesNotMatch(html,/A\$112\.50|You save/);assert.equal(product.offers.priceCurrency,'CAD');}
  if(state==='shipping_unconfirmed'){assert.match(html,/Shipping not confirmed/);assert.match(meta.description,/before shipping/);assert.equal(product.offers.shippingDetails,undefined);}
  if(state==='shipping_unknown'){assert.match(html,/Shipping breakdown not recorded/);assert.doesNotMatch(html,/You save|% below market/);assert.equal(product,undefined);assert.equal(meta.robots.index,false);}
  if(state==='auction'){assert.equal(product.offers.price,'45.00');assert.match(html,/Current bid/);assert.match(html,/View auction on eBay/);}
  if(state==='unpriced'){assert.match(html,/Price unavailable/);assert.doesNotMatch(html,/\$0\.00|You save|% below market/);assert.equal(product,undefined);assert.equal(meta.robots.index,false);}
  if(state==='market_unavailable'){assert.match(html,/No verified market reference/);assert.doesNotMatch(html,/\$0\.00|You save|% below market/);assert.equal(product,undefined);assert.equal(meta.robots.index,false);}
  if(state==='unavailable'){assert.match(html,/This listing is unavailable here/);assert.doesNotMatch(html,/View listing on eBay/);assert.equal(product,undefined);}
  // SEO-2.6.1: the recorded charge stays visible, but is no longer emitted as an incomplete (no deliveryTime) OfferShippingDetails
  if(state==='compared'){assert.equal(product.offers.price,'50.00');assert.equal(product.offers.shippingDetails,undefined);assert.match(html,/Includes recorded shipping/);}
 });
 if(state!=='unavailable')test('sealed tile state: '+state,()=>{
  const {route}=loadRoute('components/SealedDealCard.js',{renderComponents:true,currency:{viewer:'AUD',rates:{USD:1,AUD:1.5,CAD:1.5}}});
  const html=renderToStaticMarkup(route.default({deal}));
  if(state==='native_no_usd'){assert.match(html,/C\$75\.00/);assert.doesNotMatch(html,/A\$112\.50|You save/);}
  if(state==='unpriced'){assert.match(html,/Price unavailable/);assert.doesNotMatch(html,/\$0\.00|You save|% below market/);}
  if(state==='shipping_unknown')assert.doesNotMatch(html,/You save|% below market/);
  if(state==='market_unavailable')assert.doesNotMatch(html,/\$0\.00|You save|% below market/);
  assert.match(html,/sponsored/);assert.match(html,/View (deal|listing|auction) on eBay/);
  // 2026-09-19: a sealed offer with a supported saving is a qualifying deal
  // and says so; plain / unsupported states keep the neutral "listing".
  if(state==='compared')assert.match(html,/View deal on eBay/);
  if(state==='shipping_unknown'||state==='market_unavailable'||state==='unpriced')assert.doesNotMatch(html,/View deal on eBay/);
 });
}
