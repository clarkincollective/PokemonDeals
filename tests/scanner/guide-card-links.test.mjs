// Phase 17C.1 - guide-to-card links. Static + pure: no network. (The live
// destination check - every guide link returns 200, self-canonical,
// indexable - runs against a build; see the phase notes.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { GUIDE_CARDS, GUIDE_SETS, GUIDE_PRODUCTS, PRICE_CHECKER_HREF, GUIDE_LINK_CLASS } from "../../lib/guideLinks.js";

// Sealed products a guide may picture - verified against sealed_catalog on
// 2026-09-20 (name, set, product type, TCGplayer product id); each image
// URL returned 200 image/jpeg from the product CDN that day. No product
// page exists, so every entry links the sealed listings hub.
const VERIFIED_PRODUCTS = {
  evolvingSkiesBoosterBox: ["242436", "Evolving Skies Booster Box", "SWSH07: Evolving Skies", "Booster Box"],
  ascendedHeroesBoosterBundle: ["668541", "Ascended Heroes Booster Bundle", "ME: Ascended Heroes", "Booster Bundle"],
  ascendedHeroesBoosterPack: ["672434", "Ascended Heroes Booster Pack", "ME: Ascended Heroes", "Booster Pack"],
  // Content-audit batch - re-read from sealed_catalog on 2026-09-22
  // (tcgplayer_id, name, set, product_type). The THREE separate 151 boxes
  // and the two Prismatic ETBs are the point of the format guide: a
  // listing title saying "151 ETB" has not yet said which product it is.
  s151EliteTrainerBox: ["503313", "151 Elite Trainer Box", "SV: Scarlet & Violet 151", "Elite Trainer Box"],
  s151PokemonCenterEtb: ["501999", "151 Pokemon Center Elite Trainer Box (Exclusive)", "SV: Scarlet & Violet 151", "Elite Trainer Box"],
  s151UltraPremium: ["502005", "151 Ultra-Premium Collection", "SV: Scarlet & Violet 151", "Collection Box"],
  prismaticEliteTrainerBox: ["593355", "Prismatic Evolutions Elite Trainer Box", "SV: Prismatic Evolutions", "Elite Trainer Box"],
  prismaticPokemonCenterEtb: ["593324", "Prismatic Evolutions Pokemon Center Elite Trainer Box (Exclusive)", "SV: Prismatic Evolutions", "Elite Trainer Box"],
  prismaticBoosterBundle: ["600518", "Prismatic Evolutions Booster Bundle", "SV: Prismatic Evolutions", "Booster Bundle"],
  crownZenithEliteTrainerBox: ["453470", "Crown Zenith Elite Trainer Box", "SWSH: Crown Zenith", "Elite Trainer Box"],
};

test("1b. every guide product is a verified sealed_catalog identity, links the sealed hub, and the booster-box guide pictures the three pack counts", () => {
  assert.deepEqual(Object.keys(GUIDE_PRODUCTS).sort(), Object.keys(VERIFIED_PRODUCTS).sort());
  for (const [key, [id, name, set, type]] of Object.entries(VERIFIED_PRODUCTS)) {
    const p = GUIDE_PRODUCTS[key];
    assert.equal(p.tcgplayerId, id, key);
    assert.equal(p.name, name, key);
    assert.equal(p.set, set, key);
    assert.equal(p.productType, type, key);
    assert.equal(p.href, "/sealed-deals", key);
  }
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app/guides/pokemon-booster-box-prices/page.js"), "utf8");
  assert.match(src, /<ProductGallery/);
  // The pack-count comparison this guide is built on. Named explicitly, so
  // registering a product for a DIFFERENT guide can never satisfy it.
  for (const k of ["evolvingSkiesBoosterBox", "ascendedHeroesBoosterBundle", "ascendedHeroesBoosterPack"]) {
    assert.match(src, new RegExp(`GUIDE_PRODUCTS\\.${k}`), k);
  }
  assert.doesNotMatch(src, /\$\s?\d/, "no price in the guide");
  // and no verified product is registered without being used: an unused
  // entry is an unverifiable claim sitting in the registry
  const allGuides = GUIDE_FILES.map(read).join("\n");
  for (const k of Object.keys(VERIFIED_PRODUCTS)) {
    assert.match(allGuides, new RegExp(`GUIDE_PRODUCTS\\.${k}\\b`), `${k}: verified but pictured by no guide`);
  }
  const art = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "components/guides/CardArt.js"), "utf8");
  assert.match(art, /export function ProductTile/);
  assert.match(art, /alt=\{`\$\{product\.label\} — \$\{product\.productType\}, product photo`\}/);
  assert.match(art, /height=\{width\}/, "square product photo, square reserved box");
  assert.match(art, /maxWidth: "calc\(50% - 0\.5rem\)"/, "two tiles per row on a phone");
});
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
  arcanineBaseSet: ["42364", "Arcanine", "Base Set", "023/102", "/cards/arcanine-base-set"],
  arcanineShadowless: ["107018", "Arcanine", "Base Set (Shadowless)", "023/102", "/cards/arcanine-base-set-shadowless"],
  promoGlaceonBw90: ["85748", "Glaceon - BW90", "Black and White Promos", "BW90", "/cards/glaceon-bw90-black-and-white-promos"],
  promoEeveeSwsh042: ["220271", "Eevee - SWSH042", "SWSH: Sword & Shield Promo Cards", "SWSH042", "/cards/eevee-swsh042-swsh-sword-shield-promo-cards"],
  promoPikachuSwsh020: ["214241", "Pikachu - SWSH020", "SWSH: Sword & Shield Promo Cards", "SWSH020", "/cards/pikachu-swsh020-swsh-sword-shield-promo-cards"],
  promoMewExSvp053: ["518871", "Mew ex - 053", "SV: Scarlet & Violet Promo Cards", "053", "/cards/mew-ex-053-sv-scarlet-violet-promo-cards"],
  promoCharizardXyPrerelease: ["126023", "Charizard - 11/108 (Prerelease)", "XY Promos", "11/108", "/cards/charizard-11-108-prerelease-xy-promos"],
  promoCharizardGLvxDp45: ["84202", "Charizard G LV.X - DP45", "Diamond and Pearl Promos", "DP45", "/cards/charizard-g-lv-x-dp45-diamond-and-pearl-promos"],
  promoPikachuHgss03: ["88098", "Pikachu - HGSS03", "HGSS Promos", "HGSS03", "/cards/pikachu-hgss03-hgss-promos"],
  promoVoltorbProfessor: ["651981", "Voltorb - 066/193", "Professor Program Promos", "066/193", "/cards/voltorb-066-193-professor-program-promos"],
  promoPikachu227SP: ["257103", "Pikachu - 227/S-P", "SWSH: Sword & Shield Promo Cards", "227/S-P", "/cards/pikachu-227-s-p-swsh-sword-shield-promo-cards"],
  promoPikachuMe093: ["712963", "Pikachu - 093", "ME: Mega Evolution Promo", "093", "/cards/pikachu-093-me-mega-evolution-promo"],
  promoMewWotc08: ["87394", "Mew (8)", "WoTC Promo", "08/53", "/cards/mew-8-wotc-promo"],
  rayquazaAscendedHeroes: ["675965", "Rayquaza", "ME: Ascended Heroes", "153/217", "/cards/rayquaza-me-ascended-heroes"],
  // Delta Reign guide galleries - verified against card_catalog and
  // resolved live (200) on 2026-09-20.
  golurkBlackBolt: ["642578", "Golurk - 123/086", "SV: Black Bolt", "123/086", "/cards/golurk-123-086-sv-black-bolt"],
  malamarExPhantomForces: ["94684", "Malamar EX (115 Full Art)", "XY - Phantom Forces", "115/119", "/cards/malamar-ex-115-full-art-xy-phantom-forces"],
  golisopodExParadoxRift: ["523927", "Golisopod ex - 246/182", "SV04: Paradox Rift", "246/182", "/cards/golisopod-ex-246-182-sv04-paradox-rift"],
  arcanineBaseSet2: ["42472", "Arcanine", "Base Set 2", "033/130", "/cards/arcanine-base-set-2"],
  umbreonVmax: ["246720", "Umbreon VMAX", "SWSH07: Evolving Skies", "095/203", "/cards/umbreon-vmax-swsh07-evolving-skies"],
  umbreonVmaxSecret: ["246722", "Umbreon VMAX (Secret)", "SWSH07: Evolving Skies", "214/203", "/cards/umbreon-vmax-secret-swsh07-evolving-skies"],
  umbreonVmaxAltArt: ["246723", "Umbreon VMAX (Alternate Art Secret)", "SWSH07: Evolving Skies", "215/203", "/cards/umbreon-vmax-alternate-art-secret-swsh07-evolving-skies"],
  pikachuVFullArt: ["226431", "Pikachu V (Full Art)", "SWSH04: Vivid Voltage", "170/185", "/cards/pikachu-v-full-art-swsh04-vivid-voltage"],
  charmanderGenerations: ["113744", "Charmander", "Generations: Radiant Collection", "RC3/RC32", "/cards/charmander-generations-radiant-collection"],
  // 30th Celebration guide - verified against card_catalog and resolved
  // live (200) on 2026-09-16.
  c30FuecocoEx015: ["716448", "Fuecoco ex - 015/128", "ME: 30th Celebration", "015/128", "/cards/fuecoco-ex-015-128-me-30th-celebration"],
  c30GreninjaEx021: ["696676", "Greninja ex - 021/128", "ME: 30th Celebration", "021/128", "/cards/greninja-ex-021-128-me-30th-celebration"],
  c30PikachuRare023: ["712934", "Pikachu - 023/128", "ME: 30th Celebration", "023/128", "/cards/pikachu-023-128-me-30th-celebration"],
  c30PikachuRare024: ["716309", "Pikachu - 024/128", "ME: 30th Celebration", "024/128", "/cards/pikachu-024-128-me-30th-celebration"],
  c30PikachuRare025: ["712935", "Pikachu - 025/128", "ME: 30th Celebration", "025/128", "/cards/pikachu-025-128-me-30th-celebration"],
  c30PikachuRare026: ["712936", "Pikachu - 026/128", "ME: 30th Celebration", "026/128", "/cards/pikachu-026-128-me-30th-celebration"],
  c30PikachuRare027: ["716310", "Pikachu - 027/128", "ME: 30th Celebration", "027/128", "/cards/pikachu-027-128-me-30th-celebration"],
  c30PikachuRare028: ["712937", "Pikachu - 028/128", "ME: 30th Celebration", "028/128", "/cards/pikachu-028-128-me-30th-celebration"],
  c30PikachuRare029: ["716311", "Pikachu - 029/128", "ME: 30th Celebration", "029/128", "/cards/pikachu-029-128-me-30th-celebration"],
  c30PikachuRare030: ["712938", "Pikachu - 030/128", "ME: 30th Celebration", "030/128", "/cards/pikachu-030-128-me-30th-celebration"],
  c30PikachuRare031: ["716312", "Pikachu - 031/128", "ME: 30th Celebration", "031/128", "/cards/pikachu-031-128-me-30th-celebration"],
  c30PikachuRare032: ["712939", "Pikachu - 032/128", "ME: 30th Celebration", "032/128", "/cards/pikachu-032-128-me-30th-celebration"],
  c30PikachuRare033: ["712940", "Pikachu - 033/128", "ME: 30th Celebration", "033/128", "/cards/pikachu-033-128-me-30th-celebration"],
  c30PikachuRare034: ["712941", "Pikachu - 034/128", "ME: 30th Celebration", "034/128", "/cards/pikachu-034-128-me-30th-celebration"],
  c30PikachuRare035: ["716313", "Pikachu - 035/128", "ME: 30th Celebration", "035/128", "/cards/pikachu-035-128-me-30th-celebration"],
  c30PikachuRare036: ["696680", "Pikachu - 036/128", "ME: 30th Celebration", "036/128", "/cards/pikachu-036-128-me-30th-celebration"],
  c30PikachuRare037: ["696681", "Pikachu - 037/128", "ME: 30th Celebration", "037/128", "/cards/pikachu-037-128-me-30th-celebration"],
  c30PikachuRare038: ["712942", "Pikachu - 038/128", "ME: 30th Celebration", "038/128", "/cards/pikachu-038-128-me-30th-celebration"],
  c30PikachuRare039: ["712943", "Pikachu - 039/128", "ME: 30th Celebration", "039/128", "/cards/pikachu-039-128-me-30th-celebration"],
  c30PikachuRare040: ["712944", "Pikachu - 040/128", "ME: 30th Celebration", "040/128", "/cards/pikachu-040-128-me-30th-celebration"],
  c30PikachuRare041: ["712945", "Pikachu - 041/128", "ME: 30th Celebration", "041/128", "/cards/pikachu-041-128-me-30th-celebration"],
  c30PikachuRare042: ["712946", "Pikachu - 042/128", "ME: 30th Celebration", "042/128", "/cards/pikachu-042-128-me-30th-celebration"],
  c30PikachuRare043: ["712947", "Pikachu - 043/128", "ME: 30th Celebration", "043/128", "/cards/pikachu-043-128-me-30th-celebration"],
  c30PikachuRare044: ["712948", "Pikachu - 044/128", "ME: 30th Celebration", "044/128", "/cards/pikachu-044-128-me-30th-celebration"],
  c30PikachuRare045: ["716314", "Pikachu - 045/128", "ME: 30th Celebration", "045/128", "/cards/pikachu-045-128-me-30th-celebration"],
  c30PikachuRare046: ["716315", "Pikachu - 046/128", "ME: 30th Celebration", "046/128", "/cards/pikachu-046-128-me-30th-celebration"],
  c30PikachuRare047: ["696682", "Pikachu - 047/128", "ME: 30th Celebration", "047/128", "/cards/pikachu-047-128-me-30th-celebration"],
  c30PikachuRare048: ["716316", "Pikachu - 048/128", "ME: 30th Celebration", "048/128", "/cards/pikachu-048-128-me-30th-celebration"],
  c30PikachuRare049: ["712949", "Pikachu - 049/128", "ME: 30th Celebration", "049/128", "/cards/pikachu-049-128-me-30th-celebration"],
  c30PikachuRare050: ["712950", "Pikachu - 050/128", "ME: 30th Celebration", "050/128", "/cards/pikachu-050-128-me-30th-celebration"],
  c30PikachuRare051: ["716317", "Pikachu - 051/128", "ME: 30th Celebration", "051/128", "/cards/pikachu-051-128-me-30th-celebration"],
  c30PikachuRare052: ["716318", "Pikachu - 052/128", "ME: 30th Celebration", "052/128", "/cards/pikachu-052-128-me-30th-celebration"],
  c30PikachuEx053: ["712951", "Pikachu ex - 053/128", "ME: 30th Celebration", "053/128", "/cards/pikachu-ex-053-128-me-30th-celebration"],
  c30PikachuEx054: ["712952", "Pikachu ex - 054/128", "ME: 30th Celebration", "054/128", "/cards/pikachu-ex-054-128-me-30th-celebration"],
  c30Mewtwo063: ["716462", "Mewtwo", "ME: 30th Celebration", "063/128", "/cards/mewtwo-me-30th-celebration"],
  c30MewtwoEx064: ["716463", "Mewtwo ex - 064/128", "ME: 30th Celebration", "064/128", "/cards/mewtwo-ex-064-128-me-30th-celebration"],
  c30Mew065: ["716464", "Mew", "ME: 30th Celebration", "065/128", "/cards/mew-me-30th-celebration"],
  c30MewEx066: ["716465", "Mew ex - 066/128", "ME: 30th Celebration", "066/128", "/cards/mew-ex-066-128-me-30th-celebration"],
  c30EspeonEx: ["696834", "Espeon ex", "ME: 30th Celebration", "070/128", "/cards/espeon-ex-me-30th-celebration"],
  c30SylveonEx071: ["696677", "Sylveon ex - 071/128", "ME: 30th Celebration", "071/128", "/cards/sylveon-ex-071-128-me-30th-celebration"],
  c30UmbreonEx: ["696835", "Umbreon ex", "ME: 30th Celebration", "092/128", "/cards/umbreon-ex-me-30th-celebration"],
  c30JirachiEx102: ["716495", "Jirachi ex - 102/128", "ME: 30th Celebration", "102/128", "/cards/jirachi-ex-102-128-me-30th-celebration"],
  c30SalamenceEx109: ["716502", "Salamence ex - 109/128", "ME: 30th Celebration", "109/128", "/cards/salamence-ex-109-128-me-30th-celebration"],
  c30AlolanExeggutorIr: ["716218", "Alolan Exeggutor - 129/128", "ME: 30th Celebration", "129/128", "/cards/alolan-exeggutor-129-128-me-30th-celebration"],
  c30IrMoltres130: ["716219", "Moltres - 130/128", "ME: 30th Celebration", "130/128", "/cards/moltres-130-128-me-30th-celebration"],
  c30LaprasIr: ["696683", "Lapras - 131/128", "ME: 30th Celebration", "131/128", "/cards/lapras-131-128-me-30th-celebration"],
  c30IrArticuno132: ["716220", "Articuno - 132/128", "ME: 30th Celebration", "132/128", "/cards/articuno-132-128-me-30th-celebration"],
  c30IrZapdos133: ["716221", "Zapdos - 133/128", "ME: 30th Celebration", "133/128", "/cards/zapdos-133-128-me-30th-celebration"],
  c30IrToxtricity134: ["716222", "Toxtricity - 134/128", "ME: 30th Celebration", "134/128", "/cards/toxtricity-134-128-me-30th-celebration"],
  c30IrMorpeko135: ["716223", "Morpeko - 135/128", "ME: 30th Celebration", "135/128", "/cards/morpeko-135-128-me-30th-celebration"],
  c30IrDrifloon136: ["696684", "Drifloon - 136/128", "ME: 30th Celebration", "136/128", "/cards/drifloon-136-128-me-30th-celebration"],
  c30IrChandelure137: ["716224", "Chandelure - 137/128", "ME: 30th Celebration", "137/128", "/cards/chandelure-137-128-me-30th-celebration"],
  c30IrLycanroc138: ["696685", "Lycanroc - 138/128", "ME: 30th Celebration", "138/128", "/cards/lycanroc-138-128-me-30th-celebration"],
  c30IrAlolanMeowth139: ["714360", "Alolan Meowth - 139/128", "ME: 30th Celebration", "139/128", "/cards/alolan-meowth-139-128-me-30th-celebration"],
  c30IrScraggy140: ["716225", "Scraggy - 140/128", "ME: 30th Celebration", "140/128", "/cards/scraggy-140-128-me-30th-celebration"],
  c30IrGalarianMeowth141: ["716226", "Galarian Meowth - 141/128", "ME: 30th Celebration", "141/128", "/cards/galarian-meowth-141-128-me-30th-celebration"],
  c30IrGholdengo142: ["716227", "Gholdengo - 142/128", "ME: 30th Celebration", "142/128", "/cards/gholdengo-142-128-me-30th-celebration"],
  c30IrMeowth144: ["714358", "Meowth - 144/128", "ME: 30th Celebration", "144/128", "/cards/meowth-144-128-me-30th-celebration"],
  c30HisuianZoruaIr: ["696686", "Hisuian Zorua - 145/128", "ME: 30th Celebration", "145/128", "/cards/hisuian-zorua-145-128-me-30th-celebration"],
  c30MausholdIr: ["716228", "Maushold - 146/128", "ME: 30th Celebration", "146/128", "/cards/maushold-146-128-me-30th-celebration"],
  c30SirFuecocoEx147: ["716229", "Fuecoco ex - 147/128", "ME: 30th Celebration", "147/128", "/cards/fuecoco-ex-147-128-me-30th-celebration"],
  c30GreninjaExSir: ["716230", "Greninja ex - 148/128", "ME: 30th Celebration", "148/128", "/cards/greninja-ex-148-128-me-30th-celebration"],
  c30PikachuExSir149: ["712953", "Pikachu ex - 149/128", "ME: 30th Celebration", "149/128", "/cards/pikachu-ex-149-128-me-30th-celebration"],
  c30PikachuExSir150: ["712954", "Pikachu ex - 150/128", "ME: 30th Celebration", "150/128", "/cards/pikachu-ex-150-128-me-30th-celebration"],
  c30SylveonExSir: ["716231", "Sylveon ex - 153/128", "ME: 30th Celebration", "153/128", "/cards/sylveon-ex-153-128-me-30th-celebration"],
  c30JirachiExSir: ["716232", "Jirachi ex - 155/128", "ME: 30th Celebration", "155/128", "/cards/jirachi-ex-155-128-me-30th-celebration"],
  c30SirSalamenceEx156: ["716233", "Salamence ex - 156/128", "ME: 30th Celebration", "156/128", "/cards/salamence-ex-156-128-me-30th-celebration"],
  c30MewtwoExFuturistic: ["696687", "Mewtwo ex", "ME: 30th Celebration", "157/128", "/cards/mewtwo-ex-me-30th-celebration"],
  c30MewExFuturistic: ["696688", "Mew ex", "ME: 30th Celebration", "158/128", "/cards/mew-ex-me-30th-celebration"],
  c30ClassicCharizard: ["714372", "Charizard", "ME: 30th Celebration Classic Collection", "4/102", "/cards/charizard-me-30th-celebration-classic-collection"],
  c30CcDelcatty5109: ["716156", "Delcatty", "ME: 30th Celebration Classic Collection", "5/109", "/cards/delcatty-me-30th-celebration-classic-collection"],
  c30CcGenesectExTeamPlasma11101: ["716158", "Genesect EX (Team Plasma)", "ME: 30th Celebration Classic Collection", "11/101", "/cards/genesect-ex-team-plasma-me-30th-celebration-classic-collection"],
  c30CcMetagrossDeltaSpecies11113: ["716157", "Metagross (Delta Species)", "ME: 30th Celebration Classic Collection", "11/113", "/cards/metagross-delta-species-me-30th-celebration-classic-collection"],
  c30CcMisty18132: ["716159", "Misty", "ME: 30th Celebration Classic Collection", "18/132", "/cards/misty-me-30th-celebration-classic-collection"],
  c30CcDarkTyranitar19109: ["716160", "Dark Tyranitar", "ME: 30th Celebration Classic Collection", "19/109", "/cards/dark-tyranitar-me-30th-celebration-classic-collection"],
  c30CcSneasel25111: ["716161", "Sneasel", "ME: 30th Celebration Classic Collection", "25/111", "/cards/sneasel-me-30th-celebration-classic-collection"],
  c30ClassicPikachuZekromGx: ["714373", "Pikachu & Zekrom GX", "ME: 30th Celebration Classic Collection", "33/181", "/cards/pikachu-zekrom-gx-me-30th-celebration-classic-collection"],
  c30CcGreninjaBreak41122: ["716162", "Greninja BREAK", "ME: 30th Celebration Classic Collection", "41/122", "/cards/greninja-break-me-30th-celebration-classic-collection"],
  c30CcUxie43146: ["716163", "Uxie", "ME: 30th Celebration Classic Collection", "43/146", "/cards/uxie-me-30th-celebration-classic-collection"],
  c30CcCrobatG47127: ["716191", "Crobat G", "ME: 30th Celebration Classic Collection", "47/127", "/cards/crobat-g-me-30th-celebration-classic-collection"],
  c30CcRaikou050185: ["716192", "Raikou", "ME: 30th Celebration Classic Collection", "050/185", "/cards/raikou-me-30th-celebration-classic-collection"],
  c30CcBuzzwoleGx57111: ["716193", "Buzzwole GX", "ME: 30th Celebration Classic Collection", "57/111", "/cards/buzzwole-gx-me-30th-celebration-classic-collection"],
  c30CcPikachu58102: ["716194", "Pikachu", "ME: 30th Celebration Classic Collection", "58/102", "/cards/pikachu-me-30th-celebration-classic-collection"],
  c30CcErikaSJigglypuff69132: ["716195", "Erika's Jigglypuff", "ME: 30th Celebration Classic Collection", "69/132", "/cards/erika-s-jigglypuff-me-30th-celebration-classic-collection"],
  c30ClassicRayquazaEx: ["716196", "Rayquaza EX", "ME: 30th Celebration Classic Collection", "85/124", "/cards/rayquaza-ex-me-30th-celebration-classic-collection"],
  c30CcSolgaleoGx89149: ["716197", "Solgaleo GX", "ME: 30th Celebration Classic Collection", "89/149", "/cards/solgaleo-gx-me-30th-celebration-classic-collection"],
  c30ClassicGengarPrime: ["716198", "Gengar (Prime)", "ME: 30th Celebration Classic Collection", "94/102", "/cards/gengar-prime-me-30th-celebration-classic-collection"],
  c30CcDarkraiCresseliaLegendTop99102: ["716199", "Darkrai & Cresselia Legend (Top)", "ME: 30th Celebration Classic Collection", "99/102", "/cards/darkrai-cresselia-legend-top-me-30th-celebration-classic-collection"],
  c30CcDarkraiCresseliaLegendBottom100102: ["716200", "Darkrai & Cresselia Legend (Bottom)", "ME: 30th Celebration Classic Collection", "100/102", "/cards/darkrai-cresselia-legend-bottom-me-30th-celebration-classic-collection"],
  c30CcN101101: ["716202", "N", "ME: 30th Celebration Classic Collection", "101/101", "/cards/n-me-30th-celebration-classic-collection"],
  c30CcMGardevoirEx106160: ["716204", "M Gardevoir EX", "ME: 30th Celebration Classic Collection", "106/160", "/cards/m-gardevoir-ex-me-30th-celebration-classic-collection"],
  c30CcShiningCelebi106105: ["716205", "Shining Celebi", "ME: 30th Celebration Classic Collection", "106/105", "/cards/shining-celebi-me-30th-celebration-classic-collection"],
  c30CcPalkiaLvX106106: ["716203", "Palkia LV.X", "ME: 30th Celebration Classic Collection", "106/106", "/cards/palkia-lv-x-me-30th-celebration-classic-collection"],
  c30CcScizorEx108115: ["716206", "Scizor ex", "ME: 30th Celebration Classic Collection", "108/115", "/cards/scizor-ex-me-30th-celebration-classic-collection"],
  c30CcMewVmax114264: ["716207", "Mew VMAX", "ME: 30th Celebration Classic Collection", "114/264", "/cards/mew-vmax-me-30th-celebration-classic-collection"],
  c30CcArceusVstar123172: ["716208", "Arceus VSTAR", "ME: 30th Celebration Classic Collection", "123/172", "/cards/arceus-vstar-me-30th-celebration-classic-collection"],
  c30CcZacianV138202: ["716209", "Zacian V", "ME: 30th Celebration Classic Collection", "138/202", "/cards/zacian-v-me-30th-celebration-classic-collection"],
  c30ClassicLugia: ["714386", "Lugia", "ME: 30th Celebration Classic Collection", "149/147", "/cards/lugia-me-30th-celebration-classic-collection"],
  c30ClassicMagikarp: ["716210", "Magikarp", "ME: 30th Celebration Classic Collection", "203/193", "/cards/magikarp-me-30th-celebration-classic-collection"],
  // Content-audit batch - re-read from card_catalog on 2026-09-22
  // (tcgplayer_id, name, set, card_number), each href re-derived from the
  // row's own stored name and set.
  //
  // Prismatic: three separate catalogue rows share the collector number
  // 059/131, which is why the number alone never identifies an Umbreon.
  prismaticUmbreon059: ["610414", "Umbreon", "SV: Prismatic Evolutions", "059/131", "/cards/umbreon-sv-prismatic-evolutions"],
  prismaticUmbreon059PokeBall: ["610578", "Umbreon (Poke Ball Pattern)", "SV: Prismatic Evolutions", "059/131", "/cards/umbreon-poke-ball-pattern-sv-prismatic-evolutions"],
  prismaticUmbreon059MasterBall: ["610679", "Umbreon (Master Ball Pattern)", "SV: Prismatic Evolutions", "059/131", "/cards/umbreon-master-ball-pattern-sv-prismatic-evolutions"],
  prismaticUmbreonEx060: ["610415", "Umbreon ex - 060/131", "SV: Prismatic Evolutions", "060/131", "/cards/umbreon-ex-060-131-sv-prismatic-evolutions"],
  prismaticUmbreonEx161: ["610516", "Umbreon ex - 161/131", "SV: Prismatic Evolutions", "161/131", "/cards/umbreon-ex-161-131-sv-prismatic-evolutions"],
  prismaticEspeon033: ["610388", "Espeon", "SV: Prismatic Evolutions", "033/131", "/cards/espeon-sv-prismatic-evolutions"],
  prismaticEspeon033PokeBall: ["610557", "Espeon (Poke Ball Pattern)", "SV: Prismatic Evolutions", "033/131", "/cards/espeon-poke-ball-pattern-sv-prismatic-evolutions"],
  // Surging Sparks: one name, four numbers, four rarities.
  surgingSparksPikachuEx057: ["590025", "Pikachu ex - 057/191", "SV08: Surging Sparks", "057/191", "/cards/pikachu-ex-057-191-sv08-surging-sparks"],
  surgingSparksPikachuEx219: ["590026", "Pikachu ex - 219/191", "SV08: Surging Sparks", "219/191", "/cards/pikachu-ex-219-191-sv08-surging-sparks"],
  surgingSparksPikachuEx238: ["590027", "Pikachu ex - 238/191", "SV08: Surging Sparks", "238/191", "/cards/pikachu-ex-238-191-sv08-surging-sparks"],
  surgingSparksPikachuEx247: ["593169", "Pikachu ex - 247/191", "SV08: Surging Sparks", "247/191", "/cards/pikachu-ex-247-191-sv08-surging-sparks"],
  // A catalogue row whose foil PATTERN is part of its stored identity.
  ascendedHeroesPawniardQuickBall: ["676966", "Pawniard (Quick Ball)", "ME: Ascended Heroes", "146/217", "/cards/pawniard-quick-ball-me-ascended-heroes"],
  // 151: the same shape again, with two of the three numbers sitting above
  // the printed set total of 165.
  s151CharizardEx006: ["502558", "Charizard ex - 006/165", "SV: Scarlet & Violet 151", "006/165", "/cards/charizard-ex-006-165-sv-scarlet-violet-151"],
  s151CharizardEx183: ["517017", "Charizard ex - 183/165", "SV: Scarlet & Violet 151", "183/165", "/cards/charizard-ex-183-165-sv-scarlet-violet-151"],
  s151CharizardEx199: ["517045", "Charizard ex - 199/165", "SV: Scarlet & Violet 151", "199/165", "/cards/charizard-ex-199-165-sv-scarlet-violet-151"],
  s151VenusaurEx198: ["517044", "Venusaur ex - 198/165", "SV: Scarlet & Violet 151", "198/165", "/cards/venusaur-ex-198-165-sv-scarlet-violet-151"],
  // Crown Zenith: two rows from the main /159 run and two from the
  // GG##/GG70 subset, which the catalogue files as its own set.
  crownZenithCharizardVstar: ["478094", "Charizard VSTAR", "SWSH: Crown Zenith", "019/159", "/cards/charizard-vstar-swsh-crown-zenith"],
  crownZenithRadiantCharizard: ["478098", "Radiant Charizard", "SWSH: Crown Zenith", "020/159", "/cards/radiant-charizard-swsh-crown-zenith"],
  crownZenithGgMew: ["478027", "Mew", "SWSH: Crown Zenith: Galarian Gallery", "GG10/GG70", "/cards/mew-swsh-crown-zenith-galarian-gallery"],
  crownZenithGgMewtwoVstar: ["477057", "Mewtwo VSTAR", "SWSH: Crown Zenith: Galarian Gallery", "GG44/GG70", "/cards/mewtwo-vstar-swsh-crown-zenith-galarian-gallery"],
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
  const sets = { baseSet: "/sets/base-set", baseSetShadowless: "/sets/base-set-shadowless", baseSet2: "/sets/base-set-2", xyEvolutions: "/sets/xy-evolutions", evolvingSkies: "/sets/swsh07-evolving-skies", thirtiethCelebration: "/sets/me-30th-celebration", celebrations2021: "/sets/celebrations", scarletViolet151: "/sets/sv-scarlet-violet-151", prismaticEvolutions: "/sets/sv-prismatic-evolutions", crownZenith: "/sets/swsh-crown-zenith", crownZenithGalarianGallery: "/sets/swsh-crown-zenith-galarian-gallery", surgingSparks: "/sets/sv08-surging-sparks" };
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
    // The companion articles carry their card art through gallery data
    // arrays (not counted here); these are the inline prose links only.
    "pokemon-30th-celebration-pikachu-checklist": 1,
    "best-pokemon-30th-celebration-pikachu-cards": 1,
    "pokemon-30th-celebration-classic-collection": 3,
    // the product articles are about boxes, not individual cards: each
    // links the set page once and otherwise sends readers to a sibling.
    "pokemon-30th-celebration-elite-trainer-box": 1,
    "pokemon-30th-celebration-promo-cards": 1,
    "pokemon-30th-celebration-release-dates": 1,
    "pokemon-30th-celebration-mew-mewtwo": 1,
    "best-pokemon-30th-celebration-cards": 1,
    "organise-pokemon-30th-celebration-collection": 1,
    // the worth guide sends readers to the price checker and to sibling
    // guides; its card art is a gallery (data array). The printings guide
    // links the two Base Set set pages in prose.
    "how-much-is-my-pokemon-card-worth": 0,
    "base-set-shadowless-unlimited-first-edition": 2,
    // card references live in its Gallery, not as inline contextual links
    "spotting-fake-pokemon-cards-in-listings": 0,
    // the promo guide's cards are all gallery figures (data arrays)
    "pokemon-promo-card-numbers": 0,
    // GEO audit 2026-09-19 buyer-intent cluster. The vintage guide links
    // the two Base Set printings' set pages, the Base Set / Base Set 2
    // Charizard pair (the reprint trap), one reachable holo rare and the
    // Base Set page once more for its top-value list. The other three are
    // about listings, boxes and eBay's own rules - no exact card is their
    // subject.
    "buying-pokemon-cards-on-ebay-safely": 0,
    "how-to-read-a-pokemon-card-listing": 0,
    "vintage-pokemon-cards-worth-buying": 6,
    "pokemon-booster-box-prices": 0,
    // Delta Reign pre-launch cluster (2026-09-20): no Delta Reign card is in
    // the catalogue, so no exact card link exists to make
    "pokemon-delta-reign-release-date-what-is-official": 0,
    "storm-emeralda-vs-delta-reign-japanese-or-english": 0,
    "delta-reign-preorders-and-prerelease-what-to-know": 0,
    // Content-audit batch (2026-09-22). These guides are about buying
    // ROUTES and identity rules, not about individual cards, so their card
    // art is gallery data (not counted here) and the inline exact links are
    // the set pages they send readers on to. The bound above still applies.
    "pokemon-151-buying-guide": 1,
    "prismatic-evolutions-buying-guide": 1,
    "surging-sparks-which-pikachu": 1,
    // the main set and the Galarian Gallery subset - the two set records
    // the whole guide is about distinguishing
    "crown-zenith-galarian-gallery-guide": 2,
    // one worked example (a set page) for scoping a set project
    "complete-set-vs-master-set": 1,
    // the reverse-holo guide points at one set page as its worked example
    "holo-vs-reverse-holo-pokemon-cards": 1,
    // format comparison, certificate lookup and language comparison: no
    // exact card is the subject of any of them
    "booster-box-vs-etb-vs-booster-bundle": 0,
    "check-graded-pokemon-card-certificate": 0,
    "japanese-vs-english-pokemon-cards": 0,
  });
  // The release guide's galleries: every tile is a GUIDE_CARDS identity
  // rendered as a complete card face linked to its own page (a figure
  // subject each, captioned), bounded so the page stays an article.
  const gallery = (read("app/guides/pokemon-30th-celebration-guide/page.js").match(/GUIDE_CARDS\.c30\w+/g) ?? []).length;
  assert.ok(gallery >= 20 && gallery <= 30, `30th Celebration gallery references ${gallery} cards`);
  // the price checker is reachable from the guides that talk about looking a card up
  const withChecker = GUIDE_FILES.filter((f) => /href=\{PRICE_CHECKER_HREF\}/.test(read(f))).map((f) => f.split("/")[2]).sort();
  assert.deepEqual(withChecker, ["base-set-shadowless-unlimited-first-edition", "buying-pokemon-cards-on-ebay-safely", "card-condition-grading", "holo-vs-reverse-holo-pokemon-cards", "how-much-is-my-pokemon-card-worth", "how-pokemon-card-prices-work", "how-to-check-pokemon-card-condition", "how-to-read-a-pokemon-card-listing", "pokemon-151-buying-guide", "pokemon-card-grading-scale", "pokemon-promo-card-numbers", "raw-vs-graded-pokemon-cards", "spotting-fake-pokemon-cards-in-listings", "storm-emeralda-vs-delta-reign-japanese-or-english", "surging-sparks-which-pikachu", "vintage-pokemon-cards-worth-buying"]);
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
    "pokemon-30th-celebration-pikachu-checklist",
    "best-pokemon-30th-celebration-pikachu-cards",
    "pokemon-30th-celebration-classic-collection",
    "pokemon-30th-celebration-elite-trainer-box",
    "pokemon-30th-celebration-promo-cards",
    "pokemon-30th-celebration-release-dates",
    "pokemon-30th-celebration-mew-mewtwo",
    "best-pokemon-30th-celebration-cards",
    "organise-pokemon-30th-celebration-collection",
    "how-much-is-my-pokemon-card-worth",
    "base-set-shadowless-unlimited-first-edition",
    "spotting-fake-pokemon-cards-in-listings",
    // Delta Reign pre-launch cluster (2026-09-20)
    "pokemon-delta-reign-release-date-what-is-official",
    "storm-emeralda-vs-delta-reign-japanese-or-english",
    "delta-reign-preorders-and-prerelease-what-to-know",
    // GEO audit 2026-09-19 buyer-intent cluster (registered before the promo guide)
    "buying-pokemon-cards-on-ebay-safely",
    "how-to-read-a-pokemon-card-listing",
    "vintage-pokemon-cards-worth-buying",
    "pokemon-booster-box-prices",
    "pokemon-promo-card-numbers",
    // Content-audit batch (2026-09-22), appended in registration order.
    // Route shape, canonical rule and indexability are unchanged - the
    // assertions below still run over every file in this list.
    "pokemon-151-buying-guide",
    "booster-box-vs-etb-vs-booster-bundle",
    "check-graded-pokemon-card-certificate",
    "japanese-vs-english-pokemon-cards",
    "prismatic-evolutions-buying-guide",
    "holo-vs-reverse-holo-pokemon-cards",
    "crown-zenith-galarian-gallery-guide",
    "surging-sparks-which-pikachu",
    "complete-set-vs-master-set",
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
