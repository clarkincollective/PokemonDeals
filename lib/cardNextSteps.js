// Phase 17B - where a /cards/[slug] visitor can go next, from REAL
// relationships only. Pure (relative imports) so `node --test` can pin it.
//
// Every destination is an existing indexable page, and every "live deals"
// claim carries a real active-listing count from the catalogue aggregates
// (lib/catalogAggregates computeAggregates). A count of zero or an unknown
// count never produces a "live deals" label - the link falls back to the
// plain browse wording, so no availability is ever implied.

import dealCategories from "./dealCategories.js";

const { VINTAGE_SETS, isModernSet, DEAL_CATEGORY_SLUGS } = dealCategories;

// Price-band categories that exist as real pages. There is deliberately no
// "$100+" category page yet (Phase 17A/17B: out of scope).
const PRICE_BANDS = [
  { max: 25, slug: "under-25", label: "Deals under $25" },
  { max: 50, slug: "under-50", label: "Deals under $50" },
  { max: 100, slug: "under-100", label: "Deals under $100" },
];

// The single most specific price-band category for a card whose raw
// market reference is `usd` (the band the card itself falls in), or null.
export function priceCategoryFor(usd) {
  const v = Number(usd);
  if (usd == null || !Number.isFinite(v) || v <= 0) return null;
  const band = PRICE_BANDS.find((b) => v < b.max);
  return band && DEAL_CATEGORY_SLUGS.includes(band.slug) ? { slug: band.slug, label: band.label } : null;
}

// The era category, decided by the SAME set rules the category pages use
// to select their listings (lib/dealCategories) - never guessed from the
// card name or artwork.
export function eraCategoryFor(setName) {
  const s = String(setName ?? "");
  if (!s) return null;
  if (VINTAGE_SETS.includes(s) && DEAL_CATEGORY_SLUGS.includes("vintage")) return { slug: "vintage", label: "Vintage card deals" };
  if (isModernSet(s) && DEAL_CATEGORY_SLUGS.includes("modern")) return { slug: "modern", label: "Modern card deals" };
  return null;
}

const liveLabel = (count, what) => `${count} live ${count === 1 ? "deal" : "deals"} ${what}`;

// The bounded list of next-step links for a card page (max 4 links).
//   species       - { name, slug } | null   (cardSpeciesLink)
//   speciesLive   - active listings across that species, or null/0
//   set           - { name, slug } | null   (only when /sets/[slug] exists)
//   setLive       - active listings in that set, or null/0
//   marketUsd     - the card's raw market reference (for the price band)
export function cardNextSteps({ species = null, speciesLive = null, set = null, setLive = null, marketUsd = null, setName = null } = {}) {
  const links = [];
  if (species?.slug) {
    const n = Number(speciesLive);
    links.push({
      key: "species",
      href: `/pokemon/${species.slug}`,
      label: n > 0 ? liveLabel(n, `on ${species.name} cards`) : `All ${species.name} cards & prices`,
      live: n > 0 ? n : 0,
    });
  }
  if (set?.slug) {
    const n = Number(setLive);
    links.push({
      key: "set",
      href: `/sets/${set.slug}`,
      label: n > 0 ? liveLabel(n, `in ${set.name}`) : `Browse ${set.name} cards & prices`,
      live: n > 0 ? n : 0,
    });
  }
  const band = priceCategoryFor(marketUsd);
  if (band) links.push({ key: "price", href: `/deals/${band.slug}`, label: band.label, live: null });
  const era = eraCategoryFor(setName ?? set?.name);
  if (era) links.push({ key: "era", href: `/deals/${era.slug}`, label: era.label, live: null });
  return links.slice(0, 4);
}
