import {test,beforeEach,afterEach} from 'node:test';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
import assert from 'node:assert/strict';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
import {loadRoute,elements} from '../helpers/r3RouteHarness.mjs';
const listing='app/deals/[id]/page.js';
const permanent='app/cards/[slug]/page.js';
for (const id of ['bin_compared','graded','auction','bin_plain','bin_shipping_unknown','non_usd']) {
  test('actual listing route and metadata, fixture '+id,async t=>{
    const before=globalThis.fetch;
    globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
    t.after(()=>{globalThis.fetch=before;});
    const source=DEAL_STATE_FIXTURES.find(f=>f.id===id);
    assert.ok(source,'fixture exists');
    const deal={...source.deal,is_active:true};
    const {route,calls}=loadRoute(listing,{deal});
    const params=Promise.resolve({id:String(deal.id)});
    const meta=await route.generateMetadata({params});
    const tree=await route.default({params});
    assert.ok(meta.title);
    assert.ok(elements(tree).length>10);
    assert.ok(elements(tree).some(e=>e.type==='script' && e.props.type==='application/ld+json'),'active route emits JSON-LD');
    assert.ok(calls.some(c=>c.name==='fixture-price-analysis'),'active route uses fixture pricing boundary');
    assert.ok(calls.some(c=>c.name==='fixture-db.single'));
  });
}
test('expired listing redirects to permanent card with no price request',async()=>{
  const source=DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
  const {route,calls}=loadRoute(listing,{deal:{...source,is_active:false,watchlist_id:'fixture-watchlist'},hub:{slug:'fixture-card'}});
  await assert.rejects(route.default({params:Promise.resolve({id:String(source.id)})}),/FIXTURE_REDIRECT:\/cards\/fixture-card/);
  assert.ok(!calls.some(c=>c.name==='fixture-price-analysis'));
});
for (const priced of [true,false]) {
  test('catalogue-only permanent route retains fallback, priced='+priced,async()=>{
    const card={name:'Clefable',set:'Jungle',cardNumber:'1/64',tcgplayerId:'45120',refPrice:priced?30:null,indexable:priced};
    const {route,components}=loadRoute(permanent,{card});
    const params=Promise.resolve({slug:'fixture-clefable'});
    const meta=await route.generateMetadata({params});
    const tree=await route.default({params});
    assert.equal(meta.alternates.canonical,'/cards/fixture-clefable');
    if (!priced) assert.equal(meta.robots.index,false);
    assert.equal(tree.type,components.get('@/components/CatalogCardView'));
    assert.equal(tree.props.card,card);
    assert.equal(tree.props.alertsEnabled,false);
  });
}

for (const hasOffers of [true,false]) {
  test('actual permanent hub route and metadata, offers='+hasOffers,async()=>{
    const fixture=DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
    const {route,calls}=loadRoute(permanent,{hub:{id:'fixture-hub',slug:'fixture-clefable',name:'Clefable',set:'Jungle',tcgplayerId:'45120'},offers:hasOffers?[fixture]:[]});
    const params=Promise.resolve({slug:'fixture-clefable'});
    const meta=await route.generateMetadata({params});
    const tree=await route.default({params});
    assert.equal(meta.alternates.canonical,'/cards/fixture-clefable');
    assert.ok(elements(tree).length>10);
    assert.ok(calls.some(c=>c.name==='fixture-price-analysis'));
  });
}
