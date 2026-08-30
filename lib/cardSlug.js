// /cards/[slug] URL <-> card identity. Dependency-free (only lib/slugify)
// so it's unit-testable with `node --test` and safe in client bundles -
// lib/deals.js pulls in next/cache and can't be either.

// Relative (not "@/lib/...") so `node --test` can import this directly;
// Next resolves it the same.
import { slugifySet } from "./slugify.js";

// The card-hub slug scheme (see lib/catalogAggregates.js computeAggregates):
// slugifySet(name) + "-" + slugifySet(set). Used identically for the
// card_catalog fallback so a card resolves to one URL whether or not it
// currently has a live deal.
export function catalogCardSlug(name, set) {
  return `${slugifySet(name)}-${slugifySet(set)}`;
}

// card_catalog carries PPT rows that aren't playable single cards - code
// cards, blisters, boxes, tins - which should never get a /cards/[slug]
// page (they're products, not cards, and their long names bust title
// limits). This is the quality bar the catalog page + sitemap both use,
// alongside "has a non-sentinel price and an image".
const NOT_A_CARD = /\b(code card|booster (pack|bundle|box)|elite trainer box|build & battle|collection box|premium collection|digital bundle|surprise box|mystery box|mini tin|poke ?ball|blister|tin|pack|box|case|gift set|collector chest)\b/i;

export function isRealCardName(name) {
  return typeof name === "string" && name.length > 0 && !NOT_A_CARD.test(name);
}

// Title for a catalog-backed card page, kept within the SEO title budget
// (the distinctive part before " | site" must stay <= 65 chars - see
// tests/seo/pages.test.mjs). Drops the " Price & Value" tail, then the
// set, before ever truncating the card name itself.
export function catalogCardTitle(name, set) {
  const withSet = `${name} (${set})`;
  if (`${withSet} Price & Value`.length <= 63) return `${withSet} Price & Value`;
  if (withSet.length <= 63) return withSet;
  if (`${name} Price & Value`.length <= 63) return `${name} Price & Value`;
  return name.length <= 63 ? name : name.slice(0, 62).trimEnd();
}

// Split a card slug back into its name and set parts using a set index
// (`[{ name, slug }]`, MUST be sorted longest-slug-first by the caller so
// "xy-breakthrough" wins over "xy"). slugify is not reversible, so this
// tests each known set slug as a suffix. Returns { nameSlug, setSlug,
// setName } or null when no known set slug is a suffix.
export function splitCardSlug(slug, setIndex) {
  for (const { name, slug: setSlug } of setIndex) {
    if (!setSlug) continue;
    if (slug === setSlug) continue; // no name part -> not a card slug
    if (slug.endsWith(`-${setSlug}`)) {
      const nameSlug = slug.slice(0, slug.length - setSlug.length - 1);
      if (nameSlug) return { nameSlug, setSlug, setName: name };
    }
  }
  return null;
}
