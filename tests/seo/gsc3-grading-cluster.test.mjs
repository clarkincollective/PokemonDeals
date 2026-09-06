// SEO-GSC-3 — grading / condition content cluster.
//
// GSC (docs/gsc-indexation-audit.md) showed ~24 real grading/condition
// queries hitting /guides/card-condition-grading at pos ~55-90, in two
// distinct intents the broad hub can't win: "what does a grade number
// mean" and "how do I check a card's condition". This phase strengthens
// the hub and adds exactly TWO evidence-backed spokes (the third
// candidate, a PSA-vs-CGC-vs-BGS comparison, was rejected - no query
// demand, hub already covers it). Hub/spoke internal links, distinct
// title/H1 intent, no fabricated freshness, no SEO-architecture change.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { get, parseHtml, pathOf, sitemapUrls } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, "..", "..", p), "utf8");

const HUB = "/guides/card-condition-grading";
const SPOKE_A = "/guides/pokemon-card-grading-scale";
const SPOKE_B = "/guides/how-to-check-pokemon-card-condition";
const NEW = [SPOKE_A, SPOKE_B];
const REJECTED_SLUGS = ["psa-vs-cgc", "cgc-vs-bgs", "psa-vs-cgc-vs-bgs", "which-grading-company", "best-grading-company"];

// ---------------------------------------------------------------------------
// source-level
// ---------------------------------------------------------------------------

test("1. exactly two new guides added this phase; the PSA-vs-CGC-vs-BGS candidate was not created", () => {
  const guides = read("lib/guides.js");
  const slugs = [...guides.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(slugs.length, 6, `expected 6 guides, got ${slugs.length}: ${slugs.join(", ")}`);
  assert.ok(slugs.includes("pokemon-card-grading-scale"));
  assert.ok(slugs.includes("how-to-check-pokemon-card-condition"));
  for (const r of REJECTED_SLUGS) {
    assert.ok(!slugs.includes(r), `a rejected comparison guide "${r}" was created`);
  }
});

test("2. new guides carry a truthful per-guide publish date, not the original-batch default or a build time", () => {
  const guides = read("lib/guides.js");
  for (const slug of ["pokemon-card-grading-scale", "how-to-check-pokemon-card-condition"]) {
    const block = guides.slice(guides.indexOf(`slug:\n`) >= 0 ? 0 : guides.indexOf(`"${slug}"`));
    assert.match(block, new RegExp(`"${slug}"[\\s\\S]{0,400}published:\\s*"2026-09-07"`), `${slug} has no own published date`);
  }
  const layout = read("components/GuideLayout.js");
  assert.match(layout, /const published = g\.published \?\? GUIDES_PUBLISHED/);
  assert.doesNotMatch(layout, /datePublished:\s*new Date|Date\.now\(\)/, "guide Article schema uses a runtime date");
});

test("3. no fabricated current-year / freshness language or clickbait in the new guides", () => {
  // titles + blurbs from the registry
  const guides = read("lib/guides.js");
  for (const slug of ["pokemon-card-grading-scale", "how-to-check-pokemon-card-condition"]) {
    const block = guides.slice(guides.indexOf(`"${slug}"`), guides.indexOf(`"${slug}"`) + 500);
    assert.doesNotMatch(block, /title:[\s\S]{0,120}\b20\d\d\b/, `${slug} title carries a year`);
    assert.doesNotMatch(block, /\bUltimate\b|Everything You Need to Know|\bSecret\b|Guaranteed/i, `${slug} title/blurb is clickbait`);
  }
  // rendered visible body text (tags stripped) has no bare 20xx year
  for (const [p, r] of [[SPOKE_A, A], [SPOKE_B, B]]) {
    const visible = r.body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(visible, /\b20\d\d\b/, `${p} shows a hardcoded year in visible copy`);
    assert.doesNotMatch(visible, /\bUltimate\b|Everything You Need to Know|\bSecret\b|Guaranteed (PSA|Gem|a )?(Mint |grade )?10/i, `${p} visible copy is clickbait / promises a grade`);
  }
});

test("4. grading-claim safety: the new guides hedge and defer to the grading company", () => {
  const a = read("app/guides/pokemon-card-grading-scale/page.js");
  const b = read("app/guides/how-to-check-pokemon-card-condition/page.js");
  assert.match(a, /grading company (makes the final call|decides)/i);
  assert.match(b, /grad(er|ing company) (still )?decides|not a (guarantee|promise)/i);
  // no "this card will get a PSA 10" style certainty
  for (const [f, src] of [["A", a], ["B", b]]) {
    assert.doesNotMatch(src, /will (get|receive|grade) (a )?(PSA |CGC |BGS )?(gem mint |mint )?10\b/i, `spoke ${f} promises a specific grade`);
    assert.doesNotMatch(src, /population report|pop report/i, `spoke ${f} cites fabricated population data`);
  }
});

test("5. distinct primary intent - no two grading-cluster guides share a title or H1", () => {
  const titleOf = (guidesSrc, slug) => guidesSrc.match(new RegExp(`slug:\\s*"${slug}"[\\s\\S]{0,120}?title:\\s*\\n?\\s*"([^"]+)"`))?.[1];
  const g = read("lib/guides.js");
  const titles = ["card-condition-grading", "pokemon-card-grading-scale", "how-to-check-pokemon-card-condition", "raw-vs-graded-pokemon-cards"].map((s) => titleOf(g, s));
  assert.ok(titles.every(Boolean), `missing a title: ${JSON.stringify(titles)}`);
  assert.equal(new Set(titles.map((t) => t.toLowerCase())).size, titles.length, `duplicate guide titles: ${titles.join(" | ")}`);
});

test("6. hub links out to both spokes; each spoke links back to the hub and to the sibling spoke", () => {
  const hub = read("app/guides/card-condition-grading/page.js");
  assert.ok(hub.includes(SPOKE_A) && hub.includes(SPOKE_B), "hub does not link both spokes");
  for (const [self, other, file] of [
    [SPOKE_A, SPOKE_B, "app/guides/pokemon-card-grading-scale/page.js"],
    [SPOKE_B, SPOKE_A, "app/guides/how-to-check-pokemon-card-condition/page.js"],
  ]) {
    const src = read(file);
    assert.ok(src.includes(HUB), `${self} does not link back to the hub`);
    assert.ok(src.includes(other), `${self} does not link its sibling spoke`);
  }
});

test("7. spokes connect to product surfaces without becoming affiliate pages", () => {
  for (const f of ["app/guides/pokemon-card-grading-scale/page.js", "app/guides/how-to-check-pokemon-card-condition/page.js"]) {
    const src = read(f);
    // at least one real site surface
    assert.ok(/\/deals\/graded|\/pokemon|\/cards|\/methodology/.test(src), `${f} links no site surface`);
    // not stuffed with affiliate/outbound CTAs
    const affiliate = (src.match(/AffiliateLink|affiliate_url|ebay\.com/gi) ?? []).length;
    assert.ok(affiliate === 0, `${f} has ${affiliate} affiliate hooks - guides stay informational`);
  }
});

// ---------------------------------------------------------------------------
// live server
// ---------------------------------------------------------------------------

let A, B, hub, idx, sm;
before(async () => {
  [A, B, hub, idx] = await Promise.all([get(SPOKE_A), get(SPOKE_B), get(HUB), get("/guides")]);
  sm = await sitemapUrls();
});

test("8. both new guides: 200, self-canonical, indexable, server-rendered content", () => {
  for (const [p, r] of [[SPOKE_A, A], [SPOKE_B, B]]) {
    assert.equal(r.status, 200, `${p} -> ${r.status}`);
    const h = parseHtml(r.body);
    assert.doesNotMatch(h.robots ?? "", /noindex/, `${p} is noindex`);
    assert.ok((h.canonicals ?? []).some((c) => pathOf(c) === p), `${p} not self-canonical (${JSON.stringify(h.canonicals)})`);
    assert.ok((h.h1s?.[0] ?? "").length > 8, `${p} has no real H1 (${JSON.stringify(h.h1s)})`);
    assert.ok(r.body.length > 6000, `${p} raw HTML is only ${r.body.length} bytes - content not server-rendered`);
  }
});

test("9. spoke content is really in the raw HTML (tables + section headings, not client-only)", () => {
  assert.match(A.body, /Grade[\s\S]{0,80}Common name[\s\S]{0,120}communicates/, "grade-scale table missing from /pokemon-card-grading-scale raw HTML");
  assert.match(A.body, /What usually separates a 7, 8, 9 and 10/);
  assert.match(B.body, /Centering[\s\S]{0,400}Corners[\s\S]{0,400}Edges[\s\S]{0,400}Surface/, "condition-axes table missing from how-to-check raw HTML");
  assert.match(B.body, /What to photograph/);
});

test("10. /guides index links both new guides; both are in the sitemap; neither is noindex", () => {
  for (const p of NEW) {
    assert.ok(idx.body.includes(`href="${p}"`), `/guides index does not link ${p}`);
  }
  const allSitemapPaths = sm.locs.map(pathOf);
  for (const p of NEW) {
    assert.ok(allSitemapPaths.includes(p), `${p} is not in any sitemap segment`);
  }
});

test("11. the hub still renders its original content (not rewritten away)", () => {
  assert.equal(hub.status, 200);
  assert.match(hub.body, /Raw card condition/);
  assert.match(hub.body, /Near Mint/);
  assert.match(hub.body, /Third-party grading/);
  assert.match(hub.body, /FAQPage/); // its FAQ schema is preserved
  // and now links the spokes
  assert.ok(hub.body.includes(`href="${SPOKE_A}"`) && hub.body.includes(`href="${SPOKE_B}"`));
});

test("12. new guide Article schema datePublished is the real date, not a build timestamp", () => {
  for (const r of [A, B]) {
    const m = r.body.match(/"datePublished":"([^"]+)"/);
    assert.ok(m, "no Article datePublished in the guide");
    assert.equal(m[1], "2026-09-07");
    assert.equal(r.body.match(/"dateModified":"([^"]+)"/)?.[1], "2026-09-07");
  }
});
