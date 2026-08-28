// Editorial guides (brief Phase 19) - a small, fixed set of evergreen
// explainers, deliberately not a blog. Shared registry so the index page,
// the sitemap, and each guide page agree on slug / title / blurb.
//
// These are about the hobby and the market in general; how *this site*
// prices and matches listings lives on /methodology instead.

export const GUIDES_PUBLISHED = "2026-08-28";

export const GUIDES = [
  {
    slug: "how-pokemon-card-prices-work",
    title: "How Pokémon Card Prices Are Determined",
    blurb:
      "Supply, demand, and sold comps — plus the four card-specific things (condition, grade, edition, printing) that split one card into many prices.",
  },
  {
    slug: "card-condition-grading",
    title: "Pokémon Card Condition & Grading Explained",
    blurb:
      "The Near Mint-to-Damaged scale used for raw cards, and what a PSA, CGC, BGS, SGC, ACE or TAG number actually means.",
  },
  {
    slug: "raw-vs-graded-pokemon-cards",
    title: "Raw vs. Graded Pokémon Cards",
    blurb:
      "Why the same card can cost several times more in a graded slab, what grading costs and takes, and when it's worth doing.",
  },
  {
    slug: "vintage-vs-modern-pokemon-cards",
    title: "Vintage vs. Modern Pokémon Cards",
    blurb:
      "Rough eras from the 1999 Base Set to today, what drives value differently in each, and where the buying risks are.",
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
