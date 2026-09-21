// Redesign 2026-09 - the theme layer. The design (docs/design/
// redesign-2026-09.html) is applied as tokens + fonts + a forced dark
// variant on top of the existing components: no class name that a test
// pins changed, no route, schema or behaviour changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const layout = read("app/layout.js");

test("dark-first: the dark variant is class-driven and <html> carries it; one theme, colour-scheme dark", () => {
  assert.match(css, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);/);
  assert.match(layout, /className=\{`dark \$\{sora\.variable\}/);
  assert.match(css, /color-scheme: dark;/);
  assert.doesNotMatch(css, /@media \(prefers-color-scheme: dark\)/, "no OS-dependent palette flip remains");
});

// 2026-09-22 re-brand: the accent slot holds BRAND RED; lime moved to
// the savings-only slot. The slot mechanism is unchanged - that is what
// let the re-brand happen without renaming a single component class.
test("tokens: near-black neutrals, BRAND RED in the red-* slot, lime reserved for savings, amber for bids, danger for errors", () => {
  assert.match(css, /--color-zinc-950: #090A10;/, "near-black ground");
  assert.match(css, /--color-zinc-900: #0F1119;/);
  assert.match(css, /--color-zinc-800: #171A24;/, "charcoal surface");
  assert.match(css, /--color-zinc-400: #9AA0B2;/);
  assert.match(css, /--color-red-500: #FF2942;/, "brand red tone");
  assert.match(css, /--color-red-600: #D61133;/, "button fill steps darker for white-text contrast");
  assert.match(css, /--color-emerald-600: #B7FF36;/, "savings lime");
  assert.match(css, /--color-amber-500: #F2B84B;/);
  assert.match(css, /--color-danger: #FF6B6B;/);
  // the existing accent alias (pinned by deal-first-r1) still resolves through the slot
  assert.match(css, /--color-accent: var\(--color-red-600\);/);
});

test("lime fills take dark text; red fills take white text", () => {
  // Only the savings family is forced dark. A red CTA must keep its own
  // text-white - forcing it dark (the pre-rebrand rule) would have made
  // every primary button unreadable.
  assert.match(css, /\.bg-emerald-500, \.bg-emerald-600, \.bg-emerald-700 \{\s*color: #090A10;/);
  assert.doesNotMatch(css, /\.bg-red-600[^{]*\{\s*color: #090A10/, "red fills must not be forced to dark text");
  // The CSS class contains a LITERAL backslash (.hover\:bg-red-600), so
  // the regex needs \\: - a single \: is just an escaped colon and never
  // matches.
  assert.match(css, /\.hover\\:bg-red-600:hover[\s\S]{0,200}color: #F7F7FA;/, "hover-to-accent flips the label white");
  assert.match(read("components/DealCard.js"), /export const CTA_PRIMARY_CLASS =\s*"flex min-h-12 w-full[^"]*bg-red-600[^"]*text-white/, "CTA class string unchanged");
});

test("the savings badge uses the lime slot, never the accent slot", () => {
  const badge = read("components/SavingsBadge.js");
  assert.match(badge, /hot: "bg-emerald-600/, "hot tier is lime");
  assert.match(badge, /strong: "bg-emerald-600/, "strong tier is lime");
  assert.doesNotMatch(badge, /bg-red-/, "savings must not wear the CTA colour");
});

test("the wordmark: red glass, red Deal, white Pokemon and Finder", () => {
  const logo = read("components/Logo.js");
  assert.match(logo, /stopColor="#FF2942"/, "magnifying glass carries the brand red");
  assert.match(logo, /<span className="text-red-500">Deal<\/span>/, "Deal is red");
  assert.match(logo, /text-zinc-50">Pokemon<\/span>/, "Pokemon is white");
  assert.match(logo, /text-zinc-50">Finder<\/span>/, "Finder is white");
});

test("type: Sora display, Inter Tight UI, JetBrains Mono tabular figures - self-hosted via next/font", () => {
  assert.match(layout, /import \{ Sora, Inter_Tight, JetBrains_Mono \} from "next\/font\/google";/);
  assert.match(css, /--font-sans: var\(--font-inter-tight\);/);
  assert.match(css, /--font-mono: var\(--font-jetbrains-mono\);/);
  assert.match(css, /h1, h2 \{\s*font-family: var\(--font-sora\)/);
  assert.match(css, /\.tnum \{\s*font-family: var\(--font-jetbrains-mono\)[\s\S]{0,120}font-variant-numeric: tabular-nums;/);
});

test("errors use the danger token, never the accent slot", () => {
  assert.match(read("components/PriceAlertForm.js"), /role="alert" className="w-full text-sm text-danger"/);
  assert.match(read("components/EmailCapture.js"), /text-danger" role="alert"/);
  assert.match(read("app/search/SearchClient.js"), /role="alert" className="rounded-lg bg-danger\/10 p-4 text-danger"/);
  assert.doesNotMatch(read("app/best-finds/page.js"), /bg-red-50 p-4 text-red-700/);
});

test("motion: card lift is pointer-only and the global reduced-motion rule still collapses every transition", () => {
  assert.match(css, /@media \(hover: hover\) \{\s*article\[data-deal-card\] \{ transition/);
  assert.match(read("components/DealCard.js"), /data-deal-card=""/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,300}transition-duration: 0\.01ms !important/);
});

test("filter pills: the active state is the accent tint, and its label is readable on it", () => {
  // The label must be the BRIGHT brand tone. The dark button fill
  // (red-700) measured 2.71:1 on the tint once the slot held real red -
  // it only ever passed because that slot used to hold lime.
  const bar = read("components/FilterBar.js");
  assert.match(bar, /\? "border-red-400 bg-red-50 text-red-400 dark:border-red-400 dark:bg-red-50 dark:text-red-400"/);
  assert.doesNotMatch(bar, /bg-red-50 text-red-700/, "dark fill tone on a dark tint is unreadable");
});

// The lime family means ONE thing: an evidenced below-market figure. A
// success toast, a listing COUNT, a trend line or a guide diagram wearing
// it quietly destroys that meaning, and four of them did before the
// 2026-09-22 re-brand.
//
// An allowlist rather than a blanket ban, because savings figures legitimately
// appear on many surfaces. Every entry below is a place that shows a
// saving or a below-market indicator. A NEW file using lime fails this
// test until someone justifies adding it here.
const LIME_ALLOWED = new Set([
  "components/SavingsBadge.js",        // the badge itself
  "components/DealCard.js",            // the savings line under the price
  "components/SealedDealCard.js",      // same, sealed product
  "components/CardPriceIntelligence.js", // below-market panel on a card hub
  "components/CatalogueBrowser.js",    // below-market markers in the grid
  "components/SpeciesCard.js",         // per-print savings
  "components/SpeciesCardList.js",
  "components/SealedProductBrowser.js",
  "components/VariantPriceGrid.js",
  "components/HeroSearch.js",          // the "deal" flag on a search result
  "app/deals/[id]/page.js",            // the saving on a deal page
  "app/sealed-deals/[id]/page.js",
  "app/sealed-deals/page.js",
  "app/search/SearchClient.js",        // below-market indicator in results
]);

test("lime is RESERVED for savings - a new surface may not borrow it", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.jsx?$/.test(name)) {
        const rel = relative(root, p).split(sep).join("/");
        if (LIME_ALLOWED.has(rel)) continue;
        const src = readFileSync(p, "utf8")
          .replace(new RegExp("\\/\\/[^\\n]*", "g"), "")
          .replace(new RegExp("\\/\\*[\\s\\S]*?\\*\\/", "g"), "");
        const LIME = new RegExp("\\b(?:text|bg|border|fill|stroke|from|to|via)-emerald-\\d{2,3}\\b", "g");
        for (const m of src.matchAll(LIME)) {
          offenders.push(`${rel}: ${m[0]}`);
        }
      }
    }
  };
  for (const d of ["components", "app"]) walk(join(root, d));
  assert.deepEqual(
    offenders,
    [],
    "lime means below market and nothing else. These borrowed it: " + offenders.join(", ")
  );
});

test("the things that borrowed lime before the re-brand no longer do", () => {
  // Named explicitly so a revert is loud rather than silent.
  const cases = [
    ["components/MiniSparkline.js", "a price trend is not a saving"],
    ["components/ShareButton.js", "a copied-link toast is not a saving"],
    ["components/EmailCapture.js", "a signup confirmation is not a saving"],
    ["components/PriceAlertForm.js", "an alert confirmation is not a saving"],
    ["components/PokemonFilterList.js", "a listing COUNT is not a saving"],
    ["components/SetsFilterList.js", "a listing COUNT is not a saving"],
    ["components/guides/ConditionScale.js", "a condition diagram is not a saving"],
    ["components/guides/EraTimeline.js", "a timeline band is not a saving"],
  ];
  for (const [file, why] of cases) {
    assert.doesNotMatch(read(file), /-emerald-\d/, `${file}: ${why}`);
  }
  // And the sparkline must not use the BRAND colour for a down trend.
  assert.doesNotMatch(read("components/MiniSparkline.js"), /text-red-\d/, "a falling price is not branding");
});
