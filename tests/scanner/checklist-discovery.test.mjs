// Checklist discovery (2026-09-14): "All sets" / "Collection checklists"
// views on the existing /sets directory, an "Open checklist" action on
// eligible set tiles, and a menu entry. Eligibility is the set page's own
// rule; nothing about the checklist itself changes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checklistEligible, checklistIdentityCheck, CHECKLIST_SETS } from "../../lib/setChecklist.js";
import { NAV_PRIMARY } from "../../lib/navLinks.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(REPO, p), "utf8");
const card = (n, extra = {}) => ({ name: `Card ${n}`, cardNumber: `${n}/64`, catalogSlug: `card-${n}-jungle`, ...extra });
const clean = Array.from({ length: 8 }, (_, i) => card(i + 1));

test("CD-1. checklistEligible = allowlist AND identity guard AND not browse-capped", () => {
  assert.equal(checklistEligible({ setName: "Jungle", cards: clean, truncated: false }), true);
  assert.equal(checklistEligible({ setName: "EX Legend Maker", cards: clean, truncated: false }), false, "not allowlisted -> ordinary card index");
  assert.equal(checklistEligible({ setName: "XY Promos", cards: clean, truncated: false }), false);
  assert.equal(checklistEligible({ setName: "Jungle", cards: clean, truncated: true }), false, "browse-capped payload");
  const dup = [...clean, card(3)];
  assert.equal(checklistIdentityCheck(dup).ok, false);
  assert.equal(checklistEligible({ setName: "Jungle", cards: dup, truncated: false }), false, "identity guard failure -> not advertised");
  assert.equal(checklistEligible({ setName: "Jungle", cards: [], truncated: false }), false);
  assert.ok(CHECKLIST_SETS.includes("Jungle"));
});

test("CD-2. the helper is the same three-part rule the set page applies (page expression unchanged)", () => {
  const lib = src("lib/setChecklist.js");
  assert.match(lib, /export function checklistEligible\(\{ setName, cards, truncated \}\) \{\s*return !truncated && isChecklistSet\(setName\) && checklistIdentityCheck\(cards\)\.ok;\s*\}/);
  const page = src("app/sets/[slug]/page.js");
  assert.match(page, /!catalogTruncated && isChecklistSet\(resolved\.set\) && checklistIdentityCheck\(catalogCards\)\.ok/);
  assert.match(page, /const showCatalog = catalogueOnly \|\| catalogCards\.length >= SET_CATALOG_MIN_CARDS;/);
  assert.match(page, /<section id="inventory"/, "the Open checklist target still exists");
});

test("CD-3. /sets confirms each allowlisted set with the page rule on the same cached catalogue, and stays static", () => {
  const page = src("app/sets/page.js");
  assert.match(page, /\.filter\(\(s\) => isChecklistSet\(s\.set\)\)/);
  assert.match(page, /await fetchSetCatalog\(s\.set, "english"\)/);
  assert.match(page, /checklistEligible\(\{ setName: s\.set, cards, truncated \}\) && \(cards\?\.length \?\? 0\) >= SET_CATALOG_MIN_CARDS/);
  assert.match(page, /export const revalidate = 3600;/);
  assert.doesNotMatch(page, /searchParams|cookies\(|headers\(/, "no request-time API: the directory stays ISR");
  assert.match(page, /alternates: \{ canonical: "\/sets" \}/);
});

test("CD-4. two views: tabs are hash links, panes switch by CSS :target, one short explanation", () => {
  const page = src("app/sets/page.js");
  assert.match(page, /<a href="#all-sets" data-sets-tab="all"[^>]*>All sets<\/a>/);
  assert.match(page, /<a href="#collection-checklists" data-sets-tab="checklists"[^>]*>Collection checklists<\/a>/);
  assert.match(page, /<section id="all-sets" data-sets-pane="all"/);
  assert.match(page, /<section id="collection-checklists" data-sets-pane="checklists"/);
  assert.match(page, /<SetsFilterList sets=\{sets\} checklistSlugs=\{checklistSlugs\} \/>/);
  assert.match(page, /<SetsFilterList sets=\{checklistSets\} checklistSlugs=\{checklistSlugs\} filter=\{false\} \/>/);
  const explanation = "Mark what you own, see what’s missing and print your checklist. Progress is saved on this device.";
  assert.equal(page.split(explanation).length - 1, 1, "exactly one explanation");
  const css = src("app/globals.css");
  assert.match(css, /\[data-sets-pane="checklists"\] \{ display: none; \}/);
  assert.match(css, /\[data-sets-views\]:has\(#collection-checklists:target\) \[data-sets-pane="checklists"\] \{ display: block; \}/);
  assert.match(css, /\[data-sets-views\]:has\(#collection-checklists:target\) \[data-sets-pane="all"\] \{ display: none; \}/);
});

test("CD-5. only eligible tiles get Open checklist, as a sibling link to the set page's #inventory; set links unchanged", () => {
  const list = src("components/SetsFilterList.js");
  assert.match(list, /href=\{`\/sets\/\$\{s\.slug\}`\}/, "set URL unchanged");
  assert.match(list, /if \(!checklistSlugs\.includes\(s\.slug\)\) return tile;/);
  assert.match(list, /href=\{`\/sets\/\$\{s\.slug\}#inventory`\}/);
  assert.match(list, />\s*Open checklist\s*<\/Link>/);
  assert.equal((list.match(/Open checklist/g) || []).length, 2, "label + aria-label only");
});

test("CD-6. the Cards & Sets group carries a clean Collection checklists link; the existing entry stays", () => {
  const cat = NAV_PRIMARY.filter((l) => l.group === "catalogue");
  const i = cat.findIndex((l) => l.href === "/sets");
  assert.ok(i >= 0 && cat[i].label === "Sets & Checklists");
  assert.deepEqual(cat[i + 1], { href: "/sets#collection-checklists", label: "Collection checklists", group: "catalogue" });
  assert.ok(!cat[i + 1].href.includes("?"));
  assert.ok(!cat[i + 1].menuShortcut, "not a new shortcut tile - the menu layout is unchanged");
});

test("CD-7. checklist storage and components are untouched by this change", () => {
  for (const f of ["components/SetChecklist.js", "lib/checklistStorage.js"]) {
    const s = src(f);
    assert.doesNotMatch(s, /collection-checklists|checklistEligible/, `${f} not modified for discovery`);
  }
});
