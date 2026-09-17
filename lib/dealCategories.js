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
    // graded-inventory-r1 - counted and paginated from the All deals
    // inventory (lib/allDealsInventory): exact counts after eligibility,
    // identity-conflict withholding and listing dedup. The page keeps what it
    // already was: English-catalogue cards, local listings first within a
    // selected marketplace, and savings / ending-soon sorts that list only the
    // listings they rank.
    inventory: { language: "english", localFirst: true, narrowingSorts: true },
    // how the page names its inventory ("N of M graded listings") and where
    // the same listings in every catalogue language live (/deals engine)
    inventorySubject: "graded listings",
    languageScope: {
      note: "English-catalogue cards only.",
      label: "English and Japanese graded listings",
      basePath: "/deals",
      preset: { type: "graded" },
    },
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
  // audit-r1 follow-up: listings whose seller lowered the price while the
  // listing was live (deals.previous_price / price_dropped_at, written by
  // the deals_track_price_drop trigger - supabase/price_drop_migration.sql).
  // Newest drop first; the card shows the price it dropped from.
  "price-drops": {
    filter: { priceDrop: true },
    defaultSort: "price_drop",
    h1: "Pokemon Card Price Drops",
    title: "Pokemon Card Price Drops — Listings Reduced This Week on eBay",
    description:
      "Tracked eBay Pokemon card listings whose seller cut the price in the last 7 days, newest reduction first, with the previous price and any matching market reference.",
    intro:
      "Tracked eBay listings whose asking price was lowered while they were live, most recent reduction first. Each card shows the price it dropped from; a market reference appears where a matching comparison is available.",
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
    // The 65-char cap is on the COMPLETE RENDERED title, including the
    // " | Pokemon Deal Finder" template suffix (22 chars), so the authored
    // string has 43 to work with. Naming the current era keeps the signal
    // that ME-era set and card pages link here (me-era-17c7 M-3 depends on
    // it); the description and intro below still list every era in full.
    title: "Modern Pokemon Card Deals — Mega Evolution",
    description:
      "Browse modern Pokemon card listings from Sword & Shield, Scarlet & Violet, Mega Evolution and newer releases, with matching market references where available.",
    intro:
      "Tracked eBay listings from Sword & Shield, Scarlet & Violet, Mega Evolution and newer releases. The selection follows the recent sets represented in available listings.",
  },
  // audit-r1 - country-first landing pages. The inventory is already
  // scanned per eBay site and every listing carries the marketplace it can
  // be bought from; these give each market one indexable route with the
  // local site and currency in the title. Prices still display in the
  // visitor's currency (client-side), so the intro states the native one.
  //
  // WHAT THESE PAGES MAY PROMISE. Their gate is isDisplayableDeal;
  // savingsClaimTrusted is applied only when sort === "discount"
  // (lib/deals.js), and the default sort is "newest". They therefore show
  // ordinary market-price listings alongside evidenced discounts - by
  // design, so the site is not sparse. Measured 2026-09-17, displayable
  // rows carrying NO evidenced below-market comparison: GB 113/204,
  // CA 180/264, US 290/959, AU 81/171. So the title, description and intro
  // state the comparison CONDITIONALLY ("where available"), exactly as the
  // price/era/graded categories above already do. A verified saving is
  // still shown per listing where one exists - the claim was never
  // removed, only stopped from being made about every listing in advance.
  uk: {
    filter: { country: "EBAY_GB" },
    h1: "Pokemon Card Deals in the UK",
    title: "Pokemon Card Deals on eBay.co.uk (GBP)",
    description:
      "Browse tracked eBay.co.uk Pokemon card listings, priced in pounds, with matching market references where available. Every listing is condition-checked and re-verified before it is shown.",
    intro:
      "Tracked eBay.co.uk listings for Pokemon cards, priced in GBP, sorted newest first. Where a supported market reference is available for the exact card and condition, the comparison is shown with the listing; others are shown as ordinary listings. Use the filters for raw or graded, price or auctions.",
  },
  australia: {
    filter: { country: "EBAY_AU" },
    h1: "Pokemon Card Deals in Australia",
    // Same rendered-title cap as `modern` above: 43 authored characters.
    // Both facts this route is defined by survive - the local eBay site
    // (the filter IS country: EBAY_AU) and the native currency, which
    // audit-r1-stage2 AR1S2-1 requires every country landing title to name.
    // The country adjective is the one thing that did not fit; the H1
    // ("Pokemon Card Deals in Australia") and the intro still carry it.
    //
    // "Below Market" was DROPPED, not merely shortened. This page's gate is
    // isDisplayableDeal; savingsClaimTrusted is applied only when
    // sort === "discount" (lib/deals.js), and the default sort is "newest".
    // Measured 2026-09-17: 81 of 171 displayable EBAY_AU rows (47%) carry no
    // evidenced below-market comparison, so the page cannot promise one in
    // its title. The UK, Canada and US titles still make that claim and are
    // left for a separate batch, with the r6-category-currency assertion
    // that catches it deliberately left failing rather than weakened.
    title: "Pokemon Card Deals on eBay.com.au (AUD)",
    description:
      "Browse tracked eBay.com.au Pokemon card listings, priced in Australian dollars, with matching market references where available. Condition-checked and re-verified before they are shown.",
    intro:
      "Tracked eBay.com.au listings for Pokemon cards, priced in AUD, sorted newest first. Where a supported market reference is available for the exact card and condition, the comparison is shown with the listing; others are shown as ordinary listings. Use the filters for raw or graded, price or auctions.",
  },
  canada: {
    filter: { country: "EBAY_CA" },
    h1: "Pokemon Card Deals in Canada",
    title: "Pokemon Card Deals on eBay.ca (CAD)",
    description:
      "Browse tracked eBay.ca Pokemon card listings, priced in Canadian dollars, with matching market references where available. Condition-checked and re-verified before they are shown.",
    intro:
      "Tracked eBay.ca listings for Pokemon cards, priced in CAD, sorted newest first. Where a supported market reference is available for the exact card and condition, the comparison is shown with the listing; others are shown as ordinary listings. Use the filters for raw or graded, price or auctions.",
  },
  usa: {
    filter: { country: "EBAY_US" },
    h1: "Pokemon Card Deals in the US",
    title: "Pokemon Card Deals on eBay.com (USD)",
    description:
      "Browse tracked eBay.com Pokemon card listings, priced in US dollars, with matching market references where available. Condition-checked and re-verified before they are shown.",
    intro:
      "Tracked eBay.com listings for Pokemon cards, priced in USD, sorted newest first. Where a supported market reference is available for the exact card and condition, the comparison is shown with the listing; others are shown as ordinary listings. Use the filters for raw or graded, price or auctions.",
  },
  japanese: { redirect: "/japanese-cards" },
  sealed: { redirect: "/sealed-deals" },
};

// The slugs that render a real page here (redirects excluded) - used by
// generateStaticParams and the sitemap.
const DEAL_CATEGORY_SLUGS = Object.keys(DEAL_CATEGORIES).filter((s) => !DEAL_CATEGORIES[s].redirect);

// graded-inventory-r1 - query params for a category served from the All deals
// inventory. The category's own preset and inventory options win over anything
// in the URL (a ?type=raw cannot turn /deals/graded into raw listings).
function categoryInventoryParams(cat, params = {}) {
  return { ...params, ...cat.filter, ...cat.inventory };
}

// graded-inventory-r1 - an English-only inventory category's link to the same
// listings in every catalogue language on /deals: keeps the filters /deals
// understands and a selected marketplace (All marketplaces is /deals' own
// default, so ?country=all is dropped); never carries ?page.
const CROSS_LANGUAGE_KEYS = ["grader", "grade", "listing", "minPrice", "maxPrice", "q", "sort"];
function crossLanguageHref(params = {}, { basePath, preset = {} }) {
  const sp = new URLSearchParams(preset);
  for (const k of CROSS_LANGUAGE_KEYS) if (params[k]) sp.set(k, params[k]);
  if (params.country && String(params.country).toLowerCase() !== "all") sp.set("country", params.country);
  return `${basePath}?${sp.toString()}`;
}

function isModernSet(setName) {
  return MODERN_SET_PREFIX.test(String(setName || ""));
}

module.exports = {
  DEAL_CATEGORIES,
  DEAL_CATEGORY_SLUGS,
  VINTAGE_SETS,
  isModernSet,
  categoryInventoryParams,
  crossLanguageHref,
};
