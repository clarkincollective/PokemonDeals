// Phase 13D.4 - deterministic local candidate selectors for the four MVP
// families (+ Set Spotlight stretch). Every selector:
//   1. reads the already-verified production deal pool (lib/social/db.mjs)
//   2. filters through the UNCHANGED existing truth contracts
//      (lib/dealQuality.js) plus the social freshness ceiling
//      (lib/social/eligibility.mjs) - never a parallel quality model
//   3. ranks with the EXISTING flagship ranking (lib/flagshipRanking.js)
//      wherever the content is a "best BIN deal(s)" question - never a
//      new opaque score
//   4. returns plain data - no template/caption/rendering happens here
//
// No eBay call is made anywhere in this file - fetchActiveDealPool reads
// the database only.
//
// Each family is split into a PURE function (operates on an already-
// fetched `rows` array - no I/O, fully unit-testable with fixtures) and a
// thin async wrapper that fetches the pool and calls it. This mirrors the
// same separation lib/deals.js itself uses (e.g. XUncached vs the pure
// gates in lib/dealQuality.js).

import { dealFreshness } from "../dealQuality.js";
import { rankFlagshipDeals } from "../flagshipRanking.js";
import { extractSpecies, speciesSlug } from "../pokemonSpecies.js";
import { slugifySet } from "../slugify.js";
import { fetchActiveDealPool } from "./db.mjs";
import { isSociallyEligiblePremium, isBuyItNowOnly, isJustFoundEligible } from "./eligibility.mjs";

// "Enough live inventory to justify a Spotlight post" - a content-
// worthiness threshold, deliberately a SEPARATE concept from
// lib/indexability.js's SPECIES_MIN_LISTINGS/CARD_HUB_MIN_LISTINGS (which
// govern whether a catalogue PAGE should exist/be indexed, including from
// catalogue data alone with zero live deals). This constant asks a
// different question - "is there enough CURRENT LIVE inventory for a
// social post right now" - so reusing the indexability constant would
// conflate two unrelated gates.
export const SOCIAL_SPOTLIGHT_MIN_DEALS = 3;

function byFlagship(rows, limit) {
  return rankFlagshipDeals(rows, { freshnessOf: (row) => dealFreshness(row), limit });
}

// --- pure filters (unit-testable with fixtures, no I/O) -------------------

export function socialBinPool(rows, now = Date.now()) {
  return rows.filter((r) => isBuyItNowOnly(r) && isSociallyEligiblePremium(r, now));
}

export function pickDealOfTheDay(rows, now = Date.now()) {
  const pool = socialBinPool(rows, now);
  const [candidate] = byFlagship(pool, 1);
  return { candidate: candidate ?? null, poolSize: pool.length };
}

export function pickBestDealsFoundToday(rows, { now = Date.now(), max = 5 } = {}) {
  const pool = socialBinPool(rows, now);
  return { candidates: byFlagship(pool, max), poolSize: pool.length };
}

export function pickJustFound(rows, now = Date.now()) {
  const pool = rows.filter((r) => isBuyItNowOnly(r) && isJustFoundEligible(r, now));
  pool.sort((a, b) => Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at) || String(a.id).localeCompare(String(b.id)));
  return { candidate: pool[0] ?? null, poolSize: pool.length };
}

// Deterministic tie-break: most qualifying deals wins; ties broken
// alphabetically by display name, never by popularity/recency, so the
// same inputs always produce the same selection.
function pickSpotlightGroup(groups) {
  const entries = Object.entries(groups).filter(([, rows]) => rows.length >= SOCIAL_SPOTLIGHT_MIN_DEALS);
  entries.sort(([nameA, rowsA], [nameB, rowsB]) => rowsB.length - rowsA.length || nameA.localeCompare(nameB));
  return entries[0] ?? null;
}

export function pickPokemonSpotlight(rows, { now = Date.now(), topDealsLimit = 5 } = {}) {
  const eligible = socialBinPool(rows, now);
  const groups = {};
  for (const row of eligible) {
    const species = extractSpecies(row.card_name ?? "");
    if (!species) continue;
    (groups[species] ??= []).push(row);
  }
  const picked = pickSpotlightGroup(groups);
  if (!picked) return { candidate: null, poolSize: eligible.length };
  const [pokemonDisplayName, speciesRows] = picked;
  return {
    candidate: {
      pokemon_slug: speciesSlug(pokemonDisplayName),
      pokemon_display_name: pokemonDisplayName,
      deal_count: speciesRows.length,
      top_deals: byFlagship(speciesRows, topDealsLimit),
      destination_url: `/pokemon/${speciesSlug(pokemonDisplayName)}`,
    },
    poolSize: eligible.length,
  };
}

export function pickSetSpotlight(rows, { now = Date.now(), topDealsLimit = 5 } = {}) {
  const eligible = socialBinPool(rows, now);
  const groups = {};
  for (const row of eligible) {
    if (!row.card_set) continue;
    (groups[row.card_set] ??= []).push(row);
  }
  const picked = pickSpotlightGroup(groups);
  if (!picked) return { candidate: null, poolSize: eligible.length };
  const [setDisplayName, setRows] = picked;
  const slug = slugifySet(setDisplayName);
  return {
    candidate: {
      set_slug: slug,
      set_display_name: setDisplayName,
      deal_count: setRows.length,
      top_deals: byFlagship(setRows, topDealsLimit),
      destination_url: `/sets/${slug}`,
    },
    poolSize: eligible.length,
  };
}

// --- thin async wrappers (I/O: fetch the pool, then delegate to the pure fn above) --

export async function selectDealOfTheDay({ now = Date.now() } = {}) {
  const { rows, error } = await fetchActiveDealPool();
  if (error) return { candidate: null, error };
  return { ...pickDealOfTheDay(rows, now), error: null };
}

export async function selectBestDealsFoundToday({ now = Date.now(), max = 5 } = {}) {
  const { rows, error } = await fetchActiveDealPool();
  if (error) return { candidates: [], error };
  return { ...pickBestDealsFoundToday(rows, { now, max }), error: null };
}

export async function selectJustFound({ now = Date.now() } = {}) {
  const { rows, error } = await fetchActiveDealPool();
  if (error) return { candidate: null, error };
  return { ...pickJustFound(rows, now), error: null };
}

export async function selectPokemonSpotlight({ now = Date.now(), topDealsLimit = 5 } = {}) {
  const { rows, error } = await fetchActiveDealPool();
  if (error) return { candidate: null, error };
  return { ...pickPokemonSpotlight(rows, { now, topDealsLimit }), error: null };
}

export async function selectSetSpotlight({ now = Date.now(), topDealsLimit = 5 } = {}) {
  const { rows, error } = await fetchActiveDealPool();
  if (error) return { candidate: null, error };
  return { ...pickSetSpotlight(rows, { now, topDealsLimit }), error: null };
}
