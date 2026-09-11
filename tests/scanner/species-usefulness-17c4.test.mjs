// Phase 17C.4 - Pokemon-page usefulness pilot (Dragonite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SPECIES_PILOT,
  isSpeciesPilot,
  SET_ERAS,
  UNDATED_ERA,
  eraForSet,
  speciesEraGroups,
  speciesCoverageFacts,
  speciesConditionNote,
  speciesReferencesLikeForLike,
} from "../../lib/speciesCoverage.js";
import { SET_RELEASE_ORDER } from "../../lib/pokemonSets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let seq = 0;
const card = (over = {}) => {
  seq++;
  return {
    tcgplayerId: String(5000 + seq),
    name: "Dragonite",
    displayName: "Dragonite",
    set: "Fossil",
    cardNumber: `${seq}/62`,
    rarity: "Holo Rare",
    cardType: "Pokemon",
    refPrice: 10,
    refCondition: null,
    refPrinting: null,
    hubSlug: null,
    catalogSlug: `dragonite-${seq}`,
    ...over,
  };
};

test("SP-1. Dragonite stays first on the reviewed allowlist (17C.5 adds five more)", () => {
  assert.equal(SPECIES_PILOT[0], "Dragonite");
  assert.equal(SPECIES_PILOT.length, 6);
  assert.equal(isSpeciesPilot("Dragonite"), true);
  assert.equal(isSpeciesPilot("Pikachu"), false);
  assert.equal(isSpeciesPilot("dragonite"), false, "exact species name, as resolved");
});

test("SP-2. eras come only from the curated release list; unlisted sets are undated, never guessed", () => {
  for (const e of SET_ERAS) assert.ok(SET_RELEASE_ORDER.includes(e.startSet), `${e.startSet} is in SET_RELEASE_ORDER`);
  const cases = {
    Fossil: "wotc", "Neo Destiny": "wotc", "EX Dragon": "ex", "EX Dragon Frontiers": "ex", "Legends Awakened": "dp",
    Triumphant: "dp", "Plasma Freeze": "bwxy", "XY - Evolutions": "bwxy", "SM - Unified Minds": "sm",
    "SWSH07: Evolving Skies": "swsh", "Pokemon GO": "swsh", "SV03: Obsidian Flames": "sv", "SV: Scarlet & Violet 151": "sv",
    "Dragon Majesty": "undated", "Jumbo Cards": "undated", "SWSH: Sword & Shield Promo Cards": "undated", "Made Up Set": "undated",
  };
  for (const [set, key] of Object.entries(cases)) assert.equal(eraForSet(set).key, key, set);
  assert.equal(UNDATED_ERA.years, null, "undated sets get no invented years");
});

test("SP-3. grouping: eras oldest first (undated last), sets in release order, cards by collector number, set links only for real set pages", () => {
  const groups = speciesEraGroups(
    [
      card({ set: "Jumbo Cards", cardNumber: "1" }),
      card({ set: "SV03: Obsidian Flames", cardNumber: "159/197" }),
      card({ set: "Team Rocket", cardNumber: "22/82" }),
      card({ set: "Fossil", cardNumber: "19/62" }),
      card({ set: "Fossil", cardNumber: "4/62" }),
      card({ set: "Dragon Majesty", cardNumber: "49/70" }),
      card({ set: "Blister Exclusives", cardNumber: "2" }),
    ],
    ["fossil", "sv03-obsidian-flames"]
  );
  assert.deepEqual(groups.map((g) => g.era.key), ["wotc", "sv", "undated"]);
  assert.deepEqual(groups[0].sets.map((s) => s.set), ["Fossil", "Team Rocket"], "release order, not card count");
  assert.deepEqual(groups[0].sets[0].cards.map((c) => c.cardNumber), ["4/62", "19/62"]);
  assert.deepEqual(groups[2].sets.map((s) => s.set), ["Blister Exclusives", "Dragon Majesty", "Jumbo Cards"], "undated: by name");
  assert.equal(groups[0].sets[0].slug, "fossil");
  assert.equal(groups[0].sets[1].slug, null, "no /sets link without a real set page");
});

test("SP-4. coverage facts are counts only - standard vs Jumbo, dated vs undated sets, era span, priced vs unpriced", () => {
  const f = speciesCoverageFacts([
    card({ set: "Fossil" }),
    card({ set: "Fossil" }),
    card({ set: "EX Dragon" }),
    card({ set: "SV03: Obsidian Flames", refPrice: null }),
    card({ set: "Jumbo Cards", name: "Dragonite (Jumbo)", rarity: "Promo" }),
    card({ set: "Dragon Majesty" }),
  ]);
  assert.equal(f.total, 6);
  assert.equal(f.setCount, 5);
  assert.equal(f.datedSetCount, 3);
  assert.equal(f.undatedSetCount, 2);
  assert.equal(f.eraCount, 3);
  assert.equal(f.firstEra.key, "wotc");
  assert.equal(f.lastEra.key, "sv");
  assert.equal(f.earliestSet, "Fossil");
  assert.equal(f.priced, 5);
  assert.equal(f.unpriced, 1);
  assert.equal(f.otherTracked + f.specialty, 6);
  for (const k of Object.keys(f)) assert.doesNotMatch(k, /price$|value|median|max|min|best|top/i, `no value field: ${k}`);
});

test("SP-5. condition note: same wording as the set checklists, from recorded provenance only", () => {
  assert.match(speciesConditionNote([card(), card()]), /^Condition not recorded: our catalogue has not captured which condition/);
  assert.match(speciesConditionNote([card({ refCondition: "Near Mint" }), card()]), /A condition is shown where our catalogue has recorded it \(1 of 2\)/);
  assert.equal(speciesConditionNote([card({ refCondition: "Near Mint" }), card({ refCondition: "Near Mint" })]), "Every reference here is for a Near Mint copy.");
  assert.equal(speciesConditionNote([card({ refPrice: null })]), "", "no claim when nothing is priced");
  assert.equal(speciesConditionNote([]), "");
});

test("SP-6. the era checklist reuses the set checklist's table, row, link rule and legend; plain crawlable links; no totals", () => {
  const src = code("components/SpeciesChecklist.js");
  assert.match(src, /import \{ CHECKLIST_TABLE_CLASS, ChecklistRow \} from "@\/components\/SetChecklist"/);
  assert.match(src, /buildChecklistRows\(s\.cards\)/);
  assert.match(src, /checklistLegend\(summary, allRows\)/);
  assert.match(src, /<ChecklistRow key=\{r\.key\} r=\{r\} \/>/);
  assert.match(src, /id=\{headingId\}/);
  assert.match(src, /not a value for the Pokemon/);
  assert.doesNotMatch(src, /from "next\/link"|\.reduce\(\(n, s\) => n \+ s\.rows\.length, 0\)\s*\*/, "");
  assert.doesNotMatch(src, /refPrice|sort\(/, "no ranking or value comparison in the checklist");
  const set = code("components/SetChecklist.js");
  assert.match(set, /export function ChecklistRow\(\{ r \}\)/);
  assert.match(set, /<ChecklistRow key=\{r\.key\} r=\{r\} \/>/, "the set checklist renders the same shared row");
  assert.match(set, /<a href=\{r\.href\}>\{r\.name\}<\/a>/);
});

test("SP-7. the pilot is gated: every non-pilot species renders exactly as before", () => {
  for (const f of ["app/pokemon/[slug]/page.js", "components/SpeciesCatalog.js"]) {
    const src = code(f);
    assert.match(src, /isSpeciesPilot\((resolved\.name|speciesName)\)/, f);
    assert.match(src, /const eraGroups = pilot \? speciesEraGroups\(/, f);
    assert.match(src, /const conditionNote = pilot \? speciesConditionNote\(/, f);
    assert.match(src, /coverage=\{pilot \? \{ facts: coverageFacts, datedSets, conditionNote \} : null\}/, f);
  }
  // components fall back to the old output when the pilot props are absent
  assert.match(code("components/SpeciesCardsBySet.js"), /eraGroups = null[\s\S]*\{eraGroups \? \([\s\S]*<SpeciesChecklist[\s\S]*\) : \([\s\S]*<CatalogueLinkIndex label=\{speciesName\} cards=\{items\} headingId="full-card-index" \/>/);
  assert.match(code("components/SpeciesBySet.js"), /eras = null, conditionNote = ""/);
  assert.match(code("components/SpeciesPriceSummary.js"), /conditionNote = ""/);
  assert.match(code("components/SpeciesQuickAnswers.js"), /coverage = null/);
});

test("SP-8. no new routes, metadata untouched, provenance read with the missing-column fallback", () => {
  const pokemonRoutes = readdirSync(join(ROOT, "app", "pokemon"), { recursive: true }).filter((f) => /page\.js$|route\.js$/.test(String(f)));
  assert.deepEqual(pokemonRoutes.map(String).sort(), ["[slug]\\page.js", "page.js"].map((p) => p.replace(/\\/g, process.platform === "win32" ? "\\" : "/")).sort());
  const page = code("app/pokemon/[slug]/page.js");
  const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default async function"));
  assert.doesNotMatch(meta, /pilot|speciesCoverage|eraGroups/, "generateMetadata is unchanged by the pilot");
  const deals = code("lib/deals.js");
  assert.match(deals, /async function readSpeciesCatalogRows\(speciesName, language\)/);
  assert.match(deals, /if \(withProvenance\.error && isMissingProvenanceColumnError\(withProvenance\.error\)\) return run\(BASE_COLS\);/);
  assert.match(deals, /refCondition: refPrice != null \? r\.market_condition \?\? null : null,/);
});

test("SP-9. no unsupported content: no value ranking, no biography, no mixed-condition comparison in the pilot helpers", () => {
  const lib = code("lib/speciesCoverage.js");
  assert.doesNotMatch(lib, /refPrice\)\s*-\s*Number|sort\(\(a, b\) => Number\(b\.refPrice|median|average/, "no price ranking or averaging");
  assert.doesNotMatch(lib, /evolv|habitat|anime|biography|pokedex entry/i);
  const qa = code("components/SpeciesQuickAnswers.js");
  assert.match(qa, /Code cards and sealed products that only mention/);
  assert.doesNotMatch(qa, /most popular|best card|rarest/i);
});

test("SP-10. claim check: 'earliest' = earliest DATED set we track; counts = our tracked catalogue; no like-for-like value claim when condition is unknown", () => {
  const page = code("app/pokemon/[slug]/page.js");
  assert.match(page, /\{coverageFacts\.earliestSet\}, the earliest dated set we track/);
  assert.doesNotMatch(page, /from \{coverageFacts\.earliestSet\} onward/);
  const qa = code("components/SpeciesQuickAnswers.js");
  assert.match(qa, /cards in our English catalogue/);
  assert.match(qa, /That is our tracked catalogue, not a count of every \$\{speciesName\} card ever released\./);
  // the value section: heading + intro depend on whether references are like-for-like
  assert.equal(speciesReferencesLikeForLike([card(), card()]), false, "unknown condition -> not like-for-like");
  assert.equal(speciesReferencesLikeForLike([card({ refCondition: "Near Mint" }), card()]), false, "partly recorded -> not like-for-like");
  assert.equal(speciesReferencesLikeForLike([card({ refCondition: "Near Mint" }), card({ refCondition: "Lightly Played" })]), false, "different conditions -> not like-for-like");
  assert.equal(speciesReferencesLikeForLike([card({ refCondition: "Near Mint" }), card({ refCondition: "Near Mint" })]), true, "one recorded condition -> like-for-like");
  assert.equal(speciesReferencesLikeForLike([card({ refPrice: null })]), false, "nothing priced");
  for (const [f, name] of [["app/pokemon/[slug]/page.js", "resolved.name"], ["components/SpeciesCatalog.js", "speciesName"]]) {
    const src = code(f);
    assert.match(src, /const likeForLike = pilot \? speciesReferencesLikeForLike\(/, f);
    assert.ok(src.includes("{likeForLike ? `Most valuable ${" + name + "} cards we track` : `Highest market references among ${" + name + "} cards we track`}"), `${f}: heading switches off "most valuable" when not like-for-like`);
    assert.match(src, /not an all-time ranking\s*\{likeForLike \? "" : " and not a like-for-like valuation"\}/, f);
  }
});
