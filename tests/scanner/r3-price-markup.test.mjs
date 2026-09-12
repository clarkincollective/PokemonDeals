import {test,beforeEach,afterEach} from 'node:test';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
for (const id of ['bin_compared','bin_shipping_unconfirmed','bin_shipping_unknown','auction','graded']) {
  test('real price/affiliate HTML on listing route: '+id,async()=>{
    const deal={...DEAL_STATE_FIXTURES.find(f=>f.id===id).deal,is_active:true};
    const {route}=loadRoute('app/deals/[id]/page.js',{deal,renderComponents:true});
    const params=Promise.resolve({id:String(deal.id)});
    const html=renderToStaticMarkup(await route.default({params}));
    assert.match(html,/sponsored/);
    assert.match(html,/ebay\.com\/itm\//);
    if (id==='bin_shipping_unknown') {
      assert.match(html,/Shipping breakdown not recorded/);
      assert.doesNotMatch(html,/Below Market|You save/);
      const meta=await route.generateMetadata({params});
      assert.doesNotMatch(meta.title,/below market/i);
      assert.doesNotMatch(meta.description,/% below/);
    }
    if (id==='bin_shipping_unconfirmed') {
      assert.match(html,/Shipping not confirmed/);
      assert.match(html,/before shipping/);
    }
  });
}

for (const priced of [true,false]) {
  test('real catalogue fallback HTML, priced='+priced,async()=>{
    const card={name:'Clefable',set:'Jungle',cardNumber:'1/64',tcgplayerId:'45120',refPrice:priced?30:null,indexable:priced};
    const {route}=loadRoute('app/cards/[slug]/page.js',{card,renderComponents:true});
    const html=renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
    assert.match(html,/Clefable/);
    assert.match(html,/Jungle/);
    assert.match(html,/sponsored/);
    assert.doesNotMatch(html,/ebay\.com\/itm\//);
  });
}

test('live hub hero shows the actual raw reference and its condition',async()=>{
  const {route}=loadRoute('app/cards/[slug]/page.js',{
    hub:{id:'fixture-hub',name:'Clefable',set:'Jungle',tcgplayerId:'45120'},
    analysis:{raw:{currentPrice:42,referenceCondition:'Lightly Played'},graded:[]},renderComponents:true,
  });
  const html=renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
  const hero=html.match(/data-r3-reference-summary[\s\S]*?<\/div>/)?.[0];
  assert.ok(hero);
  assert.match(hero,/42\.00/);
  assert.match(hero,/Lightly Played/);
});
test('rejected analysis cannot resurrect catalogue reference in the hero',async()=>{
  const {route}=loadRoute('app/cards/[slug]/page.js',{
    card:{name:'Clefable',set:'Jungle',refPrice:30,tcgplayerId:'45120'},
    analysis:{raw:{currentPrice:null},graded:[]},renderComponents:true,
  });
  const html=renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
  const hero=html.match(/data-r3-reference-summary[\s\S]*?<\/div>/)?.[0];
  assert.ok(hero);
  assert.match(hero,/Raw market reference unavailable/);
  assert.doesNotMatch(hero,/30\.00/);
});
