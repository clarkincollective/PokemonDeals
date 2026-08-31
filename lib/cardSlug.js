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

// Repdigit sentinel prices PPT returns to mean "no real data". Keep in
// sync with SENTINEL_PRICES in lib/pokemonPriceTracker.js.
const CATALOG_SENTINEL_PRICES = new Set([999, 999.99, 9999, 9999.99, 99999, 99999.99]);
export function catalogPriceOk(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && !CATALOG_SENTINEL_PRICES.has(n);
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

// From the card_catalog rows of ONE set (already fully paginated by the
// caller - PostgREST caps a request at 1,000 rows and one set can exceed
// that), pick the row a card slug resolves to: the row whose name
// slugifies to `nameSlug`, is a real card, is priced (non-sentinel) and
// imaged; ties broken by highest price for determinism. Returns null when
// nothing in the set matches or nothing that matches passes the
// data-quality bar (-> the page 404s instead of a thin render). Pure, so
// the >1,000-row set case is unit-testable without a DB.
export function pickCatalogMatch(rows, nameSlug) {
  const matches = (rows ?? []).filter((r) => slugifySet(r.name) === nameSlug);
  if (matches.length === 0) return null;
  const usable = matches
    .filter((r) => isRealCardName(r.name) && r.image_url && catalogPriceOk(r.market_price))
    .sort((a, b) => Number(b.market_price) - Number(a.market_price));
  return usable[0] ?? null;
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
