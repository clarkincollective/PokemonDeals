import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
for (const name of ['listing','catalogue']) test('visual SSR boundary: '+name,async()=>{
  const source=DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
  const card={name:'Clefable',set:'Jungle',cardNumber:'1/64',tcgplayerId:'45120',refPrice:30,indexable:true};
  const {route,substitutes}=loadRoute(name==='listing'?'app/deals/[id]/page.js':'app/cards/[slug]/page.js',{
    deal:{...source,is_active:true},card,renderComponents:'visual',
  });
  const html=renderToStaticMarkup(await route.default({params:Promise.resolve({id:String(source.id),slug:'fixture-clefable'})}));
  assert.match(html,/Pokemon/);
  assert.match(html,/Clefable/);
  assert.match(html,/How it works|Methodology|methodology/);
  assert.match(html,/sponsored/);
  assert.ok(!substitutes.has('@/components/SiteHeader'));
});
