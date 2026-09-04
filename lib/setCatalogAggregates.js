// Phase 13B.6.3 - the card_catalog-derived set structures, extracted so
// the daily-ish /api/refresh-catalog cron can precompute them into
// catalog_snapshot and the read path (lib/deals.js) reads one JSON row
// instead of a ~24-request full card_catalog scan on every cold cache /
// cold serverless start.
//
// Both are DETERMINISTIC catalogue identity data (they change only when a
// new set is released / more cards get priced+imaged) - never live deal
// state - so caching them aggressively is safe (13B.6.3 §6/§7).
//
// Pure - no I/O, safe in `node --test`.

import { slugifySet } from "./slugify.js";
import { buildSetAliases } from "./pokemonSets.js";
import { setEligibleCard, SET_CATALOG_MIN_CARDS } from "./setHub.js";

// rows: [{ set, set_id }] (English card_catalog, set not null).
// -> [{ name, set_id, slug, phrases }] - the parser's knownSets +
//    pure-set / species×set resolution vocabulary. Identical output to
//    the previous inline fetchSetSearchVocabularyUncached.
export function buildSetVocabularyFromRows(rows) {
  const bySet = new Map(); // set name -> set_id (first seen)
  for (const r of rows ?? []) {
    if (r?.set && !bySet.has(r.set)) bySet.set(r.set, r.set_id ?? null);
  }

  // alias -> the set names that generate it; an alias owned by >1 set is
  // genuinely ambiguous and dropped from BOTH (no guessing).
  const aliasOwners = new Map();
  const perSet = new Map();
  for (const name of bySet.keys()) {
    const aliases = buildSetAliases(name);
    perSet.set(name, aliases);
    for (const a of aliases) {
      if (!aliasOwners.has(a)) aliasOwners.set(a, new Set());
      aliasOwners.get(a).add(name);
    }
  }

  const sets = [];
  for (const [name, setId] of bySet) {
    const phrases = (perSet.get(name) ?? []).filter((a) => (aliasOwners.get(a)?.size ?? 0) === 1);
    const full = name.toLowerCase().replace(/\s+/g, " ").trim();
    if (full.length >= 4 && !phrases.includes(full)) phrases.unshift(full);
    sets.push({ name, set_id: setId != null ? String(setId) : null, slug: slugifySet(name), phrases });
  }
  return sets;
}

// rows: [{ set, name, tcgplayer_id, market_price, image_url }] (English,
// set/image/price not null, market_price > 0).
// -> [{ set, slug, count }] for sets with >= SET_CATALOG_MIN_CARDS
//    eligible catalogue cards. Identical output to the previous inline
//    fetchCatalogSetsUncached.
export function buildCatalogSetsFromRows(rows) {
  const bySet = new Map(); // set -> eligible card count
  for (const r of rows ?? []) {
    if (!r?.set || !setEligibleCard(r)) continue;
    bySet.set(r.set, (bySet.get(r.set) ?? 0) + 1);
  }
  const sets = [];
  for (const [name, count] of bySet) {
    if (count < SET_CATALOG_MIN_CARDS) continue;
    const slug = slugifySet(name);
    if (slug) sets.push({ set: name, slug, count });
  }
  sets.sort((a, b) => b.count - a.count);
  return sets;
}
