// Deterministic-matcher precision pass (lib/dealMatching). Added after the
// visual-authenticity work surfaced 47 live IDENTITY_MISMATCH deals -
// genuine cards the matcher had accepted against the wrong catalogue
// printing. These REJECT-only gates run inside listingMatchesCard:
//   - collector-number conflict (value or set-size denominator)
//   - Mega / M-form identity must agree
//   - ex/EX mechanic: catalogue says ex, listing doesn't -> different card
//   - LV.X supertype marker
// They only fire on a POSITIVE contradiction; a title that omits the
// number / form still matches, so abbreviated-but-correct listings are
// unaffected. Visual screening (identity:visual_mismatch) remains the
// backstop for the cases stored data can't resolve.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listingMatchesCard,
  collectorNumberConflict,
  formIdentityConflict,
  megaFormAsserted,
  exMechanicAsserted,
  parseCatalogNumber,
  setEvidenceInTitle,
} from "../../lib/dealMatching.js";

const match = (title, card) => listingMatchesCard({ title }, card);

// --- CASE 1: Mega prefix must matter --------------------------------------

test("1. Mega Dragonite ex 152/217 does NOT match Dragonite-EX 106/108 (Evolutions)", () => {
  // deal 30835 - seller keyword-stuffed "Evolutions" into a modern Mega card
  assert.equal(
    match("Pokémon TCG Mega Dragonite EX Evolutions Full Art Holo 370 HP 152/217 EN", {
      name: "Dragonite EX (Full Art)",
      set: "XY - Evolutions",
      card_number: "106/108",
    }),
    false
  );
});

test("6. a genuine M Charizard EX listing still matches an M Charizard EX catalogue card", () => {
  assert.equal(
    match("Pokémon TCG M Charizard EX (Y) XY Flashfire 69/106 Ultra Rare NM", {
      name: "M Charizard EX (Y)",
      set: "XY - Flashfire",
      card_number: "69/106",
    }),
    true
  );
  // and a modern "Mega X ex" listing matches a "Mega X ex" catalogue card
  assert.equal(
    match("Mega Gardevoir ex 245/167 SV Prismatic Evolutions Full Art", {
      name: "Mega Gardevoir ex",
      set: "SV - Prismatic Evolutions",
      card_number: "245/167",
    }),
    true
  );
});

test("1b. a non-Mega listing must not collapse into a Mega catalogue card and vice-versa", () => {
  // listing asserts Mega, catalogue is plain
  assert.equal(
    match("M Charizard EX 13/108 XY Evolutions Holo Mega Ultra Rare", {
      name: "Charizard",
      set: "XY - Evolutions",
      card_number: "11/108",
    }),
    false
  );
  assert.equal(megaFormAsserted("M Charizard EX 13/108"), true);
  assert.equal(megaFormAsserted("Charizard 4/102 Base Set"), false);
  assert.equal(megaFormAsserted("Mew ex 100/110"), false); // "Mew" is < 3 letters after "m "
});

// --- CASE 2: ex / EX / non-ex identity ----------------------------------

test("2. Swampert (plain) does NOT match Swampert ex", () => {
  assert.equal(
    match("The Pokémon Company Swampert 27/100 EX Crystal Guardians 2006 RH EN Rare 120 HP", {
      name: "Swampert ex",
      set: "EX Crystal Guardians",
      card_number: "98/100",
    }),
    false
  );
});

test("3-5. Metagross / Mew / Lugia (plain) do NOT match their -ex catalogue cards", () => {
  assert.equal(
    match("Pokemon Metagross 11/101 EX Hidden Legends Reverse Holo English Card", {
      name: "Metagross ex", set: "EX Hidden Legends", card_number: "95/101",
    }),
    false
  );
  assert.equal(
    match("SEALED Mew 111/110 EX Holon Phantoms Non-Holo Secret Rare Pokémon Card TCG", {
      name: "Mew ex", set: "EX Holon Phantoms", card_number: "100/110",
    }),
    false
  );
  assert.equal(
    match("Lugia Unseen Forces 29/111 Stamped Reverse Holo NM/Mint Clean Pokemon Card", {
      name: "Lugia ex", set: "EX Unseen Forces", card_number: "105/115",
    }),
    false
  );
});

test("2b. a genuine 'Swampert ex' listing still matches Swampert ex; 'EX <SetName>' alone is not the mechanic", () => {
  assert.equal(
    match("Swampert ex 98/100 EX Crystal Guardians Holo Ultra Rare NM", {
      name: "Swampert ex", set: "EX Crystal Guardians", card_number: "98/100",
    }),
    true
  );
  assert.equal(exMechanicAsserted("Swampert 27/100 EX Crystal Guardians"), false);
  assert.equal(exMechanicAsserted("Swampert ex 98/100 EX Crystal Guardians"), true);
  assert.equal(exMechanicAsserted("Charizard GX 9/68 Hidden Fates"), true);
});

// --- CASE 3: collector number ------------------------------------------

test("7. an explicit collector-number conflict rejects (27/100 vs 98/100)", () => {
  assert.equal(collectorNumberConflict("Swampert 27/100 EX Crystal Guardians", "98/100"), true);
  assert.equal(collectorNumberConflict("Ditto (Charmander) 37/113 EX Delta Species", "35/113"), true);
  // agreement (with zero-pad / spacing / promo-suffix noise) does NOT conflict
  assert.equal(collectorNumberConflict("Sceptile 005 / 017 POP Series 4", "5/17"), false);
  assert.equal(collectorNumberConflict("Charizard 4/102 Base Set Shadowless", "004/102"), false);
  assert.equal(collectorNumberConflict("Solgaleo & Lunala GX 216/236 Cosmic Eclipse", "216/236"), false);
});

test("collector-number: a title with NO number never conflicts (abbreviated listings survive)", () => {
  assert.equal(collectorNumberConflict("Charizard Base Set Holo Rare Unlimited NM", "004/102"), false);
  assert.equal(collectorNumberConflict("Umbreon VMAX Alt Art Evolving Skies PSA 10", "215/203"), false);
  // catalogue number in a format we can't safely parse -> no opinion
  assert.equal(collectorNumberConflict("Mew 25/25 Celebrations", "!/25"), false);
});

// --- CASE 4: set-size sanity -----------------------------------------

test("8. an impossible set denominator rejects (2/102 vs Base Set 2 #002/130)", () => {
  assert.equal(collectorNumberConflict("Blastoise 2/102 Base Set Holo Rare", "002/130"), true);
  assert.equal(collectorNumberConflict("Venusaur 18/130 Base Set 2 WOTC", "013/053"), true);
});

test("8b. a dropped-digit / truncated denominator is treated as a typo, not a set clash", () => {
  // "#11/32" is "11/132" with a dropped digit - same card, seller typo
  assert.equal(collectorNumberConflict("LT. SURGE'S RAICHU (#11/32) Gym Challenge Holo", "011/132"), false);
  // a truncated stored title "... 200/2" must not clash with 200/214
  assert.equal(collectorNumberConflict("Greninja & Zoroark GX (Full Art) Unbroken Bonds 200/2", "200/214"), false);
});

// --- CASE 5: structured aspects are not infallible --------------------

test("9. a wrong 'Evolutions' set token in the title cannot override the collector number + Mega identity", () => {
  // 30835 again: title literally contains "Evolutions" (the wrong set) yet
  // the number (152/217) and the Mega form both independently reject.
  const card = { name: "Dragonite EX (Full Art)", set: "XY - Evolutions", card_number: "106/108" };
  assert.equal(formIdentityConflict("Mega Dragonite EX Evolutions Full Art 152/217", card.name), true);
  assert.equal(collectorNumberConflict("Mega Dragonite EX Evolutions Full Art 152/217", card.card_number), true);
  assert.equal(match("Mega Dragonite EX Evolutions Full Art 152/217", card), false);
});

// --- CASE 6: wrong form / variant -----------------------------------

test("LV.X is a supertype: 'Dialga Lv.68' does NOT match 'Dialga LV.X'", () => {
  assert.equal(
    match("Pokemon Karte Card Dialga Lv. 68 Great Encounters Holo DP", {
      name: "Dialga LV.X", set: "Great Encounters", card_number: "105/106",
    }),
    false
  );
  // a real LV.X listing still matches
  assert.equal(
    match("Dialga LV.X 105/106 Great Encounters Holo Ultra Rare", {
      name: "Dialga LV.X", set: "Great Encounters", card_number: "105/106",
    }),
    true
  );
});

// --- negative / legitimate: nothing good breaks ---------------------

test("10. legitimate abbreviated set titles still match", () => {
  // no collector number, abbreviated set name, no rarity wording
  assert.equal(match("Charizard Base Set Holo", { name: "Charizard", set: "Base Set", card_number: "004/102" }), true);
  assert.equal(
    match("Pikachu Team Up 65/181", { name: "Pikachu", set: "SM - Team Up", card_number: "65/181" }),
    true
  );
  // a plain {name,set} caller with no card_number field is unaffected
  assert.equal(match("Charizard VMAX 020/189 Darkness Ablaze", { name: "Charizard VMAX", set: "Darkness Ablaze" }), true);
});

test("legit: same Pokemon name across eras still matches its own printing", () => {
  assert.equal(match("Charizard ex 199/165 SV 151 Special Illustration Rare", {
    name: "Charizard ex", set: "SV - 151", card_number: "199/165",
  }), true);
  assert.equal(match("Charizard 4/102 Base Set Shadowless Holo", {
    name: "Charizard", set: "Base Set Shadowless", card_number: "4/102",
  }), true);
  assert.equal(match("Blaine's Charizard 2/132 Gym Challenge Holo", {
    name: "Blaine's Charizard", set: "Gym Challenge", card_number: "2/132",
  }), true);
});

test("parseCatalogNumber understands the real card_catalog formats", () => {
  assert.deepEqual(parseCatalogNumber("106/108"), { kind: "pair", num: 106, den: 108 });
  assert.deepEqual(parseCatalogNumber("002/130"), { kind: "pair", num: 2, den: 130 });
  assert.deepEqual(parseCatalogNumber("148"), { kind: "bare", num: 148 });
  assert.deepEqual(parseCatalogNumber("XY79"), { kind: "promo", code: "xy79" });
  assert.deepEqual(parseCatalogNumber("SWSH075"), { kind: "promo", code: "swsh075" });
  assert.equal(parseCatalogNumber("H21/H32").prefix, "h");
  assert.equal(parseCatalogNumber("TWO"), null);
  assert.equal(parseCatalogNumber("101/102 + 102/102"), null);
});

// --- CASE 12: a card NAME that shadows its SET's words ----------------
//
// Regression for the "Here Comes Team Rocket! (15)" pricing failure. The
// card name already contains every word of its set ("Team Rocket"), so
// the old "every set token appears in the title" check was satisfied
// purely by the card-name portion - and a listing for a DIFFERENT
// printing that reuses the same name + collector number (Celebrations:
// Classic Collection #15/82, a $0.90 card) matched the $27 WOTC Holo row
// and showed as a 43-51% "deal" (live: deals 27155 / 31182 / 31243).
// The fix keys on the CHARACTERISTIC (name shadows set + the title
// positively names a reprint-set family the catalogue card is not in),
// never on the card name or a deal id.

const TR15 = { name: "Here Comes Team Rocket! (15)", set: "Team Rocket", card_number: "15/82" };

test("12. a Celebrations: Classic Collection reprint listing does NOT match the WOTC Team Rocket #15 row", () => {
  assert.equal(match("Here Comes Team Rocket! 15/82 Holo Celebrations: Classic Collection Pokemon NM", TR15), false);
  assert.equal(match("Here Comes Team Rocket! Holo Classic Collection 15/82 NM", TR15), false);
});

test("12b. a genuine WOTC Team Rocket #15 listing still matches (terse titles included)", () => {
  assert.equal(match("Here Comes Team Rocket 15/82 Team Rocket Holo Rare WOTC 2000", TR15), true);
  assert.equal(match("Pokemon Here Comes Team Rocket! 15/82 Holo NM", TR15), true); // no set repeated - name+number carry it
  assert.equal(match("Here Comes Team Rocket! 15/82 Holo Rare Unlimited", TR15), true);
});

test("12c. the reprint-marker rule is not name-specific - a title naming a foreign reprint family is rejected", () => {
  // XY Evolutions regular-set cards keyword-matched against the pricier
  // "XY Promos" prerelease-stamp row (live: deals 27302 / 30554 / 30883 /
  // 30888 / 30948). The catalogue row's set ("XY Promos") does not name a
  // reprint family; the listing's does -> reject (prefer no price to the
  // wrong printing's price).
  const promoRow = { name: "Mewtwo (XY Evolutions Prerelease)", set: "XY Promos", card_number: "103/108" };
  assert.equal(match("Mewtwo EX Full Art XY Evolutions 103/108 Ultra Rare", promoRow), false);
  const charRow = { name: "Charizard (XY Evolutions Prerelease)", set: "XY Promos", card_number: "11/108" };
  assert.equal(match("2016 POKEMON XY EVOLUTIONS #11 CHARIZARD REVERSE FOIL", charRow), false);
});

test("12d. name-shadowing does NOT loosen an ordinary card - the strict set check still applies where the name does not shadow the set", () => {
  // "Charizard" does not contain "Base"/"Set", so setEvidenceInTitle
  // stays strict: the set must be named (or the collector number must
  // carry it via the number-conflict gate).
  assert.equal(match("Charizard 4/102 Base Set Shadowless Holo", { name: "Charizard", set: "Base Set Shadowless", card_number: "4/102" }), true);
  assert.equal(match("Charizard Jungle 4/102 Holo", { name: "Charizard", set: "Base Set", card_number: "4/102" }), false);
  // nameShadowsSet branch never touches the tokenised-title path (safe to
  // call with a raw string in that branch)
  assert.equal(
    setEvidenceInTitle("Team Rocket", "Here Comes Team Rocket! (15)", "", "Here Comes Team Rocket! 15/82 Celebrations Classic Collection"),
    false
  );
  assert.equal(
    setEvidenceInTitle("Team Rocket", "Here Comes Team Rocket! (15)", "", "Here Comes Team Rocket! 15/82 Holo WOTC"),
    true
  );
});

// --- CASE 11: visual mismatch gate remains intact ------------------

test("11. the visual-mismatch display gate is untouched by the matcher change", async () => {
  const { visualAuthenticityReason, isDisplayableDeal } = await import("../../lib/dealQuality.js");
  const idm = {
    is_active: true, is_graded: false, condition: "Near Mint", card_language: "english",
    title: "Charizard GX 150/147 Burning Shadows", card_name: "Charizard GX (Secret)", card_set: "SM - Burning Shadows",
    discount_pct: 0.5, market_price: 400,
    listing_url: "https://www.ebay.com/itm/1?x=1", affiliate_url: "https://www.ebay.com/itm/1?x=1&campid=5",
    listing_type: "FIXED_PRICE", auction_end_at: null,
    visual_authenticity_status: "IDENTITY_MISMATCH", visual_authenticity_reason: "vision:different printing",
  };
  assert.equal(visualAuthenticityReason(idm), "identity:visual_mismatch");
  assert.equal(isDisplayableDeal(idm), false);
});
