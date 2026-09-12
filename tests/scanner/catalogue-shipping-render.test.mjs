// Render the actual DealCard element tree and invoke the actual affiliate
// handler with transport stubbed. No DOM, provider, network or credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import swc from 'next/dist/build/swc/index.js';
import { DEAL_STATE_FIXTURES } from '../../lib/dev/dealStateFixtures.js';
import { slimPoolRow } from '../../lib/dealPoolShape.mjs';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');
const components = new Map();
function component(name) {
  if (!components.has(name)) {
    const stub = () => null;
    stub.WithinWindow = function WithinWindow() { return null; };
    components.set(name, stub);
  }
  return components.get(name);
}
async function load(file, overrides = {}) {
  const filename = resolve(root, file);
  const { code } = swc.transformSync(readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022',
      transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' }
  });
  const compiledModule = { exports: {} };
  const localRequire = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/components/') || name === 'next/link') return component(name);
    if (name.startsWith('@/lib/')) return require(resolve(root, name.slice(2) + '.js'));
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports.default;
}
function find(element, type) {
  if (!element || typeof element !== 'object') return null;
  if (element.type === type) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const hit = find(child, type);
    if (hit) return hit;
  }
  return null;
}

const SpeciesCard = await load('components/SpeciesCard.js');
const SealedDealCard = await load('components/SealedDealCard.js');
function words(el) {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el !== 'object') return String(el);
  return (Array.isArray(el) ? el : [el.props?.children]).flat(Infinity).map(words).join(' ');
}
const {runInNewContext} = await import('node:vm');
const source = readFileSync(resolve(root,'lib/deals.js'),'utf8');
const projections = [...source.matchAll(/\{\s*count: 1,\s*cheapestUsd: Number\(d.total_price_usd \?\? d.total_price\),[\s\S]*?listingType: d.listing_type \?\? "FIXED_PRICE",\s*\}/g)].map(m=>m[0]);
assert.equal(projections.length,3);
for (const [index, expression] of projections.entries()) {
  for (const shipping of [undefined, 0, 5]) {
    for (const listing_type of ['FIXED_PRICE','AUCTION']) {
      test('actual catalogue projection '+index+' shipping='+shipping+' '+listing_type, () => {
        const deal = runInNewContext('('+expression+')', {
          d:{total_price:25,total_price_usd:30,currency:'GBP',marketplace:'EBAY_US',shipping,
            discount_pct:0.25,listing_type,watchlist:{}}, savingsClaimTrusted:()=>true,
          dealCtaUrl:()=> 'https://www.ebay.com/itm/123456789012',
        });
        const el = SpeciesCard({card:{name:'Fixture',set:'Fixture',deal}});
        const text = words(el);
        assert.equal(deal.currency,'GBP');
        assert.equal(deal.shipping,shipping ?? null);
        const price = find(el,component('@/components/Price'));
        assert.equal(price.props.native.currency,'GBP');
        if (shipping === undefined) {
          assert.match(text,/Shipping breakdown not recorded/);
          assert.doesNotMatch(text,/below market|under market ref/);
          assert.match(text,/Recorded (price|total)/);
        } else if (shipping === 0) {
          assert.match(text,/Shipping not confirmed/);
          assert.match(text,/before shipping/);
        } else {
          assert.match(text,/Includes recorded shipping/);
        }
      });
    }
  }
}
for (const shipping of [undefined,0,5]) {
  test('sealed card and share text preserve shipping uncertainty: '+shipping, () => {
    const fixture = DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
    const deal = {...fixture,shipping,sealed_watchlist:{name:'Simulated sealed fixture',set:'Fixture'}};
    const el = SealedDealCard({deal});
    const text = words(el);
    const share = find(el,component('@/components/ShareButton'));
    if (shipping === undefined) {
      assert.match(text,/Shipping breakdown not recorded/);
      assert.doesNotMatch(text,/below market|You save/);
      assert.doesNotMatch(share.props.text,/below market/);
    } else if (shipping === 0) {
      assert.match(text,/Shipping not confirmed/);
      assert.match(text,/before shipping/);
      assert.match(share.props.text,/before shipping/);
    } else {
      assert.match(text,/Includes recorded shipping/);
    }
  });
}
