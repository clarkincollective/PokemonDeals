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
  c30PikachuRare023: card({ name: "Pikachu - 023/128", set: "ME: 30th Celebration", cardNumber: "023/128", tcgplayerId: "712934", label: "Pikachu #023/128" }),
  c30PikachuRare027: card({ name: "Pikachu - 027/128", set: "ME: 30th Celebration", cardNumber: "027/128", tcgplayerId: "716310", label: "Pikachu #027/128" }),
  c30PikachuRare036: card({ name: "Pikachu - 036/128", set: "ME: 30th Celebration", cardNumber: "036/128", tcgplayerId: "696680", label: "Pikachu #036/128" }),
  c30PikachuRare040: card({ name: "Pikachu - 040/128", set: "ME: 30th Celebration", cardNumber: "040/128", tcgplayerId: "712944", label: "Pikachu #040/128" }),
  c30PikachuEx053: card({ name: "Pikachu ex - 053/128", set: "ME: 30th Celebration", cardNumber: "053/128", tcgplayerId: "712951", label: "Pikachu ex #053/128" }),
  c30PikachuExSir149: card({ name: "Pikachu ex - 149/128", set: "ME: 30th Celebration", cardNumber: "149/128", tcgplayerId: "712953", label: "Pikachu ex #149/128" }),
  c30PikachuExSir150: card({ name: "Pikachu ex - 150/128", set: "ME: 30th Celebration", cardNumber: "150/128", tcgplayerId: "712954", label: "Pikachu ex #150/128" }),
  c30MewtwoExFuturistic: card({ name: "Mewtwo ex", set: "ME: 30th Celebration", cardNumber: "157/128", tcgplayerId: "696687", label: "Mewtwo ex #157/128" }),
  c30MewExFuturistic: card({ name: "Mew ex", set: "ME: 30th Celebration", cardNumber: "158/128", tcgplayerId: "696688", label: "Mew ex #158/128" }),
  c30GreninjaExSir: card({ name: "Greninja ex - 148/128", set: "ME: 30th Celebration", cardNumber: "148/128", tcgplayerId: "716230", label: "Greninja ex #148/128" }),
  c30SylveonExSir: card({ name: "Sylveon ex - 153/128", set: "ME: 30th Celebration", cardNumber: "153/128", tcgplayerId: "716231", label: "Sylveon ex #153/128" }),
  c30JirachiExSir: card({ name: "Jirachi ex - 155/128", set: "ME: 30th Celebration", cardNumber: "155/128", tcgplayerId: "716232", label: "Jirachi ex #155/128" }),
  c30EspeonEx: card({ name: "Espeon ex", set: "ME: 30th Celebration", cardNumber: "070/128", tcgplayerId: "696834", label: "Espeon ex #070/128" }),
  c30UmbreonEx: card({ name: "Umbreon ex", set: "ME: 30th Celebration", cardNumber: "092/128", tcgplayerId: "696835", label: "Umbreon ex #092/128" }),
  c30AlolanExeggutorIr: card({ name: "Alolan Exeggutor - 129/128", set: "ME: 30th Celebration", cardNumber: "129/128", tcgplayerId: "716218", label: "Alolan Exeggutor #129/128" }),
  c30LaprasIr: card({ name: "Lapras - 131/128", set: "ME: 30th Celebration", cardNumber: "131/128", tcgplayerId: "696683", label: "Lapras #131/128" }),
  c30HisuianZoruaIr: card({ name: "Hisuian Zorua - 145/128", set: "ME: 30th Celebration", cardNumber: "145/128", tcgplayerId: "696686", label: "Hisuian Zorua #145/128" }),
  c30MausholdIr: card({ name: "Maushold - 146/128", set: "ME: 30th Celebration", cardNumber: "146/128", tcgplayerId: "716228", label: "Maushold #146/128" }),
  c30ClassicCharizard: card({ name: "Charizard", set: "ME: 30th Celebration Classic Collection", cardNumber: "4/102", tcgplayerId: "714372", label: "Charizard 4/102 (Classic Collection)" }),
  c30ClassicPikachuZekromGx: card({ name: "Pikachu & Zekrom GX", set: "ME: 30th Celebration Classic Collection", cardNumber: "33/181", tcgplayerId: "714373", label: "Pikachu & Zekrom-GX 33/181 (Classic Collection)" }),
  c30ClassicLugia: card({ name: "Lugia", set: "ME: 30th Celebration Classic Collection", cardNumber: "149/147", tcgplayerId: "714386", label: "Lugia 149/147 (Classic Collection)" }),
  c30ClassicMagikarp: card({ name: "Magikarp", set: "ME: 30th Celebration Classic Collection", cardNumber: "203/193", tcgplayerId: "716210", label: "Magikarp 203/193 (Classic Collection)" }),
  c30ClassicGengarPrime: card({ name: "Gengar (Prime)", set: "ME: 30th Celebration Classic Collection", cardNumber: "94/102", tcgplayerId: "716198", label: "Gengar Prime 94/102 (Classic Collection)" }),
  c30ClassicRayquazaEx: card({ name: "Rayquaza EX", set: "ME: 30th Celebration Classic Collection", cardNumber: "85/124", tcgplayerId: "716196", label: "Rayquaza EX 85/124 (Classic Collection)" }),
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
