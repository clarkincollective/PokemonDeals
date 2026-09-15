// unown-identity-r1 - Unown letter identity in the shared matcher
// (listingMatchesCard), which both the scanner and the read-time display gate
// (listingStillMatchesCatalogue) use. Titles below are the reported stored
// listings; catalogue identities are the real card_catalog rows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dm = require(join(REPO, "lib/dealMatching.js"));
const { listingStillMatchesCatalogue } = require(join(REPO, "lib/dealQuality.js"));

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "!", "?"];
const uf = (l) => ({ name: `Unown (${l})`, set: "EX Unseen Forces", language: "english", card_number: `${l}/28` });
const matches = (title, card) => dm.listingMatchesCard({ title }, card);
// the display gate sees name/set/language only - no card_number
const displays = (title, card) => listingStillMatchesCatalogue({ title, card_name: card.name, card_set: card.set, card_language: card.language });
const matchedLetters = (title, via = matches) => LETTERS.filter((l) => via(title, uf(l)));

test("UI-1. the reported listings match only their own letter, on the scanner and display paths", () => {
  const cases = [
    ["Unown R/28 Holo Rare Unseen Forces Pokemon Near Mint/NM", "R"], // deal 38057, stored as Unown (M)
    ["2005 POKEMON EX UNSEEN FORCES #W/28 UNOWN HOLO PSA 7", "W"], // deal 21176, stored as Unown (!)
    ["2005 POKEMON EX UNSEEN FORCES #J/28 UNOWN HOLO PSA 8", "J"], // deal 24375
    ["2005 Pokemon Ex Unseen Forces #D/28 Unown Holo PSA 8 Nm Mt", "D"], // deal 18268
    ["2005 Pokémon Unown Ex Unseen Forces Holo K/28", "K"], // deal 37875, stored as Unown (?)
  ];
  for (const [title, letter] of cases) {
    assert.deepEqual(matchedLetters(title), [letter], title);
    assert.deepEqual(matchedLetters(title, displays), [letter], `display: ${title}`);
  }
  assert.equal(matches("Unown R/28 Holo Rare Unseen Forces Pokemon Near Mint/NM", uf("M")), false);
  assert.equal(displays("2005 POKEMON EX UNSEEN FORCES #W/28 UNOWN HOLO PSA 7", uf("!")), false);
});

test("UI-2. every letter, ! and ? stays eligible for its own card and no other", () => {
  for (const l of LETTERS) {
    for (const title of [`Unown ${l}/28 Holo Rare EX Unseen Forces`, `Unown (${l}) ${l}/28 EX Unseen Forces Holo`, `Pokemon EX Unseen Forces #${l}/28 Unown Holo PSA 9`]) {
      assert.deepEqual(matchedLetters(title), [l], title);
      assert.deepEqual(matchedLetters(title, displays), [l], `display: ${title}`);
    }
  }
  // punctuation letters in their other written forms
  assert.deepEqual(matchedLetters("Unown (?) Holo EX Unseen Forces NM"), ["?"]);
  assert.deepEqual(matchedLetters("Unown [!] EX Unseen Forces Holo"), ["!"]);
  assert.deepEqual(matchedLetters("Pokemon Unown ! EX Unseen Forces Holo Rare"), ["!"]);
  assert.deepEqual(matchedLetters("Pokemon TCG - Unown n - Unseen Forces - Holo Rare"), ["N"]);
});

test("UI-3. ambiguous titles are never assigned a guessed letter", () => {
  for (const title of [
    "Pokémon TCG 2005 Unown Holo 1/28 Unseen Forces Secret Rare A28", // numeric pair, "A28" is not a letter number
    "Unown - Holo Rare 1/28 - 2005 Pokemon Unseen Forces - Secret Rare - LP",
    "2005 POKEMON EX UNSEEN FORCES UNOWN HOLO PSA 8", // no letter at all
    "Unown (E) A/28 Unseen Forces Holo Pokémon Card", // two different letters
    "Unown V Holo EX Unseen Forces", // bare "Unown V" is the V mechanic form, not letter evidence
  ]) {
    assert.deepEqual(matchedLetters(title), [], title);
    assert.deepEqual(matchedLetters(title, displays), [], `display: ${title}`);
  }
  // an explicit letter number still resolves V
  assert.deepEqual(matchedLetters("Unown V V/28 EX Unseen Forces Holo"), ["V"]);
});

test("UI-4. other Unown cards keep their existing numeric identity", () => {
  // Neo Destiny "[X]" rows are numbered: the collector number still decides, a contradicting letter rejects
  const neoX = { name: "Unown [X]", set: "Neo Destiny", language: "english", card_number: "030/105" };
  const neoW = { name: "Unown [W]", set: "Neo Destiny", language: "english", card_number: "029/105" };
  assert.equal(matches("Pokemon Unown [X] 30/105 Neo Destiny Regular Unlimited", neoX), true);
  assert.equal(matches("Pokemon Unown 30/105 Neo Destiny Unlimited", neoX), true, "no letter needed where the number confirms it");
  assert.equal(matches("Pokemon Unown [X] 30/105 Neo Destiny", neoW), false);
  assert.equal(matches("Pokemon Unown [W] 30/105 Neo Destiny", neoX), false, "contradicting letter");
  // Legends Awakened: numeric conflict unchanged
  const laBang = { name: "Unown (!)", set: "Legends Awakened", language: "english", card_number: "42/146" };
  assert.equal(matches("Unown W 80/146 Legends Awakened Pokemon Card Uncommon - NM+", laBang), false);
  assert.equal(matches("Unown (!) 42/146 Legends Awakened Uncommon", laBang), true);
  // Silver Tempest Unown V: the V mechanic, no letter identity asserted
  const uv = { name: "Unown V (Alternate Full Art)", set: "SWSH12: Silver Tempest", language: "english", card_number: "177/195" };
  assert.equal(dm.cardUnownLetter(uv), null);
  assert.equal(dm.unownLetterConflict("Unown V 177/195 Alternate Full Art Silver Tempest PSA 10", uv), false, "the new rule adds no opinion");
  // Japanese letter rows without a bracketed letter are untouched by this rule
  assert.equal(dm.cardUnownLetter({ name: "Unown W", set: "Darkness, and to Light...", language: "japanese" }), null);
});

test("UI-5. non-Unown identity checks are unchanged", () => {
  assert.equal(dm.unownLetterConflict("Pikachu TG05/TG30 Lost Origin", { name: "Pikachu", set: "SWSH11: Lost Origin Trainer Gallery", card_number: "TG05/TG30" }), false);
  assert.equal(dm.collectorNumberConflict("Pikachu TG05/TG30", "TG16/TG30"), true);
  assert.equal(dm.collectorNumberConflict("Deoxys VSTAR GG46/GG70", "GG45/GG70"), true);
  assert.equal(dm.collectorNumberConflict("Charizard 4/102 Base Set", "4/102"), false);
  // a letter-like token in an ordinary title is not read as an Unown letter
  assert.deepEqual([...dm.titleUnownLetters("Charizard PSA 10 4/102 Base Set")], []);
  assert.deepEqual([...dm.titleUnownLetters("PSA/10 Gem Mint N/A")], []);
});
