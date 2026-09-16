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
import { GUIDES, guideForSet } from "../../lib/guides.js";
import { cardNextSteps } from "../../lib/cardNextSteps.js";

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
  charmanderGenerations: ["113744", "Charmander", "Generations: Radiant Collection", "RC3/RC32", "/cards/charmander-generations-radiant-collection"],
  // 30th Celebration guide - verified against card_catalog and resolved
  // live (200) on 2026-09-16.
  c30PikachuRare023: ["712934", "Pikachu - 023/128", "ME: 30th Celebration", "023/128", "/cards/pikachu-023-128-me-30th-celebration"],
  c30PikachuRare027: ["716310", "Pikachu - 027/128", "ME: 30th Celebration", "027/128", "/cards/pikachu-027-128-me-30th-celebration"],
  c30PikachuRare036: ["696680", "Pikachu - 036/128", "ME: 30th Celebration", "036/128", "/cards/pikachu-036-128-me-30th-celebration"],
  c30PikachuRare040: ["712944", "Pikachu - 040/128", "ME: 30th Celebration", "040/128", "/cards/pikachu-040-128-me-30th-celebration"],
  c30PikachuEx053: ["712951", "Pikachu ex - 053/128", "ME: 30th Celebration", "053/128", "/cards/pikachu-ex-053-128-me-30th-celebration"],
  c30PikachuExSir149: ["712953", "Pikachu ex - 149/128", "ME: 30th Celebration", "149/128", "/cards/pikachu-ex-149-128-me-30th-celebration"],
  c30PikachuExSir150: ["712954", "Pikachu ex - 150/128", "ME: 30th Celebration", "150/128", "/cards/pikachu-ex-150-128-me-30th-celebration"],
  c30MewtwoExFuturistic: ["696687", "Mewtwo ex", "ME: 30th Celebration", "157/128", "/cards/mewtwo-ex-me-30th-celebration"],
  c30MewExFuturistic: ["696688", "Mew ex", "ME: 30th Celebration", "158/128", "/cards/mew-ex-me-30th-celebration"],
  c30GreninjaExSir: ["716230", "Greninja ex - 148/128", "ME: 30th Celebration", "148/128", "/cards/greninja-ex-148-128-me-30th-celebration"],
  c30SylveonExSir: ["716231", "Sylveon ex - 153/128", "ME: 30th Celebration", "153/128", "/cards/sylveon-ex-153-128-me-30th-celebration"],
  c30JirachiExSir: ["716232", "Jirachi ex - 155/128", "ME: 30th Celebration", "155/128", "/cards/jirachi-ex-155-128-me-30th-celebration"],
  c30EspeonEx: ["696834", "Espeon ex", "ME: 30th Celebration", "070/128", "/cards/espeon-ex-me-30th-celebration"],
  c30UmbreonEx: ["696835", "Umbreon ex", "ME: 30th Celebration", "092/128", "/cards/umbreon-ex-me-30th-celebration"],
  c30AlolanExeggutorIr: ["716218", "Alolan Exeggutor - 129/128", "ME: 30th Celebration", "129/128", "/cards/alolan-exeggutor-129-128-me-30th-celebration"],
  c30LaprasIr: ["696683", "Lapras - 131/128", "ME: 30th Celebration", "131/128", "/cards/lapras-131-128-me-30th-celebration"],
  c30HisuianZoruaIr: ["696686", "Hisuian Zorua - 145/128", "ME: 30th Celebration", "145/128", "/cards/hisuian-zorua-145-128-me-30th-celebration"],
  c30MausholdIr: ["716228", "Maushold - 146/128", "ME: 30th Celebration", "146/128", "/cards/maushold-146-128-me-30th-celebration"],
  c30ClassicCharizard: ["714372", "Charizard", "ME: 30th Celebration Classic Collection", "4/102", "/cards/charizard-me-30th-celebration-classic-collection"],
  c30ClassicPikachuZekromGx: ["714373", "Pikachu & Zekrom GX", "ME: 30th Celebration Classic Collection", "33/181", "/cards/pikachu-zekrom-gx-me-30th-celebration-classic-collection"],
  c30ClassicLugia: ["714386", "Lugia", "ME: 30th Celebration Classic Collection", "149/147", "/cards/lugia-me-30th-celebration-classic-collection"],
  c30ClassicMagikarp: ["716210", "Magikarp", "ME: 30th Celebration Classic Collection", "203/193", "/cards/magikarp-me-30th-celebration-classic-collection"],
  c30ClassicGengarPrime: ["716198", "Gengar (Prime)", "ME: 30th Celebration Classic Collection", "94/102", "/cards/gengar-prime-me-30th-celebration-classic-collection"],
  c30ClassicRayquazaEx: ["716196", "Rayquaza EX", "ME: 30th Celebration Classic Collection", "85/124", "/cards/rayquaza-ex-me-30th-celebration-classic-collection"],
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
  const sets = { baseSet: "/sets/base-set", baseSetShadowless: "/sets/base-set-shadowless", baseSet2: "/sets/base-set-2", xyEvolutions: "/sets/xy-evolutions", evolvingSkies: "/sets/swsh07-evolving-skies", thirtiethCelebration: "/sets/me-30th-celebration", celebrations2021: "/sets/celebrations" };
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
    // one Charmander (the Pokedex-vs-collector-number figure), three
    // Umbreon VMAX (numbered beyond the printed total), three Charizard
    // (same name, different number). Each is a figure subject, not a dump.
    "how-to-find-pokemon-card-set-and-number": 7,
    // the reprint-vs-vintage Charizard pair, the 30th Celebration set page
    // (twice) and the Celebrations (2021) set page - the illustrated
    // galleries reference their cards through data arrays, counted below
    "pokemon-30th-celebration-guide": 5,
  });
  // The release guide's galleries: every tile is a GUIDE_CARDS identity
  // rendered as a complete card face linked to its own page (a figure
  // subject each, captioned), bounded so the page stays an article.
  const gallery = (read("app/guides/pokemon-30th-celebration-guide/page.js").match(/GUIDE_CARDS\.c30\w+/g) ?? []).length;
  assert.ok(gallery >= 20 && gallery <= 30, `30th Celebration gallery references ${gallery} cards`);
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
  // coverage is NOT universal (resolvable = real name + image + product id + resolvable set;
  // indexable additionally needs a trustworthy price) - so the guide says only what is proven
  assert.match(prices, /Card pages can exist even when no live\s+deals are available\./);
  assert.doesNotMatch(prices, /each printing has its own\s+card page/);
  assert.match(prices, /four cards with four prices, each on its own page\./);
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
    "how-to-find-pokemon-card-set-and-number",
    "pokemon-30th-celebration-guide",
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

// ---------------------------------------------------------------------------
// Reciprocal linking: a set (and its cards) link back to the guide written
// about that set. The guide already links into the card pages; without this
// the relationship is one-way and the highest-intent surfaces - the set page
// and the card pages themselves - never mention the guide.
// ---------------------------------------------------------------------------

test("6. guideForSet matches a set's guide on the exact catalogue set name only", () => {
  const g = guideForSet("ME: 30th Celebration");
  assert.ok(g, "no guide found for ME: 30th Celebration");
  assert.equal(g.slug, "pokemon-30th-celebration-guide");
  // the Classic Collection is filed as its own set and shares the guide
  assert.equal(guideForSet("ME: 30th Celebration Classic Collection")?.slug, g.slug);
  // case-insensitive, whitespace-tolerant, but never fuzzy: the 2021
  // "Celebrations" set is a different product and must not pick this up
  assert.equal(guideForSet("  me: 30th celebration  ")?.slug, g.slug);
  assert.equal(guideForSet("Celebrations"), null, "the 2021 Celebrations set must not match the 30th guide");
  assert.equal(guideForSet("30th Celebration"), null, "partial set names must not match");
  assert.equal(guideForSet("Base Set"), null);
  for (const empty of [null, undefined, "", "   "]) assert.equal(guideForSet(empty), null);
});

test("7. every set a guide claims is a real set name the catalogue uses", () => {
  const known = new Set(Object.values(GUIDE_CARDS).map((c) => c.set));
  for (const g of GUIDES) {
    for (const s of g.sets ?? []) {
      assert.ok(known.has(s), `guide ${g.slug} names set "${s}", which no verified GUIDE_CARDS entry uses - a typo here silently links nothing`);
    }
  }
});

test("8. a card in a guided set offers the guide as a next step, with no deal claim", () => {
  const links = cardNextSteps({
    species: { name: "Pikachu", slug: "pikachu" }, speciesLive: 3,
    set: { name: "ME: 30th Celebration", slug: "me-30th-celebration" }, setLive: 5,
    marketUsd: 20, setName: "ME: 30th Celebration",
  });
  const guide = links.find((l) => l.key === "guide");
  assert.ok(guide, `no guide next-step link: ${JSON.stringify(links.map((l) => l.key))}`);
  assert.equal(guide.href, "/guides/pokemon-30th-celebration-guide");
  assert.ok(guide.label.length > 0 && guide.label.length <= 60, `guide label is ${guide.label.length} chars: ${guide.label}`);
  // editorial link: never a live-deal count or an availability claim
  assert.equal(guide.live, null);
  assert.doesNotMatch(guide.label, /live|deal|in stock|cheap|save/i, `guide label implies deals: ${guide.label}`);
  assert.ok(links.length <= 4, "next-step links stay bounded at 4");
  // a set with no guide gets no guide link (never a 404 link)
  assert.ok(!cardNextSteps({ set: { name: "Jungle", slug: "jungle" }, setName: "Jungle" }).some((l) => l.key === "guide"));
});

test("9. the set page links its guide from the registry, not a hand-typed URL", () => {
  const src = read("app/sets/[slug]/page.js");
  assert.match(src, /guideForSet\(/, "set page does not consult the guide registry");
  assert.match(src, /href=\{`\/guides\/\$\{setGuide\.slug\}`\}/, "set page does not build the guide href from the registry entry");
  // the same rule the guides themselves follow: no hand-typed guide slugs
  const typed = [...src.matchAll(/href="\/guides\/[^"]+"/g)].map((m) => m[0]);
  assert.deepEqual(typed, [], `hand-typed guide hrefs on the set page: ${typed.join(", ")}`);
});
