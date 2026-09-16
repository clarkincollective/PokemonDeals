// SEO-1.1 targeted remediation (16 Sep 2026). Two confirmed defects from the
// SEO-1 audit, and the guardrails that keep the fixes from drifting.
//
// P2  /deals/[category] variants had no X-Robots-Tag, while /deals variants
//     did. Same DealGrid, same 28 nofollow filter/sort/page links, same
//     self-canonical - only the header rule's `source` differed.
// P6  Card descriptions hand-rolled `name + " #" + number` instead of using
//     catalogCardIdentity, so a name that already carried its collector
//     number produced "Riolu - 61/130 #061/130 (Countdown Calendar Promos)".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { catalogCardIdentity } from "../../lib/cardSlug.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// --- P2: parameter variants under /deals ------------------------------

test("P2-1. /deals AND /deals/:slug both get the variant noindex header", async () => {
  const { default: config } = await import("../../next.config.mjs");
  const rules = await config.headers();
  const sources = new Set(rules.map((r) => r.source));
  assert.ok(sources.has("/deals"), "the original rule survives");
  assert.ok(sources.has("/deals/:slug"), "categories and deal detail pages are covered");
  assert.ok(sources.has("/"), "the homepage rule survives");
});

test("P2-2. every variant rule is conditional on the param, so bare URLs stay indexable", () => {
  // the whole point: /deals/under-50 must remain indexable and canonical.
  // A rule without `has` would noindex the category page itself.
  return import("../../next.config.mjs").then(async ({ default: config }) => {
    for (const r of await config.headers()) {
      assert.ok(Array.isArray(r.has) && r.has.length === 1, `${r.source} rule must be conditional`);
      assert.equal(r.has[0].type, "query");
      assert.ok(r.has[0].key, "keyed on a specific query param");
      assert.deepEqual(r.headers, [{ key: "X-Robots-Tag", value: "noindex, follow" }]);
    }
  });
});

test("P2-3. the subpath rule covers every param the category pages actually emit", async () => {
  // measured on /deals/graded: country, grade, grader, listing, sort (+ page)
  const { default: config } = await import("../../next.config.mjs");
  const keys = new Set(
    (await config.headers()).filter((r) => r.source === "/deals/:slug").map((r) => r.has[0].key)
  );
  for (const k of ["country", "grade", "grader", "listing", "sort", "page", "type", "minPrice", "maxPrice", "q"]) {
    assert.ok(keys.has(k), `/deals/:slug must cover ?${k}=`);
  }
  // `from` is the deal-detail attribution param, same route, same reasoning
  assert.ok(keys.has("from"), "/deals/:id?from= is the same variant class");
});

test("P2-4. nofollow and canonical protection is NOT replaced by the header", () => {
  // the header is a third layer, not a substitute - the audit confirmed all
  // 28 category variant links are rel=nofollow and canonicalise to the bare URL
  const grid = read("components/DealGrid.js");
  assert.match(grid, /rel="nofollow"/, "filter/sort links keep rel=nofollow");
});

// --- P6: collector number stated exactly once -------------------------

test("P6-1. the card description uses the identity helper, not string concatenation", () => {
  const src = read("app/cards/[slug]/page.js");
  assert.doesNotMatch(
    src,
    /\$\{hubName\}\$\{hubNumber \? ` #\$\{hubNumber\}` : ""\}/,
    "the hand-rolled name + number concatenation is gone"
  );
  assert.match(src, /catalogCardIdentity\(hubName, hubNumber\)/);
  assert.match(src, /catalogCardIdentity\(dn, catNumber\)/);
});

test("P6-2. a name that already carries its number does not get it twice", () => {
  // the exact reported case
  assert.equal(catalogCardIdentity("Riolu - 61/130", "061/130"), "Riolu #061/130");
  // and the shapes around it
  assert.equal(catalogCardIdentity("Charizard 4/102", "4/102"), "Charizard #4/102");
  assert.equal(catalogCardIdentity("Pikachu", "030/128"), "Pikachu #030/128");
  for (const [name, num] of [["Riolu - 61/130", "061/130"], ["Charizard 4/102", "4/102"]]) {
    const out = catalogCardIdentity(name, num);
    assert.equal(out.match(/#/g).length, 1, `${out}: exactly one # marker`);
    assert.ok(!/\d+\/\d+.*\d+\/\d+/.test(out), `${out}: the number appears once`);
  }
});

test("P6-3. the rarity clause no longer restates the collector number", () => {
  const src = read("app/cards/[slug]/page.js");
  assert.match(src, /const idBits = \[card\.rarity\]\.filter\(Boolean\)\.join\(", "\);/);
  assert.doesNotMatch(src, /const idBits = \[catNumber, card\.rarity\]/);
});

test("P6-4. title, heading and description all resolve identity the same way", () => {
  // three surfaces, one helper - this is what stopped them drifting apart
  const src = read("app/cards/[slug]/page.js");
  for (const fn of ["catalogCardTitle", "catalogCardHeading", "catalogCardIdentity"]) {
    assert.match(src, new RegExp(`\\b${fn}\\(`), `${fn} is used`);
  }
});
