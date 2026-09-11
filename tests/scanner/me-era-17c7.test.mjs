// Phase 17C.7 - Mega Evolution era, official latest-release identities,
// the release-day clock and modern-deal coverage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SET_RELEASE_ORDER,
  OFFICIAL_RELEASES,
  RELEASE_TIME_ZONE,
  RELEASE_STATUS_MAX_REVALIDATE,
  officialRelease,
  releaseDayOf,
  releaseDayStart,
  expansionReleaseStatus,
  latestReleasedExpansions,
  nextReleaseBoundary,
  setReleaseRank,
  setChronologyRank,
  eraForSetName,
} from "../../lib/pokemonSets.js";
import { SET_ERAS, eraForSet, speciesEraGroups } from "../../lib/speciesCoverage.js";
import { setEra } from "../../lib/setSummary.js";
import { eraCategoryFor } from "../../lib/cardNextSteps.js";
import dealCategories from "../../lib/dealCategories.js";

const { isModernSet, VINTAGE_SETS, DEAL_CATEGORIES } = dealCategories;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const INSERTED = [
  "SV: Black Bolt", "SV: White Flare",
  "ME01: Mega Evolution", "ME02: Phantasmal Flames", "ME: Ascended Heroes",
  "ME03: Perfect Order", "ME04: Chaos Rising", "ME05: Pitch Black",
];
const ME_EXPANSIONS = INSERTED.slice(2);
const ANNIVERSARY = ["ME: 30th Celebration", "ME: 30th Celebration Classic Collection"];

// ------------------------------------------------------------- identities

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
  assert.ok("2025-05-30" <= officialRelease("SV: Black Bolt").released, "after SV10 Destined Rivals (2025-05-30)");
});

test("R-3. catalogue names are not taken as official names or series", () => {
  assert.equal(officialRelease("ME: Ascended Heroes").officialName, "Mega Evolution—Ascended Heroes");
  assert.equal(officialRelease("ME02: Phantasmal Flames").officialName, "Mega Evolution—Phantasmal Flames");
  const c = officialRelease("ME: 30th Celebration");
  assert.equal(c.officialName, "30th Celebration", "no 'ME:' / 'Mega Evolution—' prefix officially");
  assert.equal(c.released, "2026-09-16", "confirmed official date kept");
  assert.equal(c.series, null, "series not stated on any official page");
  for (const s of ME_EXPANSIONS) assert.equal(officialRelease(s).series, "Mega Evolution Series", s);
  assert.equal(officialRelease("ME: Mega Evolution Promo"), null, "promo aggregate has no single official release");
});

// --------------------------------------------- chronology vs series identity

test("S-1. 30th Celebration is ranked by date but never grouped under a series it isn't confirmed in", () => {
  assert.ok(setChronologyRank("ME: 30th Celebration") > setChronologyRank("ME05: Pitch Black"), "chronology: newest");
  for (const s of ANNIVERSARY) {
    const era = eraForSet(s);
    assert.equal(era.key, "anniversary", s);
    assert.doesNotMatch(era.label, /Mega Evolution|Scarlet|Sword/, "neutral heading");
  }
  const anniv = SET_ERAS.find((e) => e.key === "anniversary");
  assert.equal(anniv.startSet, null, "explicit membership, not a date range");
  assert.deepEqual(anniv.sets, ANNIVERSARY);
  assert.equal(setEra("ME: 30th Celebration", { vintageSets: VINTAGE_SETS, isModernSet }), null, "set page: no series label");
});

test("S-2. eras: SV closes at 2025; Mega Evolution holds only confirmed ME expansions; aggregates stay undated", () => {
  const sv = SET_ERAS.find((e) => e.key === "sv");
  const me = SET_ERAS.find((e) => e.key === "me");
  assert.equal(sv.years, "2023–2025");
  assert.deepEqual([me.label, me.years, me.startSet], ["Mega Evolution", "2025 onwards", "ME01: Mega Evolution"]);
  for (const s of ["SV10: Destined Rivals", "SV: Black Bolt", "SV: White Flare", "SV: Prismatic Evolutions"]) assert.equal(eraForSet(s).key, "sv", s);
  for (const s of ME_EXPANSIONS) assert.equal(eraForSet(s).key, "me", s);
  for (const s of ["ME: Mega Evolution Promo", "MEE: Mega Evolution Energies", "SV: Scarlet & Violet Promo Cards", "SVE: Scarlet & Violet Energies"]) {
    assert.equal(eraForSet(s).key, "undated", s);
  }
  const g = speciesEraGroups([
    { set: "ME: 30th Celebration", cardNumber: "157/128" },
    { set: "ME02: Phantasmal Flames", cardNumber: "1/94" },
    { set: "SV: White Flare", cardNumber: "1/86" },
  ]);
  assert.deepEqual(g.map((x) => x.era.key), ["sv", "me", "anniversary"]);
});

// ---------------------------------------------------------- release clock

const BOUNDARY = "2026-09-16T07:00:00.000Z"; // midnight 16 Sep in Los Angeles (PDT)
const at = (iso) => new Date(iso);

test("C-1. the release day is read from an explicit clock in the official zone", () => {
  assert.equal(RELEASE_TIME_ZONE, "America/Los_Angeles");
  assert.equal(releaseDayStart("2026-09-16").toISOString(), BOUNDARY);
  assert.equal(releaseDayStart("2026-01-30").toISOString(), "2026-01-30T08:00:00.000Z", "PST in winter");
  assert.equal(releaseDayOf(at("2026-09-16T06:59:59.999Z")), "2026-09-15");
  assert.equal(releaseDayOf(at(BOUNDARY)), "2026-09-16");
  assert.equal(releaseDayOf(Date.parse(BOUNDARY)), "2026-09-16", "epoch ms");
  assert.equal(releaseDayOf(() => at(BOUNDARY)), "2026-09-16", "clock function");
  assert.equal(releaseDayOf("2026-09-16"), "2026-09-16", "ISO day");
  assert.throws(() => releaseDayOf("next tuesday"), /unreadable clock/);
});

test("C-2. before / on / after release day", () => {
  const s = (clock) => expansionReleaseStatus("ME: 30th Celebration", clock);
  assert.equal(s(at("2026-09-12T12:00:00Z")), "upcoming", "today (audit date)");
  assert.equal(s(at("2026-09-16T06:59:59.999Z")), "upcoming", "one ms before the boundary");
  assert.equal(s(at("2026-09-16T00:00:00+10:00")), "upcoming", "already the 16th in Sydney, not yet in Los Angeles");
  assert.equal(s(at(BOUNDARY)), "released", "on the boundary");
  assert.equal(s(at("2026-09-20T00:00:00Z")), "released", "after");
  assert.equal(expansionReleaseStatus("ME05: Pitch Black", at("2026-09-12T00:00:00Z")), "released");
  assert.equal(expansionReleaseStatus("Made Up Set", at(BOUNDARY)), null);
});

test("C-3. latest released expansions follow the clock and never include an upcoming one", () => {
  const before = latestReleasedExpansions(at("2026-09-16T06:59:59Z")).map((r) => r.set);
  const on = latestReleasedExpansions(at(BOUNDARY)).map((r) => r.set);
  assert.deepEqual(before, ["ME05: Pitch Black", "ME04: Chaos Rising", "ME03: Perfect Order"]);
  assert.deepEqual(on, ["ME: 30th Celebration", "ME05: Pitch Black", "ME04: Chaos Rising"]);
  assert.deepEqual(latestReleasedExpansions("2025-08-01", 2).map((r) => r.set), ["SV: White Flare", "SV: Black Bolt"], "same-day split: list order breaks the tie");
  for (const r of latestReleasedExpansions(at(BOUNDARY), 10)) assert.equal(r.scope, "expansion");
});

test("C-4. the next release boundary is exact, so a cache can be bounded by it", () => {
  assert.equal(nextReleaseBoundary(at("2026-09-12T00:00:00Z")).toISOString(), BOUNDARY);
  assert.equal(nextReleaseBoundary(at("2026-09-16T06:59:59Z")).toISOString(), BOUNDARY);
  assert.equal(nextReleaseBoundary(at(BOUNDARY)), null, "nothing officially dated after 30th Celebration");
  // a page cached just before the boundary with the maximum allowed
  // revalidate is re-rendered, and so shows "released", within one hour
  const cachedAt = Date.parse(BOUNDARY) - 1000;
  const refreshedBy = cachedAt + RELEASE_STATUS_MAX_REVALIDATE * 1000;
  assert.equal(expansionReleaseStatus("ME: 30th Celebration", cachedAt), "upcoming");
  assert.equal(expansionReleaseStatus("ME: 30th Celebration", refreshedBy), "released");
  assert.ok(refreshedBy - Date.parse(BOUNDARY) < 3600 * 1000);
});

// every source file (not tests) that imports a release-status helper
const HELPERS = /\b(expansionReleaseStatus|latestReleasedExpansions|nextReleaseBoundary|releaseDayOf)\b/;
function sourceFiles(dir) {
  return readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((f) => /\.(m?js|jsx)$/.test(f))
    .map((f) => join(dir, f));
}
// lib/latestReleases.js is a PURE model (17C.8): it derives the release
// lineup but renders nothing, so the cache rule applies to the routes that
// render it, which this guard still checks.
const MODEL_MODULES = [join("lib", "pokemonSets.js"), join("lib", "latestReleases.js")];
const importers = ["app", "components", "lib"]
  .flatMap(sourceFiles)
  .filter((f) => !MODEL_MODULES.some((m) => f.endsWith(m)))
  .filter((f) => HELPERS.test(readFileSync(join(ROOT, f), "utf8")));

test("C-5. cache guard: release status is only rendered by routes that re-render within an hour", () => {
  for (const f of importers) {
    const rel = relative(ROOT, join(ROOT, f)).replace(/\\/g, "/");
    assert.match(rel, /^app\/.*(page|route)\.js$/, `${rel}: only route files may render release status (so their cache policy is visible)`);
    const src = readFileSync(join(ROOT, f), "utf8");
    const reval = src.match(/export const revalidate = (\d+)/);
    const dynamic = /export const dynamic = "force-dynamic"/.test(src);
    assert.ok(dynamic || (reval && Number(reval[1]) <= RELEASE_STATUS_MAX_REVALIDATE), `${rel}: revalidate <= ${RELEASE_STATUS_MAX_REVALIDATE}s or force-dynamic`);
  }
});

test("C-6. an expansion's release date never stands in for sealed availability", () => {
  for (const f of importers) assert.doesNotMatch(f.replace(/\\/g, "/"), /sealed/i, `${f}: sealed views take availability from product/listing data`);
  for (const r of OFFICIAL_RELEASES) {
    for (const k of Object.keys(r)) assert.doesNotMatch(k, /stock|availab|product|sealed/i, `${r.set}: no product-level field`);
  }
  assert.match(readFileSync(join(ROOT, "lib/pokemonSets.js"), "utf8"), /says\s+\/\/ nothing about individual sealed products/);
});

// ---------------------------------------------------------- modern deals

test("M-1. modern browsing covers Mega Evolution-era sets; energy groups and older sets stay out", () => {
  for (const s of [...ME_EXPANSIONS, "ME: Mega Evolution Promo", "ME: 30th Celebration"]) assert.equal(isModernSet(s), true, s);
  // unchanged SV / SWSH coverage
  for (const s of ["SV01: Scarlet & Violet Base Set", "SV: Black Bolt", "SV: Scarlet & Violet Promo Cards", "SWSH07: Evolving Skies", "SWSH: Crown Zenith", "SWSH: Sword & Shield Promo Cards"]) {
    assert.equal(isModernSet(s), true, s);
  }
  for (const s of ["MEE: Mega Evolution Energies", "SVE: Scarlet & Violet Energies", "McDonald's Promos 2024", "Base Set", "Hidden Fates", "Mewtwo", "", null]) {
    assert.equal(isModernSet(s), false, String(s));
  }
});

test("M-2. set-page era label names a series only when it is known", () => {
  const era = (s) => setEra(s, { vintageSets: VINTAGE_SETS, isModernSet });
  assert.equal(era("SV10: Destined Rivals"), "Scarlet & Violet / Sword & Shield era");
  assert.equal(era("SWSH07: Evolving Skies"), "Scarlet & Violet / Sword & Shield era");
  for (const s of ME_EXPANSIONS) assert.equal(era(s), "Mega Evolution era", s);
  assert.equal(era("ME: 30th Celebration"), null);
  assert.equal(era("ME: Mega Evolution Promo"), null);
  assert.equal(era("Base Set"), "Wizards of the Coast / e-Card era (1998–2003)");
  assert.equal(era("Hidden Fates"), null);
});

test("M-3. card pages in Mega Evolution-era sets now link to modern deals; the copy doesn't overclaim", () => {
  assert.deepEqual(eraCategoryFor("ME02: Phantasmal Flames"), { slug: "modern", label: "Modern card deals" });
  assert.deepEqual(eraCategoryFor("SV: White Flare"), { slug: "modern", label: "Modern card deals" });
  assert.equal(eraCategoryFor("MEE: Mega Evolution Energies"), null);
  const m = DEAL_CATEGORIES.modern;
  for (const k of ["title", "description", "intro"]) assert.match(m[k], /Mega Evolution/, k);
  assert.match(m.description, /newer releases/, "30th Celebration is covered without being called Mega Evolution");
  assert.equal(m.h1, "Modern Pokemon Card Deals");
});

test("R-7. search consumers: ranks follow release order, promos still rank last, the query era split is unchanged", () => {
  assert.ok(setReleaseRank("SV10: Destined Rivals") < setReleaseRank("SV: Black Bolt"));
  assert.ok(setReleaseRank("ME05: Pitch Black") < setReleaseRank("ME: 30th Celebration"));
  assert.equal(setReleaseRank("ME: Mega Evolution Promo"), Number.MAX_SAFE_INTEGER);
  assert.equal(setReleaseRank("ME: 30th Celebration Classic Collection"), Number.MAX_SAFE_INTEGER, "supplement: chronology only");
  for (const s of INSERTED) assert.equal(eraForSetName(s), "modern", s);
});
