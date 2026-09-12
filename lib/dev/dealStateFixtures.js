// Deal-first R1 - LABELLED offer-state fixtures for the dev-only component
// sheet (app/dev/deal-states). Never used by a production surface.
//
// Every row is shaped like a `deals` pool row (lib/dealPoolShape) so the
// real <DealCard> renders it through the real rules: lib/dealQuality
// listingPresentation decides whether a savings claim is trusted, and the
// same helpers derive currency, condition, image and CTA. Nothing here
// bypasses a gate - the fixtures pick INPUTS that reach each state:
//
//   bin_compared   a vintage set outside the tracked-release list, so the
//                  stored reference is comparable -> discount + saving
//   bin_plain      a tracked 2025 set with NO stored reference evidence
//                  -> plain listing, no claim, the reason shown
//   bin_upcoming   a listing seen before its expansion's release day
//                  -> "Upcoming - releases <date>", no claim
//   auction        current bid + shipping + est. total, real end time
//   shipping_none  `shipping` 0 -> "no shipping charge listed" (the row
//                  cannot distinguish free from unstated - the card says
//                  what it knows, never "free")
//   graded         grader + grade as the condition; graded reference
//   non_usd        a GB listing: native currency first, USD reference
//                  re-expressed at the scan-time rate
//   long_name      a 4-line name + long set, to prove the layout holds
//
// Artwork is the catalogue art of a real printing (shown WITH the
// "Reference image" label because image_url is null); the listing prices,
// ids and URLs are placeholders that lead nowhere. Offer availability is
// not asserted by any fixture.
const NOW = Date.now();
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const ahead = (h) => new Date(NOW + h * 3600 * 1000).toISOString();

const ITM = (n) => `https://www.ebay.com/itm/00000000000${n}`;

function row(over) {
  return {
    id: over.id,
    title: over.title,
    image_url: null,
    display_image_url: null,
    image_verdict: "CANONICAL_FALLBACK",
    affiliate_url: ITM(over.id),
    listing_url: ITM(over.id),
    listing_id: `fixture-${over.id}`,
    marketplace: "EBAY_US",
    listing_type: "FIXED_PRICE",
    bid_count: null,
    auction_end_at: null,
    is_graded: false,
    grader: null,
    grade: null,
    condition: "Near Mint",
    is_local: true,
    first_seen_at: ago(6),
    last_seen_at: ago(1),
    exact_verified_at: ago(1),
    shipping: 0,
    ...over,
    watchlist: { name: over.card_name, set: over.card_set, language: over.card_language ?? "english", justtcg_tcgplayer_id: over.card_tcgplayer_id },
  };
}

export const DEAL_STATE_FIXTURES = [
  {
    id: "bin_compared",
    label: "Buy it now - comparable reference",
    note: "Listing total (item + recorded shipping), the matching Near Mint market reference, the derived saving. Green appears only here.",
    deal: row({
      id: 900001, title: "Clefable Jungle 1/64 Holo Rare Near Mint",
      card_name: "Clefable", card_set: "Jungle", card_tcgplayer_id: "45120",
      price: 26.5, shipping: 4.25, total_price: 30.75, total_price_usd: 30.75, market_price: 38.26, discount_pct: 0.196,
      first_seen_at: ago(1.5),
    }),
    hub: { count: 3, slug: "clefable-1-jungle" },
  },
  {
    id: "bin_plain",
    label: "Buy it now - insufficient comparison",
    note: "A tracked 2025 set with no stored reference evidence for this exact product and condition: price and shipping only, no badge, no saving, the reason stated.",
    deal: row({
      id: 900002, title: "Zekrom ex Black Bolt Near Mint",
      card_name: "Zekrom ex", card_set: "SV: Black Bolt", card_tcgplayer_id: "45120",
      price: 18, shipping: 0, total_price: 18, total_price_usd: 18, market_price: 24, discount_pct: 0.25,
    }),
  },
  {
    id: "bin_upcoming",
    label: "Buy it now - listed before release",
    note: "Seen before the expansion's official release day: the release date and the seller's own claim are shown; no comparison is drawn.",
    deal: row({
      id: 900003, title: "Mega Charizard ex 30th Celebration preorder ships on release",
      card_name: "Mega Charizard ex", card_set: "ME: 30th Celebration", card_tcgplayer_id: "45120",
      price: 120, shipping: 5, total_price: 125, total_price_usd: 125, market_price: 190, discount_pct: 0.34,
      first_seen_at: ago(30),
    }),
  },
  {
    id: "auction",
    label: "Auction - current bid",
    note: "Headline is the CURRENT BID; shipping and the estimated total are their own lines; the reference sits against the estimate; bids can raise the final price.",
    deal: row({
      id: 900004, title: "Dark Gengar Neo Destiny 6/105 Holo",
      card_name: "Dark Gengar", card_set: "Neo Destiny", card_tcgplayer_id: "84561",
      listing_type: "AUCTION", bid_count: 7, auction_end_at: ahead(5),
      price: 610, shipping: 8, total_price: 618, total_price_usd: 618, market_price: 1103, discount_pct: 0.44,
    }),
  },
  {
    id: "graded",
    label: "Graded - grader and grade as the condition",
    note: "PSA 9 is the condition line; the reference is the graded comp for that grade (rendered through the same trusted-claim rule).",
    deal: row({
      id: 900005, title: "Charizard Base Set 4/102 PSA 9",
      card_name: "Charizard", card_set: "Base Set", card_tcgplayer_id: "42382",
      is_graded: true, grader: "PSA", grade: "9", condition: null,
      price: 1450, shipping: 0, total_price: 1450, total_price_usd: 1450, market_price: 1820, discount_pct: 0.2,
    }),
  },
  {
    id: "non_usd",
    label: "Non-US listing - native currency first",
    note: "GB listing: pounds on the server render and first paint; the USD reference is re-expressed at the scan-time rate; the viewer's currency applies after hydration.",
    deal: row({
      id: 900006, title: "Umbreon VMAX Evolving Skies 215/203 Alt Art",
      card_name: "Umbreon VMAX (Alternate Art Secret)", card_set: "SWSH07: Evolving Skies", card_tcgplayer_id: "246723",
      marketplace: "EBAY_GB", is_local: false,
      price: 940, shipping: 12, total_price: 952, total_price_usd: 1247.1, market_price: 1580, discount_pct: 0.21,
    }),
    hub: { count: 5, slug: "umbreon-vmax-alternate-art-secret-215-swsh07-evolving-skies" },
  },
  {
    id: "unverified_condition",
    label: "Condition not verified",
    note: "A raw card whose physical condition was never established renders 'Condition not verified' (amber) - it never defaults to Near Mint.",
    deal: row({
      id: 900007, title: "Blastoise Base Set 2 2/130",
      card_name: "Blastoise", card_set: "Base Set 2", card_tcgplayer_id: "45120",
      condition: null,
      price: 40, shipping: 3.5, total_price: 43.5, total_price_usd: 43.5, market_price: 62, discount_pct: 0.3,
    }),
  },
  {
    id: "long_name",
    label: "Long name and set",
    note: "Identity wraps to two lines and the set/condition line truncates; nothing overflows the card.",
    deal: row({
      id: 900008, title: "Reshiram & Charizard GX Rainbow Rare Unbroken Bonds 217/214",
      card_name: "Reshiram & Charizard GX (Hyper Rare Rainbow Secret)", card_set: "SM - Unbroken Bonds Trainer Gallery Extended Name Set", card_tcgplayer_id: "45120",
      price: 210, shipping: 0, total_price: 210, total_price_usd: 210, market_price: 290, discount_pct: 0.276,
    }),
    rank: 2,
  },
];

// The catalogue-only state: exact identity + reference, no listing.
export const REFERENCE_FIXTURE = {
  name: "Cubone",
  set: "Jungle",
  number: "50/64",
  tcgplayerId: "45153",
  href: null,
  referenceUsd: 1.33,
  referenceCondition: "Near Mint",
  referencePrinting: "Unlimited",
};

export const REFERENCE_FIXTURE_NO_PRICE = {
  name: "Kabutops",
  set: "Fossil",
  number: "9/62",
  tcgplayerId: "45120",
  href: null,
  referenceUsd: null,
  referenceCondition: null,
  referencePrinting: null,
};
