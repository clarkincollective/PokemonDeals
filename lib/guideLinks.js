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
});

export const GUIDE_SETS = Object.freeze({
  baseSet: set("Base Set"),
  baseSetShadowless: set("Base Set (Shadowless)"),
  baseSet2: set("Base Set 2"),
  xyEvolutions: set("XY - Evolutions"),
  evolvingSkies: set("SWSH07: Evolving Skies"),
});

// The price checker: finds an exact card by name, set or collector number.
export const PRICE_CHECKER_HREF = "/search";

// Shared link style the guides already use for inline links.
export const GUIDE_LINK_CLASS = "text-red-600 hover:underline dark:text-red-500";
