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
// active-deal set list (fetchSets) - anything on a Sword & Shield or later
// catalogue prefix. Kept dynamic so a newly-released set is covered without
// a code change.
// "Modern" is chronological browsing, not a series claim. 17C.7 added the
// Mega Evolution-era prefixes ("ME01:"-style expansions and "ME:" releases).
// Before that, the list stopped at SV/SWSH because it predated the series,
// which silently dropped every recent set from modern deals. Energy-only
// groups ("SVE:", "MEE:") stay out, as before.
const MODERN_SET_PREFIX = /^(SV\b|SV[0-9:]|SWSH\b|SWSH[0-9:]|ME[0-9]{2}:|ME:|Scarlet & Violet|Sword & Shield|Mega Evolution)/i;

// Order here = display order on /deals/ and in the footer strip.
const DEAL_CATEGORIES = {
  "under-25": {
    filter: { maxPrice: 25 },
    h1: "Pokemon Card Deals Under $25",
    title: "Pokemon Cards Under $25 — Best Current Deals",
    description:
      "Browse tracked eBay Pokemon card listings under US$25, with matching market references where available. Check condition, shipping and price before buying.",
    intro:
      "Tracked eBay listings for Pokemon single cards under US$25. Sorted newest first; use the filters for country, condition or a tighter price range.",
  },
  "under-50": {
    filter: { maxPrice: 50 },
    h1: "Pokemon Card Deals Under $50",
    title: "Pokemon Cards Under $50 — Best Current Deals",
    description:
      "Browse tracked Pokemon card listings under US$50 on eBay, with matching market references where available. Compare condition, shipping and price.",
    intro:
      "Tracked eBay listings for Pokemon single cards under US$50. Filter by country, raw/graded or price, then compare the exact card and condition.",
  },
  "under-100": {
    filter: { maxPrice: 100 },
    h1: "Pokemon Card Deals Under $100",
    title: "Pokemon Cards Under $100 — Best Current Deals",
    description:
      "Browse tracked Pokemon card listings under US$100 on eBay, with matching market references where available for raw cards and graded slabs.",
    intro:
      "Tracked eBay listings for Pokemon cards under US$100, including raw cards and graded slabs. Filter to narrow the selection.",
  },
  graded: {
    filter: { cardType: "graded" },
    h1: "Graded Pokemon Card Deals",
    title: "Graded Pokemon Card Deals — PSA, CGC & BGS Listings",
    description:
      "Browse PSA, CGC and BGS graded Pokemon card listings on eBay. Compare the exact grader and grade with matching market references where available.",
    intro:
      "Tracked eBay listings for professionally graded Pokemon cards (PSA, CGC, BGS, SGC). Check the grader and grade; a raw-card reference does not value a graded slab.",
  },
  auctions: {
    filter: { listingType: "AUCTION" },
    defaultSort: "ending",
    h1: "Pokemon Card Auction Deals",
    title: "Pokemon Card Auction Deals — Ending Soon on eBay",
    description:
      "Browse tracked Pokemon card auctions on eBay, ordered by soonest to end. Compare the current bid, shipping and matching market reference where available.",
    intro:
      "Tracked Pokemon card auctions, ending soonest first. Current bids can change; any comparison reflects the recorded bid and confirmed shipping, not a final sale price.",
  },
  vintage: {
    filter: { sets: VINTAGE_SETS },
    h1: "Vintage Pokemon Card Deals",
    title: "Vintage Pokemon Card Deals — WOTC & e-Card Era",
    description:
      "Browse tracked vintage Pokemon card listings from Base Set through Skyridge (1998–2003), with matching market references where available.",
    intro:
      "Tracked eBay listings from the 1998–2003 Wizards of the Coast and e-Card sets, including Base Set, Jungle, Fossil, the Neo and Gym series, and Expedition through Skyridge.",
  },
  modern: {
    filter: { modernEra: true },
    h1: "Modern Pokemon Card Deals",
    title: "Modern Pokemon Card Deals — Mega Evolution, Scarlet & Violet, Sword & Shield",
    description:
      "Browse modern Pokemon card listings from Sword & Shield, Scarlet & Violet, Mega Evolution and newer releases, with matching market references where available.",
    intro:
      "Tracked eBay listings from Sword & Shield, Scarlet & Violet, Mega Evolution and newer releases. The selection follows the recent sets represented in available listings.",
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
