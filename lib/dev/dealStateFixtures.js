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
//   shipping absent -> "Recorded price" + "Shipping breakdown not recorded"
//                  and NO saving stated (the stored total may already
//                  include a charge) - review round 2; same for auctions
//                  ("Recorded total", no comparison) and the no-bid auction
//                  fallback (stored total labelled by the same contract)
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

// SEO-4 (16 Sep 2026): the stored reference evidence a savings claim now
// needs (lib/dealQuality storedReferenceEvidence). Derived from the row
// itself so it always describes THIS row's stored comparison - product id,
// the amount that reproduces market_price, and the condition/printing the
// reference priced. A fixture that deliberately has no comparison
// (market_price null, or a mismatched reference) still renders as a plain
// listing, which is exactly what those states exist to show.
function referenceFor(r) {
  // A fixture whose whole point is "no stored reference evidence" opts out
  // explicitly, so it keeps rendering as a plain listing.
  if (r.no_reference_evidence) return {};
  if (r.market_price == null || r.card_tcgplayer_id == null) return {};
  const base = {
    reference_source: "fixture",
    reference_product_id: String(r.card_tcgplayer_id),
    reference_amount: r.market_price,
    reference_currency: "USD",
    reference_observed_at: ago(3),
    reference_synced_at: ago(3),
  };
  if (r.is_graded) return { ...base, reference_grader: r.grader ?? null, reference_grade: r.grade == null ? null : String(r.grade) };
  return { ...base, reference_condition: r.condition ?? null, reference_printing: "Holofoil" };
}

function row(over) {
  const built = {
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
  // evidence last, derived from the fully-merged row, but never overriding
  // a reference a fixture set explicitly (some states pin a MISMATCHED one)
  return { ...referenceFor(built), ...built };
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
  // THE LOUD SAVINGS TIERS, as a deal CARD renders them.
  //
  // Note what these do NOT show. On a card, a discount this good also
  // earns a deal SCORE, and the score chip takes the artwork corner -
  // SavingsBadge is only the fallback for a supported saving that could
  // not be scored, which in practice means a small one. So every one of
  // the 202 live cards currently rendering SavingsBadge is `modest`, and
  // the badge's own `hot`/`blowout` styling is reachable on sealed
  // product (SealedDealCard renders it unconditionally) rather than here.
  //
  // What they DO show is what a shopper actually sees at these
  // discounts: the solid "Exceptional Deal" label, the enlarged 85+
  // score chip, and the savings line with its amount set large and its
  // percentage as a solid chip. Both are ordinary supported comparisons -
  // nothing here is a different KIND of claim, only a louder rendering
  // of a bigger real number.
  {
    id: "bin_savings_blowout",
    label: "Buy it now - the top savings tier (>= 60% below reference)",
    note: "The loudest a card gets: solid 'Exceptional Deal' label, the enlarged score chip, the saved amount as the line's headline figure and the percentage as a solid chip. Measured at 3% of claim-bearing cards, so it stays rare enough to mean something. The badge's own gradient/halo tier does not appear here - the deal score takes the corner.",
    deal: row({
      id: 900031, title: "Charizard Base Set 4/102 Holo Rare Lightly Played",
      card_name: "Charizard", card_set: "Base Set", card_tcgplayer_id: FIXTURE_ART.charizardBaseSet,
      condition: "Lightly Played",
      price: 210, shipping: 12.5, total_price: 222.5, total_price_usd: 222.5, market_price: 674.2, discount_pct: 0.67,
      first_seen_at: ago(0.5),
    }),
  },
  {
    id: "bin_savings_hot",
    label: "Buy it now - the second savings tier (40-59% below reference)",
    note: "The percentage is still a solid chip on the savings line, and the score chip is still in the enlarged band - but the step down from blowout is real, and so is the step down to `strong` below 40%, where the chip becomes plain text.",
    deal: row({
      id: 900032, title: "Umbreon VMAX Alternate Art 215/203 Evolving Skies Near Mint",
      card_name: "Umbreon VMAX (Alternate Art Secret)", card_set: "SWSH07: Evolving Skies",
      card_tcgplayer_id: FIXTURE_ART.umbreonVmaxAltArt,
      price: 402, shipping: 9.95, total_price: 411.95, total_price_usd: 411.95, market_price: 848.3, discount_pct: 0.514,
      first_seen_at: ago(3),
    }),
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
    id: "bin_shipping_unknown",
    label: "Buy it now - comparable reference, shipping breakdown not recorded",
    note: "The row carries no shipping field (an older cache entry / no breakdown recorded): the stored total may or may not include a charge, so the headline is the neutral 'Recorded price', the reference is shown, and NO saving or badge is stated.",
    deal: (() => {
      const d = row({
        id: 900010, title: "Pinsir Jungle 9/64 Holo Rare Near Mint",
        card_name: "Pinsir", card_set: "Jungle", card_tcgplayer_id: FIXTURE_ART.pinsirJungle,
        price: 22, total_price: 27.5, total_price_usd: 27.5, market_price: 36.4, discount_pct: 0.245,
      });
      delete d.shipping;
      return d;
    })(),
  },
  {
    id: "bin_plain",
    label: "Buy it now - insufficient comparison",
    note: "A tracked 2025 set with no stored reference evidence for this exact product and condition: price and shipping status only, no badge, no saving, the reason stated.",
    deal: row({
      id: 900002, title: "Zekrom ex 166/086 Special Illustration Rare Black Bolt NM",
      card_name: "Zekrom ex - 166/086", card_set: "SV: Black Bolt", card_tcgplayer_id: FIXTURE_ART.zekromExBlackBolt,
      price: 180, shipping: 0, total_price: 180, total_price_usd: 180, market_price: 240, discount_pct: 0.25,
      no_reference_evidence: true, // THE POINT of this state - see referenceFor()
    }),
  },
  {
    id: "bin_plain_long_set",
    label: "Buy it now - plain offer, long set name, condition not verified",
    note: "The worst case for the identity line: a long tracked-set name AND an amber 'Condition not verified' on a plain offer (no reference, so the condition appears nowhere else on the card). The set truncates; the condition must stay readable at 390 and 320. No catalogue id in this fixture, so no artwork.",
    deal: row({
      id: 900014, title: "Mega Charizard X ex ME01 Mega Evolution ungraded",
      card_name: "Mega Charizard X ex", card_set: "ME01: Mega Evolution", card_tcgplayer_id: null,
      condition: null,
      price: 64, shipping: 4.5, total_price: 68.5, total_price_usd: 68.5, market_price: 92, discount_pct: 0.255,
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
      // THE ONE ABSOLUTE DATE IN THIS FILE, and it has to be.
      //
      // Every other fixture date is relative to NOW because it demonstrates
      // a state defined against the clock (fresh, stale, ending soon). This
      // one demonstrates a state defined against a CALENDAR DATE: earlyListing
      // asks whether the listing was first seen before its expansion's
      // release day began - for 30th Celebration, a worldwide release, that
      // is 2026-09-16 in Sydney = 2026-09-15T14:00Z.
      //
      // It was ago(30). That made the fixture true only while the real clock
      // was behind 2026-09-16T20:00Z; at that instant `ago(30)` slid past the
      // release start and the fixture silently stopped being an early
      // listing - the sheet stopped showing the state it exists to show, and
      // the R1-6 assertion began to fail with nothing in the code changed.
      // The rule was right; the fixture was measuring from the wrong origin.
      first_seen_at: "2026-09-10T12:00:00.000Z",
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
    id: "auction_shipping_unconfirmed",
    label: "Auction - shipping not confirmed",
    note: "Shipping recorded as 0 (free OR unstated): 'Shipping not confirmed', the estimate is labelled 'Est. total before shipping' and the comparison says 'before shipping'.",
    deal: row({
      id: 900011, title: "Cubone Jungle 50/64",
      card_name: "Cubone", card_set: "Jungle", card_tcgplayer_id: FIXTURE_ART.cuboneJungle,
      listing_type: "AUCTION", bid_count: 2, auction_end_at: ahead(9),
      price: 1.05, shipping: 0, total_price: 1.05, total_price_usd: 1.05, market_price: 1.33, discount_pct: 0.21,
    }),
  },
  {
    id: "auction_shipping_unknown",
    label: "Auction - shipping breakdown not recorded",
    note: "No shipping field on the row: the bid is still the bid, the stored figure is the neutral 'Recorded total', and no comparison is stated - the total may already include a charge.",
    deal: (() => {
      const d = row({
        id: 900012, title: "Scyther Jungle 10/64 Holo Rare",
        card_name: "Scyther", card_set: "Jungle", card_tcgplayer_id: FIXTURE_ART.scytherJungle,
        listing_type: "AUCTION", bid_count: 4, auction_end_at: ahead(3),
        price: 38, total_price: 42.5, total_price_usd: 42.5, market_price: 61.71, discount_pct: 0.31,
      });
      delete d.shipping;
      return d;
    })(),
  },
  {
    id: "auction_no_bid",
    label: "Auction - no stored bid (fallback)",
    note: "The row has a stored total but no bid figure, so the split rendering is impossible: the fallback shows the stored figure labelled by the shipping contract (here: shipping confirmed -> 'Est. total · incl. shipping'), never as 'Current bid'.",
    deal: row({
      id: 900013, title: "Light Dragonite Neo Destiny 14/105 Holo",
      card_name: "Light Dragonite", card_set: "Neo Destiny", card_tcgplayer_id: FIXTURE_ART.lightDragoniteNeoDestiny,
      listing_type: "AUCTION", bid_count: null, auction_end_at: ahead(14),
      price: null, shipping: 6, total_price: 396, total_price_usd: 396, market_price: 520, discount_pct: 0.238,
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
