// SEO Phase 6A closeout - currency display coherence. Guards that every
// comparison surface renders ONE currency for figures shown together
// (listing / reference / savings), and that USD-canonical value surfaces
// (condition ladder, graded, recent sales, history, catalogue tiles,
// market-data) route through <Price> so they localise with the rest of
// the page. The savings percentage stays rate-invariant; auction "can
// rise" language and affiliate routing are untouched.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { get } from "./lib.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const ACCENTED = `Pok${String.fromCharCode(233)}mon`;

// A "$" that is NOT part of A$ / C$ (the other dollar currencies) and not
// a JS template marker.
const BARE_USD_RE = /(^|[^A-Za-z0-9$])\$\d/;
// non-USD currency symbols
const OTHER_CCY_RE = /(£|€|A\$|C\$)\s?\d/;

// deal comparison components + the value surfaces we localised
const COMPARISON_COMPONENTS = [
  "components/DealCard.js",
  "components/SealedDealCard.js",
  "app/deals/[id]/page.js",
  "app/sealed-deals/[id]/page.js",
];
const VALUE_SURFACES = [
  "components/CardPriceSummary.js",
  "components/VariantPriceGrid.js",
  "components/RecentSales.js",
  "components/CatalogueBrowser.js",
  "components/CatalogCardView.js",
  "app/market-data/most-expensive-cards/page.js",
];

let gbHtml, auHtml;

function tileBlocks(html) {
  // split on the shared deal-tile shell class both DealCard and
  // SealedDealCard / SpeciesCard use
  return html.split(/group flex h-full flex-col|flex flex-1 flex-col gap-1 p-4/).slice(1);
}
function plain(s) {
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

before(async () => {
  gbHtml = (await get("/?country=EBAY_GB")).body || "";
  auHtml = (await get("/?listing=AUCTION")).body || "";
});

// ---------------------------------------------------------------------------
// 1-4: the comparison components pass the LISTING's currency to the ref
// ---------------------------------------------------------------------------

test("1. DealCard renders the market reference in the listing's currency, not a hardcoded USD", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /refInListingCurrency\(marketUsd, total, usdTotal, nativeCurrency\)/);
  // the ref <Price> now uses nativeCurrency + marketNative, never currency: "USD"
  assert.ok(!/native=\{\{ amount: market(Usd)?, currency: "USD" \}\}/.test(src), "DealCard still hardcodes the ref to USD");
  assert.match(src, /native=\{\{ amount: marketNative, currency: nativeCurrency \}\}/);
  assert.match(src, /native=\{\{ amount: savedNative, currency: nativeCurrency \}\}/);
});

test("2. SealedDealCard renders the reference / savings in the listing's currency", () => {
  const src = read("components/SealedDealCard.js");
  assert.match(src, /refInListingCurrency\(/);
  assert.ok(!/amount: market(Usd)?, currency: "USD"/.test(src));
  assert.match(src, /amount: marketNative, currency: nativeCurrency/);
});

test("3. /deals/[id] renders the reference / savings / no-chart fallback in the listing's currency", () => {
  const src = read("app/deals/[id]/page.js");
  assert.match(src, /refInListingCurrency\(marketUsd, total, usdTotal, nativeCurrency\)/);
  // the two comparison <Price>s and the "current market value is" fallback
  const usdHardcoded = src.match(/amount: marketUsd, currency: "USD"/g) || [];
  assert.equal(usdHardcoded.length, 0, "/deals/[id] still hardcodes a compared reference to USD");
});

test("4. /sealed-deals/[id] renders the reference / savings in the listing's currency", () => {
  const src = read("app/sealed-deals/[id]/page.js");
  assert.match(src, /refInListingCurrency\(/);
  assert.equal((src.match(/amount: marketUsd, currency: "USD"/g) || []).length, 0);
});

// ---------------------------------------------------------------------------
// 5-8: USD-canonical value surfaces route through <Price> (no raw "$X")
// ---------------------------------------------------------------------------

test("5. the condition ladder + graded tiers + recent sales + history localise (no raw $ template strings)", () => {
  for (const f of ["components/CardPriceSummary.js", "components/VariantPriceGrid.js", "components/RecentSales.js"]) {
    const src = read(f);
    assert.ok(!/`\$\$\{|\$\$\{Number|>\s*\$\{Number\([a-z]/.test(src), `${f} still prints a raw "$" figure`);
    assert.match(src, /<Price |<Money /, `${f} does not use <Price>`);
  }
  // PriceHistoryChart localises its axis / endpoint / hover labels
  const chart = read("components/PriceHistoryChart.js");
  assert.match(chart, /useCurrency\(\)/);
  assert.match(chart, /toViewerCurrency\(p, viewer, rates\)/);
});

test("6. the catalogue browser tile localises (used to print raw $ regardless of country)", () => {
  const src = read("components/CatalogueBrowser.js");
  assert.ok(!/function usd\(n\)/.test(src), "CatalogueBrowser still has the raw usd() helper");
  assert.match(src, /<Money /);
  // deal tile: ref + price share one currency (dealCcy)
  assert.match(src, /refInListingCurrency\(card\.refPrice, card\.deal\.cheapestNative, card\.deal\.cheapestUsd, dealCcy\)/);
});

test("7. /market-data/most-expensive-cards localises its ranked prices", () => {
  const src = read("app/market-data/most-expensive-cards/page.js");
  // SEO Phase 9A: the ranking is now the card_catalog raw market
  // reference (card.refPrice), not a deal-scoped market_price.
  assert.ok(!/\$\{card\.(refPrice|marketPrice)\.toFixed/.test(src), "raw $ toFixed on a ranked price");
  assert.match(src, /<Price\s+usd=\{card\.refPrice\}/);
});

test("8. the CatalogCardView 'market reference' fallback localises", () => {
  const src = read("components/CatalogCardView.js");
  assert.ok(!/function usd\(n\)/.test(src), "CatalogCardView still has the raw usd() helper");
  assert.match(src, /<Price usd=\{refPrice\}/);
});

// ---------------------------------------------------------------------------
// 9-12: rendered production HTML - no mixed-currency comparison block
// ---------------------------------------------------------------------------

test("9. no deal tile on /?country=EBAY_GB mixes a non-USD symbol with a bare USD $", () => {
  assert.ok(gbHtml.length > 1000, "/?country=EBAY_GB did not render");
  const bad = [];
  for (const b of tileBlocks(gbHtml)) {
    const seg = plain(b.slice(0, 900));
    if (!/typical|market ref|Save|You save|below market|Current bid/i.test(seg)) continue;
    if (OTHER_CCY_RE.test(seg) && BARE_USD_RE.test(seg)) bad.push(seg.slice(0, 180));
  }
  assert.deepEqual(bad, [], `mixed-currency comparison blocks on /?country=EBAY_GB:\n${bad.join("\n")}`);
});

test("10. no deal tile on /?listing=AUCTION mixes a non-USD symbol with a bare USD $", () => {
  const bad = [];
  for (const b of tileBlocks(auHtml)) {
    const seg = plain(b.slice(0, 900));
    if (!/Current bid|market ref|below market|Save/i.test(seg)) continue;
    if (OTHER_CCY_RE.test(seg) && BARE_USD_RE.test(seg)) bad.push(seg.slice(0, 180));
  }
  assert.deepEqual(bad, [], `mixed-currency auction blocks:\n${bad.join("\n")}`);
});

test("11. auction tiles still carry the 'can rise' honesty language", () => {
  assert.match(read("components/DealCard.js"), /isAuction \?[\s\S]{0,300}can rise/);
  assert.match(read("components/SealedDealCard.js"), /isAuction \?[\s\S]{0,300}can rise/);
  assert.match(read("app/deals/[id]/page.js"), /final price can rise before the auction ends/);
});

test("12. a GBP deal tile shows the reference in GBP (£), not USD, on the server render", () => {
  const withRef = tileBlocks(gbHtml)
    .map((b) => plain(b.slice(0, 900)))
    .filter((s) => /£\d/.test(s) && /(typical|market ref|Save|You save|below market)/i.test(s));
  if (withRef.length === 0) return; // no GBP deal in the sample right now - fine
  for (const s of withRef) {
    assert.ok(!BARE_USD_RE.test(s), `GBP tile still shows a USD figure: ${s.slice(0, 160)}`);
  }
});

// ---------------------------------------------------------------------------
// 13-16: guardrails
// ---------------------------------------------------------------------------

test("13. affiliate links unchanged - rel=sponsored + real affiliate_url / exact-item destination", () => {
  assert.match(read("components/AffiliateLink.js"), /rel="sponsored/);
  assert.match(read("components/DealCard.js"), /href=\{deal\.affiliate_url\}/);
  for (const f of COMPARISON_COMPONENTS) {
    const src = read(f);
    assert.ok(!/marketplace:\s*viewer|marketplace:\s*displayCcy/.test(src), `${f} lets display currency touch marketplace routing`);
  }
});

test("14. the currency work touched no deal-detection / authenticity / indexability logic", () => {
  // components + helpers this phase edited (deals/[id] & sealed-deals/[id]
  // legitimately reference the display gate for their own noindex branch -
  // pre-existing, excluded here)
  const TOUCHED_PURE = [
    "components/DealCard.js",
    "components/SealedDealCard.js",
    "components/CardPriceSummary.js",
    "components/VariantPriceGrid.js",
    "components/RecentSales.js",
    "components/CatalogueBrowser.js",
    "components/CatalogCardView.js",
    "components/PriceHistoryChart.js",
    "lib/money.js",
    "app/market-data/most-expensive-cards/page.js",
  ];
  for (const f of TOUCHED_PURE) {
    const src = read(f);
    for (const fn of ["isDisplayableDeal", "listingMatchesCard", "SPECIES_MIN_LISTINGS =", "SET_MIN_LISTINGS =", "CARD_HUB_MIN_LISTINGS =", "isVisualScreeningCandidate", "GRADED_CARD_PATTERN"]) {
      assert.ok(!src.includes(fn), `${f} references ${fn}`);
    }
  }
  // the deal identity / discount is still computed by the scanner, not here
  assert.match(read("lib/dealMatching.js"), /function listingMatchesCard\(/);
  assert.match(read("lib/money.js"), /function refInListingCurrency/);
});

test("15. the % shown is deal.discount_pct (a number), never parsed from a formatted price", () => {
  for (const f of ["components/DealCard.js", "components/SealedDealCard.js", "app/deals/[id]/page.js"]) {
    const src = read(f);
    assert.match(src, /Math\.round\(deal\.discount_pct \* 100\)/, `${f} doesn't derive % from deal.discount_pct`);
    // no math on a formatMoney() / <Price> output
    assert.ok(!/parseFloat\(\s*formatMoney|parseFloat\(\s*inDisplayCcy/.test(src), `${f} parses a formatted price for math`);
  }
  // refInListingCurrency scales BOTH sides by the same rate -> % unchanged
  // (proven numerically in tests/scanner/currency-consistency.test.mjs)
  assert.match(read("lib/money.js"), /PERCENTAGE is unchanged/);
});

test("16. public spelling is \"Pokemon\" (no accent) in the touched files", () => {
  for (const f of [...COMPARISON_COMPONENTS, ...VALUE_SURFACES, "lib/money.js", "components/PriceHistoryChart.js", "app/methodology/page.js"]) {
    assert.ok(!read(f).includes(ACCENTED), `${f} has an accented "Pokemon"`);
  }
});
