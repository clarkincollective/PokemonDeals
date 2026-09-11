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
const prov = () => require(join(REPO, "lib", "referenceProvenanceDb.js"));
const ph = () => require(join(REPO, "lib", "priceHistory.js"));

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

// The shape the site actually receives for a single-printing card
// (Magneton Base Set 42433, verified 2026-09-11 on plain AND includeEbay
// responses): prices.conditions is EMPTY; the only keyed entry is under
// the primary printing's variant.
const NM_VARIANT_ONLY = { market: 36.36, primaryPrinting: "Holofoil", conditions: {}, variants: { Holofoil: { "Near Mint Holofoil": { price: 36.36 } } } };
// Same shape, but the provider's headline differs from its own keyed entry.
const NM_VARIANT_DIVERGENT = { market: 40, primaryPrinting: "Holofoil", conditions: {}, variants: { Holofoil: { "Near Mint Holofoil": { price: 36.36 }, "Lightly Played Holofoil": { price: 30 } } } };
// Single printing whose variant prices ONLY a played tier.
const LP_VARIANT_ONLY = { market: 30, primaryPrinting: "Holofoil", conditions: {}, variants: { Holofoil: { "Lightly Played Holofoil": { price: 30 } } } };
// Headline figure with no condition entries at all (condition unknown).
const UNKNOWN = { market: 12, primaryPrinting: "Normal", variants: { Normal: {} } };
// Headline figure that happens to EQUAL a played entry - equality is not
// provenance: the condition stays unknown.
const EQUALS_LP = { market: 9, primaryPrinting: "Normal", variants: { Normal: { "Lightly Played Normal": { price: 9 } } } };
// Headline equal to two tiers - likewise unknown.
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
  // the headline path (pickMarketReference on a non-1st-Ed record) is prices.market, whose
  // condition PPT does not document - unknown, even though it equals the NM entry
  assert.deepEqual(ppt.pickMarketReference(GENUINE_NM), { price: 36.36, condition: null, printing: "Holofoil", exact: false });
  assert.equal(referenceConditionLabels(ref.condition).raw, "raw, Near Mint");
  // the real single-printing shape: NM comes from the primary variant's keyed entry (direct provenance)
  assert.deepEqual(ppt.catalogRawMarketReference(NM_VARIANT_ONLY), { price: 36.36, condition: "Near Mint", printing: "Holofoil", exact: true });
  assert.equal(ppt.catalogRawMarketPrice(NM_VARIANT_ONLY), 36.36, "same figure as before for this card");
  // when the provider's headline diverges from its own Near Mint entry the page shows the entry it labels
  assert.deepEqual(ppt.catalogRawMarketReference(NM_VARIANT_DIVERGENT), { price: 36.36, condition: "Near Mint", printing: "Holofoil", exact: true });
  // a played-only variant is labelled by its key, never Near Mint
  assert.deepEqual(ppt.catalogRawMarketReference(LP_VARIANT_ONLY), { price: 30, condition: "Lightly Played", printing: "Holofoil", exact: false });
  // an NM entry contradicted by its own variant ladder is still rejected
  assert.equal(ppt.catalogRawMarketReference({ market: 249.95, primaryPrinting: "Holofoil", conditions: {}, variants: { Holofoil: { "Near Mint Holofoil": { price: 249.95 }, "Lightly Played Holofoil": { price: 2400 } } } }).price, null);
  // the scanner fallback / search figure (pickMarketPrice) is unchanged: still the headline, provenance unknown
  assert.deepEqual(ppt.pickMarketReference(NM_VARIANT_DIVERGENT), { price: 40, condition: null, printing: "Holofoil", exact: false });
  assert.equal(ppt.pickMarketPrice(NM_VARIANT_ONLY), 36.36);
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

test("4. unknown condition: a headline / aggregate figure is never given a condition - not by assumption and not by price equality", () => {
  assert.deepEqual(ppt.pickMarketReference(UNKNOWN), { price: 12, condition: null, printing: "Normal", exact: false });
  assert.deepEqual(ppt.catalogRawMarketReference(UNKNOWN), { price: 12, condition: null, printing: "Normal", exact: false });
  // equality with one (or two) per-condition figures proves nothing for a headline...
  assert.deepEqual(ppt.pickMarketReference(EQUALS_LP), { price: 9, condition: null, printing: "Normal", exact: false });
  // ...while the card-page path SELECTS the variant's keyed entry, so its condition is direct provenance
  assert.deepEqual(ppt.catalogRawMarketReference(EQUALS_LP), { price: 9, condition: "Lightly Played", printing: "Normal", exact: false });
  assert.equal(ppt.pickMarketReference(AMBIGUOUS).condition, null);
  assert.equal(ppt.catalogRawMarketReference(AMBIGUOUS).condition, "Near Mint", "an explicit prices.conditions['Near Mint'] entry IS direct provenance");
  assert.equal(ppt.marketFigureCondition, undefined, "no equality-inference helper is exported");
  assert.doesNotMatch(code("lib/pokemonPriceTracker.js"), /marketFigureCondition|hits\.size === 1|hits\.length === 1/, "no equality inference in the selector");
  assert.doesNotMatch(code("app/api/sync-watchlist/route.js"), /hits\.length === 1|marketLightlyPlayed\]/, "no equality inference in the watchlist export path");
  // sentinels / empty stay "no reference"
  assert.deepEqual(ppt.pickMarketReference({ market: 999 }), { price: null, condition: null, printing: null, exact: false });
  assert.deepEqual(ppt.pickMarketReference(null), { price: null, condition: null, printing: null, exact: false });
  const labels = referenceConditionLabels(null);
  assert.equal(labels.known, false);
  assert.equal(labels.raw, "raw market reference");
  assert.equal(labels.worth, "raw (ungraded)");
  assert.doesNotMatch(JSON.stringify(labels), /Near Mint/);
});

test("5. dual-printing edge cases: a 1st-Edition-only card uses the headline (condition unknown - not inferred from its own ladder); the 1st Edition variant is never chosen when an Unlimited one exists", () => {
  const firstOnly = { market: 250, primaryPrinting: "1st Edition Holofoil", variants: { "1st Edition Holofoil": { "Near Mint 1st Edition Holofoil": { price: 250 } } } };
  assert.deepEqual(ppt.pickMarketReference(firstOnly), { price: 250, condition: null, printing: "1st Edition Holofoil", exact: false });
  assert.equal(ppt.pickMarketPrice(firstOnly), 250, "price unchanged");
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
  // the CSV aggregate column has no documented condition: unknown (the WOTC second pass, which
  // selects from a keyed variant entry, is what records "Lightly Played" for this card)
  assert.deepEqual(ppt.pickCatalogMarketReference(rows), { price: 73.99, condition: null, printing: "Unlimited Holofoil", exact: false });
  assert.equal(ppt.pickCatalogMarketPrice(rows), 73.99);
  // legacy shape (nm already folded) picks the same PRICE
  assert.equal(ppt.pickCatalogMarketPrice([{ printing: "Unlimited Holofoil", nm: 73.99, lp: 73.99 }]), 73.99);
  // genuine NM row
  assert.deepEqual(ppt.pickCatalogMarketReference([{ printing: "Holofoil", nm: 36.36, price: 36.36, lp: 30 }]), { price: 36.36, condition: "Near Mint", printing: "Holofoil", exact: true });
  // aggregate -> unknown, price kept, whether or not it equals a ladder figure
  assert.deepEqual(ppt.pickCatalogMarketReference([{ printing: "Normal", nm: null, price: 5, lp: 4, mp: 3 }]), { price: 5, condition: null, printing: "Normal", exact: false });
  assert.deepEqual(ppt.pickCatalogMarketReference([{ printing: "Normal", nm: null, price: 4, lp: 4, mp: 3 }]), { price: 4, condition: null, printing: "Normal", exact: false });
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
  assert.doesNotMatch(mig, /\bupdate price_history\b|\bupdate card_catalog\b|\bdelete\b|\bdrop\b|\binsert\b/i, "the migration is additive only - no data statement, not even commented out");
  const stmts = mig.replace(/--[^\n]*/g, "").split(";").map((x) => x.trim()).filter(Boolean);
  assert.ok(stmts.every((x) => /^alter table (card_catalog|price_history)\s+add column if not exists/i.test(x) || /^comment on column/i.test(x)), "only ADD COLUMN IF NOT EXISTS + COMMENT statements");
  const corr = read("supabase/data_corrections/2026-09-11_magneton_107003_history_provenance.sql");
  assert.match(corr, /tcgplayer_id = '107003'/);
  assert.match(corr, /NOT YET APPROVED/);
  assert.match(corr, /134\.69/, "cites the provider's contemporaneous Near Mint series");
  assert.equal(corr.split("\n").filter((l) => /^\s*update /.test(l)).length, 0, "the statement is commented out until approved");
  const helper = code("lib/referenceProvenanceDb.js");
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
  assert.match(deals, /isMissingProvenanceColumnError\(error\)/, "the catalogue loader falls back only on the specific schema error");
  assert.match(deals, /refCondition: priceOk \? pick\.market_condition \?\? null : null,/);
  assert.ok(existsSync(join(REPO, "lib", "referenceCondition.js")));
});

// ---- tightened contracts (review round 2) ---------------------------

function fakeDb(sequence) {
  // sequence: { error } results returned in call order (last one repeats); every call is recorded
  const calls = [];
  const next = () => sequence[Math.min(calls.length - 1, sequence.length - 1)] ?? { error: null };
  const db = {
    from: (table) => ({
      upsert: async (rows, opts) => { calls.push({ table, op: "upsert", rows, opts }); return next(); },
      update: (values) => ({ eq: async (col, val) => { calls.push({ table, op: "update", values, col, val }); return next(); } }),
    }),
  };
  return { db, calls };
}
const ROWS = [{ tcgplayer_id: "1", price: 5, condition: "Near Mint", source: "catalog", observed_on: "2026-09-11", reference_condition: "Lightly Played", reference_printing: "Unlimited Holofoil" }];

test("11. missing-column retry fires ONLY for the schema error naming a provenance column; every other error is returned unchanged", async () => {
  const { isMissingProvenanceColumnError, upsertWithProvenance, updateWithProvenance } = prov();
  // the exact errors PostgREST / Postgres raise for an unknown column
  assert.equal(isMissingProvenanceColumnError({ code: "PGRST204", message: "Could not find the 'reference_condition' column of 'price_history' in the schema cache" }), true);
  assert.equal(isMissingProvenanceColumnError({ code: "42703", message: "column card_catalog.market_condition does not exist" }), true);
  // same codes, a DIFFERENT column -> not ours, must stay visible
  assert.equal(isMissingProvenanceColumnError({ code: "PGRST204", message: "Could not find the 'image_urls' column of 'deals' in the schema cache" }), false);
  assert.equal(isMissingProvenanceColumnError({ code: "42703", message: "column price_history.card_number does not exist" }), false);
  // other failures naming our column but with another code -> not a schema gap
  assert.equal(isMissingProvenanceColumnError({ code: "42501", message: "permission denied for column market_condition" }), false);
  assert.equal(isMissingProvenanceColumnError({ code: "23505", message: "duplicate key value violates unique constraint price_history_daily_uniq" }), false);
  assert.equal(isMissingProvenanceColumnError({ message: "fetch failed: network down (reference_condition)" }), false);
  assert.equal(isMissingProvenanceColumnError(null), false);

  // (a) columns present -> one write, provenance kept
  let f = fakeDb([{ error: null }]);
  let r = await upsertWithProvenance(f.db, "price_history", ROWS, "k", {});
  assert.deepEqual([r.error, r.provenance, f.calls.length], [null, true, 1]);
  assert.equal(f.calls[0].rows[0].reference_condition, "Lightly Played");

  // (b) our column missing -> retried WITHOUT the provenance columns, reported provenance:false
  f = fakeDb([{ error: { code: "PGRST204", message: "Could not find the 'reference_condition' column of 'price_history' in the schema cache" } }, { error: null }]);
  const state = {};
  r = await upsertWithProvenance(f.db, "price_history", ROWS, "k", state);
  assert.deepEqual([r.error, r.provenance, f.calls.length, state.provenance], [null, false, 2, false]);
  assert.equal("reference_condition" in f.calls[1].rows[0], false);
  assert.equal(f.calls[1].rows[0].price, 5, "prices untouched");
  // the memo means the next write in the same job goes straight to the narrow form
  f = fakeDb([{ error: null }]);
  r = await upsertWithProvenance(f.db, "price_history", ROWS, "k", state);
  assert.equal(f.calls.length, 1);
  assert.equal("reference_condition" in f.calls[0].rows[0], false);

  // (c) permission / RLS error -> NO retry, error returned as-is
  const perm = { code: "42501", message: "permission denied for table price_history" };
  f = fakeDb([{ error: perm }]);
  r = await upsertWithProvenance(f.db, "price_history", ROWS, "k", {});
  assert.strictEqual(r.error, perm);
  assert.equal(f.calls.length, 1, "not retried");
  // (d) a different missing column -> NO retry, visible
  const other = { code: "PGRST204", message: "Could not find the 'image_urls' column of 'deals' in the schema cache" };
  f = fakeDb([{ error: other }]);
  r = await upsertWithProvenance(f.db, "deals", ROWS, "k", {});
  assert.strictEqual(r.error, other);
  assert.equal(f.calls.length, 1);
  // (e) a thrown network error propagates (nothing swallowed)
  const boom = { from: () => ({ upsert: async () => { throw new Error("network down"); } }) };
  await assert.rejects(upsertWithProvenance(boom, "price_history", ROWS, "k", {}), /network down/);
  // (f) the retry itself failing surfaces that error
  f = fakeDb([{ error: { code: "42703", message: "column card_catalog.market_condition does not exist" } }, { error: perm }]);
  r = await updateWithProvenance(f.db, "card_catalog", { market_price: 1, market_condition: "Near Mint" }, "tcgplayer_id", "1", {});
  assert.strictEqual(r.error, perm);
  assert.equal(r.provenance, null);
  assert.equal("market_condition" in f.calls[1].values, false);
  assert.equal(f.calls[1].values.market_price, 1);
});

// ---- round 3: comparable history only ------------------------------------
//
// A trend / market signal is a claim that two observations of the SAME
// reference moved. It is made only when every point from the comparison
// date to the latest recorded both condition and printing AND all of them
// equal the latest point's. Unknown or partial provenance anywhere in the
// span, or a change of reference anywhere in the span (even NM -> LP -> NM
// with matching endpoints), withholds the window.

const day = (i) => new Date(Date.UTC(2026, 7, 1) + i * 86400_000).toISOString().slice(0, 10);
const drifting = (n, prov = () => ({ reference_condition: "Near Mint", reference_printing: "Holofoil" })) =>
  Array.from({ length: n }, (_, i) => ({ observed_on: day(i), price: +(74 + i * 0.1).toFixed(2), source: "catalog", ...prov(i) }));
const run = (rows) => { const { mergeHistoryRows, confidentTrendWindows, marketSignal } = ph(); const series = mergeHistoryRows(rows); const r = confidentTrendWindows(series, { rawRows: rows }); return { ...r, series, signal: marketSignal(r.windows, r.confidence) }; };

test("12. unknown endpoints: any window whose span includes an unrecorded point is withheld - legacy history, an unrecorded latest, an unrecorded comparison point", () => {
  // (a) fully verified, same reference -> the gentle drift IS reported
  const ok = run(drifting(45));
  assert.ok(ok.windows.d30 && ok.windows.d30.changePct > 0);
  assert.equal(ok.confidence.reason, null);
  assert.deepEqual(ok.confidence.withheld, {});
  assert.equal(ok.signal.status, "stable", "+4% over 30 days sits inside the stable band - the window is present, not withheld");
  assert.equal(ok.signal.basisWindowDays, 30);

  // (b) legacy rows (nothing recorded) -> every window withheld, signal limited with the reason
  const legacy = run(drifting(45, () => ({})));
  assert.deepEqual(legacy.windows, { d7: null, d30: null, d90: null, d365: null });
  assert.equal(legacy.confidence.reason, "provenance-unknown");
  assert.equal(legacy.confidence.level, "low");
  assert.equal(legacy.signal.status, "limited");
  assert.equal(legacy.signal.reason, "provenance-unknown");
  assert.doesNotMatch(JSON.stringify(legacy), /Near Mint/, "unknown history is never called Near Mint");

  // (c) latest verified, but the comparison point (and everything before it) unrecorded -> withheld
  const olderUnknown = run(drifting(45, (i) => (i >= 40 ? { reference_condition: "Near Mint", reference_printing: "Holofoil" } : {})));
  assert.equal(olderUnknown.windows.d7, null);
  assert.equal(olderUnknown.windows.d30, null);
  assert.equal(olderUnknown.confidence.withheld.d7, "provenance-unknown");

  // (d) everything verified except the latest point -> withheld (an unverified endpoint)
  const latestUnknown = run(drifting(45, (i) => (i === 44 ? {} : { reference_condition: "Near Mint", reference_printing: "Holofoil" })));
  assert.equal(latestUnknown.windows.d7, null);
  assert.equal(latestUnknown.windows.d30, null);
  assert.equal(latestUnknown.confidence.reason, "provenance-unknown");

  // (e) a single unrecorded point INSIDE the window (endpoints fine) still withholds it
  const holeInside = run(drifting(45, (i) => (i === 30 ? {} : { reference_condition: "Near Mint", reference_printing: "Holofoil" })));
  assert.equal(holeInside.windows.d30, null, "30-day span crosses the unrecorded day");
  assert.ok(holeInside.windows.d7, "7-day span is entirely verified");
});

test("13. partial provenance: a point that recorded only the condition, or only the printing, is not verified", () => {
  const { pointProvenanceComplete, spanComparability, mergeHistoryRows } = ph();
  assert.equal(pointProvenanceComplete({ referenceCondition: "Near Mint", referencePrinting: "Holofoil" }), true);
  assert.equal(pointProvenanceComplete({ referenceCondition: "Near Mint", referencePrinting: null }), false);
  assert.equal(pointProvenanceComplete({ referenceCondition: null, referencePrinting: "Holofoil" }), false);
  assert.equal(pointProvenanceComplete({}), false);
  assert.equal(pointProvenanceComplete(null), false);

  const condOnly = run(drifting(45, (i) => (i < 20 ? { reference_condition: "Near Mint", reference_printing: null } : { reference_condition: "Near Mint", reference_printing: "Holofoil" })));
  assert.equal(condOnly.windows.d30, null);
  assert.equal(condOnly.confidence.withheld.d30, "provenance-unknown");
  assert.ok(condOnly.windows.d7);
  const printOnly = run(drifting(45, (i) => (i === 44 ? { reference_condition: null, reference_printing: "Holofoil" } : { reference_condition: "Near Mint", reference_printing: "Holofoil" })));
  assert.equal(printOnly.windows.d7, null);
  assert.equal(printOnly.confidence.reason, "provenance-unknown");
  // a partially-recorded row is merged without a provenance key that could pass as verified
  const merged = mergeHistoryRows([{ observed_on: "2026-09-01", price: 1, source: "catalog", reference_condition: "Near Mint" }]);
  assert.equal(pointProvenanceComplete(merged[0]), false);
  assert.equal(spanComparability(merged, "2026-09-01", "2026-09-01").reason, "provenance-unknown");
});

test("14. intermediate reference change: NM -> LP -> NM must not pass because the endpoints match", () => {
  const { spanComparability, comparableTail, referenceChanged } = ph();
  const nmLpNm = run(drifting(45, (i) => ({ reference_condition: i >= 20 && i < 30 ? "Lightly Played" : "Near Mint", reference_printing: "Holofoil" })));
  assert.equal(nmLpNm.windows.d30, null, "endpoints both Near Mint, but the span crossed Lightly Played");
  assert.equal(nmLpNm.confidence.withheld.d30, "reference-changed");
  assert.equal(nmLpNm.confidence.reason, "reference-changed");
  assert.equal(nmLpNm.signal.status, "limited");
  assert.ok(nmLpNm.windows.d7, "the last 7 days are all Near Mint - comparable");
  assert.equal(referenceChanged(nmLpNm.series[0], nmLpNm.series[44]), false, "endpoint-only comparison would have passed - which is why the whole span is checked");
  // printing flip in the middle, same condition -> likewise withheld
  const printFlip = run(drifting(45, (i) => ({ reference_condition: "Near Mint", reference_printing: i >= 20 && i < 30 ? "1st Edition Holofoil" : "Holofoil" })));
  assert.equal(printFlip.windows.d30, null);
  assert.equal(printFlip.confidence.withheld.d30, "reference-changed");
  // the comparable tail stops at the change, never reaching across it
  const tail = comparableTail(nmLpNm.series);
  assert.equal(tail.length, 15);
  assert.equal(tail[0].date, day(30));
  assert.ok(tail.every((p) => p.referenceCondition === "Near Mint"));
  assert.deepEqual(spanComparability(nmLpNm.series, day(31), day(44)), { ok: true, reason: null });
  assert.deepEqual(spanComparability(nmLpNm.series, day(10), day(44)), { ok: false, reason: "reference-changed" });
  // a real LP -> NM switch at the end (the Magneton scenario) is withheld too, not shown as +82%
  const switched = run([...drifting(40, () => ({ reference_condition: "Lightly Played", reference_printing: "Unlimited Holofoil" })).map((r) => ({ ...r, price: 74 })), ...Array.from({ length: 5 }, (_, i) => ({ observed_on: day(40 + i), price: 135, source: "catalog", reference_condition: "Near Mint", reference_printing: "Unlimited Holofoil" }))]);
  assert.equal(switched.windows.d7, null);
  assert.equal(switched.windows.d30, null);
  assert.equal(switched.confidence.reason, "reference-changed");
});

test("15. chart: unknown points stay on the chart but are distinguished by THEIR OWN record - never labelled from the live reference; ranges use comparable history only", () => {
  const deals = code("lib/deals.js");
  assert.match(deals, /const tail = comparableTail\(series\);/);
  assert.match(deals, /v \? \{ t: Date\.parse\(p\.date\), p: p\.price, v: 1, c: p\.referenceCondition, pr: p\.referencePrinting \} : \{ t: Date\.parse\(p\.date\), p: p\.price, v: 0 \}/, "each chart point carries its own recorded provenance, or v:0");
  assert.match(deals, /comparableRange: tail\.length \? \{ min: Math\.min\(\.\.\.tail\.map\(\(p\) => p\.price\)\), max: Math\.max\(\.\.\.tail\.map\(\(p\) => p\.price\)\) \} : null/);
  assert.doesNotMatch(deals.slice(deals.indexOf("fetchCardPriceHistoryUncached"), deals.indexOf("card-price-history-v1")), /analysis|catalogRawMarket|getFullPriceAnalysis|loadPriceAnalysis/, "history is built from history rows only - never the live analysis");
  for (const f of ["components/PriceHistoryChart.js", "components/MiniSparkline.js"]) {
    const src = code(f);
    assert.match(src, /keyOf\(a\) != null && keyOf\(a\) === keyOf\(b\)/, f + ": a segment is comparable only between two verified, same-reference points");
    assert.match(src, /data-history="unverified"[\s\S]*strokeDasharray/, f + ": non-comparable history is dashed");
    assert.match(src, /data-history="comparable"/, f);
    assert.doesNotMatch(src, /referenceCondition|analysis|useCurrency\(\)[^]*?referenceCondition/, f + ": no live-reference input");
  }
  const chart = read("components/PriceHistoryChart.js");
  assert.match(chart, /condition not recorded/, "tooltip names an unrecorded point as such");
  assert.match(chart, /No verified comparable history yet/, "legend when nothing comparable exists");
  assert.match(chart, /Verified\{" "\}\s*\{last\.c\}, \{last\.pr\} reference since/, "legend wording comes from the latest point's own record");
  // both card render paths take the tile range from the comparable run, not the whole series
  for (const f of ["app/cards/[slug]/page.js", "components/CatalogCardView.js"]) {
    const src = code(f);
    assert.match(src, /minPrice: priceHistory\?\.comparableRange\?\.min \?\? null,\s*maxPrice: priceHistory\?\.comparableRange\?\.max \?\? null,/, f);
    assert.doesNotMatch(src, /Math\.min\(\.\.\.chartPoints/, f + ": no whole-series range");
  }
  // the intelligence panel explains both withheld reasons
  const cpi = read("components/CardPriceIntelligence.js");
  assert.match(cpi, /provenance-unknown/);
  assert.match(cpi, /reference-changed/);
  // the comparable tail is empty when the latest point is unverified (nothing to compare TO)
  const { comparableTail, mergeHistoryRows } = ph();
  assert.deepEqual(comparableTail(mergeHistoryRows(drifting(10, () => ({})))), []);
  assert.equal(comparableTail(mergeHistoryRows(drifting(10))).length, 10);
});

test("16. consumer audit: chart / trend / lastmod keep the legacy series key for compatibility, label nothing Near Mint from it, and the read path tolerates only the specific schema gap", () => {
  const hist = code("lib/priceHistory.js");
  assert.match(hist, /reference_condition, reference_printing/, "canonical read selects the provenance");
  assert.match(hist, /if \(error && isMissingProvenanceColumnError\(error\)\) \(\{ data, error \} = await build\(BASE_COLS\)\);/, "fallback only on the specific schema error");
  assert.match(hist, /if \(error\) return \{ series: \[\], rows: \[\], error: error\.message \};/, "any other error is surfaced");
  // the card-page history fetch keeps the legacy key as the SERIES KEY (compatibility)
  assert.match(code("lib/deals.js"), /getCanonicalPriceHistory\(supabaseAdmin\(\), String\(tcgplayerId\), \{\s*condition: "Near Mint",/);
  // the chart heading is neutral; the headline label next to it is derived from the LIVE reference, not the series key
  for (const f of ["app/cards/[slug]/page.js", "components/CatalogCardView.js"]) {
    assert.match(read(f), /Market price history/, `${f}: neutral chart heading`);
    assert.doesNotMatch(code(f), /Near Mint (price )?history|history[^\n]{0,40}Near Mint/, `${f}: chart never labelled Near Mint`);
  }
  // the intelligence panel explains a withheld reference-changed trend
  assert.match(read("components/CardPriceIntelligence.js"), /reference-changed/);
  // sitemap lastmod: the deployed SQL function is untouched by this patch. It keys on the series key and
  // reacts to any material change of the DISPLAYED reference - a condition switch that moves the figure is a
  // real page change, which is what lastmod is for; it is not presented as a price trend anywhere.
  assert.match(read("supabase/card_reference_lastmod_migration.sql"), /ph\.condition = 'Near Mint'/);
  assert.doesNotMatch(read("supabase/price_condition_provenance_migration.sql").replace(/--[^\n]*/g, ""), /card_reference_lastmod|create or replace function|create function/i, "the migration does not touch the function");
  // no code path writes a non-null reference_condition from a headline / aggregate figure
  assert.doesNotMatch(code("app/api/sync-card-catalog/route.js"), /reference_condition: "Near Mint"|market_condition: "Near Mint"/);
  assert.doesNotMatch(code("app/api/sync-watchlist/route.js"), /reference_condition: "Near Mint"/);
});
