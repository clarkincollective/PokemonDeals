// AUDIT 2026-09-23, FINDING 8 — a variant search must keep the card's
// verified identity instead of broadening to every card sharing its name.
//
// Behavioural: the real builder produces the real query, and the real
// affiliate builder produces the real URL, which is then DECODED and
// asserted - not matched as a substring of source code. No network call,
// no database read, and no eBay or Impact URL is requested.
//
// MEASURED BEFORE THE FIX, read-only against live hubs 2026-09-24
// (scripts/integrity/auditVariantSearches.mjs): of 16 card hubs rendering
// graded variant tiles, 16 lost the SET and 9 also lost the COLLECTOR
// NUMBER. components/CardMarketPanel was never passed either, so the grid
// could not have used them.
process.env.EBAY_CAMPAIGN_ID = "5339197414";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const Q = require(join(ROOT, "lib", "cardSearchQuery.js"));
const { buildEbaySearchLink } = require(join(ROOT, "lib", "ebayLinks.js"));

// The decoded `_nkw` of a link the site would really render.
const decodedQuery = (href) => new URL(href).searchParams.get("_nkw");

// === 1. the audit's example, and the class it belongs to ===============

test("VS-1. the Gengar case: two sets, one name, one number — the set separates them", () => {
  // The catalogue really holds "Gengar (Prime)" twice under 94/102:
  // Triumphant, and ME: 30th Celebration Classic Collection. A name-only
  // query cannot tell them apart even in principle.
  const triumphant = Q.buildCardSearchQuery({ name: "Gengar (Prime)", set: "Triumphant", cardNumber: "94/102", grade: "PSA 10" });
  const reprint = Q.buildCardSearchQuery({
    name: "Gengar (Prime)",
    set: "ME: 30th Celebration Classic Collection",
    cardNumber: "94/102",
    grade: "PSA 10",
  });
  assert.equal(triumphant, "Gengar (Prime) 94/102 Triumphant PSA 10");
  assert.equal(reprint, "Gengar (Prime) 94/102 30th Celebration Classic Collection PSA 10");
  assert.notEqual(triumphant, reprint, "the two printings must not produce the same search");
  // the old behaviour, for the record
  assert.equal(`Gengar (Prime) PSA 10`, "Gengar (Prime) PSA 10");
  assert.ok(!"Gengar (Prime) PSA 10".includes("94/102"));
});

test("VS-2. the same Pokemon in different sets produces different searches", () => {
  const a = Q.buildCardSearchQuery({ name: "Scizor GX", set: "Hidden Fates: Shiny Vault", cardNumber: "SV72/SV94", grade: "PSA 10" });
  const b = Q.buildCardSearchQuery({ name: "Scizor GX", set: "SM - Burning Shadows", cardNumber: "19/147", grade: "PSA 10" });
  assert.equal(a, "Scizor GX SV72/SV94 Hidden Fates Shiny Vault PSA 10");
  assert.equal(b, "Scizor GX 19/147 Burning Shadows PSA 10");
  assert.notEqual(a, b);
});

// === 2. numbers already embedded in the catalogue name =================

test("VS-3. a number already in the name is not repeated", () => {
  assert.equal(
    Q.buildCardSearchQuery({ name: "Glaceon ex - 150/131", set: "SV: Prismatic Evolutions", cardNumber: "150/131", grade: "PSA 10" }),
    "Glaceon ex 150/131 Prismatic Evolutions PSA 10"
  );
  assert.equal(
    Q.buildCardSearchQuery({ name: "Jirachi - XY112", set: "XY Promos", cardNumber: "XY112", grade: "PSA 8" }),
    "Jirachi XY112 XY Promos PSA 8"
  );
  // exactly one occurrence of the number
  const q = Q.buildCardSearchQuery({ name: "Pikachu ex - 238/191", set: "SV08: Surging Sparks", cardNumber: "238/191" });
  assert.equal(q.split("238/191").length - 1, 1);
});

test("VS-4. a DIFFERENT number in the name is identity and is kept", () => {
  // "M Gengar EX (121 Secret Rare)" carries 121; the structured number is
  // 121/119. They are not the same string, so nothing is stripped blindly.
  const q = Q.buildCardSearchQuery({ name: "M Gengar EX (121 Secret Rare)", set: "XY - Phantom Forces", cardNumber: "121/119" });
  assert.match(q, /M Gengar EX/);
  assert.match(q, /121\/119/);
});

// === 3. number shapes that must survive verbatim =======================

test("VS-5. leading zeros, promo codes and gallery numbers are preserved exactly", () => {
  assert.match(
    Q.buildCardSearchQuery({ name: "Sabrina's Gengar", set: "Gym Challenge", cardNumber: "029/132" }),
    /\b029\/132\b/
  );
  assert.match(Q.buildCardSearchQuery({ name: "Venusaur EX - XY123", set: "XY Promos", cardNumber: "XY123" }), /\bXY123\b/);
  assert.match(
    Q.buildCardSearchQuery({ name: "Scizor GX", set: "Hidden Fates: Shiny Vault", cardNumber: "SV72/SV94" }),
    /\bSV72\/SV94\b/
  );
  // a secret-rare number above the set size is not "corrected"
  assert.match(
    Q.buildCardSearchQuery({ name: "Mega Lopunny & Jigglypuff GX (Secret)", set: "SM - Cosmic Eclipse", cardNumber: "261/236" }),
    /\b261\/236\b/
  );
  // 009/102 is NOT rewritten to 9/102 in the query
  const q = Q.buildCardSearchQuery({ name: "Magneton", set: "Base Set (Shadowless)", cardNumber: "009/102" });
  assert.ok(q.includes("009/102"));
  assert.ok(!/\b9\/102\b/.test(q.replace("009/102", "")));
});

test("VS-6. a leading-zero number embedded in the name still matches and is not duplicated", () => {
  // name says 9/102, structured field says 009/102 - the same number.
  const q = Q.buildCardSearchQuery({ name: "Magneton - 9/102", set: "Base Set", cardNumber: "009/102" });
  assert.equal(q, "Magneton 009/102 Base Set");
  assert.equal(q.split("/102").length - 1, 1, "the number appears once");
});

// === 4. the explicitly selected grade ==================================

test("VS-7. the selected grader and grade are appended, and only when selected", () => {
  const base = { name: "Jessie & James (Full Art)", set: "Hidden Fates", cardNumber: "68/68" };
  assert.equal(Q.buildCardSearchQuery(base), "Jessie & James (Full Art) 68/68 Hidden Fates");
  assert.equal(Q.buildCardSearchQuery({ ...base, grade: "PSA 10" }), "Jessie & James (Full Art) 68/68 Hidden Fates PSA 10");
  assert.equal(Q.buildCardSearchQuery({ ...base, grade: "CGC 9" }), "Jessie & James (Full Art) 68/68 Hidden Fates CGC 9");
  assert.equal(Q.buildCardSearchQuery({ ...base, grade: "BGS 9.5" }), "Jessie & James (Full Art) 68/68 Hidden Fates BGS 9.5");
  // a condition is carried in the same slot by the deal page
  assert.equal(Q.buildCardSearchQuery({ ...base, grade: "Lightly Played" }), "Jessie & James (Full Art) 68/68 Hidden Fates Lightly Played");
});

test("VS-8. the reader's selected variant is never swapped for another", () => {
  const psa10 = Q.buildCardSearchQuery({ name: "Pikachu ex", set: "SV08: Surging Sparks", cardNumber: "238/191", grade: "PSA 10" });
  const psa7 = Q.buildCardSearchQuery({ name: "Pikachu ex", set: "SV08: Surging Sparks", cardNumber: "238/191", grade: "PSA 7" });
  assert.match(psa10, /PSA 10$/);
  assert.match(psa7, /PSA 7$/);
  assert.notEqual(psa10, psa7);
});

// === 5. printing: verified only, never invented ========================

test("VS-9. no printing or finish is added unless a caller verifies one", () => {
  const q = Q.buildCardSearchQuery({ name: "Magneton", set: "Base Set (Shadowless)", cardNumber: "009/102" });
  assert.doesNotMatch(q, /holofoil|reverse|unlimited|1st edition/i, "a finish is never assumed");
  // the slot exists for a caller that does verify one
  assert.match(
    Q.buildCardSearchQuery({ name: "Magneton", set: "Base Set", cardNumber: "009/102", printing: "1st Edition" }),
    /1st Edition/
  );
  // and no shipped caller passes it today
  for (const f of ["components/VariantPriceGrid.js", "app/deals/[id]/page.js", "app/cards/[slug]/page.js"]) {
    assert.doesNotMatch(read(f), /buildCardSearchQuery\([^)]*printing:/s, `${f} must not pass an unverified printing`);
  }
});

test("VS-10. Reverse Holofoil is never a default", () => {
  for (const name of ["Charizard", "Pikachu", "Magneton"]) {
    assert.doesNotMatch(Q.buildCardSearchQuery({ name, set: "Base Set", cardNumber: "4/102" }), /reverse/i);
  }
});

// === 6. language ======================================================

test("VS-11. language is added only when established and not English", () => {
  const base = { name: "Charizard", set: "Base Set", cardNumber: "4/102" };
  assert.equal(Q.buildCardSearchQuery({ ...base, language: "japanese" }), "Charizard 4/102 Base Set Japanese");
  assert.equal(Q.buildCardSearchQuery({ ...base, language: "english" }), "Charizard 4/102 Base Set");
  assert.equal(Q.buildCardSearchQuery({ ...base, language: null }), "Charizard 4/102 Base Set");
  assert.equal(Q.buildCardSearchQuery({ ...base, language: "" }), "Charizard 4/102 Base Set");
});

// === 7. missing identity ==============================================

test("VS-12. absent fields are absent — never replaced with invented specificity", () => {
  assert.equal(Q.buildCardSearchQuery({ name: "Charizard" }), "Charizard");
  assert.equal(Q.buildCardSearchQuery({ name: "Charizard", set: "Base Set" }), "Charizard Base Set");
  assert.equal(Q.buildCardSearchQuery({ name: "Charizard", cardNumber: "4/102" }), "Charizard 4/102");
  assert.equal(Q.buildCardSearchQuery({ name: "Charizard", set: null, cardNumber: null, language: null, grade: null }), "Charizard");
  // nothing blows up, nothing invents
  assert.equal(Q.buildCardSearchQuery({}), "");
  assert.equal(Q.buildCardSearchQuery(), "");
  assert.equal(Q.buildCardSearchQuery({ name: "   " }), "");
});

test("VS-13. a number the name carries is used when the structured field is missing", () => {
  // The hub objects carry name + set only; the number is recoverable.
  const q = Q.buildCardSearchQuery({ name: "Jirachi ex - 155/128", set: "ME: 30th Celebration" });
  assert.equal(q, "Jirachi ex 155/128 30th Celebration");
});

// === 8. set normalisation is search-only ==============================

test("VS-14. the era prefix is stripped for search, and only where it is a real prefix", () => {
  assert.equal(Q.setForSearch("SWSH08: Fusion Strike"), "Fusion Strike");
  assert.equal(Q.setForSearch("SM - Team Up"), "Team Up");
  assert.equal(Q.setForSearch("ME: 30th Celebration"), "30th Celebration");
  assert.equal(Q.setForSearch("SV: Prismatic Evolutions"), "Prismatic Evolutions");
  // no separator -> left whole
  assert.equal(Q.setForSearch("EX Delta Species"), "EX Delta Species");
  assert.equal(Q.setForSearch("XY Promos"), "XY Promos");
  assert.equal(Q.setForSearch("SM Promos"), "SM Promos");
  // inner punctuation flattened, not dropped
  assert.equal(Q.setForSearch("Hidden Fates: Shiny Vault"), "Hidden Fates Shiny Vault");
  assert.equal(Q.setForSearch("Base Set (Shadowless)"), "Base Set Shadowless");
  assert.equal(Q.setForSearch(null), "");
  assert.equal(Q.setForSearch(""), "");
});

// === 9. the real URL: encoding, destination, affiliate parameters =====

test("VS-15. the rendered href decodes back to exactly the query, with the category filter kept", () => {
  const q = Q.buildCardSearchQuery({ name: "Jessie & James (Full Art)", set: "Hidden Fates", cardNumber: "68/68", grade: "PSA 10" });
  const href = buildEbaySearchLink(q, undefined, { page: "card", placement: "variant" });
  const u = new URL(href);
  assert.equal(decodedQuery(href), "Jessie & James (Full Art) 68/68 Hidden Fates PSA 10");
  // the ampersand and slash survive a round trip through the URL
  assert.ok(u.search.includes("%26"), "the & is encoded in the raw query string");
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.pathname, "/sch/i.html");
  assert.equal(u.searchParams.get("_sacat"), "183454", "the Pokemon singles category filter is unchanged");
});

test("VS-16. affiliate attribution and marketplace routing are preserved", () => {
  const q = Q.buildCardSearchQuery({ name: "Scizor GX", set: "Hidden Fates: Shiny Vault", cardNumber: "SV72/SV94", grade: "PSA 10" });
  for (const [mp, host] of [
    ["EBAY_US", "www.ebay.com"],
    ["EBAY_GB", "www.ebay.co.uk"],
    ["EBAY_AU", "www.ebay.com.au"],
  ]) {
    const u = new URL(buildEbaySearchLink(q, mp, { page: "card", placement: "variant" }));
    assert.equal(u.hostname, host, "the destination marketplace is unchanged");
    assert.equal(u.searchParams.get("campid"), "5339197414");
    assert.equal(u.searchParams.get("customid"), "card-variant", "the finding 5 page/placement contract holds");
    assert.equal(u.searchParams.get("toolid"), "10049");
    assert.equal(u.searchParams.get("mkrid"), "711-53200-19255-0");
    assert.equal(decodedQuery(u.toString()), q);
  }
});

test("VS-17. the builder emits a plain string and pre-encodes nothing", () => {
  const q = Q.buildCardSearchQuery({ name: "Jessie & James (Full Art)", set: "Hidden Fates", cardNumber: "68/68" });
  assert.equal(typeof q, "string");
  assert.doesNotMatch(q, /%[0-9A-F]{2}/i, "no double encoding");
  assert.doesNotMatch(q, /\s{2,}/, "no collapsed-away double spaces");
  assert.equal(q, q.trim());
});

// === 10. honest labelling =============================================

test("VS-18. a search is labelled as a search, never as available inventory", () => {
  assert.equal(Q.cardSearchLabel("PSA 10"), "Search eBay for PSA 10 copies");
  assert.equal(Q.cardSearchLabel(null), "Search eBay listings");
  assert.equal(Q.cardSearchLabel(""), "Search eBay listings");
  for (const label of [Q.cardSearchLabel("PSA 10"), Q.cardSearchLabel(null)]) {
    assert.doesNotMatch(label, /\b(offer|available|in stock|buy now|deal)\b/i);
  }
  // the grid renders the label rather than the old "Find on eBay"
  const grid = read("components/VariantPriceGrid.js");
  assert.match(grid, /cardSearchLabel\(g\.label\)/);
  assert.match(grid, /cardSearchLabel\(null\)/);
  assert.doesNotMatch(grid, />Find on eBay →</);
});

// === 11. the wiring that made the defect possible =====================

test("VS-19. the grid is given the identity it needs, from both call sites", () => {
  const grid = read("components/VariantPriceGrid.js");
  assert.match(grid, /buildCardSearchQuery\(\{ name: cardName, set, cardNumber, language \}\)/);
  assert.match(grid, /buildCardSearchQuery\(\{ name: cardName, set, cardNumber, language, grade: g\.label \}\)/);
  assert.doesNotMatch(grid, /searchQuery=\{cardName\}/, "the bare-name query is gone");

  const panel = read("components/CardMarketPanel.js");
  assert.match(panel, /cardNumber=\{analysis\.cardNumber \?\? null\}/);
  assert.match(panel, /set=\{set\}/);
  assert.match(read("app/cards/[slug]/page.js"), /set=\{hub\.set\}/);
  assert.match(read("components/CatalogCardView.js"), /set=\{set\}/);
});

test("VS-20. every search builder on a card or deal page goes through the shared query", () => {
  for (const f of ["app/cards/[slug]/page.js", "app/deals/[id]/page.js", "components/VariantPriceGrid.js"]) {
    const src = read(f);
    for (const m of src.matchAll(/buildEbaySearchLink\(\s*([^,]+),/g)) {
      const firstArg = m[1].trim();
      assert.ok(
        firstArg.startsWith("buildCardSearchQuery(") || firstArg === "searchQuery" || firstArg.startsWith("//"),
        `${f}: a search query not built from the shared identity builder: ${firstArg.slice(0, 60)}`
      );
    }
  }
});

test("VS-21. no duplicate click handler and no analytics event name changed", () => {
  const grid = read("components/VariantPriceGrid.js");
  // still exactly one emitter per tile, still the same Vercel event name
  assert.equal((grid.match(/<AffiliateLink/g) ?? []).length, 1);
  assert.match(grid, /eventName="eBay Click"/);
  assert.match(grid, /page: "variant_grid"/);
  assert.doesNotMatch(grid, /onClick=/, "the tile adds no handler of its own");
});

// === 12. the campaign id must survive the client-render boundary =======
//
// Found on production AFTER the query fix shipped: the queries and the
// customid were right and `campid` was null, because the variant grid
// renders in the BROWSER where EBAY_CAMPAIGN_ID is a server-only
// variable. Same defect class as the sealed catalogue's (a6c4ae3) and the
// same fix - the server builds the campaign-bearing href.

test("VS-22. /api/card-analysis serves a campaign-bearing href per variant", () => {
  const route = read("app/api/card-analysis/route.js");
  assert.match(route, /function variantSearchHrefs\(card, analysis\)/);
  assert.match(route, /buildEbaySearchLink\(buildCardSearchQuery\(\{ \.\.\.identity, grade \}\)/);
  assert.match(route, /out\.raw = href\(null\)|const out = \{ raw: href\(null\) \}/);
  assert.match(route, /variantSearch: variantSearchHrefs\(card, analysis\)/);
  // the query comes from the SHARED builder, so the API and the client
  // cannot disagree about what is being searched for
  assert.match(route, /from "@\/lib\/cardSearchQuery"/);
});

test("VS-23. the grid prefers the server href and re-wraps only the placement", () => {
  const grid = read("components/VariantPriceGrid.js");
  assert.match(grid, /searchHref\s*\?\s*wrapEbayAffiliateUrl\(searchHref, withPlacement\(surface, "variant"\)\)/);
  assert.match(grid, /searchHref=\{searchHrefs\?\.raw \?\? null\}/);
  assert.match(grid, /searchHref=\{searchHrefs\?\.\[g\.key\] \?\? null\}/);
  // and still falls back to a correct (if campid-less) link rather than none
  assert.match(grid, /: buildEbaySearchLink\(searchQuery, undefined, withPlacement\(surface, "variant"\)\)/);
  assert.match(read("components/CardMarketPanel.js"), /searchHrefs=\{analysis\.variantSearch \?\? null\}/);
});

test("VS-24. re-wrapping a server href keeps campid and sets the placement customid", () => {
  // Exactly what the tile does: a server-built href arrives with the
  // campaign id, and the browser - where EBAY_CAMPAIGN_ID is undefined -
  // rewrites only customid.
  const q = Q.buildCardSearchQuery({ name: "Scizor GX", set: "Hidden Fates: Shiny Vault", cardNumber: "SV72/SV94", grade: "PSA 10" });
  const serverHref = buildEbaySearchLink(q, undefined, { page: "card", placement: "variant" });
  assert.equal(new URL(serverHref).searchParams.get("campid"), "5339197414");

  const { wrapEbayAffiliateUrl } = require(join(ROOT, "lib", "ebayLinks.js"));
  const original = process.env.EBAY_CAMPAIGN_ID;
  try {
    delete process.env.EBAY_CAMPAIGN_ID; // the browser
    const u = new URL(wrapEbayAffiliateUrl(serverHref, { page: "deal", placement: "variant" }));
    assert.equal(u.searchParams.get("campid"), "5339197414", "the campaign id must survive");
    assert.equal(u.searchParams.get("customid"), "deal-variant", "the placement is re-applied");
    assert.equal(u.searchParams.get("_nkw"), q, "the query is untouched");
    assert.equal(u.searchParams.get("_sacat"), "183454");

    // and the failure this replaced: building from scratch in the browser
    const clientBuilt = new URL(buildEbaySearchLink(q, undefined, { page: "card", placement: "variant" }));
    assert.equal(clientBuilt.searchParams.get("campid"), null, "this is why the API must send the href");
  } finally {
    process.env.EBAY_CAMPAIGN_ID = original;
  }
});
