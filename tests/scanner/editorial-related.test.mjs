// Guide <-> News cross-linking.
//
// The backlog item: news bodies cited a few guides inline, no guide pointed
// at the news, and neither page type had a place to put the connection. One
// curated cross-kind map (lib/editorialRelated) plus one block rendered from
// GuideLayout and the news route closes it.
//
// These tests pin the properties that keep it honest: every link resolves to
// a real published article, the map only ever crosses kinds, an article with
// no genuine counterpart gets nothing, and adding links changed no article's
// text, date or canonical.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { relatedReading, RELATED_KEYS, RELATED_MAP, MAX_RELATED } from "../../lib/editorialRelated.js";
import { GUIDES, getGuide } from "../../lib/guides.js";
import { NEWS, getNewsItem } from "../../lib/news.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");

const split = (key) => {
  const [kind, slug] = String(key).split(/:(.+)/);
  return { kind, slug };
};

test("1. every key and every target is a real published article", () => {
  assert.ok(RELATED_KEYS.length > 0);
  for (const key of RELATED_KEYS) {
    const { kind, slug } = split(key);
    assert.ok(kind === "guide" || kind === "news", `${key}: unknown kind`);
    const exists = kind === "guide" ? getGuide(slug) : getNewsItem(slug);
    assert.ok(exists, `${key}: not in the registry`);
    for (const target of RELATED_MAP[key]) {
      const t = split(target);
      const found = t.kind === "guide" ? getGuide(t.slug) : getNewsItem(t.slug);
      assert.ok(found, `${key} -> ${target}: target not in the registry`);
    }
  }
});

test("2. the map is CROSS-KIND only - guide-to-guide linking stays inline in the prose", () => {
  for (const key of RELATED_KEYS) {
    const from = split(key).kind;
    for (const target of RELATED_MAP[key]) {
      assert.notEqual(split(target).kind, from, `${key} -> ${target}: same-kind link belongs in the article text`);
    }
  }
});

test("3. resolved items carry the registry's own title and a derived href", () => {
  const items = relatedReading("guide", "pokemon-30th-celebration-guide");
  assert.ok(items.length >= 1);
  for (const item of items) {
    const n = getNewsItem(item.slug);
    assert.equal(item.title, n.title, "the title comes from the registry, never typed here");
    assert.equal(item.href, `/news/${item.slug}`);
    assert.equal(item.published, n.published, "a story shows its publication date");
  }
  const back = relatedReading("news", "pokemon-tcg-30th-celebration-out-now");
  for (const item of back) {
    assert.equal(item.title, getGuide(item.slug).title);
    assert.equal(item.href, `/guides/${item.slug}`);
    assert.equal(item.published, null, "a guide is not re-dated by a news block");
  }
});

test("4. an article with no genuine counterpart gets no block", () => {
  // 2026-09-20: the Delta Reign story now HAS genuine counterparts - its
  // three pre-launch guides - and reaches all of them, both directions
  const delta = relatedReading("news", "mega-evolution-delta-reign-what-is-known");
  assert.deepEqual(delta.map((i) => i.slug), ["pokemon-delta-reign-release-date-what-is-official", "storm-emeralda-vs-delta-reign-japanese-or-english", "delta-reign-preorders-and-prerelease-what-to-know"]);
  // 2026-09-23: a SECOND Delta Reign story (the English card reveal) joined
  // the cluster, so the release-date guide - the one whose whole subject is
  // what is official - now reaches both stories, newest first. The other two
  // guides are unchanged: the reveal does not bear on the Japanese-vs-English
  // choice or on preorders, and a block is only earned by a genuine
  // counterpart. The two stories link to each other inline in their own
  // prose, because this map is cross-kind only (test 2).
  assert.deepEqual(
    relatedReading("guide", "pokemon-delta-reign-release-date-what-is-official").map((i) => i.slug),
    ["delta-reign-english-cards-revealed", "mega-evolution-delta-reign-what-is-known"]
  );
  for (const g of ["storm-emeralda-vs-delta-reign-japanese-or-english", "delta-reign-preorders-and-prerelease-what-to-know"]) {
    assert.deepEqual(relatedReading("guide", g).map((i) => i.slug), ["mega-evolution-delta-reign-what-is-known"]);
  }
  // and the new story reaches guides, never another story
  const reveal = relatedReading("news", "delta-reign-english-cards-revealed");
  assert.ok(reveal.length > 0, "the card-reveal story should reach its guides");
  for (const i of reveal) assert.ok(i.href.startsWith("/guides/"), `${i.slug}: a news item must not link another news item here`);
  // an evergreen guide about no particular release still gets no block
  assert.deepEqual(relatedReading("guide", "how-pokemon-card-prices-work"), []);
  assert.deepEqual(relatedReading("news", "no-such-story"), []);
  const src = read("components/RelatedReading.js");
  assert.match(src, /if \(items\.length === 0\) return null;/, "an empty block renders nothing at all");
});

test("5. no page renders two of these blocks, and no article file carries its own", () => {
  const layout = read("components/GuideLayout.js");
  const newsRoute = read("app/news/[slug]/page.js");
  assert.equal((layout.match(/<RelatedReading/g) ?? []).length, 1);
  assert.equal((newsRoute.match(/<RelatedReading/g) ?? []).length, 1);
  assert.match(layout, /<RelatedReading kind="guide" slug=\{slug\} \/>/);
  assert.match(newsRoute, /<RelatedReading kind="news" slug=\{item\.slug\} \/>/);
  // every guide renders through the one layout; none imports the block itself
  for (const g of GUIDES) {
    const page = read(`app/guides/${g.slug}/page.js`);
    assert.doesNotMatch(page, /RelatedReading/, `${g.slug}: the block belongs to the layout`);
    assert.match(page, /GuideLayout/, `${g.slug}: renders through GuideLayout`);
  }
});

test("6. links are bounded and ordered, never a dump", () => {
  for (const key of RELATED_KEYS) {
    assert.ok(RELATED_MAP[key].length >= 1, `${key}: an empty list should be an absent key`);
    assert.ok(RELATED_MAP[key].length <= MAX_RELATED, `${key}: ${RELATED_MAP[key].length} links is a dump`);
    assert.equal(new Set(RELATED_MAP[key]).size, RELATED_MAP[key].length, `${key}: duplicate target`);
    assert.ok(!RELATED_MAP[key].includes(key), `${key}: links to itself`);
  }
});

test("7. every 30th Celebration guide now reaches the news, and both stories reach the guides", () => {
  const thirtieth = GUIDES.filter((g) => /30th-celebration/.test(g.slug)).map((g) => g.slug);
  assert.ok(thirtieth.length >= 9, `expected the 30th Celebration cluster, found ${thirtieth.length}`);
  for (const slug of thirtieth) {
    const items = relatedReading("guide", slug);
    assert.ok(items.length >= 1, `${slug}: no route to the news about its own release`);
    for (const item of items) assert.equal(item.kind, "news");
  }
  for (const slug of ["pokemon-tcg-30th-celebration-out-now", "rgb-mew-30th-celebration-unconfirmed"]) {
    const items = relatedReading("news", slug);
    assert.ok(items.length >= 3, `${slug}: too few guides`);
    for (const item of items) assert.equal(item.kind, "guide");
  }
});

test("8. adding links changed no article's text, date or canonical", () => {
  // the registries keep their own dates; nothing in the link layer writes them.
  // strip // comments: the files DESCRIBE what they refrain from touching, so
  // only executable code is asserted on
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
  const linkLayer = strip(read("lib/editorialRelated.js")) + strip(read("components/RelatedReading.js"));
  assert.doesNotMatch(linkLayer, /updated:\s*"/, "the link layer never sets an updated date");
  assert.doesNotMatch(linkLayer, /published:\s*"20/, "the link layer never sets a publication date");
  assert.doesNotMatch(linkLayer, /canonical/i);
  // and it only ever reads them
  assert.match(read("lib/editorialRelated.js"), /import \{ getGuide \} from "\.\/guides\.js";/);
  assert.match(read("lib/editorialRelated.js"), /import \{ getNewsItem \} from "\.\/news\.js";/);
  // the species experiment cohorts are untouched by this work
  assert.doesNotMatch(linkLayer, /SPECIES_PILOT_SEO23|SPECIES_CONTROL_SEO23|speciesCoverage/);
});

test("9. every rendered href points at a route that exists", () => {
  const slugs = new Set([...GUIDES.map((g) => `/guides/${g.slug}`), ...NEWS.map((n) => `/news/${n.slug}`)]);
  for (const key of RELATED_KEYS) {
    for (const item of relatedReading(split(key).kind, split(key).slug)) {
      assert.ok(slugs.has(item.href), `${item.href} is not a registered article route`);
    }
  }
  // the news route renders every registered story, and each guide has a page
  assert.match(read("app/news/[slug]/page.js"), /return NEWS\.map\(\(n\) => \(\{ slug: n\.slug \}\)\);/);
});
