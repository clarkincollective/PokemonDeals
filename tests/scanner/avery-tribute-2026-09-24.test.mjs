// The Avery the Poke Kid tribute article (2026-09-24).
//
// A tribute has obligations the rest of the site does not: it must carry no
// commercial module of any kind, it must not republish material we have no
// licence to, and every fact in it has to be the one the sources actually
// support. These are the checks that would catch a later edit quietly
// breaking any of that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NEWS, getNewsItem, newsImageUrl, newsMetadata } from "../../lib/news.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const SLUG = "remembering-avery-the-poke-kid";
const item = getNewsItem(SLUG);

// The article body, isolated from the other stories in the same file.
const bodies = read("components/news/NewsBodies.js");
const BODY = bodies.slice(bodies.indexOf("function AveryTribute()"), bodies.indexOf("export const NEWS_BODIES"));

// === 1. it exists, in News, with a body ================================

test("AT-1. the article is registered in News with a body and a real date", () => {
  assert.ok(item, "the registry entry exists");
  assert.equal(item.kind, "story");
  assert.match(bodies, new RegExp(`"${SLUG}": AveryTribute`), "the body is registered in NEWS_BODIES");
  assert.ok(BODY.length > 1500, "the body was located in the source");
  // published, never back- or future-dated (the news suite checks the rule
  // for every item; this pins THIS article's date so an edit cannot move it)
  assert.equal(item.published, "2026-09-24");
  assert.equal(item.updated, undefined);
  // News, not Guides or Market Data
  assert.ok(NEWS.some((n) => n.slug === SLUG));
});

// === 2. no commercial module anywhere in the tribute ===================

test("AT-2. the article carries no affiliate link, price, shopping CTA or email capture", () => {
  for (const banned of [
    "AffiliateLink",
    "EbaySearchLink",
    "EmailCapture",
    "buildEbaySearchLink",
    "wrapEbayAffiliateUrl",
    "customid",
    "campid",
    "ebay.com",
    "Price",
    "discount",
  ]) {
    assert.ok(!BODY.includes(banned), `the tribute body must not contain ${banned}`);
  }
  // no price or money figure in the prose
  assert.doesNotMatch(BODY, /\$\d|£\d|€\d|\d+% (below|off)|market price|cheapest|buy now|shop/i);
});

test("AT-3. the news route itself renders no commercial module, so none had to be suppressed", () => {
  // If this ever stops being true, the tribute needs an explicit opt-out
  // rather than relying on the route being clean.
  const route = read("app/news/[slug]/page.js");
  for (const banned of ["AffiliateLink", "EbaySearchLink", "EmailCapture", "DealCard", "DealGrid"]) {
    assert.ok(!route.includes(banned), `the news route must not render ${banned}`);
  }
});

test("AT-4. the card image is not a link to a page that sells the card", () => {
  // The catalogue figure is deliberately unlinked: /cards/<slug> carries a
  // market price and live listings, and a tribute does not route a reader
  // to a shopping surface.
  const fig = bodies.slice(bodies.indexOf("function TributeCardFigure"), bodies.indexOf("function SourceCard"));
  assert.doesNotMatch(fig, /<Link|href=/, "the card figure must not link anywhere");
  assert.match(fig, /catalogImageUrl\(tcgplayerId\)/);
});

// === 3. the exact card ================================================

test("AT-5. the card is the exact Jirachi ex that was pulled, named in full", () => {
  // Jirachi ex, 155/128, special illustration rare, 30th Celebration,
  // illustrated by AKIRA EGAWA - verified against the site's own catalogue
  // row (tcgplayer_id 716232) and pocketmonsters.net's card entry.
  assert.match(BODY, /tcgplayerId="716232"/);
  assert.match(BODY, /Jirachi ex — 155\/128, 30th Celebration/);
  assert.match(BODY, /Special illustration rare/);
  assert.match(BODY, /AKIRA EGAWA/);
  assert.match(BODY, /Card artwork © Pokemon/);
  // the registry's preview image is that same card, not some other Jirachi
  assert.equal(item.image, "716232");
  assert.equal(newsImageUrl(item), "https://tcgplayer-cdn.tcgplayer.com/product/716232_in_1000x1000.jpg");
});

test("AT-6. the card image has descriptive alt text and reserved dimensions", () => {
  assert.match(BODY, /alt="Jirachi ex, card 155 of 128[^"]+Complete card face\."/);
  const fig = bodies.slice(bodies.indexOf("function TributeCardFigure"), bodies.indexOf("function SourceCard"));
  assert.match(fig, /const height = Math\.round\(\(width \* 1000\) \/ 717\)/, "height derived from the real scan aspect");
  assert.match(fig, /width=\{width\}[\s\S]*height=\{height\}/, "both dimensions passed, so no layout shift");
  assert.match(fig, /sizes=/, "responsive sizing");
});

// === 4. nothing is republished without a licence =======================

test("AT-7. no photograph of Avery is hosted, rehosted or hotlinked", () => {
  // We hold no licence to reproduce the family's images, and a publicly
  // visible photo is not a licence. The article links to their post instead.
  assert.doesNotMatch(BODY, /PhotoFigure|imageSrc|\.jpg|\.jpeg|\.png|\.webp/i);
  assert.equal(item.imageSrc, undefined, "no hosted image file for this article");
  assert.doesNotMatch(BODY, /cdninstagram|fbcdn|polygon\.com\/static|platform\.instagram/i);
  // and the article says plainly why
  assert.match(BODY, /no licence to reproduce the family's photographs or video/);
});

test("AT-8. the Open Graph image is the card, never Avery", () => {
  const meta = newsMetadata(SLUG);
  const og = meta.openGraph.images[0];
  assert.equal(og, "https://tcgplayer-cdn.tcgplayer.com/product/716232_in_1000x1000.jpg");
  assert.doesNotMatch(og, /instagram|avery|photo/i);
});

test("AT-9. the family's video is a plain link, with no third-party script or iframe", () => {
  // An embed would pull in a third-party script; this site is cookieless by
  // design and the brief forbade adding tracking. A link cannot fail to
  // load and leave a hole in the article either.
  assert.doesNotMatch(BODY, /<iframe|blockquote class="instagram|embed\.js|platform\.twitter|widgets\.js|<script/i);
  assert.match(BODY, /https:\/\/www\.instagram\.com\/averythepokekid\/reel\/DdmDjLKppsn\//);
  assert.match(BODY, /rel="noopener noreferrer"/);
});

// === 5. the facts, as the sources support them =========================

test("AT-10. the date of death is stated, and is not the announcement date", () => {
  assert.match(BODY, /died on 18 September 2026/);
  assert.match(BODY, /announced his death that evening/);
  // the family shared the video later, and the article says so
  assert.match(BODY, /On 22 September, four days after his death/);
});

test("AT-11. the video is described the way the family described it", () => {
  // "the video his family shared as his final pack opening", never an
  // independently asserted "last card he ever pulled".
  assert.match(BODY, /the video his family\s*\n?\s*shared as his final pack opening/);
  assert.match(BODY, /not a claim of ours about the last card he ever/);
  assert.doesNotMatch(BODY, /the last card he ever pulled/);
  assert.match(item.blurb, /The video his family shared as his final pack opening/);
});

test("AT-12. no claim of a personal relationship, and no invented quote", () => {
  assert.match(BODY, /We did not know Avery/);
  // every quoted string in the body belongs to a source we linked
  const quoted = [...BODY.matchAll(/&ldquo;([\s\S]*?)&rdquo;/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.ok(quoted.length >= 2, "the Egawa quotes are present");
  for (const q of quoted) {
    assert.ok(
      /I want my art to bring happiness|I&apos;m so deeply moved/.test(q),
      `unattributed quotation in the tribute: ${q}`
    );
  }
  // the artist's remarks are attributed, and flagged as reported in English
  assert.match(BODY, /In remarks\s*\n?\s*reported in English/);
});

test("AT-13. tone: no sensationalism, no investment language, no medical detail beyond the fact", () => {
  assert.doesNotMatch(
    `${item.title} ${item.blurb} ${BODY}`,
    /heartbreaking|devastating|tragic|shocking|you won't believe|tear-jerk|final moments|brave battle|lost his fight/i
  );
  assert.doesNotMatch(`${item.title} ${item.blurb} ${BODY}`, /invest|value of|worth \$|skyrocket|soar|profit|flip/i);
  // the illness is referred to once, without clinical detail
  assert.doesNotMatch(BODY, /pancreatoblastoma|stage 4|stage IV|hospice|tumor|tumour|chemotherapy/i);
});

test("AT-14. site spelling in our own copy; the artist's name is kept as printed", () => {
  // the accented form must not appear in our prose
  const prose = BODY.replace(/江川あきら/g, "");
  assert.doesNotMatch(prose, /Pokémon/);
  assert.match(BODY, /江川あきら/, "the illustrator's name is kept as credited");
});

// === 6. sources =======================================================

test("AT-15. the source list carries the primary sources and the reporting", () => {
  const hrefs = item.sources.map((s) => s.href);
  for (const must of [
    "https://www.instagram.com/averythepokekid/reel/DdmDjLKppsn/",
    "https://x.com/rev_akira/status/2102582296176181569",
    "https://x.com/rev_akira/status/2102585071740027230",
    "https://www.polygon.com/pokemon-avery-the-poke-kid-jirachi-30th-tcg-akira-egawa-beard-dad/",
    "https://pocketmonsters.net/tcg/card/27287",
  ]) {
    assert.ok(hrefs.includes(must), `missing source: ${must}`);
  }
  assert.equal(new Set(hrefs).size, hrefs.length, "no duplicate sources");
  for (const s of item.sources) {
    assert.match(s.href, /^https:\/\//);
    assert.ok(s.label && s.label.length > 8, `source needs a real label: ${s.href}`);
  }
  // reporting is labelled as reporting, not presented as our own
  assert.ok(item.sources.filter((s) => /reporting/i.test(s.label)).length >= 3);
});

test("AT-16. sources are linked beside the reporting, not only in the list", () => {
  assert.match(BODY, /x\.com\/rev_akira\/status\/2102582296176181569/);
  assert.match(BODY, /x\.com\/rev_akira\/status\/2102585071740027230/);
  assert.match(BODY, /instagram\.com\/averythepokekid/);
});

// === 7. metadata =======================================================

test("AT-17. metadata is self-canonical, factual and not keyword-stuffed", () => {
  const meta = newsMetadata(SLUG);
  assert.equal(meta.alternates.canonical, `/news/${SLUG}`);
  assert.equal(meta.openGraph.url, `https://pokemondealfinder.com/news/${SLUG}`);
  assert.equal(meta.openGraph.type, "article");
  assert.equal(meta.openGraph.publishedTime, "2026-09-24");
  assert.equal(meta.title, item.title);
  assert.ok(item.blurb.length <= 320, "description stays a concise summary");
  // no keyword stuffing: no term repeated more than twice in the blurb
  const words = item.blurb.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [w, c] of counts) {
    assert.ok(c <= 3, `"${w}" repeats ${c} times in the description`);
  }
});

test("AT-18. length is in the brief's range", () => {
  // the rendered prose only: JSX tags, class names and props are not words
  const text = BODY.replace(/\{"\s*"\}/g, " ") // JSX whitespace expressions
    .replace(/className=\{[^}]*\}|className="[^"]*"/g, " ")
    .replace(/(alt|caption|href|src|sizes|style|rel|target|note|label|tcgplayerId)=("[^"]*"|\{[^}]*\})/g, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ") // tags, after their attributes are gone
    .replace(/&[a-z]+;/g, "'")
    .replace(/\s+/g, " ");
  const words = text.split(" ").filter((w) => /[a-z]{2,}/i.test(w)).length;
  assert.ok(words >= 300 && words <= 700, `article is ${words} words`);
});
