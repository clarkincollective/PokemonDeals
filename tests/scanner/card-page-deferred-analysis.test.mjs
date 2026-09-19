// audit-r1 (card-page-cold-render) - the card hub renders from the catalogue
// reference; the provider market analysis loads afterwards through
// /api/card-analysis (robots-disallowed, so crawler renders never spend a
// PokemonPriceTracker credit). Source pins + the route's input handling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

test("CPD-1 the card page makes no provider call: no PokemonPriceTracker import, both render paths read the catalogue row", () => {
  const page = read("app/cards/[slug]/page.js");
  assert.doesNotMatch(page, /from "@\/lib\/pokemonPriceTracker"|from "@\/lib\/pptTelemetry"|withPptConsumer\(|getFullPriceAnalysis\(|loadPriceAnalysis\(|unstable_cache\(/);
  assert.match(page, /resolveCatalogCardById\(hub\.tcgplayerId\)/);
  assert.match(page, /const hubRaw = catalog\?\.refPrice;/);
  assert.match(page, /priceSource: "catalog",\n\s*priceUpdatedAt: catalog\?\.syncedAt \?\? null,/);
  assert.match(page, /<CardMarketSummary tcgplayerId=\{hub\.tcgplayerId\} \/>/);
  assert.match(page, /<CardMarketPanel\n\s*tcgplayerId=\{hub\.tcgplayerId\}/);
  const view = read("components/CatalogCardView.js");
  assert.match(view, /<CardMarketSummary tcgplayerId=\{card\.tcgplayerId\} \/>/);
  assert.match(view, /<CardMarketPanel\n\s*tcgplayerId=\{card\.tcgplayerId\}/);
  assert.doesNotMatch(view, /import VariantPriceGrid|import RecentSales/);
});

test("CPD-2 the analysis loader keeps its cache key and window; the route validates the id, checks the catalogue first, caches at the CDN and is not indexable", () => {
  const lib = read("lib/cardPriceAnalysis.js");
  assert.match(lib, /unstable_cache\(loadUncached, \["card-hub-price-analysis"\], \{\n\s*revalidate: 300,/);
  assert.match(lib, /withPptConsumer\("page:cards", \(\) => getFullPriceAnalysis\(tcgplayerId, \{ includeHistory: false \}\)\)/);
  const route = read("app/api/card-analysis/route.js");
  assert.match(route, /if \(!\/\^\\d\{1,12\}\$\/\.test\(id\)\) return json\(\{ ok: false, reason: "invalid_id" \}, 400/);
  assert.ok(route.indexOf("resolveCatalogCardById(id)") < route.indexOf("loadCardPriceAnalysis(id)"), "existence check before the provider call");
  assert.match(route, /"Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600", "X-Robots-Tag": "noindex"/);
  // crawlers never fetch it: /api/ is disallowed for every user agent
  const robots = read("app/robots.js");
  // 2026-09-19: the disallow list is a named constant shared by every agent rule
  assert.match(robots, /disallow: \["\/api\/"\]|disallow: "\/api\/"|DISALLOW = \["\/api\/"/);
});

test("CPD-3 the client panel fetches once per card after first paint and renders the same three blocks the page used to", () => {
  const panel = read("components/CardMarketPanel.js");
  assert.match(panel, /^"use client";/);
  assert.match(panel, /fetch\(`\/api\/card-analysis\?id=\$\{encodeURIComponent\(id\)\}`/);
  assert.match(panel, /const inflight = new Map\(\)/, "one request per card, shared by summary and panel");
  assert.match(panel, /requestIdleCallback\(start, \{ timeout: 1500 \}\)/);
  assert.match(panel, /<CardPriceSummary analysis=\{analysis\} detailsOnly \/>/);
  assert.match(panel, /<VariantPriceGrid raw=\{canonRaw\} graded=\{graded\} cardName=\{gridName \?\? cardName\} surface=\{surface\} \/>/);
  assert.match(panel, /sales=\{analysis\.primaryRecentSales\}/);
  // the same merge with the first-party history the page did server-side
  assert.match(panel, /history: chartPoints, minPrice: comparableRange\?\.min \?\? null, maxPrice: comparableRange\?\.max \?\? null/);
});

test("CPD-4 the catalogue resolver by id shares the slug resolver's shape and carries the sync date", () => {
  const deals = read("lib/deals.js");
  assert.match(deals, /function catalogCardShape\(pick, slug\) \{/);
  assert.match(deals, /syncedAt: pick\.synced_at \?\? null,/);
  assert.match(deals, /return catalogCardShape\(pick, slug\);/);
  assert.match(deals, /export const resolveCatalogCardById = unstable_cache\(resolveCatalogCardByIdUncached, \["resolve-catalog-card-by-id"\]/);
  assert.match(deals, /if \(!\/\^\\d\+\$\/\.test\(id\)\) return null;/);
});
