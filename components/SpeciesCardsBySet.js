import { slugifySet } from "@/lib/slugify";
import { buildEbaySearchLink, wrapEbayAffiliateUrl } from "@/lib/ebay";
import { sortCards, DEFAULT_SORT } from "@/lib/catalogueView";
import CatalogueBrowser from "@/components/CatalogueBrowser";
import CatalogueLinkIndex from "@/components/CatalogueLinkIndex";

// The rich (client) browser only needs the cards a shopper actually
// engages with - it filters/sorts in memory, so every card it holds is
// serialized into the RSC payload. Cap it at the N highest-value cards
// (full art, prices, deals); the complete permanent-link set is the
// always-SSR <CatalogueLinkIndex>. Species/sets at or under the cap are
// unaffected.
export const RICH_BROWSER_CAP = 120;

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
// `surface` is the caller's fixed EPN attribution surface (see
// lib/affiliateSurfaces.js) - this helper is shared by /pokemon/[slug]
// ("pokemon") and /sets/[slug] ("set"), so it can't assume its own
// context and must be told.
export function buildCatalogueItems(cards, validSetSlugs = [], surface) {
  return (cards ?? []).map((c) => ({
    ...c,
    setSlug: slugifySet(c.set),
    setHasPage: validSetSlugs.includes(slugifySet(c.set)),
    ebayHref: buildEbaySearchLink([c.name, c.cardNumber, c.set].filter(Boolean).join(" "), undefined, surface),
    // c.deal.affiliateUrl (when a card carries a live verified deal) is
    // re-wrapped here too, server-side - the client <CatalogueBrowser>
    // this feeds cannot do it itself (EBAY_CAMPAIGN_ID is server-only).
    deal: c.deal ? { ...c.deal, affiliateUrl: wrapEbayAffiliateUrl(c.deal.affiliateUrl, { surface }) } : c.deal,
  }));
}

export default function SpeciesCardsBySet({ speciesName, cards, validSetSlugs = [] }) {
  if (!cards || cards.length === 0) return null;
  const items = buildCatalogueItems(cards, validSetSlugs, "pokemon");
  const richItems =
    items.length > RICH_BROWSER_CAP
      ? sortCards(items, DEFAULT_SORT, { relevanceTier: true }).slice(0, RICH_BROWSER_CAP)
      : items;
  return (
    <>
      <CatalogueBrowser speciesName={speciesName} items={richItems} totalCount={items.length} />
      <CatalogueLinkIndex label={speciesName} cards={items} headingId="full-card-index" />
    </>
  );
}
