// Phase 13B.6.2 - one shared /search engine + server-rendered initial
// result. Structural + pure-function guards (no timing assertions).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { searchStateKey } from "../../lib/searchFacets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p) => strip(readFileSync(join(ROOT, p), "utf8"));

const engineSrc = read("lib/searchEngine.js");
const routeSrc = read("app/api/card-search/route.js");
const pageSrc = read("app/search/page.js");
const clientSrc = read("app/search/SearchClient.js");

// ===== one engine, two callers ===================================

test("lib/searchEngine.js exports runCardSearch", () => {
  assert.match(engineSrc, /export async function runCardSearch\(/);
});

test("the API route delegates the search to runCardSearch (no reimplementation)", () => {
  assert.match(routeSrc, /import \{ runCardSearch \} from "@\/lib\/searchEngine"/);
  assert.match(routeSrc, /await runCardSearch\(/);
  // the route no longer parses/resolves/scopes itself
  assert.ok(!/parseSearchIntent|resolveSearchIntent|findScopedDeals/.test(routeSrc), "route must not run the engine inline");
});

test("app/search/page.js runs the initial deep-link search via runCardSearch", () => {
  assert.match(pageSrc, /import \{ runCardSearch \} from "@\/lib\/searchEngine"/);
  assert.match(pageSrc, /runCardSearch\(\{[\s\S]*?q,[\s\S]*?\}\)/);
});

test("app/search/page.js does NOT make an internal HTTP hop to /api/card-search", () => {
  assert.ok(!/fetch\(\s*["'`][^"'`]*\/api\/card-search/.test(pageSrc), "no server->API fetch");
  assert.ok(!/fetch\(/.test(pageSrc), "the server page should not fetch() at all");
});

test("the initial search only runs for a real query (bare /search performs none)", () => {
  assert.match(pageSrc, /q\.length >= 2\s*\n?\s*\?\s*runCardSearch/);
  assert.match(pageSrc, /:\s*Promise\.resolve\(null\)/);
});

test("SearchClient receives the server result as props, not via a fetch", () => {
  assert.match(clientSrc, /initialSearchState/);
  assert.match(clientSrc, /initialSearchKey/);
  assert.match(pageSrc, /<SearchClient[\s\S]*initialSearchState=\{/);
});

// ===== searchStateKey: deterministic, normalized =================

test("searchStateKey is order-independent for the input object", () => {
  const a = searchStateKey({ q: "pikachu", type: "graded", grader: "PSA", grade: "10", country: "EBAY_US", sort: "discount" });
  const b = searchStateKey({ sort: "discount", grade: "10", country: "EBAY_US", grader: "PSA", type: "graded", q: "pikachu" });
  assert.equal(a, b);
});

test("searchStateKey folds query whitespace / case", () => {
  assert.equal(searchStateKey({ q: "  Evolving   Skies  Umbreon " }), searchStateKey({ q: "evolving skies umbreon" }));
});

test("searchStateKey normalizes contradictory / implied filters to one key", () => {
  // grader/grade imply graded; a stray type=raw is reconciled the same
  // way on both sides via normalizeDealFilters.
  const withType = searchStateKey({ q: "pikachu", type: "raw", grader: "PSA", grade: "10" });
  const withoutType = searchStateKey({ q: "pikachu", grader: "PSA", grade: "10" });
  assert.equal(withType, withoutType);
});

test("searchStateKey drops malformed filter values (same key as no filter)", () => {
  const bad = searchStateKey({ q: "pikachu", grade: "999", maxPrice: "-5", grader: "NOPE" });
  const none = searchStateKey({ q: "pikachu" });
  assert.equal(bad, none);
});

test("searchStateKey distinguishes states that really differ", () => {
  const base = searchStateKey({ q: "pikachu" });
  assert.notEqual(base, searchStateKey({ q: "pikachu", type: "graded" }));
  assert.notEqual(base, searchStateKey({ q: "pikachu", country: "EBAY_GB" }));
  assert.notEqual(base, searchStateKey({ q: "pikachu", sort: "price_asc" }));
  assert.notEqual(base, searchStateKey({ q: "charizard" }));
});

test("searchStateKey default sort is 'discount' (bare vs explicit match)", () => {
  assert.equal(searchStateKey({ q: "pikachu" }), searchStateKey({ q: "pikachu", sort: "discount" }));
});

test("searchStateKey has no page / tracking params", () => {
  const k = searchStateKey({ q: "pikachu" });
  assert.ok(!/page/.test(k) && !/utm/.test(k) && !/\bt\b/.test(k));
});

// ===== duplicate-fetch prevention wiring =========================

test("SearchClient consumes servedKeyRef once and skips the redundant fetch", () => {
  assert.match(clientSrc, /servedKeyRef = useRef\(initialSearchState \? initialSearchKey : null\)/);
  assert.match(
    clientSrc,
    /if \(servedKeyRef\.current && currentStateKey\(\) === servedKeyRef\.current\)\s*\{\s*servedKeyRef\.current = null;[\s\S]*?return;/
  );
});

test("the pre-hydration empty render never wipes the seeded result (urlActiveRef guard)", () => {
  assert.match(clientSrc, /else if \(urlActiveRef\.current\)\s*\{/);
  assert.match(clientSrc, /urlActiveRef\.current = true;/);
});

test("the server-rendered initial search emits its funnel events exactly once", () => {
  assert.match(clientSrc, /function emitInitialSearchAnalytics\(\)/);
  assert.match(clientSrc, /if \(initialAnalyticsRef\.current \|\| !initialSearchState\) return;\s*initialAnalyticsRef\.current = true;/);
  // it is invoked from the one place that consumes the served key
  assert.match(clientSrc, /servedKeyRef\.current = null;\s*emitInitialSearchAnalytics\(\);/);
});

test("no raw query text is added to analytics for the initial search", () => {
  // the SEARCH_REQUEST / RESULTS_SHOWN blobs carry classifyQueryIntent()
  // (structural) + enums only - never `q`.
  const fn = clientSrc.slice(
    clientSrc.indexOf("function emitInitialSearchAnalytics"),
    clientSrc.indexOf("function emitInitialSearchAnalytics") + 1600
  );
  assert.ok(!/capture\([^)]*\bq0\b/.test(fn), "raw query passed into a capture() call");
  assert.ok(!/\bquery:\s/.test(fn) && !/\bq:\s/.test(fn));
  assert.match(fn, /classifyQueryIntent\(q0\)/);
  assert.match(fn, /queryLength: q0\.length/); // length only, to Vercel track()
});
