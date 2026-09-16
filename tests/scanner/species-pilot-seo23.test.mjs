// SEO-2.3 - controlled Pokemon enrichment pilot.
//
// 20 species join the existing 6-species SPECIES_PILOT; 20 matched species
// are pre-registered as an untreated control and must STAY untreated. The
// remaining ~948 indexable species are also untreated. These tests exist so
// the cohorts cannot drift mid-experiment and so the treatment cannot leak
// into the control or the wider population.
//
// The experiment is metadata-only plus the existing body treatment. It must
// not touch indexability, canonicals, robots, sitemaps or structured data,
// and it must not put volatile prices into metadata.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  SPECIES_PILOT,
  SPECIES_PILOT_SEO23,
  SPECIES_CONTROL_SEO23,
  isSpeciesPilot,
  speciesPilotDescription,
  speciesCoverageFacts,
} from "../../lib/speciesCoverage.js";
import { speciesPilotPageTitle, speciesPageTitle, SPECIES_TITLE_CAP } from "../../lib/speciesHub.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// --- cohort integrity ---------------------------------------------------

test("1. the original six are still treated and the cohort grew by exactly 20", () => {
  for (const n of ["Dragonite", "Cleffa", "Arcanine", "Houndoom", "Electrode", "Growlithe"]) {
    assert.ok(isSpeciesPilot(n), `${n} must remain treated`);
  }
  assert.equal(SPECIES_PILOT_SEO23.length, 20);
  assert.equal(SPECIES_PILOT.length, 26);
  assert.equal(new Set(SPECIES_PILOT).size, 26, "no duplicates");
});

test("2. Pikachu and Charizard are treated", () => {
  assert.ok(isSpeciesPilot("Pikachu"));
  assert.ok(isSpeciesPilot("Charizard"));
});

test("3. the control cohort is 20, disjoint from the treated cohort, and untreated", () => {
  assert.equal(SPECIES_CONTROL_SEO23.length, 20);
  assert.equal(new Set(SPECIES_CONTROL_SEO23).size, 20, "no duplicates");
  for (const n of SPECIES_CONTROL_SEO23) {
    assert.ok(!isSpeciesPilot(n), `${n} is the control and must NOT be treated`);
  }
  const overlap = SPECIES_CONTROL_SEO23.filter((n) => SPECIES_PILOT.includes(n));
  assert.deepEqual(overlap, [], "control and treated cohorts must not intersect");
});

test("4. Popplio stays out - it was rejected on a real data-quality ground", () => {
  // 9 sets, 3 dated (33%), 2 eras: the era checklist would be mostly
  // "undated", which is the treatment failing rather than being tested
  assert.ok(!isSpeciesPilot("Popplio"));
  const src = read("lib/speciesCoverage.js");
  assert.match(src, /POPPLIO WAS CONSIDERED AND REJECTED/);
});

test("5. the vast majority of species remain untreated", () => {
  // the experiment is only meaningful while most of the ~988 indexable
  // species are a control population
  assert.ok(SPECIES_PILOT.length < 50, `treated cohort is ${SPECIES_PILOT.length}, far too large to learn from`);
});

// --- title system -------------------------------------------------------

test("6. the pilot title drops the unsupported completeness claim", () => {
  const t = speciesPilotPageTitle("Pikachu");
  assert.equal(t, "Pikachu Cards: Prices, Values & Card List");
  assert.doesNotMatch(t, /Full List/i, "the page's own FAQ contradicts a completeness claim");
  // and it still carries the three intents Search Console shows
  for (const w of ["Cards", "Prices", "Values", "Card List"]) assert.match(t, new RegExp(w));
});

test("7. non-pilot titles are unchanged", () => {
  assert.equal(speciesPageTitle("Eevee"), "Eevee Cards – Full List, Prices & Values");
});

test("8. the length ladder is deterministic, not a list of exceptions", () => {
  // longest real indexable species name is 12 chars -> 46, always rung 1
  assert.ok(speciesPilotPageTitle("Crabominable").length <= SPECIES_TITLE_CAP);
  // the lower rungs are defensive; force them with a synthetic long name
  const long = "A".repeat(40);
  assert.equal(speciesPilotPageTitle(long, 65), `${long} Cards: Prices & Card List`.length <= 65 ? `${long} Cards: Prices & Card List` : `${long} Pokemon Cards`);
  assert.ok(speciesPilotPageTitle("A".repeat(60), 65).endsWith("Pokemon Cards"), "final rung wins when nothing fits");
  // the last rung is returned even if it exceeds the cap - never empty
  assert.ok(speciesPilotPageTitle("A".repeat(200), 65).length > 0);
  assert.equal(speciesPilotPageTitle(""), "");
});

// --- description system -------------------------------------------------

const facts = (over = {}) => ({ total: 75, setCount: 39, eraCount: 8, priced: 67, ...over });

test("9. the description states only stable deterministic counts", () => {
  const d = speciesPilotDescription("Dragonite", facts());
  assert.equal(d, "Browse 75 cards we track for Dragonite across 39 sets, spanning 8 eras. Compare card prices, values and current marketplace deals where available.");
});

test("10. NO volatile price or deal figure may appear in metadata", () => {
  const d = speciesPilotDescription("Dragonite", facts({ minPrice: 0.04, maxPrice: 799.68, liveDeals: 6 }));
  assert.doesNotMatch(d, /\$/, "no price in metadata");
  assert.doesNotMatch(d, /\b0\.04\b|\b799\b|median/i);
  assert.doesNotMatch(d, /\b6 (deals|listings)\b/);
  // and the source file must not reach for those fields
  const src = read("lib/speciesCoverage.js");
  const fn = src.slice(src.indexOf("export function speciesPilotDescription"));
  for (const bad of ["minPrice", "maxPrice", "median", "discount", "liveDeals"]) {
    assert.ok(!fn.slice(0, 600).includes(bad), `speciesPilotDescription must not read ${bad}`);
  }
});

test("11. singular and plural fallbacks read correctly", () => {
  assert.match(speciesPilotDescription("X", facts({ total: 1, setCount: 1, eraCount: 2 })), /Browse 1 card we track for X across 1 set, spanning 2 eras/);
  assert.match(speciesPilotDescription("X", facts({ eraCount: 2 })), /spanning 2 eras/);
});

test("12. era wording is withheld when it would say nothing", () => {
  // 1 era is not a span; 0 means nothing in this species' sets is dated
  for (const eraCount of [0, 1]) {
    const d = speciesPilotDescription("X", facts({ eraCount }));
    assert.doesNotMatch(d, /spanning/, `eraCount=${eraCount} must not claim a span`);
    assert.match(d, /Browse 75 cards we track for X across 39 sets\./);
  }
});

test("13. a species with no eligible cards gets no fabricated description", () => {
  assert.equal(speciesPilotDescription("X", facts({ total: 0 })), null);
  assert.equal(speciesPilotDescription("X", null), null);
  assert.equal(speciesPilotDescription("", facts()), null);
});

// --- count consistency (mandatory per SEO-2.2) --------------------------

test("14. metadata counts come from the SAME eligible card list the body renders", () => {
  // SEO-2.2 found a raw DB query gives Dragonite 80 cards while the page
  // shows 75, because the page applies isEligibleSpeciesCard. The metadata
  // must never take the raw number.
  const cards = [
    { name: "Dragonite", set: "Base Set", refPrice: 10 },
    { name: "Dragonite ex", set: "EX Dragon", refPrice: 20 },
    { name: "Dragonite V", set: "SWSH07: Evolving Skies", refPrice: 30 },
  ];
  const f = speciesCoverageFacts(cards);
  const d = speciesPilotDescription("Dragonite", f);
  assert.match(d, new RegExp(`Browse ${f.total} cards`), "card count must equal speciesCoverageFacts.total");
  assert.match(d, new RegExp(`across ${f.setCount} sets`), "set count must equal speciesCoverageFacts.setCount");
  // the page helper is the single source for both
  const page = read("app/pokemon/[slug]/page.js");
  assert.match(page, /const facts = speciesCoverageFacts\(cards \?\? \[\]\);/);
  assert.match(page, /speciesPilotDescription\(speciesName, facts\)/);
});

test("15. both metadata branches route through one pilot helper", () => {
  const page = read("app/pokemon/[slug]/page.js");
  assert.equal((page.match(/pilotMetaFor\(/g) ?? []).length, 3, "one definition + both branches");
  assert.match(page, /const t = pilot\?\.title \?\? speciesPageTitle\(speciesName\);/);
  assert.match(page, /const title = pilot\?\.title \?\? speciesPageTitle\(resolved\.name\);/);
});

// --- what must NOT change ----------------------------------------------

test("16. the experiment changes no indexability, canonical, robots or schema rule", () => {
  const page = read("app/pokemon/[slug]/page.js");
  assert.match(page, /alternates: \{ canonical \}/, "canonical behaviour intact");
  assert.match(page, /robots: \{ index: false, follow: true \}/, "thin-species noindex intact");
  // the pilot helper must not touch any of them
  const fn = page.slice(page.indexOf("function pilotMetaFor"), page.indexOf("export async function generateMetadata"));
  for (const bad of ["robots", "canonical", "@type", "index:"]) {
    assert.ok(!fn.includes(bad), `pilotMetaFor must not touch ${bad}`);
  }
  // indexability thresholds untouched
  assert.match(read("lib/speciesHub.js"), /SPECIES_CATALOG_MIN_CARDS = 6/);
});

test("17. no extra per-request query: the pilot reuses the cached species catalogue", () => {
  const page = read("app/pokemon/[slug]/page.js");
  assert.match(page, /isSpeciesPilot\(resolved\.name\)\s*\?\s*pilotMetaFor\(resolved\.name, \(await fetchSpeciesCatalog\(resolved\.name\)\)\.cards\)/);
  // non-pilot species must not pay for the call at all
  assert.match(page, /:\s*null;/);
  assert.match(read("lib/deals.js"), /unstable_cache\(fetchSpeciesCatalogUncached, \["species-catalog-v3"\]/);
});
