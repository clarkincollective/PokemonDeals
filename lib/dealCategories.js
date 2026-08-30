// Intentional, clean SEO landing routes for high-intent deal queries -
// /deals/under-50/, /deals/graded/, etc. - INSTEAD of letting arbitrary
// `?maxPrice=50&type=graded` filter permutations become crawlable landing
// pages (see docs/indexability.md's faceted-nav rule). Each is a fixed
// preset over the SAME fetchDealsPage / DealGrid the rest of the site
// uses - no second deal implementation, no fabricated data.
//
// `japanese` / `sealed` redirect to the pages that already own that
// intent (/japanese-cards, /sealed-deals) rather than duplicating them.

// The Wizards-of-the-Coast + e-Card era, 1998-2003. A fixed, factual set
// list (these sets' release years don't change) matched against the
// real `watchlist.set` strings on active deals. Used for /deals/vintage/.
const VINTAGE_SETS = [
  "Base Set",
  "Base Set (Shadowless)",
  "Base Set 2",
  "Jungle",
  "Fossil",
  "Team Rocket",
  "Gym Heroes",
  "Gym Challenge",
  "Neo Genesis",
  "Neo Discovery",
  "Neo Revelation",
  "Neo Destiny",
  "Legendary Collection",
  "Expedition",
  "Aquapolis",
  "Skyridge",
  "Southern Islands",
  "Best of Promos",
  "WoTC Promo",
];

// /deals/modern/ resolves its set list at request time from the live
// active-deal set list (fetchSets) - anything on the Scarlet & Violet or
// Sword & Shield era prefix. Kept dynamic so a newly-released set is
// covered without a code change.
const MODERN_SET_PREFIX = /^(SV\b|SV[0-9:]|SWSH\b|SWSH[0-9:]|Scarlet & Violet|Sword & Shield)/i;

// Order here = display order on /deals/ and in the footer strip.
const DEAL_CATEGORIES = {
  "under-25": {
    filter: { maxPrice: 25 },
    h1: "Pokemon Card Deals Under $25",
    title: "Pokemon Cards Under $25 — Best Current Deals",
    description:
      "Every Pokemon card currently listed on eBay under $25 and below its real market price, checked against PokemonPriceTracker data. Updated continuously.",
    intro:
      "Live eBay listings for Pokemon single cards priced under $25 that our scan found below market value. Sorted newest first; use the filters for country, condition or a tighter price range.",
  },
  "under-50": {
    filter: { maxPrice: 50 },
    h1: "Pokemon Card Deals Under $50",
    title: "Pokemon Cards Under $50 — Best Current Deals",
    description:
      "Pokemon cards under $50 on eBay right now, each priced below its real market value. Compared against PokemonPriceTracker sold data and refreshed continuously.",
    intro:
      "Live below-market eBay listings for Pokemon single cards under $50 — the price band where most genuine everyday deals sit. Filter by country, raw/graded or price.",
  },
  "under-100": {
    filter: { maxPrice: 100 },
    h1: "Pokemon Card Deals Under $100",
    title: "Pokemon Cards Under $100 — Best Current Deals",
    description:
      "Below-market Pokemon card deals under $100 on eBay right now, checked against real PokemonPriceTracker market pricing.",
    intro:
      "Live eBay listings for Pokemon cards under $100 priced below market value. Includes mid-value raw cards and cheaper graded slabs; filter to narrow it down.",
  },
  graded: {
    filter: { cardType: "graded" },
    h1: "Graded Pokemon Card Deals",
    title: "Graded Pokemon Card Deals — PSA, CGC & BGS Below Market",
    description:
      "PSA, CGC and BGS graded Pokemon cards listed on eBay below their real recorded sold price. Each deal is priced against actual graded sales data.",
    intro:
      "Live eBay listings for professionally graded Pokemon cards (PSA, CGC, BGS, SGC) priced below the grade's real recorded sold value. The grade and grader are shown on every card.",
  },
  auctions: {
    filter: { listingType: "AUCTION" },
    defaultSort: "ending",
    h1: "Pokemon Card Auction Deals",
    title: "Pokemon Card Auction Deals — Ending Soon, Below Market",
    description:
      "Live Pokemon card auctions on eBay currently sitting below market value, ordered by soonest to end. Current bid and end time shown on every listing.",
    intro:
      "Pokemon card auctions whose current bid is below the card's market value, ending soonest first. Bids move — the discount shown is against the price right now.",
  },
  vintage: {
    filter: { sets: VINTAGE_SETS },
    h1: "Vintage Pokemon Card Deals",
    title: "Vintage Pokemon Card Deals — WOTC & e-Card Era Below Market",
    description:
      "Below-market deals on vintage Pokemon cards from Base Set through Skyridge (1998–2003) — the Wizards of the Coast and e-Card era — priced against real market data.",
    intro:
      "Live eBay listings below market value for cards from the 1998–2003 Wizards of the Coast and e-Card sets (Base Set, Jungle, Fossil, the Neo and Gym series, Legendary Collection, Expedition, Aquapolis, Skyridge).",
  },
  modern: {
    filter: { modernEra: true },
    h1: "Modern Pokemon Card Deals",
    title: "Modern Pokemon Card Deals — Scarlet & Violet, Sword & Shield",
    description:
      "Below-market deals on modern Pokemon cards from the Scarlet & Violet and Sword & Shield eras, checked against real PokemonPriceTracker market pricing.",
    intro:
      "Live below-market eBay listings for cards from the current Scarlet & Violet and recent Sword & Shield sets. The set list updates automatically as new sets release.",
  },
  japanese: { redirect: "/japanese-cards" },
  sealed: { redirect: "/sealed-deals" },
};

// The slugs that render a real page here (redirects excluded) - used by
// generateStaticParams and the sitemap.
const DEAL_CATEGORY_SLUGS = Object.keys(DEAL_CATEGORIES).filter((s) => !DEAL_CATEGORIES[s].redirect);

function isModernSet(setName) {
  return MODERN_SET_PREFIX.test(String(setName || ""));
}

module.exports = {
  DEAL_CATEGORIES,
  DEAL_CATEGORY_SLUGS,
  VINTAGE_SETS,
  isModernSet,
};
