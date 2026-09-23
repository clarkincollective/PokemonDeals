// GUIDE <-> NEWS cross-links.
//
// The two editorial shapes were only linked one way: a few news bodies cite
// a guide mid-sentence, and no guide pointed at the news at all. A reader on
// the 30th Celebration guide had no route to the story that the set had
// actually released, and the release story had no route to the nine other
// guides about the same set.
//
// DELIBERATELY HAND-CURATED, and CROSS-KIND ONLY. Guide-to-guide linking
// already exists inline, written into each guide's prose where it belongs;
// this adds the one direction that was missing, and nothing else. There is
// no automatic "same tag" inference: two articles are connected here only
// when a person decided they cover the same release, product or question.
// An article with no genuine counterpart gets NO block rather than a
// stretched one (the Delta Reign story linked nowhere until its pre-launch
// guides existed, 2026-09-20).
//
// Titles and hrefs are RESOLVED from lib/guides and lib/news, never typed
// here, so a retitled article cannot leave a stale label behind; a slug that
// stops existing drops out silently and the test below fails loudly.
//
// Adding a link here changes no article's text, date or canonical. It is
// navigation, not an edit: nothing in this file touches `published` or
// `updated`.

import { getGuide } from "./guides.js";
import { getNewsItem } from "./news.js";

const MAX_RELATED = 4;

// key: "<kind>:<slug>" -> ordered list of "<kind>:<slug>" of the OTHER kind.
const RELATED = Object.freeze({
  // --- 30th Celebration guides -> the stories about that release --------
  "guide:pokemon-30th-celebration-guide": ["news:pokemon-tcg-30th-celebration-out-now", "news:rgb-mew-30th-celebration-unconfirmed"],
  "guide:pokemon-30th-celebration-release-dates": ["news:pokemon-tcg-30th-celebration-out-now"],
  "guide:pokemon-30th-celebration-elite-trainer-box": ["news:pokemon-tcg-30th-celebration-out-now"],
  "guide:pokemon-30th-celebration-promo-cards": ["news:pokemon-tcg-30th-celebration-out-now"],
  "guide:pokemon-30th-celebration-classic-collection": ["news:pokemon-tcg-30th-celebration-out-now"],
  "guide:pokemon-30th-celebration-pikachu-checklist": ["news:pokemon-tcg-30th-celebration-out-now"],
  "guide:best-pokemon-30th-celebration-cards": ["news:pokemon-tcg-30th-celebration-out-now", "news:rgb-mew-30th-celebration-unconfirmed"],
  "guide:best-pokemon-30th-celebration-pikachu-cards": ["news:pokemon-tcg-30th-celebration-out-now"],
  "guide:organise-pokemon-30th-celebration-collection": ["news:pokemon-tcg-30th-celebration-out-now"],
  // the RGB Mew story is about Mew cards in this set, so it leads here
  "guide:pokemon-30th-celebration-mew-mewtwo": ["news:rgb-mew-30th-celebration-unconfirmed", "news:pokemon-tcg-30th-celebration-out-now"],

  // --- the stories -> the guides that explain the same set --------------
  "news:pokemon-tcg-30th-celebration-out-now": [
    "guide:pokemon-30th-celebration-guide",
    "guide:pokemon-30th-celebration-release-dates",
    "guide:best-pokemon-30th-celebration-cards",
    "guide:pokemon-30th-celebration-elite-trainer-box",
  ],
  "news:rgb-mew-30th-celebration-unconfirmed": [
    "guide:pokemon-30th-celebration-mew-mewtwo",
    "guide:pokemon-30th-celebration-guide",
    "guide:best-pokemon-30th-celebration-cards",
  ],
  // --- Delta Reign (2026-09-20): the pre-launch guides and the story about
  // the same release, both directions.
  // 2026-09-23: the card-reveal story joins the cluster. The release-date
  // guide gets it first, because that guide is the one that says what is
  // official - and the reveal moved several claims from "reported" to
  // "official", including the numbering it said had not been published.
  "guide:pokemon-delta-reign-release-date-what-is-official": [
    "news:delta-reign-english-cards-revealed",
    "news:mega-evolution-delta-reign-what-is-known",
  ],
  "guide:storm-emeralda-vs-delta-reign-japanese-or-english": ["news:mega-evolution-delta-reign-what-is-known"],
  "guide:delta-reign-preorders-and-prerelease-what-to-know": ["news:mega-evolution-delta-reign-what-is-known"],
  "news:mega-evolution-delta-reign-what-is-known": [
    "guide:pokemon-delta-reign-release-date-what-is-official",
    "guide:storm-emeralda-vs-delta-reign-japanese-or-english",
    "guide:delta-reign-preorders-and-prerelease-what-to-know",
  ],
  // The two Delta Reign stories link to EACH OTHER inline in their own
  // prose, not here: this map is cross-kind only, so a news-to-news pair
  // belongs in the article text where it can be introduced properly.
  "news:delta-reign-english-cards-revealed": [
    "guide:pokemon-delta-reign-release-date-what-is-official",
    "guide:delta-reign-preorders-and-prerelease-what-to-know",
  ],
});

function resolve(key) {
  const [kind, slug] = String(key).split(/:(.+)/);
  if (kind === "guide") {
    const g = getGuide(slug);
    return g ? { kind, slug, title: g.title, href: `/guides/${slug}`, blurb: g.blurb ?? null, published: null } : null;
  }
  if (kind === "news") {
    const n = getNewsItem(slug);
    return n ? { kind, slug, title: n.title, href: `/news/${slug}`, blurb: n.blurb ?? null, published: n.published ?? null } : null;
  }
  return null;
}

// The related items for one editorial page, already resolved and capped.
// Empty array = show nothing (no empty heading, no "see also" placeholder).
export function relatedReading(kind, slug) {
  const keys = RELATED[`${kind}:${slug}`] ?? [];
  return keys.map(resolve).filter(Boolean).slice(0, MAX_RELATED);
}

// Exported for the test: every key and every target must resolve.
export const RELATED_KEYS = Object.freeze(Object.keys(RELATED));
export const RELATED_MAP = RELATED;
export { MAX_RELATED };
