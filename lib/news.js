// Latest news registry - dated items about new sets, new cards and card
// prices. Shared so the hub, the item pages and the sitemap agree.
//
// How this differs from its neighbours, so none of them duplicate another:
//   /news            - dated, time-sensitive: what happened, and when.
//   /guides          - evergreen explainers; a guide is not re-dated.
//   /latest-releases  - the standing list of the newest expansions.
//   /market-data     - fixed, dated studies with their own methodology.
// A news item SIGNPOSTS those pages; it never restates them at length.
//
// Two kinds of item:
//   kind: "story"  - written, and every non-obvious fact carries an
//                    official source in `sources`. Same rules as a guide:
//                    nothing invented, no price, pull-rate or stock claim.
//   kind: "report" - a generated market report. Its figures come from a
//                    frozen artifact in lib/newsReports/ emitted by
//                    scripts/newsWeeklyReport.mjs, never from a runtime
//                    read, so a published number cannot drift.
//
// An item is only listed here once it genuinely exists. There is no
// placeholder, no "coming soon" and no back-dating.

const SITE_URL = "https://pokemondealfinder.com";

export const NEWS = [
  {
    slug: "pokemon-tcg-30th-celebration-out-now",
    kind: "story",
    title: "Pokemon TCG 30th Celebration is out now",
    blurb:
      "The 30th-anniversary expansion released worldwide on 16 September 2026 - all-foil booster packs, a Pikachu rare in every pack, a new Futuristic rare and reprinted Classic Collection cards, with more products in October and November.",
    published: "2026-09-16",
    // The catalogue (TCGplayer product) id for the social preview image.
    image: "696688",
    sources: [
      { href: "https://tcg.pokemon.com/en-us/expansions/30th-celebration/", label: "Official expansion page" },
      { href: "https://www.pokemon.com/uk/news/get-ready-for-pokemon-tcg-30th-celebration", label: "Official announcement (UK, 1 June 2026)" },
      { href: "https://www.pokemon.com/uk/news/pokemon-tcg-30th-celebration-product-showcase", label: "Official product showcase (UK, 30 June 2026)" },
      { href: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/30th-celebration-elite-trainer-box", label: "Official Elite Trainer Box product page (US)" },
    ],
  },
];

// Newest first. Ties keep registry order, so two items published on the
// same day stay in the order they were written.
export function newsSorted() {
  return [...NEWS].sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
}

export function getNewsItem(slug) {
  return NEWS.find((n) => n.slug === slug) ?? null;
}

export function newsMetadata(slug) {
  const n = getNewsItem(slug);
  if (!n) return {};
  const image = n.image ? `https://tcgplayer-cdn.tcgplayer.com/product/${n.image}_in_1000x1000.jpg` : null;
  return {
    title: n.title,
    description: n.blurb,
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      title: n.title,
      description: n.blurb,
      url: `${SITE_URL}/news/${slug}`,
      type: "article",
      publishedTime: n.published,
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: n.title,
      description: n.blurb,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// Human date for display. UTC so the printed day never shifts with the
// reader's timezone.
export function formatNewsDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
