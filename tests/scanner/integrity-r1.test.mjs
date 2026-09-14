// integrity-r1 (2026-09-14): two demonstrated integrity defects.
//  1. a raw listing whose title credibly claims a slab grade received a
//     raw-price savings claim;
//  2. explicit incompatible letter-prefixed / promo collector numbers did
//     not prevent a confident card match (TG05/TG30 matched Pikachu V
//     TG16/TG30 and published 32-63% "savings").
// Pure-function cases here; the real route paths run in
// integrity-r1-e2e.test.mjs. Titles marked (live) are active production
// listings from the read-only evidence capture.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dm = require(join(REPO, "lib/dealMatching.js"));
const dq = require(join(REPO, "lib/dealQuality.js"));
const read = (p) => readFileSync(join(REPO, p), "utf8");
const evidence = JSON.parse(read("tests/harness/ingestion/evidence/integrity-r1.json"));

test("IR-1. explicit incompatible collector numbers conflict (subset, hash, promo, Japanese promo)", () => {
  const conflicts = [
    ["Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo", "TG16/TG30"], // (live) stored as Pikachu V
    ["Pikachu Tg05/Tg30 Swsh11: Lost Origin Trainer Gallery Holo", "TG16/TG30"], // (live)
    ["Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo", "TG17/TG30"],
    ["Pikachu TG05 Lost Origin Trainer Gallery", "TG17/TG30"],
    ["Deoxys VSTAR GG46/GG70 SWSH: Crown Zenith: Galarian Gallery Holo", "GG45/GG70"], // (live)
    ["Sylveon EX RC21/RC32 Generations Radiant Collection Full Art Holo English 2016", "RC32/RC32"], // (live)
    ["Pikachu VMAX (Secret) Ultra Rare SWSH11: Lost Origin Trainer Gallery TG29/TG30", "TG17/TG30"], // (live)
    ["2019 Pokemon Hidden Fates Shiny Vault #SV64 Lucario GX CGC 10 GEM MINT", "SV22/SV94"],
    ["Vaporeon | H31/H32 | PSA 8 | Skyridge Holo", "033/144"],
    ["PSA 9 Moltres Zapdos Articuno GX SM210 Hidden Fates ETB Promo Pokemon Card MINT", "44/68"],
    ["Detective Pikachu Holofoil SMP SM190 Framestore NM", "10/18"], // (live)
    ["PSA9 Rayquaza EX Promo 122/XY-P Emerald Break", "9/106"], // (live)
    ["PSA 10 Moltres & Zapdos & Articuno GX #69 Secret SM Hidden Fates Pokemon 2019", "SM210"],
    ["Pokemon 2019 SM Destino Nascosto Moltres Zapdos Articuno Tag Team GX #69/68 PSA 10", "SM210"],
    ["Pikachu & Zekrom GX 33/181 SM-Team Up 2019 WCD - NM", "SM168"], // (live)
    ["Shaymin EX (106 Full Art) XY - Roaring Skies [106/108] UR Holofoil NM Pokemon", "XY148"], // (live)
    ["Magikarp Promo XY Generations 20th Anniversary Card 22/83 NM Holo Sealed", "XY143"], // (live)
  ];
  for (const [title, number] of conflicts) assert.equal(dm.collectorNumberConflict(title, number), true, `${title} vs ${number}`);
});

test("IR-2. agreeing, abbreviated, absent and set-code-only numbering stays a match; existing numeric behaviour unchanged", () => {
  const ok = [
    ["Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo", "TG05/TG30"],
    ["Pikachu tg5/tg30 Lost Origin", "TG05/TG30"],
    ["Pikachu TG05 Lost Origin Trainer Gallery", "TG05/TG30"],
    ["Pikachu Lost Origin Trainer Gallery Holo", "TG17/TG30"], // no number stated
    ["2019 Pokemon Hidden Fates Shiny Vault #SV64 Lucario GX CGC 10 GEM MINT", "SV64/SV94"],
    ["Charizard GX SV49/SV94 Hidden Fates Shiny Vault", "SV49/SV94"],
    ["Charizard GX Hidden Fates Shiny Vault SV3 promo", "SV49/SV94"], // "SV3" is not trusted as a subset number
    ["Vaporeon | H31/H32 | PSA 8 | Skyridge Holo", "H31/H32"],
    ["PSA 9 Moltres Zapdos Articuno GX SM210 Hidden Fates ETB Promo Pokemon Card MINT", "SM210"],
    ["Pokemon 2019 SM Destino Nascosto Moltres Zapdos Articuno Tag Team GX #69/68 PSA 10", "69/68"],
    ["Giratina VSTAR S11 Lost Abyss Holo", "131/196"], // set code only
    ["Charizard V Lost Origin SWSH11", "019/196"], // expansion code, not a promo number
    ["Charizard V SWSH11 Lost Origin 019/196", "019/196"],
    ["Charizard V SWSH050 Black Star Promo", "SWSH050"],
    ["Pikachu XY Evolutions 35/108 XY12", "35/108"],
    ["Charizard Base Set 4/102 Holo", "4/102"],
    ["Mew EX Legend Maker #10", "10/92"],
    ["Pikachu #SM81 Black Star", "SM81"],
    ["Pokemon Celebi Prime Holo Triumphant 92 PSA 8", "3/102"], // bare number: still no opinion (documented residual)
  ];
  for (const [title, number] of ok) assert.equal(dm.collectorNumberConflict(title, number), false, `${title} vs ${number}`);
  // pre-existing numeric outcomes (P0.3.1) unchanged
  assert.equal(dm.collectorNumberConflict("Charizard Base Set 2/102 Holo", "4/102"), true);
  assert.equal(dm.collectorNumberConflict("Vaporeon 33/144 Skyridge Holo", "H31/H32"), true);
});

test("IR-3. the matcher refuses the live wrong card and keeps the right one", () => {
  const listing = { title: "Pikachu TG05/TG30 Swsh11: Lost Origin Trainer Gallery Holo" };
  const pikachuV = { name: "Pikachu V", set: "SWSH11: Lost Origin Trainer Gallery", card_number: "TG16/TG30", language: "english" };
  const pikachu = { name: "Pikachu", set: "SWSH11: Lost Origin Trainer Gallery", card_number: "TG05/TG30", language: "english" };
  assert.equal(dm.listingMatchesCard(listing, pikachuV), false);
  assert.equal(dm.listingMatchesCard(listing, pikachu), true);
  const moltres = { title: "PSA 9 Moltres Zapdos Articuno GX SM210 Hidden Fates ETB Promo Pokemon Card MINT" };
  assert.equal(dm.listingMatchesCard(moltres, { name: "Moltres & Zapdos & Articuno GX", set: "Hidden Fates", card_number: "44/68", language: "english" }), false);
  assert.equal(dm.listingMatchesCard(moltres, { name: "Moltres & Zapdos & Articuno GX", set: "SM Promos", card_number: "SM210", language: "english" }), true);
});

test("IR-4. credible slab-grade claims vs raw copies that merely mention grading", () => {
  const claims = [
    "PSA 9 Charizard GX SV49/SV94 | Hidden Fates Shiny Vault FA Shiny Holo EN 2019", // (live)
    "Pokemon CHARIZARD EX PSA 8.5 XY Low Pop Evolutions 2016 Rare Evolutions Bgs Mint", // (live)
    "2017 Pokemon S&M Promos Black Star Pikachu HOLO #SM81 (CGA 8.5)", // (live)
    "PSA9 Rayquaza EX Promo 122/XY-P Emerald Break", // (live)
    "Pokemon 2016 Evolutions Mega Blastoise Ex Full Art 102/108 Ace 9 Ultra Rare", // (live)
    "Pokemon BGS 9 Lugia #29 Reverse Stamp EX Unseen Forces 2005 English",
    "POKEMON DARK SCIZOR NEO DESTINY CARD 9/105 ITA GRADE 7.5 TRADING CARD GAME",
  ];
  const raw = [
    "PSA 10 Contender!!! Zapdos ex 202/165 Sv: Scarlet & Violet 151 Holo", // (live)
    "Solgaleo & Lunala GX (Full Art) 216/236 Cosmic Eclipse Holo - PSA 1 Worthy",
    "2000 Pokémon Base Set 2 Zapdos Holo 20/130 WOTC Raw NM PSA 8 Contender",
    "Lugia 14/132 Secret Wonders Holo, likely PSA -1",
    "Mewtwo base set holo unlimited PSA 6 or 7 WOTC",
    "Umbreon XY96 XY Promo Pokemon Extended Artwork For PSA CGC BGS or TAG",
    "Pikachu & Zekrom GX Tag Team 9/236 Unified Minds",
    "Professor Research Ace Spec 9/91 Paldean Fates",
    "Charizard 4/102 Base Set Holo Gem Mint 10?",
    "Pikachu PSA ready 25/102",
    "Mew CGC 10/10 centering raw",
    "Charizard ex 199/165 SV 151 Ace 10/10 condition",
    "Pikachu 25/102 Base Set Holo Near Mint",
  ];
  for (const t of claims) assert.equal(dm.titleClaimsSlabGrade(t), true, t);
  for (const t of raw) assert.equal(dm.titleClaimsSlabGrade(t), false, t);
});

test("IR-5. display: a raw row with a credible slab claim is hidden with a named reason; graded rows and 'Contender' raw rows are not", () => {
  const byId = new Map(evidence.deals.map((d) => [d.id, d]));
  for (const id of [27488, 35441, 35970, 37955]) {
    const row = byId.get(id);
    assert.equal(dq.isDisplayableDeal(row), false, `deal ${id}`);
    assert.equal(dq.disqualificationReason(row), "identity:graded_title_on_raw", `deal ${id}`);
  }
  const contender = byId.get(37679);
  assert.equal(dq.isDisplayableDeal(contender), true);
  assert.equal(dq.disqualificationReason(contender), null);
  // a graded row with the same wording is judged by the graded rules, not this one
  assert.equal(dq.disqualificationReason({ ...byId.get(27488), is_graded: true, grader: "PSA", grade: "9" }), null);
});

test("IR-6. wiring: every raw ingestion path refuses a slab claim before pricing; nothing re-prices it as graded", () => {
  const refresh = read("app/api/refresh-deals/route.js");
  const perCard = refresh.slice(refresh.indexOf("for (const listing of referenceUnverified ? [] : rawListings)"), refresh.indexOf("let condition = classifyListingCondition", refresh.indexOf("for (const listing of referenceUnverified ? [] : rawListings)")));
  assert.match(perCard, /if \(titleClaimsSlabGrade\(listing\.title\)\) continue;/);
  const sweepRaw = refresh.slice(refresh.indexOf("// integrity-r1: same raw-branch refusal as the per-card scan."), refresh.indexOf("const marketData = await cachedConditionPrices(row);"));
  assert.match(sweepRaw, /if \(titleClaimsSlabGrade\(listing\.title\)\) continue;/);
  const feed = read("app/api/ingest-feed/route.js");
  const feedGate = feed.indexOf("if (titleClaimsSlabGrade(listing.title)) {");
  assert.ok(feedGate > feed.indexOf("if (listing.isGraded) {") && feedGate < feed.indexOf("const match = matchCatalog(listing, catalogIndex);"));
  const gate = read("lib/dealQuality.js");
  assert.match(gate, /if \(row\.is_graded\) return true;\s*\/\/[\s\S]*?if \(titleClaimsSlabGrade\(row\.title \?\? ""\)\) return false;/);
});
