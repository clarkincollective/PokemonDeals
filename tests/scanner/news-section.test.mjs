// Latest news section. Static + pure: no network.
//
// The rules that matter for this surface are editorial, not cosmetic. A
// news hub earns its place only while every item is real, dated, sourced
// and distinct from the evergreen pages; a stale or padded feed is worse
// for the site than no feed. These tests pin exactly that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { NEWS, newsSorted, getNewsItem, newsMetadata, formatNewsDate } from "../../lib/news.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test("1. every news item is real: unique slug, truthful date, and a body to render", () => {
  assert.ok(NEWS.length > 0, "the news registry is empty - the hub would be a dead page");
  const slugs = NEWS.map((n) => n.slug);
  assert.equal(new Set(slugs).size, slugs.length, `duplicate news slugs: ${slugs.join(", ")}`);

  const bodies = read("components/news/NewsBodies.js");
  for (const n of NEWS) {
    assert.match(n.slug, /^[a-z0-9-]+$/, `${n.slug}: slug is not url-safe`);
    assert.match(n.published, ISO_DATE, `${n.slug}: published is not an ISO date`);
    if (n.updated) {
      assert.match(n.updated, ISO_DATE, `${n.slug}: updated is not an ISO date`);
      assert.ok(n.updated >= n.published, `${n.slug}: updated predates published`);
    }
    assert.ok(["story", "report"].includes(n.kind), `${n.slug}: unknown kind ${n.kind}`);
    assert.ok(n.title && n.title.length > 10, `${n.slug}: no real title`);
    assert.ok(n.blurb && n.blurb.length >= 40, `${n.slug}: blurb too thin to be a real summary`);
    // a registry entry with no body renders an empty page
    if (n.kind === "story") {
      assert.ok(bodies.includes(`"${n.slug}"`), `${n.slug}: no body registered in NEWS_BODIES`);
    }
  }
});

test("2. no placeholder, no back-dating, no future-dating", () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const n of NEWS) {
    assert.ok(n.published <= today, `${n.slug}: published in the future (${n.published})`);
    assert.doesNotMatch(
      `${n.title} ${n.blurb}`,
      /coming soon|placeholder|lorem|TBD|TBA|watch this space/i,
      `${n.slug}: placeholder copy in the registry`
    );
  }
});

test("3. a written story carries its official sources", () => {
  for (const n of NEWS.filter((x) => x.kind === "story")) {
    assert.ok(Array.isArray(n.sources) && n.sources.length > 0, `${n.slug}: a story with no sources`);
    for (const s of n.sources) {
      assert.match(s.href, /^https:\/\//, `${n.slug}: source is not an https URL (${s.href})`);
      assert.ok(s.label && s.label.length > 4, `${n.slug}: source has no readable label`);
    }
  }
});

test("4. news never claims a price, a pull rate or stock", () => {
  // JSX wraps prose across lines, so a phrase like "are not guaranteed
  // values" can have a newline inside it. Collapse whitespace first or
  // these checks read half a sentence and misjudge it.
  const flat = (p) => read(p).replace(/\s+/g, " ");
  for (const [name, src] of [["NewsBodies", flat("components/news/NewsBodies.js")], ["news registry", flat("lib/news.js")]]) {
    assert.doesNotMatch(src, /\$\d/, `${name}: a hard-coded price`);
    assert.doesNotMatch(src, /\b\d+(\.\d+)?\s*%\s*(chance|odds|pull)/i, `${name}: a pull-rate claim`);
    assert.doesNotMatch(src, /in stock|sold out|limited stock|hurry|while stocks last/i, `${name}: a stock claim`);
    // An investment claim, but NOT the standard disclaimer that says the
    // opposite ("are not guaranteed values", "no guaranteed value").
    assert.doesNotMatch(src, /(?<!\b(?:not|never|no)\s)guaranteed (return|profit|value)/i, `${name}: an investment claim`);
    assert.doesNotMatch(src, /will (rise|increase|go up|be worth more|hold its value)/i, `${name}: a prediction about future value`);
  }
});

test("5. site spelling: Pokemon, never the accented form", () => {
  for (const f of ["lib/news.js", "components/news/NewsBodies.js", "app/news/page.js", "app/news/[slug]/page.js"]) {
    assert.doesNotMatch(read(f), /Pokémon/, `${f}: accented spelling`);
  }
});

test("6. news is a distinct surface: it signposts the evergreen pages, never restates them", () => {
  const hub = read("app/news/page.js");
  // the hub sends readers on to the standing pages
  for (const href of ["/latest-releases", "/market-data", "/guides"]) {
    assert.ok(hub.includes(href), `news hub does not link ${href}`);
  }
  // and the guides hub sends readers back
  assert.ok(read("app/guides/page.js").includes('href="/news"'), "guides hub does not link /news");
  // the 30th story defers to the guide rather than duplicating it
  const bodies = read("components/news/NewsBodies.js");
  assert.ok(bodies.includes("/guides/pokemon-30th-celebration-guide"), "the 30th story does not link its guide");
});

test("7. hub and item pages are indexable, self-canonical and structured", () => {
  const hub = read("app/news/page.js");
  const item = read("app/news/[slug]/page.js");
  for (const [name, src] of [["hub", hub], ["item", item]]) {
    assert.doesNotMatch(src, /noindex/i, `${name}: noindex on a page meant to rank`);
    assert.match(src, /BreadcrumbList/, `${name}: no BreadcrumbList JSON-LD`);
  }
  assert.match(hub, /alternates: \{ canonical: PATH \}/, "hub is not self-canonical");
  assert.match(hub, /"@type": "ItemList"/, "hub has no ItemList JSON-LD");
  assert.match(item, /"@type": "NewsArticle"/, "item has no NewsArticle JSON-LD");
  assert.match(item, /datePublished: item\.published/, "NewsArticle has no real datePublished");
  assert.match(item, /alternates: \{ canonical: `\/news\/\$\{slug\}` \}|newsMetadata\(/, "item metadata is not from the registry");
  // an unknown slug 404s rather than rendering an empty shell
  assert.match(item, /notFound\(\)/);
});

test("8. sitemap and nav carry the section", () => {
  const sitemap = read("lib/sitemap.js");
  assert.match(sitemap, /from "@\/lib\/news"/, "sitemap does not import the news registry");
  assert.match(sitemap, /\$\{SITE_URL\}\/news`/, "sitemap has no /news hub entry");
  assert.match(sitemap, /NEWS\.map/, "sitemap does not emit the individual news items");
  // lastmod must be the page's own date, never invented
  assert.match(sitemap, /lastmod: n\.updated \?\? n\.published/);
  const nav = read("lib/navLinks.js");
  assert.match(nav, /href: "\/news"/, "nav has no news entry");
  assert.ok(read("components/SiteFooter.js").includes('href: "/news"'), "footer has no news entry");
});

test("9. newsSorted is newest-first and the helpers behave", () => {
  const sorted = newsSorted();
  assert.equal(sorted.length, NEWS.length);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].published >= sorted[i].published, "newsSorted is not newest-first");
  }
  const first = NEWS[0];
  assert.equal(getNewsItem(first.slug)?.slug, first.slug);
  assert.equal(getNewsItem("no-such-item"), null);
  const md = newsMetadata(first.slug);
  assert.equal(md.alternates.canonical, `/news/${first.slug}`);
  assert.equal(md.openGraph.publishedTime, first.published);
  assert.deepEqual(newsMetadata("no-such-item"), {});
  // UTC formatting: the printed day never shifts with the reader's timezone
  assert.equal(formatNewsDate("2026-09-16"), "16 September 2026");
});

test("10. the weekly report generator is read-only and fails closed", () => {
  const p = "scripts/newsWeeklyReport.mjs";
  assert.ok(existsSync(join(ROOT, p)), "the weekly report generator is missing");
  const src = read(p);
  // read-only: no writes to the database
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/, "the generator writes to the database");
  // it must use the shared fail-closed movement gate, not its own maths
  assert.match(src, /fetchMovementForCard/, "the generator does not use the shared movement gate");
  assert.doesNotMatch(src, /Math\.random|faker|placeholder/i, "the generator invents data");
  // the artifact it emits is frozen and marked generated
  assert.match(src, /Object\.freeze/);
  assert.match(src, /GENERATED by scripts\/newsWeeklyReport\.mjs/);
  // and it is wired as a command
  assert.match(read("package.json"), /"news:weekly"/, "npm run news:weekly is not defined");
});
