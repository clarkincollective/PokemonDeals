import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEAL_CATEGORIES } from '../../lib/dealCategories.js';
import { planDealFilters } from '../../lib/dealFilters.js';

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
  // Graded browsing pilot fixtures: fetchDealsPageUncached previously had
  // no grader/grade support at all for category pages (only the plain
  // raw/graded boolean via cardType) - these exercise the real
  // planDealFilters-driven eq() calls this phase added.
  { id: 4, is_active: true, card_language: 'english', total_price: 100, total_price_usd: 100, is_graded: true, grader: 'PSA', grade: '10' },
  { id: 5, is_active: true, card_language: 'english', total_price: 90, total_price_usd: 90, is_graded: true, grader: 'PSA', grade: '9' },
  { id: 6, is_active: true, card_language: 'english', total_price: 80, total_price_usd: 80, is_graded: true, grader: 'CGC', grade: '10' },
  { id: 7, is_active: true, card_language: 'english', total_price: 30, total_price_usd: 30, is_graded: false, title: 'Charizard Base Set Holo' },
];
// Isolated fixture for the dedup-key test only, kept separate from `rows`
// so it never perturbs the price-sort tests' hardcoded expectations. Same
// card (shared card_tcgplayer_id), two different grades - two distinct
// listings a collector would compare, not duplicates - plus a true
// duplicate (same card AND same grade) that must still collapse to one.
const dedupRows = [
  { id: 8, is_active: true, card_language: 'english', card_tcgplayer_id: 'dup-card', total_price: 1000, total_price_usd: 1000, is_graded: true, grader: 'PSA', grade: '10' },
  { id: 9, is_active: true, card_language: 'english', card_tcgplayer_id: 'dup-card', total_price: 600, total_price_usd: 600, is_graded: true, grader: 'PSA', grade: '9' },
  { id: 10, is_active: true, card_language: 'english', card_tcgplayer_id: 'dup-card', total_price: 1000, total_price_usd: 1000, is_graded: true, grader: 'PSA', grade: '10' },
];
function harness(rowSet = rows) {
  const calls = [], predicates = [];
  let order;
  const query = {
    select() { return query; },
    eq(col, value) { calls.push(['eq', col, value]); predicates.push(r => r[col] === value); return query; },
    lte(col, value) { calls.push(['lte', col, value]); predicates.push(r => r[col] != null && r[col] <= value); return query; },
    gte(col, value) { calls.push(['gte', col, value]); predicates.push(r => r[col] != null && r[col] >= value); return query; },
    ilike(col, pattern) {
      calls.push(['ilike', col, pattern]);
      const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
      predicates.push(r => typeof r[col] === 'string' && r[col].toLowerCase().includes(needle));
      return query;
    },
    order(col, opts) { order = { col, ...opts }; calls.push(['order', col]); return query; },
    async range(from, to) {
      const data = rowSet.filter(r => predicates.every(p => p(r)));
      if (order) data.sort((a, b) => {
        const nullsFirst = order.nullsFirst ?? !order.ascending;
        if (a[order.col] == null) return b[order.col] == null ? 0 : nullsFirst ? -1 : 1;
        if (b[order.col] == null) return nullsFirst ? 1 : -1;
        return (a[order.col] - b[order.col]) * (order.ascending ? 1 : -1);
      });
      return { data: data.slice(from, to + 1), count: data.length, error: null };
    },
  };
  const deps = {
    LIST_PAGE_SIZE: 24, MAX_LIST_PAGES: 25,
    SORTS: { newest: { col: 'first_seen_at', ascending: false }, price_asc: { col: 'total_price', ascending: true }, price_desc: { col: 'total_price', ascending: false } },
    cardColsReady: async () => true, supabase: { from: () => { calls.push(['from']); return query; } },
    isDisplayableDeal: () => true, isDisplayableSealedDeal: () => true,
    savingsClaimTrusted: () => false, withCard: r => r,
    planDealFilters,
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
  assert.deepEqual(result.deals.map(r => r.id), [1, 7, 2, 6, 5, 4]);
  assert.ok(h.calls.some(c => c[0] === 'gte' && c[1] === 'total_price_usd'));
  assert.ok(h.calls.some(c => c[0] === 'order' && c[1] === 'total_price_usd'));
});
test('category descending prices are comparable across currencies', async () => {
  const h = harness();
  assert.deepEqual((await h.run({ minPrice: 10, sort: 'price_desc' })).deals.map(r => r.id), [4, 5, 6, 2, 7, 1]);
});
test('unknown USD totals sort after known prices in both directions', async () => {
  assert.deepEqual((await harness().run({ sort: 'price_desc' })).deals.map(r => r.id), [4, 5, 6, 2, 7, 1, 3]);
  assert.deepEqual((await harness().run({ sort: 'price_asc' })).deals.map(r => r.id), [1, 7, 2, 6, 5, 4, 3]);
});
test('ordinary category listing does not require a market comparison', async () => {
  const h = harness();
  assert.equal((await h.run({})).deals.length, rows.length);
  for (const category of Object.values(DEAL_CATEGORIES).filter(c => !c.redirect)) {
    assert.doesNotMatch(category.intro + category.description + category.title, /below.market|each deal is priced against/i);
  }
});
test('category grader filter narrows to that grader only (real planDealFilters query plan)', async () => {
  const h = harness();
  const result = await h.run({ cardType: 'graded', grader: 'PSA' });
  assert.deepEqual(result.deals.map(r => r.id).sort(), [4, 5]);
  assert.ok(h.calls.some(c => c[0] === 'eq' && c[1] === 'grader' && c[2] === 'PSA'));
});
test('category grade filter narrows within a grader (grader + grade combine, not OR)', async () => {
  const h = harness();
  const result = await h.run({ cardType: 'graded', grader: 'PSA', grade: '10' });
  assert.deepEqual(result.deals.map(r => r.id), [4]);
});
test('a grader alone (no explicit cardType) still implies graded, via the shared planDealFilters contract', async () => {
  // This is the exact dependency contract lib/dealFilters.js documents:
  // "grader + grade are DEPENDENT on graded". Before this phase, category
  // pages had no grader/grade support at all, so this combination could
  // never even be tested end to end for /deals/graded.
  const h = harness();
  const result = await h.run({ grader: 'CGC' });
  assert.deepEqual(result.deals.map(r => r.id), [6]);
});
test('raw stays raw: a graded-only grader/grade filter never leaks a non-graded row', async () => {
  const h = harness();
  const result = await h.run({ cardType: 'graded' });
  assert.deepEqual(result.deals.map(r => r.id).sort(), [4, 5, 6]);
  assert.ok(!result.deals.some(r => r.id === 7), 'row 7 (is_graded:false) must never appear in a graded-scoped result');
});
test('search (q) is an ILIKE on the stored title - real substring match, case-insensitive', async () => {
  const h = harness();
  const result = await h.run({ q: 'charizard' });
  assert.deepEqual(result.deals.map(r => r.id), [7]);
  assert.ok(h.calls.some(c => c[0] === 'ilike' && c[1] === 'title'));
});
test('search (q) is ignored below 2 characters - never reaches the database as a filter', async () => {
  const h = harness();
  const short = await h.run({ q: 'a' });
  assert.equal(h.calls.some(c => c[0] === 'ilike'), false, 'a 1-character query must not reach the database as a filter');
  assert.equal(short.deals.length, rows.length, 'a too-short query must not narrow the result at all');
});
test('dedup: different grades of the same card are distinct tiles, but a true duplicate (same card + same grade) still collapses to one', async () => {
  const result = await harness(dedupRows).run({ cardType: 'graded' });
  const byGrade = Object.fromEntries(result.deals.map((d) => [d.grade, d.id]));
  assert.equal(result.deals.length, 2, `expected exactly 2 tiles (PSA 9 and PSA 10 of the same card), got ${result.deals.length}`);
  assert.equal(byGrade['9'], 9, 'the PSA 9 listing must survive dedup');
  assert.ok(byGrade['10'] === 8 || byGrade['10'] === 10, 'exactly one of the two identical PSA 10 listings (8, 10) must survive - whichever sorts first');
});
test('an empty category set scope returns no rows without a database query', async () => {
  const h = harness();
  assert.deepEqual(await h.run({ sets: [] }), { deals: [], totalPages: 1, error: null });
  assert.deepEqual(h.calls, []);
});
