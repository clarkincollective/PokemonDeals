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
//   shipping = 0   -> "Listing price" + "Shipping not confirmed" and any
//                  saving stated "before shipping" (the row cannot
//                  distinguish free from unstated; the card never says free)
//   graded         grader + grade as the condition; graded reference
//   non_usd        a GB listing: native currency first, USD reference
//                  re-expressed at the scan-time rate
//   long_name      a long name, to prove the layout holds
//
// ARTWORK IS CORRECTLY MATCHED: each fixture's `card_tcgplayer_id` is the
// real catalogue product id of the named printing (read from the site's
// own set checklists / guide registry), so the labelled catalogue art is
// the card the identity line names. The one unreleased fixture carries no
// id and renders the neutral no-image state on purpose.
//
// PRICES, IDS, DATES AND LINKS ARE SIMULATED. They are placeholders that
// exercise a state; they do not describe any live eBay offer and the
// affiliate URLs lead nowhere. The sheet labels every card as simulated.
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
    image_verdict: over.card_tcgplayer_id ? "CANONICAL_FALLBACK" : "NO_TRUSTED_IMAGE",
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

// Real catalogue product ids for the named printings (site checklists /
// lib/guideLinks). Kept in one place so the sheet's artwork stays matched.
export const FIXTURE_ART = Object.freeze({
  clefableJungle: "45120", //      Clefable 01/64 (Jungle, Holo Rare)
  scytherJungle: "45121", //       Scyther 10/64 (Jungle, Holo Rare)
  pinsirJungle: "45135", //        Pinsir 09/64 (Jungle, Holo Rare)
  cuboneJungle: "45153", //        Cubone 50/64 (Jungle)
  darkGengarNeoDestiny: "84599", // Dark Gengar 006/105 (Neo Destiny)
  lightDragoniteNeoDestiny: "86738", // Light Dragonite 014/105 (Neo Destiny)
  charizardBaseSet: "42382", //    Charizard 004/102 (Base Set)
  umbreonVmaxAltArt: "246723", //  Umbreon VMAX (Alternate Art Secret) 215/203 (SWSH07: Evolving Skies)
  zekromExBlackBolt: "642618", //  Zekrom ex 166/086 (SV: Black Bolt, Special Illustration Rare)
});

export const DEAL_STATE_FIXTURES = [
  {
    id: "bin_compared",
    label: "Buy it now - comparable reference, shipping confirmed",
    note: "Listing total (item + the recorded shipping charge), the matching Near Mint market reference, the derived saving. Green appears only here.",
    deal: row({
      id: 900001, title: "Clefable Jungle 1/64 Holo Rare Near Mint",
      card_name: "Clefable", card_set: "Jungle", card_tcgplayer_id: FIXTURE_ART.clefableJungle,
      price: 26.5, shipping: 4.25, total_price: 30.75, total_price_usd: 30.75, market_price: 38.26, discount_pct: 0.196,
      first_seen_at: ago(1.5),
    }),
    hub: { count: 3, slug: "clefable-1-jungle" },
  },
  {
    id: "bin_shipping_unconfirmed",
    label: "Buy it now - comparable reference, shipping not confirmed",
    note: "The scan recorded shipping = 0, which is free OR unstated: the headline is the Listing price, the card says 'Shipping not confirmed', and the saving is stated before shipping.",
    deal: row({
      id: 900009, title: "Snorlax Jungle 11/64 Holo Rare Near Mint",
      card_name: "Snorlax", card_set: "Jungle", card_tcgplayer_id: "45122",
      price: 118, shipping: 0, total_price: 118, total_price_usd: 118, market_price: 151.06, discount_pct: 0.219,
    }),
  },
  {
    id: "bin_plain",
    label: "Buy it now - insufficient comparison",
    note: "A tracked 2025 set with no stored reference evidence for this exact product and condition: price and shipping status only, no badge, no saving, the reason stated.",
    deal: row({
      id: 900002, title: "Zekrom ex 166/086 Special Illustration Rare Black Bolt NM",
      card_name: "Zekrom ex - 166/086", card_set: "SV: Black Bolt", card_tcgplayer_id: FIXTURE_ART.zekromExBlackBolt,
      price: 180, shipping: 0, total_price: 180, total_price_usd: 180, market_price: 240, discount_pct: 0.25,
    }),
  },
  {
    id: "bin_upcoming",
    label: "Buy it now - listed before release (no catalogue art yet)",
    note: "Seen before the expansion's official release day: the release date and the seller's own claim are shown, no comparison is drawn. Unreleased, so there is no catalogue artwork - this is the neutral no-image state, not a mismatch.",
    deal: row({
      id: 900003, title: "30th Celebration single preorder ships on release",
      card_name: "Simulated preorder listing", card_set: "ME: 30th Celebration", card_tcgplayer_id: null,
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
      card_name: "Dark Gengar", card_set: "Neo Destiny", card_tcgplayer_id: FIXTURE_ART.darkGengarNeoDestiny,
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
      card_name: "Charizard", card_set: "Base Set", card_tcgplayer_id: FIXTURE_ART.charizardBaseSet,
      is_graded: true, grader: "PSA", grade: "9", condition: null,
      price: 1450, shipping: 0, total_price: 1450, total_price_usd: 1450, market_price: 1820, discount_pct: 0.2,
    }),
  },
  {
    id: "non_usd",
    label: "Non-US listing - native currency first",
    note: "GB listing: pounds on the server render and first paint; the USD reference is re-expressed at the scan-time rate; the viewer's currency applies after hydration.",
    deal: row({
      id: 900006, title: "Light Dragonite Neo Destiny 14/105 Holo",
      card_name: "Light Dragonite", card_set: "Neo Destiny", card_tcgplayer_id: FIXTURE_ART.lightDragoniteNeoDestiny,
      marketplace: "EBAY_GB", is_local: false,
      price: 300, shipping: 12, total_price: 312, total_price_usd: 408.7, market_price: 520, discount_pct: 0.214,
    }),
    hub: { count: 5, slug: "light-dragonite-14-neo-destiny" },
  },
  {
    id: "unverified_condition",
    label: "Condition not verified",
    note: "A raw card whose physical condition was never established renders 'Condition not verified' (amber) - it never defaults to Near Mint.",
    deal: row({
      id: 900007, title: "Scyther Jungle 10/64 Holo",
      card_name: "Scyther", card_set: "Jungle", card_tcgplayer_id: FIXTURE_ART.scytherJungle,
      condition: null,
      price: 40, shipping: 3.5, total_price: 43.5, total_price_usd: 43.5, market_price: 61.71, discount_pct: 0.295,
    }),
  },
  {
    id: "long_name",
    label: "Long name and set",
    note: "Identity wraps to two lines and the set/condition line truncates; nothing overflows the card.",
    deal: row({
      id: 900008, title: "Umbreon VMAX Evolving Skies 215/203 Alternate Art Secret",
      card_name: "Umbreon VMAX (Alternate Art Secret)", card_set: "SWSH07: Evolving Skies", card_tcgplayer_id: FIXTURE_ART.umbreonVmaxAltArt,
      price: 1210, shipping: 0, total_price: 1210, total_price_usd: 1210, market_price: 1580, discount_pct: 0.234,
    }),
    rank: 2,
  },
];

// The catalogue-only state: exact identity + reference, no listing.
export const REFERENCE_FIXTURE = {
  name: "Cubone",
  set: "Jungle",
  number: "50/64",
  tcgplayerId: FIXTURE_ART.cuboneJungle,
  href: null,
  referenceUsd: 1.33,
  referenceCondition: "Near Mint",
  referencePrinting: "Unlimited",
};

export const REFERENCE_FIXTURE_NO_PRICE = {
  name: "Pinsir",
  set: "Jungle",
  number: "9/64",
  tcgplayerId: FIXTURE_ART.pinsirJungle,
  href: null,
  referenceUsd: null,
  referenceCondition: null,
  referencePrinting: null,
};
