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
// "poke ?ball tin" is a product; "(Poke Ball Pattern)" / "(Master Ball
// Pattern)" are real card variants - so match the tin, not the bare word.
const NOT_A_CARD = /\b(code card|booster (pack|bundle|box)|elite trainer box|build & battle|collection box|premium collection|digital bundle|surprise box|mystery box|mini tin|poke ?ball tin|master ?ball tin|blister|tin|pack|box|case|gift set|collector chest|decks?|sleeves?|playmat|deck box)\b/i;

export function isRealCardName(name) {
  return typeof name === "string" && name.length > 0 && !NOT_A_CARD.test(name);
}

// CARD RESOLVABILITY and PRICE AVAILABILITY are separate concerns.
//
// A genuine, identifiable card keeps its permanent /cards/[slug] URL (200)
// even when its pricing provider temporarily has no trustworthy market
// value - the page just shows "Market price unavailable". A market-price
// API failing, withdrawing a value, or emitting a record we reject must
// never flip a permanent URL 200 -> 404 -> 200.
//
//   catalogCardResolvable - can this row own a permanent URL? real card +
//     image + a stable catalogue/product id. NO price requirement.
//   catalogCardIndexable  - additionally trustworthy enough to index /
//     put in the cards sitemap: a non-sentinel market price. Below this
//     the page still 200s, just as noindex,follow and absent from the
//     sitemap until a real price returns.
export function catalogCardResolvable(row) {
  return Boolean(
    row && isRealCardName(row.name) && row.image_url && row.tcgplayer_id != null
  );
}
export function catalogCardIndexable(row) {
  return Boolean(catalogCardResolvable(row) && catalogPriceOk(row.market_price));
}

// Title for a card page (catalog-backed OR live-deal hub - Phase 8A made
// it one stable template regardless of current deal state, since the
// "<card> #<number> price / value" search intent is the same either way).
// Kept within the SEO title budget (the distinctive part before " | site"
// must stay <= 63 chars - see tests/seo/pages.test.mjs). The collector
// number is a high-value long-tail identifier (users literally search
// "4/102"), rendered as "#<number>" ahead of the set and the
// " Price & Value" tail; those are dropped in that order before the card
// name is ever truncated. Leading zeroes in the number are preserved
// (the structured card_catalog / provider value is authoritative).
export function catalogCardTitle(name, set, cardNumber = null) {
  const cleanName = String(name ?? "").trim();
  const num = cardNumber != null ? String(cardNumber).trim() : "";
  // De-dup: a catalogue/watchlist name occasionally already ends with the
  // same number ("Charizard 4/102", "... - 4/102", "... (4/102)"). Strip
  // that trailing fragment for the TITLE only (slug / DB name / H1 are
  // untouched) so we never render "Charizard 4/102 #4/102".
  const baseName =
    num
      ? cleanName.replace(
          // a real separator (space / dash / dot / #/ "(") must sit
          // between the name and the trailing number, so a year like
          // "...2016" is never clipped to "...20".
          new RegExp(`[\\s\\-\\u2013\\u2014.#(]+${num.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\)?\\s*$`),
          ""
        ).trim() || cleanName
      : cleanName;
  const withNum = num ? `${baseName} #${num}` : baseName;
  const withSet = `${withNum} (${set})`;
  const candidates = [
    `${withSet} Price & Value`,
    withSet,
    `${withNum} Price & Value`,
    withNum,
    `${baseName} (${set}) Price & Value`,
    `${baseName} (${set})`,
    `${baseName} Price & Value`,
    baseName,
  ];
  for (const c of candidates) if (c.length <= 63) return c;
  return baseName.length <= 63 ? baseName : baseName.slice(0, 62).trimEnd();
}

// From the card_catalog rows of ONE set (already fully paginated by the
// caller - PostgREST caps a request at 1,000 rows and one set can exceed
// that), pick the row a card slug RESOLVES to: the row whose name
// slugifies to `nameSlug`, is a real card and is imaged. Price is NOT
// required here - a genuine card keeps its permanent URL even when its
// market price is unavailable (the page renders "Market price
// unavailable"; catalogCardIndexable is what then gates sitemap/robots).
// A same-slug tie is broken on a STABLE key (lowest tcgplayer_id), NEVER
// on price - price must not decide which printing a permanent URL resolves
// to. Returns null only when nothing in the set matches or nothing that
// matches is a real, imaged card. Pure, so the >1,000-row set case is
// unit-testable without a DB.
export function pickCatalogMatch(rows, nameSlug) {
  const matches = (rows ?? []).filter((r) => slugifySet(r.name) === nameSlug);
  if (matches.length === 0) return null;
  // Tie-break on a STABLE, immutable key, never on price: a permanent URL
  // must always resolve to the same printing regardless of daily price
  // moves or DB row order. tcgplayer_id is the exact TCGplayer product id.
  // (In practice ~29,303 of 29,306 catalogue slugs are already unique; the
  // handful that collide are Unown letter cards where "(!)"/"(?)" slugify
  // to the same string - any deterministic pick is fine there.)
  const usable = matches
    .filter((r) => catalogCardResolvable(r))
    .sort((a, b) => String(a.tcgplayer_id).localeCompare(String(b.tcgplayer_id)));
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
