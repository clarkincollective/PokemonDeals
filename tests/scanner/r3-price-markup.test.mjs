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

// audit-r1: the hero is the dated catalogue reference, labelled by the
// condition the catalogue recorded; the provider analysis (condition
// ladder, graded tiers) arrives with the client market panel and can
// never change the server-rendered figure.
test('live hub hero shows the catalogue reference and its recorded condition',async()=>{
  const {route}=loadRoute('app/cards/[slug]/page.js',{
    hub:{id:'fixture-hub',name:'Clefable',set:'Jungle',tcgplayerId:'45120'},
    card:{name:'Clefable',set:'Jungle',tcgplayerId:'45120',refPrice:42,refCondition:'Lightly Played'},
    analysis:{raw:{currentPrice:99,referenceCondition:'Near Mint'},graded:[]},renderComponents:"visual",
  });
  const html=renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
  const hero=html.match(/id="card-worth"[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero);
  assert.match(hero,/42\.00/);
  assert.match(hero,/Lightly Played/);
  assert.doesNotMatch(html,/99\.00/);
});
test('no catalogue reference means one unavailable answer, whatever the analysis says',async()=>{
  const {route}=loadRoute('app/cards/[slug]/page.js',{
    card:{name:'Clefable',set:'Jungle',refPrice:null,tcgplayerId:'45120'},
    analysis:{raw:{currentPrice:42},graded:[]},renderComponents:"visual",
  });
  const html=renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
  const hero=html.match(/id="card-worth"[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero);
  assert.match(hero,/reliable recent-sold market price/);
  assert.doesNotMatch(html,/42\.00/);
});
