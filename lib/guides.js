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
];

export function getGuide(slug) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

const SITE_URL = "https://pokemondealfinder.com";

export function guideMetadata(slug) {
  const g = getGuide(slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.blurb,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: { title: g.title, description: g.blurb, url: `${SITE_URL}/guides/${slug}`, type: "article" },
    twitter: { card: "summary", title: g.title, description: g.blurb },
  };
}
