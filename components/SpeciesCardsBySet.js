import { slugifySet } from "@/lib/slugify";
import { buildEbaySearchLink } from "@/lib/ebay";
import CatalogueBrowser from "@/components/CatalogueBrowser";

// Server wrapper for the full "every <Pokemon> card" catalogue. Its only
// job is to pre-build each card's campaign-wrapped eBay SEARCH url (that
// needs the server-only EBAY_CAMPAIGN_ID) and hand a plain data array to
// <CatalogueBrowser>, the client component that renders the tiles + the
// search / filter / sort toolbar + progressive disclosure. Every card is
// in that array, so every card + every /cards/[slug] link is in the
// crawler-visible HTML - the client only ever shows/hides, never fetches.
//
// `cards` from fetchSpeciesCatalog: { tcgplayerId, name, set, cardNumber,
// rarity, refPrice, image, hubSlug, catalogSlug, deal }.
// Attach the per-card fields the client tiles need but can't compute
// (slugifySet is cheap; the campaign-wrapped eBay search url needs the
// server-only EBAY_CAMPAIGN_ID). Shared with the page's featured-value
// section so both build tiles identically.
export function buildCatalogueItems(cards, validSetSlugs = []) {
  return (cards ?? []).map((c) => ({
    ...c,
    setSlug: slugifySet(c.set),
    setHasPage: validSetSlugs.includes(slugifySet(c.set)),
    ebayHref: buildEbaySearchLink([c.name, c.cardNumber, c.set].filter(Boolean).join(" ")),
  }));
}

export default function SpeciesCardsBySet({ speciesName, cards, validSetSlugs = [] }) {
  if (!cards || cards.length === 0) return null;
  return (
    <CatalogueBrowser speciesName={speciesName} items={buildCatalogueItems(cards, validSetSlugs)} />
  );
}
