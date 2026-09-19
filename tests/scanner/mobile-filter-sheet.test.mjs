// 2026-09-19 growth brief §5 - below `lg` the filter panel is a bottom
// sheet with dialog semantics; the rows never leave the DOM; it never
// opens itself on load; every caller wires a Reset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const T = read("components/FilterToggle.js");

test("sheet semantics: dialog role only while the sheet is active, focus in, Tab trapped, Escape closes, opener refocused", () => {
  assert.match(T, /sheetActive \? \{ role: "dialog", "aria-modal": "true", "aria-label": label \} : \{\}/);
  assert.match(T, /closeRef\.current\?\.focus\(\)/);
  assert.match(T, /e\.key === "Escape"/);
  assert.match(T, /e\.key !== "Tab"/);
  assert.match(T, /opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(T, /document\.body\.style\.overflow = "hidden"/);
});

test("never opens itself: defaultOpen drives the inline (lg) layout only; the sheet state starts closed and the server snapshot is 'not desktop'", () => {
  assert.match(T, /useState\(defaultOpen\)/);
  assert.match(T, /const \[sheetOpen, setSheetOpen\] = useState\(false\)/);
  assert.match(T, /const getDesktopServer = \(\) => false/);
  assert.match(T, /useSyncExternalStore\(subscribeDesktop, getDesktop, getDesktopServer\)/);
});

test("rows stay in the DOM in both layouts (crawl-safe) and the chrome is hidden by attribute, never unmounted", () => {
  assert.doesNotMatch(T, /\{open && </);
  assert.doesNotMatch(T, /\{sheetActive && </);
  assert.match(T, /<div className=\{open \? "mt-4 block" : "hidden"\}>\{children\}<\/div>/);
  assert.match(T, /\$\{open \? "mt-4 block" : "hidden"\} lg:mt-0 lg:block/);
  assert.match(T, /hidden=\{!sheetActive\}/);
});

test("Reset + Show results, 48px targets, safe-area padding, one reduced-motion-aware slide", () => {
  assert.match(T, /Show results/);
  assert.match(T, /aria-label="Close filters"/);
  assert.match(T, /resetHref = null,\s*onReset = null,/);
  assert.match(T, /min-h-12 flex-1 items-center justify-center rounded-lg bg-zinc-900/);
  assert.match(T, /env\(safe-area-inset-bottom,0px\)/);
  assert.match(T, /motion-safe:animate-sheet-in/);
  const css = read("app/globals.css");
  assert.match(css, /--animate-sheet-in: sheet-in 180ms ease-out;/);
  assert.match(css, /@keyframes sheet-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}animation-duration: 0\.01ms !important/);
});

test("every caller provides a Reset: href on server grids, handler on client URL-state grids", () => {
  const bar = read("components/FilterBar.js");
  assert.match(bar, /resetHref=\{withoutParams\(params, \["country", "type", "grader", "grade", "listing", "ending", "maxPrice", "minPrice", "sort", "q"\], basePath\)\}/);
  assert.match(read("components/CardDealFilters.js"), /<FilterToggle defaultOpen=\{activeCount > 0\} activeCount=\{activeCount\} onReset=\{clearFacets\}>/);
  assert.match(read("app/search/SearchClient.js"), /<FilterToggle defaultOpen=\{activeCount > 0\} activeCount=\{activeCount\} collapsible label="Refine deals" onReset=\{onClear\}>/);
});
