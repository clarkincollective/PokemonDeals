// Run with: node scripts/seedSealedWatchlist.js
//
// Resolves a starter list of popular sealed products (booster boxes,
// elite trainer boxes) against PokemonPriceTracker's /sealed-products
// endpoint and adds them to the "sealed_watchlist" table. Safe to re-run -
// existing rows are updated in place rather than duplicated.
//
// A plain search (e.g. "Twilight Masquerade Booster Box") can rank the
// Booster Box CASE variant above the single box - verified live. The
// resolver below scores candidates by wanted-word overlap and penalizes
// unrequested variant words (case/bundle/tin/...) rather than blindly
// trusting the top search hit, but this is still automated matching -
// review the results printed below (or the rows in Supabase afterward)
// before trusting them completely, same caveat as scripts/seedWatchlist.js.
require("dotenv").config({ path: ".env.local" });
const { searchSealedProducts } = require("../lib/pokemonPriceTracker");
const { supabaseAdmin } = require("../lib/supabaseAdmin");

const STARTER_SEALED_WATCHLIST = [
  // Current/recent Booster Boxes
  "Scarlet & Violet Booster Box",
  "Paldea Evolved Booster Box",
  "Obsidian Flames Booster Box",
  "151 Booster Box",
  "Paradox Rift Booster Box",
  "Paldean Fates Booster Box",
  "Temporal Forces Booster Box",
  "Twilight Masquerade Booster Box",
  "Shrouded Fable Booster Box",
  "Stellar Crown Booster Box",
  "Surging Sparks Booster Box",
  "Prismatic Evolutions Booster Box",
  "Journey Together Booster Box",
  "Destined Rivals Booster Box",
  // Popular/iconic Sword & Shield-era Booster Boxes (consistently high demand)
  "Evolving Skies Booster Box",
  "Crown Zenith Booster Box",
  "Silver Tempest Booster Box",
  "Lost Origin Booster Box",
  "Brilliant Stars Booster Box",
  "Fusion Strike Booster Box",
  // Elite Trainer Boxes
  "Scarlet & Violet Elite Trainer Box",
  "Obsidian Flames Elite Trainer Box",
  "151 Elite Trainer Box",
  "Paradox Rift Elite Trainer Box",
  "Paldean Fates Elite Trainer Box",
  "Temporal Forces Elite Trainer Box",
  "Twilight Masquerade Elite Trainer Box",
  "Shrouded Fable Elite Trainer Box",
  "Stellar Crown Elite Trainer Box",
  "Surging Sparks Elite Trainer Box",
  "Prismatic Evolutions Elite Trainer Box",
  "Evolving Skies Elite Trainer Box",
  "Crown Zenith Elite Trainer Box",
  "Brilliant Stars Elite Trainer Box",
  "Fusion Strike Elite Trainer Box",
];

// Words that show up as unwanted "surprise" variants if they weren't
// actually part of what we searched for.
const VARIANT_WORDS = ["case", "bundle", "tin", "blister", "collection", "display"];

function normalizeWords(s) {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []));
}

async function resolve(searchTerm) {
  const { results } = await searchSealedProducts(searchTerm, { limit: 15 });
  if (results.length === 0) return null;

  const wantedWords = normalizeWords(searchTerm);
  const scored = results.map((r) => {
    const nameWords = normalizeWords(r.name);
    const matched = [...wantedWords].filter((w) => nameWords.has(w)).length;
    const unrequestedVariant = VARIANT_WORDS.filter(
      (w) => nameWords.has(w) && !wantedWords.has(w)
    ).length;
    return { r, score: matched - unrequestedVariant * 3 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].r;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const db = supabaseAdmin();
  let added = 0;
  let failed = 0;

  for (const name of STARTER_SEALED_WATCHLIST) {
    try {
      const product = await resolve(name);
      if (!product) throw new Error("no results");

      const { error } = await db.from("sealed_watchlist").upsert(
        {
          name: product.name,
          set: product.setName,
          tcgplayer_id: String(product.tcgPlayerId),
          active: true,
          source: "manual",
        },
        { onConflict: "name,set" }
      );

      if (error) throw error;
      console.log(`Added: "${name}" -> "${product.name}" (${product.setName}) $${product.unopenedPrice}`);
      added++;
    } catch (err) {
      console.error(`Failed "${name}": ${err.message}`);
      failed++;
    }

    await sleep(200);
  }

  console.log(`\nDone. ${added} added/updated, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
