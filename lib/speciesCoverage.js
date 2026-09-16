// Phase 17C.4 - Pokemon-page usefulness PILOT.
//
// Verified-data helpers for one species page: what the catalogue actually
// covers, and a chronological grouping of its sets. Nothing inferred:
//   * counts come from the species' catalogue cards the page already has;
//   * eras come ONLY from lib/pokemonSets SET_RELEASE_ORDER (the curated,
//     chronological list the search resolver already relies on) plus its
//     evidence-backed SET_RELEASE_SUPPLEMENTS (17C.6) - a set neither
//     contains is reported as undated, never guessed;
//   * no value ranking, no mixed-condition comparison, no biography.
// Pure, relative imports only, so node:test runs it directly.

import { setChronologyRank } from "./pokemonSets.js";
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
//   17C.5 (selected 2026-09-12, 19-58 cards each). Two kinds of Search
//   Console evidence, kept separate:
//     PAGE  = impressions on the /pokemon/<slug> hub itself (demand shown
//             for the hub);
//     QUERY = impressions for site queries that name the Pokemon, on any
//             landing page - interest in the Pokemon, NOT proven demand for
//             its hub.
//     Cleffa     PAGE 6   QUERY 5    19 cards
//     Electrode  PAGE 2   QUERY 2    58 cards
//     Growlithe  PAGE 1   QUERY 1    42 cards
//     Arcanine   PAGE 0   QUERY 21   56 cards  (query evidence only)
//     Houndoom   PAGE 0   QUERY 19   55 cards  (query evidence only)
//   Excluded: Charizard (153 cards, 25 undated sets - not manageable yet),
//   Shieldon (9 cards - too thin to benefit).
//   SEO-2.3 (selected 2026-09-16) adds 20 more as a CONTROLLED EXPERIMENT
//   with a pre-registered, matched, untreated control cohort of 20 - see
//   docs/seo-species-threshold-experiment.md, Experiment 2. The remaining
//   ~948 indexable species stay untreated so the comparison means something.
//
//   Selection evidence, all from production: every member is indexable,
//   carries >=13 eligible cards, spans >=5 dated eras, and has card pages
//   that already earned Search Console impressions in the 28 days to
//   2026-09-16. Deliberately not only head terms - the cohort runs from
//   Pikachu (359 cards) down to Registeel (18) so we learn whether the
//   treatment helps outside obvious names.
//
//   CHARIZARD IS NOW INCLUDED. The 17C.5 note excluded it for "25 undated
//   sets - not manageable yet". Re-measured 2026-09-16: 62 sets, 18
//   undated, 71% dated - level with Arcanine (72%) and Cleffa (71%) and
//   better than Dragonite (69%), all already treated. The objection no
//   longer holds.
//
//   POPPLIO WAS CONSIDERED AND REJECTED despite the third-highest card-page
//   demand in the catalogue (13 impressions): 9 sets, only 3 dated (33%),
//   spanning 2 eras. The era checklist would be mostly "undated", which is
//   the treatment failing rather than being tested. Feraligatr replaced it
//   (33 cards, 8 eras, 67% dated, 7 card impressions).
//
//   Pikachu carries the cohort's weakest dating at 58%. It is included
//   because the brief asks for it and because speciesEraGroups reports
//   undated sets as undated rather than guessing, so the page stays honest.
const SPECIES_PILOT_17C = ["Dragonite", "Cleffa", "Arcanine", "Houndoom", "Electrode", "Growlithe"];
export const SPECIES_PILOT_SEO23 = Object.freeze([
  "Pikachu", "Charizard", "Mewtwo", "Lucario", "Rayquaza", "Snorlax", "Umbreon", "Espeon",
  "Moltres", "Lugia", "Vaporeon", "Voltorb", "Glaceon", "Palkia", "Kangaskhan", "Blaziken",
  "Absol", "Aegislash", "Registeel", "Feraligatr",
]);
// The matched, pre-registered control. Recorded HERE so the cohort cannot
// drift mid-experiment, and asserted by tests to be disjoint from the
// treated list. These species are deliberately NOT treated.
export const SPECIES_CONTROL_SEO23 = Object.freeze([
  "Eevee", "Raichu", "Meowth", "Gyarados", "Gardevoir", "Vulpix", "Venusaur", "Articuno",
  "Crobat", "Darkrai", "Latias", "Clefairy", "Sylveon", "Luxray", "Ho-Oh", "Altaria",
  "Mawile", "Malamar", "Ludicolo", "Pidgeot",
]);
export const SPECIES_PILOT = Object.freeze([...SPECIES_PILOT_17C, ...SPECIES_PILOT_SEO23]);
export function isSpeciesPilot(speciesName) {
  return SPECIES_PILOT.includes(speciesName);
}

// SEO-2.3 PILOT META DESCRIPTION. Stable deterministic facts only.
//
// NO PRICES. Minimum, maximum, median, largest discount and live-deal count
// are all real, but they move with every catalogue sync and every scan, and
// the metadata architecture here deliberately avoids churn (see the note on
// generateMetadata: "a flipping title churns the index"). Counts of cards,
// sets and eras change only when the catalogue itself changes. Current
// reference prices stay where they already are - visible in the page body.
//
// `facts` is speciesCoverageFacts(cards) output, so total/setCount/eraCount
// come from the SAME isEligibleSpeciesCard-filtered card list the visible
// page renders. Metadata and body can therefore never disagree.
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function speciesPilotDescription(speciesName, facts) {
  const n = String(speciesName ?? "").trim();
  if (!n || !facts || !(facts.total > 0)) return null;
  const cards = plural(facts.total, "card", "cards");
  const sets = plural(facts.setCount, "set", "sets");
  const tail = "Compare card prices, values and current marketplace deals where available.";
  // Eras are only stated when at least two are dated: "spanning 1 era" says
  // nothing, and 0 means nothing in this species' sets is dated at all.
  if (facts.eraCount >= 2) {
    return `Browse ${cards} we track for ${n} across ${sets}, spanning ${plural(facts.eraCount, "era", "eras")}. ${tail}`;
  }
  return `Browse ${cards} we track for ${n} across ${sets}. ${tail}`;
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
  // 17C.7: Scarlet & Violet runs from its first expansion (2023-03-31) to
  // Black Bolt / White Flare (2025-07-18). Mega Evolution starts 2025-09-26.
  // Dates come from lib/pokemonSets OFFICIAL_RELEASES.
  { key: "sv", label: "Scarlet & Violet", years: "2023–2025", startSet: "SV01: Scarlet & Violet Base Set" },
  { key: "me", label: "Mega Evolution", years: "2025 onwards", startSet: "ME01: Mega Evolution" },
  // Chronology is not series identity. An era heading names a series, so a
  // set whose series no official page confirms is never placed under one
  // on date alone. 30th Celebration is officially dated (2026-09-16), but
  // its series is not stated, so it gets this neutral grouping. Membership
  // is an explicit list, not a rank range, so a later Mega Evolution
  // expansion can never fall into it.
  { key: "anniversary", label: "Anniversary releases", years: "2026", startSet: null, sets: ["ME: 30th Celebration", "ME: 30th Celebration Classic Collection"] },
]);
export const UNDATED_ERA = Object.freeze({
  key: "undated",
  label: "Other sets",
  years: null,
  note: "Promos, exclusives and special releases, plus any set our release list doesn't date yet.",
});

const UNRANKED = Number.MAX_SAFE_INTEGER;
const ERA_STARTS = SET_ERAS.filter((e) => e.startSet).map((e) => ({ ...e, rank: setChronologyRank(e.startSet) }));
const ERA_BY_MEMBER = new Map(SET_ERAS.flatMap((e) => (e.sets ?? []).map((s) => [s.toLowerCase(), e])));

// The era a set belongs to, or UNDATED_ERA when neither SET_RELEASE_ORDER
// nor SET_RELEASE_SUPPLEMENTS dates it. Explicit-membership groupings win
// over the date range.
export function eraForSet(setName) {
  const member = ERA_BY_MEMBER.get(String(setName ?? "").toLowerCase());
  if (member) return member;
  const rank = setChronologyRank(setName);
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
      rank: setChronologyRank(set),
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
  const dated = sets.filter((s) => setChronologyRank(s) !== UNRANKED);
  const eraIndex = (key) => SET_ERAS.findIndex((x) => x.key === key);
  const eras = [...new Set(dated.map((s) => eraForSet(s).key))].sort((a, b) => eraIndex(a) - eraIndex(b));
  const earliest = [...dated].sort((a, b) => setChronologyRank(a) - setChronologyRank(b))[0] ?? null;
  // Jumbo / World Championship COUNT from the stored set classification
  // only (lib/catalogueView.isStoredSpecialtyCard) - never a name guess.
  const specialty = list.filter((c) => isStoredSpecialtyCard(c)).length;
  const priced = list.filter((c) => catalogPriceOk(c.refPrice)).length;
  return {
    total: list.length,
    // Cards outside the two stored specialty sets. Only that membership is
    // known, so they are "other tracked cards" - never asserted "standard".
    otherTracked: list.length - specialty,
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
