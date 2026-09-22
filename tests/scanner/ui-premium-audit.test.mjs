// UI audit 2026-09-20 - the interface-quality fixes, pinned.
//
//   1. No flag emoji is rendered anywhere in the UI (Windows has no flag
//      glyphs); the marketplace is shown with components/MarketplaceMark.
//   2. Interface text has a floor: nothing below 11px outside SVG diagrams.
//   3. Filter pills are readable (13px) and a real target (min 32px tall).
//   4. Category chips carry a short label, not the page's h1.
//   5. Deal-card meta lines are 13px, not 12px.
//   6. /deals: the sort row is a slim toolbar and the other rows sit behind
//      the Filters button (FilterBar sortOutside).
//   7. The catalogue card render's "no trend yet" state is one line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// lib/dealCategories is CommonJS (module.exports)
const { categoryShortLabel, DEAL_CATEGORY_SLUGS } = require("../../lib/dealCategories.js");

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith(".js")) out.push(rel);
  }
  return out;
}
const UI_FILES = [...walk("components"), ...walk("app")];

test("1. flag emoji are never rendered - MarketplaceMark carries the marketplace", () => {
  const FLAG = /\.flag\b/;
  const offenders = UI_FILES.filter((f) => {
    const src = read(f);
    // the data definitions may keep a `flag` field; rendering it is the bug
    if (f === "components/RegionControl.js") return /\{(current|r)\.flag\}/.test(src);
    return FLAG.test(src);
  });
  assert.deepEqual(offenders, [], "components/pages still rendering a flag emoji");
  const mark = read("components/MarketplaceMark.js");
  assert.match(mark, /aria-hidden="true"/);
  assert.match(mark, /font-mono text-\[10px\] font-bold/);
  assert.match(mark, /data-marketplace-mark=\{c \?\? "all"\}/);
  for (const f of ["components/DealCard.js", "components/SealedDealCard.js", "components/FilterBar.js", "components/RegionControl.js", "app/deals/[id]/page.js", "app/sealed-deals/[id]/page.js"]) {
    assert.match(read(f), /<MarketplaceMark code=/, f);
  }
  assert.match(read("components/RegionControl.js"), /short: "UK"/, "REGIONS carries the short mark matching MARKETPLACES");
});

test("2. interface text floor: no 10px or smaller type outside SVG diagrams and the marketplace mark", () => {
  const allowed = new Set(["components/MarketplaceMark.js"]);
  const offenders = [];
  for (const f of UI_FILES) {
    if (allowed.has(f) || f.startsWith("components/guides/") || /MiniSparkline|PriceHistoryChart/.test(f)) continue;
    const src = read(f);
    if (/text-\[(10|9|8)px\]/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test("3. filter pills: 13px text, 32px minimum height", () => {
  assert.match(read("components/FilterBar.js"), /inline-flex min-h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3\.5 py-1 text-\[13px\] font-medium/);
});

test("4. category chips use the short label with the h1 as the title", () => {
  for (const s of DEAL_CATEGORY_SLUGS) assert.ok(categoryShortLabel(s).length <= 16, `${s}: ${categoryShortLabel(s)}`);
  assert.equal(categoryShortLabel("under-25"), "Under $25");
  assert.equal(categoryShortLabel("not-a-slug"), "not-a-slug");
  assert.match(read("app/deals/page.js"), /title=\{DEAL_CATEGORIES\[s\]\.h1\}>\s*\{categoryShortLabel\(s\)\}/);
  assert.match(read("components/DealCategoryPage.js"), /\{categoryShortLabel\(s\)\}/);
});

test("5. deal-card meta lines are 13px", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /gap-x-1 text-\[13px\] text-zinc-500 dark:text-zinc-400">\s*\{cardSet &&/);
  // moved into the Price details disclosure - see deal-first-r1 R1-5
  assert.match(src, /<dt>Market reference<\/dt>/);
  // 2026-09-22 rev 2: the savings line is the headline of the redesigned
  // card. The saved AMOUNT is now the largest thing on it and the
  // percentage becomes a solid chip in the top two tiers, so the line is
  // a flex row rather than a sentence. It is still the ONE green line
  // and still only rendered on a trusted claim.
  assert.match(src, /<p className="mt-1 flex flex-wrap items-baseline gap-x-1\.5 gap-y-0\.5 text-sm font-bold text-emerald-700/);
  // The shipping qualifier survives the restyle in BOTH branches - it is
  // what stops a before-shipping saving reading as delivered.
  assert.equal(
    (src.match(/\{ship\.savingQualifier \? \(/g) ?? []).length,
    2,
    "both savings branches still print the shipping qualifier"
  );
  assert.match(src, /mt-2 flex items-center justify-between gap-2 text-\[13px\]/);
});

test("5b. phone deal card: mono on figures only, marketplace words hidden behind the mark below sm, save control anchored to the art", () => {
  const src = read("components/DealCard.js");
  // no sentence paragraph carries the mono face; every inline <Price> in a sentence does
  assert.doesNotMatch(src, /<p className=\{?[`"]tnum (mt-0\.5 )?text-(xs|\[13px\])/, "a whole sentence in the mono face");
  // rev 2: "You save" is its own small uppercase label and the figure
  // beside it is the card's second-largest number, so the two are no
  // longer one inline sentence. Still mono, still on the figure only.
  assert.match(src, /<span className="text-xs font-extrabold uppercase tracking-wide">You save<\/span>/);
  assert.match(src, /className="tnum text-xl font-black tracking-tight"/);
  // 2026-09-22: the reference FIGURE sits beside the price as "Typical
  // <x>" and the line below names what it is for. Both are still mono
  // on the figure only, which is what this pins.
  assert.match(src, /Typical\{" "\}\s*<Price [^/]*className="tnum font-medium/);
  assert.match(src, /<span className="sr-only sm:not-sr-only">eBay \{marketInfo\.short\}<\/span>/);
  // 2026-09-22: the save control is no longer anchored to the artwork.
  // It sits in the action row at the foot of the card beside Compare,
  // where the redesign groups the secondary actions - one Watch control
  // per card rather than one floating over the picture and one below.
  assert.match(src, /<SaveCardButton\s+card=\{\{/, "the card still carries exactly one save control");
  assert.equal((src.match(/<SaveCardButton/g) ?? []).length, 1, "and only one");
  // the headline figure keeps the mono face
  assert.match(src, /className="tnum block break-words text-\[1\.75rem\] font-extrabold/);
});

test("6. /deals filter bar: sort row outside, other rows behind the Filters button; every row still rendered", () => {
  const fb = read("components/FilterBar.js");
  assert.match(fb, /sortOutside = false/);
  assert.match(fb, /const toolbar = collapsible && sortOutside;/);
  assert.match(fb, /\{!toolbar && sortRow\}/);
  assert.match(fb, /label=\{toolbar \? "Filters" : collapsible \? "More filters" : "Filters"\}/);
  assert.match(read("components/DealGrid.js"), /collapsible=\{compactFilters \|\| allDeals\}\s*sortOutside=\{allDeals\}/);
});

test("8. savings badge: one tiered component for cards and sealed product; loud in proportion to the real discount; auctions stay amber and separate", () => {
  const badge = read("components/SavingsBadge.js");
  // rev 3: a fourth, louder top tier at >= 60%. The LADDER is the
  // honesty - each step up in loudness must be a real step up in the
  // discount, which is why `modest` below is pinned unchanged.
  //
  // It lives in lib/dealQuality, not in the component: the card's "You
  // save" chip grades itself with the same function, and a
  // component-to-component import of it broke the render harness, which
  // stubs components with a default export only.
  assert.match(
    read("lib/dealQuality.js"),
    /if \(pct >= 60\) return "blowout";\s*if \(pct >= 40\) return "hot";\s*if \(pct >= 20\) return "strong";\s*return "modest";/
  );
  assert.match(badge, /export \{ savingsTier \};/, "the badge re-exports it rather than owning it");
  assert.match(
    read("components/DealCard.js"),
    /isLoudSaving/,
    "and the card grades its chip with the same ladder, not a private copy"
  );
  assert.match(badge, /blowout:\s*"animate-savings-halo bg-gradient-to-br from-emerald-600 to-emerald-900[^"]*text-white/, "blowout tier: the loudest, and the only animated one");
  assert.match(badge, /hot: "bg-emerald-600 [^"]*text-base font-black[^"]*shadow-\[/, "hot tier: solid green, larger, a halo");
  assert.match(badge, /strong: "bg-emerald-600 [^"]*text-sm font-extrabold/, "strong tier: solid green");
  // Every loud tier keeps WHITE ink on an emerald fill. The amplification
  // is size, ring, shadow and motion - never a lighter fill, which would
  // lose the 5.6:1 this audit measured.
  for (const tier of ["blowout", "hot", "strong"]) {
    assert.match(badge, new RegExp(`${tier}:\\s*"[^"]*text-white`), `${tier} keeps white ink`);
  }
  // The halo is defined once, in the token layer, where the global
  // prefers-reduced-motion block reduces it.
  const css = read("app/globals.css");
  assert.match(css, /@keyframes savings-halo/);
  assert.match(css, /\.animate-savings-halo \{ animation: savings-halo/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  // On white the quiet tier is a faint green outline rather than a grey
  // card on a dark card. Still an OUTLINE, still the quietest of the
  // three - a 12% saving must not shout.
  assert.match(badge, /modest: "border border-emerald-600\/35 bg-emerald-50/, "modest tier stays quiet");
  assert.match(badge, /data-savings-badge=\{tier\}/);
  assert.match(badge, /\{savingsBadgeText\(discountPct\)\}/, "the real number, nothing else");
  assert.doesNotMatch(badge, /only \d|left!|selling fast|hurry|limited time/i, "no invented urgency");
  const card = read("components/DealCard.js");
  assert.match(card, /savingsSupported && !isAuction && \(\s*<SavingsBadge discountPct=\{deal\.discount_pct\}/);
  assert.match(card, /savingsSupported && isAuction && \(/, "auction badge remains its own amber branch");
  assert.doesNotMatch(card, /function discountBadgeClass/);
  assert.match(read("components/SealedDealCard.js"), /showSavings && <SavingsBadge discountPct=\{deal\.discount_pct\}/);
});

test("7. catalogue card page: the no-trend state is one quiet line, the full panel returns with a window", () => {
  const src = read("components/CardPriceIntelligence.js");
  assert.match(src, /if \(detailsOnly && !anyWindow && !showDealContext\) \{/);
  assert.match(src, /data-price-intelligence="limited"/);
  assert.match(src, /\{noWindowsMessage\(signal\)\}/);
});
