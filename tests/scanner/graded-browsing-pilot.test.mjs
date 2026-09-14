// Graded browsing pilot - the bounded phase starting dedicated deal
// browsing with graded cards. Covers the three fixes the r6-category-
// currency.test.mjs harness can't reach (it tests fetchDealsPageUncached
// directly, not the route that calls it) plus the FilterBar contradictory-
// control removal and locked-type/search wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const src = (file) => readFileSync(resolve(root, file), 'utf8');

test('/api/deals-page category branch: grader/grade now reach fetchDealsPage (source)', () => {
  const route = src('app/api/deals-page/route.js');
  // Before this phase, gradedFilters was computed but only ever spread
  // into the set/species/card branches - the category branch's
  // userOverlay loop never included grader/grade at all, so /deals/graded
  // had no way to narrow by grader or grade even with a UI for it.
  assert.match(route, /if \(gradedFilters\.grader != null\) userOverlay\.grader = gradedFilters\.grader;/);
  assert.match(route, /if \(gradedFilters\.grade != null\) userOverlay\.grade = gradedFilters\.grade;/);
});

test('/api/deals-page category branch: search (q) reaches fetchDealsPage (source)', () => {
  const route = src('app/api/deals-page/route.js');
  assert.match(route, /const q = u\.searchParams\.get\("q"\);/);
  assert.match(route, /if \(q != null\) userOverlay\.q = q;/);
});

test('/api/deals-page category branch: an explicit sort (including "newest") is always honoured', () => {
  const route = src('app/api/deals-page/route.js');
  // The old form (`userSort && userSort !== "newest" ? userSort : cat.defaultSort`)
  // silently coerced an explicit ?sort=newest back to the category's own
  // default sort - e.g. /deals/auctions?sort=newest would render sorted
  // by "ending" instead, because "newest" also happens to be the
  // category-agnostic fallback value and the old check couldn't tell
  // "the visitor picked newest" apart from "no sort param at all".
  assert.match(route, /sort: userSort \?\? cat\.defaultSort \?\? "newest",/);
  assert.doesNotMatch(route, /userSort && userSort !== "newest"/, 'the old silent-coercion form must be gone, not shadowed');
});

test('lib/deals.js fetchDealsPageUncached: grader/grade/q parameters exist and use the shared planDealFilters contract', () => {
  const deals = src('lib/deals.js');
  assert.match(deals, /async function fetchDealsPageUncached\(\{[\s\S]{0,200}grader,[\s\S]{0,50}grade,/);
  assert.match(deals, /const plan = planDealFilters\(\{ type: cardType, grader, grade, listing: listingType, minPrice, maxPrice \}\);/);
  assert.doesNotMatch(deals, /if \(cardType === "raw"\) base = base\.eq\("is_graded", false\);/, 'the old hand-rolled cardType-only block must be replaced, not left alongside the shared contract');
});

test('lib/deals.js fetchDealsPageUncached: search never invokes a paid provider (source) - a plain ILIKE, gated at 2 characters', () => {
  const deals = src('lib/deals.js');
  assert.match(deals, /if \(typeof q === "string" && q\.trim\(\)\.length >= 2\) base = base\.ilike\("title", `%\$\{q\.trim\(\)\}%`\);/);
});

test('FilterBar: a locked category type never renders the contradictory Raw/Graded toggle', () => {
  const bar = src('components/FilterBar.js');
  assert.match(bar, /lockedCardType = null,/);
  assert.match(bar, /\{lockedCardType \? \(/);
  assert.match(bar, /Graded cards only/);
  // The Raw pill (typeFilterHref\/filterHref to "raw") must be reachable
  // only in the non-locked branch - i.e. it exists in the file (used by
  // species/set pages) but is not unconditional the way it was before.
  assert.match(bar, /typeFilterHref\(params, "raw", basePath\)/);
});

test('FilterBar: a locked cardType does not inflate the active-filter count or force the panel open', () => {
  const bar = src('components/FilterBar.js');
  assert.match(bar, /lockedCardType \? null : cardType,/);
});

test('FilterBar: SearchWithinRow is a plain GET form (no client JS) and carries other params as hidden inputs', () => {
  const bar = src('components/FilterBar.js');
  assert.match(bar, /export function SearchWithinRow/);
  assert.match(bar, /<form method="get" action=\{basePath\}/);
  assert.match(bar, /carried\.map\(\(\[k, v\]\) => \(/);
  assert.doesNotMatch(bar, /onSubmit=/, 'the search form must be a plain navigation, not a client-side handler');
});

test('CountryFilterRow: relabelled to distinguish listing marketplace from delivery/shipping region', () => {
  const bar = src('components/FilterBar.js');
  assert.match(bar, /Listing marketplace/);
  assert.doesNotMatch(bar, />Country<\/span>/, 'the old bare "Country" label (easily read as delivery/shipping) must be gone');
  assert.match(bar, /not where it ships/i);
});

test('DealCategoryPage: lockedCardType is derived from the category preset, not hardcoded to "graded" alone', () => {
  const page = src('components/DealCategoryPage.js');
  assert.match(page, /lockedCardType=\{cat\.filter\?\.cardType \?\? null\}/);
});

// All deals r1 (2026-09-14): /deals (kind "all") joins the pilot's full
// contract. Other categories stay on the plain FilterBar.
test('DealGrid: showGrading and searchable are scoped to the graded category and All deals only (not a category-wide rollout)', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /const allDeals = kind === "all";/);
  assert.match(grid, /const showGrading = allDeals \|\| kind === "species" \|\| kind === "set" \|\| \(kind === "category" && slug === "graded"\);/);
  assert.match(grid, /const searchable = allDeals \|\| \(kind === "category" && slug === "graded"\);/);
});

test('DealGrid: q is part of the isDefault computation, so a search term correctly triggers the client-side fetch', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /p\.isDefault = p\.page === 1 && !p\.country && !p\.sort && !p\.q && !dealFilterActive;/);
});

test('DealFilterChips: AppliedFilters/FilteredEmptyState search-chip support is additive (opt-in), not a behaviour change for existing callers', () => {
  const chips = src('components/DealFilterChips.js');
  assert.match(chips, /export function AppliedFilters\(\{ params, basePath, resultCount, totalCount, searchQuery \}\)/);
  assert.match(chips, /export function FilteredEmptyState\(\{ params, basePath, subjectLabel, searchQuery \}\)/);
  // "Clear all" must drop q too when a search is active, or it re-lands on
  // the same empty state.
  assert.match(chips, /clearAll\.drop = \[\.\.\.clearAll\.drop, "q"\];/);
});

test('DealFilterChips: the match-count label distinguishes a displayed page from the total matching count', () => {
  const chips = src('components/DealFilterChips.js');
  // A single-page result (totalCount not greater than what's shown) keeps
  // the old plain wording - this must not change for every existing
  // species/set caller, which never passes totalCount at all.
  assert.match(chips, /\$\{resultCount\} match\$\{resultCount === 1 \? "" : "es"\}/);
  // Only once totalCount is a number AND genuinely exceeds resultCount
  // does the label switch to the disambiguating "Showing X of Y" form -
  // review finding (2026-09-14): resultCount alone is a displayed count,
  // not proof that's every matching row.
  assert.match(chips, /totalCount > resultCount/);
  assert.match(chips, /Showing \$\{resultCount\} of \$\{totalCount\} match/);
});

test('search-within honesty: the form is JS-only (a <noscript> fallback replaces it, never claims a working no-JS search)', () => {
  const bar = src('components/FilterBar.js');
  // Review finding (2026-09-14): submitting the plain GET form without JS
  // is real (a genuine navigation), but the result is never actually
  // filtered without JS (this whole grid is client-fetched) and the
  // form's own hidden inputs - built from this component's always-empty
  // SSR snapshot - drop every other active param on that submission. The
  // fix is not to fake server-side filtering; it is to stop presenting an
  // apparently-working control that cannot deliver.
  assert.match(bar, /<noscript>/);
  assert.match(bar, /requires JavaScript/i);
  assert.match(bar, /pdf-search-within/);
  assert.match(bar, /display:none!important/);
});

test('the graded category preset itself is unchanged by this phase - filters narrow within it, they do not loosen it', () => {
  const cats = src('lib/dealCategories.js');
  assert.match(cats, /graded:\s*\{\s*filter:\s*\{\s*cardType:\s*"graded"\s*\}/);
});

test('cold-navigation guard: scoped to the graded pilot and All deals only, same pattern as showGrading/searchable', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /const guardColdNav = allDeals \|\| \(kind === "category" && slug === "graded"\);/);
});

test('cold-navigation guard: the pre-hydration script only hides results when the URL actually carries a filter/sort/search/page param', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /var keys=\['country','type','grader','grade','listing','minPrice','maxPrice','q','sort'\];/);
  assert.match(grid, /hasFilter=keys\.some/);
  assert.match(grid, /if\(!hasFilter\)return;/);
});

test('cold-navigation guard: a fail-safe explains a stalled load and offers a real retry - it must NOT silently reveal the unfiltered default as if it matched the selection', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /setTimeout\(function\(\)\{/);
  // Review closure (2026-09-14): the original fail-safe did exactly the
  // thing this whole guard exists to prevent - it un-hid wrap (the
  // unfiltered default) unconditionally after 8s with no indication it
  // doesn't match the current filter. Confirmed live: a delayed-past-8s
  // load showed the full unfiltered set, unlabelled, for 2+ seconds
  // before hydration corrected it; a permanently blocked load showed it
  // forever. Corrected to leave wrap hidden and instead replace the
  // placeholder's own content with an accessible status message and a
  // real reload link to the exact current (filtered) URL.
  assert.doesNotMatch(grid, /if\(wrap&&wrap\.hidden\)wrap\.hidden=false;/, 'must not unconditionally reveal the unfiltered default on timeout');
  assert.match(grid, /role="status"/);
  assert.match(grid, /taking longer than expected/i);
  assert.match(grid, /href="'\+location\.href\+'"/, 'the retry link must point at the real current URL, not a generic path');
  assert.match(grid, /Reload the page/i);
});

test('cold-navigation guard: DealGrid itself hands off to its own rendering the instant it mounts, regardless of fetch outcome', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /useEffect\(\(\) => \{\s*if \(!guardColdNav\) return;\s*const wrap = document\.getElementById\("pdf-grid-wrap"\);/);
  assert.match(grid, /if \(wrap\) wrap\.hidden = false;/);
  assert.match(grid, /if \(placeholder\) placeholder\.hidden = true;/);
});

test('cold-navigation guard: a no-JS visitor sees the real default content, never a stuck loading message (the script that would hide it never runs)', () => {
  const grid = src('components/DealGrid.js');
  assert.match(grid, /<noscript>/);
  assert.match(grid, /#pdf-grid-loading\{display:none!important\}/);
});

test('GridSkeleton is a shared, exported component - DealGrid and the pre-hydration placeholder render identical markup, not a hand-duplicated copy', () => {
  const skeleton = src('components/GridSkeleton.js');
  assert.doesNotMatch(skeleton, /"use client"/, 'must be plain presentational markup, importable from a server component too');
  assert.match(skeleton, /export default function GridSkeleton/);
  const grid = src('components/DealGrid.js');
  assert.match(grid, /import GridSkeleton from "@\/components\/GridSkeleton";/);
  assert.doesNotMatch(grid, /function GridSkeleton\(/, 'the old local definition must be gone, not shadowed');
});
