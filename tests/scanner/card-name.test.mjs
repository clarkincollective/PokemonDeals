// Shared card-display-identity layer (lib/cardName). The catalogue name
// carries the real identity for the cards that need it; this layer keeps
// it verbatim and only removes TCGplayer's "(#NN)" collector-number
// parenthetical for display (the number is on the identity line).
// Nothing here mutates stored data.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cardDisplayName, cardIdentityLine, cardMetaLabel } from "../../lib/cardName.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- identity markers are preserved verbatim -------------------------

test("1. plain official species names stay exactly as-is", () => {
  for (const n of ["Charizard", "Pikachu", "Mewtwo", "Dragonite", "Eevee", "Houndoom", "Ivysaur"]) {
    assert.equal(cardDisplayName({ name: n }), n);
  }
});

test("2-5. ex / EX / Mega / M / GX / V / VMAX / VSTAR / BREAK / LV.X preserved with original casing", () => {
  const cases = [
    "Charizard ex",
    "M Charizard EX",
    "Mega Charizard X ex",
    "Dragonite EX (Full Art)",
    "Mega Dragonite ex",
    "Charizard V",
    "Charizard VMAX",
    "Charizard VSTAR",
    "Greninja BREAK",
    "Dialga LV.X",
    "Mewtwo GX",
    "Pikachu & Zekrom GX",
    "Reshiram & Charizard GX",
  ];
  for (const n of cases) assert.equal(cardDisplayName({ name: n }), n, n);
});

test("6. Swampert and Swampert ex remain distinct display names", () => {
  assert.equal(cardDisplayName({ name: "Swampert" }), "Swampert");
  assert.equal(cardDisplayName({ name: "Swampert ex" }), "Swampert ex");
  assert.notEqual(cardDisplayName({ name: "Swampert" }), cardDisplayName({ name: "Swampert ex" }));
});

test("7-8. Dark / Light / owner prefixes are never reduced to the species", () => {
  for (const n of [
    "Dark Charizard",
    "Light Dragonite",
    "Blaine's Charizard",
    "Rocket's Sneasel ex",
    "Lt. Surge's Fearow",
    "Team Rocket's Meowth",
    "Erika's Dratini",
    "Giovanni's Machamp",
  ]) {
    assert.equal(cardDisplayName({ name: n }), n, n);
  }
});

test("9. TAG TEAM / '&' names stay complete", () => {
  assert.equal(
    cardDisplayName({ name: "Pikachu & Zekrom GX" }),
    "Pikachu & Zekrom GX"
  );
  assert.equal(
    cardDisplayName({ name: "Mewtwo & Mew GX" }),
    "Mewtwo & Mew GX"
  );
});

// --- only the pure collector-number parenthetical is removed ---------

test("collector-number parenthetical is stripped for display (number shown on the identity line)", () => {
  assert.equal(cardDisplayName({ name: "Pikachu (#20)" }), "Pikachu");
  assert.equal(cardDisplayName({ name: "Charizard (020)" }), "Charizard");
  assert.equal(cardDisplayName({ name: "Snorlax (#1)" }), "Snorlax");
  assert.equal(cardDisplayName({ name: "Rhyhorn (92)" }), "Rhyhorn");
  assert.equal(cardDisplayName({ name: "Gouging Fire (#15/191)" }), "Gouging Fire");
});

test("10. any OTHER parenthetical is a real distinguisher and is kept", () => {
  for (const n of [
    "Charizard (Full Art)",
    "Dragonite EX (Full Art)",
    "Lugia (Secret)",
    "Deoxys (Speed Forme)",
    "Latios (Delta Species)",
    "Kyogre EX (Team Plasma)",
    "Pikachu (Poke Ball Pattern)",
    "Umbreon (Jason Klaczynski)",
    "Charizard (#15 - Latias)", // has extra words -> not a pure number
    "Mew (Prime)",
  ]) {
    assert.equal(cardDisplayName({ name: n }), n, n);
  }
});

test("10b. same-name cards stay distinguishable via the identity line", () => {
  const a = { name: "Gastly (67)", set: "Fossil", cardNumber: "67/214", rarity: "Common" };
  const b = { name: "Gastly (68)", set: "Fossil", cardNumber: "68/214", rarity: "Common" };
  assert.equal(cardDisplayName(a), "Gastly");
  assert.equal(cardDisplayName(b), "Gastly");
  assert.notEqual(cardIdentityLine(a), cardIdentityLine(b));
  assert.equal(cardIdentityLine(a), "Fossil · 67/214 · Common");
});

test("cardIdentityLine / cardMetaLabel shapes", () => {
  const c = { name: "Charizard", set: "Base Set", cardNumber: "4/102", rarity: "Holo Rare" };
  assert.equal(cardIdentityLine(c), "Base Set · 4/102 · Holo Rare");
  assert.equal(cardIdentityLine(c, { withHash: true }), "Base Set · #4/102 · Holo Rare");
  assert.equal(cardIdentityLine(c, { withRarity: false }), "Base Set · 4/102");
  assert.equal(cardMetaLabel(c), "Charizard - Base Set 4/102");
  assert.equal(cardMetaLabel({ name: "Pikachu" }), "Pikachu"); // no set -> bare name
  // does not keyword-stuff
  assert.doesNotMatch(cardMetaLabel(c), /pokemon|cheap|buy|deal|rare holo/i);
});

test("11. cardDisplayName is a pure read - it never mutates the input", () => {
  const raw = { name: "Pikachu (#20)", set: "Team Up", cardNumber: "20/181" };
  const snapshot = JSON.stringify(raw);
  cardDisplayName(raw);
  cardIdentityLine(raw);
  cardMetaLabel(raw);
  assert.equal(JSON.stringify(raw), snapshot);
});

// --- wiring: one helper, everywhere -------------------------------

test("14. species / set / card / search / deal surfaces import the shared helper", () => {
  const files = [
    "components/CatalogueBrowser.js", // species + set pages
    "components/SpeciesCard.js", // featured-value + no-deal lists
    "components/CatalogCardView.js", // /cards/[slug] catalog path
    "app/cards/[slug]/page.js", // /cards/[slug] hub path (H1 + Product JSON-LD)
    "components/DealCard.js", // deal grids
    "app/deals/[id]/page.js", // /deals/[id]
    "app/api/card-search/route.js", // search
  ];
  for (const f of files) {
    const src = readFileSync(join(HERE, "..", "..", f), "utf8");
    assert.match(src, /from "@\/lib\/cardName"/, `${f} does not import lib/cardName`);
  }
});

test("13. /cards/[slug] Product JSON-LD name uses the shared display identity, not the raw name", () => {
  const src = readFileSync(join(HERE, "..", "..", "app", "cards", "[slug]", "page.js"), "utf8");
  // the Product node's name is built from cardName (= cardDisplayName(hub)), not `${hub.name} - ...`
  assert.match(src, /const cardName = cardDisplayName\(hub\)/);
  assert.match(src, /name: `\$\{cardName\} - \$\{hub\.set\}`/);
  assert.doesNotMatch(src, /name: `\$\{hub\.name\} - \$\{hub\.set\}`/);
});

test("12 & 16. no slug / raw-catalogue mutation - helper only transforms strings for display", () => {
  const src = readFileSync(join(HERE, "..", "..", "lib", "cardName.js"), "utf8");
  // strip comments, then assert there is no DB / slug / write machinery
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /\bsupabase\b|\bcreateClient\b|\.from\(|\.update\(|\.upsert\(|slugify\(/);
  // the only things it does are String()/replace/join/filter
  assert.match(code, /\.replace\(/);
});
