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
  assert.match(src, /<p className="text-\[13px\] text-zinc-500 dark:text-zinc-400">\s*Market reference/);
  assert.match(src, /<p className="text-\[13px\] font-semibold text-emerald-700/);
  assert.match(src, /mt-2 flex items-center justify-between gap-2 text-\[13px\]/);
});

test("5b. phone deal card: mono on figures only, marketplace words hidden behind the mark below sm, save control anchored to the art", () => {
  const src = read("components/DealCard.js");
  // no sentence paragraph carries the mono face; every inline <Price> in a sentence does
  assert.doesNotMatch(src, /<p className=\{?[`"]tnum (mt-0\.5 )?text-(xs|\[13px\])/, "a whole sentence in the mono face");
  assert.match(src, /Save <Price [^/]*className="tnum text-sm font-bold" \/>/);
  assert.match(src, /Market reference\{" "\}\s*<Price [^/]*className="tnum font-medium/);
  assert.match(src, /<span className="sr-only sm:not-sr-only">eBay \{marketInfo\.short\}<\/span>/);
  assert.match(src, /relative row-span-1 self-start sm:row-auto sm:self-auto/);
  // the headline figure keeps the mono face
  assert.match(src, /className="tnum block break-words text-2xl font-bold/);
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
  assert.match(badge, /if \(pct >= 40\) return "hot";\s*if \(pct >= 20\) return "strong";\s*return "modest";/);
  assert.match(badge, /hot: "bg-red-600 px-2\.5 py-1 text-base font-black[^"]*shadow-\[/, "hot tier: solid lime, larger, glows");
  assert.match(badge, /strong: "bg-red-600 px-2 py-1 text-sm font-extrabold/, "strong tier: solid lime, no glow");
  assert.match(badge, /modest: "border border-zinc-200 bg-white\/95/, "modest tier stays quiet");
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
