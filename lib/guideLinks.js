// Phase 17C.1 - the exact cards, sets and tools the guides link to.
//
// Every card here is a VERIFIED catalogue identity (card_catalog name + set
// + collector number + tcgplayer id, checked 2026-09-11) and its href is
// DERIVED with the same slug function the /cards route resolves
// (catalogCardSlug), never hand-typed - so a guide link can't drift from
// the canonical card URL. tests/scanner/guide-card-links.test.mjs pins the
// derived hrefs and forbids hand-written /cards/ or /sets/ hrefs in the
// guides.
//
// What a guide may SAY about these cards is limited to what is stable and
// true from the catalogue and the page itself: set, collector number, the
// printing notes in the catalogue name, and that each is a separate card
// with its own price. No prices (they change), no condition or grade
// claims about a specific page's current data, no variant facts the
// catalogue doesn't record (e.g. 1st Edition - the catalogue has no 1st
// Edition rows).
//
// Dependency-light (relative imports only) so `node --test` imports it.

import { catalogCardSlug } from "./cardSlug.js";
import { slugifySet } from "./slugify.js";

function card({ name, set, cardNumber, tcgplayerId, label }) {
  return Object.freeze({ name, set, cardNumber, tcgplayerId, label, href: `/cards/${catalogCardSlug(name, set)}` });
}
function set(name) {
  return Object.freeze({ name, href: `/sets/${slugifySet(name)}` });
}

export const GUIDE_CARDS = Object.freeze({
  // One Pokemon, four printings - each its own page and price. The first
  // three are the WOTC Base Set family; XY Evolutions (2016) is a modern
  // remake set. (Search Console: the Shadowless, Base Set 2 and Evolutions
  // pages already draw impressions, incl. "base set charizard worth" and
  // "charizard 2nd edition price".)
  charizardBaseSet: card({ name: "Charizard", set: "Base Set", cardNumber: "004/102", tcgplayerId: "42382", label: "Base Set Charizard" }),
  charizardShadowless: card({ name: "Charizard", set: "Base Set (Shadowless)", cardNumber: "004/102", tcgplayerId: "106999", label: "Shadowless Charizard" }),
  charizardBaseSet2: card({ name: "Charizard", set: "Base Set 2", cardNumber: "004/130", tcgplayerId: "42479", label: "Base Set 2 Charizard" }),
  charizardEvolutions: card({ name: "Charizard", set: "XY - Evolutions", cardNumber: "11/108", tcgplayerId: "124026", label: "XY Evolutions Charizard" }),
  // The same printing tells on a cheaper card (the Base Set printings
  // guide). Verified against card_catalog and resolved live 2026-09-16.
  // "Shadowless Arcanine" is one of the site's most-searched queries.
  arcanineBaseSet: card({ name: "Arcanine", set: "Base Set", cardNumber: "023/102", tcgplayerId: "42364", label: "Arcanine #023/102 (Unlimited)" }),
  arcanineShadowless: card({ name: "Arcanine", set: "Base Set (Shadowless)", cardNumber: "023/102", tcgplayerId: "107018", label: "Arcanine #023/102 (Shadowless)" }),
  // Promo numbering guide - one card per era, each a verified catalogue
  // identity resolved live (200) on 2026-09-16. The catalogue files every
  // promo under an era set with the prefix printed on the card.
  promoGlaceonBw90: card({ name: "Glaceon - BW90", set: "Black and White Promos", cardNumber: "BW90", tcgplayerId: "85748", label: "Glaceon BW90" }),
  promoEeveeSwsh042: card({ name: "Eevee - SWSH042", set: "SWSH: Sword & Shield Promo Cards", cardNumber: "SWSH042", tcgplayerId: "220271", label: "Eevee SWSH042" }),
  promoPikachuSwsh020: card({ name: "Pikachu - SWSH020", set: "SWSH: Sword & Shield Promo Cards", cardNumber: "SWSH020", tcgplayerId: "214241", label: "Pikachu SWSH020" }),
  promoMewExSvp053: card({ name: "Mew ex - 053", set: "SV: Scarlet & Violet Promo Cards", cardNumber: "053", tcgplayerId: "518871", label: "Mew ex SVP 053" }),
  promoCharizardXyPrerelease: card({ name: "Charizard - 11/108 (Prerelease)", set: "XY Promos", cardNumber: "11/108", tcgplayerId: "126023", label: "Charizard 11/108 (Prerelease stamp)" }),
  promoCharizardGLvxDp45: card({ name: "Charizard G LV.X - DP45", set: "Diamond and Pearl Promos", cardNumber: "DP45", tcgplayerId: "84202", label: "Charizard G LV.X DP45" }),
  promoPikachuHgss03: card({ name: "Pikachu - HGSS03", set: "HGSS Promos", cardNumber: "HGSS03", tcgplayerId: "88098", label: "Pikachu HGSS03" }),
  promoVoltorbProfessor: card({ name: "Voltorb - 066/193", set: "Professor Program Promos", cardNumber: "066/193", tcgplayerId: "651981", label: "Voltorb 066/193 (Professor Program)" }),
  promoPikachu227SP: card({ name: "Pikachu - 227/S-P", set: "SWSH: Sword & Shield Promo Cards", cardNumber: "227/S-P", tcgplayerId: "257103", label: "Pikachu 227/S-P (Japanese promo)" }),
  promoPikachuMe093: card({ name: "Pikachu - 093", set: "ME: Mega Evolution Promo", cardNumber: "093", tcgplayerId: "712963", label: "Pikachu 093 (Mega Evolution promo)" }),
  promoMewWotc08: card({ name: "Mew (8)", set: "WoTC Promo", cardNumber: "08/53", tcgplayerId: "87394", label: "Mew #8 (Wizards Black Star promo)" }),
  // Delta Reign news - the current Rayquaza in our catalogue, shown as what
  // exists today, never as a Delta Reign card. Verified live 2026-09-16.
  rayquazaAscendedHeroes: card({ name: "Rayquaza", set: "ME: Ascended Heroes", cardNumber: "153/217", tcgplayerId: "675965", label: "Rayquaza #153/217 (Ascended Heroes)" }),
  arcanineBaseSet2: card({ name: "Arcanine", set: "Base Set 2", cardNumber: "033/130", tcgplayerId: "42472", label: "Arcanine #033/130 (Base Set 2)" }),

  // One Pokemon, one set, three rarity tiers - each a separate card.
  umbreonVmax: card({ name: "Umbreon VMAX", set: "SWSH07: Evolving Skies", cardNumber: "095/203", tcgplayerId: "246720", label: "Umbreon VMAX #095/203" }),
  umbreonVmaxSecret: card({ name: "Umbreon VMAX (Secret)", set: "SWSH07: Evolving Skies", cardNumber: "214/203", tcgplayerId: "246722", label: "Umbreon VMAX (Secret) #214/203" }),
  umbreonVmaxAltArt: card({ name: "Umbreon VMAX (Alternate Art Secret)", set: "SWSH07: Evolving Skies", cardNumber: "215/203", tcgplayerId: "246723", label: "Umbreon VMAX (Alternate Art Secret) #215/203" }),

  // A modern card whose page lists graded tiers when there are enough
  // recent graded sales (the wording never promises specific grades).
  pikachuVFullArt: card({ name: "Pikachu V (Full Art)", set: "SWSH04: Vivid Voltage", cardNumber: "170/185", tcgplayerId: "226431", label: "Pikachu V (Full Art) from Vivid Voltage" }),

  // Prints a Pokedex number (NO. 004) in the mid-bar AND a collector
  // number (RC3/RC32) at the bottom edge, so one card shows the
  // distinction the set-and-number guide is built around. Verified
  // 2026-09-12: card_catalog id 113744, english.
  charmanderGenerations: card({ name: "Charmander", set: "Generations: Radiant Collection", cardNumber: "RC3/RC32", tcgplayerId: "113744", label: "Charmander #RC3/RC32" }),

  // 30th Celebration release guide - the featured cards, each a verified
  // card_catalog identity (checked 2026-09-16: name, set, number, product
  // id) and each resolving live to the derived /cards URL. The catalogue's
  // stored name carries the collector number for numbered duplicates
  // ("Pikachu - 023/128"), so the slug does too.
  c30FuecocoEx015: card({ name: "Fuecoco ex - 015/128", set: "ME: 30th Celebration", cardNumber: "015/128", tcgplayerId: "716448", label: "Fuecoco ex #015/128" }),
  c30GreninjaEx021: card({ name: "Greninja ex - 021/128", set: "ME: 30th Celebration", cardNumber: "021/128", tcgplayerId: "696676", label: "Greninja ex #021/128" }),
  c30PikachuRare023: card({ name: "Pikachu - 023/128", set: "ME: 30th Celebration", cardNumber: "023/128", tcgplayerId: "712934", label: "Pikachu #023/128" }),
  c30PikachuRare024: card({ name: "Pikachu - 024/128", set: "ME: 30th Celebration", cardNumber: "024/128", tcgplayerId: "716309", label: "Pikachu #024/128" }),
  c30PikachuRare025: card({ name: "Pikachu - 025/128", set: "ME: 30th Celebration", cardNumber: "025/128", tcgplayerId: "712935", label: "Pikachu #025/128" }),
  c30PikachuRare026: card({ name: "Pikachu - 026/128", set: "ME: 30th Celebration", cardNumber: "026/128", tcgplayerId: "712936", label: "Pikachu #026/128" }),
  c30PikachuRare027: card({ name: "Pikachu - 027/128", set: "ME: 30th Celebration", cardNumber: "027/128", tcgplayerId: "716310", label: "Pikachu #027/128" }),
  c30PikachuRare028: card({ name: "Pikachu - 028/128", set: "ME: 30th Celebration", cardNumber: "028/128", tcgplayerId: "712937", label: "Pikachu #028/128" }),
  c30PikachuRare029: card({ name: "Pikachu - 029/128", set: "ME: 30th Celebration", cardNumber: "029/128", tcgplayerId: "716311", label: "Pikachu #029/128" }),
  c30PikachuRare030: card({ name: "Pikachu - 030/128", set: "ME: 30th Celebration", cardNumber: "030/128", tcgplayerId: "712938", label: "Pikachu #030/128" }),
  c30PikachuRare031: card({ name: "Pikachu - 031/128", set: "ME: 30th Celebration", cardNumber: "031/128", tcgplayerId: "716312", label: "Pikachu #031/128" }),
  c30PikachuRare032: card({ name: "Pikachu - 032/128", set: "ME: 30th Celebration", cardNumber: "032/128", tcgplayerId: "712939", label: "Pikachu #032/128" }),
  c30PikachuRare033: card({ name: "Pikachu - 033/128", set: "ME: 30th Celebration", cardNumber: "033/128", tcgplayerId: "712940", label: "Pikachu #033/128" }),
  c30PikachuRare034: card({ name: "Pikachu - 034/128", set: "ME: 30th Celebration", cardNumber: "034/128", tcgplayerId: "712941", label: "Pikachu #034/128" }),
  c30PikachuRare035: card({ name: "Pikachu - 035/128", set: "ME: 30th Celebration", cardNumber: "035/128", tcgplayerId: "716313", label: "Pikachu #035/128" }),
  c30PikachuRare036: card({ name: "Pikachu - 036/128", set: "ME: 30th Celebration", cardNumber: "036/128", tcgplayerId: "696680", label: "Pikachu #036/128" }),
  c30PikachuRare037: card({ name: "Pikachu - 037/128", set: "ME: 30th Celebration", cardNumber: "037/128", tcgplayerId: "696681", label: "Pikachu #037/128" }),
  c30PikachuRare038: card({ name: "Pikachu - 038/128", set: "ME: 30th Celebration", cardNumber: "038/128", tcgplayerId: "712942", label: "Pikachu #038/128" }),
  c30PikachuRare039: card({ name: "Pikachu - 039/128", set: "ME: 30th Celebration", cardNumber: "039/128", tcgplayerId: "712943", label: "Pikachu #039/128" }),
  c30PikachuRare040: card({ name: "Pikachu - 040/128", set: "ME: 30th Celebration", cardNumber: "040/128", tcgplayerId: "712944", label: "Pikachu #040/128" }),
  c30PikachuRare041: card({ name: "Pikachu - 041/128", set: "ME: 30th Celebration", cardNumber: "041/128", tcgplayerId: "712945", label: "Pikachu #041/128" }),
  c30PikachuRare042: card({ name: "Pikachu - 042/128", set: "ME: 30th Celebration", cardNumber: "042/128", tcgplayerId: "712946", label: "Pikachu #042/128" }),
  c30PikachuRare043: card({ name: "Pikachu - 043/128", set: "ME: 30th Celebration", cardNumber: "043/128", tcgplayerId: "712947", label: "Pikachu #043/128" }),
  c30PikachuRare044: card({ name: "Pikachu - 044/128", set: "ME: 30th Celebration", cardNumber: "044/128", tcgplayerId: "712948", label: "Pikachu #044/128" }),
  c30PikachuRare045: card({ name: "Pikachu - 045/128", set: "ME: 30th Celebration", cardNumber: "045/128", tcgplayerId: "716314", label: "Pikachu #045/128" }),
  c30PikachuRare046: card({ name: "Pikachu - 046/128", set: "ME: 30th Celebration", cardNumber: "046/128", tcgplayerId: "716315", label: "Pikachu #046/128" }),
  c30PikachuRare047: card({ name: "Pikachu - 047/128", set: "ME: 30th Celebration", cardNumber: "047/128", tcgplayerId: "696682", label: "Pikachu #047/128" }),
  c30PikachuRare048: card({ name: "Pikachu - 048/128", set: "ME: 30th Celebration", cardNumber: "048/128", tcgplayerId: "716316", label: "Pikachu #048/128" }),
  c30PikachuRare049: card({ name: "Pikachu - 049/128", set: "ME: 30th Celebration", cardNumber: "049/128", tcgplayerId: "712949", label: "Pikachu #049/128" }),
  c30PikachuRare050: card({ name: "Pikachu - 050/128", set: "ME: 30th Celebration", cardNumber: "050/128", tcgplayerId: "712950", label: "Pikachu #050/128" }),
  c30PikachuRare051: card({ name: "Pikachu - 051/128", set: "ME: 30th Celebration", cardNumber: "051/128", tcgplayerId: "716317", label: "Pikachu #051/128" }),
  c30PikachuRare052: card({ name: "Pikachu - 052/128", set: "ME: 30th Celebration", cardNumber: "052/128", tcgplayerId: "716318", label: "Pikachu #052/128" }),
  c30PikachuEx053: card({ name: "Pikachu ex - 053/128", set: "ME: 30th Celebration", cardNumber: "053/128", tcgplayerId: "712951", label: "Pikachu ex #053/128" }),
  c30PikachuEx054: card({ name: "Pikachu ex - 054/128", set: "ME: 30th Celebration", cardNumber: "054/128", tcgplayerId: "712952", label: "Pikachu ex #054/128" }),
  c30Mewtwo063: card({ name: "Mewtwo", set: "ME: 30th Celebration", cardNumber: "063/128", tcgplayerId: "716462", label: "Mewtwo #063/128" }),
  c30MewtwoEx064: card({ name: "Mewtwo ex - 064/128", set: "ME: 30th Celebration", cardNumber: "064/128", tcgplayerId: "716463", label: "Mewtwo ex #064/128" }),
  c30Mew065: card({ name: "Mew", set: "ME: 30th Celebration", cardNumber: "065/128", tcgplayerId: "716464", label: "Mew #065/128" }),
  c30MewEx066: card({ name: "Mew ex - 066/128", set: "ME: 30th Celebration", cardNumber: "066/128", tcgplayerId: "716465", label: "Mew ex #066/128" }),
  c30EspeonEx: card({ name: "Espeon ex", set: "ME: 30th Celebration", cardNumber: "070/128", tcgplayerId: "696834", label: "Espeon ex #070/128" }),
  c30SylveonEx071: card({ name: "Sylveon ex - 071/128", set: "ME: 30th Celebration", cardNumber: "071/128", tcgplayerId: "696677", label: "Sylveon ex #071/128" }),
  c30UmbreonEx: card({ name: "Umbreon ex", set: "ME: 30th Celebration", cardNumber: "092/128", tcgplayerId: "696835", label: "Umbreon ex #092/128" }),
  c30JirachiEx102: card({ name: "Jirachi ex - 102/128", set: "ME: 30th Celebration", cardNumber: "102/128", tcgplayerId: "716495", label: "Jirachi ex #102/128" }),
  c30SalamenceEx109: card({ name: "Salamence ex - 109/128", set: "ME: 30th Celebration", cardNumber: "109/128", tcgplayerId: "716502", label: "Salamence ex #109/128" }),
  c30AlolanExeggutorIr: card({ name: "Alolan Exeggutor - 129/128", set: "ME: 30th Celebration", cardNumber: "129/128", tcgplayerId: "716218", label: "Alolan Exeggutor #129/128" }),
  c30IrMoltres130: card({ name: "Moltres - 130/128", set: "ME: 30th Celebration", cardNumber: "130/128", tcgplayerId: "716219", label: "Moltres #130/128" }),
  c30LaprasIr: card({ name: "Lapras - 131/128", set: "ME: 30th Celebration", cardNumber: "131/128", tcgplayerId: "696683", label: "Lapras #131/128" }),
  c30IrArticuno132: card({ name: "Articuno - 132/128", set: "ME: 30th Celebration", cardNumber: "132/128", tcgplayerId: "716220", label: "Articuno #132/128" }),
  c30IrZapdos133: card({ name: "Zapdos - 133/128", set: "ME: 30th Celebration", cardNumber: "133/128", tcgplayerId: "716221", label: "Zapdos #133/128" }),
  c30IrToxtricity134: card({ name: "Toxtricity - 134/128", set: "ME: 30th Celebration", cardNumber: "134/128", tcgplayerId: "716222", label: "Toxtricity #134/128" }),
  c30IrMorpeko135: card({ name: "Morpeko - 135/128", set: "ME: 30th Celebration", cardNumber: "135/128", tcgplayerId: "716223", label: "Morpeko #135/128" }),
  c30IrDrifloon136: card({ name: "Drifloon - 136/128", set: "ME: 30th Celebration", cardNumber: "136/128", tcgplayerId: "696684", label: "Drifloon #136/128" }),
  c30IrChandelure137: card({ name: "Chandelure - 137/128", set: "ME: 30th Celebration", cardNumber: "137/128", tcgplayerId: "716224", label: "Chandelure #137/128" }),
  c30IrLycanroc138: card({ name: "Lycanroc - 138/128", set: "ME: 30th Celebration", cardNumber: "138/128", tcgplayerId: "696685", label: "Lycanroc #138/128" }),
  c30IrAlolanMeowth139: card({ name: "Alolan Meowth - 139/128", set: "ME: 30th Celebration", cardNumber: "139/128", tcgplayerId: "714360", label: "Alolan Meowth #139/128" }),
  c30IrScraggy140: card({ name: "Scraggy - 140/128", set: "ME: 30th Celebration", cardNumber: "140/128", tcgplayerId: "716225", label: "Scraggy #140/128" }),
  c30IrGalarianMeowth141: card({ name: "Galarian Meowth - 141/128", set: "ME: 30th Celebration", cardNumber: "141/128", tcgplayerId: "716226", label: "Galarian Meowth #141/128" }),
  c30IrGholdengo142: card({ name: "Gholdengo - 142/128", set: "ME: 30th Celebration", cardNumber: "142/128", tcgplayerId: "716227", label: "Gholdengo #142/128" }),
  c30IrMeowth144: card({ name: "Meowth - 144/128", set: "ME: 30th Celebration", cardNumber: "144/128", tcgplayerId: "714358", label: "Meowth #144/128" }),
  c30HisuianZoruaIr: card({ name: "Hisuian Zorua - 145/128", set: "ME: 30th Celebration", cardNumber: "145/128", tcgplayerId: "696686", label: "Hisuian Zorua #145/128" }),
  c30MausholdIr: card({ name: "Maushold - 146/128", set: "ME: 30th Celebration", cardNumber: "146/128", tcgplayerId: "716228", label: "Maushold #146/128" }),
  c30SirFuecocoEx147: card({ name: "Fuecoco ex - 147/128", set: "ME: 30th Celebration", cardNumber: "147/128", tcgplayerId: "716229", label: "Fuecoco ex #147/128" }),
  c30GreninjaExSir: card({ name: "Greninja ex - 148/128", set: "ME: 30th Celebration", cardNumber: "148/128", tcgplayerId: "716230", label: "Greninja ex #148/128" }),
  c30PikachuExSir149: card({ name: "Pikachu ex - 149/128", set: "ME: 30th Celebration", cardNumber: "149/128", tcgplayerId: "712953", label: "Pikachu ex #149/128" }),
  c30PikachuExSir150: card({ name: "Pikachu ex - 150/128", set: "ME: 30th Celebration", cardNumber: "150/128", tcgplayerId: "712954", label: "Pikachu ex #150/128" }),
  c30SylveonExSir: card({ name: "Sylveon ex - 153/128", set: "ME: 30th Celebration", cardNumber: "153/128", tcgplayerId: "716231", label: "Sylveon ex #153/128" }),
  c30JirachiExSir: card({ name: "Jirachi ex - 155/128", set: "ME: 30th Celebration", cardNumber: "155/128", tcgplayerId: "716232", label: "Jirachi ex #155/128" }),
  c30SirSalamenceEx156: card({ name: "Salamence ex - 156/128", set: "ME: 30th Celebration", cardNumber: "156/128", tcgplayerId: "716233", label: "Salamence ex #156/128" }),
  c30MewtwoExFuturistic: card({ name: "Mewtwo ex", set: "ME: 30th Celebration", cardNumber: "157/128", tcgplayerId: "696687", label: "Mewtwo ex #157/128" }),
  c30MewExFuturistic: card({ name: "Mew ex", set: "ME: 30th Celebration", cardNumber: "158/128", tcgplayerId: "696688", label: "Mew ex #158/128" }),
  c30ClassicCharizard: card({ name: "Charizard", set: "ME: 30th Celebration Classic Collection", cardNumber: "4/102", tcgplayerId: "714372", label: "Charizard 4/102 (Classic Collection)" }),
  c30CcDelcatty5109: card({ name: "Delcatty", set: "ME: 30th Celebration Classic Collection", cardNumber: "5/109", tcgplayerId: "716156", label: "Delcatty 5/109 (Classic Collection)" }),
  c30CcGenesectExTeamPlasma11101: card({ name: "Genesect EX (Team Plasma)", set: "ME: 30th Celebration Classic Collection", cardNumber: "11/101", tcgplayerId: "716158", label: "Genesect EX (Team Plasma) 11/101 (Classic Collection)" }),
  c30CcMetagrossDeltaSpecies11113: card({ name: "Metagross (Delta Species)", set: "ME: 30th Celebration Classic Collection", cardNumber: "11/113", tcgplayerId: "716157", label: "Metagross (Delta Species) 11/113 (Classic Collection)" }),
  c30CcMisty18132: card({ name: "Misty", set: "ME: 30th Celebration Classic Collection", cardNumber: "18/132", tcgplayerId: "716159", label: "Misty 18/132 (Classic Collection)" }),
  c30CcDarkTyranitar19109: card({ name: "Dark Tyranitar", set: "ME: 30th Celebration Classic Collection", cardNumber: "19/109", tcgplayerId: "716160", label: "Dark Tyranitar 19/109 (Classic Collection)" }),
  c30CcSneasel25111: card({ name: "Sneasel", set: "ME: 30th Celebration Classic Collection", cardNumber: "25/111", tcgplayerId: "716161", label: "Sneasel 25/111 (Classic Collection)" }),
  c30ClassicPikachuZekromGx: card({ name: "Pikachu & Zekrom GX", set: "ME: 30th Celebration Classic Collection", cardNumber: "33/181", tcgplayerId: "714373", label: "Pikachu & Zekrom GX 33/181 (Classic Collection)" }),
  c30CcGreninjaBreak41122: card({ name: "Greninja BREAK", set: "ME: 30th Celebration Classic Collection", cardNumber: "41/122", tcgplayerId: "716162", label: "Greninja BREAK 41/122 (Classic Collection)" }),
  c30CcUxie43146: card({ name: "Uxie", set: "ME: 30th Celebration Classic Collection", cardNumber: "43/146", tcgplayerId: "716163", label: "Uxie 43/146 (Classic Collection)" }),
  c30CcCrobatG47127: card({ name: "Crobat G", set: "ME: 30th Celebration Classic Collection", cardNumber: "47/127", tcgplayerId: "716191", label: "Crobat G 47/127 (Classic Collection)" }),
  c30CcRaikou050185: card({ name: "Raikou", set: "ME: 30th Celebration Classic Collection", cardNumber: "050/185", tcgplayerId: "716192", label: "Raikou 050/185 (Classic Collection)" }),
  c30CcBuzzwoleGx57111: card({ name: "Buzzwole GX", set: "ME: 30th Celebration Classic Collection", cardNumber: "57/111", tcgplayerId: "716193", label: "Buzzwole GX 57/111 (Classic Collection)" }),
  c30CcPikachu58102: card({ name: "Pikachu", set: "ME: 30th Celebration Classic Collection", cardNumber: "58/102", tcgplayerId: "716194", label: "Pikachu 58/102 (Classic Collection)" }),
  c30CcErikaSJigglypuff69132: card({ name: "Erika's Jigglypuff", set: "ME: 30th Celebration Classic Collection", cardNumber: "69/132", tcgplayerId: "716195", label: "Erika's Jigglypuff 69/132 (Classic Collection)" }),
  c30ClassicRayquazaEx: card({ name: "Rayquaza EX", set: "ME: 30th Celebration Classic Collection", cardNumber: "85/124", tcgplayerId: "716196", label: "Rayquaza EX 85/124 (Classic Collection)" }),
  c30CcSolgaleoGx89149: card({ name: "Solgaleo GX", set: "ME: 30th Celebration Classic Collection", cardNumber: "89/149", tcgplayerId: "716197", label: "Solgaleo GX 89/149 (Classic Collection)" }),
  c30ClassicGengarPrime: card({ name: "Gengar (Prime)", set: "ME: 30th Celebration Classic Collection", cardNumber: "94/102", tcgplayerId: "716198", label: "Gengar (Prime) 94/102 (Classic Collection)" }),
  c30CcDarkraiCresseliaLegendTop99102: card({ name: "Darkrai & Cresselia Legend (Top)", set: "ME: 30th Celebration Classic Collection", cardNumber: "99/102", tcgplayerId: "716199", label: "Darkrai & Cresselia Legend (Top) 99/102 (Classic Collection)" }),
  c30CcDarkraiCresseliaLegendBottom100102: card({ name: "Darkrai & Cresselia Legend (Bottom)", set: "ME: 30th Celebration Classic Collection", cardNumber: "100/102", tcgplayerId: "716200", label: "Darkrai & Cresselia Legend (Bottom) 100/102 (Classic Collection)" }),
  c30CcN101101: card({ name: "N", set: "ME: 30th Celebration Classic Collection", cardNumber: "101/101", tcgplayerId: "716202", label: "N 101/101 (Classic Collection)" }),
  c30CcMGardevoirEx106160: card({ name: "M Gardevoir EX", set: "ME: 30th Celebration Classic Collection", cardNumber: "106/160", tcgplayerId: "716204", label: "M Gardevoir EX 106/160 (Classic Collection)" }),
  c30CcShiningCelebi106105: card({ name: "Shining Celebi", set: "ME: 30th Celebration Classic Collection", cardNumber: "106/105", tcgplayerId: "716205", label: "Shining Celebi 106/105 (Classic Collection)" }),
  c30CcPalkiaLvX106106: card({ name: "Palkia LV.X", set: "ME: 30th Celebration Classic Collection", cardNumber: "106/106", tcgplayerId: "716203", label: "Palkia LV.X 106/106 (Classic Collection)" }),
  c30CcScizorEx108115: card({ name: "Scizor ex", set: "ME: 30th Celebration Classic Collection", cardNumber: "108/115", tcgplayerId: "716206", label: "Scizor ex 108/115 (Classic Collection)" }),
  c30CcMewVmax114264: card({ name: "Mew VMAX", set: "ME: 30th Celebration Classic Collection", cardNumber: "114/264", tcgplayerId: "716207", label: "Mew VMAX 114/264 (Classic Collection)" }),
  c30CcArceusVstar123172: card({ name: "Arceus VSTAR", set: "ME: 30th Celebration Classic Collection", cardNumber: "123/172", tcgplayerId: "716208", label: "Arceus VSTAR 123/172 (Classic Collection)" }),
  c30CcZacianV138202: card({ name: "Zacian V", set: "ME: 30th Celebration Classic Collection", cardNumber: "138/202", tcgplayerId: "716209", label: "Zacian V 138/202 (Classic Collection)" }),
  c30ClassicLugia: card({ name: "Lugia", set: "ME: 30th Celebration Classic Collection", cardNumber: "149/147", tcgplayerId: "714386", label: "Lugia 149/147 (Classic Collection)" }),
  c30ClassicMagikarp: card({ name: "Magikarp", set: "ME: 30th Celebration Classic Collection", cardNumber: "203/193", tcgplayerId: "716210", label: "Magikarp 203/193 (Classic Collection)" }),
});

export const GUIDE_SETS = Object.freeze({
  baseSet: set("Base Set"),
  baseSetShadowless: set("Base Set (Shadowless)"),
  baseSet2: set("Base Set 2"),
  xyEvolutions: set("XY - Evolutions"),
  evolvingSkies: set("SWSH07: Evolving Skies"),
  // 30th Celebration guide. The Classic Collection has no set page of its
  // own yet (a set page needs live listings), so its cards link directly.
  thirtiethCelebration: set("ME: 30th Celebration"),
  celebrations2021: set("Celebrations"),
});

// The price checker: finds an exact card by name, set or collector number.
export const PRICE_CHECKER_HREF = "/search";

// Shared link style the guides already use for inline links.
export const GUIDE_LINK_CLASS = "text-red-600 hover:underline dark:text-red-500";
