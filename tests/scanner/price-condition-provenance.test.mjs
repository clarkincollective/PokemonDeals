// PRICE-CONDITION PROVENANCE (2026-09-11).
//
// Confirmed case: Magneton 009/102 "Base Set (Shadowless)" (tcgplayer
// 107003). PPT prices NO Near Mint entry for either printing - only
// "Lightly Played 1st Edition Holofoil" $407.50 and "Lightly Played
// Unlimited Holofoil" $73.99 - so pickMarketPrice()'s first-entry fallback
// made the LP $73.99 the card's reference, and the card summary, worth
// answer and 13 price_history rows then called it Near Mint. The number
// was right (an LP listing was correctly discounted against it); only the
// label was wrong. These tests pin: (1) every reference selector returns
// its real condition / printing, with the PRICE unchanged from before;
// (2) labels say Near Mint only when supported, else the real tier or a
// neutral "market reference"; (3) matching-condition discounts still work;
// (4) the writers stamp provenance without changing the history series key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { cardWorthAnswer } from "../../lib/cardWorth.js";
import { referenceConditionLabels, normalizeReferenceCondition } from "../../lib/referenceCondition.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const ppt = require(join(REPO, "lib", "pokemonPriceTracker.js"));
const dm = require(join(REPO, "lib", "dealMatching.js"));
const read = (p) => readFileSync(join(REPO, p), "utf8");
const code = (p) => read(p).replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ---- fixtures (real PPT shapes) --------------------------------------

// The live 107003 record on 2026-09-11 (verbatim shape).
const MAGNETON_LP_ONLY = {
  market: 407.5,
  primaryPrinting: "1st Edition Holofoil",
  lastUpdated: "2026-09-10T12:03:25.250Z",
  variants: {
    "1st Edition Holofoil": { "Lightly Played 1st Edition Holofoil": { price: 407.5 } },
    "Unlimited Holofoil": { "Lightly Played Unlimited Holofoil": { price: 73.99 } },
  },
};

// A genuine Near Mint reference (single printing, full ladder).
const GENUINE_NM = {
  market: 36.36,
  primaryPrinting: "Holofoil",
  conditions: { "Near Mint": { price: 36.36 }, "Lightly Played": { price: 30 }, "Moderately Played": { price: 22 } },
  variants: { Holofoil: { "Near Mint Holofoil": { price: 36.36 }, "Lightly Played Holofoil": { price: 30 }, "Moderately Played Holofoil": { price: 22 } } },
};

// Dual printing where the Unlimited variant HAS several conditions.
const DUAL_MULTI = {
  market: 500,
  primaryPrinting: "1st Edition Holofoil",
  variants: {
    "1st Edition Holofoil": { "Near Mint 1st Edition Holofoil": { price: 500 }, "Lightly Played 1st Edition Holofoil": { price: 380 } },
    "Unlimited Holofoil": { "Near Mint Unlimited Holofoil": { price: 190.12 }, "Lightly Played Unlimited Holofoil": { price: 150 }, "Damaged Unlimited Holofoil": { price: 40 } },
  },
};

// Headline figure with no condition entries at all (condition unknown).
const UNKNOWN = { market: 12, primaryPrinting: "Normal", variants: { Normal: {} } };
// Headline figure that equals exactly one played entry (inferred LP).
const INFERRED_LP = { market: 9, primaryPrinting: "Normal", variants: { Normal: { "Lightly Played Normal": { price: 9 } } } };
// Headline equal to two tiers -> ambiguous -> unknown.
const AMBIGUOUS = { market: 1, primaryPrinting: "Normal", conditions: { "Near Mint": { price: 1 }, "Lightly Played": { price: 1 } } };

test("1. LP-only (Magneton 107003): the price is unchanged and its provenance is Lightly Played / Unlimited Holofoil, NOT Near Mint", () => {
  const ref = ppt.pickMarketReference(MAGNETON_LP_ONLY);
  assert.deepEqual(ref, { price: 73.99, condition: "Lightly Played", printing: "Unlimited Holofoil", exact: false });
  assert.equal(ppt.pickMarketPrice(MAGNETON_LP_ONLY), 73.99, "price-only wrapper unchanged");
  assert.deepEqual(ppt.catalogRawMarketReference(MAGNETON_LP_ONLY), ref, "card-page headline uses the same selection");
  assert.equal(ppt.catalogRawMarketPrice(MAGNETON_LP_ONLY), 73.99);
  // the scanner's per-condition ladder for the Unlimited printing is LP only
  assert.deepEqual(ppt.conditionPricesFromVariants(MAGNETON_LP_ONLY), { "Lightly Played": 73.99 });
});

test("2. genuine Near Mint: proven by prices.conditions['Near Mint'], exact, and labelled Near Mint", () => {
  const ref = ppt.catalogRawMarketReference(GENUINE_NM);
  assert.deepEqual(ref, { price: 36.36, condition: "Near Mint", printing: "Holofoil", exact: true });
  assert.equal(ppt.catalogRawMarketPrice(GENUINE_NM), 36.36);
  // headline path (pickMarketReference) on a non-1st-Ed record infers NM from the matching entry
  assert.deepEqual(ppt.pickMarketReference(GENUINE_NM), { price: 36.36, condition: "Near Mint", printing: "Holofoil", exact: true });
  assert.equal(referenceConditionLabels(ref.condition).raw, "raw, Near Mint");
});

test("3. multiple-condition dual printing: the requested tier is taken exactly, from the Unlimited variant", () => {
  assert.deepEqual(ppt.pickMarketReference(DUAL_MULTI), { price: 190.12, condition: "Near Mint", printing: "Unlimited Holofoil", exact: true });
  assert.deepEqual(ppt.pickMarketReference(DUAL_MULTI, "Lightly Played"), { price: 150, condition: "Lightly Played", printing: "Unlimited Holofoil", exact: true });
  assert.deepEqual(ppt.pickMarketReference(DUAL_MULTI, "Damaged"), { price: 40, condition: "Damaged", printing: "Unlimited Holofoil", exact: true });
  // a tier the Unlimited variant lacks falls back to its first entry - and SAYS so (exact:false, real condition)
  assert.deepEqual(ppt.pickMarketReference(DUAL_MULTI, "Heavily Played"), { price: 190.12, condition: "Near Mint", printing: "Unlimited Holofoil", exact: false });
  assert.equal(ppt.pickMarketPrice(DUAL_MULTI), 190.12);
  assert.deepEqual(ppt.conditionPricesFromVariants(DUAL_MULTI), { "Near Mint": 190.12, "Lightly Played": 150, Damaged: 40 });
});

test("4. unknown condition: a headline figure with no matching entry is never called Near Mint; a single exact match is inferred; ambiguity stays unknown", () => {
  assert.deepEqual(ppt.pickMarketReference(UNKNOWN), { price: 12, condition: null, printing: "Normal", exact: false });
  assert.deepEqual(ppt.catalogRawMarketReference(UNKNOWN), { price: 12, condition: null, printing: "Normal", exact: false });
  assert.deepEqual(ppt.pickMarketReference(INFERRED_LP), { price: 9, condition: "Lightly Played", printing: "Normal", exact: false });
  assert.equal(ppt.pickMarketReference(AMBIGUOUS).condition, null);
  assert.equal(ppt.marketFigureCondition(GENUINE_NM, 30), "Lightly Played");
  assert.equal(ppt.marketFigureCondition(GENUINE_NM, 999), null);
  // sentinels / empty stay "no reference"
  assert.deepEqual(ppt.pickMarketReference({ market: 999 }), { price: null, condition: null, printing: null, exact: false });
  assert.deepEqual(ppt.pickMarketReference(null), { price: null, condition: null, printing: null, exact: false });
  const labels = referenceConditionLabels(null);
  assert.equal(labels.known, false);
  assert.equal(labels.raw, "raw market reference");
  assert.equal(labels.worth, "raw (ungraded)");
  assert.doesNotMatch(JSON.stringify(labels), /Near Mint/);
});

test("5. dual-printing edge cases: 1st-Edition-only card uses the headline with inferred condition; the 1st Edition variant is never chosen when an Unlimited one exists", () => {
  const firstOnly = { market: 250, primaryPrinting: "1st Edition Holofoil", variants: { "1st Edition Holofoil": { "Near Mint 1st Edition Holofoil": { price: 250 } } } };
  assert.deepEqual(ppt.pickMarketReference(firstOnly), { price: 250, condition: "Near Mint", printing: "1st Edition Holofoil", exact: true });
  assert.equal(ppt.pickMarketReference(MAGNETON_LP_ONLY).printing, "Unlimited Holofoil");
  assert.notEqual(ppt.pickMarketReference(MAGNETON_LP_ONLY).price, 407.5, "1st Edition LP must not become the reference");
  // ladder-inverted NM is rejected as before (no reference), never relabelled
  const inverted = { market: 249.95, primaryPrinting: "Holofoil", conditions: { "Near Mint": { price: 249.95 }, "Lightly Played": { price: 2400 } } };
  assert.equal(ppt.catalogRawMarketReference(inverted).price, null);
  assert.equal(ppt.catalogRawMarketPrice(inverted), null);
});

test("6. catalogue CSV ingestion: the NM column and the aggregate stay separate; the chosen figure equals the legacy pick; condition is proven, inferred, or null", () => {
  // Magneton as the printings export would carry it (no NM anywhere)
  const rows = [
    { printing: "1st Edition Holofoil", nm: null, price: 407.5, lp: 407.5 },
    { printing: "Unlimited Holofoil", nm: null, price: 73.99, lp: 73.99 },
  ];
  assert.deepEqual(ppt.pickCatalogMarketReference(rows), { price: 73.99, condition: "Lightly Played", printing: "Unlimited Holofoil", exact: false });
  assert.equal(ppt.pickCatalogMarketPrice(rows), 73.99);
  // legacy shape (nm already folded) picks the same PRICE
  assert.equal(ppt.pickCatalogMarketPrice([{ printing: "Unlimited Holofoil", nm: 73.99, lp: 73.99 }]), 73.99);
  // genuine NM row
  assert.deepEqual(ppt.pickCatalogMarketReference([{ printing: "Holofoil", nm: 36.36, price: 36.36, lp: 30 }]), { price: 36.36, condition: "Near Mint", printing: "Holofoil", exact: true });
  // aggregate with no matching played figure -> unknown, price kept
  assert.deepEqual(ppt.pickCatalogMarketReference([{ printing: "Normal", nm: null, price: 5, lp: 4, mp: 3 }]), { price: 5, condition: null, printing: "Normal", exact: false });
  // inverted ladder -> no reference (unchanged behaviour)
  assert.equal(ppt.pickCatalogMarketReference([{ printing: "Holofoil", nm: 249.95, lp: 2400 }]).price, null);
  // sentinel / unpriced rows -> none
  assert.equal(ppt.pickCatalogMarketReference([{ printing: "x", nm: 999 }, { printing: "y" }]).price, null);
  // the sync route keeps the columns apart and writes the provenance
  const sync = code("app/api/sync-card-catalog/route.js");
  assert.match(sync, /nm: num\(r\.marketNearMint\),\s*price: num\(r\.marketPrice\),/, "NM column and aggregate are separate fields");
  assert.doesNotMatch(sync, /num\(r\.marketNearMint\) \?\? num\(r\.marketPrice\)/, "the old fold is gone");
  assert.match(sync, /market_condition: ref\.condition,\s*market_printing: ref\.printing,/);
  assert.match(sync, /reference_condition: prov\.condition,/);
  assert.match(sync, /condition: "Near Mint",[^\n]*\n[^\n]*source: "catalog"/, "history series key unchanged");
});

test("7. matching-condition discounts still work: an LP listing prices against the LP reference; a worse-than-available signal still yields no price", () => {
  const { byCondition, fallbackPrice } = { byCondition: ppt.conditionPricesFromVariants(MAGNETON_LP_ONLY), fallbackPrice: ppt.pickMarketPrice(MAGNETON_LP_ONLY) };
  assert.equal(dm.selectConditionPrice(byCondition, "Lightly Played", fallbackPrice), 73.99, "LP listing vs the LP reference (the valid Magneton discount)");
  assert.equal(dm.selectConditionPrice(byCondition, "Near Mint", fallbackPrice), 73.99, "no-signal default still uses the fallback figure (a LOWER anchor than a real NM would be - conservative)");
  assert.equal(dm.selectConditionPrice(byCondition, "Damaged", fallbackPrice), null, "a detected worse tier with no same-or-worse data is skipped, as before");
  assert.equal(dm.selectConditionPrice(ppt.conditionPricesFromVariants(DUAL_MULTI), "Lightly Played", 190.12), 150);
  assert.equal(dm.selectConditionPrice(ppt.conditionPricesFromVariants(DUAL_MULTI), "Moderately Played", 190.12), 40, "falls to the next worse real tier");
  // getConditionPrices exposes the provenance alongside the unchanged fallbackPrice
  const src = code("lib/pokemonPriceTracker.js");
  assert.match(src, /const fallbackReference = pickMarketReference\(prices, "Near Mint"\);[\s\S]*fallbackPrice: fallbackReference\.price,\s*fallbackReference,/);
  // the scanner route is untouched by this fix
  assert.doesNotMatch(code("app/api/refresh-deals/route.js"), /fallbackReference|referenceCondition/);
});

test("8. worth answer: Near Mint only when the reference is Near Mint; another tier by name; neutral wording when unknown", () => {
  const base = { name: "Magneton", set: "Base Set (Shadowless)", cardNumber: "009/102", rarity: "Holo Rare", marketUsd: 73.99, priceSource: "analysis" };
  const lp = cardWorthAnswer({ ...base, referenceCondition: "Lightly Played" });
  assert.equal(lp.condition, "raw (ungraded), Lightly Played");
  assert.equal(lp.referenceCondition, "Lightly Played");
  assert.equal(lp.conditionKnown, true);
  assert.equal(lp.marketNoun, "market price");
  assert.doesNotMatch(JSON.stringify(lp), /Near Mint/);

  const nm = cardWorthAnswer({ ...base, marketUsd: 36.36, referenceCondition: "Near Mint" });
  assert.equal(nm.condition, "raw (ungraded), Near Mint");

  const unknown = cardWorthAnswer({ ...base, referenceCondition: null });
  assert.equal(unknown.condition, "raw (ungraded)");
  assert.equal(unknown.conditionKnown, false);
  assert.equal(unknown.marketNoun, "market reference price");
  assert.doesNotMatch(JSON.stringify(unknown), /Near Mint/);
  // omitted = unknown (never defaults to Near Mint)
  assert.equal(cardWorthAnswer(base).condition, "raw (ungraded)");
  // provider key substrings normalise
  assert.equal(normalizeReferenceCondition("Lightly Played Unlimited Holofoil"), "Lightly Played");
  assert.equal(normalizeReferenceCondition("garbage"), null);
});

test("9. static: every public label derives from the reference's recorded condition; no component hard-codes Near Mint for the reference", () => {
  for (const f of ["components/CardPriceSummary.js", "components/CardPriceIntelligence.js", "components/VariantPriceGrid.js"]) {
    const src = code(f);
    assert.match(src, /referenceConditionLabels\(/, `${f} uses referenceConditionLabels`);
    assert.doesNotMatch(src, /raw, Near Mint|>Near Mint<|"Near Mint"/, `${f} must not hard-code a Near Mint reference label`);
  }
  assert.doesNotMatch(code("lib/cardWorth.js"), /"raw \(ungraded\), Near Mint"/, "worth answer condition is derived, not a constant");
  // the analysis carries the provenance the components read
  const src = code("lib/pokemonPriceTracker.js");
  assert.match(src, /referenceCondition: rawRef\.condition,\s*referencePrinting: rawRef\.printing,\s*referenceExact: rawRef\.exact,/);
  // both card render paths pass it to the worth answer
  assert.match(code("app/cards/[slug]/page.js"), /referenceCondition: analysis\?\.raw\?\.referenceCondition \?\? null,/);
  assert.match(code("components/CatalogCardView.js"), /referenceCondition: analysisHasPrice \? analysis\?\.raw\?\.referenceCondition \?\? null : card\.refCondition \?\? null,/);
  // meta descriptions no longer claim Near Mint for every card
  assert.doesNotMatch(read("app/cards/[slug]/page.js"), /Raw Near Mint market reference|raw Near Mint market reference/);
  // the component that prints the answer flags unknown provenance
  assert.match(read("components/CardWorthAnswer.js"), /answer\.marketNoun/);
  assert.match(read("components/CardWorthAnswer.js"), /conditionKnown === false/);
});

test("10. static: writers stamp provenance best-effort and never change a price or the history series key; the migration is present and non-destructive", () => {
  const mig = read("supabase/price_condition_provenance_migration.sql");
  for (const col of ["card_catalog\n  add column if not exists market_condition text", "add column if not exists market_printing", "price_history\n  add column if not exists reference_condition text", "add column if not exists reference_printing"]) {
    assert.ok(mig.includes(col), `migration adds ${col.split("exists ")[1] ?? col}`);
  }
  assert.doesNotMatch(mig.replace(/--[^\n]*/g, ""), /\bupdate\b|\bdelete\b|drop\b/i, "no data rewrite outside comments");
  const helper = code("lib/referenceProvenanceDb.js");
  assert.match(helper, /PGRST204\|42703\|column \.\* does not exist\|schema cache/);
  assert.match(helper, /rows\.map\(stripProvenanceColumns\)/, "retries without the provenance columns");
  for (const f of ["app/api/sync-card-catalog/route.js", "app/api/sync-watchlist/route.js", "scripts/fixWotcUnlimitedPrices.js"]) {
    const src = code(f);
    assert.match(src, /WithProvenance\(/, `${f} writes through the best-effort helper`);
    assert.doesNotMatch(src, /\.from\("price_history"\)\s*\.upsert\(/, `${f}: no direct history upsert bypassing provenance`);
  }
  const wl = code("app/api/sync-watchlist/route.js");
  assert.match(wl, /reference_condition: ref\.condition,/);
  assert.match(wl, /reference_condition: card\.reference_condition \?\? null,/);
  assert.match(wl, /condition: "Near Mint",[^\n]*\n\s*source: "catalog",/, "series key unchanged");
  // the catalogue loader tolerates a pre-migration table (no 404 on 42703)
  const deals = code("lib/deals.js");
  assert.match(deals, /42703\|does not exist\|schema cache/);
  assert.match(deals, /refCondition: priceOk \? pick\.market_condition \?\? null : null,/);
  assert.ok(existsSync(join(REPO, "lib", "referenceCondition.js")));
});
