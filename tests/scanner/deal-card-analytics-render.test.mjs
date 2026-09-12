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
    stub.WithinWindow = () => null;
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
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/components/') || name === 'next/link') return component(name);
    if (name.startsWith('@/lib/')) return require(resolve(root, name.slice(2) + '.js'));
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports.default;
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
const DealCard = await load('components/DealCard.js');
const captures = [];
const AffiliateLink = await load('components/AffiliateLink.js', {
  '@/lib/analytics/client': { capture: (event, props) => captures.push({ event, props }) },
  '@vercel/analytics': { track: () => {} }
});
for (const lane of [false, true]) {
  test('unknown shipping carries no savings claim into affiliate handler: lane=' + lane, () => {
    const source = DEAL_STATE_FIXTURES.find(f => f.id === 'bin_shipping_unknown');
    assert.ok(source);
    const deal = slimPoolRow(source.deal);
    const element = DealCard({ deal, pageName: lane ? 'home_best' : 'home_all_deals',
      analytics: lane ? { section: 'best_deals', rank: 1 } : undefined });
    const link = find(element, component('@/components/AffiliateLink'));
    assert.ok(link);
    const anchor = AffiliateLink(link.props);
    assert.match(anchor.props.rel, /sponsored/);
    captures.length = 0;
    anchor.props.onClick();
    assert.equal(captures.length, 1);
    assert.equal(captures[0].props.discount_band, 'no_savings_claim');
    assert.equal(captures[0].props.origin_section, lane ? 'best_deals' : 'home_all_deals');
  });
}
test('supported comparison retains its band through the grid affiliate handler', () => {
  const source = DEAL_STATE_FIXTURES.find(f => f.id === 'bin_compared');
  assert.ok(source);
  const element = DealCard({deal: slimPoolRow(source.deal), pageName: 'home_all_deals'});
  const link = find(element, component('@/components/AffiliateLink'));
  captures.length = 0;
  AffiliateLink(link.props).props.onClick();
  assert.notEqual(captures[0].props.discount_band, 'no_savings_claim');
  assert.notEqual(captures[0].props.discount_band, undefined);
});
