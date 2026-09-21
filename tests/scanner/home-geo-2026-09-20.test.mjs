// GEO / AEO 2026-09-20 - the homepage answers first and is structured for
// extraction: a search-word H1 from lib/homeContent, a body-size quotable
// capsule, an answer-first explanatory block with key takeaways, a
// comparison table, a byline with a review date, and an eight-question FAQ
// whose array feeds the FAQPage node of the single home graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const page = read("app/page.js");
const block = read("components/HomeHowItCompares.js");

test("H1, title and description come from lib/homeContent; the capsule is body-size and quotable", () => {
  const content = read("lib/homeContent.js");
  assert.match(content, /export const HOME_H1 = "Pokemon card deals below market price on eBay";/);
  assert.match(content, /export const HOME_TITLE = "Pokemon Card Deals Below Market Price \| Pokemon Deal Finder";/);
  // 2026-09-22: the H1 splits HOME_H1 to colour "below market price on
  // eBay" in the brand red, so it is no longer the literal
  // `<h1>{HOME_H1}</h1>`. What this test protects - that the visible H1
  // and the `h1:` fed to buildHomeGraph (asserted below) are the SAME
  // constant - is unchanged, so it is asserted directly instead.
  const h1 = page.slice(page.indexOf("<h1"), page.indexOf("</h1>"));
  assert.ok(h1.includes("HOME_H1"), "the H1 is rendered from the HOME_H1 constant");
  assert.ok(!h1.includes("Pokemon card deals below"), "and not hand-typed alongside it");
  assert.match(page, /title: \{ absolute: HOME_TITLE \}/);
  assert.match(page, /description: HOME_DESCRIPTION,/);
  // The capsule must stay BODY-SIZE and readable - that is what makes it
  // quotable rather than fine print. Asserted on those properties rather
  // than on an exact class string, so the 2026-09-22 re-brand could
  // retune colour and measure without weakening the rule.
  const capsule = page.match(/className="([^"]*)" data-answer-capsule/);
  assert.ok(capsule, "the answer capsule is present");
  assert.match(capsule[1], /\btext-sm\b/, "body-size, never text-xs");
  assert.match(capsule[1], /\bleading-relaxed\b/, "readable line height");
  assert.doesNotMatch(capsule[1], /\btext-xs\b|\bsr-only\b/, "never fine print or hidden");
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

test("placement: after the lead-in prose, before the three steps; ONE graph in ONE script via JsonLd, built from the render's own data", () => {
  const prose = page.indexOf("scans eBay listings for Pokemon TCG cards");
  const compares = page.indexOf("<HomeHowItCompares />");
  const steps = page.indexOf('id="how-it-works"');
  assert.ok(prose > 0 && prose < compares && compares < steps);
  assert.equal((page.match(/application\/ld\+json/g) ?? []).length, 0, "no hand-rolled script tags on the home page");
  assert.equal((page.match(/<JsonLd data=\{homeGraph\} \/>/g) ?? []).length, 1);
  assert.match(page, /const homeGraph = buildHomeGraph\(\{\s*title: HOME_TITLE,\s*description: HOME_DESCRIPTION,\s*h1: HOME_H1,\s*lastRefreshed,/);
  assert.match(page, /deals: \[\.\.\.flagshipDeals, \.\.\.deals\]\.map\(\(d\) => \(\{\s*id: d\.id,\s*name: `\$\{cardDisplayName\(\{ name: normalizePublicText\(d\.watchlist\?\.name \?\? d\.title\) \}\)\}/, "ItemList from the arrays the feed renders, featured first");
  assert.match(page, /liveCount,\s*faqItems: FAQ_ITEMS,\s*sameAs: organizationSameAs\(\),/);
  assert.match(page, /dateModified: HOME_LAST_REVIEWED/);
  assert.doesNotMatch(page, /"@type": "Organization"|"@type": "WebSite"/, "site entities come from the builders");
});

test("FAQ: eight questions, each 2-4 sentences, the four GEO questions kept; the same array feeds the graph", () => {
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
  assert.match(page, /\{FAQ_ITEMS\.map\(\(item\) => \(/, "the visible FAQ renders the same array");
});
