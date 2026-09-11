// EBAY-14R BOUNDARY - regression guard for the /search browser crash.
//
// lib/ebay.js is the SERVER eBay module (OAuth, Browse API calls and, since
// Phase 14R, per-invocation telemetry that imports `node:async_hooks`).
// Client-rendered components need only the pure helpers (MARKETPLACES,
// affiliate wrapping, search links, image URLs), which live in
// lib/ebayLinks.js. When a "use client" module - or anything it imports -
// reached lib/ebay.js, the whole server module was bundled for the
// browser and /search died on load with
//   Uncaught Error: Cannot find module 'node:async_hooks'
//
// These checks are static (no build, no network): an import-graph walk
// from every "use client" file, plus source contracts on the two modules.
// If a production build exists, the emitted browser chunks are checked too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => p.slice(REPO.length).split("\\").join("/").replace(/^\//, "");
const read = (p) => readFileSync(join(REPO, p), "utf8");

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(f)) files.push(p);
  }
};
for (const d of ["app", "components", "lib"]) walk(join(REPO, d));

function resolveImport(from, spec) {
  const base = spec.startsWith("@/") ? join(REPO, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js"), join(base, "index.mjs")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const deps = new Map();
const clientEntries = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (/^\s*["']use client["']/m.test(src)) clientEntries.push(f);
  const specs = [...src.matchAll(/(?:\bfrom|\brequire\(|\bimport\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
  deps.set(f, specs.map((s) => resolveImport(f, s)).filter(Boolean));
}

// Every module reachable from a "use client" entry, with the chain that reaches it.
function reachableFrom(entry) {
  const parent = new Map([[entry, null]]);
  const q = [entry];
  while (q.length) {
    const cur = q.shift();
    for (const d of deps.get(cur) ?? []) if (!parent.has(d)) { parent.set(d, cur); q.push(d); }
  }
  return parent;
}
const chainTo = (parent, target) => { const out = []; let x = target; while (x) { out.unshift(rel(x)); x = parent.get(x); } return out.join(" -> "); };

const SERVER_ONLY = ["lib/ebay.js", "lib/ebayTelemetry.js", "lib/ebayQuotaReport.js", "lib/supabaseAdmin.js"];

test("1. no \"use client\" module reaches lib/ebay.js or the telemetry (the /search crash)", () => {
  assert.ok(clientEntries.length >= 10, `expected the real client entry set, found ${clientEntries.length}`);
  const offenders = [];
  for (const entry of clientEntries) {
    const parent = reachableFrom(entry);
    for (const target of SERVER_ONLY) {
      const t = files.find((f) => rel(f) === target);
      if (t && parent.has(t)) offenders.push(chainTo(parent, t));
    }
  }
  assert.deepEqual(offenders, [], `server-only eBay code is reachable from the browser:\n  ${offenders.join("\n  ")}`);
  // sanity: the graph walk really does see the known client -> DealCard -> ebayLinks path
  const search = files.find((f) => rel(f) === "app/search/SearchClient.js");
  const links = files.find((f) => rel(f) === "lib/ebayLinks.js");
  assert.ok(reachableFrom(search).has(links), "SearchClient should reach lib/ebayLinks.js (the walk must not be vacuous)");
});

test("2. lib/ebayLinks.js is browser-safe: no Node built-ins, no telemetry, no provider client, no network", () => {
  const src = read("lib/ebayLinks.js").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /require\(["']node:|from ["']node:|require\(["'](fs|path|os|crypto|async_hooks|net|http|https)["']/, "Node built-in in a browser-safe module");
  assert.doesNotMatch(src, /ebayTelemetry|supabase|fetchWithRetry|\bfetch\(|getAccessToken|EBAY_CLIENT_SECRET/);
  const allowed = new Set(["./affiliateSurfaces"]);
  for (const m of src.matchAll(/require\(["']([^"']+)["']\)/g)) assert.ok(allowed.has(m[1]), `unexpected require in ebayLinks: ${m[1]}`);
  for (const name of ["MARKETPLACES", "EBAY_SEARCH_DOMAIN", "wrapEbayAffiliateUrl", "buildEbaySearchLink", "upscaleEbayImage", "primaryListingImage", "allListingImages"]) {
    assert.match(src, new RegExp(`\\b${name}\\b[\\s\\S]*module\\.exports[\\s\\S]*\\b${name}\\b`), `${name} defined + exported by ebayLinks`);
  }
});

test("3. lib/ebay.js stays the single server chokepoint: it re-exports the helpers and keeps the telemetry hook", () => {
  const src = read("lib/ebay.js");
  assert.match(src, /require\("\.\/ebayLinks"\)/, "server module re-exports the browser-safe helpers");
  assert.match(src, /require\("\.\/ebayTelemetry"\)/, "telemetry chokepoint intact (Phase 14R)");
  assert.match(src, /recordBrowseCall\(\);/, "every real Browse call is still counted");
  const code = src.replace(/\/\/[^\n]*/g, "");
  for (const name of ["const MARKETPLACES =", "function wrapEbayAffiliateUrl", "function buildEbaySearchLink", "function upscaleEbayImage", "function primaryListingImage", "function allListingImages", "const EBAY_SEARCH_DOMAIN ="]) {
    assert.ok(!code.includes(name), `${name} must not be duplicated in lib/ebay.js`);
  }
  for (const name of ["MARKETPLACES", "wrapEbayAffiliateUrl", "buildEbaySearchLink", "EBAY_SEARCH_DOMAIN", "upscaleEbayImage", "primaryListingImage", "allListingImages"]) {
    assert.match(code, new RegExp(`module\\.exports = \\{[\\s\\S]*\\b${name},`), `${name} still exported from lib/ebay.js`);
  }
  assert.match(read("lib/ebayTelemetry.js"), /require\("node:async_hooks"\)/, "telemetry legitimately uses async_hooks on the server");
});

test("4. only API routes import lib/ebay.js directly; pages, components and shared libs import lib/ebayLinks", () => {
  const importers = files.filter((f) => /(from ["']@\/lib\/ebay["']|require\(["']\.\/ebay["']\))/.test(readFileSync(f, "utf8"))).map(rel);
  const nonRoute = importers.filter((f) => !/^app\/api\//.test(f));
  assert.deepEqual(nonRoute, [], `non-API code must import lib/ebayLinks, not lib/ebay: ${nonRoute.join(", ")}`);
  const linkUsers = files.filter((f) => /lib\/ebayLinks|\.\/ebayLinks/.test(readFileSync(f, "utf8"))).map(rel);
  for (const must of ["app/search/SearchClient.js", "components/DealCard.js", "components/CardDealFilters.js"]) assert.ok(linkUsers.includes(must), `${must} must use ebayLinks`);
});

test("5. if a production build is present, no browser chunk contains the telemetry or a Node built-in import", () => {
  const dir = join(REPO, ".next", "static", "chunks");
  if (!existsSync(dir)) return; // static-only run; the live check is done by the build/smoke step
  const bad = [];
  const scan = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) scan(p); else if (f.endsWith(".js")) { const s = readFileSync(p, "utf8"); if (/node:async_hooks|ebay_job_runs|beginJobRun|identity\/v1\/oauth2\/token/.test(s)) bad.push(rel(p)); } } };
  scan(dir);
  assert.deepEqual(bad, [], `server-only eBay code leaked into browser chunks: ${bad.join(", ")}`);
});
