// Phase 4 P0 - the /cards/[slug] <-> card identity mapping (lib/cardSlug.js)
// that lets a card resolve to one stable URL whether or not it currently
// has a live eBay deal.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogCardSlug,
  splitCardSlug,
  isRealCardName,
  catalogCardTitle,
  catalogPriceOk,
  pickCatalogMatch,
  catalogCardResolvable,
  catalogCardIndexable,
} from "../../lib/cardSlug.js";

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

test("catalogPriceOk: positive finite non-sentinel only", () => {
  assert.equal(catalogPriceOk(12.5), true);
  assert.equal(catalogPriceOk("40"), true);
  assert.equal(catalogPriceOk(0), false);
  assert.equal(catalogPriceOk(-3), false);
  assert.equal(catalogPriceOk(null), false);
  assert.equal(catalogPriceOk(999.99), false); // sentinel
  assert.equal(catalogPriceOk(9999), false); // sentinel
});

// The World Championship Decks regression: a set with > 1,000 rows. The
// caller (resolveCatalogCardUncached) now paginates and hands the FULL
// row list to pickCatalogMatch, so a card past row 1,000 must still
// resolve. This proves the selection logic over an oversized set.
test("pickCatalogMatch: resolves a card that sits past the first 1,000-row page", () => {
  const bulk = Array.from({ length: 1960 }, (_, i) => ({
    name: `Filler ${i}`,
    set: "World Championship Decks",
    market_price: 1,
    image_url: "x.jpg",
  }));
  // the target card at index 1500 (well past PostgREST's 1,000 cap)
  bulk[1500] = {
    tcgplayer_id: "999001",
    name: "Voltorb - 2008 [Tristan Robinson]",
    set: "World Championship Decks",
    market_price: 3.5,
    image_url: "voltorb.jpg",
  };
  const hit = pickCatalogMatch(bulk, catalogCardSlug("Voltorb - 2008 [Tristan Robinson]", "World Championship Decks").replace(/-world-championship-decks$/, ""));
  assert.ok(hit, "card beyond row 1,000 must resolve");
  assert.equal(hit.tcgplayer_id, "999001");
});

test("pickCatalogMatch: resolvability, NOT price - a real imaged card resolves even priceless", () => {
  const rows = [
    { tcgplayer_id: "1", name: "Voltorb", set: "Jungle", market_price: 5, image_url: "x.jpg" },
    { tcgplayer_id: "2", name: "Electrode", set: "Jungle", market_price: null, image_url: "x.jpg" }, // no price
    { tcgplayer_id: "3", name: "Pikachu", set: "Jungle", market_price: 10, image_url: null }, // no image
    { tcgplayer_id: "4", name: "Booster Pack", set: "Jungle", market_price: 4, image_url: "x.jpg" }, // not a card
  ];
  assert.equal(pickCatalogMatch(rows, "not-in-this-set"), null);
  // PRICE no longer gates resolution: a real, imaged card keeps its URL.
  assert.equal(pickCatalogMatch(rows, "electrode").name, "Electrode");
  assert.equal(pickCatalogMatch(rows, "pikachu"), null); // still needs an image
  assert.equal(pickCatalogMatch(rows, "booster-pack"), null); // still not a real card
  assert.equal(pickCatalogMatch(rows, "voltorb").name, "Voltorb");
});

test("catalogCardResolvable vs catalogCardIndexable: URL existence != price availability", () => {
  const priced = { name: "Charizard", set: "Base Set", image_url: "x.jpg", tcgplayer_id: "42382", market_price: 868.56 };
  const priceless = { name: "Charizard", set: "Skyridge", image_url: "x.jpg", tcgplayer_id: "84186", market_price: null };
  const sentinel = { name: "Mew", set: "X", image_url: "x.jpg", tcgplayer_id: "9", market_price: 999.99 };
  const noImage = { name: "Pikachu", set: "X", image_url: null, tcgplayer_id: "7", market_price: 5 };
  const product = { name: "Booster Box", set: "X", image_url: "x.jpg", tcgplayer_id: "8", market_price: 100 };

  assert.equal(catalogCardResolvable(priced), true);
  assert.equal(catalogCardResolvable(priceless), true); // real + imaged + id -> gets a URL
  assert.equal(catalogCardResolvable(sentinel), true);
  assert.equal(catalogCardResolvable(noImage), false);
  assert.equal(catalogCardResolvable(product), false);

  assert.equal(catalogCardIndexable(priced), true);
  assert.equal(catalogCardIndexable(priceless), false); // resolvable, but not indexable
  assert.equal(catalogCardIndexable(sentinel), false); // sentinel price is not a real price
});

test("pickCatalogMatch: same-slug tie is broken on a STABLE key, never price", () => {
  const rows = [
    { tcgplayer_id: "a", name: "Dark Houndoom", set: "X", market_price: 40, image_url: "x.jpg" },
    { tcgplayer_id: "b", name: "Dark Houndoom", set: "X", market_price: 300, image_url: "x.jpg" },
  ];
  // lowest tcgplayer_id wins - a permanent URL must not point at a
  // different printing just because that printing got more expensive.
  assert.equal(pickCatalogMatch(rows, "dark-houndoom").tcgplayer_id, "a");
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
