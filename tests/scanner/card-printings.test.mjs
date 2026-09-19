// Growth batch 2 (2026-09-20) - "other printings of this card": a strict
// same-number, same-set-family rule over the relations the page already
// loads; rendered first in RelatedCards with each printing's reference.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { otherPrintings, setFamily, sameCollectorNumber } from "../../lib/cardPrintings.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("set family strips the printing qualifier and nothing else", () => {
  assert.equal(setFamily("Base Set (Shadowless)"), "base set");
  assert.equal(setFamily("Base Set"), "base set");
  assert.equal(setFamily("Base Set 2"), "base set 2");
  assert.equal(setFamily("XY - Evolutions"), "xy - evolutions");
});

test("collector numbers match on the numerator, zero-padding ignored, denominators compared when present", () => {
  assert.equal(sameCollectorNumber("004/102", "4/102"), true);
  assert.equal(sameCollectorNumber("4/102", "4/130"), false);
  assert.equal(sameCollectorNumber("11/108", "11/108"), true);
  assert.equal(sameCollectorNumber("SWSH020", "SWSH020"), false, "promo codes are not collector numbers here");
  assert.equal(sameCollectorNumber(null, "4/102"), false);
});

test("Shadowless is a printing of Base Set Charizard; Base Set 2 and Evolutions are not; highest reference first", () => {
  const current = { set: "Base Set", cardNumber: "004/102" };
  const siblings = [
    { slug: "charizard-base-set-shadowless", displayName: "Charizard", set: "Base Set (Shadowless)", cardNumber: "004/102", refPrice: 1840 },
    { slug: "charizard-base-set-2", displayName: "Charizard", set: "Base Set 2", cardNumber: "004/130", refPrice: 210 },
    { slug: "charizard-xy-evolutions", displayName: "Charizard", set: "XY - Evolutions", cardNumber: "11/108", refPrice: 30 },
    { slug: "charizard-base-set", displayName: "Charizard", set: "Base Set", cardNumber: "004/102", refPrice: 640 },
  ];
  assert.deepEqual(otherPrintings(current, siblings).map((c) => c.slug), ["charizard-base-set-shadowless"]);
  assert.deepEqual(otherPrintings({ set: "Base Set (Shadowless)", cardNumber: "4/102" }, siblings).map((c) => c.slug), ["charizard-base-set"]);
  assert.deepEqual(otherPrintings({ set: "Base Set" }, siblings), [], "no number -> no claim");
  assert.deepEqual(otherPrintings(null, siblings), []);
});

test("rendered first in RelatedCards with a labelled reference, no '$' (the worth answer keeps the page's one '$' reference)", () => {
  const src = read("components/RelatedCards.js");
  assert.match(src, /Other printings of this card/);
  assert.match(src, /they are never compared with each other/);
  assert.match(src, /\$\{Number\(v\)\.toFixed\(2\)\} USD/);
  assert.doesNotMatch(src, /\$\{?refText/);
  assert.ok(src.indexOf("{printingsBlock}") < src.indexOf("{sameSpecies.length > 0 && ("), "printings before the same-Pokemon list");
  assert.match(read("app/cards/[slug]/page.js"), /printings=\{otherPrintings\(\{ set: hub\.set, cardNumber: cardCollectorNumber \}, sameSpecies\)\}/);
});
