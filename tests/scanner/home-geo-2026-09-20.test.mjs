// GEO / AEO 2026-09-20 - the homepage answers first and is structured for
// extraction: a search-word H1, a body-size quotable capsule, an
// answer-first explanatory block with key takeaways, a comparison table,
// a byline with a review date, an Article JSON-LD dated by that review
// date (never a clock), and an eight-question FAQ mirrored in FAQPage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const page = read("app/page.js");
const block = read("components/HomeHowItCompares.js");

test("H1 is the search phrase, the capsule is body-size and quotable", () => {
  assert.match(page, /<h1[^>]*>\s*Pokemon card deals below market price on eBay\s*<\/h1>/);
  assert.match(page, /className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400" data-answer-capsule/);
  assert.doesNotMatch(page, /Find your next Pokemon card deal/);
});

test("the explanatory block: question-form H2s that open with the answer, 4-6 takeaways, one comparison table, a dated byline, no authentication claim", () => {
  const h2s = [...block.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].replace(/&ldquo;|&rdquo;/g, '"').trim());
  assert.equal(h2s.length, 5);
  for (const h of h2s) assert.ok(h.endsWith("?"), `H2 is a question: ${h}`);
  assert.match(block, /<p className=\{P\} data-direct-answer>\s*It compares every live eBay listing/);
  const takeaways = block.match(/const TAKEAWAYS = \[([\s\S]*?)\];/)[1].split("\n").filter((l) => l.trim().startsWith('"')).length;
  assert.ok(takeaways >= 4 && takeaways <= 6, `takeaways ${takeaways}`);
  assert.match(block, /data-comparison-table/);
  assert.match(block, /described from their own pages as read on \{THIRD_PARTY_READ_ON\}/, "third-party descriptions are dated");
  assert.match(block, /data-home-byline/);
  assert.match(block, /<time dateTime=\{HOME_LAST_REVIEWED\}>/);
  assert.match(block, /export const HOME_LAST_REVIEWED = "\d{4}-\d{2}-\d{2}";/);
  assert.doesNotMatch(block, /verified authentic|guaranteed genuine/i);
  assert.doesNotMatch(block, /\$\s?\d/, "no price stated in the explanation");
  assert.doesNotMatch(block, /new Date\(|Date\.now\(/);
});

test("placement: after the lead-in prose, before the three steps; Article JSON-LD dated by the review date", () => {
  const prose = page.indexOf("scans eBay listings for Pokemon TCG cards");
  const compares = page.indexOf("<HomeHowItCompares />");
  const steps = page.indexOf('id="how-it-works"');
  assert.ok(prose > 0 && prose < compares && compares < steps);
  assert.match(page, /"@type": "Article",\s*"@id": `\$\{SITE_URL\}\/#how-it-compares`/);
  assert.match(page, /dateModified: HOME_LAST_REVIEWED/);
  assert.match(page, /author: \{ "@id": `\$\{SITE_URL\}\/#organization` \}/);
  assert.match(page, /JSON\.stringify\(homeArticleJsonLd\)/);
});

test("FAQ: eight questions, each 2-4 sentences, the four GEO questions kept, mirrored into FAQPage", () => {
  const src = page.match(/const FAQ_ITEMS = \[([\s\S]*?)\n\];/)[1];
  const questions = [...src.matchAll(/question: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(questions.length, 8, questions.join(" | "));
  for (const q of ["Are the Pokemon cards listed here authentic?", "Where does the market price come from?", "Do you sell cards or take a cut of the price?", "How current is a deal?", "Do you cover graded cards?", "Why do some listings show no saving?"]) {
    assert.ok(questions.includes(q), q);
  }
  const answers = [...src.matchAll(/answer:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  assert.equal(answers.length, 8);
  for (const a of answers) {
    const sentences = a.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
    assert.ok(sentences >= 2 && sentences <= 4, `${sentences} sentences: ${a.slice(0, 60)}`);
  }
  assert.match(page, /mainEntity: FAQ_ITEMS\.map/);
});
