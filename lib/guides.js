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
];

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
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
