// Phase 4 P0 - the /cards/[slug] <-> card identity mapping (lib/cardSlug.js)
// that lets a card resolve to one stable URL whether or not it currently
// has a live eBay deal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogCardSlug, splitCardSlug, isRealCardName, catalogCardTitle } from "../../lib/cardSlug.js";

test("catalogCardSlug: name + set -> the same scheme card hubs use", () => {
  assert.equal(catalogCardSlug("Kakuna", "Base Set (Shadowless)"), "kakuna-base-set-shadowless");
  assert.equal(catalogCardSlug("Houndoom EX (Full Art)", "XY - BREAKthrough"), "houndoom-ex-full-art-xy-breakthrough");
  assert.equal(catalogCardSlug("Electrode", "Base Set (Shadowless)"), "electrode-base-set-shadowless");
  assert.equal(catalogCardSlug("Moltres (12)", "Fossil"), "moltres-12-fossil");
});

// setIndex must be sorted longest-slug-first (as fetchCatalogSetIndex does).
const SET_INDEX = [
  { name: "XY - BREAKthrough", slug: "xy-breakthrough" },
  { name: "Base Set (Shadowless)", slug: "base-set-shadowless" },
  { name: "Base Set", slug: "base-set" },
  { name: "Fossil", slug: "fossil" },
  { name: "XY", slug: "xy" },
].sort((a, b) => b.slug.length - a.slug.length);

test("splitCardSlug: peels the set slug off the end, longest match wins", () => {
  assert.deepEqual(splitCardSlug("houndoom-ex-full-art-xy-breakthrough", SET_INDEX), {
    nameSlug: "houndoom-ex-full-art",
    setSlug: "xy-breakthrough",
    setName: "XY - BREAKthrough",
  });
  // must NOT match the shorter "xy" set and leave "...breakthrough" in the name
  assert.equal(splitCardSlug("houndoom-ex-full-art-xy-breakthrough", SET_INDEX).setName, "XY - BREAKthrough");

  assert.deepEqual(splitCardSlug("kakuna-base-set-shadowless", SET_INDEX), {
    nameSlug: "kakuna",
    setSlug: "base-set-shadowless",
    setName: "Base Set (Shadowless)",
  });
  assert.deepEqual(splitCardSlug("moltres-12-fossil", SET_INDEX), {
    nameSlug: "moltres-12",
    setSlug: "fossil",
    setName: "Fossil",
  });
});

test("splitCardSlug: round-trips with catalogCardSlug", () => {
  for (const [name, set] of [
    ["Kakuna", "Base Set (Shadowless)"],
    ["Moltres (12)", "Fossil"],
    ["Houndoom EX (Full Art)", "XY - BREAKthrough"],
  ]) {
    const slug = catalogCardSlug(name, set);
    const split = splitCardSlug(slug, SET_INDEX);
    assert.ok(split, `${slug} should split`);
    assert.equal(split.setName, set);
  }
});

test("splitCardSlug: no known set slug as a suffix -> null", () => {
  assert.equal(splitCardSlug("some-slug-not-a-real-set", SET_INDEX), null);
  assert.equal(splitCardSlug("base-set", SET_INDEX), null); // set slug alone, no card name
});

test("isRealCardName: rejects code cards / boxes / blisters, keeps real cards", () => {
  for (const junk of [
    "Code Card - Pitch Black Booster Pack",
    "Code Card - Chaos Rising Elite Trainer Box",
    "Pitch Black Booster Bundle",
    "Surprise Box",
    "Battle Styles 3 Pack Blister [Jolteon]",
    "Poke Ball Tin",
    "Charizard ex Premium Collection",
  ]) {
    assert.equal(isRealCardName(junk), false, `should reject: ${junk}`);
  }
  for (const real of [
    "Charizard - 4/102",
    "Houndoom EX (Full Art)",
    "Moltres (12)",
    "Rocket's Hitmonchan - 9 [Winner]",
    "Gardevoir & Sylveon GX (205) (Alternate Full Art)",
  ]) {
    assert.equal(isRealCardName(real), true, `should keep: ${real}`);
  }
});

test("catalogCardTitle: stays within the SEO title budget, never truncates a short name", () => {
  assert.equal(catalogCardTitle("Kakuna", "Base Set (Shadowless)"), "Kakuna (Base Set (Shadowless)) Price & Value");
  // long name+set: drops the tail, then the set, before touching the name
  const long = catalogCardTitle(
    "Code Card - Battle Styles 3 Pack Blister [Jolteon]",
    "SWSH05: Battle Styles"
  );
  assert.ok(long.length <= 63, `too long: ${long.length}`);
  assert.ok(long.startsWith("Code Card - Battle Styles 3 Pack Blister [Jolteon]"), long);
  // real long card name still fits by dropping the set
  const g = catalogCardTitle("Gardevoir & Sylveon GX (205) (Alternate Full Art)", "SM - Cosmic Eclipse");
  assert.ok(g.length <= 63, `too long: ${g.length}: ${g}`);
});
