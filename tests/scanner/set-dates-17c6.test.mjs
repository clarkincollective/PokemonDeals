// Phase 17C.6 - evidence-backed dates for undated sets on the species pilots.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SET_RELEASE_ORDER,
  SET_RELEASE_SUPPLEMENTS,
  setReleaseRank,
  setChronologyRank,
} from "../../lib/pokemonSets.js";
import { eraForSet, speciesEraGroups, speciesCoverageFacts } from "../../lib/speciesCoverage.js";

const UNRANKED = Number.MAX_SAFE_INTEGER;

// Expected era, plus the pokemontcg.io release dates of the anchor (`after`)
// and of the next set in SET_RELEASE_ORDER - the supplement's own date must
// fall between them, so its position is supported by dates, not guessed.
const EXPECT = {
  "Dragon Vault": { era: "bwxy", next: "Boundaries Crossed", dates: ["2012-08-15", "2012-11-07"] },
  "Legendary Treasures: Radiant Collection": { era: "bwxy", next: "XY Base Set", dates: ["2013-11-06", "2014-02-05"] },
  "Shining Legends": { era: "sm", next: "SM - Crimson Invasion", dates: ["2017-08-05", "2017-11-03"] },
  "Dragon Majesty": { era: "sm", next: "SM - Lost Thunder", dates: ["2018-08-03", "2018-11-02"] },
  "McDonald's Promos 2018": { era: "sm", next: "SM - Lost Thunder", dates: ["2018-08-03", "2018-11-02"] },
  "Detective Pikachu": { era: "sm", next: "SM - Unbroken Bonds", dates: ["2019-02-01", "2019-05-03"] },
  "Hidden Fates: Shiny Vault": { era: "sm", next: "SM - Cosmic Eclipse", dates: ["2019-08-23", "2019-11-01"] },
  "SWSH09: Brilliant Stars Trainer Gallery": { era: "swsh", next: "SWSH10: Astral Radiance", dates: ["2022-02-25", "2022-05-27"] },
  "McDonald's Promos 2022": { era: "swsh", next: "SWSH11: Lost Origin", dates: ["2022-07-01", "2022-09-09"] },
  "SWSH11: Lost Origin Trainer Gallery": { era: "swsh", next: "SWSH12: Silver Tempest", dates: ["2022-09-09", "2022-11-11"] },
};

// Undated sets on the six pilot pages that must stay under "Other sets":
// multi-year promo series, specialty/aggregate groups, and sets with no
// matching dated English record (McDonald's 2024) or no era block to hold
// them (ME: Ascended Heroes - dating it would mislabel it Scarlet & Violet).
const STILL_UNDATED = [
  "WoTC Promo", "Nintendo Promos", "HGSS Promos", "Black and White Promos", "XY Promos", "SM Promos",
  "SWSH: Sword & Shield Promo Cards", "SV: Scarlet & Violet Promo Cards", "ME: Mega Evolution Promo",
  "Jumbo Cards", "World Championship Decks", "Deck Exclusives", "Blister Exclusives", "League & Championship Cards",
  "Prize Pack Series Cards", "Miscellaneous Cards & Products", "Battle Academy 2024", "My First Battle",
  "Trick or Trade BOOster Bundle 2023", "Trick or Trade BOOster Bundle 2024", "EX Trainer Kit 2: Plusle & Minun",
  "Trading Card Game Classic", "McDonald's Promos 2024", "ME: Ascended Heroes",
];

const card = (set, cardNumber = "1", over = {}) => ({ set, cardNumber, name: "Growlithe", refPrice: 1, ...over });

test("D-1. search is untouched: SET_RELEASE_ORDER is unchanged and supplements have no search rank", () => {
  assert.equal(SET_RELEASE_ORDER.length, 118);
  assert.equal(SET_RELEASE_ORDER[0], "Base Set (Shadowless)");
  assert.equal(SET_RELEASE_ORDER.at(-1), "ME: 30th Celebration");
  for (const s of SET_RELEASE_SUPPLEMENTS) {
    assert.equal(SET_RELEASE_ORDER.includes(s.set), false, s.set);
    assert.equal(setReleaseRank(s.set), UNRANKED, `${s.set}: collector-number tiebreak unchanged`);
  }
  for (const [i, name] of SET_RELEASE_ORDER.entries()) assert.equal(setChronologyRank(name), i, name);
});

test("D-2. exactly the ten evidence-backed sets, each with a date, a source record and a catalogue check", () => {
  assert.ok(Object.isFrozen(SET_RELEASE_SUPPLEMENTS));
  assert.deepEqual(SET_RELEASE_SUPPLEMENTS.map((s) => s.set).sort(), Object.keys(EXPECT).sort());
  for (const s of SET_RELEASE_SUPPLEMENTS) {
    assert.match(s.released, /^\d{4}-\d{2}-\d{2}$/, s.set);
    assert.ok(s.ptcgio && s.check, s.set);
    assert.ok(SET_RELEASE_ORDER.includes(s.after), `${s.set}: anchor ${s.after} is listed`);
  }
});

test("D-3. each date sits between its anchor and the next listed set, and so does its rank", () => {
  for (const s of SET_RELEASE_SUPPLEMENTS) {
    const e = EXPECT[s.set];
    const anchor = SET_RELEASE_ORDER.indexOf(s.after);
    assert.equal(SET_RELEASE_ORDER[anchor + 1], e.next, `${s.set}: next listed set`);
    assert.ok(e.dates[0] <= s.released && s.released < e.dates[1], `${s.set}: ${e.dates[0]} <= ${s.released} < ${e.dates[1]}`);
    const r = setChronologyRank(s.set);
    assert.ok(r > anchor && r < anchor + 1, `${s.set}: rank ${r}`);
  }
});

test("D-4. resolved sets map to the correct era", () => {
  for (const [set, e] of Object.entries(EXPECT)) assert.equal(eraForSet(set).key, e.era, set);
  assert.equal(eraForSet("dragon majesty").key, "sm", "case-insensitive, like setReleaseRank");
});

test("D-5. promo series, specialty groups and unverified sets stay under 'Other sets'", () => {
  for (const set of STILL_UNDATED) {
    assert.equal(setChronologyRank(set), UNRANKED, set);
    assert.equal(eraForSet(set).key, "undated", set);
  }
  assert.equal(eraForSet("Made Up Set").key, "undated");
});

test("D-6. grouping: supplements sort chronologically inside their era; same-anchor entries by date", () => {
  const groups = speciesEraGroups([
    card("SM - Lost Thunder"),
    card("McDonald's Promos 2018"),
    card("Dragon Majesty"),
    card("SM - Celestial Storm"),
    card("Jumbo Cards"),
  ]);
  assert.deepEqual(groups.map((g) => g.era.key), ["sm", "undated"]);
  assert.deepEqual(groups[0].sets.map((s) => s.set), ["SM - Celestial Storm", "Dragon Majesty", "McDonald's Promos 2018", "SM - Lost Thunder"]);
});

test("D-7. coverage facts: a resolved set counts as dated and can be the earliest dated set", () => {
  const f = speciesCoverageFacts([card("Boundaries Crossed"), card("Dragon Vault"), card("Deck Exclusives")]);
  assert.equal(f.datedSetCount, 2);
  assert.equal(f.undatedSetCount, 1);
  assert.equal(f.earliestSet, "Dragon Vault");
  assert.equal(f.firstEra.key, "bwxy");
});
