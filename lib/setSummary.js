// Pure set-level aggregation helpers for /sets/[slug] (SEO Phase 4A) -
// the set twin of lib/speciesSummary.js. No React, no data access; fed
// the `cards` array fetchSetCatalog already returns (shape: { name,
// displayName, set, cardNumber, rarity, refPrice, hubSlug, catalogSlug,
// deal, ... }).
//
// Relative imports so `node --test` can load this directly.
import { slugifySet } from "./slugify.js";
import { isSpecialtyCard } from "./catalogueView.js";
import { extractSpecies, speciesLeadsCardName, speciesSlug } from "./pokemonSpecies.js";

const priceOk = (n) => Number.isFinite(Number(n)) && Number(n) > 0;

function median(sorted) {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Set-level card-price snapshot. Range + median are over STANDARD
// (non-specialty) priced cards only - a Jumbo / World Championship
// reprint sharing the set never inflates "up to $X". NEVER a
// complete-set valuation: this is explicitly a distribution of
// individual card references.
export function setPriceSnapshot(cards) {
  const list = cards ?? [];
  const allPriced = list.filter((c) => priceOk(c.refPrice));
  const standardPriced = allPriced.filter((c) => !isSpecialtyCard(c));
  const specialtyPricedCount = allPriced.length - standardPriced.length;

  // Range + median over standard cards, so one Jumbo / WCD reprint can't
  // inflate "up to $X". BUT a wholly-specialty set (Jumbo Cards, World
  // Championship Decks) has no standard population - fall back to all
  // priced cards there rather than report "no price data" for a set that
  // clearly has it. Same fallback CardPriceSummary uses for graded tiers.
  const wholySpecialty = standardPriced.length === 0 && allPriced.length > 0;
  const basis = (wholySpecialty ? allPriced : standardPriced)
    .map((c) => Number(c.refPrice))
    .sort((a, b) => a - b);

  return {
    cardCount: list.length,
    pricedCount: basis.length,
    specialtyPricedCount: wholySpecialty ? 0 : specialtyPricedCount,
    rarityCount: new Set(list.map((c) => c.rarity).filter(Boolean)).size,
    minPrice: basis.length ? basis[0] : null,
    maxPrice: basis.length ? basis[basis.length - 1] : null,
    medianPrice: median(basis),
    hasDeals: list.some((c) => c.deal),
  };
}

// The canonical Pokemon species that appear on real species-bearing
// cards in the set, for the "Pokemon in {set}" internal-link section.
// Trainer / Energy / Stadium / Spirit-Link cards contribute nothing
// (speciesLeadsCardName rejects them and mid-name mentions). Deduplicated,
// alphabetical. `validSpeciesSlugs` (optional) filters to species whose
// /pokemon page currently resolves; when omitted, every canonical
// species is kept (every dex species resolves to a page).
export function setSpeciesList(cards, validSpeciesSlugs = null) {
  const valid = validSpeciesSlugs ? new Set(validSpeciesSlugs) : null;
  const seen = new Map(); // slug -> name
  for (const c of cards ?? []) {
    const sp = extractSpecies(c.name);
    if (!sp || !speciesLeadsCardName(c.name, sp)) continue;
    const slug = speciesSlug(sp);
    if (!slug) continue;
    if (valid && !valid.has(slug)) continue;
    if (!seen.has(slug)) seen.set(slug, sp);
  }
  return [...seen.entries()]
    .map(([slug, name]) => ({ name, slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// A trustworthy, coarse era label from the existing curated set lists
// (lib/dealCategories). Only returns a value we actually know - no
// release dates are fabricated. `vintageSets` / `isModernSet` come from
// the caller (server module) to keep this file dependency-light.
export function setEra(setName, { vintageSets = [], isModernSet = () => false } = {}) {
  if (vintageSets.includes(setName)) return "Wizards of the Coast / e-Card era (1998–2003)";
  if (isModernSet(setName)) return "Scarlet & Violet / Sword & Shield era";
  return null;
}

export { slugifySet };
