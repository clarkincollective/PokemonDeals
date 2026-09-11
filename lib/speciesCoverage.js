// Phase 17C.4 - Pokemon-page usefulness PILOT.
//
// Verified-data helpers for one species page: what the catalogue actually
// covers, and a chronological grouping of its sets. Nothing inferred:
//   * counts come from the species' catalogue cards the page already has;
//   * eras come ONLY from lib/pokemonSets SET_RELEASE_ORDER (the curated,
//     chronological list the search resolver already relies on) - a set
//     that list doesn't contain is reported as undated, never guessed;
//   * no value ranking, no mixed-condition comparison, no biography.
// Pure, relative imports only, so node:test runs it directly.

import { setReleaseRank } from "./pokemonSets.js";
import { slugifySet } from "./slugify.js";
import { isStoredSpecialtyCard } from "./catalogueView.js";
import { catalogPriceOk } from "./cardSlug.js";
import { compareCollectorNumber, buildChecklistRows, checklistSummary, checklistLegend } from "./setChecklist.js";

// The price-condition sentence for this species' references - the SAME
// wording the set checklists use (lib/setChecklist.checklistLegend), from
// the same recorded provenance. "" when nothing is priced.
export function speciesConditionNote(cards) {
  const rows = buildChecklistRows(cards ?? []);
  return checklistLegend(checklistSummary(rows), rows).condition;
}

// True only when every priced reference is for ONE recorded condition -
// the only case where ordering cards by reference reads as a like-for-like
// "most valuable" ranking. Otherwise the page calls it what it is: the
// highest stored market references.
export function speciesReferencesLikeForLike(cards) {
  const s = checklistSummary(buildChecklistRows(cards ?? []));
  return s.priced > 0 && !s.mixedOrUnstatedConditions;
}

// The species that get the usefulness treatment - an explicit, reviewed
// allowlist, never "every species".
//   17C.4 pilot: Dragonite (22 of 32 Pokemon-page GSC impressions, 75 cards).
//   17C.5 (selected 2026-09-12 from GSC + card_catalog, 19-58 cards each):
//     Cleffa     - 6 page + 5 query impressions, 19 cards
//     Arcanine   - 21 query impressions, 56 cards
//     Houndoom   - 19 query impressions, 55 cards
//     Electrode  - 2 page + 2 query impressions, 58 cards
//     Growlithe  - 1 page + 1 query impression, 42 cards
//   Excluded: Charizard (153 cards, 25 undated sets - not manageable yet),
//   Shieldon (9 cards - too thin to benefit).
export const SPECIES_PILOT = Object.freeze(["Dragonite", "Cleffa", "Arcanine", "Houndoom", "Electrode", "Growlithe"]);
export function isSpeciesPilot(speciesName) {
  return SPECIES_PILOT.includes(speciesName);
}

// Era blocks of SET_RELEASE_ORDER, by their first set (the list is
// chronological and the file marks these same boundaries). Years are the
// ranges those markers state.
export const SET_ERAS = Object.freeze([
  { key: "wotc", label: "Wizards of the Coast era", years: "1999–2003", startSet: "Base Set (Shadowless)" },
  { key: "ex", label: "EX era", years: "2003–2007", startSet: "EX Ruby and Sapphire" },
  { key: "dp", label: "Diamond & Pearl, Platinum and HeartGold SoulSilver", years: "2007–2011", startSet: "Diamond and Pearl" },
  { key: "bwxy", label: "Black & White and XY", years: "2011–2016", startSet: "Black and White" },
  { key: "sm", label: "Sun & Moon", years: "2017–2019", startSet: "SM Base Set" },
  { key: "swsh", label: "Sword & Shield", years: "2020–2022", startSet: "SWSH01: Sword & Shield Base Set" },
  { key: "sv", label: "Scarlet & Violet", years: "2023 onwards", startSet: "SV01: Scarlet & Violet Base Set" },
]);
export const UNDATED_ERA = Object.freeze({
  key: "undated",
  label: "Other sets",
  years: null,
  note: "Promos, exclusives and special releases, plus any set our release list doesn't date yet.",
});

const UNRANKED = Number.MAX_SAFE_INTEGER;
const ERA_STARTS = SET_ERAS.map((e) => ({ ...e, rank: setReleaseRank(e.startSet) }));

// The era a set belongs to, or UNDATED_ERA when SET_RELEASE_ORDER does not
// list it.
export function eraForSet(setName) {
  const rank = setReleaseRank(setName);
  if (rank === UNRANKED) return UNDATED_ERA;
  let era = ERA_STARTS[0];
  for (const e of ERA_STARTS) if (rank >= e.rank) era = e;
  return SET_ERAS.find((x) => x.key === era.key);
}

// cards -> [{ era, sets: [{ set, slug, rank, cards }] }], eras oldest first
// (undated last), sets by release rank (undated: by name), cards by
// collector number. Only eras that have cards.
export function speciesEraGroups(cards, validSetSlugs = []) {
  const valid = new Set(validSetSlugs);
  const bySet = new Map();
  for (const c of cards ?? []) {
    if (!c?.set) continue;
    if (!bySet.has(c.set)) bySet.set(c.set, []);
    bySet.get(c.set).push(c);
  }
  const eraOrder = [...SET_ERAS.map((e) => e.key), UNDATED_ERA.key];
  const groups = new Map();
  for (const [set, list] of bySet) {
    const era = eraForSet(set);
    if (!groups.has(era.key)) groups.set(era.key, { era, sets: [] });
    const slug = slugifySet(set);
    groups.get(era.key).sets.push({
      set,
      slug: valid.has(slug) ? slug : null,
      rank: setReleaseRank(set),
      cards: [...list].sort(compareCollectorNumber),
    });
  }
  for (const g of groups.values()) {
    g.sets.sort((a, b) => a.rank - b.rank || a.set.localeCompare(b.set, "en"));
  }
  return eraOrder.filter((k) => groups.has(k)).map((k) => groups.get(k));
}

// What the catalogue covers for this species - counts only, never a value.
export function speciesCoverageFacts(cards) {
  const list = (cards ?? []).filter(Boolean);
  const sets = [...new Set(list.map((c) => c.set).filter(Boolean))];
  const dated = sets.filter((s) => setReleaseRank(s) !== UNRANKED);
  const eraIndex = (key) => SET_ERAS.findIndex((x) => x.key === key);
  const eras = [...new Set(dated.map((s) => eraForSet(s).key))].sort((a, b) => eraIndex(a) - eraIndex(b));
  const earliest = [...dated].sort((a, b) => setReleaseRank(a) - setReleaseRank(b))[0] ?? null;
  // Jumbo / World Championship COUNT from the stored set classification
  // only (lib/catalogueView.isStoredSpecialtyCard) - never a name guess.
  const specialty = list.filter((c) => isStoredSpecialtyCard(c)).length;
  const priced = list.filter((c) => catalogPriceOk(c.refPrice)).length;
  return {
    total: list.length,
    standard: list.length - specialty,
    specialty,
    setCount: sets.length,
    datedSetCount: dated.length,
    undatedSetCount: sets.length - dated.length,
    eraCount: eras.length,
    firstEra: eras.length ? SET_ERAS[eraIndex(eras[0])] : null,
    lastEra: eras.length ? SET_ERAS[eraIndex(eras[eras.length - 1])] : null,
    earliestSet: earliest,
    priced,
    unpriced: list.length - priced,
  };
}
