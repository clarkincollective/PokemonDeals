// 2026-09-21 audit follow-up: /cards and /sets already held the content
// for two difficulty-2 terms ("pokemon card list" 8,100/mo, "pokemon set
// list" 4,400/mo, DataForSEO US) and used neither phrase. Each page now
// carries its phrase once in the title, once in the H1 and once in the
// lead - and no more than that, so this can never drift into stuffing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

// The rendered copy only: comments carry the rationale and name the terms.
const copyOf = (src) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const countPhrase = (text, phrase) => (text.toLowerCase().match(new RegExp(phrase, "g")) ?? []).length;

const CASES = [
  { file: "app/cards/page.js", phrase: "pokemon card list", title: "Pokemon Card List & Price Database", h1: "Pokemon Card List &amp; Price Database" },
  { file: "app/sets/page.js", phrase: "pokemon set list", title: "Pokemon Set List: Every Set & Checklist", h1: "Pokemon Set List: Checklists, Prices &amp; Values" },
];

for (const c of CASES) {
  test(`${c.file}: the phrase is in the title, the H1 and the lead - and used sparingly`, () => {
    const src = read(c.file);
    assert.match(src, new RegExp(`const TITLE = "${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}";`), "title");
    assert.ok(src.includes(c.h1), `H1 carries the phrase: ${c.h1}`);
    const copy = copyOf(src);
    const n = countPhrase(copy, c.phrase);
    assert.ok(n >= 3, `${c.phrase}: expected at least title + H1 + lead, found ${n}`);
    assert.ok(n <= 5, `${c.phrase}: ${n} uses reads as stuffing`);
  });

  test(`${c.file}: the description fits a SERP and claims nothing new`, () => {
    const src = read(c.file);
    const m = src.match(/const DESCRIPTION =\s*\n?\s*"([^"]+)"/);
    assert.ok(m, "description found");
    assert.ok(m[1].length <= 160, `description is ${m[1].length} chars`);
    assert.ok(m[1].toLowerCase().includes(c.phrase), "description carries the phrase");
    assert.doesNotMatch(m[1], /\d{2,}/, "no hardcoded count in the description - those move");
  });
}

test("neither page invents a figure or a promise in its lead", () => {
  for (const c of CASES) {
    const copy = copyOf(read(c.file));
    const header = copy.slice(copy.indexOf("<h1"), copy.indexOf("</header>"));
    assert.doesNotMatch(header, /\$\s?\d/, `${c.file}: no price in the header copy`);
    assert.doesNotMatch(header, /\bbest\b|\bcheapest\b|guaranteed|verified authentic/i, `${c.file}: no unsupported claim`);
  }
});
