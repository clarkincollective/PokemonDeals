// Phase 12C - public truth / claims / statistics consistency.
//
// Deterministic source-level guards against the inconsistencies the audit
// confirmed, so they can't silently regress:
//  * a listing COUNT must never be labelled "sellers" (eBay data gives us
//    no unique-seller identifier)
//  * "Popular now" / trending language must be backed by a current
//    behavioural signal or absent
//  * browse/directory copy must reflect the catalogue-backed architecture,
//    not the old deal-only one
//  * a species page must not stand one "N sets" number for two different
//    populations (catalogue sets vs sets-with-live-deals)
//  * /methodology must describe catalogue-backed pages, not "only exists
//    when a deal/listing appears"

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.jsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const APP_FILES = [...walk("app"), ...walk("components")].filter((f) => !f.includes("/api/"));

// === 1. no listing count labelled "sellers" ======================

test("1. no user-facing 'N sellers' / 'sellers competing' label anywhere in app/ or components/", () => {
  const offenders = [];
  for (const f of APP_FILES) {
    const src = stripComments(read(f));
    // "} sellers"  (JSX count),  "N sellers", "sellers competing", "most sellers"
    if (/\}\s*sellers\b|\d\+?\s*sellers\b|sellers competing|most sellers/i.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `still labels a count as sellers: ${offenders.join(", ")}`);
});

test("1b. the market-data 'most listed' page keeps its explicit 'not distinct sellers' disclaimer", () => {
  const src = read("app/market-data/most-listed-cards/page.js");
  assert.match(src, /not distinct sellers/i);
  assert.match(src, /\{card\.count\} listings/); // the row badge counts listings
});

test("1c. DealCard's hub count is labelled listing(s), not sellers", () => {
  const src = read("components/DealCard.js");
  assert.match(src, /\{hub\.count\} \{hub\.count === 1 \? "listing" : "listings"\}/);
  assert.doesNotMatch(stripComments(src), /\{hub\.count\} sellers/);
});

// === 2. popularity language is backed or absent ==================

test("2. HeroSearch does not claim 'Popular now' (the list is by active-listing count, not a behavioural signal)", () => {
  const src = read("components/HeroSearch.js");
  assert.doesNotMatch(src, /Popular now/i);
  assert.match(src, /Most listed:/); // truthful: ordered by current active-listing count
});

test("2b. no 'trending' / 'hot' / 'most viewed' / 'most searched' claim in public copy", () => {
  for (const f of APP_FILES) {
    const src = stripComments(read(f));
    assert.doesNotMatch(src, />\s*(Trending|Hot|Most viewed|Most searched)\s*</i, f);
  }
});

// === 3. browse/directory copy reflects the catalogue architecture =

test("3. homepage browse tiles are not described as deal-only", () => {
  const src = read("app/page.js");
  assert.doesNotMatch(src, /Every set with an active below-market deal, one set at a time/);
  assert.doesNotMatch(src, /Every deal for a species, across all its prints and sets/);
  // sets + pokemon tiles now mention checklists / prices / values
  assert.match(src, /Set checklists with market-reference prices/);
  assert.match(src, /Card prices and values for a species/);
});

test("3b. homepage 'most active listings' section is not titled 'Most sellers competing'", () => {
  const src = read("app/page.js");
  assert.doesNotMatch(src, /Most sellers competing/);
  assert.match(src, /Cards with the most active listings/);
});

// === 4. species page: catalogue sets vs live listings are distinct

test("4. /pokemon/[slug] 'every card we track across N sets' uses the CATALOGUE set count, not the deal-bearing one", () => {
  const src = read("app/pokemon/[slug]/page.js");
  // the "every ... card we track across N ... sets" sentence must key off priceSnapshot (catalogue), not resolved (deal hubs)
  assert.match(src, /Every \{resolved\.name\} card we track across \{priceSnapshot\.setCount\}/);
  assert.doesNotMatch(src, /card we track across \{resolved\.setCount\}/);
  // the compact fact strip pairs the catalogue card count with the catalogue set count
  assert.match(src, /\{allCards\.length\} cards . \{priceSnapshot\.setCount\}/);
  assert.doesNotMatch(src, /\{allCards\.length\} cards . \{resolved\.setCount\}/);
  // the live-listing clause still uses resolved.count (a listing count)
  assert.match(src, /\$\{resolved\.count\} live listing/);
  // both the header and the quick-answers block read from the same snapshot
  const qa = read("components/SpeciesQuickAnswers.js");
  assert.match(qa, /card \{cardCount === 1 \? "record" : "records"\} across/);
  assert.match(qa, /catalogue set/); // labelled, not a bare "set"
});

// === 5. methodology describes the current architecture ===========

test("5. /methodology explains catalogue-backed pages and does NOT say pages exist only when a deal/listing appears", () => {
  const src = read("app/methodology/page.js");
  assert.match(src, /catalogue-backed pages/i);
  assert.match(src, /can exist from catalogue data alone, with no live deal/i); // pokemon
  assert.match(src, /page can also exist from catalogue data alone/i); // set
  assert.match(src, /individual card page exists permanently even with no current deal/i);
  // stale deal-only phrasings must be absent
  assert.doesNotMatch(src, /page only exists when a (deal|listing)/i);
  assert.doesNotMatch(src, /created when a below-market listing appears/i);
  assert.doesNotMatch(src, /set pages exist only when an active deal/i);
  // freshness is honest: "last seen", not "verified X ago"
  assert.match(src, /last seen in a scan\. That is not the same as/i);
});

// === 6. no over-strong authenticity claim ======================

test("6. no 'guaranteed authentic' / '100% genuine' claim in public copy", () => {
  for (const f of APP_FILES) {
    const src = stripComments(read(f));
    assert.doesNotMatch(src, /guarantee\w*\s+(authentic|genuine|real)|100%\s+(authentic|genuine)|guaranteed\s+(authentic|genuine)/i, f);
  }
});

// === 7. market-reference language is not mislabelled as average/median

test("7. a single provider market reference is not called 'average' or 'median' in public copy", () => {
  for (const f of ["app/methodology/page.js", "app/how-it-works/page.js", "components/CardPriceSummary.js", "components/CardPriceIntelligence.js"]) {
    const src = stripComments(read(f));
    // it's fine to explain what a median/average IS in a guide; it's not fine to
    // call OUR market_price one. Guard the specific mislabel.
    assert.doesNotMatch(src, /our (average|median) (price|market)/i, f);
    assert.doesNotMatch(src, /market (price|reference) \(average\)/i, f);
  }
});

// === 8. no new route / sitemap family ==========================

test("8. Phase 12C adds no route family and no sitemap change", () => {
  for (const p of ["app/popular", "app/trending", "app/browse-by-generation"]) {
    let exists = true;
    try { statSync(join(ROOT, p)); } catch { exists = false; }
    assert.equal(exists, false, p);
  }
  assert.doesNotMatch(read("lib/sitemap.js"), /popular|trending/i);
});
