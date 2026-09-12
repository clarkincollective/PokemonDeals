// Phase 17C.5 - bounded Pokemon-page expansion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SPECIES_PILOT,
  isSpeciesPilot,
  speciesEraGroups,
  speciesCoverageFacts,
  speciesConditionNote,
  speciesReferencesLikeForLike,
} from "../../lib/speciesCoverage.js";
import { isSpecialtyCard, isStoredSpecialtyCard } from "../../lib/catalogueView.js";
import { buildChecklistRows } from "../../lib/setChecklist.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let seq = 0;
const card = (over = {}) => {
  seq++;
  return {
    tcgplayerId: String(9000 + seq),
    name: "Cleffa",
    displayName: "Cleffa",
    set: "Neo Genesis",
    cardNumber: `${seq}/111`,
    rarity: "Rare",
    cardType: "Pokemon",
    refPrice: 5,
    refCondition: null,
    refPrinting: null,
    hubSlug: null,
    catalogSlug: `cleffa-${seq}`,
    ...over,
  };
};

test("C5-1. allowlist: Dragonite plus exactly five GSC-backed species; nothing else", () => {
  assert.deepEqual([...SPECIES_PILOT], ["Dragonite", "Cleffa", "Arcanine", "Houndoom", "Electrode", "Growlithe"]);
  for (const s of ["Charizard", "Shieldon", "Pikachu", "cleffa"]) assert.equal(isSpeciesPilot(s), false, s);
  assert.ok(Object.isFrozen(SPECIES_PILOT));
});

test("C5-2. Jumbo / World Championship COUNT uses the stored set classification only - never a name marker", () => {
  const jumboSet = card({ set: "Jumbo Cards", name: "Cleffa" });
  const wcd = card({ set: "World Championship Decks", name: "Cleffa - 20/111 (2004 Team Magma Deck)" });
  const nameOnly = card({ set: "Neo Genesis", name: "Cleffa (Jumbo)" }); // name marker, normal set
  assert.equal(isStoredSpecialtyCard(jumboSet), true);
  assert.equal(isStoredSpecialtyCard(wcd), true);
  assert.equal(isStoredSpecialtyCard(nameOnly), false, "stored set is Neo Genesis");
  assert.equal(isSpecialtyCard(nameOnly), true, "the display-tier helper still demotes it (unchanged behaviour)");
  const f = speciesCoverageFacts([card(), card(), jumboSet, wcd, nameOnly]);
  assert.equal(f.specialty, 2, "only the two stored specialty rows are counted as Jumbo / World Championship");
  assert.equal(f.otherTracked, 3, "cards outside the stored specialty sets");
  assert.match(code("lib/speciesCoverage.js"), /const specialty = list\.filter\(\(c\) => isStoredSpecialtyCard\(c\)\)\.length;/);
});

test("C5-3. species with zero stored specialty rows: the answer never mentions Jumbo counts it can't back", () => {
  const f = speciesCoverageFacts([card(), card({ set: "Team Rocket" })]);
  assert.equal(f.specialty, 0);
  const qa = code("components/SpeciesQuickAnswers.js");
  assert.match(qa, /\{f\.specialty > 0\s*\? `: \$\{f\.specialty\} Jumbo \/ World Championship/, "the Jumbo clause is conditional on a stored count");
  // specialty is known only from set membership: the rest are "other tracked
  // cards", never labelled "standard" (17C.5 count-label check)
  assert.match(qa, /other tracked \$\{f\.otherTracked === 1 \? "card" : "cards"\}/);
  assert.doesNotMatch(qa, /\bstandard\b/);
  assert.equal(Object.hasOwn(f, "standard"), false, "no 'standard' field to misuse");
});

test("C5-4. mixed and missing provenance: per-row condition only where recorded; legend and value heading follow it", () => {
  const cards = [card({ refCondition: "Near Mint" }), card({ refCondition: null }), card({ refPrice: null }), card({ refPrice: 9999.99 })];
  const rows = buildChecklistRows(cards);
  assert.deepEqual(rows.map((r) => r.reference?.conditionLabel ?? null), ["Near Mint", null, null, null]);
  assert.match(speciesConditionNote(cards), /A condition is shown where our catalogue has recorded it \(1 of 2\)/);
  assert.equal(speciesReferencesLikeForLike(cards), false);
  assert.equal(speciesReferencesLikeForLike([card({ refCondition: "Near Mint" })]), true);
});

test("C5-5. missing-price cards stay linked when their exact page resolves; missing collector numbers sort last and show a dash", () => {
  const rows = buildChecklistRows([card({ refPrice: null, cardNumber: null }), card({ cardNumber: "2/111" })]);
  assert.equal(rows[0].number, "2/111");
  assert.equal(rows[1].number, null);
  assert.ok(rows.every((r) => r.href), "unpriced + unnumbered card still links to its resolving page");
  // 17C.11: the shared row cells live in components/ChecklistRow
  assert.match(code("components/ChecklistRow.js"), /<td>\{r\.number \?\? "—"\}<\/td>/);
});

test("C5-6. undated sets stay under 'Other sets'", () => {
  const g = speciesEraGroups([card({ set: "Neo Genesis" }), card({ set: "Jumbo Cards" }), card({ set: "Southern Islands" })]);
  assert.equal(g.at(-1).era.key, "undated");
  assert.equal(g.at(-1).era.label, "Other sets");
});

test("C5-8. the price summary's range exclusion says 'priced' on pilot pages, so it can't contradict the total Jumbo / World Championship count", () => {
  const src = code("components/SpeciesPriceSummary.js");
  assert.match(src, /\? conditionNote\s*\?[\s\S]*?priced Jumbo \/ World Championship \$\{[\s\S]*?\} excluded from the range above\./);
  assert.match(src, /: ` \$\{specialtyPricedCount\} Jumbo \/ World Championship \$\{[\s\S]*?\} tracked separately and excluded from the range above\.`/, "non-pilot wording unchanged");
});

test("C5-7. both templates get the same scoped content; the catalogue-only intro is now scoped too", () => {
  const cat = code("components/SpeciesCatalog.js");
  assert.match(cat, /const pilot = indexable && isSpeciesPilot\(speciesName\);/);
  assert.match(cat, /\{pilot && coverageFacts\?\.earliestSet \? \(/);
  assert.match(cat, /starting with \{coverageFacts\.earliestSet\},\s*the earliest dated set we track/);
  assert.match(cat, /There is no qualifying below-market \{speciesName\}\{" "\}\s*deal to feature right now/);
  const page = code("app/pokemon/[slug]/page.js");
  assert.match(page, /the earliest dated set we track/);
  for (const src of [cat, page]) {
    assert.match(src, /eraGroups=\{eraGroups\}/);
    assert.match(src, /eras=\{byEra\} conditionNote=\{conditionNote\}/);
    assert.match(src, /coverage=\{pilot \? \{ facts: coverageFacts, datedSets, conditionNote \} : null\}/);
  }
});
