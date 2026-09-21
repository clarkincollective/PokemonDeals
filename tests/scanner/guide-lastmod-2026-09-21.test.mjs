// 2026-09-21 SEO audit follow-up. /sitemaps/pages.xml carried <lastmod>
// on only 3 of its 67 URLs: the news items. Guides had none at all, even
// though each is a fixed, dated editorial page whose own published /
// updated date IS its last modification - the same mapping news already
// used.
//
// The rule protected here is the TRUTHFULNESS of lastmod, not its
// presence:
//   * a guide with no date of its own gets NO lastmod - the shared
//     GUIDES_PUBLISHED launch constant is not a per-page modification date
//   * the reference-price study still gets none - its observation window
//     describes the DATA, not when the page changed
//
// lib/sitemap.js imports next/cache, so it cannot be executed here. The
// mapping is checked at source and the real GUIDES data is checked
// directly; the runtime result is verified against production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES, GUIDES_PUBLISHED } from "../../lib/guides.js";

const src = readFileSync(new URL("../../lib/sitemap.js", import.meta.url), "utf8");
const guidesBlock = src.slice(src.indexOf("...GUIDES.map("), src.indexOf("{ loc: `${SITE_URL}/news`"));

test("a guide's lastmod is its OWN date, preferring updated over published", () => {
  assert.match(guidesBlock, /g\.updated \?\? g\.published/, "uses the guide's own dates");
  assert.doesNotMatch(guidesBlock, /GUIDES_PUBLISHED/, "must not substitute the shared launch date");
});

test("an undated guide gets no lastmod rather than an invented one", () => {
  assert.match(guidesBlock, /\.\.\.\(lastmod \? \{ lastmod \} : \{\}\)/, "omitted entirely when absent");
});

test("the data supports it: most guides carry a real, valid date", () => {
  const dated = GUIDES.filter((g) => g.updated ?? g.published);
  const undated = GUIDES.length - dated.length;
  assert.ok(dated.length >= 20, `expected most guides dated, found ${dated.length} of ${GUIDES.length}`);
  for (const g of dated) {
    const d = g.updated ?? g.published;
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `${g.slug}: lastmod must be a calendar date, got ${d}`);
    const t = new Date(`${d}T00:00:00Z`).getTime();
    assert.ok(!Number.isNaN(t), `${g.slug}: unparseable date ${d}`);
    assert.ok(t <= Date.now() + 86_400_000, `${g.slug}: date is in the future`);
  }
  // The undated ones are the reason the conditional spread exists.
  assert.ok(undated >= 0 && undated < GUIDES.length, "sanity");
});

test("an updated guide reports the update, not the original publication", () => {
  const changed = GUIDES.filter((g) => g.updated && g.published && g.updated !== g.published);
  for (const g of changed) {
    assert.equal(g.updated ?? g.published, g.updated, `${g.slug}: updated must win`);
  }
});

test("the dated study still carries no lastmod", () => {
  // Its window describes the data, not the page. That distinction is the
  // whole reason it is excluded, and it must survive this change.
  // The ROUTE OBJECT only - the surrounding comment legitimately explains
  // why there is no lastmod, so scanning the comment would always fail.
  const at = src.indexOf("loc: `${SITE_URL}/market-data/pokemon-reference-price-changes`");
  assert.ok(at > 0, "the study route is present");
  const obj = src.slice(at, src.indexOf("}", at));
  assert.doesNotMatch(obj, /lastmod/i, "the study route must not gain a lastmod");
});

test("the rationale comment is not stale", () => {
  // It said "no STATIC_ROUTE carries one", which stopped being true when
  // the news items gained theirs. A stale rationale is how a correct
  // decision gets reversed by the next reader.
  assert.doesNotMatch(src, /No <lastmod>: no STATIC_ROUTE carries one/);
  assert.match(src, /observation window is NOT a modification date/i, "the real reason is still stated");
});

test("GUIDES_PUBLISHED still exists and is not used as a per-page date", () => {
  assert.match(GUIDES_PUBLISHED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!guidesBlock.includes(GUIDES_PUBLISHED), "the launch constant is not stamped on pages");
});
