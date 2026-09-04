// Phase 13B.7.1 - mobile QA guards for the core collector discovery
// journey (Home -> Search -> Refine -> Deal/Card -> Marketplace).
//
// The harness for this phase could not emulate a 375/390/430 viewport,
// so these are STRUCTURAL regressions that lock in the fixes and the
// established mobile patterns - not pixel assertions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const CORE = [
  "app/search/SearchClient.js",
  "components/DealCard.js",
  "components/FilterBar.js",
  "components/CardDealFilters.js",
  "components/DealFilterChips.js",
  "components/DealGrid.js",
  "components/SiteHeader.js",
  "components/HeroSearch.js",
  "components/FilterToggle.js",
];

// ===== iOS Safari input auto-zoom (fixed in 13B.7.1) ==============
// WebKit zooms the viewport when a form control with computed
// font-size < 16px is focused. Every <input>/<select> in a client
// discovery component must be >= 16px on mobile (text-base), optionally
// stepping down at sm+ (sm:text-sm / sm:text-xs).

test("search / card / filter form controls are >= 16px on mobile (no iOS auto-zoom)", () => {
  // The pre-13B.7.1 form-control classes (rounded input/select at a
  // sub-16px mobile font) must not reappear; the fixed form is a
  // `text-base` mobile base with an optional `sm:` step-down.
  const BAD = [
    /rounded-lg border border-zinc-300 (?:bg-white )?px-2 py-1\.5 text-sm dark:/, // block select
    /px-3 py-1\.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950/, //     pill select
    /px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100/, // catalogue toolbar
    /px-4 py-2\.5 text-sm outline-none/, //                                          search input
  ];
  for (const f of [
    "app/search/SearchClient.js",
    "components/CardDealFilters.js",
    "components/CatalogueBrowser.js",
  ]) {
    const src = read(f);
    for (const re of BAD) {
      assert.ok(!re.test(src), `${f}: a form control still uses a sub-16px mobile font (iOS auto-zoom): ${re}`);
    }
    assert.match(src, /text-base sm:text-(sm|xs)|text-base font-medium sm:text-xs/, `${f}: expected the mobile-16 control class`);
  }
  // the homepage hero is the reference - already 16px
  assert.match(read("components/HeroSearch.js"), /py-3\.5 pl-11 pr-4 text-base/);
});

// ===== horizontal-overflow patterns =============================

test("no core discovery component uses a full-viewport-width container", () => {
  for (const f of CORE) {
    const src = read(f);
    assert.ok(!/\bw-screen\b/.test(src), `${f}: w-screen can overflow a mobile viewport`);
    assert.ok(!/\bw-\[100vw\]/.test(src), `${f}: w-[100vw] can overflow`);
    assert.ok(!/\bmin-w-\[\d{3,}px\]/.test(src), `${f}: a >=100px hard min-width on a flex child overflows narrow screens`);
  }
});

test("filter-pill rows pair non-shrinking pills with a horizontal scroller", () => {
  // components that render `shrink-0 whitespace-nowrap` pills must ALSO
  // contain `overflow-x-auto` (the pill row scrolls in its own box) or
  // `flex-wrap` - never a bare flex row that pushes the page wide.
  for (const f of ["app/search/SearchClient.js", "components/FilterBar.js", "components/CardDealFilters.js"]) {
    const src = read(f);
    if (!/shrink-0[^"]*whitespace-nowrap|whitespace-nowrap[^"]*shrink-0/.test(src)) continue;
    assert.ok(
      /overflow-x-auto/.test(src),
      `${f}: has non-shrinking pills but no overflow-x-auto scroller`
    );
  }
});

test("the search results + catalogue grids collapse to 1-2 columns on mobile", () => {
  const src = read("app/search/SearchClient.js");
  // deal grid: grid-cols-1 base
  assert.match(src, /grid-cols-1[^"]*sm:grid-cols-2/, "deal grid should be 1-up on mobile");
  // catalogue grid: grid-cols-2 base
  assert.match(src, /grid-cols-2[^"]*sm:grid-cols-3/, "catalogue grid should be 2-up on mobile");
});

// ===== touch targets (WCAG 2.5.8, 24px min) ======================

test("the mobile Filters toggle is a real tap target", () => {
  const src = read("components/FilterToggle.js");
  assert.match(src, /min-h-\[44px\]|min-h-\[24px\]|py-[23]\b/, "Filters toggle needs a >=24px tap target");
});

// ===== sticky mobile CTA must not bury the footer (§14) ==========

test("pages with a fixed mobile deal CTA reserve bottom space for it", () => {
  for (const f of ["app/cards/[slug]/page.js", "app/deals/[id]/page.js"]) {
    const src = read(f);
    assert.match(src, /StickyDealCta/);
    assert.match(
      src,
      /h-1[26] lg:hidden|pb-\[?\d\d/,
      `${f}: needs a bottom spacer so StickyDealCta doesn't cover the footer`
    );
  }
});

// ===== DealCard identity legibility (§10/§11) ====================

test("DealCard keeps a long name/set on one truncated line (no wrap overflow)", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /truncate[^"]*text-\[15px\][^"]*font-semibold/, "card name should truncate");
  assert.match(src, /truncate text-xs text-zinc-500/, "set + condition line should truncate");
});

test("DealCard distinguishes auction from BIN and never strikes the auction ref", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /isAuction \? "" : "line-through"/, "auction market ref must not be struck through");
  assert.match(src, /Current bid ·/, "auction shows a 'Current bid' label");
});

test("DealCard image reserves space (no CLS)", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /aspect-square w-full/, "deal image needs a reserved aspect box");
});
