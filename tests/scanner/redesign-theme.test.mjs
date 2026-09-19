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

test("tokens: blue-black neutrals, lime accent in the red-* slot, savings in the same family, amber for bids, danger for errors", () => {
  assert.match(css, /--color-zinc-950: #0B0D10;/);
  assert.match(css, /--color-zinc-900: #11141A;/);
  assert.match(css, /--color-zinc-400: #A7B0BE;/);
  assert.match(css, /--color-red-600: #D5F542;/);
  assert.match(css, /--color-emerald-700: #B8DB1F;/);
  assert.match(css, /--color-amber-500: #F2B84B;/);
  assert.match(css, /--color-danger: #FF6B6B;/);
  // the existing accent alias (pinned by deal-first-r1) still resolves through the slot
  assert.match(css, /--color-accent: var\(--color-red-600\);/);
});

test("text on a lime fill is forced to the ground colour without renaming any pinned class", () => {
  assert.match(css, /\.bg-red-600, \.bg-red-700, \.bg-red-800,[\s\S]{0,200}color: #0B0D10;/);
  assert.match(read("components/DealCard.js"), /export const CTA_PRIMARY_CLASS =\s*"flex min-h-12 w-full[^"]*bg-red-600[^"]*text-white/, "CTA class string unchanged");
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
