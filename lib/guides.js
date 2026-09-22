// Editorial guides (brief Phase 19) - a small, fixed set of evergreen
// explainers, deliberately not a blog. Shared registry so the index page,
// the sitemap, and each guide page agree on slug / title / blurb.
//
// These are about the hobby and the market in general; how *this site*
// prices and matches listings lives on /methodology instead.

// Default publish date for the original four guides. A guide added later
// carries its own truthful `published` (see the grading cluster below) so
// the Article JSON-LD datePublished isn't back-dated to this constant.
export const GUIDES_PUBLISHED = "2026-08-28";

export const GUIDES = [
  {
    slug: "how-pokemon-card-prices-work",
    title: "How Pokemon Card Prices Are Determined",
    blurb:
      "Supply, demand, and sold comps — plus the four card-specific things (condition, grade, edition, printing) that split one card into many prices.",
  },
  {
    slug: "card-condition-grading",
    title: "Pokemon Card Condition & Grading Explained",
    blurb:
      "The Near Mint-to-Damaged scale used for raw cards, and what a PSA, CGC, BGS, SGC, ACE or TAG number actually means.",
  },
  {
    slug: "raw-vs-graded-pokemon-cards",
    title: "Raw vs. Graded Pokemon Cards",
    blurb:
      "Why the same card can cost several times more in a graded slab, what grading costs and takes, and when it's worth doing.",
  },
  {
    slug: "vintage-vs-modern-pokemon-cards",
    title: "Vintage vs. Modern Pokemon Cards",
    blurb:
      "Rough eras from the 1999 Base Set to today, what drives value differently in each, and where the buying risks are.",
  },
  // SEO-GSC-3 grading/condition cluster. Two supporting guides for the
  // two distinct real-query intents that the broad card-condition-grading
  // hub can't win: "what does a grade number mean" and "how do I check a
  // card's condition". Their query evidence is in
  // docs/gsc-indexation-audit.md.
  {
    slug: "pokemon-card-grading-scale",
    title: "The Pokemon Card Grading Scale, 1 to 10",
    blurb:
      "What each grade from 1 to 10 means, what usually separates a 7, 8, 9 and 10, and how the PSA, CGC and BGS scales differ. The grading company makes the final call.",
    published: "2026-09-07",
  },
  {
    slug: "how-to-check-pokemon-card-condition",
    title: "How to Check a Pokemon Card's Condition",
    blurb:
      "A practical way to inspect centering, corners, edges and surface before you buy a raw card or send one for grading — and what to photograph. No visible check guarantees a grade.",
    published: "2026-09-07",
  },
  {
    slug: "how-to-find-pokemon-card-set-and-number",
    title: "How to Find a Pokemon Card's Set and Number",
    blurb:
      "Where the collector number is printed, how to read it, and the cases that trip people up — Pokedex numbers, numbers above the printed total, and zero-padding. The number helps identify the card, not which printing you have.",
    published: "2026-09-12",
  },
  // Release guide for the 2026 anniversary expansion. `updated` is the
  // date the facts were last checked against the official pages (shown on
  // the page and used as Article.dateModified); `image` is the catalogue
  // (TCGplayer product) id of the card used for the social preview.
  // `sets` names the catalogue sets the guide is genuinely about, so the
  // set and card pages for those sets can link back to it (guideForSet).
  {
    slug: "pokemon-30th-celebration-guide",
    title: "Pokemon 30th Anniversary Cards: 30th Celebration Guide (2026)",
    shortTitle: "30th Celebration collector's guide",
    blurb:
      "The 2026 anniversary expansion explained: what it celebrates, how it differs from Celebrations (2021), the 30 Pikachu rares, the Futuristic rares, the Classic Collection reprints, every announced product and its release wave, and how to tell the right printing apart when you buy.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "696688",
    sets: ["ME: 30th Celebration", "ME: 30th Celebration Classic Collection"],
  },
  // 30th Celebration companion articles. Each answers a different reader
  // question and links back to the guide above, which stays the overview.
  // Only the guide above declares `sets` - one guide per set is what the
  // set and card pages link to.
  {
    slug: "pokemon-30th-celebration-pikachu-checklist",
    title: "All 30 Pikachu Cards in 30th Celebration: Visual Checklist",
    shortTitle: "30th Celebration Pikachu checklist",
    blurb:
      "Every one of the thirty Pikachu rare cards from 023/128 to 052/128, shown in printed order and linked to its own page, plus the Pikachu cards in the release that do not count towards the run.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "712934",
  },
  {
    slug: "best-pokemon-30th-celebration-pikachu-cards",
    title: "Best Pikachu Artwork in 30th Celebration: Our Picks",
    shortTitle: "Best 30th Celebration Pikachu artwork",
    blurb:
      "Our editorial pick of the best-looking Pikachu cards in the anniversary set, with the criteria we used - a selection based on the illustrations, not on value, rarity or pull rates.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "712953",
  },
  {
    slug: "pokemon-30th-celebration-classic-collection",
    title: "30th Celebration Classic Collection: Reprint or Original?",
    shortTitle: "Classic Collection reprints explained",
    blurb:
      "Classic Collection cards keep their original set numbers, so a 2026 reprint and a 1999 card can both read 4/102. How to tell them apart, and the thirty reprints we track.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "714372",
  },
  {
    slug: "pokemon-30th-celebration-elite-trainer-box",
    title: "30th Celebration Elite Trainer Box vs Pokemon Center ETB",
    shortTitle: "30th Celebration ETB comparison",
    blurb:
      "The standard Elite Trainer Box and the Pokemon Center version compared line by line from their official contents lists: two extra packs, a second Nidorina promo, and nothing else.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "696688",
  },
  {
    slug: "pokemon-30th-celebration-promo-cards",
    title: "30th Celebration Promo Cards: Which Product Has Which",
    shortTitle: "30th Celebration promos by product",
    blurb:
      "Every guaranteed promo card in the anniversary lineup and the product it ships in, from the official showcase - and why a promo is never something you can pull from a booster pack.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "696687",
  },
  {
    slug: "pokemon-30th-celebration-release-dates",
    title: "30th Celebration Release Dates: UK and US Schedules",
    shortTitle: "30th Celebration release dates",
    blurb:
      "The expansion released worldwide on 16 September 2026, but the products did not. The official UK and US schedules side by side, including the two products they disagree on.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "712953",
  },
  {
    slug: "pokemon-30th-celebration-mew-mewtwo",
    title: "Mew and Mewtwo in 30th Celebration: The Futuristic Rares",
    shortTitle: "Mew and Mewtwo, and the Futuristic rares",
    blurb:
      "The set's brand-new rarity is a Mewtwo ex and a Mew ex designed by YOSHIROTTEN. What a Futuristic rare is, and all six Mew and Mewtwo cards in the release - four of which share a name.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "696687",
  },
  {
    slug: "best-pokemon-30th-celebration-cards",
    title: "The Best 30th Celebration Cards Beyond Pikachu",
    shortTitle: "Best 30th Celebration cards beyond Pikachu",
    blurb:
      "Our editorial pick of the illustration rares, special illustration rares and ex cards worth chasing in the anniversary set, with the criteria we used. Not a value or rarity ranking.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "696683",
  },
  {
    slug: "organise-pokemon-30th-celebration-collection",
    title: "How to Organise a 30th Celebration Collection",
    shortTitle: "Organising a 30th Celebration collection",
    blurb:
      "The set splits into five groups that need handling differently, and there is no official definition of a master set. How to structure a collection and decide what finished means.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "716231",
  },
  // Price-intent guides. Search Console shows "price" / "value" / "worth"
  // as the dominant query shape on this site, and "shadowless arcanine"
  // as its single most-seen query: these answer the procedure and the
  // printing question directly, and link the card pages that rank for it.
  {
    slug: "how-much-is-my-pokemon-card-worth",
    title: "How Much Is My Pokemon Card Worth? A Working Method",
    shortTitle: "How much is my card worth",
    blurb:
      "The six things to read off a card - number, set, printing, language, condition, graded or raw - and how each one changes which market reference applies, so you price the card you are actually holding.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "42382",
  },
  {
    slug: "base-set-shadowless-unlimited-first-edition",
    title: "Base Set Shadowless vs Unlimited vs 1st Edition: How to Tell",
    shortTitle: "Base Set printings explained",
    blurb:
      "The 1999 Base Set was printed three ways, and three of the four Base Set printings share a collector number. The tells that separate them - the art-frame shadow, the HP weight, the copyright line, the stamp - checked against our own scans.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "106999",
  },
  {
    slug: "spotting-fake-pokemon-cards-in-listings",
    title: "Spotting Fake Pokemon Cards in a Listing",
    shortTitle: "Checking a listing for fakes",
    blurb:
      "How to assess a suspicious listing before you buy - what a photo can actually show, the legitimate printing differences that get mistaken for fakes, the extra photos worth asking a seller for, and when to stop guessing and pay an authenticator.",
    published: "2026-09-17",
    updated: "2026-09-17",
    image: "106999",
  },
  // Delta Reign pre-launch cluster (2026-09-20) - the next English
  // expansion, 6 November 2026. Written BEFORE release, from the official
  // expansion page + announcement and dated reporting, in the pattern the
  // 30th Celebration cluster proved. No product lineup guide: neither
  // official page lists products yet, so none is asserted. No Delta Reign
  // card is in the catalogue; `image` is the Rayquaza we do hold.
  {
    slug: "pokemon-delta-reign-release-date-what-is-official",
    title: "Delta Reign Release Date: What Is Official So Far",
    shortTitle: "Delta Reign: what is official",
    blurb:
      "Mega Evolution—Delta Reign releases on 6 November 2026. What the official pages state (the date, 'over 135 cards', four named Mega ex), what is only reported, and what nobody knows yet.",
    published: "2026-09-20",
    updated: "2026-09-20",
    image: "675965",
  },
  {
    slug: "storm-emeralda-vs-delta-reign-japanese-or-english",
    title: "Storm Emeralda vs Delta Reign: Japanese Now or English in November?",
    shortTitle: "Japanese now or English in November",
    blurb:
      "The Japanese source set has been on sale since 31 July. Why a Storm Emeralda card is a different product from the Delta Reign card that follows it, how to tell a listing apart, and how to decide.",
    published: "2026-09-20",
    updated: "2026-09-20",
    image: "675965",
  },
  {
    slug: "delta-reign-preorders-and-prerelease-what-to-know",
    title: "Delta Reign Preorders and Prerelease: What to Know Before 6 November",
    shortTitle: "Delta Reign preorders and prerelease",
    blurb:
      "What a sealed 'Delta Reign' listing is today, what a prerelease card is, why this site holds unreleased-set listings until eBay confirms them, and the listing wording to be careful of.",
    published: "2026-09-20",
    updated: "2026-09-20",
    image: "675965",
  },
  // GEO audit 2026-09-19 - the buyer-intent cluster: the questions people
  // put to a search engine or an AI assistant just before they buy on
  // eBay. Each ends on a live-offer surface; none states a price.
  {
    slug: "buying-pokemon-cards-on-ebay-safely",
    title: "Is It Safe to Buy Pokemon Cards on eBay? A Buyer's Checklist",
    shortTitle: "Buying on eBay safely",
    blurb:
      "What eBay's own protections cover, the listing details to read before you bid, the seller signals that matter, what a below-market price does and does not tell you, and what this site checks (and cannot check) for you.",
    published: "2026-09-19",
    updated: "2026-09-19",
  },
  {
    slug: "how-to-read-a-pokemon-card-listing",
    title: "How to Read a Pokemon Card Listing: Total, Shipping, Condition, Reference",
    shortTitle: "Reading a listing",
    blurb:
      "The four numbers and three labels on every listing here, in the order to read them: what the listing total includes, when shipping is unknown, what the condition pill can and cannot promise, and how the market reference is labelled.",
    published: "2026-09-19",
    updated: "2026-09-19",
  },
  {
    slug: "vintage-pokemon-cards-worth-buying",
    title: "Which Vintage Pokemon Cards Are Worth Buying, and What a Fair Price Looks Like",
    shortTitle: "Vintage cards worth buying",
    blurb:
      "How to choose a vintage (1999-2003) card to buy: printing first, condition second, reference third. The WOTC-era sets and printings that hold collector demand, the traps, and how to read a fair price off a card page instead of a forum.",
    published: "2026-09-19",
    updated: "2026-09-19",
  },
  {
    slug: "pokemon-booster-box-prices",
    title: "Pokemon Booster Box Prices: What MSRP Means, Why Resale Differs, and How to Check a Sealed Listing",
    shortTitle: "Booster box prices",
    blurb:
      "How a booster box is priced at retail, why the same box sells for more or less than that on eBay, what 'sealed' has to mean, and how to check a sealed listing before you pay. No price table - prices move; the live pages carry them.",
    published: "2026-09-19",
    updated: "2026-09-19",
  },
  {
    slug: "pokemon-promo-card-numbers",
    title: "Pokemon Promo Card Numbers Explained: SWSH, SVP, BW, XY",
    shortTitle: "Promo card numbers explained",
    blurb:
      "How promo numbering works era by era - black star, DP, HGSS, BW, XY, SM, SWSH, SVP - with a real card from each, plus the three kinds of promo that keep a set number instead.",
    published: "2026-09-16",
    updated: "2026-09-16",
    image: "220271",
  },
  // --- Buying-decision batch (2026-09-22) -------------------------------
  // Written after a competitor content audit found the gap was not basic
  // Pokemon education - that is well covered above - but BUYING DECISIONS
  // for established sets: which product, which printing, which exact card.
  //
  // Every set, card and product named in these guides is a real row in
  // card_catalog / sealed_catalog, read on 2026-09-22. None of them
  // hard-codes a market price: prices move, and the live pages carry them.
  // No pull rates, no expected-value model, no condition multipliers -
  // those need data this site does not hold.
  {
    slug: "pokemon-151-buying-guide",
    title: "Pokemon 151 Buying Guide: Singles, Bundles or an ETB?",
    shortTitle: "151: which way to buy",
    blurb:
      "Four buying routes into Scarlet & Violet 151 and who each one suits, plus the verified contents of the two different 151 Elite Trainer Boxes - nine packs and one promo, or eleven and two.",
    published: "2026-09-22",
    updated: "2026-09-22",
    sets: ["SV: Scarlet & Violet 151"],
  },
  {
    slug: "booster-box-vs-etb-vs-booster-bundle",
    title: "Booster Box vs ETB vs Booster Bundle: Which Should You Buy?",
    shortTitle: "Box vs ETB vs bundle",
    blurb:
      "Six real products compared on pack count, promos and accessories from their own official pages - including three Elite Trainer Boxes holding nine, ten and eleven packs.",
    published: "2026-09-22",
    updated: "2026-09-22",
  },
  {
    slug: "check-graded-pokemon-card-certificate",
    title: "How to Check a Graded Pokemon Card Before Buying",
    shortTitle: "Checking a graded card",
    blurb:
      "The certificate lookup, what to match against the slab, and - the part most guides skip - what a successful lookup does not prove. PSA warns that real cert numbers get copied onto counterfeit inserts.",
    published: "2026-09-22",
    updated: "2026-09-22",
  },
  {
    slug: "japanese-vs-english-pokemon-cards",
    title: "Japanese vs English Pokemon Cards: A Buyer's Guide",
    shortTitle: "Japanese vs English",
    blurb:
      "Which card languages are legal at Play! Pokemon events, why Japanese card backs are treated as marked, and why a Japanese listing is a different card rather than a cheaper one.",
    published: "2026-09-22",
    updated: "2026-09-22",
  },
  {
    slug: "prismatic-evolutions-buying-guide",
    title: "Prismatic Evolutions Buying Guide: Products and Printings",
    shortTitle: "Prismatic: products and printings",
    blurb:
      "Three different Elite Trainer Boxes, and three different cards sharing the collector number 059/131. Which Umbreon you are actually buying, and how to tell before you pay.",
    published: "2026-09-22",
    updated: "2026-09-22",
    sets: ["SV: Prismatic Evolutions"],
  },
  {
    slug: "holo-vs-reverse-holo-pokemon-cards",
    title: "Holo or Reverse Holo? Check the Listing's Printing",
    shortTitle: "Check a listing's printing",
    blurb:
      "One collector number can cover a plain printing, a reverse holo and pattern printings - separate cards at separate prices. How to make a listing tell you which one it is selling.",
    published: "2026-09-22",
    updated: "2026-09-22",
  },
  {
    slug: "crown-zenith-galarian-gallery-guide",
    title: "Crown Zenith and Galarian Gallery: A Buying Guide",
    shortTitle: "Crown Zenith & Galarian Gallery",
    blurb:
      "Galarian Gallery is a subset with its own numbering (GG01/GG70 upward) and almost entirely premium rarities. What that means for collecting scope, and for reading a Crown Zenith listing.",
    published: "2026-09-22",
    updated: "2026-09-22",
    sets: ["SWSH: Crown Zenith"],
  },
  {
    slug: "surging-sparks-which-pikachu",
    title: "Surging Sparks: Which Pikachu and Which Product?",
    shortTitle: "Surging Sparks: which Pikachu",
    blurb:
      "Four different Pikachu ex cards at four collector numbers and four rarities. 'The Surging Sparks Pikachu' names none of them - here is how to say which one you want.",
    published: "2026-09-22",
    // No `updated`: every claim in this guide is a statement about our
    // own catalogue records, checked first-party. No official source
    // was read for it, so it carries no official-verification date.
    sets: ["SV08: Surging Sparks"],
  },
  {
    slug: "complete-set-vs-master-set",
    title: "Complete Set vs Master Set: Plan What You Want to Collect",
    shortTitle: "Complete set vs master set",
    blurb:
      "There is no single official definition of a master set. This is how to write down your own inclusion list - parallels, promos, subsets - before you start buying against it.",
    published: "2026-09-22",
    // No `updated`: the guide's subject is that no official definition
    // of a master set exists, so there is no official source to check
    // it against and none is claimed.
  },
];

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

// Growth batch 2026-09-20 - which catalogue SET a guide's live-offers
// module draws from (components/guides/GuideLiveOffers, rendered once by
// GuideLayout). Explicit, not inferred: the 30th Celebration cluster is
// about one set that has live listings; the evergreen guides and the
// pre-release Delta Reign guides (no set yet) get no module. A guide that
// declares `sets` (guideForSet) uses its first set. Measurement: PostHog
// affiliate_click origin_section "guide_offers" (was: guides produced 218
// page views and 0 affiliate clicks in the 28 days to 2026-09-19).
const OFFERS_SET_BY_SLUG = Object.freeze({
  "pokemon-30th-celebration-pikachu-checklist": "ME: 30th Celebration",
  "best-pokemon-30th-celebration-pikachu-cards": "ME: 30th Celebration",
  "pokemon-30th-celebration-classic-collection": "ME: 30th Celebration",
  "pokemon-30th-celebration-elite-trainer-box": "ME: 30th Celebration",
  "pokemon-30th-celebration-promo-cards": "ME: 30th Celebration",
  "pokemon-30th-celebration-release-dates": "ME: 30th Celebration",
  "pokemon-30th-celebration-mew-mewtwo": "ME: 30th Celebration",
  "best-pokemon-30th-celebration-cards": "ME: 30th Celebration",
  "organise-pokemon-30th-celebration-collection": "ME: 30th Celebration",
});
export function guideOffersSet(g) {
  if (!g) return null;
  return g.sets?.[0] ?? OFFERS_SET_BY_SLUG[g.slug] ?? null;
}

// The guide written about a specific catalogue set, or null. Matching is on
// the exact set name the catalogue uses (the same string the set page and
// the card records carry), never a fuzzy or partial match - a guide about
// "ME: 30th Celebration" must not attach itself to "Celebrations". Returns
// the registry entry, so callers get the real title and can link it without
// hand-typing a URL.
export function guideForSet(setName) {
  const s = String(setName ?? "").trim();
  if (!s) return null;
  return GUIDES.find((g) => (g.sets ?? []).some((x) => x.toLowerCase() === s.toLowerCase())) ?? null;
}

// The short label for a guide in a link or chip; falls back to the full
// title so a guide without a shortTitle still reads correctly.
export function guideLinkLabel(g) {
  return g?.shortTitle ?? g?.title ?? "";
}

const SITE_URL = "https://pokemondealfinder.com";

export function guideMetadata(slug) {
  const g = getGuide(slug);
  if (!g) return {};
  // A guide with a catalogue image gets it as its social preview - a real
  // card scan from the same CDN the card pages use, never generated art.
  const image = g.image ? `https://tcgplayer-cdn.tcgplayer.com/product/${g.image}_in_1000x1000.jpg` : null;
  return {
    title: g.title,
    description: g.blurb,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: { title: g.title, description: g.blurb, url: `${SITE_URL}/guides/${slug}`, type: "article", ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: g.title, description: g.blurb, ...(image ? { images: [image] } : {}) },
  };
}
