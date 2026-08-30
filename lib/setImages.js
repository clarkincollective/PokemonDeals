// Set name -> pokemontcg.io logo/symbol image URLs. Static map (see
// scripts/generateSetImages.js), so /sets does a plain object lookup at
// render time - no per-request fetch. ~78% of our English sets have an
// image; the rest (Trainer Kits, McDonald's promos, deck kits, the very
// newest promo sets, misc products) aren't catalogued by pokemontcg.io
// and fall back to the set name as text.
//
// Dependency-free (no next/cache, no Supabase) so it's safe to import
// from a client component - same rule as lib/slugify.js.
const { SET_IMAGES } = require("./setImagesData");

function setImage(setName) {
  return SET_IMAGES[setName] ?? null; // { logo, symbol } | null
}

module.exports = { SET_IMAGES, setImage };
