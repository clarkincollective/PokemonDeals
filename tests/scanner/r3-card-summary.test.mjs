import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => { throw Error('NETWORK_FORBIDDEN'); }; });
afterEach(() => { globalThis.fetch = originalFetch; });
// audit-r1: the answer is the dated catalogue reference (condition and
// printing as the catalogue recorded them); the provider analysis reaches
// the page only through the client market panel and never the server HTML.
const card = {name:'Clefable', set:'Jungle', cardNumber:'1/64', rarity:'Holo Rare', tcgplayerId:'45120', refPrice:42, refCondition:'Lightly Played', refPrinting:'Unlimited', syncedAt:'2026-09-01T00:00:00Z', indexable:true};
const analysis = {cardNumber:'1/64', raw:{currentPrice:77, referenceCondition:'Near Mint'}, priceUpdatedAt:'2026-08-01', firstEditionExcluded:true, graded:[]};
async function render(options) {
  const {route} = loadRoute('app/cards/[slug]/page.js', {card, renderComponents:'visual', ...options});
  return renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
}
function summary(props, currency) {
  // the ladder now renders inside the client market panel; compile the real component through the same harness
  const {route} = loadRoute('components/CardPriceSummary.js', {renderComponents:'visual', ...(currency ? {currency} : {})});
  return renderToStaticMarkup(createElement(route.default, props));
}
for (const live of [false, true]) test('one exact-card answer and offer jump, live='+live, async () => {
  const deal = DEAL_STATE_FIXTURES.find(f => f.id==='bin_compared').deal;
  const html = await render({analysis, ...(live ? {hub:{id:'fixture-hub', ...card}, offers:[deal]} : {})});
  assert.equal((html.match(/id="card-worth"/g) ?? []).length, 1);
  assert.equal((html.match(/\$42\.00/g) ?? []).length, 1);
  assert.doesNotMatch(html, /\$77\.00|August 1, 2026/);
  assert.match(html, /data-worth-condition="Lightly Played"/);
  // the catalogue copy claims no "changed on" date (its sync date is not a market date)
  assert.doesNotMatch(html, /last updated/);
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
test('catalogue reference without a recorded condition keeps the USD answer and unknown-condition provenance once', async () => {
  const html = await render({card:{...card, refPrice:30, refCondition:null, refPrinting:null, syncedAt:null}, analysis:null});
  assert.equal((html.match(/\$30\.00/g) ?? []).length, 1);
  assert.match(html, /USD/);
  assert.match(html, /data-worth-condition="unknown"/);
  assert.match(html, /doesn&#x27;t state which condition/);
  assert.doesNotMatch(html, /last updated|ebay\.com\/itm\//);
});
test('no catalogue reference keeps one unavailable answer; the analysis never resurrects a figure', async () => {
  const html = await render({card:{...card, refPrice:null, refCondition:null, indexable:false}, analysis:{raw:{currentPrice:42},graded:[]}});
  assert.equal((html.match(/data-worth-answer="unavailable"/g) ?? []).length, 1);
  const answer = html.match(/<p data-worth-answer="unavailable">[\s\S]*?<\/p>/)?.[0];
  assert.match(answer, /href="\/methodology"/);
  assert.match(answer, /How we work out prices/);
  assert.doesNotMatch(html, /\$42|\$30|Price &amp; value|Condition &amp; graded references/);
});
test('the server HTML carries no provider evidence; the deferred market panel is in place on both paths', async () => {
  for (const live of [false, true]) {
    const deal = DEAL_STATE_FIXTURES.find(f => f.id==='bin_compared').deal;
    const {route, substitutes} = loadRoute('app/cards/[slug]/page.js', {card, renderComponents:'visual', analysis:{...analysis, graded:[{key:'psa9',label:'PSA 9',currentPrice:100,saleCount:2}]}, ...(live ? {hub:{id:'fixture-hub', ...card}, offers:[deal]} : {})});
    const html = renderToStaticMarkup(await route.default({params:Promise.resolve({slug:'fixture-clefable'})}));
    assert.doesNotMatch(html, /Condition &amp; graded references|PSA 9|Every variant, side by side/);
    assert.ok(substitutes.has('@/components/CardMarketPanel'), 'live='+live);
  }
});
test('additional condition and graded evidence (market panel) retains currency conversion and limitations', () => {
  const html = summary({detailsOnly:true, analysis:{...analysis, raw:{currentPrice:42,referenceCondition:'Near Mint'},
    conditionBreakdown:[{condition:'Near Mint',price:42},{condition:'Lightly Played',price:30}],
    graded:[{key:'psa9',label:'PSA 9',currentPrice:100,saleCount:2,confidence:'limited'}]}},
    {viewer:'AUD',rates:{AUD:1.5,USD:1}});
  assert.match(html, /Condition &amp; graded references/);
  assert.match(html, /PSA 9/);
  assert.match(html, /2 sales/);
  assert.match(html, /Limited recent sales/);
  assert.match(html, /\$150\.00/);
  assert.match(html, /\$45\.00/);
});
test('suppressed graded evidence does not disappear with the duplicate headline (market panel)', () => {
  const html = summary({detailsOnly:true, analysis:{...analysis,gradedSuppressedCount:2}});
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
