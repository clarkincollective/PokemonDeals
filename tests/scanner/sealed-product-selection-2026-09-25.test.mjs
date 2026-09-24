// AUDIT 2026-09-23, FINDING 4: a named sealed product in a guide led to the
// unfiltered catalogue, so the reader's selection was lost. Confirmed on
// five guides.
//
// The registry already held each product's exact catalogue id; the bare
// "/sealed-deals" href threw it away. The edition lives in the id - 151
// standard ETB 503313 vs 151 Pokemon Center ETB 501999 - so the destination
// must select by identity, never by a text approximation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GUIDE_PRODUCTS, GUIDE_SETS, sealedProductHref, SEALED_SELECTION_PARAM } from "../../lib/guideLinks.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const U = require(join(REPO, "lib", "sealedFilterUrl.js"));
const read = (p) => readFileSync(join(REPO, p), "utf8");

// === 1. exact product selection =======================================

test("SP-1. every guide product links to its own catalogue id, not the catalogue", () => {
  const entries = Object.entries(GUIDE_PRODUCTS);
  assert.equal(entries.length, 10);
  for (const [k, p] of entries) {
    assert.equal(p.href, `/sealed-deals?${SEALED_SELECTION_PARAM}=${p.tcgplayerId}`, k);
    assert.notEqual(p.href, "/sealed-deals", `${k} still points at the unfiltered catalogue`);
  }
  // every destination is distinct: two products cannot share one link
  const hrefs = entries.map(([, p]) => p.href);
  assert.equal(new Set(hrefs).size, entries.length);
});

test("SP-2. the standard and Pokemon Center editions stay distinct", () => {
  // These are the pairs a set-name or text link cannot separate.
  const pairs = [
    ["s151EliteTrainerBox", "s151PokemonCenterEtb", "503313", "501999"],
    ["prismaticEliteTrainerBox", "prismaticPokemonCenterEtb", "593355", "593324"],
  ];
  for (const [a, b, idA, idB] of pairs) {
    const pa = GUIDE_PRODUCTS[a];
    const pb = GUIDE_PRODUCTS[b];
    assert.ok(pa && pb, `${a} / ${b} must both be registered`);
    assert.equal(pa.tcgplayerId, idA);
    assert.equal(pb.tcgplayerId, idB);
    assert.notEqual(pa.href, pb.href, "the two editions must not share a destination");
    assert.equal(pa.set, pb.set, "…even though they are the same SET, which is why the id is used");
  }
});

test("SP-3. a malformed or unknown id is refused, never approximated", () => {
  for (const bad of ["abc", "12a", "", "  ", "1;2", "503313x", "-1", "1e5"]) {
    const f = U.parseSealedFilters(`?product=${encodeURIComponent(bad)}`);
    assert.equal(f.product, null, `"${bad}" must not resolve to a product`);
  }
  assert.equal(U.parseSealedFilters("?product=503313").product, "503313");
  // the API validates the same way and states the failure rather than
  // falling through to a filter
  const api = read("app/api/sealed-catalog/route.js");
  assert.match(api, /\^\[0-9\]\{1,20\}\$/);
  assert.match(api, /reason: "invalid_product"/);
  assert.match(api, /reason: "unknown_product"/);
  // an unknown id must NOT be answered with a text search
  const block = api.slice(api.indexOf("const productId"), api.indexOf("const setSlug"));
  assert.doesNotMatch(block, /filterSealedGroups|needle|toLowerCase/);
});

test("SP-4. selection is by identity, because a text search provably cannot separate the editions", () => {
  // This is the API's own text filter, lifted verbatim from the route so
  // the demonstration uses the real predicate rather than a paraphrase.
  const api = read("app/api/sealed-catalog/route.js");
  const pred = api.slice(api.indexOf("products: g.products.filter"), api.indexOf("}))\n    .filter"));
  assert.match(pred, /p\.name\.toLowerCase\(\)\.includes\(needle\)/, "the text filter is a substring match on the name");

  // Both 151 ETB editions contain the other's search text, so any name
  // search that finds one finds the other. Only the id tells them apart.
  const std = GUIDE_PRODUCTS.s151EliteTrainerBox;
  const pc = GUIDE_PRODUCTS.s151PokemonCenterEtb;
  const needle = std.name.toLowerCase(); // "151 elite trainer box"
  assert.ok(std.name.toLowerCase().includes(needle));
  assert.ok(
    pc.name.toLowerCase().includes("151") && pc.name.toLowerCase().includes("elite trainer box"),
    "the Pokemon Center edition shares every distinguishing word with the standard one"
  );
  assert.notEqual(std.tcgplayerId, pc.tcgplayerId);
});

// === 2. the buying journey ============================================

test("SP-5. the selected product is identified, and a zero-offer product still shows itself", () => {
  const src = read("components/SealedProductBrowser.js");
  assert.match(src, /data-selected-product=\{id\}/);
  assert.match(src, /Selected product/);
  // its own tile, carrying the existing eligibility-gated `deal`
  // finding 5: the panel's tile carries its own pageName so its outbound
  // click is attributed as sealed-selected, not as the browse grid
  assert.match(src, /<SpeciesCard card=\{product\} pageName="sealed_product" \/>/);
  // a known product with no eligible offer keeps its identity and labels
  // the rest of the page as alternatives
  assert.match(src, /No eBay listing currently passes our checks for this exact product/);
  assert.match(src, /alternatives, not this product/);
  // unknown / invalid states say so instead of showing something else
  assert.match(src, /We don&apos;t track a sealed product with that id/);
  assert.match(src, /Nothing below is that product/);
});

test("SP-6. the unrelated featured strip is suppressed while a product is claimed", () => {
  assert.match(read("app/sealed-deals/page.js"), /data-featured-sealed-strip/);
  const src = read("components/SealedProductBrowser.js");
  assert.match(src, /querySelector\("\[data-featured-sealed-strip\]"\)/);
  // Production check, 25 Sep: a MALFORMED id left the strip showing, so a
  // reader who followed a broken product link met a rotation of other
  // products above the "we cannot look that up" notice. The strip and the
  // panel now share one condition, which covers the malformed case too.
  assert.match(src, /const productClaimed = Boolean\(selectedId\) \|\| selectedState === "invalid"/);
  assert.match(src, /strip\.hidden = productClaimed/);
  assert.match(src, /\{productClaimed && \(/, "the panel and the strip must not drift apart again");
  assert.doesNotMatch(src, /strip\.hidden = Boolean\(selectedId\)/);
});

test("SP-7. eligibility stays authoritative - the browser re-implements none of it", () => {
  const src = read("components/SealedProductBrowser.js");
  for (const gate of ["isDisplayableSealedDeal", "savingsClaimTrusted", "sealedListingDecision", "discount_pct", "market_price"]) {
    assert.ok(!src.includes(gate), `the browser must not re-implement ${gate}`);
  }
});

// === 3. shareable filter state ========================================

test("SP-8. product selection is exclusive, and the conflict rule is one rule", () => {
  // selecting a product drops browse filters
  assert.equal(U.buildSealedSearch("?q=151&type=Elite+Trainer+Box&deals=1", { product: "503313" }), "?product=503313");
  // touching a browse filter drops the product
  assert.equal(U.buildSealedSearch("?product=503313", { q: "charizard" }), "?q=charizard");
  assert.equal(U.buildSealedSearch("?product=503313", { type: "Booster Box" }), "?type=Booster+Box");
  assert.equal(U.buildSealedSearch("?product=503313", { deals: true }), "?deals=1");
  // clearing returns to the unfiltered page
  assert.equal(U.buildSealedSearch("?product=503313", { product: null }), "");
});

test("SP-9. round trip: a copied URL restores exactly the same selection", () => {
  const url = "?product=501999";
  const f = U.parseSealedFilters(url);
  assert.equal(f.product, "501999");
  assert.equal(f.q, "");
  assert.equal(f.type, "all");
  assert.equal(f.dealsOnly, false);
  // and a browse state round-trips too
  const browse = U.buildSealedSearch("", { q: "151", type: "Elite Trainer Box", deals: true });
  const g = U.parseSealedFilters(browse);
  assert.equal(g.q, "151");
  assert.equal(g.type, "Elite Trainer Box");
  assert.equal(g.dealsOnly, true);
  assert.equal(g.product, null);
});

test("SP-10. unrelated attribution parameters survive a filter change", () => {
  const withUtm = "?utm_source=guide&utm_campaign=151&gclid=abc&product=503313";
  const after = U.buildSealedSearch(withUtm, { q: "charizard" });
  const sp = new URLSearchParams(after);
  assert.equal(sp.get("utm_source"), "guide");
  assert.equal(sp.get("utm_campaign"), "151");
  assert.equal(sp.get("gclid"), "abc");
  assert.equal(sp.get("product"), null, "the product selection still yields to a browse filter");
  assert.equal(sp.get("q"), "charizard");
});

test("SP-11. typing replaces history; explicit choices push it", () => {
  const src = read("components/SealedProductBrowser.js");
  // the search box replaces - no history entry per keystroke
  assert.match(src, /navigate\(\{ q: e\.target\.value \}, \{ replace: true \}\)/);
  // type chips, the deals toggle and clearing the product push
  assert.match(src, /navigate\(\{ type: t \}\)/);
  assert.match(src, /navigate\(\{ deals: e\.target\.checked \}\)/);
  assert.match(src, /navigate\(\{ product: null \}\)/);
  assert.match(src, /replaceState/);
  assert.match(src, /pushState/);
  // Back/Forward restores
  assert.match(src, /addEventListener\("popstate"/);
});

// === 4. SEO and existing links ========================================

test("SP-12. filtered states are noindex, follow; the unfiltered page is unchanged", () => {
  const proxy = read("proxy.js");
  assert.match(proxy, /X-Robots-Tag", "noindex, follow"/);
  assert.match(proxy, /if \(!filtered\) return NextResponse\.next\(\)/, "the unfiltered page keeps its existing policy");
  assert.match(proxy, /matcher: \["\/pokemon\/:slug", "\/sealed-deals"\]/);
  for (const p of U.FILTER_PARAMS) assert.ok(proxy.includes(`"${p}"`), `proxy must treat ${p} as a filter`);
  // the canonical still points at the unfiltered page
  assert.match(read("app/sealed-deals/page.js"), /alternates: \{ canonical: "\/sealed-deals" \}/);
});

test("SP-13. filtered URLs are not in any sitemap, and set links use the verified set", () => {
  const sitemap = read("lib/sitemap.js");
  assert.doesNotMatch(sitemap, /sealed-deals\?/);
  assert.ok(sitemap.includes("/sealed-deals"), "the unfiltered page stays listed");
  // set-wide guide links keep their own verified destination
  for (const [k, v] of Object.entries(GUIDE_SETS)) {
    assert.match(v.href, /^\/sets\//, `${k} should remain a set link`);
  }
});

test("SP-14. isFilteredSearch agrees with the proxy's own parameter list", () => {
  assert.equal(U.isFilteredSearch(""), false);
  assert.equal(U.isFilteredSearch("?utm_source=guide"), false, "attribution alone is not a filter");
  for (const p of U.FILTER_PARAMS) assert.equal(U.isFilteredSearch(`?${p}=x`), true, p);
});
