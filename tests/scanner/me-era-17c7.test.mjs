// Phase 17C.7 - Mega Evolution era and official latest-release identities.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SET_RELEASE_ORDER,
  OFFICIAL_RELEASES,
  officialRelease,
  releaseStatus,
  latestReleasedSets,
  setReleaseRank,
  setChronologyRank,
  eraForSetName,
} from "../../lib/pokemonSets.js";
import { SET_ERAS, eraForSet, speciesEraGroups } from "../../lib/speciesCoverage.js";

const INSERTED = [
  "SV: Black Bolt", "SV: White Flare",
  "ME01: Mega Evolution", "ME02: Phantasmal Flames", "ME: Ascended Heroes",
  "ME03: Perfect Order", "ME04: Chaos Rising", "ME05: Pitch Black",
];

test("R-1. insertions only: the eight dated sets sit between SV10 and 30th Celebration; nothing existing moved", () => {
  const i = SET_RELEASE_ORDER.indexOf("SV10: Destined Rivals");
  assert.deepEqual(SET_RELEASE_ORDER.slice(i + 1), [...INSERTED, "ME: 30th Celebration"]);
  const without = SET_RELEASE_ORDER.filter((s) => !INSERTED.includes(s));
  assert.equal(without.length, 118, "the pre-17C.7 list, same order");
  assert.equal(without.at(-2), "SV10: Destined Rivals");
  assert.equal(without.at(-1), "ME: 30th Celebration");
  assert.equal(new Set(SET_RELEASE_ORDER).size, SET_RELEASE_ORDER.length, "no duplicates");
});

test("R-2. every official identity has an official name, an ISO date and an official source link; list order matches dates", () => {
  for (const r of OFFICIAL_RELEASES) {
    assert.ok(r.officialName, r.set);
    assert.match(r.released, /^\d{4}-\d{2}-\d{2}$/, r.set);
    assert.ok(r.sources.length > 0, r.set);
    for (const u of r.sources) assert.match(u, /^https:\/\/(www\.pokemon\.com|tcg\.pokemon\.com)\//, `${r.set}: official source`);
    assert.ok(SET_RELEASE_ORDER.includes(r.set), `${r.set} is ranked`);
  }
  const byRank = [...OFFICIAL_RELEASES].sort((a, b) => setReleaseRank(a.set) - setReleaseRank(b.set));
  for (let k = 1; k < byRank.length; k++) {
    assert.ok(byRank[k - 1].released <= byRank[k].released, `${byRank[k - 1].set} (${byRank[k - 1].released}) before ${byRank[k].set} (${byRank[k].released})`);
  }
  // the neighbours the insertions sit between are consistent too
  assert.ok("2025-05-30" <= officialRelease("SV: Black Bolt").released, "after SV10 Destined Rivals (2025-05-30)");
});

test("R-3. catalogue names are not taken as official names", () => {
  assert.equal(officialRelease("ME: Ascended Heroes").officialName, "Mega Evolution—Ascended Heroes");
  assert.equal(officialRelease("ME02: Phantasmal Flames").officialName, "Mega Evolution—Phantasmal Flames");
  const c = officialRelease("ME: 30th Celebration");
  assert.equal(c.officialName, "30th Celebration", "no 'ME:' / 'Mega Evolution—' prefix officially");
  assert.equal(c.series, null, "series not stated on any official page");
  assert.equal(officialRelease("ME: Mega Evolution Promo"), null, "promo aggregate has no single official release");
});

test("R-4. 30th Celebration is upcoming until its official worldwide date", () => {
  assert.equal(releaseStatus("ME: 30th Celebration", "2026-09-12"), "upcoming");
  assert.equal(releaseStatus("ME: 30th Celebration", "2026-09-15"), "upcoming");
  assert.equal(releaseStatus("ME: 30th Celebration", "2026-09-16"), "released");
  assert.equal(releaseStatus("ME05: Pitch Black", "2026-09-12"), "released");
  assert.equal(releaseStatus("Made Up Set", "2026-09-12"), null);
});

test("R-5. latest released sets come from official dates, newest first, never an upcoming set", () => {
  assert.deepEqual(latestReleasedSets("2026-09-12").map((r) => r.set), ["ME05: Pitch Black", "ME04: Chaos Rising", "ME03: Perfect Order"]);
  assert.equal(latestReleasedSets("2026-09-16")[0].set, "ME: 30th Celebration");
  assert.deepEqual(latestReleasedSets("2025-08-01", 2).map((r) => r.set), ["SV: White Flare", "SV: Black Bolt"], "same-day split: list order breaks the tie");
});

test("R-6. eras: Scarlet & Violet closes at 2025; Mega Evolution holds the ME sets; aggregates stay undated", () => {
  const sv = SET_ERAS.find((e) => e.key === "sv");
  const me = SET_ERAS.find((e) => e.key === "me");
  assert.equal(sv.years, "2023–2025");
  assert.deepEqual([me.label, me.years, me.startSet], ["Mega Evolution", "2025 onwards", "ME01: Mega Evolution"]);
  assert.equal(SET_ERAS.at(-1).key, "me");
  for (const s of ["SV10: Destined Rivals", "SV: Black Bolt", "SV: White Flare", "SV: Prismatic Evolutions"]) assert.equal(eraForSet(s).key, "sv", s);
  for (const s of [...INSERTED.slice(2), "ME: 30th Celebration", "ME: 30th Celebration Classic Collection"]) assert.equal(eraForSet(s).key, "me", s);
  for (const s of ["ME: Mega Evolution Promo", "MEE: Mega Evolution Energies", "SV: Scarlet & Violet Promo Cards", "SVE: Scarlet & Violet Energies"]) {
    assert.equal(eraForSet(s).key, "undated", s);
  }
  const g = speciesEraGroups([{ set: "ME: 30th Celebration", cardNumber: "157/128" }, { set: "ME02: Phantasmal Flames", cardNumber: "1/94" }, { set: "SV: White Flare", cardNumber: "1/86" }]);
  assert.deepEqual(g.map((x) => x.era.key), ["sv", "me"]);
  assert.deepEqual(g[1].sets.map((s) => s.set), ["ME02: Phantasmal Flames", "ME: 30th Celebration"]);
});

test("R-7. search consumers: ranks follow release order, promos still rank last, the query era split is unchanged", () => {
  assert.ok(setReleaseRank("SV10: Destined Rivals") < setReleaseRank("SV: Black Bolt"));
  assert.ok(setReleaseRank("ME05: Pitch Black") < setReleaseRank("ME: 30th Celebration"));
  assert.equal(setReleaseRank("ME: Mega Evolution Promo"), Number.MAX_SAFE_INTEGER);
  assert.equal(setReleaseRank("ME: 30th Celebration Classic Collection"), Number.MAX_SAFE_INTEGER, "supplement: chronology only");
  assert.ok(setChronologyRank("ME: 30th Celebration Classic Collection") > setChronologyRank("ME: 30th Celebration"));
  for (const s of INSERTED) assert.equal(eraForSetName(s), "modern", s);
});
