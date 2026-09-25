// Finding 7 follow-up (2026-09-25) - the desktop rail's overflow band.
//
// The header's right edge sat at a FIXED 1122px whatever the viewport, so
// the page overflowed every width between lg (1024) and ~1137: +82px at
// 1040, +62px at 1060, +22px at 1100. Measured on production /methodology
// at real innerWidth, then re-measured clean at 1024/1040/1060/1100/1136
// after the tightening in lib/navLinks.js.
//
// WHAT THIS TEST CAN AND CANNOT DO. It cannot measure pixels - there is no
// layout engine here. What it pins is the thing that actually caused the
// regression: the band was measured for a rail of a PARTICULAR SIZE, and
// then /news added a ninth... eighth item, widening it, with nothing
// checking. So it pins the item count and the shared-constant wiring, and
// fails with an instruction to re-measure rather than silently allowing the
// band to reopen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const navLinks = read("lib/navLinks.js");
const siteHeader = read("components/SiteHeader.js");
const navDropdown = read("components/NavDropdown.js");

// The rail size the 1024-1279 tightening was measured against.
const MEASURED_RAIL_ITEMS = 8;

test("NR-1 the rail still has the number of items the band was measured for", () => {
  const block = navLinks.match(/export const NAV_RAIL = \[[\s\S]*?\n\];/);
  assert.ok(block, "NAV_RAIL not found");
  // count entries, ignoring comment lines
  const entries = block[0]
    .split("\n")
    .filter((l) => /^\s*(\{|fromPrimary\()/.test(l)).length;
  assert.equal(
    entries,
    MEASURED_RAIL_ITEMS,
    `The desktop rail now has ${entries} items, but the 1024-1279px tightening in ` +
      `lib/navLinks.js was measured against ${MEASURED_RAIL_ITEMS}. Adding or removing a ` +
      `destination changes the rail's natural width, which is what reopened this ` +
      `overflow band last time. Re-measure the header at innerWidth 1024/1040/1060/1100/1136 ` +
      `(scripts/integrity/auditSalesOrder.mjs shows the iframe technique: an iframe honours ` +
      `media queries at its own width, so no window resize is needed), adjust the RAIL_* ` +
      `constants until every width is clean, then update MEASURED_RAIL_ITEMS here.`
  );
});

test("NR-2 every rail-band constant both tightens at lg and restores at xl", () => {
  const names = [
    "RAIL_ITEM_TEXT",
    "RAIL_ITEM_PX",
    "RAIL_ITEM_PL",
    "RAIL_ITEM_PR",
    "RAIL_CHEVRON_PR",
    "RAIL_BAR_SPACING",
    "RAIL_UTILITY_GAP",
    "RAIL_SEARCH_SIZE",
  ];
  for (const name of names) {
    const m = navLinks.match(new RegExp(`export const ${name} = "([^"]*)"`));
    assert.ok(m, `${name} is not exported from lib/navLinks.js`);
    const value = m[1];
    assert.match(value, /\blg:/, `${name} must tighten inside the band (an lg: variant)`);
    assert.match(
      value,
      /\bxl:/,
      `${name} must RESTORE the roomier spacing from xl up (an xl: variant) - ` +
        `without it the cramped band spacing leaks onto every wide desktop`
    );
  }
});

test("NR-3 both rail renderers use the shared amounts, so they cannot drift", () => {
  // The defect class this guards: SiteHeader and NavDropdown each render
  // rail items with their own padding. Tightening one alone leaves the
  // other at its natural width and the band reopens.
  assert.match(siteHeader, /from "@\/lib\/navLinks"/, "SiteHeader must read the nav model");
  for (const c of ["RAIL_BAR_SPACING", "RAIL_ITEM_PX", "RAIL_ITEM_TEXT", "RAIL_UTILITY_GAP", "RAIL_SEARCH_SIZE"]) {
    assert.ok(siteHeader.includes(c), `SiteHeader must apply ${c}`);
  }
  assert.match(navDropdown, /from "@\/lib\/navLinks"/, "NavDropdown must read the shared amounts");
  for (const c of ["RAIL_ITEM_PL", "RAIL_ITEM_PR", "RAIL_CHEVRON_PR", "RAIL_ITEM_PX", "RAIL_ITEM_TEXT"]) {
    assert.ok(navDropdown.includes(c), `NavDropdown must apply ${c}`);
  }
});

test("NR-4 no rail item hard-codes a padding that the band cannot override", () => {
  // A bare `px-3` with no lg: companion on a rail item would win inside the
  // band and re-widen the rail. Every rail item's padding class list must
  // carry an lg: override alongside its base value.
  const railItemClassStrings = [...siteHeader.matchAll(/className=\{`([^`]*min-h-11[^`]*)`\}/g)].map((m) => m[1]);
  assert.ok(railItemClassStrings.length > 0, "expected at least one rail item class list in SiteHeader");
  for (const cls of railItemClassStrings) {
    if (!/(?:^|\s)px-\d/.test(cls)) continue;
    // The override may be a literal `lg:px-*` or arrive through the shared
    // constant - both are fine, a bare `px-3` with neither is not.
    const overridden = /lg:px-/.test(cls) || cls.includes("${RAIL_ITEM_PX}");
    assert.ok(
      overridden,
      `a rail item sets px-* with no lg: override and no RAIL_ITEM_PX: ${cls.slice(0, 90)}`
    );
  }
});

test("NR-5 the mobile menu still carries every rail destination", () => {
  // The band fix keeps the rail visible from 1024 up rather than moving it
  // to xl, so this is not load-bearing for the fix - but the menu remains
  // the only nav below 1024 and must not quietly lose a destination.
  const primary = navLinks.match(/export const NAV_PRIMARY = \[[\s\S]*?\n\];/);
  assert.ok(primary, "NAV_PRIMARY not found");
  for (const href of ["/deals", "/pokemon", "/sets", "/deals/graded", "/sealed-deals", "/market-data", "/guides", "/news"]) {
    assert.ok(primary[0].includes(`"${href}"`), `NAV_PRIMARY is missing ${href}`);
  }
});
