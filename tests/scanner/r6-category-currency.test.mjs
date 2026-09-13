import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEAL_CATEGORIES } from '../../lib/dealCategories.js';

// Exercise the actual query function with a recording in-memory database.
// No Next/provider imports or credentials are loaded.
const source = readFileSync(new URL('../../lib/deals.js', import.meta.url), 'utf8');
const start = source.indexOf('async function fetchDealsPageUncached(');
const end = source.indexOf('export const fetchDealsPage =', start);
assert.ok(start > 0 && end > start);
const rows = [
  { id: 1, is_active: true, card_language: 'english', total_price: 40, total_price_usd: 20 },
  { id: 2, is_active: true, card_language: 'english', total_price: 20, total_price_usd: 40 },
  { id: 3, is_active: true, card_language: 'english', total_price: 5, total_price_usd: null },
];
function harness() {
  const calls = [], predicates = [];
  let order;
  const query = {
    select() { return query; },
    eq(col, value) { predicates.push(r => r[col] === value); return query; },
    lte(col, value) { calls.push(['lte', col, value]); predicates.push(r => r[col] != null && r[col] <= value); return query; },
    gte(col, value) { calls.push(['gte', col, value]); predicates.push(r => r[col] != null && r[col] >= value); return query; },
    order(col, opts) { order = { col, ...opts }; calls.push(['order', col]); return query; },
    async range(from, to) {
      const data = rows.filter(r => predicates.every(p => p(r)));
      if (order) data.sort((a, b) => (a[order.col] - b[order.col]) * (order.ascending ? 1 : -1));
      return { data: data.slice(from, to + 1), count: data.length, error: null };
    },
  };
  const deps = {
    LIST_PAGE_SIZE: 24, MAX_LIST_PAGES: 25,
    SORTS: { newest: { col: 'first_seen_at', ascending: false }, price_asc: { col: 'total_price', ascending: true }, price_desc: { col: 'total_price', ascending: false } },
    cardColsReady: async () => true, supabase: { from: () => query },
    isDisplayableDeal: () => true, isDisplayableSealedDeal: () => true,
    savingsClaimTrusted: () => false, withCard: r => r,
  };
  const run = new Function(...Object.keys(deps), source.slice(start, end) + '; return fetchDealsPageUncached;')(...Object.values(deps));
  return { calls, run: options => run({ table: 'deals', language: 'english', page: 1, ...options }) };
}
test('category dollar cap uses USD and excludes missing conversion', async () => {
  const h = harness();
  const result = await h.run({ maxPrice: 25 });
  assert.deepEqual(result.deals.map(r => r.id), [1]);
  assert.ok(h.calls.some(c => c[0] === 'lte' && c[1] === 'total_price_usd'));
});
test('category minimum and ascending order use the same USD basis', async () => {
  const h = harness();
  const result = await h.run({ minPrice: 10, sort: 'price_asc' });
  assert.deepEqual(result.deals.map(r => r.id), [1, 2]);
  assert.ok(h.calls.some(c => c[0] === 'gte' && c[1] === 'total_price_usd'));
  assert.ok(h.calls.some(c => c[0] === 'order' && c[1] === 'total_price_usd'));
});
test('category descending prices are comparable across currencies', async () => {
  const h = harness();
  assert.deepEqual((await h.run({ minPrice: 10, sort: 'price_desc' })).deals.map(r => r.id), [2, 1]);
});
test('ordinary category listing does not require a market comparison', async () => {
  const h = harness();
  assert.equal((await h.run({})).deals.length, 3);
  for (const category of Object.values(DEAL_CATEGORIES).filter(c => !c.redirect)) {
    assert.doesNotMatch(category.intro + category.description + category.title, /below.market|each deal is priced against/i);
  }
});
