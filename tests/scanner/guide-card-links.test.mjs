// Phase 17C.1 - guide-to-card links. Static + pure: no network. (The live
// destination check - every guide link returns 200, self-canonical,
// indexable - runs against a build; see the phase notes.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { GUIDE_CARDS, GUIDE_SETS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "../../lib/guideLinks.js";
import { catalogCardSlug } from "../../lib/cardSlug.js";
import { slugifySet } from "../../lib/slugify.js";
import { GUIDES } from "../../lib/guides.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const GUIDE_FILES = GUIDES.map((g) => `app/guides/${g.slug}/page.js`);

// The identities verified against card_catalog on 2026-09-11, and the
// canonical URL each resolved to in production (200, self-canonical,
// indexable). If the catalogue or the slug scheme changes, this fails.
const VERIFIED = {
  charizardBaseSet: ["42382", "Charizard", "Base Set", "004/102", "/cards/charizard-base-set"],
  charizardShadowless: ["106999", "Charizard", "Base Set (Shadowless)", "004/102", "/cards/charizard-base-set-shadowless"],
  charizardBaseSet2: ["42479", "Charizard", "Base Set 2", "004/130", "/cards/charizard-base-set-2"],
  charizardEvolutions: ["124026", "Charizard", "XY - Evolutions", "11/108", "/cards/charizard-xy-evolutions"],
  umbreonVmax: ["246720", "Umbreon VMAX", "SWSH07: Evolving Skies", "095/203", "/cards/umbreon-vmax-swsh07-evolving-skies"],
  umbreonVmaxSecret: ["246722", "Umbreon VMAX (Secret)", "SWSH07: Evolving Skies", "214/203", "/cards/umbreon-vmax-secret-swsh07-evolving-skies"],
  umbreonVmaxAltArt: ["246723", "Umbreon VMAX (Alternate Art Secret)", "SWSH07: Evolving Skies", "215/203", "/cards/umbreon-vmax-alternate-art-secret-swsh07-evolving-skies"],
  pikachuVFullArt: ["226431", "Pikachu V (Full Art)", "SWSH04: Vivid Voltage", "170/185", "/cards/pikachu-v-full-art-swsh04-vivid-voltage"],
};

test("1. every guide card is a verified catalogue identity whose href is DERIVED by the route's own slug function", () => {
  assert.deepEqual(Object.keys(GUIDE_CARDS).sort(), Object.keys(VERIFIED).sort());
  for (const [key, [id, name, set, number, href]] of Object.entries(VERIFIED)) {
    const c = GUIDE_CARDS[key];
    assert.equal(c.tcgplayerId, id, key);
    assert.equal(c.name, name, key);
    assert.equal(c.set, set, key);
    assert.equal(c.cardNumber, number, key);
    assert.equal(c.href, href, `${key}: canonical URL`);
    assert.equal(c.href, `/cards/${catalogCardSlug(name, set)}`, `${key}: derived, not typed`);
  }
  const sets = { baseSet: "/sets/base-set", baseSetShadowless: "/sets/base-set-shadowless", baseSet2: "/sets/base-set-2", xyEvolutions: "/sets/xy-evolutions", evolvingSkies: "/sets/swsh07-evolving-skies" };
  for (const [k, href] of Object.entries(sets)) {
    assert.equal(GUIDE_SETS[k].href, href);
    assert.equal(GUIDE_SETS[k].href, `/sets/${slugifySet(GUIDE_SETS[k].name)}`);
  }
  assert.equal(PRICE_CHECKER_HREF, "/search");
});

test("2. guides never hand-type a /cards/ or /sets/<slug> href - every exact card or set link comes from lib/guideLinks", () => {
  for (const f of GUIDE_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /href="\/cards\/[^"]+"/, `${f}: hand-typed card URL`);
    assert.doesNotMatch(src, /href="\/sets\/[^"]+"/, `${f}: hand-typed set URL`);
    assert.doesNotMatch(src, /href="\/search[^"]*"/, `${f}: use PRICE_CHECKER_HREF`);
  }
});

test("3. the contextual links landed where they explain identity, grading or value - and nowhere as a link dump", () => {
  const count = (src, re) => (src.match(re) ?? []).length;
  const exactLinks = (src) => count(src, /href=\{GUIDE_(CARDS|SETS)\.\w+\.href\}/g);
  const perGuide = Object.fromEntries(GUIDE_FILES.map((f) => [f.split("/")[2], exactLinks(read(f))]));
  // bounded per guide (no dump), and not every guide needs one
  for (const [g, n] of Object.entries(perGuide)) assert.ok(n <= 8, `${g}: ${n} exact links is a dump`);
  assert.deepEqual(perGuide, {
    "how-pokemon-card-prices-work": 7,
    "card-condition-grading": 2,
    "raw-vs-graded-pokemon-cards": 1,
    "vintage-vs-modern-pokemon-cards": 7,
    "pokemon-card-grading-scale": 1,
    "how-to-check-pokemon-card-condition": 0,
  });
  // the price checker is reachable from the guides that talk about looking a card up
  const withChecker = GUIDE_FILES.filter((f) => /href=\{PRICE_CHECKER_HREF\}/.test(read(f))).map((f) => f.split("/")[2]).sort();
  assert.deepEqual(withChecker, ["card-condition-grading", "how-pokemon-card-prices-work", "how-to-check-pokemon-card-condition", "pokemon-card-grading-scale", "raw-vs-graded-pokemon-cards"]);
  // every new link uses the guides' existing inline style
  assert.equal(GUIDE_LINK_CLASS, "text-red-600 hover:underline dark:text-red-500");
  for (const f of GUIDE_FILES) {
    for (const m of read(f).matchAll(/href=\{(?:GUIDE_(?:CARDS|SETS)\.\w+\.href|PRICE_CHECKER_HREF)\} className=\{([^}]+)\}/g)) assert.equal(m[1], "GUIDE_LINK_CLASS", f);
  }
});

test("4. copy stays within what the catalogue and pages support: no prices, no 1st-Edition card links, no promised grades or condition data", () => {
  const all = GUIDE_FILES.map(read).join("\n");
  assert.doesNotMatch(all, /\$\s?\d/, "no hard-coded prices in guide copy");
  assert.doesNotMatch(all, /1st[- ]Edition[^.]{0,80}href=\{GUIDE_CARDS/i, "no link presented as a 1st Edition card - the catalogue has none");
  const rvg = read("app/guides/raw-vs-graded-pokemon-cards/page.js");
  assert.doesNotMatch(rvg, /Each\{?" "?\}?\s*<Link[\s\S]{0,200}card page[\s\S]{0,80}shows the raw price and each graded tier/, "the old 'every card page shows every graded tier' overclaim is gone");
  assert.match(rvg, /where there are enough recent graded sales for that exact printing/);
  const prices = read("app/guides/how-pokemon-card-prices-work/page.js");
  assert.doesNotMatch(prices, /two or more live listings gets its own consolidated/, "outdated card-page claim removed (every catalogued printing has a page)");
  assert.match(prices, /four cards with four prices/);
  const scale = read("app/guides/pokemon-card-grading-scale/page.js");
  assert.match(scale, /once there are enough recent sales/, "graded rows are described conditionally, never promised");
  // no claim that a card page shows a by-condition breakdown (none currently does)
  assert.doesNotMatch(all, /by condition[^.]{0,60}card page|card page[^.]{0,60}by condition/i);
});

test("5. routes, canonicals and indexability of the guides are untouched", () => {
  assert.deepEqual(GUIDES.map((g) => g.slug), [
    "how-pokemon-card-prices-work",
    "card-condition-grading",
    "raw-vs-graded-pokemon-cards",
    "vintage-vs-modern-pokemon-cards",
    "pokemon-card-grading-scale",
    "how-to-check-pokemon-card-condition",
  ]);
  const guidesLib = read("lib/guides.js");
  assert.match(guidesLib, /alternates: \{ canonical: `\/guides\/\$\{slug\}` \}/);
  // lib/guides.js itself is not touched by this phase
  assert.doesNotMatch(guidesLib, /guideLinks/);
  for (const f of GUIDE_FILES) {
    const src = read(f);
    assert.match(src, /guideMetadata\(/, `${f}: metadata still from guideMetadata`);
    assert.doesNotMatch(src, /robots|noindex/i, `${f}: no robots override`);
  }
  // the registry is a plain data module: no client code, no fetch, nothing server-only
  const reg = read("lib/guideLinks.js");
  assert.doesNotMatch(reg, /"use client"|fetch\(|supabase|process\.env/);
});
