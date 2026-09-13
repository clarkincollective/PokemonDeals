import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => { throw Error('NETWORK_FORBIDDEN'); }; });
afterEach(() => { globalThis.fetch = originalFetch; });
const source = DEAL_STATE_FIXTURES.find(f => f.id === 'bin_compared').deal;
const card = {name:'Clefable', set:'Jungle', cardNumber:'1/64', tcgplayerId:'45120', refPrice:30, indexable:true};
for (const state of ['listing','display_gated','catalogue','hub']) {
  test('R3 content landmark and keyboard bypass: '+state, async () => {
    const listing = ['listing','display_gated'].includes(state);
    const {route} = loadRoute(listing ? 'app/deals/[id]/page.js' : 'app/cards/[slug]/page.js', {
      renderComponents:'visual', card,
      deal:{...source,is_active:true,...(state==='display_gated'?{visual_authenticity_status:'IDENTITY_MISMATCH'}:{})},
      hub:state === 'hub' ? {id:'fixture-hub',...card} : null,
      offers:state === 'hub' ? [source] : [],
    });
    const html = renderToStaticMarkup(await route.default({params:Promise.resolve({id:String(source.id),slug:'fixture-clefable'})}));
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/);
    const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0];
    assert.equal((main.match(/<h1\b/g) ?? []).length, 1);
    assert.doesNotMatch(main, /<footer\b|aria-label="Primary"/);
    const firstLink = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.match(firstLink, /href="#main-content"/);
    assert.match(firstLink, /Skip to content/);
  });
}

for (const state of ['expired','missing']) test('lifecycle control remains '+state, async () => {
  const {route} = loadRoute('app/deals/[id]/page.js', {card,deal:state==='missing'?null:{...source,is_active:false}});
  await assert.rejects(route.default({params:Promise.resolve({id:String(source.id)})}),
    state==='missing'?/FIXTURE_NOT_FOUND/:/FIXTURE_REDIRECT:\/cards\/clefable-jungle/);
});
