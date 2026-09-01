// Pure aggregation helpers for the /pokemon/[slug] species-level price
// summary and by-set coverage table (SEO Phase 2A). No React, no data
// access - unit-testable, and fed the exact `cards` array both the
// deal-backed page and the catalogue-backed SpeciesCatalog already hold
// (shape: { name, set, cardNumber, rarity, refPrice, hubSlug, catalogSlug,
// deal, ... } from fetchSpeciesCatalog).

// Relative (not "@/lib/...") so `node --test` can import this directly;
// Next resolves it the same. Same arrangement as lib/cardSlug.js.
import { slugifySet } from "./slugify.js";
import { groupBySet, isSpecialtyCard } from "./catalogueView.js";

const priceOk = (n) => Number.isFinite(Number(n)) && Number(n) > 0;

function median(sortedNums) {
  const n = sortedNums.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

// Species-level price snapshot. The headline range + median are computed
// over STANDARD (non-specialty) priced cards only, so one Jumbo / World
// Championship reprint can't make "prices range up to $2,000" - specialty
// priced cards are counted separately (`specialtyPricedCount`) for an
// optional footnote. Never returns a single "the species is worth $X".
export function speciesPriceSnapshot(cards) {
  const list = cards ?? [];
  const standardPriced = list
    .filter((c) => !isSpecialtyCard(c) && priceOk(c.refPrice))
    .map((c) => Number(c.refPrice))
    .sort((a, b) => a - b);
  const specialtyPricedCount = list.filter((c) => isSpecialtyCard(c) && priceOk(c.refPrice)).length;

  return {
    cardCount: list.length,
    pricedCount: standardPriced.length,
    specialtyPricedCount,
    setCount: new Set(list.map((c) => c.set).filter(Boolean)).size,
    minPrice: standardPriced.length ? standardPriced[0] : null,
    maxPrice: standardPriced.length ? standardPriced[standardPriced.length - 1] : null,
    medianPrice: median(standardPriced),
    hasDeals: list.some((c) => c.deal),
  };
}

// Per-set coverage rows in the same order groupBySet uses (standard-card
// groups first by print count, specialty-only groups last). Each row's
// range is over that set's standard priced cards, falling back to the
// group's own prices for a specialty-only group. `slug` is set ONLY when
// a real /sets/[slug] page exists (validSetSlugs membership) - otherwise
// null and the caller renders the set name as plain text.
export function speciesBySet(cards, validSetSlugs = []) {
  const valid = new Set(validSetSlugs);
  return groupBySet(cards ?? []).map(({ set, list, specialtyOnly }) => {
    const pricedPool = (specialtyOnly ? list : list.filter((c) => !isSpecialtyCard(c)))
      .filter((c) => priceOk(c.refPrice))
      .map((c) => Number(c.refPrice))
      .sort((a, b) => a - b);
    const slug = slugifySet(set);
    return {
      set,
      slug: valid.has(slug) ? slug : null,
      cardCount: list.length,
      pricedCount: pricedPool.length,
      minPrice: pricedPool.length ? pricedPool[0] : null,
      maxPrice: pricedPool.length ? pricedPool[pricedPool.length - 1] : null,
      specialtyOnly,
    };
  });
}
