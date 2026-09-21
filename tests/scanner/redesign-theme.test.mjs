// Redesign 2026-09 - the theme layer. The design (docs/design/
// redesign-2026-09.html) is applied as tokens + fonts + a forced dark
// variant on top of the existing components: no class name that a test
// pins changed, no route, schema or behaviour changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("filter pills: the active state is the accent tint, not an inverted fill", () => {
  assert.match(read("components/FilterBar.js"), /\? "border-red-300 bg-red-50 text-red-700 dark:border-red-300 dark:bg-red-50 dark:text-red-700"/);
});
