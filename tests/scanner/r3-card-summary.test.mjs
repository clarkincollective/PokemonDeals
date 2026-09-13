import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => { throw Error('NETWORK_FORBIDDEN'); }; });
afterEach(() => { globalThis.fetch = originalFetch; });
const card = {name:'Clefable', set:'Jungle', cardNumber:'1/64', rarity:'Holo Rare', tcgplayerId:'45120', refPrice:30, indexable:true};
const analysis = {cardNumber:'1/64', raw:{currentPrice:42, referenceCondition:'Lightly Played'}, priceUpdatedAt:'2026-09-01', firstEditionExcluded:true, graded:[]};
async function render(options) {
  const {route} = loadRoute('app/cards/[slug]/page.js', {card, renderComponents:'visual', ...options});
  return renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
}
for (const live of [false, true]) test('one exact-card answer and offer jump, live='+live, async () => {
  const deal = DEAL_STATE_FIXTURES.find(f => f.id==='bin_compared').deal;
  const html = await render({analysis, ...(live ? {hub:{id:'fixture-hub', ...card}, offers:[deal]} : {})});
  assert.equal((html.match(/id="card-worth"/g) ?? []).length, 1);
  assert.equal((html.match(/\$42\.00/g) ?? []).length, 1);
  assert.match(html, /data-worth-condition="Lightly Played"/);
  assert.match(html, /September 1, 2026/);
  assert.match(html, /1st Edition copies.*priced separately/);
  assert.match(html, /Card number/);
  assert.match(html, /1\/64/);
  assert.match(html, /href="\/methodology"/);
  assert.match(html, /reference, not an available offer/);
  assert.doesNotMatch(html, /Market value ·|data-r3-reference-summary|Price &amp; value/);
  assert.equal((html.match(/href="#(?:card-offers|listings)"/g) ?? []).length, live ? 1 : 0);
  assert.ok(html.indexOf('id="card-worth"') < html.indexOf('Check on TCGPlayer'));
  if (live) {
    assert.match(html, /data-worth-live="1"/);
    assert.match(html, /asking prices, not sold/);
    assert.match(html, /sponsored/);
    assert.match(html, /ebay\.com\/itm\//);
  }
});
test('catalogue-only fallback keeps USD answer and unknown-condition provenance once', async () => {
  const html = await render({analysis:null});
  assert.equal((html.match(/\$30\.00/g) ?? []).length, 1);
  assert.match(html, /USD/);
  assert.match(html, /data-worth-condition="unknown"/);
  assert.match(html, /doesn&#x27;t state which condition/);
  assert.doesNotMatch(html, /last updated|ebay\.com\/itm\//);
});
test('rejected raw reference keeps one unavailable answer without catalogue resurrection', async () => {
  const html = await render({analysis:{raw:{currentPrice:null},graded:[]}});
  assert.equal((html.match(/data-worth-answer="unavailable"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /\$30|Price &amp; value|Condition &amp; graded references/);
});
test('additional condition and graded evidence retains currency conversion and limitations', async () => {
  const html = await render({analysis:{...analysis, raw:{currentPrice:42,referenceCondition:'Near Mint'},
    conditionBreakdown:[{condition:'Near Mint',price:42},{condition:'Lightly Played',price:30}],
    graded:[{key:'psa9',label:'PSA 9',currentPrice:100,saleCount:2,confidence:'limited'}]},
    currency:{viewer:'AUD',rates:{AUD:1.5,USD:1}}});
  assert.match(html, /Condition &amp; graded references/);
  assert.match(html, /PSA 9/);
  assert.match(html, /2 sales/);
  assert.match(html, /Limited recent sales/);
  assert.match(html, /\$150\.00/);
  assert.match(html, /\$45\.00/);
});
test('suppressed graded evidence does not disappear with the duplicate headline', async () => {
  const html = await render({analysis:{...analysis,gradedSuppressedCount:2}});
  assert.match(html, /No graded tier has enough reliable recent sales/);
});
test('trend evidence keeps windows, direction and coverage without another raw headline', () => {
  const {components} = loadRoute('app/cards/[slug]/page.js', {renderComponents:'visual'});
  const component = components.get('@/components/CardPriceIntelligence');
  const html = renderToStaticMarkup(createElement(component, {
    detailsOnly:true, marketValueUsd:42, referenceCondition:'Lightly Played',
    trends:{d30:{changePct:5}}, signal:{status:'rising',label:'Rising',changePct:5},
    coverage:{label:'30 comparable snapshots'},
  }));
  assert.match(html, /30-day/);
  assert.match(html, /\+5%/);
  assert.match(html, /Rising/);
  assert.match(html, /30 comparable snapshots/);
  assert.match(html, /not a prediction/);
  assert.doesNotMatch(html, /\$42|Current market value ·/);
});
