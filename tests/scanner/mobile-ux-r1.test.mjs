// Mobile UX refinement r1 (2026-09-14): menu, Charizard species page, EX
// Legend Maker set page and the condition-guide homepage thumbnail. Pure
// helpers are exercised directly; component contracts by source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cardNameWithoutNumber, cardDisplayName } from "../../lib/cardName.js";
import { NAV_PRIMARY, NAV_GROUPS, NAV_LEARN, NAV_SEARCH } from "../../lib/navLinks.js";
import { GUIDE_CARDS } from "../../lib/guideLinks.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(REPO, p), "utf8");
const saved = JSON.parse(src("tests/browser/r3/runtime/saved-catalogue.json"));

// --- collector number shown once -------------------------------------

test("MUX-1. an embedded collector number equal to cardNumber is removed; qualifiers stay verbatim", () => {
  const cases = [
    ["Charizard VMAX - 020/189", "020/189", "Charizard VMAX"],
    ["Charizard - SWSH066 (Prerelease) [Staff]", "SWSH066", "Charizard (Prerelease) [Staff]"],
    ["Charizard - 4/102 (CoroCoro Promo)", "004/102", "Charizard (CoroCoro Promo)"],
    ["Charizard G LV.X - DP45", "DP45", "Charizard G LV.X"],
    ["M Charizard EX - 13/106 (Form Y)", "013/106", "M Charizard EX (Form Y)"],
    ["Charizard GX - 9/68 (#60 Charizard Stamped)", "009/068", "Charizard GX (#60 Charizard Stamped)"],
    ["Charizard - 143/S-P (Grand Prix)", "143/S-P", "Charizard (Grand Prix)"],
    ["Charizard ex -196", "196", "Charizard ex"],
    ["Dragonite 149/165 (Cosmos Holo)", "149/165", "Dragonite (Cosmos Holo)"],
    ["Dark Charizard (4)", "04/82", "Dark Charizard"],
  ];
  for (const [name, cardNumber, expected] of cases) {
    assert.equal(cardNameWithoutNumber({ name, cardNumber }), expected, name);
  }
});

test("MUX-2. a DIFFERENT number, or no structured number, is never removed", () => {
  assert.equal(cardNameWithoutNumber({ name: "Mewtwo - 10/102", cardNumber: "11/102" }), "Mewtwo - 10/102");
  assert.equal(cardNameWithoutNumber({ name: "Pikachu 25th Anniversary", cardNumber: "25" }), "Pikachu 25th Anniversary");
  assert.equal(cardNameWithoutNumber({ name: "Charizard VMAX - 020/189" }), "Charizard VMAX - 020/189");
  for (const name of ["Charizard (Delta Species)", "M Charizard EX (X) (Secret)", "Charizard V (Alternate Full Art)", "Charizard (Celebrations Metal Card)"]) {
    assert.equal(cardNameWithoutNumber({ name, cardNumber: "1/2" }), cardDisplayName({ name }), name);
  }
});

test("MUX-3. across every captured fixture catalogue name: no name still repeats its own number, no qualifier is lost", () => {
  const norm = (s) => String(s).toLowerCase().split("/").map((p) => p.replace(/^([a-z]*)0+(?=\d)/, "$1")).join("/");
  let checked = 0;
  for (const cards of Object.values(saved)) {
    for (const c of cards) {
      checked++;
      const out = cardNameWithoutNumber(c);
      if (c.cardNumber) assert.ok(!out.split(/[\s#-]+/).map(norm).includes(norm(c.cardNumber)), `${c.name} -> ${out}`);
      for (const q of c.name.match(/\([^)]*[A-Za-z][^)]*\)|\[[^\]]+\]/g) || []) assert.ok(out.includes(q), `${c.name} lost ${q}`);
    }
  }
  assert.ok(checked > 400, `expected the captured catalogues, checked ${checked}`);
  assert.equal(saved.Charizard.length, 153);
  assert.equal(saved["EX Legend Maker"].length, 93);
});

// --- mobile menu -----------------------------------------------------

test("MUX-4. the mobile menu keeps every destination it had: shortcuts + groups + search + learn", () => {
  const menu = src("components/NavMenu.js");
  const shortcuts = NAV_PRIMARY.filter((l) => l.menuShortcut).map((l) => l.href);
  assert.deepEqual(shortcuts, ["/deals", "/best-finds", "/deals/auctions", "/deals/graded", "/deals/under-25", "/latest-releases"]);
  const grouped = NAV_GROUPS.flatMap((g) => NAV_PRIMARY.filter((l) => l.group === g.id && !l.menuShortcut).map((l) => l.href));
  const learn = [...NAV_PRIMARY.filter((l) => l.group == null).map((l) => l.href), ...NAV_LEARN.map((l) => l.href)];
  const reachable = new Set([...shortcuts, ...grouped, ...learn, NAV_SEARCH.href]);
  for (const l of [...NAV_PRIMARY, ...NAV_LEARN, NAV_SEARCH]) assert.ok(reachable.has(l.href), `menu lost ${l.href}`);
  assert.match(menu, /href=\{NAV_SEARCH\.href\}/);
  assert.match(menu, /links: \[\.\.\.NAV_PRIMARY\.filter\(\(link\) => link\.group == null\), \.\.\.NAV_LEARN\]/);
});

test("MUX-5. expandable groups are real buttons with aria-expanded/aria-controls; close, Escape, focus trap and scroll lock stay", () => {
  const menu = src("components/NavMenu.js");
  assert.match(menu, /aria-expanded=\{isOpen\}/);
  assert.match(menu, /aria-controls=\{panelId\}/);
  assert.match(menu, /hidden=\{!isOpen\}/);
  assert.match(menu, /aria-label="Close menu"/);
  assert.match(menu, /e\.key === "Escape"/);
  assert.match(menu, /querySelectorAll\('a\[href\], button:not\(\[disabled\]\)'\)/);
  assert.match(menu, /document\.body\.style\.overflow = "hidden"/);
  assert.match(menu, /opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(menu, /min-h-12/);
  assert.doesNotMatch(menu, /fixed bottom-0|bottom-0 left-0 right-0/, "no new permanent bottom bar");
});

// --- catalogue index ---------------------------------------------------

test("MUX-6. the link index keeps every permanent link as a plain <a>, in natively expandable sections", () => {
  const idx = src("components/CatalogueLinkIndex.js");
  assert.doesNotMatch(idx, /^\s*["']use client["']/m, "must stay a server component");
  assert.doesNotMatch(idx, /from ["']next\/link["']/, "plain anchors only - no prefetch");
  assert.match(idx, /<details key=\{s\.key\}/);
  assert.match(idx, /<a href=\{permanentHref\(c\)\}>/);
  assert.match(idx, /cardNameWithoutNumber\(c\)/);
  assert.match(idx, /setCount > 1 \? eraSections\(linkable\) : raritySections\(linkable\)/);
  assert.doesNotMatch(idx, /Choose Search & gallery/, "the old instruction is gone");
});

test("MUX-6b. the whole index is ONE collapsed <details>: compact heading + count in its summary, text and links inside", () => {
  const idx = src("components/CatalogueLinkIndex.js");
  const render = idx.slice(idx.indexOf("export default function CatalogueLinkIndex"));
  const outer = render.indexOf('<details className="group/index');
  const summaryH2 = render.indexOf("<h2 id={headingId}");
  const summaryEnd = render.indexOf("</summary>");
  const explanation = render.indexOf("card we track, linked to its price & deal page");
  const firstList = render.indexOf("<SectionBody");
  assert.ok(outer > 0 && outer < summaryH2 && summaryH2 < summaryEnd, "heading lives in the outer summary");
  assert.match(render, /\{`Full \$\{label\} card index \(\$\{linkable\.length\}\)`\}/, "count = links listed, one text node for the SEO check");
  assert.ok(summaryEnd < explanation && explanation < firstList, "explanatory text and lists sit inside the collapsed section");
  assert.doesNotMatch(render, /<details[^>]*\bopen\b/, "nothing is expanded by default");
  assert.doesNotMatch(render, /sr-only/, "the heading is the visible control, not hidden");
  // the text must hold without JS too, where the Gallery toggle is hidden
  assert.doesNotMatch(idx, /Choose Gallery|Search & gallery/, "no direction to a control that may be unavailable");
  assert.match(render, /Open a section below to see its cards\./);
});

test("MUX-7. pages open on the gallery only where the list is the plain index; checklists stay first", () => {
  const views = src("components/CatalogueViews.js");
  assert.match(views, /defaultView = "list"/);
  assert.match(views, /hidden=\{view !== "list"\} data-catalogue-primary/);
  // no-JS: the toggle can't work, so it hides and the server-hidden list pane shows
  assert.match(views, /<noscript>\s*<style>\{"\[data-catalogue-toggle\]\{display:none!important\}@layer base\{\[data-catalogue-primary\]\[hidden\]\{display:block!important\}\}"\}<\/style>\s*<\/noscript>/);
  assert.match(views, /role="group" aria-label="Inventory view" data-catalogue-toggle/);
  const species = src("components/SpeciesCardsBySet.js");
  assert.match(species, /defaultView=\{eraGroups \? "list" : "gallery"\}/);
  const set = src("app/sets/[slug]/page.js");
  assert.match(set, /defaultView=\{checklistPilot \? "list" : "gallery"\}/);
  // pinned 17C.2/17C.3/17C.4 call sites unchanged
  assert.match(set, /<CatalogueLinkIndex label=\{setLabel\} cards=\{catalogueIndexItems\} headingId="full-set-index" \/>/);
  assert.match(species, /<CatalogueLinkIndex label=\{speciesName\} cards=\{items\} headingId="full-card-index" \/>/);
});

test("MUX-8. one inventory heading states an honest tracked count; no 'every card' completeness claim there", () => {
  const species = src("app/pokemon/[slug]/page.js");
  assert.match(species, /\{resolved\.name\} cards we track/);
  assert.doesNotMatch(species, /Every \{resolved\.name\} card, by set/);
  assert.match(species, /market prices are recent-sold references, not\s+guaranteed values/);
  const set = src("app/sets/[slug]/page.js");
  assert.match(set, /\{resolved\.set\} cards we track/);
  assert.match(set, /market prices are recent-sold references, not guaranteed values/);
});

test("MUX-9. gallery tiles show the number once, keep reference/shipping/auction qualifications, and a capped gallery points to the full list", () => {
  const b = src("components/CatalogueBrowser.js");
  assert.match(b, /const name = cardNameWithoutNumber\(card\);/);
  assert.match(b, /showSet \? card : \{ \.\.\.card, set: null \}/);
  assert.match(b, /Market reference/);
  assert.match(b, /shipping\.savingQualifier/);
  assert.match(b, /Est\. total/);
  assert.match(b, /auction, bids can rise/);
  assert.match(b, /hidden min-h-10 flex-1 items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-center text-xs sm:inline-flex/, "phone tiles drop the duplicate View Card button; art + name still link");
  assert.match(b, /aria-label=\{`\$\{name\} card details`\} onClick=\{viewCard\}/);
  assert.match(b, /catalogueView\.setView\("list"\)/);
  assert.match(b, /See all \$\{totalCount\} in the list/);
});

// --- homepage thumbnail --------------------------------------------------

test("MUX-10. the condition-guide thumbnail reuses a verified grading-guide card, described honestly", () => {
  const home = src("app/page.js");
  assert.match(home, /image: catalogImageUrl\(GUIDE_CARDS\.umbreonVmaxAltArt\.tcgplayerId\),/);
  assert.match(home, /imageAlt: "Umbreon VMAX #215\/203 \(Evolving Skies\) - a card used in the grading guides"/);
  assert.doesNotMatch(home, /image: null/);
  assert.equal(GUIDE_CARDS.umbreonVmaxAltArt.tcgplayerId, "246723");
  // the grading-scale guide in the same "Check condition and grade" group uses this card
  assert.match(src("app/guides/pokemon-card-grading-scale/page.js"), /GUIDE_CARDS\.umbreonVmaxAltArt\.href/);
  assert.match(src("app/guides/page.js"), /"card-condition-grading", "how-to-check-pokemon-card-condition", "pokemon-card-grading-scale"/);
});
