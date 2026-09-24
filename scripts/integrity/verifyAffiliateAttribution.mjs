// AUDIT 2026-09-23, FINDING 5 — affiliate attribution census.
//
// READ-ONLY. Fetches the SERVER-RENDERED HTML of representative routes on
// the target origin and inspects every outbound affiliate href it finds:
// eBay's `customid` and Impact's `subId1`. It never requests an ebay.com
// or partner.tcgplayer.com URL, so it cannot generate an affiliate click,
// impression, order or commission, and it writes nothing anywhere.
//
//   node scripts/integrity/verifyAffiliateAttribution.mjs [origin]
//
// Exit 1 if any check fails. Checks, in order of what actually matters:
//   1. every attributed href uses the <page>-<placement> format from
//      lib/affiliateAttribution.js, with both halves in the vocabulary
//   2. campid and the destination survive on every eBay href
//   3. no identifier carries anything that needs escaping
//   4. the fallback share, reported per route and overall
//   5. the routes the audit named are no longer 100% fallback

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const A = require(join(ROOT, "lib", "affiliateAttribution.js"));

const BASE = process.argv[2] ?? "https://pokemondealfinder.com";

// Routes chosen to cover every page token the vocabulary defines that has
// a stable public URL, plus the four the census found stranded.
const ROUTES = [
  ["home", "/"],
  ["deals index", "/deals"],
  ["best finds", "/best-finds"],
  ["japanese cards", "/japanese-cards"],
  ["latest releases", "/latest-releases"],
  ["species detail", "/pokemon/charizard"],
  ["cards directory", "/cards"],
  ["sealed index", "/sealed-deals"],
  ["sealed selected product", "/sealed-deals?product=593355"],
  ["sealed zero-offer product", "/sealed-deals?product=503313"],
  ["guide 151", "/guides/pokemon-151-buying-guide"],
  ["guide booster box prices", "/guides/pokemon-booster-box-prices"],
];

// Routes that were 100% fallback in the 2026-09-25 pre-change census and
// must not be any more.
const MUST_IMPROVE = new Set(["japanese cards", "latest releases", "sealed index", "sealed selected product"]);

const EBAY_HOST = /(^|\.)ebay\.(com|co\.uk|com\.au|ca|de|it)$/i;
const FALLBACK = "other-other";

const problems = [];
const totals = new Map();
const rows = [];

function hrefsIn(html) {
  const out = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    out.push(m[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"'));
  }
  return out;
}

for (const [label, path] of ROUTES) {
  let html;
  try {
    const res = await fetch(BASE + path, { headers: { "user-agent": "pdf-attribution-census" } });
    if (!res.ok) {
      problems.push(`${label}: HTTP ${res.status}`);
      continue;
    }
    html = await res.text();
  } catch (err) {
    problems.push(`${label}: ${err.message}`);
    continue;
  }

  const per = new Map();
  let impact = 0;

  for (const href of hrefsIn(html)) {
    let u;
    try {
      u = new URL(href);
    } catch {
      continue;
    }

    const isEbay = EBAY_HOST.test(u.hostname);
    const isImpact = u.hostname === "partner.tcgplayer.com";
    if (!isEbay && !isImpact) continue;

    const param = isEbay ? "customid" : A.IMPACT_SUBID_PARAM;
    const id = u.searchParams.get(param);

    if (id == null || id === "") {
      problems.push(`${label}: an outbound ${isEbay ? "eBay" : "Impact"} href carries no ${param}`);
      continue;
    }

    // 1. format and vocabulary
    if (!A.VALID_ATTRIBUTION.test(id)) {
      problems.push(`${label}: ${param}="${id}" is not <page>-<placement>`);
      continue;
    }
    const [page, placement] = id.split("-");
    if (!A.AFFILIATE_PAGES.has(page)) problems.push(`${label}: unknown page token "${page}" in "${id}"`);
    if (!A.AFFILIATE_PLACEMENTS.has(placement)) problems.push(`${label}: unknown placement "${placement}" in "${id}"`);

    // 3. nothing that needs escaping, nothing oversized
    if (encodeURIComponent(id) !== id) problems.push(`${label}: "${id}" would be re-encoded in a URL`);
    if (id.length > A.MAX_ATTRIBUTION_LEN) problems.push(`${label}: "${id}" exceeds ${A.MAX_ATTRIBUTION_LEN} chars`);

    // 2. campaign and destination survive
    if (isEbay) {
      if (!u.searchParams.get("campid")) problems.push(`${label}: eBay href lost campid (${id})`);
      const dest = u.pathname;
      if (!/^\/(itm|sch)\//.test(dest)) problems.push(`${label}: unexpected eBay destination ${dest}`);
      if (dest.startsWith("/sch/") && !u.searchParams.get("_nkw")) {
        problems.push(`${label}: eBay search href lost _nkw (${id})`);
      }
    } else {
      impact++;
      const dest = u.searchParams.get("u");
      if (!dest || !dest.startsWith("https://www.tcgplayer.com/")) {
        problems.push(`${label}: Impact href lost its u= destination (${id})`);
      }
      if (u.searchParams.get("customid")) problems.push(`${label}: an Impact href carries eBay's customid`);
    }

    per.set(id, (per.get(id) ?? 0) + 1);
    totals.set(id, (totals.get(id) ?? 0) + 1);
  }

  const count = [...per.values()].reduce((n, c) => n + c, 0);
  const fallback = per.get(FALLBACK) ?? 0;
  rows.push({ label, path, count, impact, fallback, per: [...per.entries()].sort((a, b) => b[1] - a[1]) });

  // 5. the named routes must no longer be entirely fallback
  if (MUST_IMPROVE.has(label) && count > 0 && fallback === count) {
    problems.push(`${label}: still 100% ${FALLBACK} (${count} hrefs) - this is one of the routes the audit named`);
  }
}

// The sealed catalogue's client-rendered tiles are not in the page HTML,
// so check the JSON the browser actually receives. This is the site's own
// API, never an affiliate host. A product delivered here must arrive with
// a campaign-wrapped href: the browser cannot add a campaign id itself,
// and a link without one earns nothing.
for (const [label, path] of [
  ["api: selected product", "/api/sealed-catalog?product=503313"],
  ["api: one set", "/api/sealed-catalog?set=sv-prismatic-evolutions"],
]) {
  try {
    const res = await fetch(BASE + path, { headers: { "user-agent": "pdf-attribution-census" } });
    if (!res.ok) {
      problems.push(`${label}: HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    const products = json.product ? [json.product] : (json.products ?? []);
    if (products.length === 0) {
      problems.push(`${label}: no products returned`);
      continue;
    }
    let missingHref = 0;
    let missingCampid = 0;
    for (const p of products) {
      if (!p.ebayHref) {
        missingHref++;
        continue;
      }
      if (!new URL(p.ebayHref).searchParams.get("campid")) missingCampid++;
    }
    if (missingHref) problems.push(`${label}: ${missingHref}/${products.length} products have no ebayHref`);
    if (missingCampid) problems.push(`${label}: ${missingCampid}/${products.length} hrefs carry no campid`);
    console.log(`${label.padEnd(26)} products:${String(products.length).padEnd(4)} no-href:${missingHref}  no-campid:${missingCampid}`);
  } catch (err) {
    problems.push(`${label}: ${err.message}`);
  }
}

console.log(`\n# affiliate attribution census — ${BASE}\n`);
for (const r of rows) {
  const pct = r.count ? ((r.fallback / r.count) * 100).toFixed(1) : "0.0";
  console.log(`${r.label.padEnd(26)} links:${String(r.count).padEnd(5)} impact:${String(r.impact).padEnd(4)} fallback:${pct}%`);
  console.log(`  ${r.per.map(([k, c]) => `${k}=${c}`).join("  ") || "(none)"}`);
}

const grand = [...totals.entries()].sort((a, b) => b[1] - a[1]);
const all = grand.reduce((n, [, c]) => n + c, 0);
const fb = totals.get(FALLBACK) ?? 0;
console.log(`\n## ${all} attributed outbound hrefs across ${rows.length} routes`);
for (const [k, c] of grand) console.log(`  ${k.padEnd(22)} ${String(c).padStart(5)}  ${((c / all) * 100).toFixed(1)}%`);
console.log(`\nfallback (${FALLBACK}): ${fb} / ${all} = ${all ? ((fb / all) * 100).toFixed(1) : "0.0"}%`);

if (problems.length) {
  console.log(`\n## ${problems.length} PROBLEM(S)`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log("\n0 problems.");
